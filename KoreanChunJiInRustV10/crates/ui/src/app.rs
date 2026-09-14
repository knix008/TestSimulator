//! app.rs - 데스크톱 창 조립.
//!
//! ```text
//! 메뉴 - 툴바 - 편집 영역 - 상태줄 - 천지인 키패드
//! ```
//!
//! 엔진 버퍼가 원본이고 화면은 그것을 비춘다. 화면이 따로 상태를 들고
//! 있지 않으므로 어긋날 자리가 없다. egui 는 곧바로 그리는 방식이라
//! Go 판의 `refresh()` 에 해당하는 것이 따로 없다. 매 프레임이 곧 갱신이다.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use chunjiin_engine::{InputMode, State, KEY_COUNT, MAX_TEXT_LEN, MODE_COUNT};
use egui::{
    Align, Context, Id, Key, Layout, Rect, RichText, Ui, Vec2, ViewportBuilder, ViewportId,
};

use crate::font;
use crate::icons::{Icon, TOOL_ICONS};
use crate::lang::{strings_for, Lang, Strings, FN_COUNT, LANGS};
use crate::layout::{equal_row, v_grid, weighted_row, FN_WEIGHT};
use crate::settings::{
    index_in, load_settings, settings_location, tap_labels, unit_labels, Settings,
    DEFAULT_FONT_SIZE, FONT_CHOICES, TAP_CHOICES,
};
use crate::theme::{ui_role, visuals_for, BtnRole, Palette, PALETTES};
use crate::widgets::{bold_font, icon_button, key_button, status_line, Face};
use crate::TOOL_COUNT;

/// 프로그램 판 번호다.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// 빌드에 쓴 Rust 판이다. `build.rs` 가 채운다.
const RUSTC: &str = env!("CHUNJIIN_RUSTC");

/// 기능 버튼의 자리.
const FN_MODE: usize = 0;
const FN_LEFT: usize = 1;
const FN_SPACE: usize = 2;
const FN_RIGHT: usize = 3;
const FN_ENTER: usize = 4;
const FN_BACKSPACE: usize = 5;

/// 기능 버튼에 글자 대신 그릴 그림이다. `None` 이면 글자를 쓴다.
/// 줄바꿈(↵)과 지우기(⌫)는 내장 글꼴에 없는 글자라 그림으로 그린다.
pub const FN_ICONS: [Option<Icon>; FN_COUNT] = [
    None,
    None,
    None,
    None,
    Some(Icon::Enter),
    Some(Icon::Backspace),
];

/// 키패드 버튼 한 칸의 최소 높이다. 손가락으로 누르기 좋게 넉넉히 잡는다.
const KEY_HEIGHT: f32 = 54.0;
/// 버튼 사이의 틈이다.
const GAP: f32 = 6.0;
/// 툴바 버튼 한 칸의 크기다.
pub const TOOL_SIZE: f32 = 32.0;
/// 툴바 버튼 사이의 틈이다.
pub const TOOL_GAP: f32 = 2.0;
/// 왼쪽 무리와 오른쪽 "정보 · 설정" 사이에 적어도 두는 틈이다.
pub const TOOL_TAIL_GAP: f32 = 10.0;

/// 툴바가 가려지지 않으려면 있어야 하는 최소 폭이다.
///
/// 왼쪽에 `TOOL_COUNT - 2` 칸이 붙어 서고, 틈 하나를 두고, 오른쪽에
/// 정보·설정 두 칸이 붙는다. 창을 이보다 좁게 만들 수 없게 막는 값이라 손으로
/// 적지 않고 셈한다. 버튼 수나 크기를 고치면 저절로 따라간다.
const TOOLBAR_MIN_W: f32 = toolbar_row_w(TOOL_COUNT);

/// 컴팩트 모드 툴바 폭. 정보 단추를 빼므로 한 칸이 줄어든다.
const TOOLBAR_COMPACT_W: f32 = toolbar_row_w(TOOL_COUNT - 1);

const fn toolbar_row_w(n: usize) -> f32 {
    TOOL_SIZE * n as f32 + TOOL_GAP * (n as f32 - 2.0) + TOOL_TAIL_GAP
}

/// 툴바를 감싸는 판의 좌우 여백이다.
///
/// egui 가 판 안쪽에 두는 여백과 창 테두리 몫이다. 이만큼을 더해야
/// 툴바가 실제로 다 보인다.
const PANEL_PAD: f32 = 20.0;

/// 창의 최소 폭. 이보다 좁아지면 툴바 버튼이 가려진다.
pub const MIN_WINDOW_W: f32 = TOOLBAR_MIN_W + PANEL_PAD;

/// 컴팩트 모드일 때 창의 최소 폭이다.
pub const MIN_COMPACT_W: f32 = TOOLBAR_COMPACT_W + PANEL_PAD;

/// 창의 최소 높이. 편집칸이 아주 납작해지지 않을 만큼만 잡는다.
pub const MIN_WINDOW_H: f32 = 560.0;

/// 창을 처음 띄울 때의 크기다.
///
/// 폭은 최소 폭에 그대로 맞춘다. 툴바가 다 보이는 가장 좁은 폭이고,
/// 그보다 넓혀 봐야 편집칸 양옆만 비기 때문이다.
pub const WINDOW_W: f32 = MIN_WINDOW_W;
pub const WINDOW_H: f32 = 760.0;

/// 메모장이 UTF-8 로 알아보게 하려고 저장할 때 붙이는 바이트 순서 표시다.
/// C++ 판이 붙이던 것을 그대로 둔다.
const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

/// 창 하나와 그에 매인 엔진 상태다.
pub struct App {
    state: State,
    set: Settings,
    txt: &'static Strings,
    pal: &'static Palette,

    /// 연타 순환을 끊을 시각. 지나면 [`State::break_multitap`] 을 부른다.
    tap_deadline: Option<Instant>,

    show_settings: bool,
    show_help: bool,
    show_about: bool,
    /// 설정 창을 열 때의 값. 취소하면 이리로 되돌린다.
    settings_backup: Settings,

    /// 잘못된 일을 알리는 상자. 비어 있으면 띄우지 않는다.
    error: Option<String>,

    /// 이 프레임에 편집칸으로 초점을 되돌릴지.
    grab_focus: bool,
    styled: bool,

    /// 딸린 창마다 크기를 맞출 판이 몇 번 남았는지.
    ///
    /// 없으면 아직 한 번도 맞추지 않았다는 뜻이다. 창을 열 때 지우므로
    /// 다시 열면 그때 글자 길이로 새로 잰다.
    fitting: HashMap<&'static str, u8>,
}

const EDITOR_ID: &str = "chunjiin-editor";

impl Default for App {
    fn default() -> Self {
        Self::new()
    }
}

impl App {
    /// 앱을 만든다. 설정을 읽어 시작 모드까지 맞춘다.
    pub fn new() -> App {
        let set = load_settings();
        let mut state = State::new();
        state.set_mode_index(set.start_mode);

        App {
            txt: strings_for(set.lang()),
            pal: &PALETTES[set.theme.min(PALETTES.len() - 1)],
            settings_backup: set.clone(),
            state,
            set,
            tap_deadline: None,
            show_settings: false,
            show_help: false,
            show_about: false,
            error: None,
            grab_focus: true,
            styled: false,
            fitting: HashMap::new(),
        }
    }

    /// 붓과 함께 앱을 만든다. **앱을 만드는 길은 이것 하나다.**
    ///
    /// 내장 글꼴을 여기서 등록한다. `Context::set_fonts` 는 다음 판부터
    /// 듣기 때문에 첫 판을 그리기 **전에** 불러야 한다. 그리는 도중에
    /// 부르면 굵은 갈래를 찾다가 죽는다. 그래서 만들기와 한 자리에 묶어
    /// 두어 빠뜨릴 수 없게 했다.
    pub fn new_in(ctx: &Context) -> App {
        font::install(ctx);
        App::new()
    }

