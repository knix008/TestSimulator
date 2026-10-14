import unittest

from kws import paths
from test.helpers import temp_dir


def make_model(folder, onnx=True, meta=True):
    folder.mkdir(parents=True)
    if meta:
        (folder / paths.META_FILENAME).write_text("{}", encoding="utf-8")
    if onnx:
        (folder / paths.ONNX_FILENAME).write_bytes(b"x")


class SavedModelTest(unittest.TestCase):
    def test_is_saved_model(self):
        root = temp_dir()
        make_model(root / "ok")
        make_model(root / "no_meta", meta=False)
        make_model(root / "no_weights", onnx=False)
        self.assertTrue(paths.is_saved_model(root / "ok"))
        self.assertFalse(paths.is_saved_model(root / "no_meta"))
        self.assertFalse(paths.is_saved_model(root / "no_weights"))
        self.assertFalse(paths.is_saved_model(root / "missing"))

    def test_latest_listed_first(self):
        root = temp_dir()
        make_model(root / "models" / "synth_eval")
        make_model(root / "models" / "latest")
        make_model(root / "models" / "broken", onnx=False)
        names = [path.name for path in paths.saved_model_dirs(root)]
        self.assertEqual(names, ["latest", "synth_eval"])

    def test_no_models_folder(self):
        self.assertEqual(paths.saved_model_dirs(temp_dir()), [])


if __name__ == "__main__":
    unittest.main()
