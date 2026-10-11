"""Select a stable version from Git tags without changing the repository."""
import os
import re
import subprocess


# shortcut: releases stay in 0.1; update the series when introducing a minor or major release.
STABLE_TAG = re.compile(r'0\.1\.(0|[1-9][0-9]*)')


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def release_version():
    sha = os.environ['GITHUB_SHA']
    if git('rev-parse', 'HEAD') != sha:
        raise RuntimeError('Checkout does not match the release source')
    tags = {tag: int(match[1]) for tag in git('tag', '--list').splitlines()
            if (match := STABLE_TAG.fullmatch(tag))}
    current = set(git('tag', '--points-at', sha).splitlines()) & tags.keys()
    latest = max(tags, key=tags.get, default=None)
    if len(current) > 1:
        raise RuntimeError('Source has multiple release tags')
    if current:
        version = current.pop()
        if version != latest:
            raise RuntimeError('Refusing to republish an older release')
        return version
    if latest:
        ancestor = subprocess.run(['git', 'merge-base', '--is-ancestor', latest, sha])
        if ancestor.returncode == 1:
            raise RuntimeError('Release source must be a descendant of ' + latest)
        ancestor.check_returncode()
    return '0.1.' + str(tags.get(latest, -1) + 1)


if __name__ == '__main__':
    print(release_version())
