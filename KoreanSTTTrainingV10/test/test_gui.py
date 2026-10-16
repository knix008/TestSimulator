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
from kws.archs import BCRESNET1, DSCNN
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
    label = "해제"

    def __init__(self, device=None, gain=1.0):
        rng = np.random.default_rng(4)
        self.gain = gain
        self.wav = tone(self.label, rng)

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
    def test_input_gain_persists(self):
        from kws.project import Project

        app = self.open()
        app.gain_var.set(2.0)
        app.on_gain("2.0")
        self.assertAlmostEqual(app.input_gain, 2.0)
        self.assertEqual(app.gain_text.cget("text"), "200%")
        again = Project()
        self.assertAlmostEqual(again.input_gain, 2.0)

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

    def test_can_retrain_over_existing_result(self):
        app = self.open()
        app.use_synth_var.set(False)
        app.epoch_var.set("2")
        app.int8_var.set(False)
        app.out_name_var.set("latest")
        self.assertTrue(app._load_classifier())
        app.start_train()
        self.assertIsNone(app.classifier)
        self.assertTrue(app.training)
        self.assertTrue(pump(app, lambda: not app.training))
        prompts = [call.args[1] for call in self.messagebox.askyesno.call_args_list]
        self.assertTrue(any("바꿀까요" in text for text in prompts))
        self.assertTrue((self.root / "models" / "latest" / "command_kws.onnx").is_file())
        self.assertEqual(app.model_var.get(), "latest")
        self.messagebox.showerror.assert_not_called()

    def test_retrain_can_be_declined(self):
        app = self.open()
        app.use_synth_var.set(False)
        app.out_name_var.set("latest")
        self.messagebox.askyesno.return_value = False
        app.start_train()
        self.assertFalse(app.training)

    def test_retrain_button_uses_selected_result(self):
        app = self.open()
        app.use_synth_var.set(False)
        app.epoch_var.set("2")
        app.int8_var.set(False)
        app.model_var.set("synth_eval")
        app.on_model_picked()
        app.retrain_selected()
        self.assertEqual(app.out_name_var.get(), "synth_eval")
        self.assertTrue(app.training)
        self.assertTrue(pump(app, lambda: not app.training))
        self.assertEqual(app.model_var.get(), "synth_eval")
        self.assertEqual(self.current_tab(), "학습")
        self.assertTrue((self.root / "models" / "synth_eval" / "command_kws.onnx").is_file())

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


def read_meta(folder):
    import json

    return json.loads((folder / "meta.json").read_text(encoding="utf-8"))


def write_heldout_tones():
    heldout = temp_dir()
    rng = np.random.default_rng(3)
    for label in LABELS[:-1]:
        for group in ("깨끗", "소음섞인"):
            save_wav(heldout / group / label / "0000.wav", tone(label, rng))
    for group in ("다른말", "소음"):
        save_wav(heldout / group / "0000.wav", tone(SILENCE_LABEL, rng))
    return heldout