    /// eframe 이 부르는 만들기다.
    pub fn with_cc(cc: &eframe::CreationContext<'_>) -> App {
        App::new_in(&cc.egui_ctx)
    }

    fn editor_id(&self) -> Id {
        Id::new(EDITOR_ID)
    }

    /// 대화 상자가 하나라도 떠 있는지 본다.
    fn modal_open(&self) -> bool {
        self.show_settings || self.show_help || self.show_about || self.error.is_some()
    }

    // -----------------------------------------------------------------
    // 겉모습
    // -----------------------------------------------------------------

    /// 색 · 글꼴 크기를 지금 설정에 맞춘다.
    fn apply_theme(&mut self, ctx: &Context) {
        self.pal = &PALETTES[self.set.theme.min(PALETTES.len() - 1)];
        self.txt = strings_for(self.set.lang());

        // 테마는 우리가 정하므로 밝은 쪽과 어두운 쪽에 같은 색을 준다.
        // 운영체제의 밝기 설정이 우리 팔레트를 뒤엎지 않게 하려는 것이다.
        let visuals = visuals_for(self.pal);
        ctx.all_styles_mut(|style| {
            style.visuals = visuals.clone();
            style.spacing.item_spacing = Vec2::splat(ITEM_SPACING);
            style.spacing.button_padding = Vec2::new(BTN_PAD, 5.0);
            style.spacing.interact_size.y = 24.0;
        });

        // 키패드를 눌러도 편집칸이 초점을 놓지 않게 한다.
        //
        // 기본값은 "초점 밖을 누르면 놓는다" 라서, 키를 누를 때마다 초점이
        // 풀렸다 다음 판에 되돌아온다. 그 사이 깜박이는 막대가 사라져
        // 화면이 깜빡이는 것처럼 보였다. 물리 키보드는 어차피 우리가
        // 먼저 가로채므로 초점을 놓을 까닭이 없다.
        ctx.options_mut(|o| {
            o.input_options.surrender_focus_on = egui::SurrenderFocusOn::Never;
        });
    }

    fn save_and_apply(&mut self, ctx: &Context) {
        let _ = self.set.save();
        self.apply_theme(ctx);
        self.apply_window_size(ctx);
    }

