import json
import unittest

from kws import paths
from kws.project import DEFAULT_COMMANDS, MAX_COMMANDS, SILENCE_LABEL, Project, validate_command
from test.helpers import kws_root, temp_dir


class ValidateCommandTest(unittest.TestCase):
    def test_accepts_trimmed_name(self):
        self.assertEqual(validate_command("  출근 ", []), "출근")

    def test_rejections(self):
        for name, existing in (
            ("", []),
            ("가" * 21, []),
            ("a/b", []),
            (SILENCE_LABEL, []),
            ("출근", ["출근"]),
            ("새명령", [f"명령{i}" for i in range(MAX_COMMANDS)]),
        ):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    validate_command(name, existing)


class ProjectTest(unittest.TestCase):
    def test_defaults_are_security_commands(self):
        project = Project(temp_dir())
        self.assertEqual(DEFAULT_COMMANDS, ["출근", "퇴근", "경비", "해제"])
        self.assertEqual(project.commands, DEFAULT_COMMANDS)
        self.assertEqual(project.labels(), [*DEFAULT_COMMANDS, SILENCE_LABEL])
        for label in project.labels():
            self.assertTrue((project.audio / label).is_dir())
        self.assertEqual(project.model_dir, project.root / "models" / "latest")

    def test_add_remove_and_limit(self):
        project = Project(temp_dir())
        while len(project.commands) < MAX_COMMANDS:
            project.add_command(f"추가{len(project.commands)}")
        with self.assertRaises(ValueError):
            project.add_command("메뉴")
        project.remove_command("해제")
        self.assertFalse((project.audio / "해제").exists())
        self.assertEqual(project.add_command("메뉴"), "메뉴")
        with self.assertRaises(ValueError):
            project.remove_command(SILENCE_LABEL)

    def test_settings_persist(self):
        root = temp_dir()
        project = Project(root)
        project.add_command("메뉴")
        project.epochs = 12
        project.threshold = 0.85
        project.save()
        again = Project(root)
        self.assertIn("메뉴", again.commands)
        self.assertEqual(again.epochs, 12)
        self.assertAlmostEqual(again.threshold, 0.85)

    def test_bad_config_is_sanitized(self):
        root = temp_dir()
        config = root / "data" / "commands.json"
        config.parent.mkdir(parents=True)
        payload = {"commands": ["무음", "출근", "출근", "a/b"], "epochs": 9999, "threshold": 5, "learning_rate": -1}
        config.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        project = Project(root)
        self.assertEqual(project.commands, ["출근"])
        self.assertEqual(project.epochs, 200)
        self.assertAlmostEqual(project.threshold, 0.95)
        self.assertAlmostEqual(project.learning_rate, 0.002)

    def test_new_wav_paths_and_counts(self):
        project = Project(temp_dir())
        first = project.new_wav_path("출근")
        self.assertEqual(first.name, "0001.wav")
        first.write_bytes(b"x")
        self.assertEqual(project.new_wav_path("출근").name, "0002.wav")
        self.assertEqual(project.count("출근"), 1)
        self.assertEqual(project.list_wavs("출근"), [first])
        self.assertEqual(project.count("없는명령"), 0)

    def test_kws_root_override(self):
        root = temp_dir()
        with kws_root(root):
            self.assertEqual(paths.root(), root)
            self.assertEqual(Project().root, root)


if __name__ == "__main__":
    unittest.main()