class ModernLayoutTest(GuiTestCase):
    def test_sidebar_switches_pages_and_highlights(self):
        app = self.open()
        # 클릭과 단축키는 화면에 보이는 창에만 전달된다.
        app.root.deiconify()
        app.root.update()
        app.show_page(1)
        app.root.update()
        self.assertEqual(self.current_tab(), "학습")
        self.assertEqual(app.nav_items[1]["label"].cget("bg"), app_module.SIDEBAR_ACTIVE)
        self.assertEqual(app.nav_items[0]["label"].cget("bg"), app_module.SIDEBAR)
        app.nav_items[3]["label"].event_generate("<Button-1>")
        app.root.update()
        self.assertEqual(self.current_tab(), "평가")
        app.root.focus_force()
        app.root.event_generate("<Control-Key-3>")
        app.root.update()
        self.assertEqual(self.current_tab(), "실시간 테스트")
        self.assertEqual(app.nav_items[2]["marker"].cget("bg"), app_module.BLUE)
        app.show_page(1)
        app.arch_cards[BCRESNET1]["summary"].event_generate("<Button-1>")
        app.root.update()
        self.assertEqual(app.arch_var.get(), BCRESNET1)
        app.root.withdraw()

    def test_tab_strip_is_replaced_by_sidebar(self):
        app = self.open()
        layout = app_module.ttk.Style(app.root).layout("Pages.TNotebook.Tab")
        self.assertNotIn("Notebook.tab", str(layout))
        titles = [app.notebook.tab(tab, "text") for tab in app.notebook.tabs()]
        self.assertEqual(titles, [page[0] for page in app_module.PAGES])
        self.assertEqual([item["label"].cget("text") for item in app.nav_items], titles)

    def test_input_level_meter(self):
        app = self.open()
        app._show_input_level(0.5)
        self.assertEqual(app.input_level_var.get(), "입력 50%")
        self.assertEqual(len(app.level_meter.find_all()), 2)
        app._show_input_level(0.99)
        self.assertIn("잘림", app.input_level_var.get())

    def test_arch_cards_show_both_models(self):
        app = self.open()
        self.assertEqual(list(app.arch_cards), [DSCNN, BCRESNET1])
        self.assertEqual(app.arch_var.get(), DSCNN)
        self.assertEqual(app.out_name_var.get(), "latest")
        self.assertEqual(app.lr_var.get(), "0.002")
        self.assertIn("17,637", app.arch_cards[DSCNN]["params"].cget("text"))
        self.assertIn("9,001", app.arch_cards[BCRESNET1]["params"].cget("text"))
        self.assertEqual(str(app.arch_cards[DSCNN]["card"].cget("highlightbackground")), app_module.BLUE)

    def test_picking_bc_resnet_updates_defaults_and_persists(self):
        from kws.project import Project

        app = self.open()
        app.pick_arch(BCRESNET1)
        self.assertEqual(app.arch_var.get(), BCRESNET1)
        self.assertEqual(app.lr_var.get(), "0.01")
        self.assertEqual(app.out_name_var.get(), "bcresnet1")
        self.assertEqual(str(app.arch_cards[BCRESNET1]["card"].cget("highlightbackground")), app_module.BLUE)
        self.assertEqual(Project().arch, BCRESNET1)
        app.close()
        self.app = None
        again = self.open()
        self.assertEqual(again.arch_var.get(), BCRESNET1)
        self.assertEqual(again.lr_var.get(), "0.01")
        self.assertEqual(again.out_name_var.get(), "bcresnet1")
        again.pick_arch(DSCNN)
        self.assertEqual(again.lr_var.get(), "0.002")
        self.assertEqual(again.out_name_var.get(), "latest")

    def test_custom_save_name_is_kept_when_switching(self):
        app = self.open()
        app.out_name_var.set("비교용")
        app.pick_arch(BCRESNET1)
        self.assertEqual(app.out_name_var.get(), "비교용")

    def test_train_bc_resnet_then_live_verification(self):
        write_tone_dataset(self.root / "data" / "audio")
        app = self.open()
        app.use_synth_var.set(False)
        app.pick_arch(BCRESNET1)
        app.epoch_var.set("20")
        app.int8_var.set(False)
        app.start_train()
        self.assertTrue(app.training)
        self.assertTrue(app.busy_shown)
        self.assertEqual(app.kpi_params.get(), "9,001")
        self.assertTrue(pump(app, lambda: not app.training))
        self.messagebox.showerror.assert_not_called()
        self.assertFalse(app.busy_shown)

        model = self.root / "models" / "bcresnet1"
        self.assertTrue((model / "command_kws.onnx").is_file())
        self.assertEqual(read_meta(model)["arch"], BCRESNET1)
        self.assertEqual(read_meta(model)["learning_rate"], 0.01)
        self.assertIn("모델: BC-ResNet-1 (bcresnet1)", app.log.get("1.0", "end"))
        self.assertTrue(app.acc_var.get().startswith("BC-ResNet-1 · 검증 정확도"))
        self.assertTrue(app.kpi_accuracy.get().endswith("%"))
        self.assertTrue(app.kpi_epoch.get().startswith("최고 "))
        self.assertEqual(app.model_var.get(), "bcresnet1")
        self.assertEqual(app.model_arch_badge.cget("text"), "BC-ResNet-1")
        self.assertEqual(app.side_model_var.get(), "bcresnet1")
        self.assertEqual(app.results_tree.item("bcresnet1", "values")[1], "BC-ResNet-1")

        # 학습한 BC-ResNet-1로 바로 실시간 인식
        app.threshold_var.set(0.5)
        with mock.patch.object(app_module, "MicrophoneStream", FakeMicrophone):
            app.toggle_test()
            self.assertTrue(app.live)
            self.assertTrue(pump(app, lambda: app.result_label.cget("text") == "해제", 20))
            app.toggle_test()
        self.assertIn("BC-ResNet-1", app.model_source_var.get())