    /// 컴팩트 모드에 맞춰 창의 최소 폭을 바꾼다.
    fn apply_window_size(&self, ctx: &Context) {
        let min_w = if self.set.compact {
            MIN_COMPACT_W
        } else {
            MIN_WINDOW_W
        };
        ctx.send_viewport_cmd(egui::ViewportCommand::MinInnerSize([min_w, MIN_WINDOW_H].into()));
        if self.set.compact {
            ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize([min_w, WINDOW_H].into()));
        }
    }

    // -----------------------------------------------------------------
    // 명령
    // -----------------------------------------------------------------

    fn do_new(&mut self) {
        self.state.clear();
    }

    fn cycle_mode(&mut self) {
        self.state.cycle_mode();
    }

    fn cycle_theme(&mut self, ctx: &Context) {
        self.set.theme = (self.set.theme + 1) % PALETTES.len();
        self.save_and_apply(ctx);
    }

    fn set_language(&mut self, ctx: &Context, l: Lang) {
        self.set.language = l.code().to_string();
        // 글자 길이가 달라지므로 떠 있는 창의 크기를 다시 재게 한다.
        self.fitting.clear();
        self.save_and_apply(ctx);
    }

    fn cycle_language(&mut self, ctx: &Context) {
        let next = self.set.lang().next();
        self.set_language(ctx, next);
    }

    fn do_copy(&mut self, ctx: &Context) {
        self.state.commit();
        ctx.copy_text(self.state.text());
    }

    fn do_paste(&mut self) {
        // 클립보드를 읽지 못하면(권한 · 빈 클립보드) 아무것도 하지 않는다.
        if let Some(text) = crate::clipboard::read() {
            self.state.insert_str(&text);
        }
    }

    fn do_open(&mut self) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("텍스트 파일 (*.txt)", &["txt"])
            .set_file_name("chunjiin.txt")
            .pick_file()
        else {
            return;
        };

        match std::fs::read(&path) {
            Ok(data) => self.state.set_text(&decode_saved_text(&data)),
            Err(e) => self.error = Some(format!("{}: {e}", self.txt.err_open)),
        }
    }

    fn do_save(&mut self) {
        self.state.commit();

        let Some(path) = rfd::FileDialog::new()
            .add_filter("텍스트 파일 (*.txt)", &["txt"])
            .set_file_name("chunjiin.txt")
            .save_file()
        else {
            return;
        };

        if let Err(e) = std::fs::write(&path, encode_saved_text(&self.state.text())) {
            self.error = Some(format!("{}: {e}", self.txt.err_save));
        }
    }

    // -----------------------------------------------------------------
    // 입력
    // -----------------------------------------------------------------

    /// 키패드 키 하나를 누른 것으로 처리하고 연타 시계를 다시 잰다.
    fn do_key(&mut self, i: usize) {
        self.state.key(i as i32);
        self.restart_tap_timer();
    }

    /// 정해 둔 시간이 지나면 연타 순환을 끊는다.
    ///
    /// 그래야 `"안녕"` 처럼 같은 키를 연달아 써야 하는 낱말을 칠 수 있다.
    /// Go 판은 시계를 따로 돌렸지만, egui 는 프레임마다 도니까 다음 프레임을
    /// 그때에 맞춰 달라고 하고 [`App::tick_multitap`] 에서 확인하면 된다.
    fn restart_tap_timer(&mut self) {
        self.tap_deadline = Some(Instant::now() + Duration::from_millis(self.set.multitap_ms));
    }

    fn tick_multitap(&mut self, ctx: &Context) {
        let Some(at) = self.tap_deadline else { return };
        let now = Instant::now();
        if now >= at {
            // 조합 중인 글자는 그대로 두고 "다음 같은 키는 새 글자" 라고만 한다.
            self.state.break_multitap();
            self.tap_deadline = None;
        } else {
            ctx.request_repaint_after(at - now);
        }
    }

    /// 한글 모드에서 숫자열을 키패드에 대응시킨다. 없으면 `None`.
    ///
    /// ```text
    /// 1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
    /// 4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !
    /// ```
    pub fn hangul_key_of(key: Key) -> Option<usize> {
        Some(match key {
            Key::Num1 => 0,
            Key::Num2 => 1,
            Key::Num3 => 2,
            Key::Num4 => 3,
            Key::Num5 => 4,
            Key::Num6 => 5,
            Key::Num7 => 6,
            Key::Num8 => 7,
            Key::Num9 => 8,
            Key::Minus => 9,
            Key::Num0 => 10,
            Key::Equals => 11,
            _ => return None,
        })
    }

    /// 물리 키보드를 처리하고, 처리한 이벤트는 egui 의 줄에서 빼낸다.
    ///
    /// 편집칸이 스스로 글자를 받지 못하게 막는 자리다. C++ 판이 읽기 전용
    /// `EDIT` 컨트롤을 서브클래스해서 하던 일과 같다.
    fn handle_input(&mut self, ctx: &Context) {
        let events = ctx.input(|i| i.events.clone());
        let modal = self.modal_open();
        let mut used = false;

        for ev in &events {
            match ev {
                egui::Event::Key {
                    key,
                    pressed: true,
                    modifiers,
                    ..
                } => {
                    if modal {
                        // 대화 상자가 떠 있으면 Esc 로 닫기만 한다.
                        if *key == Key::Escape {
                            self.close_modals();
                            used = true;
                        }
                        continue;
                    }
                    if modifiers.command {
                        match key {
                            Key::N => self.do_new(),
                            Key::O => self.do_open(),
                            Key::S => self.do_save(),
                            Key::C => self.do_copy(ctx),
                            Key::V => self.do_paste(),
                            _ => continue,
                        }
                        used = true;
                        continue;
                    }
                    if self.handle_key(ctx, *key) {
                        used = true;
                    }
                }

                egui::Event::Text(text) if !modal => {
                    // 한글 모드에서는 키패드에 대응하는 키만 받는다.
                    if self.state.now_mode != InputMode::Hangul {
                        for ch in text.chars() {
                            if ch >= ' ' && ch != '\u{7f}' {
                                self.state.insert_char(ch);
                            }
                        }
                    }
                    used = true;
                }

                egui::Event::Paste(text) if !modal => {
                    self.state.insert_str(text);
                    used = true;
                }

                egui::Event::Copy | egui::Event::Cut if !modal => {
                    self.do_copy(ctx);
                    used = true;
                }

                _ => {}
            }
        }

        if used || !modal {
            // 편집칸이 직접 고치지 못하도록 글자 계열 이벤트를 걷어낸다.
            // 마우스 이벤트는 남겨 두어야 찍어서 커서를 옮길 수 있다.
            ctx.input_mut(|i| {
                i.events.retain(|e| {
                    !matches!(
                        e,
                        egui::Event::Key { .. }
                            | egui::Event::Text(_)
                            | egui::Event::Paste(_)
                            | egui::Event::Copy
                            | egui::Event::Cut
                    )
                })
            });
        }
    }

    /// 키 하나를 엔진 쪽 동작으로 돌린다. 처리했으면 참이다.
    fn handle_key(&mut self, ctx: &Context, key: Key) -> bool {
        if self.state.now_mode == InputMode::Hangul {
            if let Some(k) = Self::hangul_key_of(key) {
                self.do_key(k);
                return true;
            }
        }

        match key {
            Key::Space => self.state.space(),
            Key::Backspace => self.state.backspace(),
            Key::Enter => self.state.insert_char('\n'),
            Key::ArrowLeft => self.state.move_cursor(-1),
            Key::ArrowRight => self.state.move_cursor(1),
            Key::Home => self.state.set_cursor(0),
            Key::End => self.state.set_cursor(self.state.len()),
            Key::Delete => self.state.delete(),
            Key::Escape => self.state.commit(),
            Key::F1 => self.open_help(),
            Key::F2 => self.cycle_mode(),
            Key::F3 => self.cycle_theme(ctx),
            Key::F4 => self.open_settings(),
            _ => return false,
        }
        true
    }

    fn open_settings(&mut self) {
        self.settings_backup = self.set.clone();
        self.show_settings = true;
        self.fitting.remove("settings");
    }

    fn close_modals(&mut self) {
        self.show_help = false;
        self.show_about = false;
        self.error = None;
        if self.show_settings {
            self.cancel_settings();
        }
        self.grab_focus = true;
    }

    fn cancel_settings(&mut self) {
        self.set = self.settings_backup.clone();
        self.show_settings = false;
    }

    // -----------------------------------------------------------------
    // 화면 만들기
    // -----------------------------------------------------------------

    fn status_text(&self) -> String {
        let comp = self.state.composition_text();
        let comp = if comp.is_empty() {
            self.txt.status_none.to_string()
        } else {
            comp
        };
        format!(
            "{}    {} {}    {}{}",
            self.txt.mode_names[self.state.now_mode.index()],
            self.txt.status_composing,
            comp,
            self.state.len(),
            self.txt.status_chars,
        )
    }

    fn menu_bar(&mut self, ui: &mut Ui, ctx: &Context) {
        let t = self.txt;

        egui::MenuBar::new().ui(ui, |ui| {
            ui.menu_button(t.menu_file, |ui| {
                if ui.button(format!("{}\tCtrl+N", t.new)).clicked() {
                    self.do_new();
                    ui.close();
                }
                if ui.button(format!("{}\tCtrl+O", t.open)).clicked() {
                    self.do_open();
                    ui.close();
                }
                if ui.button(format!("{}\tCtrl+S", t.save)).clicked() {
                    self.do_save();
                    ui.close();
                }
                ui.separator();
                if ui.button(t.quit).clicked() {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                }
            });

            ui.menu_button(t.menu_edit, |ui| {
                if ui.button(format!("{}\tCtrl+C", t.copy)).clicked() {
                    self.do_copy(ctx);
                    ui.close();
                }
                if ui.button(format!("{}\tCtrl+V", t.paste)).clicked() {
                    self.do_paste();
                    ui.close();
                }
                ui.separator();
                if ui.button(t.clear_all).clicked() {
                    self.do_new();
                    ui.close();
                }
            });

            // 입력 모드: 지금 쓰는 모드만 채워진 동그라미로 보인다.
            ui.menu_button(t.menu_input, |ui| {
                for i in 0..MODE_COUNT {
                    let on = self.state.now_mode.index() == i;
                    if ui.radio(on, t.mode_names[i]).clicked() {
                        self.state.set_mode_index(i);
                        ui.close();
                    }
                }
                ui.separator();
                if ui.button(t.next_mode).clicked() {
                    self.cycle_mode();
                    ui.close();
                }
            });

            ui.menu_button(t.menu_config, |ui| {
                ui.menu_button(t.theme, |ui| {
                    for (i, name) in t.theme_names.iter().enumerate() {
                        if ui.radio(self.set.theme == i, *name).clicked() {
                            self.set.theme = i;
                            self.save_and_apply(ctx);
                            ui.close();
                        }
                    }
                    ui.separator();
                    if ui.button(t.next_theme).clicked() {
                        self.cycle_theme(ctx);
                        ui.close();
                    }
                });
                ui.menu_button(t.language, |ui| {
                    for l in LANGS {
                        if ui.radio(self.set.lang() == l, l.name()).clicked() {
                            self.set_language(ctx, l);
                            ui.close();
                        }
                    }
                });
                ui.separator();
                if ui
                    .checkbox(&mut self.set.show_toolbar, t.show_toolbar)
                    .changed()
                {
                    self.save_and_apply(ctx);
                }
                if ui
                    .checkbox(&mut self.set.show_status, t.show_status)
                    .changed()
                {
                    self.save_and_apply(ctx);
                }
                if ui
                    .checkbox(&mut self.set.compact, t.compact_mode)
                    .changed()
                {
                    self.save_and_apply(ctx);
                }
                ui.separator();
                if ui.button(format!("{}\tF4", t.settings_dots)).clicked() {
                    self.open_settings();
                    ui.close();
                }
            });

            ui.menu_button(t.menu_help, |ui| {
                if ui.button(format!("{}\tF1", t.usage)).clicked() {
                    self.open_help();
                    ui.close();
                }
                if ui.button(t.about_item).clicked() {
                    self.open_about();
                    ui.close();
                }
            });
        });
    }

    /// 툴바를 그린다. 정보와 설정을 오른쪽 끝에 붙인다. 정보는 설정 왼쪽이다.
    ///
    /// 컴팩트 모드에서는 정보 단추를 그리지 않는다. 정보는 컨텍스트 메뉴에 있다.
    ///
    /// 창은 최소 폭보다 좁아질 수 없으므로 보통은 제 크기로 그린다.
    /// 그보다 좁아지면 버튼을 줄여서라도 칸을 모두 보인다.
    fn toolbar(&mut self, ui: &mut Ui, ctx: &Context) {
        let compact = self.set.compact;
        let vis: Vec<(usize, Icon)> = TOOL_ICONS
            .iter()
            .copied()
            .enumerate()
            .filter(|(_, ic)| !compact || *ic != Icon::About)
            .collect();
        let n = vis.len();
        let tail = if compact { 1 } else { 2 };

        let full = ui.available_rect_before_wrap();
        let (size, gap, tail_gap) = toolbar_metrics_n(full.width(), n);

        let row = Rect::from_min_size(full.min, Vec2::new(full.width(), size));
        ui.allocate_rect(row, egui::Sense::hover());

        for (vis_i, (i, ic)) in vis.iter().enumerate() {
            let x = row.left() + toolbar_slot_x_n(vis_i, n, tail, full.width(), size, gap, tail_gap);
            let at = Rect::from_min_size(egui::pos2(x, row.top()), Vec2::splat(size));

            let clicked = icon_button(
                ui,
                at,
                Id::new(("tool", i)),
                self.pal,
                *ic,
                self.txt.tips[*i],
            )
            .clicked();

            if clicked {
                self.run_tool(ctx, *i);
            }
        }
    }

    fn run_tool(&mut self, ctx: &Context, i: usize) {
        match i {
            0 => self.do_new(),
            1 => self.do_open(),
            2 => self.do_save(),
            3 => self.do_copy(ctx),
            4 => self.do_paste(),
            5 => self.do_new(),
            6 => self.cycle_mode(),
            7 => self.cycle_theme(ctx),
            8 => self.cycle_language(ctx),
            9 => self.open_about(),
            _ => self.open_settings(),
        }
    }

    /// 키패드 5행을 그린다. 위 4행은 3열 균등, 마지막 행은 비율이다.
    fn keypad(&mut self, ui: &mut Ui) {
        let area = ui.available_rect_before_wrap();
        ui.allocate_rect(area, egui::Sense::hover());

        let rows = v_grid(area.height(), GAP, 5);

        // 위 4행 - 천지인 12키
        for (r, (y, h)) in rows.iter().take(4).enumerate() {
            for (c, (x, w)) in equal_row(area.width(), GAP, 3).into_iter().enumerate() {
                let i = r * 3 + c;
                let at = Rect::from_min_size(
                    egui::pos2(area.left() + x, area.top() + y),
                    Vec2::new(w, *h),
                );
                let clicked = key_button(
                    ui,
                    at,
                    Id::new(("key", i)),
                    self.pal,
                    ui_role(self.state.key_role_of(i)),
                    Face::Text(self.state.key_label(i)),
                    19.0,
                )
                .clicked();
                if clicked {
                    self.do_key(i);
                }
            }
        }

        // 마지막 행 - 기능 버튼
        let (y, h) = rows[4];
        for (i, (x, w)) in weighted_row(area.width(), GAP, &FN_WEIGHT)
            .into_iter()
            .enumerate()
        {
            let at =
                Rect::from_min_size(egui::pos2(area.left() + x, area.top() + y), Vec2::new(w, h));
            let role = if i == FN_MODE {
                BtnRole::Primary
            } else {
                BtnRole::Fn
            };
            let face = match FN_ICONS[i] {
                Some(ic) => Face::Icon(ic),
                None => Face::Text(self.txt.fn_labels[i]),
            };

            let r = key_button(ui, at, Id::new(("fn", i)), self.pal, role, face, 16.0)
                .on_hover_text(self.txt.fn_hints[i]);
            if r.clicked() {
                self.run_fn(i);
            }
        }
    }

    fn run_fn(&mut self, i: usize) {
        match i {
            FN_MODE => self.cycle_mode(),
            FN_LEFT => self.state.move_cursor(-1),
            FN_SPACE => self.state.space(),
            FN_RIGHT => self.state.move_cursor(1),
            FN_ENTER => self.state.insert_char('\n'),
            FN_BACKSPACE => self.state.backspace(),
            _ => {}
        }
    }

    /// 편집 영역을 그린다.
    ///
    /// egui 의 여러 줄 입력칸을 쓰되 **직접 타이핑하지 못하게** 막는다.
    /// [`App::handle_input`] 이 글자 계열 이벤트를 미리 걷어냈으므로 여기서
    /// 들어오는 것은 마우스뿐이다. 찍은 자리는 엔진 커서로 되돌린다.
    fn editor(&mut self, ui: &mut Ui, ctx: &Context) {
        let id = self.editor_id();

        // 입력칸이 고치는 것은 이 임시 버퍼다. 엔진으로 되돌리지 않으므로
        // 무엇이 들어와도 다음 판에 엔진 내용으로 덮인다.
        let mut buf = self.state.text();

        // 커서와 초점을 **그리기 전에** 심는다.
        //
        // 그린 뒤에 심으면 이 판에는 옛 자리가 그려지고 새 자리는 다음 판에나
        // 나온다. 다음 판은 다음 입력이 올 때까지 오지 않으므로, 글자는 바로
        // 찍히는데 깜박이는 막대만 한 박자 늦게 따라와 굼떠 보인다.
        let mut st = egui::text_edit::TextEditState::load(ctx, id).unwrap_or_default();
        st.cursor.set_char_range(Some(egui::text::CCursorRange::one(
            egui::text::CCursor::new(self.state.cursor_pos),
        )));
        st.store(ctx, id);

        if !self.modal_open() {
            ui.memory_mut(|m| m.request_focus(id));
            self.grab_focus = false;
        }

        // 편집칸이 남은 자리를 다 차지하게 한다. 창을 키우면 같이 커진다.
        let avail = ui.available_size();

        let out = egui::TextEdit::multiline(&mut buf)
            .id(id)
            .font(egui::FontId::proportional(self.set.font_size as f32))
            .desired_width(f32::INFINITY)
            .min_size(avail)
            .lock_focus(true)
            .show(ui);

        // 마우스로 찍은 자리는 엔진 커서로 되돌린다.
        // 이때만 엔진이 입력칸을 따라간다.
        if out.response.clicked() || out.response.drag_stopped() {
            if let Some(range) = out.state.cursor.char_range() {
                self.state
                    .set_cursor(range.primary.index.0.min(self.state.len()));
            }
        }

        self.context_menu(&out.response, ctx);
    }

    /// 편집칸을 오른쪽 단추로 눌렀을 때 나오는 메뉴다.
    ///
    /// 컴팩트 모드에는 툴바에 정보 단추가 없으므로, 여기서 연다.
    fn context_menu(&mut self, response: &egui::Response, ctx: &Context) {
        let t = self.txt;
        response.context_menu(|ui| {
            if ui.button(format!("{}\tCtrl+C", t.copy)).clicked() {
                self.do_copy(ctx);
                ui.close();
            }
            if ui.button(format!("{}\tCtrl+V", t.paste)).clicked() {
                self.do_paste();
                ui.close();
            }
            ui.separator();
            if ui.button(format!("{}\tF4", t.settings_dots)).clicked() {
                self.open_settings();
                ui.close();
            }
            if ui.button(t.about_item).clicked() {
                self.open_about();
                ui.close();
            }
            if ui.button(format!("{}\tF1", t.usage)).clicked() {
                self.open_help();
                ui.close();
            }
        });
    }

    // -----------------------------------------------------------------
    // 딸린 창들
    //
    // 진짜 창으로 띄운다(C++ 판도 그랬다). 그래야 제목 표시줄에 아이콘과
    // 제목이 함께 나오고, 본문이 잘리지 않을 만큼 넉넉히 줄 수 있다.
    // -----------------------------------------------------------------

    fn sub_windows(&mut self, ctx: &Context) {
        if self.show_help {
            // 70줄을 한 줄로 세우면 창이 화면보다 길어진다. 구역 단위로
            // 두 칸에 나눠 놓아 스크롤 없이 한눈에 들어오게 한다.
            let (left, right) = crate::help::two_columns(self.txt.help);

            self.show_help = !window(
                ctx,
                "help",
                self.txt.help_title,
                help_width(ctx, &left, &right),
                |ui, app| help_body(ui, &left, &right, app.txt.close),
                self,
            );
        }

        if self.show_about {
            self.show_about = !window(
                ctx,
                "about",
                self.txt.about_title,
                self.about_width(ctx),
                |ui, app| {
                    app.about_body(ui);
                    close_row(ui, app.txt.close)
                },
                self,
            );
        }

        if self.show_settings {
            let mut closed = false;
            let mut cancel = false;
            let done = window(
                ctx,
                "settings",
                self.txt.set_title,
                self.settings_width(ctx),
                |ui, app| {
                    app.settings_form(ui, ctx);

                    // 왼쪽에 "기본값", 오른쪽에 "취소 · 확인" 을 붙인다.
                    // 글자는 미리 꺼내 둔다. 두 쪽 모두 app 을 빌려 쓰기 때문이다.
                    let (l_default, l_ok, l_cancel) =
                        (app.txt.set_default, app.txt.set_ok, app.txt.set_cancel);

                    let mut finish = false;
                    let mut defaults = false;
                    button_row(ui, |ui| {
                        // 오른쪽에서 왼쪽으로 놓이므로 확인이 먼저다.
                        if ui.button(l_ok).clicked() {
                            finish = true;
                        }
                        if ui.button(l_cancel).clicked() {
                            cancel = true;
                            finish = true;
                        }
                        // 남은 자리 맨 왼쪽에 기본값을 붙인다.
                        ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                            defaults = ui.button(l_default).clicked();
                        });
                    });

                    if defaults {
                        // 언어는 기본값 단추로 되돌리지 않는다
                        let lang = app.set.language.clone();
                        app.set = Settings {
                            language: lang,
                            ..Settings::default()
                        };
                        app.apply_theme(ctx);
                    }
                    finish
                },
                self,
            );

            if done {
                closed = true;
            }
            if closed {
                if cancel {
                    self.cancel_settings();
                    self.apply_theme(ctx);
                } else {
                    let _ = self.set.save();
                    self.show_settings = false;
                }
                self.grab_focus = true;
            }
        }

        if let Some(msg) = self.error.clone() {
            let close = window(
                ctx,
                "error",
                self.txt.app_title,
                ERROR_W,
                |ui, app| {
                    ui.add_space(4.0);
                    ui.label(RichText::new(&msg).size(14.0));
                    close_row(ui, app.txt.close)
                },
                self,
            );
            if close {
                self.error = None;
                self.grab_focus = true;
            }
        }
    }

    /// 설정 창의 본문 폭이다.
    ///
    /// 이름표 칸 가운데 가장 넓은 것 + 사이 틈 + 고르기 상자다.
    /// 아래 단추 줄이 그보다 넓으면 그쪽에 맞춘다.
    fn settings_width(&self, ctx: &Context) -> f32 {
        let t = self.txt;
        let font = egui::FontId::proportional(14.0);

        let labels = [
            t.set_theme,
            t.set_language,
            t.set_font_size,
            t.set_tap_time,
            t.set_start_mode,
        ];
        let name_col = widest(ctx, labels.iter().map(|s| s.to_string()), font.clone());

        // 켜고 끄는 것은 표 밖에서 왼쪽부터 그린다. 네모 칸 몫을 더한다.
        let checks = widest(
            ctx,
            [t.show_toolbar, t.show_status, t.compact_mode]
                .iter()
                .map(|s| s.to_string()),
            font.clone(),
        ) + CHECKBOX_W;

        let form = (name_col + GRID_GAP + COMBO_W).max(checks);

        // 단추 세 개 + 사이 틈. 단추마다 좌우 여백이 붙는다.
        let buttons = widest(
            ctx,
            [t.set_default, t.set_ok, t.set_cancel]
                .iter()
                .map(|s| s.to_string()),
            font,
        ) * 3.0
            + BTN_PAD * 6.0
            + 40.0;

        form.max(buttons)
    }

    /// 프로그램 정보 창의 본문 폭이다. 가장 긴 줄에 맞춘다.
    fn about_width(&self, ctx: &Context) -> f32 {
        let t = self.txt;
        let font = egui::FontId::proportional(14.0);
        let bold = bold_font(13.0);

        let name_col = widest(
            ctx,
            [
                t.about_author,
                t.about_engine,
                t.about_build,
                t.about_platform,
                t.about_font,
                t.about_theme,
            ]
            .iter()
            .map(|s| s.to_string()),
            bold,
        );

        let value_col = widest(
            ctx,
            [
                "SHKWON  (knix008@naver.com)".to_string(),
                "KoreanChunJiInC++ : chunjiin.c / input.c".to_string(),
                format!("{RUSTC}  ·  egui"),
                format!("{}/{}", std::env::consts::OS, std::env::consts::ARCH),
                "Noto Sans KR (SIL OFL 1.1)".to_string(),
                t.theme_names[self.set.theme].to_string(),
            ],
            font.clone(),
        );

        // 설정 파일 경로는 표 아래에 따로 한 줄을 차지한다.
        let path = text_w(ctx, &settings_location(), egui::FontId::monospace(12.0));
        let head = text_w(
            ctx,
            &format!("{}   {VERSION}", t.app_title),
            bold_font(16.0),
        );

        (name_col + GRID_GAP + value_col).max(path).max(head)
    }

    /// 설정 창의 본문이다. 고르는 즉시 적용해서 미리 보여 준다.
    fn settings_form(&mut self, ui: &mut Ui, ctx: &Context) {
        let t = self.txt;

        egui::Grid::new("settings-form")
            .num_columns(2)
            .spacing([GRID_GAP, 10.0])
            .show(ui, |ui| {
                ui.label(t.set_theme);
                let mut theme = self.set.theme;
                combo(ui, "theme", &t.theme_names, &mut theme);
                if theme != self.set.theme {
                    self.set.theme = theme;
                    self.apply_theme(ctx);
                }
                ui.end_row();

                ui.label(t.set_language);
                let names: Vec<&str> = LANGS.iter().map(|l| l.name()).collect();
                let mut at = LANGS
                    .iter()
                    .position(|l| *l == self.set.lang())
                    .unwrap_or(0);
                combo(ui, "lang", &names, &mut at);
                if LANGS[at] != self.set.lang() {
                    self.set_language(ctx, LANGS[at]);
                }
                ui.end_row();

                ui.label(t.set_font_size);
                let labels =
                    unit_labels(&FONT_CHOICES, DEFAULT_FONT_SIZE, t.unit_px, t.mark_default);
                let mut at = index_in(&FONT_CHOICES, &self.set.font_size);
                combo(ui, "font", &labels, &mut at);
                self.set.font_size = FONT_CHOICES[at];
                ui.end_row();

                ui.label(t.set_tap_time);
                let labels = tap_labels(t.unit_sec, t.mark_default);
                let mut at = index_in(&TAP_CHOICES, &self.set.multitap_ms);
                combo(ui, "tap", &labels, &mut at);
                self.set.multitap_ms = TAP_CHOICES[at];
                ui.end_row();

                ui.label(t.set_start_mode);
                combo(ui, "mode", &t.mode_names, &mut self.set.start_mode);
                ui.end_row();
            });

        // 켜고 끄는 것은 이름표 칸이 없다. 표 밖에 두어 왼쪽에 나란히 세운다.
        ui.add_space(8.0);
        ui.checkbox(&mut self.set.show_toolbar, t.show_toolbar);
        ui.checkbox(&mut self.set.show_status, t.show_status);
        ui.checkbox(&mut self.set.compact, t.compact_mode);
    }

    /// 프로그램 정보 창의 본문이다.
    ///
    /// 이름·판 번호를 머리에 두고, 그 아래에 이름표와 값을 두 줄로 세운다.
    /// 값은 어느 것도 접지 않는다. 접으면 폭에 따라 높이가 달라져서
    /// 창을 내용에 맞출 수가 없다. 설정 파일 경로처럼 긴 값은 마지막에
    /// 따로 한 줄을 준다.
    fn about_body(&self, ui: &mut Ui) {
        let t = self.txt;

        ui.add_space(2.0);
        ui.label(RichText::new(format!("{}   {VERSION}", t.app_title)).font(bold_font(16.0)));
        ui.label(t.about_body);
        ui.add_space(6.0);
        ui.separator();
        ui.add_space(4.0);

        let rows: [(&str, String); 6] = [
            (t.about_author, "SHKWON  (knix008@naver.com)".into()),
            (
                t.about_engine,
                "KoreanChunJiInC++ : chunjiin.c / input.c".into(),
            ),
            (t.about_build, format!("{RUSTC}  ·  egui")),
            (
                t.about_platform,
                format!("{}/{}", std::env::consts::OS, std::env::consts::ARCH),
            ),
            (t.about_font, "Noto Sans KR (SIL OFL 1.1)".into()),
            (t.about_theme, t.theme_names[self.set.theme].to_string()),
        ];

        egui::Grid::new("about-form")
            .num_columns(2)
            .spacing([GRID_GAP, 6.0])
            .show(ui, |ui| {
                for (k, v) in rows {
                    ui.label(RichText::new(k).font(bold_font(13.0)));
                    ui.label(v);
                    ui.end_row();
                }
            });

        ui.add_space(6.0);
        ui.label(RichText::new(t.about_settings).font(bold_font(13.0)));
        ui.label(RichText::new(settings_location()).monospace().size(12.0));
    }
}

