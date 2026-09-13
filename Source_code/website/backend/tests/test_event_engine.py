"""Run without loading AI models or connecting to SQL Server."""
import importlib.util
from pathlib import Path
import sys
import threading
import types
import unittest
from unittest.mock import Mock, patch


class EventDeduplicationTests(unittest.TestCase):
    def setUp(self):
        db = types.ModuleType('db_helper')
        db.save_violation_to_db = Mock(return_value='/evidence.jpg')
        detector = types.ModuleType('detector')
        detector.camera_configs = {'cam1': 'weapon', 'cam2': 'weapon'}
        self.modules = patch.dict(sys.modules, db_helper=db, detector=detector)
        self.modules.start()
        self.addCleanup(self.modules.stop)
        path = Path(__file__).resolve().parents[1] / 'event_engine.py'
        spec = importlib.util.spec_from_file_location('event_engine_under_test', path)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.engine = self.module.EventProcessingEngine()
        self.save = db.save_violation_to_db
        self.clock = patch.object(self.module.time, 'monotonic', return_value=1000)
        self.now = self.clock.start()
        self.addCleanup(self.clock.stop)

    def alert(self, tid=1, cam='cam1', **kwargs):
        return self.engine.process_and_log_alert(
            cam, [tid], [{'name': 'Dao', 'is_alert': True}], 'Người mang dao',
            None, **kwargs)

    def test_continuous_alert_with_changing_ids_saves_once(self):
        for i in range(1000):
            self.now.return_value = 1000 + i
            self.assertEqual(self.alert(tid=i), i == 0)
        self.assertEqual(self.save.call_count, 1)

    def test_brief_loss_does_not_duplicate_but_quiet_period_rearms(self):
        self.assertTrue(self.alert())
        self.now.return_value = 1029
        self.assertFalse(self.alert(tid=99))
        self.now.return_value = 1058
        self.assertFalse(self.alert(tid=100))
        self.now.return_value = 1088
        self.assertTrue(self.alert(tid=101))
        self.assertEqual(self.save.call_count, 2)

    def test_cameras_and_event_types_are_independent(self):
        self.assertTrue(self.alert())
        self.assertTrue(self.alert(cam='cam2'))
        self.assertTrue(self.alert(api_type='behavior'))
        self.assertFalse(self.alert(api_type='behavior'))
        self.assertEqual(self.save.call_count, 3)

    def test_forced_weapon_endpoint_overrides_face_config(self):
        for i in range(5):
            self.assertEqual(self.alert(tid=i, cam='cam3', api_type='weapon'), i == 0)
        self.assertEqual(self.save.call_count, 1)

    def test_unconfirmed_weapon_is_not_saved(self):
        result = self.engine.process_and_log_alert(
            'cam1', [], [{'name': 'Dao', 'is_alert': False}], '', None)
        self.assertFalse(result)
        self.save.assert_not_called()

    def test_face_alert_excludes_known_bystanders_and_uses_generic_identity(self):
        stranger = {'track_id': 1, 'name': 'Người lạ', 'has_alert': True}
        known = {'track_id': 2, 'name': 'QuachThiThu', 'has_alert': False}
        self.assertTrue(self.engine.process_and_log_alert(
            'cam3', [1], [stranger, known], 'QuachThiThu', None, api_type='face'))
        self.assertEqual(self.save.call_args.args[3], [stranger])
        self.assertEqual(self.save.call_args.args[4], 'Đối tượng người lạ')
        self.assertFalse(self.engine.process_and_log_alert(
            'cam3', [1], [stranger, known], '', None, api_type='face'))
        self.assertEqual(self.save.call_count, 1)

    def test_unconfirmed_face_is_not_saved(self):
        self.assertFalse(self.engine.process_and_log_alert(
            'cam3', [], [{'track_id': 1, 'has_alert': False}], '', None, api_type='face'))
        self.save.assert_not_called()

    def test_failed_save_retries_without_writing_every_frame(self):
        self.save.side_effect = [None, '/evidence.jpg']
        self.assertFalse(self.alert())
        for sec in range(1, 30):
            self.now.return_value = 1000 + sec
            self.assertFalse(self.alert(tid=sec))
        self.now.return_value = 1030
        self.assertTrue(self.alert())
        self.assertEqual(self.save.call_count, 2)

    def test_concurrent_requests_save_once(self):
        started = threading.Event()
        release = threading.Event()
        def slow_save(*args):
            started.set()
            if not release.wait(5):
                raise TimeoutError('Test did not release writer')
            return '/evidence.jpg'
        self.save.side_effect = slow_save
        results = []
        worker = threading.Thread(target=lambda: results.append(self.alert()))
        worker.start()
        try:
            self.assertTrue(started.wait(5))
            self.assertFalse(self.alert(tid=999))
        finally:
            release.set()
            worker.join(5)
        self.assertEqual(results, [True])
        self.assertEqual(self.save.call_count, 1)


if __name__ == '__main__':
    unittest.main()