class BCResNetModelTest(GuiTestCase):
    """저장된 BC-ResNet-1 결과로 실시간 인식, 평가, 추가 학습, 다시 학습, 내보내기를 한다."""

    def setUp(self):
        super().setUp()
        project_with_model(self.root, "latest")
        project_with_model(self.root, "bcresnet1", arch=BCRESNET1)

    def open_bc(self):
        app = self.open()
        app.model_var.set("bcresnet1")
        app.on_model_picked()
        return app

    def test_model_list_and_badges(self):
        app = self.open()
        self.assertEqual(list(app.model_combo["values"]), ["latest", "bcresnet1"])
        self.assertEqual(app.model_arch_badge.cget("text"), "DS-CNN v2")
        app.model_var.set("bcresnet1")
        app.on_model_picked()
        self.assertEqual(app.model_arch_badge.cget("text"), "BC-ResNet-1")
        self.assertIn("출근, 퇴근, 경비, 해제, 무음", app.model_info_var.get())
        self.assertIn("BC-ResNet-1", app.side_detail_var.get())
        self.assertIn("9,001", app.side_detail_var.get())

    def test_live_microphone_with_bc_resnet(self):
        app = self.open_bc()
        app.threshold_var.set(0.5)
        with mock.patch.object(app_module, "MicrophoneStream", FakeMicrophone):
            app.toggle_test()
            self.assertTrue(app.live)
            self.assertEqual(app.test_button.cget("text"), "테스트 중지")
            self.assertTrue(pump(app, lambda: app.result_label.cget("text") == "해제", 20))
            self.assertEqual(app.readout_badge.cget("text"), "인식됨")
            self.assertEqual(str(app.readout.cget("bg")), app_module.SUCCESS_SOFT)
            self.assertTrue(app.bar_canvas.find_all())
            app.toggle_test()
        self.assertFalse(app.live)
        self.assertIn("bcresnet1 · BC-ResNet-1 · onnx", app.model_source_var.get())
        self.messagebox.showerror.assert_not_called()

    def test_wav_recognition_with_both_engines(self):
        app = self.open_bc()
        app.threshold_var.set(0.5)
        wav = sorted((self.root / "data" / "audio" / "경비").glob("*.wav"))[0]
        for engine in ("onnx", "pytorch"):
            with self.subTest(engine=engine):
                app.engine_var.set(engine)
                app.recognize_wav(wav)
                self.assertEqual(app.result_label.cget("text"), "경비")
                self.assertIn(f"BC-ResNet-1 · {engine}", app.model_source_var.get())
        silence = sorted((self.root / "data" / "audio" / SILENCE_LABEL).glob("*.wav"))[0]
        app.recognize_wav(silence)
        self.assertEqual(app.result_label.cget("text"), "대기")
        self.assertEqual(str(app.readout.cget("bg")), app_module.WARN_SOFT)

    def test_folder_evaluation_with_bc_resnet(self):
        app = self.open_bc()
        app.threshold_var.set(0.5)
        with mock.patch.object(practice, "test_dir", return_value=write_heldout_tones()):
            app.evaluate_practice()
            self.assertTrue(app.busy_shown)
            self.assertTrue(pump(app, lambda: not app.evaluating, 60))
        from kws.evaluate import summarize

        summary = summarize(app.eval_items, app.eval_labels, app.eval_silence, 0.5)
        self.assertEqual(summary.total, 10)
        self.assertGreaterEqual(summary.correct, 9, app.eval_report.get("1.0", "end"))
        self.assertIn("혼동표", app.eval_report.get("1.0", "end"))

    def test_microphone_exam_with_bc_resnet(self):
        app = self.open_bc()
        app.exam_repeat_var.set("1")
        app.threshold_var.set(0.5)
        fake = tone("경비", np.random.default_rng(5))
        with mock.patch.object(app_module, "record_block", return_value=fake), mock.patch.object(app_module, "beep"):
            app.start_exam()
            self.assertTrue(pump(app, lambda: not app.evaluating, 60))
        self.messagebox.showerror.assert_not_called()
        self.assertEqual(len(app.eval_items), 6)
        self.assertEqual(app.eval_score.cget("text"), "정확도 17% (1/6)")

    def test_finetune_from_bc_resnet_keeps_arch(self):
        app = self.open_bc()
        app.train_mode_var.set("finetune")
        app.on_train_mode()
        self.assertEqual(app.base_info_var.get(), "기반: bcresnet1")
        self.assertEqual(app.arch_var.get(), BCRESNET1)
        self.assertEqual(app.lr_var.get(), "0.0025")
        self.assertEqual(app.out_name_var.get(), "bcresnet1_speaker")
        self.assertEqual(str(app.arch_cards[DSCNN]["radio"].cget("state")), "disabled")
        self.assertIn("BC-ResNet-1", app.arch_note_var.get())
        app.pick_arch(DSCNN)
        self.assertEqual(app.arch_var.get(), BCRESNET1)

        app.use_synth_var.set(False)
        app.epoch_var.set("2")
        app.int8_var.set(False)
        app.start_train()
        self.assertTrue(pump(app, lambda: not app.training))
        self.messagebox.showerror.assert_not_called()
        meta = read_meta(self.root / "models" / "bcresnet1_speaker")
        self.assertEqual(meta["arch"], BCRESNET1)
        self.assertEqual(meta["learning_rate"], 0.0025)
        self.assertIn("추가 학습 전", app.acc_var.get())
        self.assertEqual(app.model_var.get(), "bcresnet1_speaker")

        app.train_mode_var.set("scratch")
        app.on_train_mode()
        self.assertEqual(app.arch_var.get(), DSCNN)
        self.assertEqual(app.lr_var.get(), "0.002")
        self.assertEqual(app.out_name_var.get(), "latest")
        self.assertEqual(str(app.arch_cards[DSCNN]["radio"].cget("state")), "normal")

    def test_retrain_selected_uses_saved_arch(self):
        app = self.open_bc()
        app.use_synth_var.set(False)
        app.epoch_var.set("2")
        app.int8_var.set(False)
        app.retrain_selected()
        self.assertEqual(app.arch_var.get(), BCRESNET1)
        self.assertEqual(app.out_name_var.get(), "bcresnet1")
        self.assertTrue(app.training)
        self.assertTrue(pump(app, lambda: not app.training))
        self.assertEqual(read_meta(self.root / "models" / "bcresnet1")["arch"], BCRESNET1)
        self.assertEqual(read_meta(self.root / "models" / "latest")["arch"], DSCNN)

    def test_results_table_compares_archs(self):
        app = self.open()
        tree = app.results_tree
        self.assertEqual(list(tree.get_children()), ["latest", "bcresnet1"])
        latest = tree.item("latest", "values")
        bc = tree.item("bcresnet1", "values")
        self.assertEqual((latest[1], latest[2]), ("DS-CNN v2", "17,637"))
        self.assertEqual((bc[1], bc[2]), ("BC-ResNet-1", "9,001"))
        self.assertTrue(bc[3].endswith("%"))
        self.assertTrue(bc[4].endswith("KB"))
        tree.selection_set("bcresnet1")
        app.use_result_row()
        self.assertEqual(app.model_var.get(), "bcresnet1")
        self.assertIn(str(self.root / "models" / "bcresnet1"), app.export_text.get("1.0", "end"))
        self.assertIn("current", tree.item("bcresnet1", "tags"))

    def test_export_bc_resnet_result(self):
        app = self.open_bc()
        app.int8_var.set(False)
        app.export_model()
        self.assertTrue(pump(app, lambda: "ONNX 저장" in app.export_text.get("1.0", "end"), 120))
        text = app.export_text.get("1.0", "end")
        self.assertIn("모델 구조: BC-ResNet-1", text)
        self.assertIn("bcresnet1", text)


if __name__ == "__main__":
    unittest.main()