// ---------------------------------------------------------------------
// 시험이 쓰는 손잡이
//
// 화면 없이도 상태를 바꿔 가며 한 판씩 그려 볼 수 있게 열어 둔다.
// 사람이 단추를 누르는 것과 같은 자리를 부른다.
// ---------------------------------------------------------------------

impl App {
    /// 지금 엔진 상태다.
    pub fn state(&self) -> &State {
        &self.state
    }

    /// 엔진 상태를 고칠 수 있게 빌려준다.
    pub fn state_mut(&mut self) -> &mut State {
        &mut self.state
    }

    /// 지금 설정이다.
    pub fn settings(&self) -> &Settings {
        &self.set
    }

    /// 테마를 고른다. 다음 판에 색이 바뀐다.
    pub fn set_theme(&mut self, i: usize) {
        self.set.theme = i.min(PALETTES.len() - 1);
        self.styled = false;
    }

    /// 화면 언어를 고른다. 다음 판에 글자가 바뀐다.
    pub fn set_lang(&mut self, l: Lang) {
        self.set.language = l.code().to_string();
        self.txt = strings_for(l);
        self.styled = false;
    }

    /// 사용법 창을 연다.
    pub fn open_help(&mut self) {
        self.show_help = true;
        self.fitting.remove("help");
    }

