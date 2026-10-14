import gc
import threading
import time
import unittest
from unittest import mock

import numpy as np

import gui.app as app_module
from kws import practice
from kws.audio import save_wav
from kws.project import SILENCE_LABEL
from test.helpers import LABELS, kws_root, project_with_model, temp_dir, tone, write_tone_dataset


def pump(app, done, timeout=240.0):
    end = time.time() + timeout
    while time.time() < end:
        app.root.update()
        if done():
            return True
        time.sleep(0.02)
    return False


def fake_generate(commands, root=None, on_progress=None):
    rng = np.random.default_rng(9)
    labels = [*commands, SILENCE_LABEL]
    for label in labels:
        for index in range(8):
            save_wav(practice.train_dir() / label / f"{index:04d}.wav", tone(label, rng))
    if on_progress:
        on_progress("합성 중")
    return {label: 8 for label in labels}


class FakeMicrophone:
    def __init__(self, device=None):
        rng = np.random.default_rng(4)
        self.wav = tone("해제", rng)

    def start(self):
        pass

    def read(self):
        return self.wav

    def close(self):
        pass


class GuiTestCase(unittest.TestCase):
    def setUp(self):
        self.root = temp_dir()
        self.env = kws_root(self.root)
        self.env.__enter__()
        self.messagebox = mock.patch.object(app_module, "messagebox").start()
        self.messagebox.askyesno.return_value = True
        self.filedialog = mock.patch.object(app_module, "filedialog").start()
        self.app = None

    def tearDown(self):
        if self.app is not None:
            self.app.close()
        # Tk 객체가 작업 스레드에서 마지막으로 해제되면 Tcl이 프로세스를 종료시키므로,
        # 작업 스레드가 끝난 뒤에 메인 스레드에서 App을 놓는다.
        for thread in threading.enumerate():
            if thread is not threading.main_thread() and thread.daemon:
                thread.join(timeout=30)
        self.app = None
        mock.patch.stopall()
        gc.collect()
        self.env.__exit__(None, None, None)

    def open(self):
        self.app = app_module.App(headless=True)
        self.app.root.update()
        return self.app

    def current_tab(self):
        return self.app.notebook.tab(self.app.notebook.select(), "text")


