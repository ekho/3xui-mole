import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from deploy.acceptance.panel_versions import panel_release, selected_images, state_images, initialize_panel


class PanelBootstrapTests(unittest.TestCase):
    def test_registry_has_exact_releases_and_explicit_upgrade_source(self):
        for version in ('3.10.2', '3.11.0'):
            release = panel_release(version)
            self.assertTrue(release['image'].startswith('ghcr.io/mhsanaei/3x-ui:'+version+'@sha256:'))
        for version in ('3.7.0', '3.10.0', '3.11.1', 'latest'):
            with self.assertRaises(ValueError): panel_release(version)
        self.assertEqual(panel_release('3.10.0', upgrade_source=True)['version'], '3.10.0')

    def test_images_can_be_mixed_but_never_unpinned_or_unknown(self):
        old, new = panel_release('3.10.2')['image'], panel_release('3.11.0')['image']
        with patch.dict('os.environ', {}, clear=True):
            self.assertEqual(selected_images({}), {'LOCAL_PANEL_IMAGE': new, 'LOCAL_SECOND_PANEL_IMAGE': new})
            self.assertEqual(selected_images({'LOCAL_PANEL_IMAGE': old}), {'LOCAL_PANEL_IMAGE': old, 'LOCAL_SECOND_PANEL_IMAGE': old})
        with patch.dict('os.environ', {'LOCAL_PANEL_IMAGE': old, 'LOCAL_SECOND_PANEL_IMAGE': new}, clear=True):
            self.assertEqual(selected_images({})['LOCAL_SECOND_PANEL_IMAGE'], new)
        for image in ('ghcr.io/mhsanaei/3x-ui:latest', new.split('@')[0], new.replace('mhsanaei', 'unowned'), panel_release('3.10.0', upgrade_source=True)['image']):
            with patch.dict('os.environ', {'LOCAL_PANEL_IMAGE': image}, clear=True), self.assertRaises(ValueError): selected_images({})

    def test_initialization_only_creates_a_new_owned_database(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)
            directory = state/'panel-db'
            directory.mkdir()
            calls = []
            def compose(*args):
                calls.append(args)
                (directory/'x-ui.db').write_bytes(b'initialized')
            self.assertTrue(initialize_panel(compose, state, 'panel', 'panel-db'))
            self.assertFalse(initialize_panel(compose, state, 'panel', 'panel-db'))
            self.assertEqual(len(calls), 1)
            command = ' '.join(calls[0])
            self.assertIn('/run/secrets/panel_password', command)
            self.assertIn('setting -username local-operator', command)
            self.assertNotIn('admin', command)
            self.assertIn('--no-deps', calls[0])

    def test_nonempty_or_unowned_directory_is_never_initialized(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)
            (state/'panel-db').mkdir()
            (state/'panel-db'/'unexpected').write_text('retained')
            def forbidden(*args): self.fail('existing database directory reset')
            self.assertFalse(initialize_panel(forbidden, state, 'panel', 'panel-db'))
            for service, directory in [('other', 'panel-db'), ('panel', '../other')]:
                with self.assertRaises(ValueError): initialize_panel(forbidden, state, service, directory)

    def test_existing_database_image_is_never_changed_implicitly(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict('os.environ', {}, clear=True):
            state=Path(temp);(state/'panel-db').mkdir();(state/'panel-db'/'x-ui.db').touch()
            with self.assertRaises(ValueError):state_images(state,{})
            image=panel_release('3.10.2')['image']
            saved={'LOCAL_PANEL_IMAGE':image,'LOCAL_SECOND_PANEL_IMAGE':image}
            self.assertEqual(state_images(state,saved),saved)
            with patch.dict('os.environ',{'LOCAL_PANEL_IMAGE':panel_release('3.11.0')['image']}),self.assertRaises(ValueError):state_images(state,saved)


if __name__ == '__main__': unittest.main()