    /// 프로그램 정보 창을 연다.
    pub fn open_about(&mut self) {
        self.show_about = true;
        self.fitting.remove("about");
    }

    /// 설정 창을 연다.
    pub fn open_settings_window(&mut self) {
        self.open_settings();
    }

    /// 떠 있는 창을 모두 닫는다.
    pub fn close_all(&mut self) {
        self.close_modals();
    }

    /// 편집칸을 비운다. 툴바의 지우기 · 새로 만들기와 같다.
    pub fn clear_text(&mut self) {
        self.do_new();
    }

    /// 물리 키 하나를 사람이 친 것처럼 넣는다.
    pub fn press(&mut self, ctx: &Context, key: Key) -> bool {
        self.handle_key(ctx, key)
    }

    /// 화면에 보이는 상태줄 글이다.
    pub fn status_line(&self) -> String {
        self.status_text()
    }

    pub fn help_open(&self) -> bool {
        self.show_help
    }

    pub fn about_open(&self) -> bool {
        self.show_about
    }

    pub fn settings_open(&self) -> bool {
        self.show_settings
    }
}

/// 저장 파일에 붙이는 UTF-8 BOM 이다. 메모장 같은 프로그램이 한글을
/// 다른 코드 페이지로 읽지 않게 한다.
pub fn encode_saved_text(text: &str) -> Vec<u8> {
    let mut data = UTF8_BOM.to_vec();
    data.extend_from_slice(text.as_bytes());
    data
}