class EmptyProjectTest(GuiTestCase):
    def test_starts_on_data_tab_without_models(self):
        app = self.open()
        self.assertEqual(self.current_tab(), "데이터")
        self.assertEqual(app.model_info_var.get(), "학습 결과가 없습니다.")
        self.assertEqual(list(app.command_list.get(0, "end"))[0].split()[0], "출근")

    def test_recognition_without_model_is_explained(self):
        app = self.open()
        self.assertFalse(app._load_classifier())
        self.messagebox.showinfo.assert_called()

    def test_training_asks_before_generating_synth(self):
        self.messagebox.askyesno.return_value = False
        app = self.open()
        app.start_train()
        self.assertFalse(app.training)
        self.assertIn("합성 데이터가 없는", self.messagebox.askyesno.call_args[0][1])

    def test_training_blocked_without_any_data(self):
        app = self.open()
        app.use_synth_var.set(False)
        app.start_train()
        self.assertFalse(app.training)
        self.assertIn("최소 4개", self.messagebox.showinfo.call_args[0][1])

    def test_finetune_needs_existing_result(self):
        app = self.open()
        app.train_mode_var.set("finetune")
        app.on_train_mode()
        self.assertEqual(app.out_name_var.get(), "speaker")
        self.assertIn("없음", app.base_info_var.get())
        app.start_train()
        self.assertFalse(app.training)
        self.assertIn("추가 학습할 학습 결과가 없습니다", self.messagebox.showinfo.call_args[0][1])

    def test_add_and_delete_command(self):
        app = self.open()
        app.command_var.set("메뉴")
        app.add_command()
        self.assertIn("메뉴", app.project.commands)
        app.command_list.selection_clear(0, "end")
        app.command_list.selection_set(app.project.labels().index("메뉴"))
        app.delete_command()
        self.assertNotIn("메뉴", app.project.commands)

    def test_record_command_and_silence(self):
        app = self.open()
        app.repeat_var.set("2")
        fake = np.full(19200, 0.3, dtype=np.float32)
        with mock.patch.object(app_module, "record_block", return_value=fake), mock.patch.object(app_module, "beep"):
            app.record_command()
            self.assertTrue(pump(app, lambda: not app.recording, 30))
            app.record_silence()
            self.assertTrue(pump(app, lambda: not app.recording, 30))
        self.assertEqual(app.project.count("출근"), 2)
        self.assertEqual(app.project.count(SILENCE_LABEL), 2)
        self.assertIn("2개", app.command_list.get(0))
        self.assertIn("저장했습니다", app.status_var.get())
        self.messagebox.showerror.assert_not_called()

    def test_import_wav_files(self):
        source = temp_dir() / "in.wav"
        save_wav(source, np.zeros(22050, dtype=np.float32), 22050)
        app = self.open()
        self.filedialog.askopenfilenames.return_value = (str(source),)
        app.import_wavs()
        self.assertTrue(pump(app, lambda: not app.recording, 30))
        self.assertEqual(app.project.count("출근"), 1)

    def test_generate_synth_data_button(self):
        app = self.open()
        with mock.patch("kws.synth_eval.generate_dataset", side_effect=fake_generate):
            app.load_practice_audio()
            self.assertTrue(pump(app, lambda: not app.recording, 30))
        self.assertEqual({label: app.project.count(label) for label in LABELS}, {label: 0 for label in LABELS})
        self.assertEqual({label: practice.synth_count(label) for label in LABELS}, {label: 8 for label in LABELS})
        self.assertIn("내 녹음 0개 · 합성 8개", app.command_list.get(0))
        self.assertIn("합성 데이터 (40개)", app.use_synth_check.cget("text"))
        self.assertIn("합성 데이터를 만들었습니다", app.status_var.get())

    def test_default_training_generates_synth_then_trains(self):
        app = self.open()
        app.epoch_var.set("3")
        app.int8_var.set(False)
        with mock.patch("kws.synth_eval.generate_dataset", side_effect=fake_generate) as generate:
            app.start_train()
            self.assertTrue(app.training)
            self.assertTrue(pump(app, lambda: not app.training))
        generate.assert_called_once()
        log = app.log.get("1.0", "end")
        self.assertIn("합성 데이터: 출근 8개", log)
        self.assertIn("합성: 학습", log)
        self.assertIn("학습에 쓰지 않은 음성으로 확인", log)
        self.assertIn("학습에 쓰지 않은 음성으로 확인", app.check_var.get())
        self.assertIn("검증 정확도", app.acc_var.get())
        self.assertTrue((self.root / "models" / "latest" / "command_kws.onnx").is_file())
        self.messagebox.showerror.assert_not_called()

    def test_train_only_then_select_result(self):
        write_tone_dataset(self.root / "data" / "audio")
        app = self.open()
        app.use_synth_var.set(False)
        app.epoch_var.set("10")
        app.int8_var.set(False)
        app.start_train()
        self.assertTrue(app.training)
        self.assertTrue(pump(app, lambda: not app.training))
        self.assertEqual(self.current_tab(), "학습")
        self.assertIn("검증 정확도", app.acc_var.get())
        self.assertEqual(list(app.model_combo["values"]), ["latest"])
        self.assertEqual(app.model_var.get(), "latest")
        self.assertTrue((self.root / "models" / "latest" / "command_kws.onnx").is_file())
        self.messagebox.showerror.assert_not_called()


