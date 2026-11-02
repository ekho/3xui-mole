from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch
import os

from deploy.acceptance.panel_upgrade import create_state, snapshot_panel, restore_panel, owned, compose_environment
from deploy.acceptance.panel_versions import panel_release


class PanelUpgradeTests(unittest.TestCase):
    def test_parent_environment_cannot_select_an_existing_panel_or_credentials(self):
        with tempfile.TemporaryDirectory() as temp:
            state=Path(temp)/'owned';create_state(state,'3.11.0')
            source=panel_release('3.10.0',upgrade_source=True)['image']
            (state/'public.env').write_text('LOCAL_PANEL_IMAGE='+source+'\n')
            with patch.dict(os.environ,{'LOCAL_STATE_DIR':'/foreign/panel','PANEL_PASSWORD_FILE':'/foreign/password','APP_RUNTIME_UID':'0','APP_RUNTIME_GID':'0','LOCAL_PANEL_IMAGE':'foreign:latest'}):
                env=compose_environment(state)
                self.assertEqual(env['LOCAL_STATE_DIR'],str(state.resolve()))
                self.assertEqual(env['PANEL_PASSWORD_FILE'],str(state.resolve()/'panel-password'))
                self.assertEqual(env['LOCAL_PANEL_IMAGE'],source)
                self.assertEqual(env['APP_RUNTIME_UID'],str(os.getuid()))
                self.assertEqual(os.environ['LOCAL_PANEL_IMAGE'],'foreign:latest')
            (state/'public.env').write_text('LOCAL_PANEL_IMAGE=foreign:latest\n')
            with self.assertRaises(ValueError):compose_environment(state)
    def test_rehearsal_rejects_unowned_state_and_unsupported_target(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with self.assertRaises(ValueError):create_state(root/'bad','3.7.0')
            (root/'existing').mkdir();(root/'existing'/'retained').write_text('safe')
            with self.assertRaises(ValueError):create_state(root/'existing','3.11.0')
            self.assertEqual((root/'existing'/'retained').read_text(),'safe')
            state=root/'owned';create_state(state,'3.11.0')
            metadata=json.loads((state/'runtime.json').read_text())
            self.assertEqual(metadata['purpose'],'panel-upgrade')
            self.assertEqual(metadata['source_image'],panel_release('3.10.0',upgrade_source=True)['image'])

    def test_tampered_source_and_symlink_database_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            state=Path(temp)/'owned';create_state(state,'3.11.0')
            metadata=json.loads((state/'runtime.json').read_text())
            metadata['source_image']='unowned:latest'
            (state/'runtime.json').write_text(json.dumps(metadata))
            with self.assertRaises(ValueError):owned(state)
            metadata['source_image']=panel_release('3.10.0',upgrade_source=True)['image']
            (state/'runtime.json').write_text(json.dumps(metadata))
            (state/'panel-db').symlink_to(Path(temp),target_is_directory=True)
            with self.assertRaises(ValueError):snapshot_panel(lambda *args: self.fail('must reject before stop'),state)

    def test_snapshot_stops_writer_and_rollback_restores_original_database(self):
        with tempfile.TemporaryDirectory() as temp:
            state=Path(temp)/'owned';create_state(state,'3.11.0')
            db=state/'panel-db';db.mkdir();(db/'x-ui.db').write_bytes(b'before-stop')
            (state/'public.env').write_text('LOCAL_PANEL_IMAGE='+panel_release('3.11.0')['image']+'\n')
            calls=[]
            def compose(*args):
                calls.append(args)
                if args==('stop','panel') and (db/'x-ui.db').read_bytes()==b'before-stop':(db/'x-ui.db').write_bytes(b'stopped-source')
            snapshot_panel(compose,state)
            self.assertEqual(calls[0],('stop','panel'))
            self.assertEqual((state/'source-db'/'x-ui.db').read_bytes(),b'stopped-source')
            (db/'x-ui.db').write_bytes(b'migrated')
            restore_panel(compose,state)
            self.assertEqual((db/'x-ui.db').read_bytes(),b'stopped-source')
            self.assertEqual((state/'source-db'/'x-ui.db').read_bytes(),b'stopped-source')
            self.assertEqual((state/'upgraded-db'/'x-ui.db').read_bytes(),b'migrated')
            self.assertIn(panel_release('3.10.0',upgrade_source=True)['image'],(state/'public.env').read_text())


if __name__=='__main__':unittest.main()