/// 저장 파일을 읽는다. 앞에 BOM 이 있으면 떼고, 버퍼가 담을 수 있는
/// 만큼만 남긴다. Go 판 `TestAppFileRoundTrip` 과 같은 규칙이다.
pub fn decode_saved_text(data: &[u8]) -> String {
    let body = data.strip_prefix(&UTF8_BOM[..]).unwrap_or(data);
    String::from_utf8_lossy(body)
        .chars()
        .take(MAX_TEXT_LEN - 1)
        .collect()
}

/// 고르기 상자 하나를 그린다.
fn combo<S: AsRef<str>>(ui: &mut Ui, id: &str, items: &[S], at: &mut usize) {
    let shown = items
        .get(*at)
        .map(|s| s.as_ref().to_string())
        .unwrap_or_default();

    egui::ComboBox::from_id_salt(id)
        .selected_text(shown)
        .width(COMBO_W)
        .show_ui(ui, |ui| {
            for (i, item) in items.iter().enumerate() {
                ui.selectable_value(at, i, item.as_ref());
            }
        });
}

/// 주어진 폭에 맞는 툴바 칸 크기 · 틈 · 꼬리 틈을 셈한다.
///
/// [`TOOLBAR_MIN_W`] 보다 넓으면 제 크기 그대로다. 좁으면 그 비율만큼
/// 모두 줄인다. 줄여서라도 열한 칸을 다 보이는 편이 몇 개를 잘라 내는
/// 것보다 낫다.
pub fn toolbar_metrics(width: f32) -> (f32, f32, f32) {
    toolbar_metrics_n(width, TOOL_COUNT)
}

/// `n` 칸이 다 들어가는 비율로 칸 크기 · 틈 · 꼬리 틈을 셈한다.
pub fn toolbar_metrics_n(width: f32, n: usize) -> (f32, f32, f32) {
    let need = toolbar_row_w(n);
    let scale = (width / need).clamp(0.1, 1.0);
    (TOOL_SIZE * scale, TOOL_GAP * scale, TOOL_TAIL_GAP * scale)
}

/// `i` 번째 툴바 칸의 왼쪽 자리다(툴바 왼쪽 끝을 0 으로 본다).
///
/// 마지막 두 칸(정보 · 설정)만 오른쪽 끝에 붙인다. 정보는 설정 왼쪽이다.
/// 왼쪽 무리를 파고들지는 않는다.
pub fn toolbar_slot_x(i: usize, width: f32, size: f32, gap: f32, tail_gap: f32) -> f32 {
    toolbar_slot_x_n(i, TOOL_COUNT, 2, width, size, gap, tail_gap)
}

/// 보이는 칸 수 `n` 과 오른쪽 끝 칸 수 `tail` 로 자리를 셈한다.
pub fn toolbar_slot_x_n(
    i: usize,
    n: usize,
    tail: usize,
    width: f32,
    size: f32,
    gap: f32,
    tail_gap: f32,
) -> f32 {
    let left_n = n.saturating_sub(tail);
    let left_end = if left_n == 0 {
        0.0
    } else {
        left_n as f32 * (size + gap) - gap
    };
    if i >= left_n {
        let k = (i - left_n) as f32;
        let pair_w = tail as f32 * size + (tail.saturating_sub(1) as f32) * gap;
        let pair_left = (width - pair_w).max(left_end + tail_gap);
        pair_left + k * (size + gap)
    } else {
        i as f32 * (size + gap)
    }
}

