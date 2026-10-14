import sys
import unittest
from unittest import mock

import numpy as np

from kws import record
from kws.project import Project
from test.helpers import kws_root, run_module, temp_dir


class RecordCliTest(unittest.TestCase):
    def test_count_out_of_range(self):
        completed = run_module("kws.record", "출근", "31", root=temp_dir())
        self.assertEqual(completed.returncode, 1)
        self.assertIn("1에서 30", completed.stderr)

    def test_unknown_label(self):
        completed = run_module("kws.record", "없는명령", "1", root=temp_dir())
        self.assertEqual(completed.returncode, 1)
        self.assertIn("없는 명령", completed.stderr)

    def test_saves_clips_without_real_microphone(self):
        root = temp_dir()
        fake = np.full(19200, 0.3, dtype=np.float32)
        with kws_root(root), mock.patch.object(record, "record_block", return_value=fake) as recorder, mock.patch.object(
            record.time, "sleep"
        ), mock.patch.object(record, "_beep"), mock.patch.object(sys, "argv", ["record", "무음", "2"]):
            code = record.main()
        self.assertEqual(code, 0)
        self.assertEqual(recorder.call_count, 2)
        self.assertEqual(recorder.call_args.kwargs["gain"], 1.0)
        self.assertEqual(Project(root).count("무음"), 2)

    def test_microphone_error_returns_failure(self):
        root = temp_dir()
        with kws_root(root), mock.patch.object(
            record, "record_block", side_effect=RuntimeError("마이크를 열 수 없습니다.")
        ), mock.patch.object(record.time, "sleep"), mock.patch.object(record, "_beep"), mock.patch.object(
            sys, "argv", ["record", "출근", "1"]
        ):
            code = record.main()
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
