import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('acceptance_smoke_html', ROOT / 'deploy/acceptance/smoke.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


def document(nonce, script=b'/assets/app.js', text=b'Account'):
    return (b'<!doctype html><html><head><meta property="csp-nonce" nonce="' + nonce +
            b'"><meta http-equiv="Content-Security-Policy" content="style-src \'self\' \'nonce-' + nonce +
            b'\'"><script src="' + script + b'"></script></head><body>' + text + b'</body></html>')


class BrowserHTMLSnapshotTests(unittest.TestCase):
    def test_only_the_document_nonce_can_change_between_deployments(self):
        self.assertEqual(smoke.stable_browser_html(document(b'a' * 32)),
                         smoke.stable_browser_html(document(b'b' * 32)))

    def test_other_content_and_nonce_looking_text_still_changes_the_snapshot(self):
        self.assertNotEqual(smoke.stable_browser_html(document(b'a' * 32)),
                            smoke.stable_browser_html(document(b'b' * 32, script=b'/assets/changed.js')))
        self.assertNotEqual(smoke.stable_browser_html(document(b'a' * 32, text=b'a' * 32)),
                            smoke.stable_browser_html(document(b'b' * 32, text=b'b' * 32)))

    def test_missing_or_mismatched_meta_nonce_is_rejected(self):
        for html in (b'<!doctype html><body>Missing nonce</body>',
                     document(b'a' * 32).replace(b"'nonce-" + b'a' * 32, b"'nonce-" + b'b' * 32)):
            with self.subTest(html=html), self.assertRaises(AssertionError):
                smoke.stable_browser_html(html)


if __name__ == '__main__':
    unittest.main()
