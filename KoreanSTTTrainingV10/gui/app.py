"""녹음, 학습, 마이크 테스트, ONNX 내보내기 화면."""

from __future__ import annotations

import os
import queue
import threading
import time
import tkinter as tk
import tkinter.font as tkfont
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from kws.audio import (
    COMMAND_SECONDS,
    GAIN_MAX,
    GAIN_MIN,
    clamp_gain,
    level_message,
    list_input_devices,
    load_audio,
    load_model_wav,
    peak_level,
    record_block,
    resample,
    save_wav,
    MicrophoneStream,
)
from kws.audio import TARGET_SAMPLE_RATE
from kws.archs import ARCHS, DEFAULT_OUT_NAMES, arch_info, arch_title, default_learning_rate, default_out_name
from kws.infer import command_probs, decide, hold_command
from kws import paths as kws_paths
from kws import practice
from kws.project import (
    DEFAULT_COMMANDS,
    FINETUNE_EPOCHS,
    MAX_COMMANDS,
    MIN_CLIPS,
    RECORDING_REPEAT,
    SILENCE_LABEL,
    Project,
    validate_model_name,
)

HELP_DATA = (
    "기본 학습은 Supertonic 2로 만든 남녀 합성 데이터(data/synth)를 씁니다. 합성 데이터 생성으로 미리 만들 수 있고, "
    "없으면 학습할 때 만듭니다. 여기서 녹음하는 내 목소리는 data/audio에 따로 저장되어 추가 학습에 쓰입니다. "
    "삐 소리 뒤에 명령 하나만 말하세요. 한 번은 2초입니다. "
    f"추가 학습에는 명령마다 {MIN_CLIPS}개 이상이면 충분하고, 무음은 조용할 때와 생활 소음이 있을 때 모두 녹음하면 좋습니다."
)
HELP_TRAIN = (
    "처음부터 학습은 고른 구조로 새 모델을 만듭니다(DS-CNN v2는 latest, BC-ResNet-1은 bcresnet1에 저장). "
    "같은 이름의 결과가 있으면 확인한 뒤 바꿉니다. "
    "추가 학습은 위에서 고른 결과의 가중치와 구조를 그대로 이어서, 내 녹음을 합성 데이터와 섞어 짧게 더 학습합니다(speaker, bcresnet1_speaker). "
    "끝나면 출처별 검증 정확도와, 학습에 쓰지 않은 합성 평가 음원·마이크 시험 음성의 점수를 보여 줍니다."
)
HELP_TEST = (
    "위에서 고른 학습 결과로 인식합니다. 결과를 새로 만들려면 학습 탭이나 위의 다시 학습을 쓰세요. "
    "임계값보다 낮거나 무음이면 대기로 표시합니다. "
    "여러 번 말해서 점수를 내려면 평가 탭을 쓰세요."
)
HELP_EVAL = (
    "정답을 아는 음성을 한꺼번에 판정해 명령별 인식률을 냅니다. "
    "마이크 시험은 화면에 나온 말을 삐 소리 뒤에 말하면 바로 채점하고 data/eval에 저장합니다. "
    "폴더 평가는 명령 이름 폴더(출근, 퇴근…)와 다른말·소음·무음 폴더의 WAV를 씁니다. "
    "놓침은 명령을 대기로, 오인식은 다른 명령으로, 오수락은 명령이 아닌 소리를 명령으로 받은 경우입니다. "
    "줄을 고르면 확률을, 두 번 누르면 소리를 들을 수 있습니다."
)
OUTCOME_COLORS = {"정답": "#047857", "놓침": "#b45309", "오인식": "#b91c1c", "오수락": "#b91c1c"}
PAGE = "#f3f5f9"
CARD = "#ffffff"
INK = "#0f172a"
MUTED = "#5b6678"
LINE = "#dfe4ec"
LINE_STRONG = "#c3cbd8"
BLUE = "#4f46e5"
BLUE_DARK = "#3730a3"
BLUE_SOFT = "#eef2ff"
TRACK = "#e8ecf3"
SUCCESS = "#047857"
SUCCESS_SOFT = "#ecfdf5"
WARN = "#b45309"
WARN_SOFT = "#fffbeb"
DANGER = "#b91c1c"
DANGER_SOFT = "#fef2f2"
LOSS = "#ea580c"
SIDEBAR = "#111827"
SIDEBAR_HOVER = "#1f2937"
SIDEBAR_ACTIVE = "#272f45"
SIDEBAR_TEXT = "#d1d5db"
SIDEBAR_MUTED = "#8b95a7"
OTHER_SPEECH = "다른말"
# (탭 이름, Segoe 아이콘 글꼴 코드, 머리말 설명)
PAGES = (
    ("데이터", "", "명령을 정하고 내 목소리와 무음을 녹음합니다."),
    ("학습", "", "모델 구조를 고르고 처음부터 또는 이어서 학습합니다."),
    ("실시간 테스트", "", "마이크나 WAV로 고른 학습 결과를 바로 확인합니다."),
    ("평가", "", "정답을 아는 음성을 한꺼번에 판정해 점수를 냅니다."),
    ("내보내기", "", "저장된 결과를 비교하고 ONNX를 다시 저장합니다."),
)
HELP_EXPORT = (
    "C++ 예제는 cpp 폴더에 있습니다. 기본 파일은 실수형 ONNX입니다. "
    "INT8 파일은 더 작지만, 로그의 일치율을 확인한 뒤에 쓰세요."
)