class ExistingModelTest(GuiTestCase):
    def setUp(self):
        super().setUp()
        project_with_model(self.root, "latest")
        project_with_model(self.root, "synth_eval")

    def test_opens_on_recognition_with_saved_results(self):
        app = self.open()
        self.assertEqual(self.current_tab(), "실시간 테스트")
        self.assertEqual(list(app.model_combo["values"]), ["latest", "synth_eval"])
        self.assertIn("출근, 퇴근, 경비, 해제, 무음", app.model_info_var.get())

    def test_finetune_with_my_recordings(self):
        app = self.open()
        app.train_mode_var.set("finetune")
        app.on_train_mode()
        self.assertEqual(app.epoch_var.get(), "15")
        self.assertEqual(app.out_name_var.get(), "speaker")
        self.assertEqual(app.base_info_var.get(), "기반: latest")
        app.use_synth_var.set(False)
        app.epoch_var.set("2")
        app.int8_var.set(False)
        app.start_train()
        self.assertTrue(app.training)
        self.assertTrue(pump(app, lambda: not app.training))
        self.messagebox.showerror.assert_not_called()
        self.assertIn("추가 학습 전", app.acc_var.get())
        self.assertIn("추가 학습 전 검증 정확도", app.log.get("1.0", "end"))
        self.assertEqual(app.model_var.get(), "speaker")
        self.assertTrue((self.root / "models" / "speaker" / "command_kws.onnx").is_file())
        self.assertEqual(app.project.epochs, 40)
        app.train_mode_var.set("scratch")
        app.on_train_mode()
        self.assertEqual(app.epoch_var.get(), "40")
        self.assertEqual(app.out_name_var.get(), "latest")

    def test_finetune_rejects_changed_commands(self):
        app = self.open()
        app.project.add_command("메뉴")
        app.train_mode_var.set("finetune")
        app.on_train_mode()
        app.start_train()
        self.assertFalse(app.training)
        self.assertIn("달라", self.messagebox.showinfo.call_args[0][1])

    def test_recognize_wav_without_training(self):
        app = self.open()
        app.model_var.set("synth_eval")
        app.on_model_picked()
        wav = sorted((self.root / "data" / "audio" / "경비").glob("*.wav"))[0]
        app.recognize_wav(wav)
        self.assertEqual(app.result_label.cget("text"), "경비")
        self.assertIn("synth_eval", app.model_source_var.get())
        self.assertIn("결과: 경비", app.file_log.get("1.0", "end"))
        self.assertFalse(app.training)

    def test_pytorch_engine(self):
        app = self.open()
        app.engine_var.set("pytorch")
        wav = sorted((self.root / "data" / "audio" / "무음").glob("*.wav"))[0]
        app.recognize_wav(wav)
        self.assertEqual(app.result_label.cget("text"), "대기")
        self.assertIn("pytorch", app.model_source_var.get())

    def test_threshold_changes_decision(self):
        app = self.open()
        wav = sorted((self.root / "data" / "audio" / "출근").glob("*.wav"))[0]
        app.threshold_var.set(0.40)
        app.recognize_wav(wav)
        self.assertEqual(app.result_label.cget("text"), "출근")
        app.threshold_var.set(0.95)
        app.on_threshold("0.95")
        if app.last_decision.top_confidence < 0.95:
            self.assertEqual(app.result_label.cget("text"), "대기")

    def test_browse_other_model_folder(self):
        app = self.open()
        self.filedialog.askdirectory.return_value = str(self.root / "models" / "synth_eval")
        app.browse_model()
        self.assertEqual(app.model_var.get(), "synth_eval")
        self.filedialog.askdirectory.return_value = str(temp_dir())
        app.browse_model()
        self.messagebox.showinfo.assert_called()

    def test_live_microphone_recognition(self):
        app = self.open()
        with mock.patch.object(app_module, "MicrophoneStream", FakeMicrophone):
            app.toggle_test()
            self.assertTrue(app.live)
            self.assertTrue(pump(app, lambda: app.result_label.cget("text") == "해제", 20))
            app.toggle_test()
        self.assertFalse(app.live)

    def test_heldout_evaluation_button(self):
        heldout = temp_dir()
        rng = np.random.default_rng(3)
        for label in LABELS[:-1]:
            for group in ("깨끗", "소음섞인"):
                save_wav(heldout / group / label / "0000.wav", tone(label, rng))
        for group in ("다른말", "소음"):
            save_wav(heldout / group / "0000.wav", tone(SILENCE_LABEL, rng))
        app = self.open()
        app.threshold_var.set(0.5)
        with mock.patch.object(practice, "test_dir", return_value=heldout):
            app.evaluate_practice()
            self.assertTrue(app.evaluating)
            self.assertEqual(self.current_tab(), "평가")
            self.assertTrue(pump(app, lambda: not app.evaluating, 60))
        self.assertEqual(len(app.eval_items), 10)
        self.assertEqual(len(app.eval_tree.get_children()), 10)
        report = app.eval_report.get("1.0", "end")
        self.assertIn("전체 정답률 100% (10/10)", report)
        self.assertIn("혼동표", report)
        self.assertEqual(str(app.csv_button.cget("state")), "normal")

        app.threshold_var.set(0.95)
        app.on_threshold("0.95")
        self.assertIn("임계값 0.95", app.eval_report.get("1.0", "end"))
        app.wrong_only_var.set(True)
        app.refresh_eval_view()
        wrong = len(app.eval_tree.get_children())
        self.assertLessEqual(wrong, 10)
        app.wrong_only_var.set(False)
        app.refresh_eval_view()

        first = app.eval_tree.get_children()[0]
        app.eval_tree.selection_set(first)
        app.on_eval_select()
        self.assertEqual(app.eval_selected, 0)
        self.assertTrue(app.eval_bars.find_all())
        with mock.patch.object(app_module, "play_wav") as play:
            app.play_eval_selected()
        play.assert_called_once_with(app.eval_items[0].path)

        csv_path = temp_dir() / "eval.csv"
        self.filedialog.asksaveasfilename.return_value = str(csv_path)
        app.save_eval_csv()
        self.assertTrue(csv_path.is_file())

    def test_folder_evaluation_reports_missing_labels(self):
        empty = temp_dir()
        (empty / "모름").mkdir()
        save_wav(empty / "모름" / "a.wav", np.zeros(16000, dtype=np.float32))
        app = self.open()
        self.filedialog.askdirectory.return_value = str(empty)
        app.evaluate_folder_dialog()
        self.assertTrue(pump(app, lambda: not app.evaluating, 30))
        self.messagebox.showerror.assert_called()
        self.assertEqual(app.eval_items, [])

    def test_microphone_exam(self):
        app = self.open()
        app.exam_repeat_var.set("1")
        app.threshold_var.set(0.5)
        fake = tone("경비", np.random.default_rng(5))
        with mock.patch.object(app_module, "record_block", return_value=fake), mock.patch.object(app_module, "beep"):
            app.start_exam()
            self.assertTrue(app.recording)
            self.assertTrue(pump(app, lambda: not app.evaluating, 60))
        self.messagebox.showerror.assert_not_called()
        self.assertFalse(app.recording)
        self.assertEqual(len(app.eval_items), 6)
        saved = sorted(path.parent.name for path in app.exam_folder.rglob("*.wav"))
        self.assertEqual(saved, sorted(["출근", "퇴근", "경비", "해제", SILENCE_LABEL, "다른말"]))
        outcomes = [app.eval_tree.item(row, "values")[0] for row in app.eval_tree.get_children()]
        self.assertEqual(outcomes.count("정답"), 1)
        self.assertIn("저장했습니다", app.status_var.get())
        self.assertEqual(app.eval_score.cget("text"), "정확도 17% (1/6)")

        before = {label: app.project.count(label) for label in LABELS}
        app.save_eval_as_training()
        after = {label: app.project.count(label) for label in LABELS}
        added = {label: after[label] - before[label] for label in LABELS}
        self.assertEqual(added, {"출근": 1, "퇴근": 1, "경비": 1, "해제": 1, SILENCE_LABEL: 2})
        self.assertIn("학습 데이터에 추가했습니다", app.status_var.get())

    def test_exam_button_on_live_tab(self):
        app = self.open()
        with mock.patch.object(app, "start_exam") as start:
            app.live_exam_button.invoke()
        start.assert_called_once()

    def test_export_selected_result(self):
        app = self.open()
        app.model_var.set("synth_eval")
        app.on_model_picked()
        app.int8_var.set(False)
        app.export_model()
        self.assertTrue(pump(app, lambda: "ONNX 저장" in app.export_text.get("1.0", "end"), 120))
        self.assertIn("synth_eval", app.export_text.get("1.0", "end"))


if __name__ == "__main__":
    unittest.main()