/// 사용법 창의 두 칸 사이 틈이다.
const HELP_COL_GAP: f32 = 10.0;

/// 사용법 본문의 글꼴 크기다. 자판 그림과 표가 칸 맞춰 서야 해서 고정폭이다.
const HELP_FONT: f32 = 12.5;

/// 잘못된 일을 알리는 창의 폭이다. 글이 짧아 재지 않고 못박는다.
const ERROR_W: f32 = 380.0;

/// 설정 창 고르기 상자의 폭이다.
const COMBO_W: f32 = 200.0;

/// 이름표 칸과 값 칸 사이의 틈이다. 설정·정보 창의 표가 함께 쓴다.
const GRID_GAP: f32 = 14.0;

/// 단추 하나의 좌우 여백이다(`Style::spacing::button_padding` 과 맞춘다).
const BTN_PAD: f32 = 10.0;

/// 위젯 사이에 egui 가 넣는 여백이다. 창 크기를 셈할 때도 이 값을 쓴다.
const ITEM_SPACING: f32 = 6.0;

/// 켜고 끄는 네모 칸과 그 뒤 여백이 차지하는 폭이다.
const CHECKBOX_W: f32 = 28.0;

/// 사용법 한 칸을 그린다. 줄을 접지 않으므로 표가 흐트러지지 않는다.
fn help_column(ui: &mut Ui, text: &str) {
    ui.add(
        egui::Label::new(RichText::new(text).monospace().size(HELP_FONT))
            .wrap_mode(egui::TextWrapMode::Extend),
    );
}

/// 사용법 창의 본문이다. 두 칸을 나란히 놓고 아래에 닫기 단추를 붙인다.
///
/// 창을 이 본문에 딱 맞추므로, 여기서 자리를 얼마나 쓰는지가 곧 창 크기다.
/// `examples/measure.rs` 가 화면 없이 이것을 그려 재 본다.
pub fn help_body(ui: &mut Ui, left: &str, right: &str, close: &str) -> bool {
    // 두 칸 가운데 긴 쪽의 높이. 사이에 세울 줄의 길이가 된다.
    let col_h = column_h(ui, left).max(column_h(ui, right));

    ui.horizontal_top(|ui| {
        help_column(ui, left);
        ui.add_space(HELP_COL_GAP);

        // 가르는 줄을 `ui.separator()` 로 두면 안 된다. 가로로 놓인 칸
        // 안에서는 세로줄이 되는데, 그것이 남은 높이를 다 차지해 버려서
        // 본문이 얼마나 쓰는지 잴 수 없게 된다. 그러면 창을 내용에 맞출
        // 수 없어 아래에 빈 자리가 남는다. 그래서 길이를 못박아 직접 긋는다.
        let (rect, _) = ui.allocate_exact_size(Vec2::new(DIVIDER_W, col_h), egui::Sense::hover());
        ui.painter()
            .rect_filled(rect, 0, ui.visuals().widgets.noninteractive.bg_stroke.color);

        ui.add_space(HELP_COL_GAP);
        help_column(ui, right);
    });
    close_row(ui, close)
}

/// 사용법 한 칸의 높이를 잰다.
fn column_h(ui: &Ui, text: &str) -> f32 {
    ui.ctx().fonts_mut(|f| {
        f.layout_no_wrap(
            text.to_owned(),
            egui::FontId::monospace(HELP_FONT),
            egui::Color32::PLACEHOLDER,
        )
        .size()
        .y
    })
}

/// 사용법 창의 본문 폭이다. 두 칸과 그 사이 가르는 줄까지 잰다.
///
/// 가로로 놓인 것은 `칸 · 틈 · 줄 · 틈 · 칸` 다섯이고, egui 가 그 사이마다
/// 제 여백을 한 번씩 더 넣는다. 그래서 네 몫을 함께 셈한다.
pub fn help_width(ctx: &Context, left: &str, right: &str) -> f32 {
    let font = egui::FontId::monospace(HELP_FONT);
    let col = |text: &str| widest(ctx, text.lines().map(str::to_owned), font.clone());

    let spacing = ITEM_SPACING * 4.0;
    col(left) + col(right) + HELP_COL_GAP * 2.0 + DIVIDER_W + spacing
}

/// 두 칸 사이에 긋는 줄의 굵기다.
const DIVIDER_W: f32 = 1.0;

/// 창 아래에 붙이는 닫기 단추 줄이다. 눌리면 참이다.
///
/// 가르는 줄 위아래 여백을 좁게 잡는다. 단추 밑에 빈 자리가 남으면
/// 창이 실제 내용보다 커 보인다.
fn close_row(ui: &mut Ui, label: &str) -> bool {
    button_row(ui, |ui| ui.button(label).clicked())
}

/// 창 아래에 오른쪽으로 붙이는 단추 줄이다.
///
/// 높이를 못박아 자리를 잡는다. 그냥 `with_layout` 으로 두면 남은 자리를
/// 세로로 다 차지해서, 본문이 얼마나 쓰는지 잴 수가 없다. 그러면 창을
/// 내용에 맞출 수 없고 아래에 빈 자리가 남는다.
fn button_row<R>(ui: &mut Ui, add: impl FnOnce(&mut Ui) -> R) -> R {
    ui.add_space(BTN_ROW_GAP);
    ui.separator();
    let w = ui.available_width();
    ui.allocate_ui_with_layout(
        Vec2::new(w, BTN_ROW_H),
        Layout::right_to_left(Align::Center),
        add,
    )
    .inner
}

/// 단추 줄 위에 두는 여백이다.
const BTN_ROW_GAP: f32 = 4.0;
/// 단추 줄의 높이다.
const BTN_ROW_H: f32 = 28.0;

/// 본문을 담는 상자의 높이 한계다.
///
/// 끝이 없으면 자리를 다 차지하는 위젯이 하나만 있어도 잰 값이 무한이
/// 된다. 어떤 창도 이보다 길 수 없을 만큼만 크게 잡는다.
const FIT_MAX_H: f32 = 4000.0;

/// 딸린 창 본문의 여백이다.
///
/// 글이 창 테두리에 바싹 붙으면 읽기 나쁘므로 좌우를 넉넉히 둔다.
/// 아래는 단추 밑에 빈 자리가 남지 않게 좁게 잡는다.
const WINDOW_MARGIN: egui::Margin = egui::Margin {
    left: 20,
    right: 20,
    top: 16,
    bottom: 12,
};

/// 여백이 가로·세로로 잡아먹는 자리다.
const MARGIN_X: f32 = (WINDOW_MARGIN.left + WINDOW_MARGIN.right) as f32;
const MARGIN_Y: f32 = (WINDOW_MARGIN.top + WINDOW_MARGIN.bottom) as f32;

/// 창을 내용에 맞추느라 다시 그리는 판 수다.
///
/// 폭은 부르는 쪽이 재어서 알려 주므로 곧바로 맞는다. 높이는 그 폭으로
/// 한 판 그려 봐야 알 수 있어서 한 번 더 그린다. 한 판을 더 두는 것은
/// 창 관리자가 크기를 조금 다르게 잡았을 때를 위해서다.
const FIT_PASSES: u8 = 3;

