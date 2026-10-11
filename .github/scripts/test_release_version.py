import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('release_version.py')


class ReleaseVersionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.git('init', '--quiet')
        self.git('config', 'user.name', 'Release test')
        self.git('config', 'user.email', 'release@example.test')
        self.git('config', 'tag.gpgSign', 'false')
        self.commit()

    def git(self, *args):
        return subprocess.check_output(
            ['git', *args], cwd=self.directory.name, text=True,
            stderr=subprocess.PIPE,
        ).strip()

    def commit(self):
        self.git('commit', '--quiet', '--no-gpg-sign', '--allow-empty', '-m', 'Release source')

    def version(self, revision='HEAD'):
        sha = self.git('rev-parse', revision)
        self.git('checkout', '--quiet', '--detach', sha)
        result = subprocess.run(
            [sys.executable, str(SCRIPT)], cwd=self.directory.name,
            env={**os.environ, 'GITHUB_SHA': sha},
            capture_output=True, text=True,
        )
        if result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout.strip()

    def test_first_release_ignores_legacy_and_preview_tags(self):
        for tag in ('1.31.0', '2.0.0-dev.145', '0.1.0-dev.10', '0.1.01'):
            self.git('tag', tag)
        self.assertEqual(self.version(), '0.1.0')

    def test_increments_patch_numerically(self):
        for tag in ('0.1.2', '0.1.9', '0.1.10', '0.1.99-dev.1'):
            self.git('tag', tag)
        self.commit()
        self.assertEqual(self.version(), '0.1.11')

    def test_reuses_the_reserved_version_for_the_same_commit(self):
        self.git('tag', '-a', '0.1.0', '-m', 'Reserved release')
        self.assertEqual(self.version(), '0.1.0')

    def test_rejects_rerunning_an_older_release(self):
        self.git('tag', '0.1.0')
        self.commit()
        self.git('tag', '0.1.1')
        with self.assertRaisesRegex(RuntimeError, 'older release'):
            self.version('0.1.0')

    def test_rejects_an_untagged_commit_behind_the_latest_release(self):
        previous = self.git('rev-parse', 'HEAD')
        self.commit()
        self.git('tag', '0.1.0')
        with self.assertRaisesRegex(RuntimeError, 'descendant'):
            self.version(previous)

    def test_rejects_a_checkout_of_a_different_commit(self):
        previous = self.git('rev-parse', 'HEAD')
        self.commit()
        result = subprocess.run(
            [sys.executable, str(SCRIPT)], cwd=self.directory.name,
            env={**os.environ, 'GITHUB_SHA': previous}, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Checkout does not match', result.stderr)

    def test_rejects_multiple_versions_for_one_commit(self):
        self.git('tag', '0.1.0')
        self.git('tag', '0.1.1')
        with self.assertRaisesRegex(RuntimeError, 'multiple release tags'):
            self.version()


if __name__ == '__main__':
    unittest.main()