class App:
    def __init__(self, headless: bool = False) -> None:
        self.root = tk.Tk()
        if headless:
            self.root.withdraw()
        self.root.title("KWS Studio · 한국어 명령어 인식 학습")
        self.root.geometry("1320x940")
        self.root.minsize(1180, 800)
        self.family = configure_fonts(self.root)
        self.icon_family = icon_font_family(self.root)
        apply_theme(self.root, self.family)
        self.font = (self.family, 10)
        self.font_small = (self.family, 9)
        self.project = Project()
        self.queue: queue.Queue = queue.Queue()
        self.stop_record = threading.Event()
        self.stop_train = threading.Event()
        self.recording = False
        self.training = False
        self.live = False
        self.mic: MicrophoneStream | None = None
        self.classifier = None
        self.devices: list[tuple[int | None, str]] = []
        self.file_paths: list[Path] = []
        self.loss_history: list[float] = []
        self.acc_history: list[float] = []
        self.last_probs = None
        self.last_labels: list[str] = []
        self.last_decision = None
        self.highlight_index = -1
        self.silence_label = SILENCE_LABEL
        self.record_buttons: list[ttk.Button] = []
        self.evaluating = False
        self.stop_eval = threading.Event()
        self.eval_items: list = []
        self.eval_skipped = 0
        self.eval_hits = 0
        self.eval_labels: list[str] = []
        self.eval_silence = SILENCE_LABEL
        self.eval_rows: dict[str, int] = {}
        self.eval_selected = -1
        self.exam_folder: Path | None = None
        self.exam_running = False
        self._build()
        self.refresh_devices()
        self.refresh_lists()
        self.refresh_saved_models()
        self.refresh_export_info()
        self._sync_buttons()
        if self._model_dir() is not None:
            self.notebook.select(self.test_tab)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self._poll_job = self.root.after(100, self.poll)

    def _build(self) -> None:
        self._build_sidebar()
        main = tk.Frame(self.root, bg=PAGE)
        main.pack(side="left", fill="both", expand=True)

        self.status_var = tk.StringVar(value="명령을 고르고 녹음하세요.")
        status = tk.Frame(main, bg=CARD, highlightthickness=1, highlightbackground=LINE)
        status.pack(side="bottom", fill="x")
        self.busy = ttk.Progressbar(status, mode="indeterminate", length=120, style="Busy.Horizontal.TProgressbar")
        self.busy_shown = False
        tk.Label(
            status, textvariable=self.status_var, bg=CARD, fg=INK, font=self.font, anchor="w", padx=14, pady=7
        ).pack(side="left", fill="x", expand=True)
        self.status_bar = status

        ready = ttk.Frame(main, style="Card.TFrame", padding=(14, 10))
        ready.pack(fill="x", padx=16, pady=(14, 0))
        mic_row = self._row(ready)
        mic_row.pack(fill="x")
        self._caption(mic_row, text="마이크", style="Field.TLabel", width=9).pack(side="left")
        self.device_var = tk.StringVar()
        self.device_combo = ttk.Combobox(mic_row, textvariable=self.device_var, state="readonly", width=34)
        self.device_combo.pack(side="left", padx=(0, 8))
        ttk.Button(mic_row, text="새로고침", command=self.refresh_devices).pack(side="left")
        ttk.Separator(mic_row, orient="vertical").pack(side="left", fill="y", padx=18, pady=2)
        self._caption(mic_row, text="감도", style="Field.TLabel").pack(side="left", padx=(0, 8))
        self.input_gain = clamp_gain(self.project.input_gain)
        self.gain_var = tk.DoubleVar(value=self.input_gain)
        ttk.Scale(
            mic_row, from_=GAIN_MIN, to=GAIN_MAX, variable=self.gain_var, command=self.on_gain, length=150
        ).pack(side="left")
        self.gain_text = self._caption(mic_row, text=self._gain_text(self.input_gain), width=5)
        self.gain_text.pack(side="left", padx=(8, 12))
        self.level_meter = tk.Canvas(mic_row, width=110, height=8, bg=CARD, highlightthickness=0)
        self.level_meter.pack(side="left")
        self.input_level_var = tk.StringVar(value="입력 -")
        self._caption(mic_row, textvariable=self.input_level_var, style="Muted.TLabel", width=12).pack(
            side="left", padx=(8, 0)
        )

        model_row = self._row(ready)
        model_row.pack(fill="x", pady=(8, 0))
        self._caption(model_row, text="학습 결과", style="Field.TLabel", width=9).pack(side="left")
        self.model_var = tk.StringVar()
        self.model_combo = ttk.Combobox(model_row, textvariable=self.model_var, state="readonly", width=34)
        self.model_combo.pack(side="left", padx=(0, 8))
        self.model_combo.bind("<<ComboboxSelected>>", self.on_model_picked)
        self.saved_models: dict[str, Path] = {}
        ttk.Button(model_row, text="새로고침", command=self.refresh_saved_models).pack(side="left")
        ttk.Button(model_row, text="다른 폴더", command=self.browse_model).pack(side="left", padx=(8, 0))
        ttk.Button(model_row, text="다시 학습", style="Accent.TButton", command=self.retrain_selected).pack(
            side="left", padx=(8, 0)
        )
        self.model_arch_badge = tk.Label(
            model_row, text="", bg=BLUE_SOFT, fg=BLUE_DARK, font=(self.family, 9, "bold"), padx=8, pady=2
        )
        self.model_arch_badge.pack(side="left", padx=(14, 0))
        self.model_info_var = tk.StringVar(value="")
        self._caption(model_row, textvariable=self.model_info_var, style="Muted.TLabel").pack(side="left", padx=(8, 0))

        self.notebook = ttk.Notebook(main, style="Pages.TNotebook")
        self.notebook.pack(fill="both", expand=True, padx=16, pady=(6, 10))
        self._build_data_tab()
        self._build_train_tab()
        self._build_test_tab()
        self._build_eval_tab()
        self._build_export_tab()
        self.notebook.bind("<<NotebookTabChanged>>", lambda _event: self._sync_nav())
        for index in range(len(PAGES)):
            self.root.bind(f"<Control-Key-{index + 1}>", lambda _event, page=index: self.show_page(page))
        self._sync_nav()

    def _build_sidebar(self) -> None:
        bar = tk.Frame(self.root, bg=SIDEBAR, width=216)
        bar.pack(side="left", fill="y")
        bar.pack_propagate(False)
        brand = tk.Frame(bar, bg=SIDEBAR)
        brand.pack(fill="x", padx=20, pady=(22, 20))
        mark = tk.Canvas(brand, width=34, height=34, bg=SIDEBAR, highlightthickness=0)
        mark.create_oval(1, 1, 33, 33, fill=BLUE, outline="")
        for x_pos, half in ((10, 4), (14, 8), (18, 11), (22, 7), (26, 3)):
            mark.create_line(x_pos, 17 - half, x_pos, 17 + half, fill="#ffffff", width=2, capstyle="round")
        mark.pack(side="left")
        names = tk.Frame(brand, bg=SIDEBAR)
        names.pack(side="left", padx=(10, 0))
        tk.Label(names, text="KWS Studio", font=(self.family, 14, "bold"), fg="#ffffff", bg=SIDEBAR).pack(anchor="w")
        tk.Label(names, text="한국어 명령어 인식", font=(self.family, 9), fg=SIDEBAR_MUTED, bg=SIDEBAR).pack(anchor="w")

        tk.Label(bar, text="작업", font=(self.family, 8, "bold"), fg=SIDEBAR_MUTED, bg=SIDEBAR).pack(
            anchor="w", padx=22, pady=(4, 6)
        )
        self.nav_items: list[dict[str, tk.Widget]] = []
        icon_font = (self.icon_family, 12) if self.icon_family else None
        for index, (title, icon, _subtitle) in enumerate(PAGES):
            row = tk.Frame(bar, bg=SIDEBAR, cursor="hand2")
            row.pack(fill="x", padx=10, pady=1)
            marker = tk.Frame(row, bg=SIDEBAR, width=3)
            marker.pack(side="left", fill="y")
            glyph = tk.Label(row, text=icon if icon_font else "•", font=icon_font or (self.family, 12), fg=SIDEBAR_MUTED, bg=SIDEBAR, width=3)
            glyph.pack(side="left", padx=(8, 0), pady=9)
            label = tk.Label(row, text=title, font=(self.family, 10), fg=SIDEBAR_TEXT, bg=SIDEBAR, anchor="w")
            label.pack(side="left", fill="x", expand=True)
            hint = tk.Label(row, text=f"Ctrl+{index + 1}", font=(self.family, 8), fg="#5f6b7f", bg=SIDEBAR)
            hint.pack(side="right", padx=(0, 10))
            item = {"row": row, "marker": marker, "glyph": glyph, "label": label, "hint": hint}
            self.nav_items.append(item)
            for widget in item.values():
                widget.bind("<Button-1>", lambda _event, page=index: self.show_page(page))
                widget.bind("<Enter>", lambda _event, page=index: self._hover_nav(page, True))
                widget.bind("<Leave>", lambda _event, page=index: self._hover_nav(page, False))

        foot = tk.Frame(bar, bg=SIDEBAR_HOVER)
        foot.pack(side="bottom", fill="x", padx=12, pady=14)
        tk.Label(foot, text="인식에 쓰는 결과", font=(self.family, 8, "bold"), fg=SIDEBAR_MUTED, bg=SIDEBAR_HOVER).pack(
            anchor="w", padx=12, pady=(10, 2)
        )
        self.side_model_var = tk.StringVar(value="없음")
        tk.Label(
            foot, textvariable=self.side_model_var, font=(self.family, 11, "bold"), fg="#ffffff", bg=SIDEBAR_HOVER, anchor="w"
        ).pack(fill="x", padx=12)
        self.side_detail_var = tk.StringVar(value="학습하거나 결과 폴더를 고르세요.")
        tk.Label(
            foot,
            textvariable=self.side_detail_var,
            font=(self.family, 9),
            fg=SIDEBAR_TEXT,
            bg=SIDEBAR_HOVER,
            anchor="w",
            justify="left",
            wraplength=170,
        ).pack(fill="x", padx=12, pady=(2, 10))

    def show_page(self, index: int) -> None:
        self.notebook.select(index)

    def _sync_nav(self) -> None:
        try:
            current = self.notebook.index(self.notebook.select())
        except tk.TclError:
            current = -1
        for index, item in enumerate(self.nav_items):
            active = index == current
            background = SIDEBAR_ACTIVE if active else SIDEBAR
            for widget in item.values():
                widget.configure(bg=background)
            item["marker"].configure(bg=BLUE if active else background)
            item["glyph"].configure(fg="#a5b4fc" if active else SIDEBAR_MUTED)
            item["label"].configure(fg="#ffffff" if active else SIDEBAR_TEXT, font=(self.family, 10, "bold" if active else "normal"))

    def _hover_nav(self, index: int, inside: bool) -> None:
        try:
            current = self.notebook.index(self.notebook.select())
        except tk.TclError:
            current = -1
        if index == current:
            return
        background = SIDEBAR_HOVER if inside else SIDEBAR
        item = self.nav_items[index]
        for widget in item.values():
            widget.configure(bg=background)

    def _tab(self, title: str) -> ttk.Frame:
        frame = ttk.Frame(self.notebook, padding=(0, 6, 0, 0))
        self.notebook.add(frame, text=title)
        frame.columnconfigure(0, weight=1)
        return frame

    def _panel(self, parent: tk.Misc, title: str) -> ttk.LabelFrame:
        # 제목은 카드 바깥 위에 두고, 카드는 흰 바탕과 얇은 테두리만 쓴다.
        return ttk.LabelFrame(parent, text=title, padding=(14, 10))

    def _row(self, parent: tk.Misc) -> ttk.Frame:
        return ttk.Frame(parent, style="Inner.TFrame")

    def _caption(self, parent: tk.Misc, **kwargs: object) -> ttk.Label:
        kwargs.setdefault("style", "Inside.TLabel")
        return ttk.Label(parent, **kwargs)

    def _help(self, parent: ttk.Frame, text: str, row: int = 0) -> None:
        """페이지 머리말. 제목과 한 줄 설명, 그 아래 자세한 안내."""
        title = self.notebook.tab(parent, "text")
        subtitle = next((item[2] for item in PAGES if item[0] == title), "")
        head = ttk.Frame(parent)
        head.grid(row=row, column=0, columnspan=2, sticky="ew")
        head.columnconfigure(0, weight=1)
        ttk.Label(head, text=title, style="PageTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(head, text=subtitle, style="PageSub.TLabel").grid(row=1, column=0, sticky="w", pady=(0, 6))
        note = tk.Frame(head, bg=BLUE_SOFT)
        note.grid(row=2, column=0, sticky="ew")
        tk.Frame(note, bg=BLUE, width=3).pack(side="left", fill="y")
        label = tk.Label(
            note, text=text, bg=BLUE_SOFT, fg="#312e81", font=self.font_small, justify="left", anchor="w", padx=12, pady=7
        )
        label.pack(side="left", fill="x", expand=True)
        label.bind("<Configure>", lambda event: event.widget.configure(wraplength=max(200, event.width - 24)))

    def _text(self, parent: tk.Misc, **kwargs: object) -> tk.Text:
        options: dict[str, object] = dict(
            wrap="word",
            font=self.font,
            state="disabled",
            bg="#fbfcfe",
            fg=INK,
            relief="flat",
            borderwidth=0,
            highlightthickness=1,
            highlightbackground=LINE,
            highlightcolor=BLUE,
            padx=10,
            pady=8,
            spacing1=1,
            spacing3=1,
        )
        options.update(kwargs)
        return tk.Text(parent, **options)

    def _canvas(self, parent: tk.Misc, height: int) -> tk.Canvas:
        return tk.Canvas(parent, height=height, bg=CARD, highlightthickness=0)

    def _kpi(self, parent: tk.Misc, column: int, title: str, value: str = "-") -> tk.StringVar:
        tile = tk.Frame(parent, bg="#f8fafc", highlightthickness=1, highlightbackground=LINE)
        tile.grid(row=0, column=column, sticky="ew", padx=(0 if column == 0 else 10, 0))
        parent.columnconfigure(column, weight=1, uniform="kpi")
        tk.Label(tile, text=title, bg="#f8fafc", fg=MUTED, font=self.font_small).pack(anchor="w", padx=12, pady=(8, 0))
        var = tk.StringVar(value=value)
        tk.Label(tile, textvariable=var, bg="#f8fafc", fg=INK, font=(self.family, 16, "bold")).pack(
            anchor="w", padx=12, pady=(0, 8)
        )
        return var

    def _build_data_tab(self) -> None:
        frame = self._tab("데이터")
        frame.columnconfigure(1, weight=1)
        frame.rowconfigure(1, weight=1)
        self._help(frame, HELP_DATA)

        command_frame, self.command_list, command_foot = self._listbox(frame, "명령")
        command_frame.grid(row=1, column=0, sticky="nsew", padx=(0, 8), pady=(8, 0))
        file_frame, self.file_list, _file_foot = self._listbox(frame, "녹음 파일")
        file_frame.grid(row=1, column=1, sticky="nsew", pady=(8, 0))
        self.command_list.bind("<<ListboxSelect>>", self.on_command_select)
        self.count_var = tk.StringVar(value="총 0개")
        self._caption(command_foot, textvariable=self.count_var, style="Strong.TLabel").pack(anchor="w", pady=(6, 0))

        editor = self._panel(frame, "명령 편집")
        editor.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        editor_row = self._row(editor)
        editor_row.pack(fill="x")
        self.command_var = tk.StringVar()
        command_entry = ttk.Entry(editor_row, textvariable=self.command_var, width=24)
        command_entry.pack(side="left")
        command_entry.bind("<Return>", lambda _event: self.add_command())
        ttk.Button(editor_row, text="명령 추가", command=self.add_command).pack(side="left", padx=(8, 0))
        ttk.Button(editor_row, text="명령 삭제", command=self.delete_command).pack(side="left", padx=(8, 0))
        self._caption(editor_row, text=f"최대 {MAX_COMMANDS}개 · 무음은 자동으로 들어갑니다.", style="Muted.TLabel").pack(side="left", padx=(12, 0))

        actions = self._panel(frame, "녹음")
        actions.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        action_row = self._row(actions)
        action_row.pack(fill="x")
        self._caption(action_row, text="횟수").pack(side="left")
        self.repeat_var = tk.StringVar(value="5")
        ttk.Spinbox(action_row, from_=1, to=30, textvariable=self.repeat_var, width=5).pack(side="left", padx=(6, 12))
        self.record_button = ttk.Button(action_row, text="명령 녹음", style="Accent.TButton", command=self.record_command)
        self.silence_button = ttk.Button(action_row, text="무음 녹음", style="Accent.TButton", command=self.record_silence)
        self.stop_record_button = ttk.Button(action_row, text="녹음 중지", style="Stop.TButton", command=self.request_stop_record)
        self.import_button = ttk.Button(action_row, text="WAV 가져오기", command=self.import_wavs)
        for button in (self.record_button, self.silence_button, self.import_button):
            button.pack(side="left", padx=(0, 8))
            self.record_buttons.append(button)
        self.stop_record_button.pack(side="left")
        self.record_status_var = tk.StringVar(value="")
        self._caption(actions, textvariable=self.record_status_var, style="Muted.TLabel", wraplength=980).pack(fill="x", pady=(6, 0))

        files = self._panel(frame, "파일")
        files.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        file_row = self._row(files)
        file_row.pack(fill="x")
        ttk.Button(file_row, text="듣기", command=self.play_selected).pack(side="left")
        ttk.Button(file_row, text="파일 삭제", command=self.delete_file).pack(side="left", padx=(8, 0))
        ttk.Button(file_row, text="데이터 폴더", command=lambda: open_folder(self.project.audio)).pack(side="left", padx=(8, 0))
        ttk.Button(file_row, text="기본 명령 복원", command=self.reset_commands).pack(side="left", padx=(8, 0))
        self.practice_button = ttk.Button(file_row, text="합성 데이터 생성", style="Accent.TButton", command=self.load_practice_audio)
        self.practice_button.pack(side="left", padx=(8, 0))

    def _build_train_tab(self) -> None:
        frame = self._tab("학습")
        frame.columnconfigure(0, weight=5, uniform="train")
        frame.columnconfigure(1, weight=6, uniform="train")
        frame.rowconfigure(1, weight=1)
        self.train_tab = frame
        self._help(frame, HELP_TRAIN)
        left = ttk.Frame(frame)
        left.grid(row=1, column=0, sticky="nsew", padx=(0, 8))
        left.columnconfigure(0, weight=1)

        arch = self._panel(left, "모델 구조")
        arch.grid(row=0, column=0, sticky="ew", pady=(10, 0))
        arch_row = self._row(arch)
        arch_row.pack(fill="x")
        initial_arch = self.project.arch if self.project.arch in ARCHS else next(iter(ARCHS))
        self.arch_var = tk.StringVar(value=initial_arch)
        self.arch_cards: dict[str, dict[str, tk.Widget]] = {}
        for column, info in enumerate(ARCHS.values()):
            card = tk.Frame(arch_row, bg=CARD, highlightthickness=2, highlightbackground=LINE, cursor="hand2")
            card.grid(row=column, column=0, sticky="ew", pady=(0 if column == 0 else 8, 0))
            arch_row.columnconfigure(0, weight=1)
            top = tk.Frame(card, bg=CARD)
            top.pack(fill="x", padx=12, pady=(8, 0))
            radio = ttk.Radiobutton(
                top, text=info.title, variable=self.arch_var, value=info.name, command=self.on_arch, style="Arch.TRadiobutton"
            )
            radio.pack(side="left")
            params = tk.Label(top, text="", bg=BLUE_SOFT, fg=BLUE_DARK, font=(self.family, 9, "bold"), padx=8, pady=1)
            params.pack(side="right")
            summary = tk.Label(
                card, text=info.summary, bg=CARD, fg=MUTED, font=self.font_small, justify="left", anchor="w", wraplength=380
            )
            summary.pack(fill="x", padx=14, pady=(2, 0))
            facts = tk.Label(card, text="", bg=CARD, fg=INK, font=self.font_small, anchor="w")
            facts.pack(fill="x", padx=14, pady=(2, 8))
            summary.bind("<Configure>", lambda event: event.widget.configure(wraplength=max(200, event.width - 4)))
            parts = {"card": card, "top": top, "radio": radio, "params": params, "summary": summary, "facts": facts}
            self.arch_cards[info.name] = parts
            for widget in (card, top, summary, facts, params):
                widget.bind("<Button-1>", lambda _event, name=info.name: self.pick_arch(name))
        self.arch_note_var = tk.StringVar(value="")
        note = self._caption(arch, textvariable=self.arch_note_var, foreground=BLUE_DARK, justify="left")
        self.arch_note = note
        note.bind("<Configure>", lambda event: event.widget.configure(wraplength=max(200, event.width - 4)))

        data = self._panel(left, "데이터와 방식")
        data.grid(row=1, column=0, sticky="ew", pady=(10, 0))
        data_row = self._row(data)
        data_row.pack(fill="x")
        self.use_synth_var = tk.BooleanVar(value=True)
        self.use_synth_check = ttk.Checkbutton(data_row, text="합성 데이터", variable=self.use_synth_var)
        self.use_synth_check.pack(side="left", padx=(0, 12))
        self.use_rec_var = tk.BooleanVar(value=True)
        self.use_rec_check = ttk.Checkbutton(data_row, text="내 녹음", variable=self.use_rec_var)
        self.use_rec_check.pack(side="left")
        self._caption(data_row, text="반복", style="Muted.TLabel").pack(side="left", padx=(14, 0))
        self.rec_repeat_var = tk.StringVar(value=str(RECORDING_REPEAT))
        ttk.Spinbox(data_row, from_=1, to=10, textvariable=self.rec_repeat_var, width=3).pack(side="left", padx=4)
        self._caption(data_row, text="번/에폭", style="Muted.TLabel").pack(side="left")

        mode = data
        ttk.Separator(mode, orient="horizontal").pack(fill="x", pady=8)
        mode_row = self._row(mode)
        mode_row.pack(fill="x")
        self.train_mode_var = tk.StringVar(value="scratch")
        ttk.Radiobutton(
            mode_row, text="처음부터 학습", variable=self.train_mode_var, value="scratch", command=self.on_train_mode
        ).pack(side="left", padx=(0, 12))
        ttk.Radiobutton(
            mode_row, text="추가 학습", variable=self.train_mode_var, value="finetune", command=self.on_train_mode
        ).pack(side="left", padx=(0, 12))
        self.base_info_var = tk.StringVar(value="")
        self._caption(mode_row, textvariable=self.base_info_var, style="Muted.TLabel").pack(side="left")
        name_row = self._row(mode)
        name_row.pack(fill="x", pady=(6, 0))
        self._caption(name_row, text="저장 이름").pack(side="left")
        self.out_name_var = tk.StringVar(value=default_out_name(initial_arch))
        ttk.Entry(name_row, textvariable=self.out_name_var, width=20).pack(side="left", padx=(6, 0))
        self._caption(name_row, text="models 아래", style="Muted.TLabel").pack(side="left", padx=(8, 0))

        options = self._panel(left, "학습 실행")
        options.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        option_row = self._row(options)
        option_row.pack(fill="x")
        self._caption(option_row, text="에폭").pack(side="left")
        self.epoch_var = tk.StringVar(value=str(self.project.epochs))
        ttk.Spinbox(option_row, from_=1, to=200, textvariable=self.epoch_var, width=6).pack(side="left", padx=(6, 14))
        self._caption(option_row, text="배치").pack(side="left")
        self.batch_var = tk.StringVar(value=str(self.project.batch_size))
        ttk.Spinbox(option_row, from_=1, to=64, textvariable=self.batch_var, width=6).pack(side="left", padx=(6, 14))
        self._caption(option_row, text="학습률").pack(side="left")
        learning_rate = self.project.learning_rate if initial_arch == self.project.arch else default_learning_rate(initial_arch)
        self.lr_var = tk.StringVar(value=str(learning_rate))
        ttk.Entry(option_row, textvariable=self.lr_var, width=9).pack(side="left", padx=(6, 14))
        run_row = self._row(options)
        run_row.pack(fill="x", pady=(8, 0))
        self.train_button = ttk.Button(run_row, text="학습 시작", style="Accent.TButton", command=self.start_train)
        self.train_button.pack(side="left", fill="x", expand=True, padx=(0, 8))
        self.stop_train_button = ttk.Button(run_row, text="학습 중지", style="Stop.TButton", command=self.request_stop_train)
        self.stop_train_button.pack(side="left")

        result = self._panel(frame, "학습 결과")
        result.grid(row=1, column=1, sticky="nsew", pady=(10, 0), padx=(8, 0))
        result.columnconfigure(0, weight=1)
        result.rowconfigure(4, weight=3)
        result.rowconfigure(5, weight=2)
        tiles = self._row(result)
        tiles.grid(row=0, column=0, sticky="ew")
        self.kpi_accuracy = self._kpi(tiles, 0, "검증 정확도")
        self.kpi_epoch = self._kpi(tiles, 1, "에폭")
        self.kpi_params = self._kpi(tiles, 2, "파라미터")
        self.kpi_elapsed = self._kpi(tiles, 3, "걸린 시간")
        self.acc_var = tk.StringVar(value="아직 학습하지 않았습니다.")
        self._caption(result, textvariable=self.acc_var, style="Strong.TLabel").grid(row=1, column=0, sticky="w", pady=(10, 0))
        self.check_var = tk.StringVar(value="")
        check = self._caption(result, textvariable=self.check_var, foreground=BLUE_DARK, justify="left")
        check.grid(row=2, column=0, sticky="ew", pady=(2, 6))
        check.bind("<Configure>", lambda event: event.widget.configure(wraplength=max(200, event.width - 4)))
        self.progress = ttk.Progressbar(result, maximum=100)
        self.progress.grid(row=3, column=0, sticky="ew")
        self.chart = self._canvas(result, 150)
        self.chart.grid(row=4, column=0, sticky="nsew", pady=(10, 0))
        self.chart.bind("<Configure>", lambda _event: self.draw_chart())
        self.log = self._text(result, height=6, font=("Consolas", 9))
        self.log.grid(row=5, column=0, sticky="nsew", pady=(10, 0))
        self.train_started = 0.0
        self._sync_arch_cards()

    def _build_test_tab(self) -> None:
        frame = self._tab("실시간 테스트")
        frame.rowconfigure(2, weight=1)
        self.test_tab = frame
        self._help(frame, HELP_TEST)

        controls = self._panel(frame, "인식")
        controls.grid(row=1, column=0, sticky="ew", pady=(10, 0))
        control_row = self._row(controls)
        control_row.pack(fill="x")
        self.test_button = ttk.Button(control_row, text="마이크 테스트 시작", style="Accent.TButton", command=self.toggle_test)
        self.test_button.pack(side="left")
        self.file_test_button = ttk.Button(control_row, text="WAV 인식", command=self.recognize_wav_dialog)
        self.file_test_button.pack(side="left", padx=(8, 0))
        self.live_exam_button = ttk.Button(control_row, text="마이크 정확도 시험", command=lambda: self.start_exam())
        self.live_exam_button.pack(side="left", padx=(8, 0))
        self._caption(control_row, text="엔진", style="Field.TLabel").pack(side="left", padx=(22, 4))
        self.engine_var = tk.StringVar(value="onnx")
        ttk.Radiobutton(control_row, text="ONNX", variable=self.engine_var, value="onnx").pack(side="left", padx=(4, 0))
        ttk.Radiobutton(control_row, text="PyTorch", variable=self.engine_var, value="pytorch").pack(side="left", padx=(8, 0))
        self._caption(control_row, text="임계값", style="Field.TLabel").pack(side="left", padx=(22, 4))
        self.threshold_var = tk.DoubleVar(value=self.project.threshold)
        ttk.Scale(
            control_row, from_=0.40, to=0.95, variable=self.threshold_var, command=self.on_threshold, length=150
        ).pack(side="left", padx=6)
        self.threshold_text = self._caption(control_row, text=f"{self.project.threshold:.2f}")
        self.threshold_text.pack(side="left")
        file_row = self._row(controls)
        file_row.pack(fill="x", pady=(8, 0))
        self.engine_status = self._caption(file_row, text="", style="Muted.TLabel")
        self.engine_status.pack(side="left")
        self.model_source_var = tk.StringVar(value="")
        self._caption(file_row, textvariable=self.model_source_var, style="Muted.TLabel").pack(side="left", padx=(12, 0))

        result = self._panel(frame, "인식 결과")
        result.grid(row=2, column=0, sticky="nsew", pady=(10, 0))
        result.columnconfigure(0, weight=2, uniform="result")
        result.columnconfigure(1, weight=3, uniform="result")
        result.rowconfigure(0, weight=1)
        self.readout = tk.Frame(result, bg="#f1f5f9", highlightthickness=0)
        self.readout.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        self.readout_badge = tk.Label(
            self.readout, text="대기 중", bg="#f1f5f9", fg=MUTED, font=(self.family, 9, "bold"), pady=2
        )
        self.readout_badge.pack(pady=(18, 0))
        self.result_label = tk.Label(self.readout, text="대기", font=(self.family, 40, "bold"), fg=MUTED, bg="#f1f5f9")
        self.result_label.pack(fill="both", expand=True)
        self.detail_var = tk.StringVar(value="학습 결과를 고른 뒤 마이크나 WAV로 인식합니다.")
        self.detail_label = tk.Label(
            self.readout, textvariable=self.detail_var, bg="#f1f5f9", fg=MUTED, font=self.font, wraplength=320, justify="center"
        )
        self.detail_label.pack(fill="x", padx=12, pady=(0, 18))
        self.bar_canvas = self._canvas(result, 170)
        self.bar_canvas.grid(row=0, column=1, sticky="nsew")
        self.bar_canvas.bind("<Configure>", lambda _event: self.draw_bars())
        self.file_log = self._text(result, height=4)
        self.file_log.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(12, 0))

    def _build_eval_tab(self) -> None:
        frame = self._tab("평가")
        frame.rowconfigure(3, weight=1)
        self.eval_tab = frame
        self._help(frame, HELP_EVAL)

        actions = self._panel(frame, "평가 실행")
        actions.grid(row=1, column=0, sticky="ew", pady=(8, 0))
        mic_row = self._row(actions)
        mic_row.pack(fill="x")
        self.exam_button = ttk.Button(mic_row, text="마이크 시험", style="Accent.TButton", command=self.start_exam)
        self.exam_button.pack(side="left")
        self._caption(mic_row, text="명령마다").pack(side="left", padx=(12, 0))
        self.exam_repeat_var = tk.StringVar(value="3")
        ttk.Spinbox(mic_row, from_=1, to=10, textvariable=self.exam_repeat_var, width=4).pack(side="left", padx=6)
        self._caption(mic_row, text="번").pack(side="left", padx=(0, 12))
        self.stop_eval_button = ttk.Button(mic_row, text="중지", style="Stop.TButton", command=self.request_stop_eval)
        self.stop_eval_button.pack(side="left")
        file_row = self._row(actions)
        file_row.pack(fill="x", pady=(8, 0))
        self.folder_eval_button = ttk.Button(file_row, text="폴더 평가", style="Accent.TButton", command=self.evaluate_folder_dialog)
        self.folder_eval_button.pack(side="left")
        self.batch_test_button = ttk.Button(
            file_row, text="합성 평가 음원", style="Accent.TButton", command=self.evaluate_practice
        )
        self.batch_test_button.pack(side="left", padx=(8, 0))
        self.csv_button = ttk.Button(file_row, text="CSV 저장", command=self.save_eval_csv)
        self.csv_button.pack(side="left", padx=(16, 0))
        ttk.Button(file_row, text="평가 폴더", command=lambda: open_folder(self.project.data / "eval")).pack(side="left", padx=(8, 0))
        self.to_train_button = ttk.Button(file_row, text="학습 데이터로 저장", command=self.save_eval_as_training)
        self.to_train_button.pack(side="left", padx=(8, 0))

        view = self._panel(frame, "점수")
        view.grid(row=2, column=0, sticky="ew", pady=(8, 0))
        view_row = self._row(view)
        view_row.pack(fill="x")
        self.exam_prompt = tk.Label(
            view_row, text="", font=(self.family, 18, "bold"), fg=INK, bg="#f8fafc",
            highlightthickness=1, highlightbackground=LINE, width=22, anchor="w", padx=12, pady=8,
        )
        self.exam_prompt.pack(side="left")
        self.eval_score = tk.Label(
            view_row, text="정확도 -", font=(self.family, 15, "bold"), fg=BLUE_DARK, bg=BLUE_SOFT,
            highlightthickness=0, width=17, padx=10, pady=10,
        )
        self.eval_score.pack(side="left", padx=(8, 0))
        self._caption(view_row, text="임계값").pack(side="left", padx=(16, 0))
        ttk.Scale(view_row, from_=0.40, to=0.95, variable=self.threshold_var, command=self.on_threshold, length=160).pack(
            side="left", padx=6
        )
        self.eval_threshold_text = self._caption(view_row, text=f"{self.project.threshold:.2f}")
        self.eval_threshold_text.pack(side="left")
        self.wrong_only_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(view_row, text="틀린 것만", variable=self.wrong_only_var, command=self.refresh_eval_view).pack(
            side="left", padx=(16, 0)
        )

        panes = ttk.PanedWindow(frame, orient="horizontal")
        panes.grid(row=3, column=0, sticky="nsew", pady=(8, 0))
        table = self._panel(panes, "판정 목록")
        columns = ("outcome", "expected", "recognized", "confidence", "file")
        self.eval_tree = ttk.Treeview(table, columns=columns, show="headings", selectmode="browse")
        for column, title, width in (
            ("outcome", "결과", 70),
            ("expected", "정답", 80),
            ("recognized", "인식", 80),
            ("confidence", "최대 확률", 80),
            ("file", "파일", 260),
        ):
            self.eval_tree.heading(column, text=title)
            self.eval_tree.column(column, width=width, stretch=column == "file", anchor="w" if column == "file" else "center")
        for name, color in OUTCOME_COLORS.items():
            self.eval_tree.tag_configure(name, foreground=color)
        self.eval_tree.tag_configure("odd", background="#f8fafc")
        tree_scroll = ttk.Scrollbar(table, command=self.eval_tree.yview)
        self.eval_tree.configure(yscrollcommand=tree_scroll.set)
        self.eval_tree.pack(side="left", fill="both", expand=True)
        tree_scroll.pack(side="right", fill="y")
        self.eval_tree.bind("<<TreeviewSelect>>", self.on_eval_select)
        self.eval_tree.bind("<Double-1>", lambda _event: self.play_eval_selected())
        panes.add(table, weight=3)
        report = self._panel(panes, "요약")
        self.eval_report = self._text(report, width=42, wrap="none", font=("Consolas", 9))
        self.eval_report.pack(fill="both", expand=True)
        panes.add(report, weight=2)

        bottom = self._panel(frame, "선택 항목")
        bottom.grid(row=4, column=0, sticky="ew", pady=(8, 0))
        bottom.columnconfigure(0, weight=1)
        self.eval_bars = self._canvas(bottom, 128)
        self.eval_bars.grid(row=0, column=0, sticky="ew")
        self.eval_bars.bind("<Configure>", lambda _event: self.draw_eval_bars())
        ttk.Button(bottom, text="듣기", command=self.play_eval_selected).grid(row=0, column=1, sticky="n", padx=(8, 0))

    def _build_export_tab(self) -> None:
        frame = self._tab("내보내기")
        frame.rowconfigure(1, weight=1)
        frame.rowconfigure(3, weight=1)
        self._help(frame, HELP_EXPORT)

        compare = self._panel(frame, "저장된 학습 결과")
        compare.grid(row=1, column=0, sticky="nsew", pady=(10, 0))
        columns = ("name", "arch", "params", "accuracy", "onnx", "created")
        self.results_tree = ttk.Treeview(compare, columns=columns, show="headings", selectmode="browse", height=5)
        for column, title, width, anchor in (
            ("name", "이름", 150, "w"),
            ("arch", "구조", 120, "center"),
            ("params", "파라미터", 90, "e"),
            ("accuracy", "검증 정확도", 100, "e"),
            ("onnx", "ONNX", 90, "e"),
            ("created", "만든 시각", 170, "center"),
        ):
            self.results_tree.heading(column, text=title)
            self.results_tree.column(column, width=width, anchor=anchor, stretch=column in ("name", "created"))
        self.results_tree.tag_configure("odd", background="#f8fafc")
        self.results_tree.tag_configure("current", foreground=BLUE_DARK, font=(self.family, 10, "bold"))
        self.results_tree.pack(fill="both", expand=True)
        self.results_tree.bind("<Double-1>", lambda _event: self.use_result_row())
        compare_row = self._row(compare)
        compare_row.pack(fill="x", pady=(8, 0))
        ttk.Button(compare_row, text="이 결과로 인식", command=self.use_result_row).pack(side="left")
        self._caption(compare_row, text="두 번 눌러도 고를 수 있습니다.", style="Muted.TLabel").pack(side="left", padx=(10, 0))

        actions = self._panel(frame, "저장")
        actions.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        action_row = self._row(actions)
        action_row.pack(fill="x")
        self.export_button = ttk.Button(action_row, text="ONNX 다시 저장", style="Accent.TButton", command=self.export_model)
        self.export_button.pack(side="left")
        self.int8_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(action_row, text="INT8도 저장", variable=self.int8_var).pack(side="left", padx=(12, 0))
        ttk.Button(action_row, text="모델 폴더 열기", command=self.open_selected_model).pack(side="left", padx=(12, 0))
        log = self._panel(frame, "로그")
        log.grid(row=3, column=0, sticky="nsew", pady=(10, 0))
        log.columnconfigure(0, weight=1)
        log.rowconfigure(0, weight=1)
        self.export_text = self._text(log, font=("Consolas", 9))
        self.export_text.grid(row=0, column=0, sticky="nsew")

    def _listbox(self, parent: tk.Misc, title: str) -> tuple[ttk.LabelFrame, tk.Listbox, ttk.Frame]:
        holder = self._panel(parent, title)
        footer = self._row(holder)
        footer.pack(side="bottom", fill="x")
        body = self._row(holder)
        body.pack(side="top", fill="both", expand=True)
        widget = tk.Listbox(
            body,
            font=self.font,
            activestyle="none",
            exportselection=False,
            bg=CARD,
            fg=INK,
            selectbackground="#dbeafe",
            selectforeground=BLUE_DARK,
            relief="flat",
            borderwidth=0,
            highlightthickness=1,
            highlightbackground=LINE,
            highlightcolor=BLUE,
        )
        scroll = ttk.Scrollbar(body, command=widget.yview)
        widget.configure(yscrollcommand=scroll.set)
        widget.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        return holder, widget, footer

    def refresh_devices(self) -> None:
        current = self.device_var.get()
        self.devices = [(None, "기본 장치")]
        self.devices.extend(list_input_devices())
        names = [name for _, name in self.devices]
        self.device_combo["values"] = names
        if current in names:
            self.device_var.set(current)
        elif self.project.input_device in names:
            self.device_var.set(self.project.input_device)
        elif names:
            self.device_var.set(names[0])

    def current_device_index(self) -> int | None:
        name = self.device_var.get()
        for index, device_name in self.devices:
            if device_name == name:
                return index
        return None

    def selected_label(self) -> str | None:
        selected = self.command_list.curselection()
        labels = self.project.labels()
        if not selected or not labels:
            return None
        index = int(selected[0])
        if index < 0 or index >= len(labels):
            return None
        return labels[index]

    def on_command_select(self, _event=None) -> None:
        self.refresh_files()

    def refresh_lists(self, keep_label: str | None = None) -> None:
        if keep_label is None:
            keep_label = self.selected_label()
        labels = self.project.labels()
        self.command_list.delete(0, "end")
        for label in labels:
            count = self.project.count(label)
            synth = practice.synth_count(label)
            self.command_list.insert("end", f"{label}    내 녹음 {count}개 · 합성 {synth}개")
            color = "#b45309" if count + synth < MIN_CLIPS else "#0f7b3a"
            self.command_list.itemconfig("end", foreground=color)
        if labels:
            index = labels.index(keep_label) if keep_label in labels else 0
            self.command_list.selection_clear(0, "end")
            self.command_list.selection_set(index)
            self.command_list.activate(index)
        self.refresh_files()
        total = sum(self.project.count(label) for label in labels)
        synth_total = sum(practice.synth_count(label) for label in labels)
        self.count_var.set(f"내 녹음 {total}개 · 합성 {synth_total}개")
        self.use_synth_check.configure(text=f"합성 데이터 ({synth_total}개)")
        self.use_rec_check.configure(text=f"내 녹음 ({total}개)")

    def refresh_files(self) -> None:
        self.file_list.delete(0, "end")
        self.file_paths = []
        label = self.selected_label()
        if label is None:
            return
        for path in self.project.list_wavs(label):
            self.file_paths.append(path)
            self.file_list.insert("end", path.name)

    def add_command(self) -> None:
        try:
            name = self.project.add_command(self.command_var.get())
        except ValueError as exc:
            messagebox.showinfo("안내", str(exc))
            return
        self.command_var.set("")
        self.refresh_lists(keep_label=name)
        self.notify(f"{name} 명령을 추가했습니다.")

    def delete_command(self) -> None:
        label = self.selected_label()
        if label is None:
            return
        if label == SILENCE_LABEL:
            messagebox.showinfo("안내", "무음 클래스는 지울 수 없습니다. 녹음 파일만 지울 수 있습니다.")
            return
        count = self.project.count(label)
        if count and not messagebox.askyesno("삭제", f"{label} 녹음 {count}개를 함께 지울까요?"):
            return
        try:
            self.project.remove_command(label)
        except ValueError as exc:
            messagebox.showinfo("안내", str(exc))
            return
        self.refresh_lists()

    def reset_commands(self) -> None:
        if any(self.project.count(name) for name in self.project.commands):
            messagebox.showinfo("안내", "녹음이 있는 명령이 있으면 기본값으로 되돌릴 수 없습니다.")
            return
        self.project.commands = list(DEFAULT_COMMANDS)
        self.project.save()
        for label in self.project.labels():
            (self.project.audio / label).mkdir(parents=True, exist_ok=True)
        self.refresh_lists(self.project.commands[0])

    def delete_file(self) -> None:
        selected = self.file_list.curselection()
        if not selected:
            return
        path = self.file_paths[int(selected[0])]
        if not messagebox.askyesno("삭제", f"{path.name} 파일을 지울까요?"):
            return
        path.unlink(missing_ok=True)
        self.refresh_lists()

    def play_selected(self) -> None:
        selected = self.file_list.curselection()
        if not selected:
            self.notify("들을 파일을 선택하세요.")
            return
        play_wav(self.file_paths[int(selected[0])])

    def record_command(self) -> None:
        label = self.selected_label()
        if label is None:
            messagebox.showinfo("안내", "녹음할 명령을 선택하세요.")
            return
        if label == SILENCE_LABEL:
            self.record_silence()
            return
        self._start_record(label, "지금 말하세요")

    def record_silence(self) -> None:
        self._start_record(SILENCE_LABEL, "녹음 중. 말하지 마세요")

    def _start_record(self, label: str, prompt: str) -> None:
        if self.recording or self.training or self.live:
            return
        try:
            count = int(self.repeat_var.get())
        except ValueError:
            messagebox.showerror("입력", "녹음 횟수를 숫자로 입력하세요.")
            return
        if not 1 <= count <= 30:
            messagebox.showerror("입력", "녹음 횟수는 1에서 30 사이여야 합니다.")
            return
        self.capture_settings()
        self.recording = True
        self.stop_record.clear()
        self._sync_buttons()
        device = self.current_device_index()
        threading.Thread(
            target=self._record_worker,
            args=(label, count, prompt, device),
            daemon=True,
        ).start()

    def _record_worker(self, label: str, count: int, prompt: str, device: int | None) -> None:
        saved = 0
        try:
            for index in range(count):
                if self.stop_record.is_set():
                    break
                self.queue.put(("status", f"준비 ({index + 1}/{count}) {label}"))
                if not self._wait(0.55):
                    break
                self.queue.put(("status", f"{prompt} ({index + 1}/{count}) {label}"))
                if not self._wait(0.15):
                    break
                beep()
                wav = record_block(COMMAND_SECONDS, device, gain=self.input_gain)
                path = self.project.new_wav_path(label)
                save_wav(path, wav, TARGET_SAMPLE_RATE)
                saved += 1
                self.queue.put(("clip", (label, str(path), peak_level(wav))))
            self.queue.put(("status", f"{label} 녹음 {saved}개를 저장했습니다."))
        except Exception as exc:
            self.queue.put(("record_error", str(exc)))
        finally:
            self.queue.put(("record_done", None))

    def request_stop_record(self) -> None:
        self.stop_record.set()

    def import_wavs(self) -> None:
        label = self.selected_label()
        if label is None:
            messagebox.showinfo("안내", "파일을 넣을 명령을 선택하세요.")
            return
        if self.recording or self.training or self.live:
            return
        selected = filedialog.askopenfilenames(title="WAV 파일", filetypes=[("WAV", "*.wav"), ("모든 파일", "*.*")])
        if not selected:
            return
        self.recording = True
        self.stop_record.clear()
        self._sync_buttons()
        threading.Thread(target=self._import_worker, args=(label, selected), daemon=True).start()

    def _import_worker(self, label: str, selected: tuple[str, ...]) -> None:
        saved = 0
        skipped = 0
        try:
            for raw_path in selected:
                if self.stop_record.is_set():
                    break
                path = Path(raw_path)
                try:
                    wav, sample_rate = load_audio(path)
                except Exception:
                    skipped += 1
                    continue
                if wav.size < int(0.3 * sample_rate):
                    skipped += 1
                    continue
                wav = resample(wav, sample_rate, TARGET_SAMPLE_RATE)
                save_wav(self.project.new_wav_path(label), wav, TARGET_SAMPLE_RATE)
                saved += 1
                self.queue.put(("clip", (label, "", 0.0)))
            self.queue.put(("status", f"가져오기 {saved}개 완료, {skipped}개 건너뜀"))
        except Exception as exc:
            self.queue.put(("record_error", str(exc)))
        finally:
            self.queue.put(("record_done", None))

    def retrain_selected(self) -> None:
        """고른 학습 결과가 있어도 그 이름으로 처음부터 다시 학습한다."""
        selected = self.model_var.get().strip()
        if self.train_mode_var.get() != "scratch":
            self.train_mode_var.set("scratch")
            self.on_train_mode()
        model_dir = self._model_dir()
        if model_dir is not None:
            from kws.train import saved_arch

            arch = saved_arch(model_dir)
            if arch is not None and arch != self.arch_var.get():
                self.pick_arch(arch)
        if selected:
            self.out_name_var.set(selected)
        self.notebook.select(self.train_tab)
        self.start_train()

    def start_train(self) -> None:
        if self.recording or self.evaluating:
            messagebox.showinfo("안내", "녹음이나 평가가 끝난 뒤에 학습할 수 있습니다.")
            return
        if self.training:
            return
        if self.live:
            self.stop_test()
        try:
            epochs = int(self.epoch_var.get())
            batch_size = int(self.batch_var.get())
            learning_rate = float(self.lr_var.get())
            repeat = int(self.rec_repeat_var.get())
        except ValueError:
            messagebox.showerror("입력", "에폭, 배치, 학습률, 반복 횟수를 숫자로 입력하세요.")
            return
        try:
            out_name = validate_model_name(self.out_name_var.get())
        except ValueError as exc:
            messagebox.showerror("입력", str(exc))
            return
        labels = self.project.labels()
        use_synth = bool(self.use_synth_var.get())
        use_rec = bool(self.use_rec_var.get())
        if not use_synth and not use_rec:
            messagebox.showinfo("안내", "학습 데이터를 하나 이상 고르세요.")
            return
        finetune = self.train_mode_var.get() == "finetune"
        base_dir = None
        if finetune:
            base_dir = self._model_dir()
            problem = self._finetune_problem(base_dir, labels)
            if problem:
                messagebox.showinfo("추가 학습", problem)
                return
            if not use_rec or sum(self.project.count(label) for label in labels) == 0:
                messagebox.showinfo("추가 학습", "추가 학습에는 내 녹음이 필요합니다. 데이터 탭에서 녹음하고 내 녹음을 켜세요.")
                return

        generate = False
        missing = practice.missing_synth(labels) if use_synth else []
        if missing:
            question = (
                f"합성 데이터가 없는 클래스가 있습니다: {', '.join(missing)}\n"
                "Supertonic 2로 남녀 목소리를 같은 수만큼 만든 뒤 이어서 학습할까요? 음성 합성이라 꽤 걸립니다."
            )
            if not messagebox.askyesno("합성 데이터", question):
                return
            generate = True

        def available(label: str) -> int:
            from kws.synth_eval import command_train_clips

            synth = (command_train_clips() if generate else practice.synth_count(label)) if use_synth else 0
            return synth + (self.project.count(label) if use_rec else 0)

        short = [f"{label} {available(label)}개" for label in labels if available(label) < MIN_CLIPS]
        if short:
            messagebox.showinfo(
                "데이터가 더 필요합니다",
                f"클래스마다 최소 {MIN_CLIPS}개입니다.\n" + "\n".join(short) + "\n\n합성 데이터를 켜거나 데이터 탭에서 녹음하세요.",
            )
            return
        out_dir = self.project.root / "models" / out_name
        if kws_paths.is_saved_model(out_dir):
            if not messagebox.askyesno(
                "다시 학습",
                f"이미 '{out_name}' 학습 결과가 있습니다.\n새 학습으로 이 결과를 바꿀까요?",
            ):
                return
        self._release_loaded_model()
        self.capture_settings()
        from kws.train import TrainOptions

        options = TrainOptions(
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            patience=15,
            make_int8=bool(self.int8_var.get()),
            init_from=base_dir,
            arch=self.arch_var.get(),
        )
        commands = list(self.project.commands) if generate else None
        self.training = True
        self.stop_train.clear()
        self.loss_history = []
        self.acc_history = []
        self.progress["value"] = 0
        self._set_text(self.log, "")
        self.acc_var.set(f"{arch_title(self.arch_var.get())} 학습 중입니다.")
        self.check_var.set("")
        self.train_started = time.time()
        self.kpi_accuracy.set("-")
        self.kpi_epoch.set(f"0 / {epochs}")
        self.kpi_params.set(f"{arch_info(self.arch_var.get()).parameter_count(len(labels)):,}")
        self.kpi_elapsed.set("0초")
        self.draw_chart()
        self._sync_buttons()
        self.notebook.select(self.train_tab)
        threading.Thread(
            target=self._train_worker,
            args=(options, labels, out_dir, use_synth, use_rec, repeat, commands, float(self.threshold_var.get())),
            daemon=True,
        ).start()

    def _train_worker(
        self,
        options,
        labels: list[str],
        out_dir: Path,
        use_synth: bool,
        use_rec: bool,
        repeat: int,
        generate_commands: list[str] | None,
        threshold: float,
    ) -> None:
        def log(text: str) -> None:
            self.queue.put(("train_event", {"type": "log", "text": text}))

        try:
            if generate_commands is not None:
                from kws.synth_eval import generate_dataset

                def progress(text: str) -> None:
                    self.queue.put(("status", text))
                    log(text)

                counts = generate_dataset(generate_commands, on_progress=progress)
                log("합성 데이터: " + ", ".join(f"{label} {count}개" for label, count in counts.items()))
                self.queue.put(("synth_ready", None))
                if self.stop_train.is_set():
                    raise RuntimeError("학습 중지를 요청했습니다.")
            from kws.train import train_project

            sources = practice.training_sources(self.project.audio, use_synth, use_rec, repeat)
            result = train_project(
                sources,
                labels,
                out_dir,
                options,
                on_event=lambda event: self.queue.put(("train_event", event)),
                should_stop=self.stop_train.is_set,
            )
            if result.export_ok:
                try:
                    from kws.evaluate import after_training_check

                    check = after_training_check(result.model_dir, self.project.root, threshold)
                    log(check)
                    self.queue.put(("train_check", check))
                except Exception as exc:
                    log(f"학습 후 확인을 하지 못했습니다: {exc}")
            self.queue.put(("train_done", result))
        except Exception as exc:
            import traceback

            self.queue.put(("train_error", f"{exc}\n\n{traceback.format_exc()}"))

    def _release_loaded_model(self) -> None:
        """인식에 열어 둔 ONNX를 놓아, 같은 폴더를 다시 학습해 저장할 수 있게 한다."""
        self.classifier = None
        import gc

        gc.collect()

    def _finetune_problem(self, base_dir: Path | None, labels: list[str]) -> str:
        if base_dir is None:
            return "추가 학습할 학습 결과가 없습니다. 먼저 처음부터 학습하거나 위에서 결과를 고르세요."
        if not (base_dir / kws_paths.CHECKPOINT_FILENAME).is_file():
            return f"'{base_dir.name}'에는 model.pt가 없어 이어서 학습할 수 없습니다."
        try:
            import json

            meta = json.loads((base_dir / kws_paths.META_FILENAME).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return f"'{base_dir.name}'의 meta.json을 읽을 수 없습니다."
        if [str(label) for label in meta.get("labels", [])] != labels:
            return (
                f"'{base_dir.name}'의 명령({', '.join(meta.get('labels', []))})이 지금 명령({', '.join(labels)})과 달라 "
                "추가 학습할 수 없습니다. 처음부터 학습하세요."
            )
        return ""

    def on_train_mode(self) -> None:
        if self.train_mode_var.get() == "finetune":
            self.epoch_var.set(str(FINETUNE_EPOCHS))
            self.use_rec_var.set(True)
            self._show_base_info()
            arch = self.arch_var.get()
            self.lr_var.set(str(default_learning_rate(arch, finetune=True)))
            self._suggest_out_name(arch, finetune=True)
        else:
            # 추가 학습에서 기반 구조로 바뀐 선택을, 처음부터 학습에서 고른 구조로 되돌린다.
            arch = self.project.arch if self.project.arch in ARCHS else self.arch_var.get()
            self.arch_var.set(arch)
            self.epoch_var.set(str(self.project.epochs))
            self.lr_var.set(str(self._scratch_lr(arch)))
            self._suggest_out_name(arch, finetune=False)
            self._show_base_info()

    def _scratch_lr(self, arch: str) -> float:
        return self.project.learning_rate if arch == self.project.arch else default_learning_rate(arch)

    def _suggest_out_name(self, arch: str, finetune: bool) -> None:
        """저장 이름이 비었거나 기본 이름일 때만 구조와 방식에 맞는 기본 이름으로 바꾼다."""
        if self.out_name_var.get().strip() in ("", *DEFAULT_OUT_NAMES):
            self.out_name_var.set(default_out_name(arch, finetune))

    def pick_arch(self, arch: str) -> None:
        if arch not in ARCHS or self.training:
            return
        if self.train_mode_var.get() == "finetune":
            self.notify("추가 학습은 기반 결과의 구조를 그대로 씁니다. 구조를 바꾸려면 처음부터 학습을 고르세요.")
            self._sync_arch_cards()
            return
        self.arch_var.set(arch)
        self.on_arch()

    def on_arch(self) -> None:
        arch = self.arch_var.get()
        if self.train_mode_var.get() == "finetune":
            self._show_base_info()
            return
        if arch != self.project.arch:
            self.lr_var.set(str(default_learning_rate(arch)))
            self.project.arch = arch
            self.project.learning_rate = default_learning_rate(arch)
            self.project.save()
        self._suggest_out_name(arch, finetune=False)
        self._sync_arch_cards()
        self.notify(f"{arch_title(arch)} 구조로 학습합니다. 저장 이름은 {self.out_name_var.get()}입니다.")

    def _sync_arch_cards(self) -> None:
        if not hasattr(self, "arch_cards"):
            return
        n_classes = len(self.project.labels())
        selected = self.arch_var.get()
        finetune = self.train_mode_var.get() == "finetune"
        for name, parts in self.arch_cards.items():
            info = ARCHS[name]
            active = name == selected
            parts["card"].configure(highlightbackground=BLUE if active else LINE)
            parts["params"].configure(text=f"파라미터 {info.parameter_count(n_classes):,} · {n_classes}클래스")
            parts["facts"].configure(
                text=f"권장 학습률 {info.learning_rate:g} (추가 학습 {info.finetune_lr:g}) · 저장 이름 {info.scratch_name}"
            )
            parts["radio"].configure(state="disabled" if finetune and not active else "normal")
        if finetune:
            self.arch_note_var.set(f"추가 학습은 기반 결과의 구조({arch_title(selected)})를 그대로 이어 씁니다.")
            if not self.arch_note.winfo_ismapped():
                self.arch_note.pack(fill="x", pady=(8, 0))
        else:
            self.arch_note_var.set("")
            self.arch_note.pack_forget()

    def _show_base_info(self) -> None:
        if self.train_mode_var.get() != "finetune":
            self.base_info_var.set("")
            self._sync_arch_cards()
            return
        base = self._model_dir()
        self.base_info_var.set(f"기반: {base.name}" if base is not None else "기반: 없음 (위에서 학습 결과를 고르세요)")
        if base is not None:
            from kws.train import saved_arch

            arch = saved_arch(base)
            if arch is not None and arch != self.arch_var.get():
                self.arch_var.set(arch)
                self.lr_var.set(str(default_learning_rate(arch, finetune=True)))
        self._sync_arch_cards()

    def request_stop_train(self) -> None:
        self.stop_train.set()

    def toggle_test(self) -> None:
        if self.live:
            self.stop_test()
        else:
            self.start_test()

    def load_practice_audio(self) -> None:
        if self.recording or self.training or self.live:
            return
        commands = list(self.project.commands)
        question = (
            f"Supertonic 2로 {', '.join(commands)}와 무음 합성 데이터를 data/synth에 만듭니다.\n"
            "남자 5명, 여자 5명 목소리에 속도, 높이, 소음을 바꿉니다. 내 녹음(data/audio)은 건드리지 않습니다."
        )
        if practice.available():
            question += "\n\n이미 있는 합성 데이터는 지금 명령으로 새로 만듭니다."
        if not messagebox.askyesno("합성 데이터 생성", question + "\n\n계속할까요?"):
            return
        self.recording = True
        self.stop_record.clear()
        self._sync_buttons()
        self.notify("합성 데이터를 만드는 중입니다.")
        threading.Thread(target=self._generate_worker, args=(commands,), daemon=True).start()

    def _generate_worker(self, commands: list[str]) -> None:
        try:
            from kws.synth_eval import generate_dataset

            counts = generate_dataset(commands, on_progress=lambda text: self.queue.put(("status", text)))
            detail = ", ".join(f"{label} {count}개" for label, count in counts.items())
            self.queue.put(("generated", detail))
        except Exception as exc:
            self.queue.put(("record_error", str(exc)))
        finally:
            self.queue.put(("record_done", None))

    def recognize_wav_dialog(self) -> None:
        if self.recording or self.training or self.live:
            return
        selected = filedialog.askopenfilename(title="인식할 WAV", filetypes=[("WAV", "*.wav"), ("모든 파일", "*.*")])
        if not selected:
            return
        self.recognize_wav(Path(selected))

    def recognize_wav(self, path: Path) -> None:
        if not self._load_classifier():
            return
        try:
            probs = command_probs(self.classifier, load_model_wav(path))
        except Exception as exc:
            messagebox.showerror("인식 오류", str(exc))
            return
        self.last_probs = probs
        self.update_live_view()
        decision = self.last_decision
        shown = decision.label if decision is not None else "대기"
        detail = self.detail_var.get()
        self.detail_var.set(f"{path.name}  ·  {detail}")
        self._set_text(self.file_log, f"{path}\n결과: {shown}\n{detail}")
        self.notify(f"{path.name}: {shown}")
        self.notebook.select(self.test_tab)

    def evaluate_practice(self) -> None:
        folder = practice.test_dir()
        if not folder.is_dir():
            messagebox.showinfo("안내", "합성 평가 음원이 없습니다. 데이터 탭의 합성 데이터 생성을 먼저 누르세요.")
            return
        self.evaluate_folder(folder)

    def evaluate_folder_dialog(self) -> None:
        if self._eval_locked():
            return
        initial = self.project.data / "eval"
        selected = filedialog.askdirectory(
            title="평가할 폴더 (명령 이름 폴더가 들어 있는 폴더)",
            initialdir=str(initial if initial.is_dir() else self.project.data),
        )
        if selected:
            self.evaluate_folder(Path(selected))

    def evaluate_folder(self, folder: Path) -> None:
        if self._eval_locked() or not self._load_classifier():
            return
        self._begin_eval(f"{folder.name} 평가 중")
        threading.Thread(
            target=self._folder_eval_worker,
            args=(self.classifier, folder, list(self.eval_labels), self.eval_silence),
            daemon=True,
        ).start()

    def _folder_eval_worker(self, classifier, folder: Path, labels: list[str], silence: str) -> None:
        try:
            from kws.evaluate import evaluate_folder

            _, skipped = evaluate_folder(
                classifier,
                folder,
                labels,
                silence,
                on_item=lambda item: self.queue.put(("eval_item", item)),
                should_stop=self.stop_eval.is_set,
            )
            self.queue.put(("eval_done", (skipped, f"{folder} 평가가 끝났습니다.")))
        except Exception as exc:
            self.queue.put(("eval_error", str(exc)))

    def start_exam(self) -> None:
        if self._eval_locked() or not self._load_classifier():
            return
        try:
            repeat = int(self.exam_repeat_var.get())
        except ValueError:
            repeat = 0
        if not 1 <= repeat <= 10:
            messagebox.showerror("입력", "횟수는 1에서 10 사이여야 합니다.")
            return
        import random

        commands = [label for label in self.last_labels if label != self.silence_label]
        trials = [(label, f"「{label}」 말하세요") for label in commands for _ in range(repeat)]
        trials += [(self.silence_label, "조용히 계세요")] * repeat
        trials += [(OTHER_SPEECH, "다른 말 (예: 안녕하세요)")] * repeat
        random.shuffle(trials)
        self.exam_folder = self.project.data / "eval" / time.strftime("%Y%m%d_%H%M%S")
        self.exam_running = True
        self.recording = True
        self._begin_eval("마이크 시험 중")
        threading.Thread(
            target=self._exam_worker,
            args=(self.classifier, trials, self.exam_folder, self.current_device_index()),
            daemon=True,
        ).start()

    def _exam_worker(self, classifier, trials: list[tuple[str, str]], folder: Path, device: int | None) -> None:
        try:
            for index, (label, prompt) in enumerate(trials):
                if self.stop_eval.is_set():
                    break
                self.queue.put(("exam_prompt", f"({index + 1}/{len(trials)}) 준비"))
                if not self._wait_eval(0.8):
                    break
                self.queue.put(("exam_prompt", f"({index + 1}/{len(trials)}) {prompt}"))
                beep()
                wav = record_block(COMMAND_SECONDS, device, gain=self.input_gain)
                self.queue.put(("level", peak_level(wav)))
                path = folder / label / f"{index + 1:04d}.wav"
                save_wav(path, wav, TARGET_SAMPLE_RATE)
                from kws.evaluate import EvalItem

                expected = self.eval_silence if label == OTHER_SPEECH else label
                self.queue.put(("eval_item", EvalItem(path, expected, command_probs(classifier, wav))))
                if not self._wait_eval(0.6):
                    break
            self.queue.put(("eval_done", (0, f"마이크 시험 음성을 {folder}에 저장했습니다. 다른 학습 결과로 다시 평가할 때는 폴더 평가로 이 폴더를 고르세요.")))
        except Exception as exc:
            self.queue.put(("eval_error", str(exc)))

    def _wait_eval(self, seconds: float) -> bool:
        end = time.time() + seconds
        while time.time() < end:
            if self.stop_eval.is_set():
                return False
            time.sleep(0.05)
        return True

    def _eval_locked(self) -> bool:
        return self.recording or self.training or self.live or self.evaluating

    def _begin_eval(self, text: str) -> None:
        self.eval_labels = list(self.last_labels)
        self.eval_silence = self.silence_label
        self.eval_items = []
        self.eval_hits = 0
        self.eval_skipped = 0
        self.eval_selected = -1
        self.evaluating = True
        self.stop_eval.clear()
        self.exam_prompt.configure(text="", fg=INK)
        self._set_text(self.eval_report, text)
        self.refresh_eval_view()
        self._sync_buttons()
        self.notebook.select(self.eval_tab)
        self.notify(text)

    def request_stop_eval(self) -> None:
        self.stop_eval.set()

    def _finish_eval(self) -> None:
        self.evaluating = False
        if self.exam_running:
            self.exam_running = False
            self.recording = False
        self._sync_buttons()

    def refresh_eval_view(self) -> None:
        from kws.evaluate import judge, report

        tree = self.eval_tree
        tree.delete(*tree.get_children())
        self.eval_rows = {}
        threshold = float(self.threshold_var.get())
        for index, item in enumerate(self.eval_items):
            judged = judge(item, self.eval_labels, self.eval_silence, threshold)
            if self.wrong_only_var.get() and judged.outcome == "정답":
                continue
            row = tree.insert(
                "",
                "end",
                values=(
                    judged.outcome,
                    item.expected,
                    judged.decision.label,
                    f"{judged.decision.top_confidence * 100:.0f}%",
                    _short_path(item.path),
                ),
                tags=(judged.outcome, "odd" if len(self.eval_rows) % 2 else "even"),
            )
            self.eval_rows[row] = index
            if index == self.eval_selected:
                tree.selection_set(row)
                tree.see(row)
        if self.eval_items:
            text = report(self.eval_items, self.eval_labels, self.eval_silence, threshold, self.eval_skipped)
            self._set_text(self.eval_report, text)
        self._update_eval_score()
        self.draw_eval_bars()

    def on_eval_select(self, _event=None) -> None:
        selected = self.eval_tree.selection()
        self.eval_selected = self.eval_rows.get(selected[0], -1) if selected else -1
        self.draw_eval_bars()

    def _selected_eval_item(self):
        if 0 <= self.eval_selected < len(self.eval_items):
            return self.eval_items[self.eval_selected]
        return None

    def play_eval_selected(self) -> None:
        item = self._selected_eval_item()
        if item is None:
            self.notify("들을 줄을 고르세요.")
            return
        play_wav(item.path)

    def draw_eval_bars(self) -> None:
        item = self._selected_eval_item()
        if item is None:
            self._draw_prob_bars(self.eval_bars, [], None, -1, False, "줄을 고르면 명령별 확률이 표시됩니다.")
            return
        decision = decide(item.probs, self.eval_labels, self.eval_silence, float(self.threshold_var.get()))
        self._draw_prob_bars(
            self.eval_bars, self.eval_labels, item.probs, int(item.probs.argmax()), decision.accepted, ""
        )

    def _add_eval_item(self, item) -> None:
        from kws.evaluate import judge

        self.eval_items.append(item)
        judged = judge(item, self.eval_labels, self.eval_silence, float(self.threshold_var.get()))
        if self.exam_running:
            mark = "✓" if judged.outcome == "정답" else "✗"
            shown = "명령 아님" if item.expected == self.eval_silence else item.expected
            self.exam_prompt.configure(
                text=f"{mark} {shown} → {judged.decision.label}", fg=OUTCOME_COLORS[judged.outcome]
            )
        if not (self.wrong_only_var.get() and judged.outcome == "정답"):
            row = self.eval_tree.insert(
                "",
                "end",
                values=(
                    judged.outcome,
                    item.expected,
                    judged.decision.label,
                    f"{judged.decision.top_confidence * 100:.0f}%",
                    _short_path(item.path),
                ),
                tags=(judged.outcome, "odd" if len(self.eval_rows) % 2 else "even"),
            )
            self.eval_rows[row] = len(self.eval_items) - 1
            self.eval_tree.see(row)
        self.eval_hits += int(judged.outcome == "정답")
        self._update_eval_score()
        self.notify(f"평가 중: {len(self.eval_items)}개 중 정답 {self.eval_hits}개")

    def _update_eval_score(self) -> None:
        if not self.eval_items:
            self.eval_score.configure(text="정확도 -")
            return
        from kws.evaluate import summarize

        summary = summarize(self.eval_items, self.eval_labels, self.eval_silence, float(self.threshold_var.get()))
        self.eval_score.configure(
            text=f"정확도 {100.0 * summary.correct / summary.total:.0f}% ({summary.correct}/{summary.total})"
        )

    def save_eval_as_training(self) -> None:
        """평가에 쓴 사람 음성을 정답 클래스의 학습 데이터(data/audio)로 복사한다."""
        if self._eval_locked():
            return
        selected = self._selected_eval_item()
        if selected is not None:
            items = [selected]
        else:
            items = [self.eval_items[index] for index in self.eval_rows.values()]
        audio_root = self.project.audio.resolve()
        items = [item for item in items if audio_root not in Path(item.path).resolve().parents]
        if not items:
            messagebox.showinfo("안내", "저장할 음성이 없습니다. 마이크 시험이나 폴더 평가를 먼저 하세요.")
            return
        scope = "고른 1개" if selected is not None else f"표에 보이는 {len(items)}개"
        question = (
            f"{scope} 음성을 정답 명령의 학습 데이터(data/audio)로 복사할까요?\n"
            "다른말·소음은 무음으로 들어갑니다. 원본은 평가 폴더에 그대로 남지만, "
            "같은 음성으로 다시 평가하면 점수가 실제보다 높게 나옵니다."
        )
        if not messagebox.askyesno("학습 데이터로 저장", question):
            return
        import shutil

        counts: dict[str, int] = {}
        for item in items:
            shutil.copy2(item.path, self.project.new_wav_path(item.expected))
            counts[item.expected] = counts.get(item.expected, 0) + 1
        self.refresh_lists()
        detail = ", ".join(f"{label} {count}개" for label, count in counts.items())
        self.notify(f"학습 데이터에 추가했습니다: {detail}. 학습 탭에서 추가 학습하세요.")

    def save_eval_csv(self) -> None:
        if not self.eval_items:
            messagebox.showinfo("안내", "먼저 평가하세요.")
            return
        selected = filedialog.asksaveasfilename(
            title="평가 결과 CSV",
            defaultextension=".csv",
            initialfile=f"eval_{time.strftime('%Y%m%d_%H%M%S')}.csv",
            filetypes=[("CSV", "*.csv")],
        )
        if not selected:
            return
        from kws.evaluate import write_csv

        write_csv(Path(selected), self.eval_items, self.eval_labels, self.eval_silence, float(self.threshold_var.get()))
        self.notify(f"CSV를 저장했습니다: {selected}")

    def _load_classifier(self) -> bool:
        try:
            from kws.infer import ModelBundle

            model_dir = self._model_dir()
            if model_dir is None:
                messagebox.showinfo("안내", "인식에 쓸 학습 결과가 없습니다. 학습하거나 결과 폴더를 선택하세요.")
                return False
            bundle = ModelBundle(model_dir)
            engine = self.engine_var.get()
            available = bundle.engines()
            if engine not in available:
                if not available:
                    messagebox.showinfo("안내", "먼저 학습하세요.")
                    return False
                engine = available[0]
                self.engine_var.set(engine)
            self.classifier = bundle.classifier(engine)
            self.last_labels = bundle.labels
            self.silence_label = bundle.silence_label
            self.model_source_var.set(f"{model_dir.name} · {arch_title(bundle.arch)} · {engine}")
            self.engine_status.configure(text=f"사용 중: {engine}")
            return True
        except FileNotFoundError:
            messagebox.showinfo("안내", "고른 폴더에 학습 결과가 없습니다.")
            return False
        except ImportError as exc:
            messagebox.showerror("패키지 없음", str(exc))
            return False
        except Exception as exc:
            messagebox.showerror("모델 오류", str(exc))
            return False

    def refresh_saved_models(self, prefer: str | None = None) -> None:
        chosen = prefer or self.model_var.get()
        found = kws_paths.saved_model_dirs(self.project.root)
        self.saved_models = {path.name: path for path in found}
        names = list(self.saved_models)
        self.model_combo["values"] = names
        if chosen in self.saved_models:
            self.model_var.set(chosen)
        elif names:
            self.model_var.set(names[0])
        else:
            self.model_var.set("")
        self.classifier = None
        self._show_model_ready()

    def on_model_picked(self, _event=None) -> None:
        if self.live:
            self.stop_test()
        self.classifier = None
        self._show_model_ready()
        self.refresh_export_info()

    def browse_model(self) -> None:
        if self.recording or self.training or self.live:
            return
        selected = filedialog.askdirectory(title="학습 결과 폴더")
        if not selected:
            return
        path = Path(selected)
        if not kws_paths.is_saved_model(path):
            messagebox.showinfo("안내", "meta.json과 ONNX 또는 model.pt가 있는 폴더를 선택하세요.")
            return
        self.saved_models[path.name] = path
        names = list(self.model_combo["values"])
        if path.name not in names:
            names.append(path.name)
        self.model_combo["values"] = names
        self.model_var.set(path.name)
        self.classifier = None
        self._show_model_ready()

    @staticmethod
    def _accuracy_text(result) -> str:
        text = f"{arch_title(result.arch)} · 검증 정확도 {result.val_accuracy * 100:.1f}%"
        if len(result.source_accuracy) > 1:
            text += " (" + ", ".join(f"{name} {value * 100:.0f}%" for name, value in result.source_accuracy.items()) + ")"
        if result.base_accuracy:
            before = ", ".join(f"{name} {value * 100:.0f}%" for name, value in result.base_accuracy.items())
            text += f"  · 추가 학습 전 {before}"
        return text + f"  · 에폭 {result.best_epoch}"

    def _show_model_ready(self) -> None:
        self._show_base_info()
        path = self._model_dir()
        self._refresh_results_tree()
        if path is None:
            self.model_info_var.set("학습 결과가 없습니다.")
            self.model_arch_badge.configure(text="")
            self.model_arch_badge.pack_forget()
            self.side_model_var.set("없음")
            self.side_detail_var.set("학습하거나 결과 폴더를 고르세요.")
            self.status_var.set("학습 탭에서 학습 시작을 누르면 합성 데이터로 학습합니다. 합성 데이터가 없으면 먼저 만듭니다.")
            return
        meta = _read_meta(path)
        labels = [str(label) for label in meta.get("labels", [])]
        accuracy = meta.get("val_accuracy")
        accuracy_text = f"검증 {float(accuracy) * 100:.0f}% · " if isinstance(accuracy, (int, float)) else ""
        self.model_info_var.set(f"{accuracy_text}{', '.join(labels)}")
        title = arch_title(meta.get("arch"))
        self.model_arch_badge.configure(text=title)
        if not self.model_arch_badge.winfo_ismapped():
            self.model_arch_badge.pack(side="left", padx=(14, 0), before=self.model_arch_badge.master.winfo_children()[-1])
        self.side_model_var.set(path.name)
        detail = title
        if isinstance(accuracy, (int, float)):
            detail += f" · 검증 {float(accuracy) * 100:.1f}%"
        count = meta.get("parameter_count")
        if isinstance(count, int):
            detail += f"\n파라미터 {count:,}"
        self.side_detail_var.set(detail)
        self.status_var.set(
            f"인식은 '{path.name}' 결과로 바로 할 수 있습니다. 다시 학습은 위의 다시 학습 또는 학습 탭에서 할 수 있습니다."
        )

    def _refresh_results_tree(self) -> None:
        tree = self.results_tree
        tree.delete(*tree.get_children())
        current = self.model_var.get()
        for index, (name, path) in enumerate(self.saved_models.items()):
            meta = _read_meta(path)
            accuracy = meta.get("val_accuracy")
            count = meta.get("parameter_count")
            onnx_path = path / kws_paths.ONNX_FILENAME
            created = str(meta.get("created", ""))[:19].replace("T", " ")
            tags = ["odd" if index % 2 else "even"]
            if name == current:
                tags.append("current")
            tree.insert(
                "",
                "end",
                iid=name,
                values=(
                    name,
                    arch_title(meta.get("arch")),
                    f"{count:,}" if isinstance(count, int) else "-",
                    f"{float(accuracy) * 100:.1f}%" if isinstance(accuracy, (int, float)) else "-",
                    f"{onnx_path.stat().st_size / 1024:.1f} KB" if onnx_path.is_file() else "없음",
                    created or "-",
                ),
                tags=tuple(tags),
            )
        if current in self.saved_models:
            tree.selection_set(current)

    def use_result_row(self) -> None:
        selected = self.results_tree.selection()
        if not selected or selected[0] not in self.saved_models:
            self.notify("표에서 학습 결과를 고르세요.")
            return
        self.model_var.set(selected[0])
        self.on_model_picked()
        self.notify(f"인식에 '{selected[0]}' 결과를 씁니다.")

    def open_selected_model(self) -> None:
        path = self._model_dir() or self.project.model_dir
        open_folder(path)

    def _model_dir(self) -> Path | None:
        path = self.saved_models.get(self.model_var.get())
        if path is not None and kws_paths.is_saved_model(path):
            return path
        return None

    def start_test(self) -> None:
        if self.recording or self.training:
            return
        if not self._load_classifier():
            return
        engine = self.engine_var.get()
        try:
            mic = MicrophoneStream(device=self.current_device_index(), gain=self.input_gain)
            mic.start()
        except Exception as exc:
            messagebox.showerror("마이크 오류", str(exc))
            return
        self.mic = mic
        self.last_probs = None
        self.last_decision = None
        self.live = True
        self.engine_status.configure(text=f"사용 중: {engine}")
        self._sync_buttons()
        self.show_decision(None, listening=True)
        threading.Thread(target=self._test_worker, daemon=True).start()

    def _test_worker(self) -> None:
        held = None
        hold_left = 0
        try:
            while self.live:
                mic = self.mic
                if mic is None:
                    break
                wav = mic.read()
                self.queue.put(("level", peak_level(wav)))
                if wav.size < TARGET_SAMPLE_RATE:
                    self.queue.put(("listening", None))
                    time.sleep(0.05)
                    continue
                silence_index = self.classifier.bundle.labels.index(self.classifier.bundle.silence_label)
                probs = command_probs(self.classifier, wav)
                held, hold_left = hold_command(held, probs, silence_index, hold_left)
                self.queue.put(("probs", held.copy()))
                time.sleep(0.2)
        except Exception as exc:
            self.queue.put(("record_error", str(exc)))
            self.queue.put(("stop_test", None))

    def stop_test(self) -> None:
        self.live = False
        if self.mic is not None:
            self.mic.close()
            self.mic = None
        self.engine_status.configure(text="")
        self._sync_buttons()

    def on_gain(self, _value: str) -> None:
        gain = clamp_gain(self.gain_var.get())
        self.input_gain = gain
        self.gain_text.configure(text=self._gain_text(gain))
        if self.mic is not None:
            self.mic.gain = gain
        self.project.input_gain = gain
        self.project.save()

    def _gain_text(self, gain: float) -> str:
        return f"{int(round(gain * 100))}%"

    def _show_input_level(self, peak: float) -> None:
        level = min(max(float(peak), 0.0), 1.0)
        shown = int(round(level * 100))
        text = f"입력 {shown}%"
        if peak > 0.98:
            text += " · 잘림"
        self.input_level_var.set(text)
        meter = self.level_meter
        meter.delete("all")
        width = int(meter.cget("width"))
        meter.create_line(4, 4, width - 4, 4, fill=TRACK, width=6, capstyle="round")
        if level > 0:
            color = DANGER if peak > 0.98 else (WARN if level < 0.05 else SUCCESS)
            meter.create_line(4, 4, 4 + (width - 8) * level, 4, fill=color, width=6, capstyle="round")

    def on_threshold(self, _value: str) -> None:
        text = f"{float(self.threshold_var.get()):.2f}"
        self.threshold_text.configure(text=text)
        self.eval_threshold_text.configure(text=text)
        self.update_live_view()
        if self.eval_items and not self.evaluating:
            self.refresh_eval_view()

    def update_live_view(self) -> None:
        if self.last_probs is None or not self.last_labels:
            self.draw_bars()
            return
        decision = decide(self.last_probs, self.last_labels, self.silence_label, float(self.threshold_var.get()))
        self.last_decision = decision
        self.highlight_index = int(self.last_probs.argmax())
        self.show_decision(decision)
        self.draw_bars()

    def show_decision(self, decision, listening: bool = False) -> None:
        if listening or decision is None:
            self._paint_readout("#f1f5f9", MUTED, "듣는 중")
            self.result_label.configure(text="듣는 중")
            self.detail_var.set("1초 이상 들리면 판정합니다.")
            return
        if decision.accepted:
            self._paint_readout(SUCCESS_SOFT, SUCCESS, "인식됨")
            self.result_label.configure(text=decision.label)
            self.detail_var.set(f"신뢰도 {decision.top_confidence * 100:.0f}%")
        else:
            self._paint_readout(WARN_SOFT, WARN, "임계값 미만 · 대기")
            self.result_label.configure(text="대기")
            self.detail_var.set(
                f"가장 가까운 명령 {decision.near_label}  {decision.near_confidence * 100:.0f}%"
            )

    def _paint_readout(self, background: str, foreground: str, badge: str) -> None:
        self.readout.configure(bg=background)
        self.result_label.configure(bg=background, fg=foreground)
        self.detail_label.configure(bg=background, fg=foreground if foreground != MUTED else MUTED)
        self.readout_badge.configure(text=badge, bg=background, fg=foreground)

    def export_model(self) -> None:
        if self.training:
            return
        model_dir = self._model_dir()
        if model_dir is None or not (model_dir / kws_paths.CHECKPOINT_FILENAME).exists():
            messagebox.showinfo("안내", "다시 저장할 학습 가중치(model.pt)가 없습니다. 인식은 ONNX만 있어도 됩니다.")
            return
        self.export_button.configure(state="disabled")
        make_int8 = bool(self.int8_var.get())
        threading.Thread(target=self._export_worker, args=(model_dir, make_int8), daemon=True).start()

    def _export_worker(self, model_dir: Path, make_int8: bool) -> None:
        try:
            from kws.export import export_onnx

            text = export_onnx(model_dir, self.project.audio, make_int8=make_int8)
            self.queue.put(("export_done", text))
        except Exception as exc:
            self.queue.put(("export_error", str(exc)))

    def refresh_export_info(self, extra: str = "") -> None:
        text = self.export_help()
        if extra:
            text = extra.rstrip() + "\n\n" + text
        self._set_text(self.export_text, text)

    def export_help(self) -> str:
        model_dir = self._model_dir() or self.project.model_dir
        return (
            f"모델 폴더\n{model_dir}\n\n"
            "주요 파일\n"
            "command_kws.onnx\n"
            "command_kws.int8.onnx\n"
            "labels.txt\n"
            "frontend.txt\n"
            "mel_filters.bin, window.bin, norm.bin\n"
            "model.pt\n\n"
            "C++ 예제 빌드\n"
            "cmake -S cpp -B cpp/build -DONNXRUNTIME_ROOT=C:\\path\\to\\onnxruntime\n"
            "cmake --build cpp/build --config Release\n\n"
            "실행\n"
            f"cpp\\build\\Release\\kws_infer.exe \"{model_dir}\" 녹음.wav 0.70\n\n"
            "onnxruntime.dll 을 exe 옆에 두세요. "
            "판정은 무음이 아니면서 최대 확률이 임계값 이상일 때만 명령으로 받아들입니다."
        )

    def capture_settings(self) -> None:
        self.project.input_device = self.device_var.get() or "기본 장치"
        self.input_gain = clamp_gain(self.gain_var.get())
        self.project.input_gain = self.input_gain
        try:
            self.project.batch_size = int(self.batch_var.get())
            if self.train_mode_var.get() == "scratch":
                self.project.arch = self.arch_var.get()
                self.project.epochs = int(self.epoch_var.get())
                self.project.learning_rate = float(self.lr_var.get())
        except ValueError:
            pass
        self.project.threshold = float(self.threshold_var.get())
        self.project.save()

    def _sync_busy(self) -> None:
        busy = self.recording or self.training or self.evaluating
        if busy and not self.busy_shown:
            self.busy.pack(side="right", padx=14)
            self.busy.start(12)
            self.busy_shown = True
        elif not busy and self.busy_shown:
            self.busy.stop()
            self.busy.pack_forget()
            self.busy_shown = False

    def _sync_buttons(self) -> None:
        self._sync_busy()
        locked = self.recording or self.training or self.live
        record_state = "disabled" if locked else "normal"
        for button in self.record_buttons:
            button.configure(state=record_state)
        self.stop_record_button.configure(state="normal" if self.recording else "disabled")
        self.train_button.configure(state="disabled" if locked else "normal")
        self.stop_train_button.configure(state="normal" if self.training else "disabled")
        if self.live:
            self.test_button.configure(state="normal", text="테스트 중지", style="Stop.TButton")
        else:
            self.test_button.configure(
                state="disabled" if (self.recording or self.training) else "normal",
                text="마이크 테스트 시작",
                style="Accent.TButton",
            )
        self.export_button.configure(state="disabled" if self.training else "normal")
        file_state = "disabled" if locked or self.evaluating else "normal"
        self.practice_button.configure(state=file_state)
        self.file_test_button.configure(state=file_state)
        for button in (self.exam_button, self.folder_eval_button, self.batch_test_button):
            button.configure(state=file_state)
        self.stop_eval_button.configure(state="normal" if self.evaluating else "disabled")
        done_state = "normal" if self.eval_items and not self.evaluating else "disabled"
        self.csv_button.configure(state=done_state)
        self.to_train_button.configure(state=done_state)
        self.live_exam_button.configure(state=file_state)
        if self.evaluating:
            self.test_button.configure(state="disabled")
            self.train_button.configure(state="disabled")
            for button in self.record_buttons:
                button.configure(state="disabled")

    def notify(self, text: str) -> None:
        self.record_status_var.set(text)
        self.status_var.set(text)

    def append_log(self, text: str) -> None:
        self.log.configure(state="normal")
        self.log.insert("end", text.rstrip() + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _set_text(self, widget: tk.Text, text: str) -> None:
        widget.configure(state="normal")
        widget.delete("1.0", "end")
        widget.insert("1.0", text)
        widget.configure(state="disabled")

    def draw_chart(self) -> None:
        canvas = self.chart
        canvas.delete("all")
        width = max(int(canvas.winfo_width()), 320)
        height = max(int(canvas.winfo_height()), 140)
        left, right, top, bottom = 40, 16, 30, 24
        plot_w = width - left - right
        plot_h = height - top - bottom
        for step in range(5):
            y_pos = top + plot_h * step / 4
            canvas.create_line(left, y_pos, width - right, y_pos, fill=TRACK)
            canvas.create_text(left - 6, y_pos, anchor="e", text=f"{100 - step * 25}%", fill=MUTED, font=(self.family, 8))
        canvas.create_rectangle(left, 9, left + 10, 17, fill=BLUE, outline="")
        canvas.create_text(left + 16, 13, anchor="w", text="검증 정확도", fill=INK, font=self.font_small)
        canvas.create_rectangle(left + 100, 9, left + 110, 17, fill=LOSS, outline="")
        canvas.create_text(left + 116, 13, anchor="w", text="학습 손실 (최대값 기준)", fill=INK, font=self.font_small)
        if not self.loss_history:
            canvas.create_text(
                left + plot_w / 2, top + plot_h / 2, text="학습을 시작하면 에폭마다 곡선이 그려집니다.", fill=MUTED, font=self.font
            )
            return
        count = len(self.loss_history)
        canvas.create_text(left, height - 8, anchor="w", text="1", fill=MUTED, font=(self.family, 8))
        canvas.create_text(width - right, height - 8, anchor="e", text=f"에폭 {count}", fill=MUTED, font=(self.family, 8))
        loss_max = max(self.loss_history) or 1.0
        self._draw_series(canvas, self.acc_history, BLUE, left, top, plot_w, plot_h, True, area_only=True)
        self._draw_series(canvas, [value / loss_max for value in self.loss_history], LOSS, left, top, plot_w, plot_h, False)
        self._draw_series(canvas, self.acc_history, BLUE, left, top, plot_w, plot_h, True)

    def _draw_series(
        self,
        canvas: tk.Canvas,
        values: list[float],
        color: str,
        left: int,
        top: int,
        plot_w: int,
        plot_h: int,
        fill: bool,
        area_only: bool = False,
    ) -> None:
        count = len(values)
        points: list[float] = []
        for index, value in enumerate(values):
            x_pos = left + plot_w * (index / max(1, count - 1)) if count > 1 else left + plot_w / 2
            y_pos = top + plot_h * (1.0 - min(max(float(value), 0.0), 1.0))
            points.extend((x_pos, y_pos))
        if area_only:
            if count > 1:
                area = [points[0], top + plot_h, *points, points[-2], top + plot_h]
                canvas.create_polygon(*area, fill=BLUE_SOFT, outline="")
            return
        if count > 1:
            canvas.create_line(*points, fill=color, width=2, smooth=False, capstyle="round", joinstyle="round")
        x_last, y_last = points[-2], points[-1]
        canvas.create_oval(x_last - 4, y_last - 4, x_last + 4, y_last + 4, fill=color, outline=CARD, width=2)
        if fill:
            canvas.create_text(
                x_last - 8, y_last - 12, anchor="e", text=f"{float(values[-1]) * 100:.1f}%", fill=color, font=(self.family, 9, "bold")
            )

    def draw_bars(self) -> None:
        accepted = self.last_decision is not None and self.last_decision.accepted
        highlight = self.highlight_index if self.last_decision is not None else -1
        self._draw_prob_bars(
            self.bar_canvas,
            self.last_labels,
            self.last_probs,
            highlight,
            accepted,
            "테스트를 시작하면 명령별 확률이 표시됩니다.",
        )

    def _draw_prob_bars(self, canvas: tk.Canvas, labels: list[str], probs, highlight: int, accepted: bool, empty_text: str) -> None:
        canvas.delete("all")
        width = max(int(canvas.winfo_width()), 360)
        height = max(int(canvas.winfo_height()), 60)
        if probs is None or not labels:
            canvas.create_text(16, 24, anchor="w", text=empty_text, fill=MUTED, font=self.font)
            return
        name_w = 110
        value_w = 52
        usable = max(10, width - name_w - value_w - 12)
        row_h = min(40.0, (height - 18) / max(1, len(labels)))
        bar_h = max(6, min(14, int(row_h * 0.45)))
        threshold = float(self.threshold_var.get())
        threshold_x = name_w + usable * threshold
        for index, (name, prob) in enumerate(zip(labels, probs)):
            y_pos = 4 + index * row_h + row_h / 2
            value = max(0.0, min(1.0, float(prob)))
            if index == highlight:
                color = SUCCESS if accepted else WARN
                weight = "bold"
            else:
                color = "#a5b4c8"
                weight = "normal"
            canvas.create_text(8, y_pos, anchor="w", text=name, font=(self.family, 10, weight), fill=INK)
            canvas.create_line(name_w, y_pos, name_w + usable, y_pos, fill=TRACK, width=bar_h, capstyle="round")
            if value > 0.004:
                canvas.create_line(name_w, y_pos, name_w + usable * value, y_pos, fill=color, width=bar_h, capstyle="round")
            canvas.create_text(width - 8, y_pos, anchor="e", text=f"{value * 100:.0f}%", font=(self.family, 10, weight), fill=INK)
        canvas.create_line(threshold_x, 2, threshold_x, 4 + len(labels) * row_h, fill=MUTED, dash=(3, 3))
        canvas.create_text(
            threshold_x, 4 + len(labels) * row_h + 7, text=f"임계값 {threshold * 100:.0f}%", fill=MUTED, font=(self.family, 8)
        )

    def _wait(self, seconds: float) -> bool:
        end = time.time() + seconds
        while time.time() < end:
            if self.stop_record.is_set():
                return False
            time.sleep(0.05)
        return True

    def poll(self) -> None:
        error_box = None
        warning = None
        try:
            while True:
                kind, payload = self.queue.get_nowait()
                if kind == "status":
                    self.notify(str(payload))
                elif kind == "clip":
                    label, path, peak = payload
                    self.refresh_lists(keep_label=label)
                    if path:
                        self._show_input_level(float(peak))
                        self.notify(f"{label} 저장. {level_message(float(peak))}")
                elif kind == "generated":
                    self.refresh_lists()
                    self.notify(f"합성 데이터를 만들었습니다. {payload}. 학습 탭에서 학습을 시작하세요.")
                elif kind == "synth_ready":
                    self.refresh_lists()
                elif kind == "train_check":
                    self.check_var.set(str(payload))
                elif kind == "record_done":
                    self.recording = False
                    self._sync_buttons()
                    if self.stop_record.is_set():
                        self.notify("녹음을 중지했습니다.")
                elif kind == "record_error":
                    error_box = ("오류", str(payload).splitlines()[0])
                elif kind == "train_event":
                    if payload["type"] == "log":
                        self.append_log(payload["text"])
                    elif payload["type"] == "epoch":
                        self.loss_history.append(float(payload["train_loss"]))
                        self.acc_history.append(float(payload["val_accuracy"]))
                        self.progress["value"] = 100.0 * float(payload["epoch"]) / float(payload["epochs"])
                        self.append_log(payload["text"])
                        self.acc_var.set(f"검증 정확도 {float(payload['val_accuracy']) * 100:.1f}%")
                        self.kpi_accuracy.set(f"{max(self.acc_history) * 100:.1f}%")
                        self.kpi_epoch.set(f"{payload['epoch']} / {payload['epochs']}")
                        self.kpi_elapsed.set(_elapsed(time.time() - self.train_started))
                        self.draw_chart()
                elif kind == "train_done":
                    self.training = False
                    self._sync_buttons()
                    self.append_log(payload.report)
                    self.append_log(payload.export_log)
                    self.acc_var.set(self._accuracy_text(payload))
                    self.kpi_accuracy.set(f"{payload.val_accuracy * 100:.1f}%")
                    self.kpi_epoch.set(f"최고 {payload.best_epoch}")
                    self.kpi_params.set(f"{payload.parameter_count:,}")
                    self.kpi_elapsed.set(_elapsed(time.time() - self.train_started))
                    self.refresh_export_info(payload.export_log)
                    self.refresh_saved_models(prefer=payload.model_dir.name)
                    self.refresh_lists()
                    name = payload.model_dir.name
                    if payload.stopped:
                        self.notify(f"학습을 중지하고 지금까지의 결과를 '{name}'에 저장했습니다.")
                    else:
                        self.notify(f"학습이 끝나 '{name}'에 저장했습니다. 평가 탭의 마이크 시험으로 내 목소리 점수를 확인하세요.")
                    if not payload.export_ok:
                        self.engine_var.set("pytorch")
                        warning = ("ONNX", "학습 가중치는 저장했습니다. ONNX 저장은 실패했습니다. 학습 로그를 확인하세요.")
                elif kind == "train_error":
                    self.training = False
                    self._sync_buttons()
                    self.append_log(str(payload))
                    error_box = ("학습 오류", str(payload).splitlines()[0])
                elif kind == "level":
                    self._show_input_level(float(payload))
                elif kind == "listening":
                    if self.last_probs is None:
                        self.show_decision(None, listening=True)
                elif kind == "probs":
                    self.last_probs = payload
                    self.update_live_view()
                elif kind == "stop_test":
                    self.stop_test()
                elif kind == "eval_item":
                    self._add_eval_item(payload)
                elif kind == "exam_prompt":
                    self.exam_prompt.configure(text=str(payload), fg=INK)
                elif kind == "eval_done":
                    skipped, message = payload
                    self.eval_skipped = int(skipped)
                    self._finish_eval()
                    self.refresh_eval_view()
                    if self.stop_eval.is_set():
                        message = "평가를 중지했습니다. 지금까지의 결과입니다."
                    self.notify(message)
                elif kind == "eval_error":
                    self._finish_eval()
                    self.refresh_eval_view()
                    error_box = ("평가 오류", str(payload).splitlines()[0])
                elif kind == "export_done":
                    self.export_button.configure(state="normal")
                    self.refresh_export_info(str(payload))
                    self.notify("ONNX를 다시 저장했습니다.")
                elif kind == "export_error":
                    self.export_button.configure(state="normal")
                    error_box = ("내보내기 오류", str(payload).splitlines()[0])
        except queue.Empty:
            pass
        except Exception as exc:
            error_box = ("오류", str(exc))
        if self.root.winfo_exists():
            if warning:
                messagebox.showwarning(*warning)
            if error_box:
                messagebox.showerror(*error_box)
            self._poll_job = self.root.after(100, self.poll)

    def close(self) -> None:
        try:
            self.root.after_cancel(self._poll_job)
        except Exception:
            pass
        self.stop_record.set()
        self.stop_train.set()
        self.stop_eval.set()
        self.live = False
        if self.mic is not None:
            self.mic.close()
        try:
            self.capture_settings()
        except Exception:
            pass
        self.root.destroy()


def apply_theme(root: tk.Tk, family: str) -> None:
    root.configure(bg=PAGE)
    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure(".", background=PAGE, foreground=INK, font=(family, 10), bordercolor=LINE, focuscolor=BLUE)
    style.configure("TFrame", background=PAGE)
    style.configure("Card.TFrame", background=CARD, bordercolor=LINE, relief="solid", borderwidth=1)
    style.configure("Inner.TFrame", background=CARD)
    style.configure("TLabel", background=PAGE, foreground=INK)
    style.configure("Inside.TLabel", background=CARD, foreground=INK)
    style.configure("Field.TLabel", background=CARD, foreground=MUTED, font=(family, 9, "bold"))
    style.configure("Muted.TLabel", background=CARD, foreground=MUTED, font=(family, 9))
    style.configure("Help.TLabel", background=CARD, foreground=INK, font=(family, 9))
    style.configure("Strong.TLabel", background=CARD, foreground=INK, font=(family, 11, "bold"))
    style.configure("PageTitle.TLabel", background=PAGE, foreground=INK, font=(family, 17, "bold"))
    style.configure("PageSub.TLabel", background=PAGE, foreground=MUTED, font=(family, 10))
    style.configure(
        "TLabelframe",
        background=CARD,
        bordercolor=LINE,
        lightcolor=CARD,
        darkcolor=CARD,
        relief="solid",
        borderwidth=1,
        labeloutside=True,
        labelmargins=(2, 0, 0, 5),
    )
    style.configure("TLabelframe.Label", background=PAGE, foreground=MUTED, font=(family, 9, "bold"))

    button = dict(
        background=CARD,
        foreground=INK,
        bordercolor=LINE_STRONG,
        lightcolor=CARD,
        darkcolor=CARD,
        padding=(14, 6),
        relief="raised",
        borderwidth=1,
        focusthickness=1,
        focuscolor=CARD,
        font=(family, 10),
    )
    style.configure("TButton", **button)
    style.map(
        "TButton",
        background=[("pressed", "#e2e8f0"), ("active", "#f1f5f9"), ("disabled", "#f3f4f6")],
        foreground=[("disabled", "#9ca3af")],
        bordercolor=[("focus", BLUE), ("active", "#94a3b8"), ("disabled", LINE)],
        lightcolor=[("pressed", "#e2e8f0"), ("active", "#f1f5f9"), ("disabled", "#f3f4f6")],
        darkcolor=[("pressed", "#e2e8f0"), ("active", "#f1f5f9"), ("disabled", "#f3f4f6")],
    )
    style.configure(
        "Accent.TButton",
        background=BLUE,
        foreground="#ffffff",
        bordercolor=BLUE,
        lightcolor=BLUE,
        darkcolor=BLUE,
        focuscolor=BLUE,
        font=(family, 10, "bold"),
    )
    style.map(
        "Accent.TButton",
        background=[("pressed", BLUE_DARK), ("active", "#4338ca"), ("disabled", "#c7d2fe")],
        lightcolor=[("pressed", BLUE_DARK), ("active", "#4338ca"), ("disabled", "#c7d2fe")],
        darkcolor=[("pressed", BLUE_DARK), ("active", "#4338ca"), ("disabled", "#c7d2fe")],
        foreground=[("disabled", "#ffffff")],
        bordercolor=[("focus", BLUE_DARK), ("disabled", "#c7d2fe"), ("active", "#4338ca")],
    )
    style.configure(
        "Stop.TButton",
        background=DANGER_SOFT,
        foreground=DANGER,
        bordercolor="#fecaca",
        lightcolor=DANGER_SOFT,
        darkcolor=DANGER_SOFT,
        focuscolor=DANGER_SOFT,
        font=(family, 10, "bold"),
    )
    style.map(
        "Stop.TButton",
        background=[("pressed", "#fecaca"), ("active", "#fee2e2"), ("disabled", "#f9fafb")],
        lightcolor=[("pressed", "#fecaca"), ("active", "#fee2e2"), ("disabled", "#f9fafb")],
        darkcolor=[("pressed", "#fecaca"), ("active", "#fee2e2"), ("disabled", "#f9fafb")],
        foreground=[("disabled", "#c0c4cc")],
        bordercolor=[("disabled", LINE), ("active", "#f87171")],
    )
    for name in ("TCheckbutton", "TRadiobutton"):
        style.configure(name, background=CARD, foreground=INK, padding=(2, 4), indicatorcolor=CARD, indicatorbackground=CARD)
        style.map(
            name,
            background=[("active", CARD)],
            foreground=[("disabled", "#9ca3af")],
            indicatorcolor=[("selected", BLUE), ("disabled", "#e5e7eb"), ("!selected", CARD)],
        )
    style.configure("Arch.TRadiobutton", font=(family, 12, "bold"))
    field = dict(fieldbackground=CARD, foreground=INK, bordercolor=LINE_STRONG, lightcolor=CARD, darkcolor=CARD, padding=5)
    style.configure("TEntry", **field)
    style.map("TEntry", bordercolor=[("focus", BLUE)], lightcolor=[("focus", BLUE)])
    style.configure("TSpinbox", arrowcolor=MUTED, arrowsize=12, background=CARD, **field)
    style.map("TSpinbox", bordercolor=[("focus", BLUE)], lightcolor=[("focus", BLUE)])
    style.configure("TCombobox", background=CARD, arrowcolor=MUTED, arrowsize=13, **field)
    style.map(
        "TCombobox",
        fieldbackground=[("readonly", CARD)],
        background=[("active", "#f1f5f9")],
        bordercolor=[("focus", BLUE)],
        lightcolor=[("focus", BLUE)],
        selectbackground=[("readonly", CARD)],
        selectforeground=[("readonly", INK)],
    )
    root.option_add("*TCombobox*Listbox.background", CARD)
    root.option_add("*TCombobox*Listbox.selectBackground", BLUE_SOFT)
    root.option_add("*TCombobox*Listbox.selectForeground", BLUE_DARK)
    root.option_add("*TCombobox*Listbox.font", (family, 10))
    style.configure(
        "TScale", background=BLUE, troughcolor=TRACK, bordercolor=CARD, lightcolor=BLUE, darkcolor=BLUE, sliderlength=16
    )
    style.map("TScale", background=[("active", BLUE_DARK)])
    style.configure(
        "Horizontal.TProgressbar", background=BLUE, troughcolor=TRACK, bordercolor=TRACK, lightcolor=BLUE, darkcolor=BLUE, thickness=8
    )
    style.configure(
        "Busy.Horizontal.TProgressbar", background=BLUE, troughcolor=TRACK, bordercolor=CARD, lightcolor=BLUE, darkcolor=BLUE, thickness=4
    )
    # 쪽 이동은 왼쪽 메뉴가 맡으므로 탭 줄은 그리지 않는다.
    style.configure(
        "Pages.TNotebook", background=PAGE, bordercolor=PAGE, lightcolor=PAGE, darkcolor=PAGE, borderwidth=0, tabmargins=0
    )
    style.layout("Pages.TNotebook.Tab", [])
    style.layout("Pages.TNotebook", [("Notebook.client", {"sticky": "nswe"})])
    style.configure(
        "Treeview",
        background=CARD,
        fieldbackground=CARD,
        foreground=INK,
        bordercolor=LINE,
        lightcolor=CARD,
        darkcolor=CARD,
        rowheight=28,
        font=(family, 10),
    )
    style.configure(
        "Treeview.Heading",
        background="#f8fafc",
        foreground=MUTED,
        bordercolor=LINE,
        lightcolor="#f8fafc",
        darkcolor="#f8fafc",
        relief="flat",
        padding=(8, 6),
        font=(family, 9, "bold"),
    )
    style.map("Treeview.Heading", background=[("active", "#eef2f7")])
    style.map("Treeview", background=[("selected", BLUE_SOFT)], foreground=[("selected", BLUE_DARK)])
    style.configure(
        "TScrollbar",
        background="#d5dbe5",
        troughcolor=CARD,
        bordercolor=CARD,
        lightcolor="#d5dbe5",
        darkcolor="#d5dbe5",
        arrowcolor=MUTED,
        arrowsize=12,
        gripcount=0,
    )
    style.map("TScrollbar", background=[("active", "#b6c0cf")])
    style.configure("TPanedwindow", background=PAGE)
    style.configure("Sash", sashthickness=10, background=PAGE, gripcount=0)


def icon_font_family(root: tk.Tk) -> str | None:
    """Windows 아이콘 글꼴. 없으면 메뉴에 점을 쓴다."""
    families = set(tkfont.families(root))
    for name in ("Segoe Fluent Icons", "Segoe MDL2 Assets"):
        if name in families:
            return name
    return None


def configure_fonts(root: tk.Tk) -> str:
    families = set(tkfont.families(root))
    family = "Segoe UI"
    for name in ("Malgun Gothic", "맑은 고딕", "Gulim", "굴림", "Segoe UI"):
        if name in families:
            family = name
            break
    for font_name in ("TkDefaultFont", "TkTextFont", "TkMenuFont"):
        tkfont.nametofont(font_name).configure(family=family, size=10)
    tkfont.nametofont("TkHeadingFont").configure(family=family, size=11, weight="bold")
    return family


def beep() -> None:
    try:
        import winsound

        winsound.Beep(880, 120)
    except Exception:
        pass


def play_wav(path: Path) -> None:
    try:
        import sounddevice as sd

        wav, sample_rate = load_audio(path)
        sd.stop()
        sd.play(wav, samplerate=sample_rate)
    except Exception as exc:
        messagebox.showerror("재생 오류", str(exc))


def _read_meta(path: Path) -> dict:
    import json

    try:
        data = json.loads((Path(path) / kws_paths.META_FILENAME).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _elapsed(seconds: float) -> str:
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}초"
    return f"{seconds // 60}분 {seconds % 60:02d}초"


def _short_path(path: Path) -> str:
    parts = Path(path).parts
    return str(Path(*parts[-3:])) if len(parts) > 3 else str(path)


def open_folder(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.startfile(path)  # type: ignore[attr-defined]
    except Exception as exc:
        messagebox.showinfo("폴더", f"{path}\n{exc}")


def run(start_loop: bool = True) -> None:
    app = App(headless=not start_loop)
    if start_loop:
        app.root.mainloop()
    else:
        app.root.update_idletasks()
        app.root.destroy()