/// 글 한 줄이 차지하는 폭을 잰다.
///
/// 창을 내용에 딱 맞추려면 그리기 전에 폭을 알아야 한다. 말이 바뀌면
/// 글자 길이도 달라지므로 손으로 적어 두지 않고 그때그때 잰다.
fn text_w(ctx: &Context, text: &str, font: egui::FontId) -> f32 {
    ctx.fonts_mut(|f| {
        f.layout_no_wrap(text.to_owned(), font, egui::Color32::PLACEHOLDER)
            .size()
            .x
    })
}

/// 여러 줄 가운데 가장 넓은 줄의 폭이다.
fn widest(ctx: &Context, lines: impl IntoIterator<Item = String>, font: egui::FontId) -> f32 {
    lines
        .into_iter()
        .map(|l| text_w(ctx, &l, font.clone()))
        .fold(0.0, f32::max)
}

/// 딸린 창 하나를 띄운다. 본문이 참을 돌려주거나 창을 닫으면 참이다.
///
/// 곧바로 그리는 방식(`show_viewport_immediate`)이라 본문이 [`App`] 을
/// 그대로 빌려 쓸 수 있다. 그래서 상태를 따로 나눠 들 필요가 없다.
///
/// 창을 내용에 딱 맞춘다. 스크롤이 생기지도 않고 단추 아래에 빈 자리가
/// 남지도 않게 하려는 것이다.
///
/// - **폭**은 부르는 쪽이 글자를 재어 `content_w` 로 알려 준다. 가르는 줄이나
///   단추 줄은 남은 폭을 다 차지하는 위젯이라, 그려 보고 재는 방식으로는
///   창이 절대 좁아지지 않기 때문이다. 폭을 못박아 두면 그것들도 그 안에
///   맞춰 선다.
/// - **높이**는 그 폭으로 한 판 그려 보고 잰다.
///
/// 재는 자리를 `CentralPanel` 의 `min_rect` 로 삼으면 안 된다. 그것은 판
/// 전체로 부풀려져 있어서 늘 창 크기와 같다. 그래서 본문을 세로 상자로
/// 한 번 감싸고 그 상자가 차지한 자리를 잰다.
fn window(
    ctx: &Context,
    id: &'static str,
    title: &str,
    content_w: f32,
    mut body: impl FnMut(&mut Ui, &mut App) -> bool,
    app: &mut App,
) -> bool {
    let mut done = false;
    // 아직 맞출 판이 남았는지 본다. 없으면 처음이라는 뜻이다.
    let left = app.fitting.get(id).copied().unwrap_or(FIT_PASSES);
    let mut used: Option<f32> = None;

    let win_w = content_w + MARGIN_X;

    ctx.show_viewport_immediate(
        ViewportId::from_hash_of(id),
        ViewportBuilder::default()
            .with_title(title)
            .with_inner_size([win_w, 240.0])
            .with_icon(font::window_icon().unwrap_or_default()),
        |ui, _class| {
            let frame = egui::Frame::central_panel(ui.style()).inner_margin(WINDOW_MARGIN);

            let out = egui::CentralPanel::default().frame(frame).show(ui, |ui| {
                // 판은 스스로를 창 전체로 부풀리므로 그 자리를 재면 늘 창
                // 크기가 나온다. 그래서 본문을 따로 만든 상자에 담고,
                // 그 상자가 스스로 차지한 자리를 알려 주게 한다.
                let at = Rect::from_min_size(ui.min_rect().min, Vec2::new(content_w, FIT_MAX_H));
                ui.scope_builder(
                    egui::UiBuilder::new()
                        .max_rect(at)
                        .layout(Layout::top_down(Align::Min)),
                    |ui| {
                        let done = body(ui, app);
                        (done, ui.min_rect().height())
                    },
                )
                .inner
            });

            let (finished, height) = out.inner;
            if finished {
                done = true;
            }
            if left > 0 {
                used = Some(height);
            }

            // 창을 닫는 x 단추도 닫기로 다룬다.
            if ui.ctx().input(|i| i.viewport().close_requested()) {
                done = true;
            }

            if let Some(h) = used {
                ui.ctx()
                    .send_viewport_cmd(egui::ViewportCommand::InnerSize(Vec2::new(
                        win_w,
                        h + MARGIN_Y,
                    )));
                // 다음 판을 곧바로 그리게 해서 한두 번 만에 자리를 잡는다.
                ui.ctx().request_repaint();
            }
        },
    );

    if used.is_some() {
        app.fitting.insert(id, left - 1);
    }
    done
}

// ---------------------------------------------------------------------
// eframe 과 잇기
// ---------------------------------------------------------------------

impl eframe::App for App {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        self.show(ui);
    }
}

impl App {
    /// 창 한 판을 그린다.
    ///
    /// [`eframe::App::ui`] 와 따로 두는 까닭은 시험 때문이다. `eframe::Frame`
    /// 은 진짜 창이 있어야 만들 수 있어서, 그것 없이 그려 보려면 이렇게
    /// 떼어 두어야 한다. `tests/ui.rs` 의 스모크 시험이 이것을 부른다.
    pub fn show(&mut self, ui: &mut Ui) {
        let ctx = ui.ctx().clone();

        if !self.styled {
            self.apply_theme(&ctx);
            self.apply_window_size(&ctx);
            self.styled = true;
        }

        self.tick_multitap(&ctx);
        self.handle_input(&ctx);
        self.sub_windows(&ctx);

        panel_top("menu", None).show(ui, |ui| self.menu_bar(ui, &ctx));

        if self.set.show_toolbar {
            panel_top("toolbar", Some(TOOL_SIZE + 10.0)).show(ui, |ui| {
                ui.add_space(4.0);
                self.toolbar(ui, &ctx);
            });
        }

        panel_bottom("keypad", KEY_HEIGHT * 5.0 + GAP * 4.0 + 14.0).show(ui, |ui| {
            ui.add_space(6.0);
            self.keypad(ui);
        });

        if self.set.show_status {
            let text = self.status_text();
            let muted = self.pal.muted;
            panel_bottom("status", 24.0).show(ui, |ui| {
                let r = ui.available_rect_before_wrap();
                status_line(ui, r, &text, muted);
            });
        }

        egui::CentralPanel::default().show(ui, |ui| self.editor(ui, &ctx));
    }
}

/// 위쪽에 붙이는 칸이다. `height` 를 주면 그 높이로 못박는다.
fn panel_top(id: &str, height: Option<f32>) -> egui::Panel {
    let p = egui::Panel::top(Id::new(id)).resizable(false);
    match height {
        Some(h) => p.exact_size(h),
        None => p,
    }
}

/// 아래쪽에 붙이는 칸이다.
fn panel_bottom(id: &str, height: f32) -> egui::Panel {
    egui::Panel::bottom(Id::new(id))
        .resizable(false)
        .exact_size(height)
}

/// 창을 띄우고 이벤트 고리를 돈다. 창이 닫히면 돌아온다.
pub fn run() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: ViewportBuilder::default()
            .with_title(strings_for(Lang::Ko).app_title)
            // 폭은 툴바가 다 보이는 가장 좁은 값이다. 최소 크기도 같게 두어
            // 사용자가 줄여도 버튼이 가려지지 않는다.
            .with_inner_size([WINDOW_W, WINDOW_H])
            .with_min_inner_size([MIN_WINDOW_W, MIN_WINDOW_H])
            .with_icon(font::window_icon().unwrap_or_default()),
        ..Default::default()
    };

    eframe::run_native(
        "chunjiin",
        options,
        Box::new(|cc| {
            let app = App::with_cc(cc);
            // 제목은 설정에서 고른 언어를 따른다.
            cc.egui_ctx
                .send_viewport_cmd(egui::ViewportCommand::Title(app.txt.app_title.to_string()));
            Ok(Box::new(app))
        }),
    )
}

/// 키패드 키 수를 밖에서도 볼 수 있게 다시 내보낸다.
pub const KEYS: usize = KEY_COUNT;
