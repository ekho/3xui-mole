"""The same exact release registry is embedded by the Go panel adapter."""
import json
import os
from pathlib import Path

REGISTRY = json.loads((Path(__file__).resolve().parents[2] / 'backend/internal/modules/vpn/panel_versions.json').read_text())


def panel_release(version, *, upgrade_source=False):
    releases = REGISTRY['upgrade_sources' if upgrade_source else 'supported']
    for release in releases:
        if release['version'] == version:
            return release.copy()
    raise ValueError('unsupported panel release; select an exact registry entry')


def selected_images(values):
    primary = os.environ.get('LOCAL_PANEL_IMAGE') or values.get('LOCAL_PANEL_IMAGE') or panel_release(REGISTRY['default'])['image']
    secondary = os.environ.get('LOCAL_SECOND_PANEL_IMAGE') or values.get('LOCAL_SECOND_PANEL_IMAGE') or primary
    supported = {release['image'] for release in REGISTRY['supported']}
    if primary not in supported or secondary not in supported:
        raise ValueError('acceptance requires an exact pinned supported image; use a new state or the upgrade runner')
    return {'LOCAL_PANEL_IMAGE': primary, 'LOCAL_SECOND_PANEL_IMAGE': secondary}


def initialize_panel(compose, state, service, directory):
    if (service, directory) not in (('panel', 'panel-db'), ('panel-second', 'panel-second-db')):
        raise ValueError('only owned fixture panels can be initialized')
    state = Path(state).resolve()
    db = state / directory
    if db.is_symlink() or db.resolve().parent != state:
        raise ValueError('panel state must stay inside its owned directory')
    if any(db.iterdir()):
        return False
    compose('run', '--rm', '--no-deps', '--entrypoint', '/bin/sh', service, '-c',
            'exec /app/x-ui setting -username local-operator -password "$(cat /run/secrets/panel_password)"')
    return True


def state_images(state, values):
    images=selected_images(values)
    for key,directory in (('LOCAL_PANEL_IMAGE','panel-db'),('LOCAL_SECOND_PANEL_IMAGE','panel-second-db')):
        if (Path(state)/directory/'x-ui.db').exists() and values.get(key)!=images[key]:
            raise ValueError('existing panel image cannot change implicitly; use a new state or upgrade runner')
    return images
