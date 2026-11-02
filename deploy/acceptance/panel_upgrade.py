"""Rehearse panel migrations on a new owned fixture, retaining both database copies."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import time
from urllib.parse import urlencode
import urllib.request
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from deploy.acceptance import local
from deploy.acceptance.panel_versions import panel_release, initialize_panel


def write(state, name, content):
    path = state / name
    path.write_text(content)
    path.chmod(0o600)


def create_state(state, target):
    release = panel_release(target)
    state = Path(state)
    if state.is_symlink() or state.exists() and any(state.iterdir()):
        raise ValueError('upgrade requires a new empty owned directory')
    state.mkdir(parents=True, mode=0o700, exist_ok=True)
    state.chmod(0o700)
    write(state, 'runtime.json', json.dumps({'purpose': 'panel-upgrade',
          'project': 'cabinet-panel-upgrade-' + uuid4().hex[:12], 'target': target,
          'source_image': panel_release('3.10.0', upgrade_source=True)['image'],
          'target_image': release['image']}))


def owned(state):
    state = Path(state)
    metadata = json.loads((state / 'runtime.json').read_text())
    if (state.is_symlink() or metadata.get('purpose') != 'panel-upgrade'
            or not re.fullmatch(r'cabinet-panel-upgrade-[0-9a-f]{12}', metadata.get('project', ''))
            or metadata.get('source_image') != panel_release('3.10.0', upgrade_source=True)['image']
            or metadata.get('target_image') != panel_release(metadata.get('target'))['image']):
        raise ValueError('unowned upgrade state')
    for name in ('panel-db', 'source-db', 'upgraded-db'):
        path = state / name
        if path.is_symlink() or path.exists() and any(p.is_symlink() for p in path.rglob('*')):
            raise ValueError('database copies must not contain symlinks')
    return metadata


def snapshot_panel(compose, state):
    owned(state)
    if (state / 'source-db').exists():
        raise ValueError('source snapshot is immutable')
    compose('stop', 'panel')
    shutil.copytree(state / 'panel-db', state / 'source-db')
    for path in (state / 'source-db').rglob('*'):
        path.chmod(0o700 if path.is_dir() else 0o600)


def restore_panel(compose, state):
    metadata = owned(state)
    if not (state / 'source-db/x-ui.db').is_file() or (state / 'upgraded-db').exists():
        raise ValueError('original snapshot required; migrated copy must not be overwritten')
    compose('stop', 'panel')
    (state / 'panel-db').rename(state / 'upgraded-db')
    shutil.copytree(state / 'source-db', state / 'panel-db')
    env = dict(line.split('=', 1) for line in (state / 'public.env').read_text().splitlines())
    env['LOCAL_PANEL_IMAGE'] = metadata['source_image']
    write(state, 'public.env', ''.join(k + '=' + v + '\n' for k, v in env.items()))


def check(state, target):
    create_state(state, target)
    state = state.resolve()
    metadata = owned(state)
    # CLI environment must not override the explicitly selected source/target image.
    os.environ.pop("LOCAL_PANEL_IMAGE", None)
    os.environ.pop("LOCAL_SECOND_PANEL_IMAGE", None)
    local.STATE = state
    def compose(*args):
        return local.command(['docker', 'compose', '--project-name', metadata['project'],
                 '--env-file', str(state / 'public.env'), '-f',
                 'deploy/acceptance/compose.panel-upgrade.yml', *args])
    (state / 'panel-db').mkdir(mode=0o700)
    (state / 'origin').mkdir()
    (state / 'origin/index.html').write_bytes(local.VPN_ORIGIN_MARKER)
    write(state, 'vpn.json', '{}')
    write(state, 'panel-password', secrets.token_urlsafe(32))
    local.command(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30',
        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,DNS:panel,IP:127.0.0.1',
        '-keyout', str(state / 'key.pem'), '-out', str(state / 'cert.pem')])
    (state / 'key.pem').chmod(0o600)
    env = {'LOCAL_STATE_DIR': str(state), 'LOCAL_PANEL_IMAGE': metadata['source_image'],
           'APP_RUNTIME_UID': str(os.getuid()), 'APP_RUNTIME_GID': str(os.getgid()),
           'PANEL_PASSWORD_FILE': str(state / 'panel-password'), 'SMTP_AUTH_FILE': '/dev/null'}
    write(state, 'public.env', ''.join(k + '=' + v + '\n' for k, v in env.items()))
    evidence = {'sha': local.command(['git', 'rev-parse', 'HEAD']).decode().strip(), **metadata,
                'architecture': local.command(['docker', 'info', '--format', '{{.Architecture}}']).decode().strip(),
                'command': 'python deploy/acceptance/panel_upgrade.py check --target ' + target,
                'verdict': 'FAIL', 'stages': []}
    try:
        initialize_panel(compose, state, 'panel', 'panel-db')
        compose('build', 'gateway')
        compose('up', '-d', 'panel', 'gateway', 'origin')
        def login():
            opener = local.session()
            csrf = ''
            def call(path, body=None):
                status, _, raw = local.request(opener, 'https://localhost:62444/' + path, body, {'X-CSRF-Token': csrf})
                reply = json.loads(raw)
                assert status == 200 and reply.get('success') is True, 'owned upgrade panel API rejected request'
                return reply.get('obj')
            local.wait_until(lambda: ready(opener))
            csrf = call('csrf-token')
            call('login', {'username': 'local-operator', 'password': (state / 'panel-password').read_text()})
            return opener, csrf, call
        def ready(opener):
            try:
                return local.request(opener, 'https://localhost:62444/csrf-token')[0] == 200
            except OSError:
                return False
        opener, csrf, call = login()
        assert call('panel/api/server/status')['panelVersion'] == '3.10.0'
        inbounds = []
        for i in range(2):
            row = call('panel/api/inbounds/add', {'enable': True, 'listen': '0.0.0.0', 'port': 24443+i,
                'tag': 'upgrade-' + str(i), 'remark': 'Owned upgrade fixture', 'protocol': 'vless',
                'settings': {'clients': [], 'decryption': 'none'}, 'sniffing': {'enabled': False},
                'streamSettings': {'network': 'tcp', 'security': 'tls', 'tlsSettings': {'serverName': 'panel',
                    'certificates': [{'certificateFile': '/run/secrets/public_cert', 'keyFile': '/run/secrets/public_key'}]}}})
            inbounds.append(row['id'])
        settings = call('panel/api/setting/all', {})
        settings.update(subEnable=True, subPath='/sub/', subURI='https://localhost:62445/sub/')
        call('panel/api/setting/update', settings)
        expected = []
        for kind, enabled, limit, traffic in [('active', True, 1<<30, 1024), ('quota', False, 2048, 4096), ('banned', False, 1<<30, 2048)]:
            client = {'email': 'upgrade_' + kind + '_' + uuid4().hex, 'id': str(uuid4()), 'subId': secrets.token_hex(8),
                      'enable': enabled, 'totalGB': limit, 'expiryTime': int(time.time()*1000)+86400000,
                      'limitIp': 3, 'flow': 'xtls-rprx-vision'}
            call('panel/api/clients/add', {'client': client, 'inboundIds': inbounds})
            call('panel/api/clients/updateTraffic/' + client['email'], {'upload': traffic, 'download': traffic})
            expected.append(call('panel/api/clients/get/' + client['email']))
        write(state, 'expected.json', json.dumps(expected))
        evidence['source'] = call('panel/api/server/status')['xray']['version']
        snapshot_panel(compose, state)
        source_hash = tree_hash(state / 'source-db')
        env['LOCAL_PANEL_IMAGE'] = metadata['target_image']
        write(state, 'public.env', ''.join(k + '=' + v + '\n' for k, v in env.items()))
        compose('up', '-d', '--force-recreate', 'panel')
        opener, csrf, call = login()
        status = call('panel/api/server/status')
        assert status['panelVersion'] == target
        evidence['target_xray'] = status['xray']['version']
        verify(call, expected)
        adapter(state, 'upgraded')
        # The only private destination permitted through the owned Xray is this origin.
        cid = compose('ps', '-q', 'origin').decode().strip()
        address = next(iter(json.loads(local.command(['docker', 'inspect', cid]))[0]['NetworkSettings']['Networks'].values()))['IPAddress']
        config = json.loads(call('panel/api/xray/', {}))['xraySetting']
        direct = next(o for o in config['outbounds'] if o.get('tag') == 'direct')
        direct.setdefault('settings', {})['finalRules'] = [{'action': 'allow', 'network': 'tcp', 'ip': [address+'/32'], 'port': '8000'}]
        req = urllib.request.Request('https://localhost:62444/panel/api/xray/update',
            data=urlencode({'xraySetting': json.dumps(config), 'outboundTestUrl': 'http://origin:8000/'}).encode(),
            headers={'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': csrf})
        with opener.open(req, timeout=15) as response:
            assert json.loads(response.read()).get('success') is True
        active = expected[0]['client']
        local.write('vpn.json', json.dumps({'log': {'loglevel': 'none'},
            'inbounds': [{'listen': '0.0.0.0', 'port': 1080, 'protocol': 'http'}],
            'outbounds': [{'protocol': 'vless', 'settings': {'vnext': [{'address': 'panel', 'port': 24443,
                'users': [{'id': active['uuid'], 'encryption': 'none', 'flow': 'xtls-rprx-vision'}]}]},
                'streamSettings': {'network': 'tcp', 'security': 'tls', 'tlsSettings': {'serverName': 'panel',
                    'disableSystemRoot': True, 'certificates': [{'certificateFile': '/run/secrets/public_cert', 'usage': 'verify'}]}}}]}))
        compose('--profile', 'vpn', 'up', '-d', '--force-recreate', 'vpn-client')
        def connected():
            try:
                proxy = urllib.request.build_opener(urllib.request.ProxyHandler({'http': 'http://127.0.0.1:62448'}))
                with proxy.open('http://origin:8000/', timeout=5) as response:
                    return response.read() == local.VPN_ORIGIN_MARKER
            except OSError:
                return False
        local.wait_until(connected)
        evidence['stages'].append('migration/readback/renewal/reset/real-VPN PASS')
        compose('stop', 'vpn-client')
        restore_panel(compose, state)
        assert tree_hash(state / 'source-db') == source_hash
        compose('up', '-d', '--force-recreate', 'panel')
        _, _, call = login()
        assert call('panel/api/server/status')['panelVersion'] == '3.10.0'
        verify(call, expected)
        adapter(state, 'restored')
        evidence['stages'].append('original-image/original-DB/identity/traffic/gate PASS')
        evidence['verdict'] = 'PASS'
    finally:
        write(state, 'evidence.json', json.dumps(evidence, indent=2))
        compose('--profile', 'vpn', 'down')
    print('PASS: 3.10.0 -> ' + target + ' migration, real VPN and original-database rollback; service rollback needs the previous mole release')


def tree_hash(path):
    import hashlib
    return {str(p.relative_to(path)): hashlib.sha256(p.read_bytes()).hexdigest() for p in path.rglob('*') if p.is_file()}


def verify(call, expected):
    for before in expected:
        after = call('panel/api/clients/get/' + before['client']['email'])
        fields = ('uuid', 'email', 'subId', 'expiryTime', 'limitIp', 'totalGB', 'enable')
        assert all(after['client'].get(k) == before['client'].get(k) for k in fields), 'migration changed client identity/limits/state'
        assert sorted(after['inboundIds']) == sorted(before['inboundIds']), 'migration changed memberships'
        assert after['usedTraffic'] == before['usedTraffic'], 'migration changed traffic'


def adapter(state, phase):
    env = {**os.environ, 'PANEL_UPGRADE_STATE': str(state), 'PANEL_UPGRADE_PHASE': phase}
    with (state / ('adapter-' + phase + '.log')).open('w') as output:
        result = subprocess.run(['go', 'test', './tests', '-run', '^TestNativePanelUpgrade$', '-count=1', '-v'],
            cwd=ROOT / 'backend', env=env, stdout=output, stderr=subprocess.STDOUT, timeout=120)
    assert result.returncode == 0, 'adapter upgrade contract failed; see private log'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check'])
    parser.add_argument('--target', required=True)
    parser.add_argument('--state', type=Path, required=True)
    args = parser.parse_args()
    check(args.state, args.target)
