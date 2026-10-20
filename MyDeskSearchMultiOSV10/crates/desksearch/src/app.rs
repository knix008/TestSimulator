use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, TryRecvError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use desksearch_core::color::{
    default_icon_color, parse_color, sync_theme_text_colors, BACKGROUND_SWATCHES, TEXT_SWATCHES,
};
use desksearch_core::debounce::Debouncer;
use desksearch_core::inclusion::normalize_drive_root;
use desksearch_core::instance::InstanceLock;
use desksearch_core::locale::{format_count, format_template, t};
use desksearch_core::model::{AppSettings, FileEntry, IndexOutcome, IndexProgress};
use desksearch_core::paths::settings_file;
use desksearch_core::platform::set_run_at_startup;
use desksearch_core::settings::save_settings_file;
use desksearch_core::sort::SearchResultSortOrder;
use desksearch_core::volume::ready_volumes;
use eframe::egui;

use crate::tray::{Tray, TrayAction};
use crate::worker::{self, Command, UiEvent};
use crate::{copy_text, reveal_or_open};

const MIN_WIDTH: f32 = 280.0;
const MAX_WIDTH: f32 = 720.0;

pub struct DeskApp {
    data_dir: PathBuf,
    saved: AppSettings,
    draft: AppSettings,
    query: String,
    results: Vec<FileEntry>,
    selected: usize,
    status: String,
    indexing: bool,
    progress: Option<IndexProgress>,
    using_previous: bool,
    error: Option<String>,
    settings_open: bool,
    about_open: bool,
    reset_open: bool,
    commands: Sender<Command>,
    events: Receiver<UiEvent>,
    debounce: Debouncer,
    query_dirty: bool,
    tray: Option<Tray>,
    cancel: Arc<AtomicBool>,
    exit_requested: bool,
    hidden: bool,
    retry_at: Option<Instant>,
    full_retries: u32,
    last_rect: Option<egui::Rect>,
    geometry_dirty: Option<Instant>,
    selected_folder: Option<usize>,
    color_target: u8,
    results_height: f32,
    results_layout_dirty: bool,
    search_pending: bool,
    search_id: u64,
    _lock: InstanceLock,
}

impl DeskApp {
    pub fn new(
        _cc: &eframe::CreationContext<'_>,
        data_dir: PathBuf,
        settings: AppSettings,
        warn_settings: bool,
        lock: InstanceLock,
        cancel: Arc<AtomicBool>,
    ) -> Self {
        let roots = worker::scope_roots(&settings);
        let (commands, events) = worker::spawn(
            data_dir.clone(),
            Arc::clone(&cancel),
            roots,
            settings.excluded_directories.clone(),
            settings.resync_interval_hours,
        );
        let app = Self {
            data_dir,
            draft: settings.clone(),
            saved: settings,
            query: String::new(),
            results: Vec::new(),
            selected: 0,
            status: String::new(),
            indexing: false,
            progress: None,
            using_previous: false,
            error: warn_settings.then(|| t("ko", "Error_SettingsLoad")),
            settings_open: false,
            about_open: false,
            reset_open: false,
            commands,
            events,
            debounce: Debouncer::new(Duration::from_millis(180)),
            query_dirty: false,
            tray: None,
            cancel,
            exit_requested: false,
            hidden: false,
            retry_at: None,
            full_retries: 0,
            last_rect: None,
            geometry_dirty: None,
            selected_folder: None,
            color_target: 0,
            results_height: 78.0,
            results_layout_dirty: false,
            search_pending: false,
            search_id: 0,
            _lock: lock,
        };
        app
    }

    fn language(&self) -> &str {
        if self.settings_open {
            &self.draft.language
        } else {
            &self.saved.language
        }
    }

    fn appearance(&self) -> &AppSettings {
        if self.settings_open {
            &self.draft
        } else {
            &self.saved
        }
    }

    fn tr(&self, key: &str) -> String {
        t(self.language(), key)
    }

    fn poll(&mut self, ctx: &egui::Context) {
        if self._lock.poll_show() {
            self.show_window(ctx);
        }
        if self.saved.show_tray_icon {
            if self.tray.is_none() {
                self.tray = Tray::install(self.language()).ok();
            }
        } else if self.tray.take().is_some() && self.hidden {
            self.show_window(ctx);
        }
        if let Some(action) = self.tray.as_ref().and_then(Tray::poll) {
            match action {
                TrayAction::Show => self.show_window(ctx),
                TrayAction::Hide => self.hide_window(ctx),
                TrayAction::Settings => {
                    self.show_window(ctx);
                    self.open_settings();
                }
                TrayAction::Exit => crate::tray::exit_immediately(),
            }
        }
        loop {
            match self.events.try_recv() {
                Ok(UiEvent::Results {
                    generation,
                    entries,
                }) => {
                    if generation == self.search_id {
                        self.results = entries;
                        self.selected = 0;
                        self.search_pending = false;
                        self.results_layout_dirty = true;
                    }
                }
                Ok(UiEvent::Progress(progress)) => {
                    self.indexing = progress.percent < 100;
                    if !self.indexing {
                        self.status.clear();
                    }
                    self.progress = Some(progress);
                }
                Ok(UiEvent::Outcome(outcome)) => {
                    self.indexing = false;
                    self.progress = None;
                    match outcome {
                        IndexOutcome::Promoted { indexed } => {
                            self.full_retries = 0;
                            self.retry_at = None;
                            self.status = format_template(
                                &self.tr("Index_Complete"),
                                &[&format_count(indexed)],
                            );
                            self.query_dirty = true;
                        }
                        IndexOutcome::Cancelled { .. } => {
                            self.status = self.tr("Status_Paused");
                        }
                        IndexOutcome::Incomplete { .. } => {
                            self.status = self.tr("Status_Incomplete");
                            if self.full_retries < 2 {
                                self.full_retries += 1;
                                self.retry_at = Some(Instant::now() + Duration::from_secs(8));
                            }
                        }
                    }
                }
                Ok(UiEvent::Error(error)) => {
                    self.error = Some(error);
                    self.indexing = false;
                }
                Ok(UiEvent::UsingPrevious(using)) => self.using_previous = using,
                Ok(UiEvent::IndexChanged) => self.query_dirty = true,
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => break,
            }
        }
        if self.query_dirty && self.debounce.ready(Instant::now()) {
            self.submit_search();
            self.query_dirty = false;
        }
        if self.retry_at.is_some_and(|when| Instant::now() >= when) {
            self.retry_at = None;
            self.start_index(true);
        }
        ctx.request_repaint_after(Duration::from_millis(200));
    }

    fn show_window(&mut self, ctx: &egui::Context) {
        self.hidden = false;
        ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
        ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
    }

    fn hide_window(&mut self, ctx: &egui::Context) {
        self.hidden = true;
        ctx.send_viewport_cmd(egui::ViewportCommand::Visible(false));
    }

    fn open_settings(&mut self) {
        self.draft = self.saved.clone();
        self.settings_open = true;
    }

    fn submit_search(&mut self) {
        self.search_id = self.search_id.wrapping_add(1);
        let source = self.appearance().clone();
        let _ = self.commands.send(Command::Search {
            query: self.query.clone(),
            generation: self.search_id,
            case_sensitive: source.case_sensitive_search,
            use_regex: source.use_regex_search,
            sort: source.search_result_sort,
        });
    }

    fn start_index(&mut self, fresh: bool) {
        self.cancel.store(false, Ordering::Relaxed);
        self.indexing = true;
        let settings = &self.saved;
        let _ = self.commands.send(Command::StartIndex {
            roots: worker::scope_roots(settings),
            excluded: settings.excluded_directories.clone(),
            fresh,
        });
    }

    fn save_settings(&mut self) {
        let scope_changed = self.draft.included_drives != self.saved.included_drives
            || self.draft.included_directories != self.saved.included_directories
            || self.draft.excluded_directories != self.saved.excluded_directories;
        let sort_changed = self.draft.search_result_sort != self.saved.search_result_sort
            || self.draft.case_sensitive_search != self.saved.case_sensitive_search
            || self.draft.use_regex_search != self.saved.use_regex_search;
        self.saved = self.draft.clone();
        if let Err(error) = save_settings_file(&settings_file(&self.data_dir), &self.saved) {
            self.error = Some(error.to_string());
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Err(error) = set_run_at_startup(self.saved.run_at_startup, &exe) {
                self.error = Some(format!("{} {error}", self.tr("Error_StartupRegistration")));
            }
        }
        if let Some(tray) = &self.tray {
            tray.set_language(&self.saved.language);
        }
        let _ = self.commands.send(Command::Configure {
            roots: worker::scope_roots(&self.saved),
            excluded: self.saved.excluded_directories.clone(),
            resync_hours: self.saved.resync_interval_hours,
        });
        if scope_changed {
            self.full_retries = 0;
            self.start_index(true);
        } else if sort_changed {
            self.query_dirty = true;
            self.debounce.push(Instant::now());
        }
        self.settings_open = false;
    }

    fn persist_geometry(&mut self, ctx: &egui::Context) {
        let Some(rect) = ctx.input(|input| input.viewport().outer_rect) else {
            return;
        };
        if self.last_rect.is_some_and(|previous| previous == rect) {
            if self
                .geometry_dirty
                .is_some_and(|when| Instant::now() >= when)
            {
                let _ = save_settings_file(&settings_file(&self.data_dir), &self.saved);
                self.geometry_dirty = None;
            }
            return;
        }
        self.last_rect = Some(rect);
        self.saved.window_left = Some(rect.min.x as f64);
        self.saved.window_top = Some(rect.min.y as f64);
        self.saved.window_width =
            Some((rect.width() as f64).clamp(MIN_WIDTH as f64, MAX_WIDTH as f64));
        self.saved.window_height = Some(48.0);
        self.draft.window_left = self.saved.window_left;
        self.draft.window_top = self.saved.window_top;
        self.draft.window_width = self.saved.window_width;
        self.draft.window_height = self.saved.window_height;
        self.geometry_dirty = Some(Instant::now() + Duration::from_millis(600));
    }

}

impl eframe::App for DeskApp {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }

    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.poll(ctx);
        if self.exit_requested {
            let _ = self.commands.send(Command::Shutdown);
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            return;
        }
        if ctx.input(|input| input.viewport().close_requested()) && !self.exit_requested {
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
            self.hide_window(ctx);
        }
        self.persist_geometry(ctx);
        let always_on_top = self.appearance().always_on_top;
        ctx.send_viewport_cmd(egui::ViewportCommand::WindowLevel(if always_on_top {
            egui::WindowLevel::AlwaysOnTop
        } else {
            egui::WindowLevel::Normal
        }));
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        ctx.set_visuals(egui::Visuals::light());
        let appearance = self.appearance().clone();
        let query_open = !self.query.trim().is_empty();
        if self.results_layout_dirty && query_open {
            let rows = self.results.len().clamp(1, 10) as f32;
            self.results_height = (26.0 + rows * 52.0).clamp(78.0, 560.0);
            self.results_layout_dirty = false;
        }
        if let Some(rect) = ctx.input(|input| input.viewport().inner_rect) {
            let width = rect.width().clamp(MIN_WIDTH, MAX_WIDTH);
            let height = if query_open {
                60.0 + self.results_height
            } else {
                48.0
            };
            if (rect.width() - width).abs() > 1.0 || (rect.height() - height).abs() > 1.0 {
                ctx.send_viewport_cmd(egui::ViewportCommand::MinInnerSize(egui::vec2(
                    MIN_WIDTH, height,
                )));
                ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(width, height)));
            }
        }

        let bg = fade(
            color_with_alpha(&appearance.background_color, appearance.background_opacity),
            appearance.window_opacity,
        );
        let text = color32(&appearance.text_color);
        let sub = color32(&appearance.sub_text_color);
        let icon = color32(&appearance.icon_color);
        let border = fade(color32(&appearance.border_color), appearance.window_opacity);
        let stroke = egui::Stroke::new(appearance.border_thickness as f32, border);
        egui::CentralPanel::default()
            .frame(egui::Frame::NONE)
            .show(ui, |ui| {
                let (bar, _) = ui.allocate_exact_size(
                    egui::vec2(ui.available_width(), 48.0),
                    egui::Sense::hover(),
                );
                paint_pill(ui.painter(), bar, bg, stroke);
                let mut row = ui.new_child(
                    egui::UiBuilder::new().max_rect(bar.shrink2(egui::vec2(8.0, 8.0))),
                );
                row.horizontal(|ui| {
                    let grip = ui.allocate_response(egui::vec2(18.0, 30.0), egui::Sense::drag());
                    glyph(ui, "\u{E700}", 13.0, sub, grip.rect.center());
                    if grip.dragged() {
                        ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
                    }
                    let search_icon = ui.allocate_response(egui::vec2(18.0, 30.0), egui::Sense::hover());
                    glyph(ui, "\u{E721}", 15.0, icon, search_icon.rect.center());
                    ui.add_space(6.0);
                    let hint = self.tr("Search_Placeholder");
                    let search_width = (ui.available_width() - 34.0).max(40.0);
                    let response = ui.add(
                        egui::TextEdit::singleline(&mut self.query)
                            .hint_text(egui::RichText::new(hint).color(sub).size(14.0))
                            .font(egui::FontId::proportional(14.0))
                            .text_color(text)
                            .frame(egui::Frame::NONE)
                            .desired_width(search_width)
                            .vertical_align(egui::Align::Center),
                    );
                    if response.changed() {
                        self.query_dirty = true;
                        self.search_pending = !self.query.trim().is_empty();
                        if self.query.trim().is_empty() {
                            self.results.clear();
                        }
                        self.debounce.push(Instant::now());
                    }
                    let composing = ui.input(|input| {
                        input
                            .events
                            .iter()
                            .any(|event| matches!(event, egui::Event::Ime(_)))
                    });
                    if response.has_focus() && !composing {
                        if ui.input_mut(|input| {
                            input.consume_key(egui::Modifiers::NONE, egui::Key::Enter)
                        }) {
                            self.open_selected(true);
                        }
                        if ui.input_mut(|input| {
                            input.consume_key(egui::Modifiers::NONE, egui::Key::Escape)
                        }) {
                            self.query.clear();
                            self.results.clear();
                            self.search_pending = false;
                        }
                        if ui.input_mut(|input| {
                            input.consume_key(egui::Modifiers::NONE, egui::Key::ArrowDown)
                        }) && !self.results.is_empty()
                        {
                            self.selected = (self.selected + 1).min(self.results.len() - 1);
                        }
                        if ui.input_mut(|input| {
                            input.consume_key(egui::Modifiers::NONE, egui::Key::ArrowUp)
                        }) {
                            self.selected = self.selected.saturating_sub(1);
                        }
                    }
                    let settings = ui.allocate_response(egui::vec2(28.0, 30.0), egui::Sense::click());
                    glyph(ui, "\u{E713}", 17.0, icon, settings.rect.center());
                    if settings.clicked() {
                        self.open_settings();
                    }
                });
                resize_edge(ui, bar, true);
                resize_edge(ui, bar, false);
                if query_open {
                    ui.add_space(4.0);
                    let (list, _) = ui.allocate_exact_size(
                        egui::vec2(ui.available_width(), self.results_height),
                        egui::Sense::hover(),
                    );
                    paint_pill(ui.painter(), list, bg, stroke);
                    let mut list_ui = ui.new_child(
                        egui::UiBuilder::new().max_rect(list.shrink2(egui::vec2(8.0, 6.0))),
                    );
                    if let Some(error) = self.error.clone() {
                        list_ui.colored_label(egui::Color32::from_rgb(180, 40, 40), error);
                    }
                    self.draw_results(&mut list_ui, text, sub);
                    let (_, grip_response) = ui.allocate_exact_size(
                        egui::vec2(ui.available_width(), 8.0),
                        egui::Sense::drag(),
                    );
                    if grip_response.hovered() || grip_response.dragged() {
                        ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeVertical);
                    }
                    if grip_response.dragged() {
                        self.results_height =
                            (self.results_height + grip_response.drag_delta().y).clamp(78.0, 560.0);
                    }
                }
            });

        self.draw_settings(&ctx);
    }
}

impl DeskApp {
    fn status_line(&self) -> String {
        if self.indexing {
            if let Some(progress) = &self.progress {
                let phase = self.tr(progress.phase.label_key());
                let mut text = format!(
                    "{phase} {}",
                    format_template(
                        &self.tr("Settings_IndexingStatus"),
                        &[
                            &progress.percent.to_string(),
                            &format_count(progress.indexed)
                        ],
                    )
                );
                if self.using_previous {
                    text.push_str(" · ");
                    text.push_str(&self.tr("Settings_UsingPreviousIndex"));
                }
                return text;
            }
            return self.tr("Index_InProgress");
        }
        if let Some(progress) = &self.progress {
            return format_template(
                &self.tr("Settings_ReadyStatus"),
                &[&format_count(progress.indexed)],
            );
        }
        if self.status.is_empty() {
            self.tr("Settings_ReadyStatus")
        } else {
            self.status.clone()
        }
    }

    fn draw_results(&mut self, ui: &mut egui::Ui, text: egui::Color32, sub: egui::Color32) {
        if self.query.trim().is_empty() {
            return;
        }
        if self.results.is_empty() {
            let label = if self.search_pending {
                self.tr("Search_Searching")
            } else {
                self.tr("Search_NoResults")
            };
            ui.vertical_centered(|ui| {
                ui.add_space(24.0);
                ui.label(egui::RichText::new(label).size(12.0).color(sub));
            });
            return;
        }
        let mut open_index = None;
        let mut reveal_index = None;
        egui::ScrollArea::vertical()
            .max_height(ui.available_height().max(40.0))
            .show(ui, |ui| {
                for index in 0..self.results.len() {
                    let entry = self.results[index].clone();
                    let selected = index == self.selected;
                    let response = result_row(ui, &entry, &self.query, selected, text, sub);
                    if response.double_clicked() {
                        self.selected = index;
                        open_index = Some(index);
                    } else if response.clicked() {
                        if self.selected == index {
                            reveal_index = Some(index);
                        } else {
                            self.selected = index;
                        }
                    }
                    let open_label = self.tr("Menu_Open");
                    let reveal_label = self.tr("Menu_ShowInFolder");
                    let copy_path = self.tr("Menu_CopyPath");
                    let copy_name = self.tr("Menu_CopyFileName");
                    response.context_menu(|ui| {
                        if ui.button(open_label).clicked() {
                            open_index = Some(index);
                            ui.close();
                        }
                        if ui.button(reveal_label).clicked() {
                            reveal_index = Some(index);
                            ui.close();
                        }
                        if ui.button(copy_path).clicked() {
                            copy_text(ui.ctx(), entry.full_path.clone());
                            ui.close();
                        }
                        if ui.button(copy_name).clicked() {
                            copy_text(ui.ctx(), entry.file_name.clone());
                            ui.close();
                        }
                    });
                }
            });
        if let Some(index) = open_index {
            self.selected = index;
            self.open_selected(false);
        } else if let Some(index) = reveal_index {
            self.selected = index;
            self.open_selected(true);
        }
    }

    fn open_selected(&self, reveal: bool) {
        let Some(entry) = self.results.get(self.selected) else {
            return;
        };
        let path = PathBuf::from(&entry.full_path);
        if entry.is_directory {
            reveal_or_open(&path, false);
        } else if reveal {
            reveal_or_open(&path, true);
        } else {
            reveal_or_open(&path, false);
        }
    }

    fn draw_settings(&mut self, ctx: &egui::Context) {
        if !self.settings_open {
            return;
        }
        let title = self.tr("Settings_Title");
        let mut close = false;
        ctx.show_viewport_immediate(
            egui::ViewportId::from_hash_of("mydesksearch-settings"),
            egui::ViewportBuilder::default()
                .with_title(title)
                .with_inner_size([560.0, 760.0])
                .with_min_inner_size([560.0, 640.0])
                .with_resizable(false)
                .with_decorations(true)
                .with_taskbar(false),
            |ui, _class| {
                if ui.input(|input| input.viewport().close_requested()) {
                    close = true;
                }
                apply_dialog_theme(ui.ctx());
                ui.spacing_mut().item_spacing = egui::vec2(8.0, 8.0);
                ui.spacing_mut().button_padding = egui::vec2(12.0, 6.0);
                let full = ui.max_rect();
                ui.painter().rect_filled(full, 0.0, PAGE_BG);
                let page = full.shrink(PAGE_MARGIN);
                let header = egui::Rect::from_min_size(page.min, egui::vec2(page.width(), 40.0));
                let footer = egui::Rect::from_min_size(
                    egui::pos2(page.left(), page.bottom() - 40.0),
                    egui::vec2(page.width(), 40.0),
                );
                let scroll = egui::Rect::from_min_max(
                    egui::pos2(page.left(), header.bottom() + 8.0),
                    egui::pos2(page.right(), footer.top() - 8.0),
                );
                ui.painter().hline(
                    page.x_range(),
                    header.bottom(),
                    egui::Stroke::new(1.0, RULE),
                );
                ui.painter().hline(
                    page.x_range(),
                    footer.top(),
                    egui::Stroke::new(1.0, RULE),
                );
                let mut header_ui = ui.new_child(egui::UiBuilder::new().max_rect(header));
                header_ui.with_layout(egui::Layout::left_to_right(egui::Align::Center), |ui| {
                    let (gear, _) =
                        ui.allocate_exact_size(egui::vec2(20.0, 20.0), egui::Sense::hover());
                    glyph(ui, "\u{E713}", 18.0, INK, gear.center());
                    ui.add_space(6.0);
                    ui.label(
                        egui::RichText::new(self.tr("Settings_Header"))
                            .size(18.0)
                            .strong()
                            .color(INK),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if icon_text_button(ui, "\u{E946}", &self.tr("Settings_Info")).clicked() {
                            self.about_open = true;
                        }
                    });
                });
                let mut scroll_ui = ui.new_child(egui::UiBuilder::new().max_rect(scroll));
                egui::ScrollArea::vertical()
                    .id_salt("settings-page")
                    .auto_shrink([false, false])
                    .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden)
                    .show(&mut scroll_ui, |ui| {
                        ui.set_width(ui.available_width());
                        self.draw_settings_body(ui);
                    });
                let mut footer_ui = ui.new_child(egui::UiBuilder::new().max_rect(footer));
                footer_ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.add(dialog_button(&self.tr("Settings_Save"), true)).clicked() {
                        self.save_settings();
                    }
                    if ui
                        .add(dialog_button(&self.tr("Settings_Cancel"), false))
                        .clicked()
                    {
                        close = true;
                    }
                });
                self.draw_about(ui.ctx());
                self.draw_reset(ui.ctx());
            },
        );
        if close {
            self.draft = self.saved.clone();
            self.settings_open = false;
            self.about_open = false;
            self.reset_open = false;
        }
    }

    fn draw_settings_body(&mut self, ui: &mut egui::Ui) {
        let language = self.tr("Settings_Language");
        let korean = self.tr("Settings_Language_Korean");
        let english = self.tr("Settings_Language_English");
        settings_card(ui, &language, |ui| {
            ui.horizontal(|ui| {
                ui.radio_value(&mut self.draft.language, "ko".to_string(), korean);
                ui.add_space(24.0);
                ui.radio_value(&mut self.draft.language, "en".to_string(), english);
            });
        });

        let search = self.tr("Settings_Search");
        let case_label = self.tr("Settings_CaseSensitive");
        let case_desc = self.tr("Settings_CaseSensitiveDesc");
        let regex_label = self.tr("Settings_UseRegex");
        let regex_desc = self.tr("Settings_UseRegexDesc");
        let note = self.tr("Settings_SearchMultilingualNote");
        settings_card(ui, &search, |ui| {
            ui.checkbox(&mut self.draft.case_sensitive_search, case_label);
            field_hint(ui, &case_desc);
            ui.checkbox(&mut self.draft.use_regex_search, regex_label);
            field_hint(ui, &regex_desc);
            self.draw_sort(ui);
            field_hint(ui, &note);
        });

        let scope = self.tr("Settings_Exclusion");
        settings_card(ui, &scope, |ui| {
            self.draw_scope(ui);
        });
        let index = self.tr("Settings_IndexProgress");
        settings_card(ui, &index, |ui| {
            self.draw_index_controls(ui);
        });

        let startup_title = self.tr("Settings_Startup");
        let startup = self.tr("Settings_RunAtStartup");
        let startup_desc = self.tr("Settings_RunAtStartupDesc");
        let tray = self.tr("Settings_ShowTrayIcon");
        let tray_desc = self.tr("Settings_ShowTrayIconDesc");
        settings_card(ui, &startup_title, |ui| {
            ui.checkbox(&mut self.draft.run_at_startup, startup);
            field_hint(ui, &startup_desc);
            ui.checkbox(&mut self.draft.show_tray_icon, tray);
            field_hint(ui, &tray_desc);
        });

        let colors = self.tr("Settings_ColorSettings");
        let color_target_label = self.tr("Settings_ColorTarget");
        let pick = self.tr("Settings_PickColor");
        let opacity_label = self.tr("Settings_BackgroundOpacity");
        let thickness_label = self.tr("Settings_BorderThickness");
        let window_opacity_label = self.tr("Settings_WindowOpacity");
        settings_card(ui, &colors, |ui| {
            let target_label = match self.color_target {
                1 => self.tr("Settings_BorderColor"),
                2 => self.tr("Settings_TextColor"),
                3 => self.tr("Settings_IconColor"),
                _ => self.tr("Settings_BackgroundColor"),
            };
            let background = self.tr("Settings_BackgroundColor");
            let border_color = self.tr("Settings_BorderColor");
            let text_color = self.tr("Settings_TextColor");
            let icon_color = self.tr("Settings_IconColor");
            combo_line(ui, "color-target", &color_target_label, &target_label, |ui| {
                ui.selectable_value(&mut self.color_target, 0, background);
                ui.selectable_value(&mut self.color_target, 1, border_color);
                ui.selectable_value(&mut self.color_target, 2, text_color);
                ui.selectable_value(&mut self.color_target, 3, icon_color);
            });
            self.draw_color_preview(ui);
            if ui.add(dialog_button(&pick, false)).clicked() {
                if let Some(hex) = pick_color(&self.selected_color_hex()) {
                    self.apply_color(&hex);
                }
            }
            let swatches = if self.color_target == 2 || self.color_target == 3 {
                TEXT_SWATCHES
            } else {
                BACKGROUND_SWATCHES
            };
            swatch_grid(ui, swatches, |hex| self.apply_color(hex));
            step_i32(ui, "bg-opacity", &opacity_label, &mut self.draft.background_opacity, 40, 100);
            step_f64(
                ui,
                "border-thickness",
                &thickness_label,
                &mut self.draft.border_thickness,
                0.0,
                6.0,
                0.5,
            );
            step_i32(
                ui,
                "window-opacity",
                &window_opacity_label,
                &mut self.draft.window_opacity,
                50,
                100,
            );
        });

        let priority_title = self.tr("Settings_DisplayPriority");
        let above = self.tr("Settings_AboveOthers");
        let above_desc = self.tr("Settings_AboveOthersDesc");
        let normal = self.tr("Settings_NormalPriority");
        let normal_desc = self.tr("Settings_NormalPriorityDesc");
        let mut priority = if self.draft.always_on_top { 0 } else { 1 };
        settings_card(ui, &priority_title, |ui| {
            ui.radio_value(&mut priority, 0, above);
            field_hint(ui, &above_desc);
            ui.radio_value(&mut priority, 1, normal);
            field_hint(ui, &normal_desc);
        });
        self.draft.always_on_top = priority == 0;
    }

    fn selected_color_hex(&self) -> String {
        match self.color_target {
            1 => self.draft.border_color.clone(),
            2 => self.draft.text_color.clone(),
            3 => self.draft.icon_color.clone(),
            _ => self.draft.background_color.clone(),
        }
    }

    fn apply_color(&mut self, hex: &str) {
        match self.color_target {
            1 => {
                let body = hex.trim().trim_start_matches('#');
                self.draft.border_color = if body.len() >= 8 {
                    format!("#{body}")
                } else {
                    format!("#33{body}")
                };
            }
            2 => self.draft.text_color = normalize_hex(hex),
            3 => self.draft.icon_color = normalize_hex(hex),
            _ => {
                self.draft.background_color = normalize_hex(hex);
                sync_theme_text_colors(&mut self.draft);
                self.draft.icon_color = default_icon_color(&self.draft.background_color).to_string();
            }
        }
    }

    fn draw_color_preview(&self, ui: &mut egui::Ui) {
        let (rect, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 36.0), egui::Sense::hover());
        let bg = color_with_alpha(&self.draft.background_color, self.draft.background_opacity);
        let border = color32(&self.draft.border_color);
        ui.painter().rect_filled(rect, 6.0, bg);
        ui.painter().rect_stroke(
            rect,
            6.0,
            egui::Stroke::new(self.draft.border_thickness as f32, border),
            egui::StrokeKind::Inside,
        );
        if self.color_target == 3 {
            let icon = color32(&self.draft.icon_color);
            glyph(ui, "\u{E700}", 13.0, icon, rect.center() - egui::vec2(24.0, 0.0));
            glyph(ui, "\u{E721}", 15.0, icon, rect.center());
            glyph(ui, "\u{E713}", 15.0, icon, rect.center() + egui::vec2(24.0, 0.0));
        } else {
            ui.painter().text(
                rect.left_center() + egui::vec2(8.0, 0.0),
                egui::Align2::LEFT_CENTER,
                self.tr("Settings_SearchPreview"),
                egui::FontId::proportional(13.0),
                color32(&self.draft.text_color),
            );
        }
    }

    fn draw_sort(&mut self, ui: &mut egui::Ui) {
        let current = self.tr(self.draft.search_result_sort.label_key());
        let label = self.tr("Settings_SearchResultSort");
        field_hint(ui, &self.tr("Settings_SearchResultSortDesc"));
        combo_line(ui, "sort", &label, &current, |ui| {
            for sort in SearchResultSortOrder::ALL {
                let item = t(&self.draft.language, sort.label_key());
                ui.selectable_value(&mut self.draft.search_result_sort, sort, item);
            }
        });
    }

    fn draw_scope(&mut self, ui: &mut egui::Ui) {
        field_hint(ui, &self.tr("Settings_ExcludedDrivesDesc"));
        let mut drives = ready_volumes();
        for drive in &self.draft.included_drives {
            if let Some(normalized) = normalize_drive_root(drive) {
                if !drives
                    .iter()
                    .any(|item| item.eq_ignore_ascii_case(&normalized))
                {
                    drives.push(normalized);
                }
            }
        }
        let mut next = self.draft.included_drives.clone();
        let unavailable = self.tr("Settings_DriveUnavailable");
        let columns = 2usize;
        let gap = 8.0;
        let column_width = ((ui.available_width() - gap) / columns as f32).max(80.0);
        for row in drives.chunks(columns) {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = gap;
                for drive in row {
                    let mut checked = next.iter().any(|item| item.eq_ignore_ascii_case(drive));
                    let label = if Path::new(drive).exists() {
                        drive.clone()
                    } else {
                        format!("{drive} ({unavailable})")
                    };
                    ui.allocate_ui_with_layout(
                        egui::vec2(column_width, 24.0),
                        egui::Layout::left_to_right(egui::Align::Center),
                        |ui| {
                            if ui.checkbox(&mut checked, label).changed() {
                                next.retain(|item| !item.eq_ignore_ascii_case(drive));
                                if checked {
                                    next.push(drive.clone());
                                }
                            }
                        },
                    );
                }
            });
        }
        self.draft.included_drives = next;

        ui.add_space(8.0);
        ui.label(
            egui::RichText::new(self.tr("Settings_ExcludedDirectories"))
                .strong()
                .size(13.0)
                .color(INK),
        );
        field_hint(ui, &self.tr("Settings_ExcludedDirectoriesDesc"));
        let mut remove = None;
        let directories = self.draft.included_directories.clone();
        let list_width = ui.available_width();
        let (list_rect, _) =
            ui.allocate_exact_size(egui::vec2(list_width, 112.0), egui::Sense::hover());
        ui.painter().rect_filled(list_rect, 4.0, egui::Color32::WHITE);
        ui.painter().rect_stroke(
            list_rect,
            4.0,
            egui::Stroke::new(1.0, RULE),
            egui::StrokeKind::Inside,
        );
        let mut list_ui =
            ui.new_child(egui::UiBuilder::new().max_rect(list_rect.shrink(6.0)));
        egui::ScrollArea::vertical()
            .id_salt("included-folders")
            .auto_shrink([false, false])
            .show(&mut list_ui, |ui| {
                for (index, directory) in directories.iter().enumerate() {
                    if ui
                        .selectable_label(self.selected_folder == Some(index), directory)
                        .clicked()
                    {
                        self.selected_folder = Some(index);
                    }
                }
            });
        let browse = self.tr("Settings_BrowseFolder");
        let remove_label = self.tr("Settings_RemoveExcluded");
        match button_row(ui, &[(browse, true), (remove_label, true)]) {
            Some(0) => {
                if let Some(path) = rfd::FileDialog::new().pick_folder() {
                    let text = path.display().to_string();
                    if !self
                        .draft
                        .included_directories
                        .iter()
                        .any(|item| item.eq_ignore_ascii_case(&text))
                    {
                        self.draft.included_directories.push(text);
                    }
                }
            }
            Some(1) => remove = self.selected_folder,
            _ => {}
        }
        if let Some(index) = remove {
            if index < self.draft.included_directories.len() {
                self.draft.included_directories.remove(index);
            }
            self.selected_folder = None;
        }
        if !self.draft.excluded_directories.is_empty() {
            ui.label(self.tr("Settings_LegacyExcluded"));
            for directory in &self.draft.excluded_directories {
                ui.label(directory);
            }
        }
    }

    fn draw_index_controls(&mut self, ui: &mut egui::Ui) {
        let resync_title = self.tr("Settings_PeriodicResync");
        let current = resync_label(&self.draft.language, self.draft.resync_interval_hours);
        combo_line(ui, "resync", &resync_title, &current, |ui| {
            for hours in [0, 1, 4, 8, 12, 24, 168] {
                let label = resync_label(&self.draft.language, hours);
                ui.selectable_value(&mut self.draft.resync_interval_hours, hours, label);
            }
        });
        let percent = self
            .progress
            .as_ref()
            .map(|progress| progress.percent)
            .unwrap_or(if self.indexing { 0 } else { 100 });
        readout_bar(
            ui,
            &self.tr("Settings_IndexProgress"),
            percent as f32 / 100.0,
            &format!("{percent}%"),
        );
        field_hint(ui, &self.status_line());
        if let Some(error) = self.error.clone() {
            ui.colored_label(egui::Color32::from_rgb(180, 40, 40), error);
        }
        let index_label = self.tr("Settings_Indexing");
        let stop_label = self.tr("Settings_StopIndexing");
        let reset_label = self.tr("Settings_ResetIndex");
        let folder_label = self.tr("Settings_OpenDataFolder");
        match button_row(
            ui,
            &[
                (index_label, true),
                (stop_label, self.indexing),
                (reset_label, !self.indexing),
                (folder_label, true),
            ],
        ) {
            Some(0) => {
                self.save_draft_scope_for_index();
                self.full_retries = 0;
                self.start_index(true);
            }
            Some(1) if self.indexing => {
                self.cancel.store(true, Ordering::Relaxed);
                let _ = self.commands.send(Command::Pause);
            }
            Some(2) if !self.indexing => self.reset_open = true,
            Some(3) => {
                let _ = std::fs::create_dir_all(&self.data_dir);
                reveal_or_open(&self.data_dir, false);
            }
            _ => {}
        }
    }

    fn save_draft_scope_for_index(&mut self) {
        self.saved.included_drives = self.draft.included_drives.clone();
        self.saved.included_directories = self.draft.included_directories.clone();
        self.saved.excluded_directories = self.draft.excluded_directories.clone();
        self.saved.resync_interval_hours = self.draft.resync_interval_hours;
        let _ = save_settings_file(&settings_file(&self.data_dir), &self.saved);
    }

    fn draw_about(&mut self, ctx: &egui::Context) {
        if !self.about_open {
            return;
        }
        let title = self.tr("About_Title");
        let app_title = self.tr("App_Title");
        let version = format_template(&self.tr("About_Version"), &[desksearch_core::VERSION]);
        let description = self.tr("About_Description");
        let author = self.tr("About_Author");
        let (author_title, author_body) = author
            .split_once(" · ")
            .map(|(title, body)| (title.to_string(), body.to_string()))
            .unwrap_or_else(|| (author.clone(), String::new()));
        let ok = self.tr("About_Ok");
        let mut close = false;
        ctx.show_viewport_immediate(
            egui::ViewportId::from_hash_of("mydesksearch-about"),
            egui::ViewportBuilder::default()
                .with_title(title.clone())
                .with_inner_size([480.0, 380.0])
                .with_min_inner_size([480.0, 380.0])
                .with_resizable(false)
                .with_decorations(true)
                .with_taskbar(false),
            |ui, _class| {
                if ui.input(|input| input.viewport().close_requested()) {
                    close = true;
                }
                apply_dialog_theme(ui.ctx());
                ui.spacing_mut().item_spacing = egui::vec2(8.0, 8.0);
                ui.spacing_mut().button_padding = egui::vec2(12.0, 6.0);
                let full = ui.max_rect();
                ui.painter().rect_filled(full, 0.0, PAGE_BG);
                let page = full.shrink(PAGE_MARGIN);
                let header = egui::Rect::from_min_size(page.min, egui::vec2(page.width(), 40.0));
                let footer = egui::Rect::from_min_size(
                    egui::pos2(page.left(), page.bottom() - 40.0),
                    egui::vec2(page.width(), 40.0),
                );
                let body = egui::Rect::from_min_max(
                    egui::pos2(page.left(), header.bottom() + 8.0),
                    egui::pos2(page.right(), footer.top() - 8.0),
                );
                ui.painter().hline(
                    page.x_range(),
                    header.bottom(),
                    egui::Stroke::new(1.0, RULE),
                );
                ui.painter().hline(
                    page.x_range(),
                    footer.top(),
                    egui::Stroke::new(1.0, RULE),
                );
                let mut header_ui = ui.new_child(egui::UiBuilder::new().max_rect(header));
                header_ui.with_layout(egui::Layout::left_to_right(egui::Align::Center), |ui| {
                    let (icon, _) =
                        ui.allocate_exact_size(egui::vec2(20.0, 20.0), egui::Sense::hover());
                    glyph(ui, "\u{E946}", 18.0, INK, icon.center());
                    ui.add_space(6.0);
                    ui.label(
                        egui::RichText::new(title.clone())
                            .size(18.0)
                            .strong()
                            .color(INK),
                    );
                });
                let mut body_ui = ui.new_child(egui::UiBuilder::new().max_rect(body));
                egui::ScrollArea::vertical()
                    .id_salt("about-page")
                    .auto_shrink([false, false])
                    .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden)
                    .show(&mut body_ui, |ui| {
                        ui.set_width(ui.available_width());
                        settings_card(ui, &app_title, |ui| {
                            ui.label(egui::RichText::new(version.clone()).size(13.0).color(INK));
                            ui.add_space(6.0);
                            ui.label(
                                egui::RichText::new(description.clone())
                                    .size(13.0)
                                    .color(INK),
                            );
                        });
                        settings_card(ui, &author_title, |ui| {
                            if !author_body.is_empty() {
                                ui.label(
                                    egui::RichText::new(author_body.clone())
                                        .size(13.0)
                                        .color(INK),
                                );
                            }
                        });
                    });
                let mut footer_ui = ui.new_child(egui::UiBuilder::new().max_rect(footer));
                footer_ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.add(dialog_button(&ok, true)).clicked() {
                        close = true;
                    }
                });
            },
        );
        if close {
            self.about_open = false;
        }
    }

    fn draw_reset(&mut self, ctx: &egui::Context) {
        if !self.reset_open {
            return;
        }
        let mut open = true;
        egui::Window::new(self.tr("Settings_ResetChoice_Title"))
            .open(&mut open)
            .show(ctx, |ui| {
                ui.label(self.tr("Settings_ResetChoice_Message"));
                if ui
                    .button(self.tr("Settings_ResetChoice_IndexOnly"))
                    .clicked()
                {
                    let _ = self.commands.send(Command::ResetIndex);
                    self.results.clear();
                    self.status = self.tr("Status_Paused");
                    self.reset_open = false;
                }
                if ui
                    .button(self.tr("Settings_ResetChoice_IndexAndSettings"))
                    .clicked()
                {
                    let _ = self.commands.send(Command::ResetIndex);
                    let ready = ready_volumes();
                    self.saved = AppSettings::default();
                    desksearch_core::settings::apply_default_scope_if_empty(
                        &mut self.saved,
                        &ready,
                    );
                    self.draft = self.saved.clone();
                    let _ = save_settings_file(&settings_file(&self.data_dir), &self.saved);
                    self.results.clear();
                    self.reset_open = false;
                }
                if ui.button(self.tr("Settings_ResetChoice_Cancel")).clicked() {
                    self.reset_open = false;
                }
            });
        if !open {
            self.reset_open = false;
        }
    }
}

fn paint_pill(painter: &egui::Painter, rect: egui::Rect, fill: egui::Color32, stroke: egui::Stroke) {
    painter.rect_filled(rect, 10.0, fill);
    painter.rect_stroke(rect, 10.0, stroke, egui::StrokeKind::Inside);
}

fn glyph(ui: &egui::Ui, text: &str, size: f32, color: egui::Color32, center: egui::Pos2) {
    ui.painter().text(
        center,
        egui::Align2::CENTER_CENTER,
        text,
        egui::FontId::new(size, egui::FontFamily::Name("mdl2".into())),
        color,
    );
}

fn paint_match(ui: &egui::Ui, pos: egui::Pos2, name: &str, query: &str, color: egui::Color32) {
    let font = egui::FontId::proportional(13.0);
    let highlight = if color.r() as u16 + color.g() as u16 + color.b() as u16 > 380 {
        egui::Color32::from_rgb(142, 202, 255)
    } else {
        egui::Color32::from_rgb(0, 90, 158)
    };
    let needle = query.trim().to_lowercase();
    let range = name.to_lowercase().find(&needle).and_then(|start| {
        let end = start + needle.len();
        (name.is_char_boundary(start) && name.is_char_boundary(end)).then_some((start, end))
    });
    let Some((start, end)) = range else {
        ui.painter()
            .text(pos, egui::Align2::LEFT_TOP, name, font, color);
        return;
    };
    let before = &name[..start];
    let middle = &name[start..end];
    let after = &name[end..];
    let before_width = ui
        .painter()
        .layout_no_wrap(before.to_string(), font.clone(), color)
        .rect
        .width();
    let middle_width = ui
        .painter()
        .layout_no_wrap(middle.to_string(), font.clone(), highlight)
        .rect
        .width();
    ui.painter()
        .text(pos, egui::Align2::LEFT_TOP, before, font.clone(), color);
    ui.painter().text(
        pos + egui::vec2(before_width, 0.0),
        egui::Align2::LEFT_TOP,
        middle,
        font.clone(),
        highlight,
    );
    ui.painter().text(
        pos + egui::vec2(before_width + middle_width, 0.0),
        egui::Align2::LEFT_TOP,
        after,
        font,
        color,
    );
}

fn result_row(
    ui: &mut egui::Ui,
    entry: &FileEntry,
    query: &str,
    selected: bool,
    text: egui::Color32,
    sub: egui::Color32,
) -> egui::Response {
    let width = ui.available_width();
    let (rect, response) =
        ui.allocate_exact_size(egui::vec2(width, 52.0), egui::Sense::click());
    if selected {
        ui.painter().rect_filled(
            rect,
            6.0,
            egui::Color32::from_rgba_unmultiplied(0x00, 0x78, 0xD4, 0x22),
        );
    } else if response.hovered() {
        ui.painter().rect_filled(rect, 6.0, egui::Color32::from_black_alpha(0x15));
    }
    let name_x = if entry.is_directory {
        ui.painter().text(
            egui::pos2(rect.left() + 16.0, rect.top() + 16.0),
            egui::Align2::CENTER_CENTER,
            "\u{E8B7}",
            egui::FontId::new(14.0, egui::FontFamily::Name("mdl2".into())),
            egui::Color32::from_rgb(0, 69, 120),
        );
        rect.left() + 30.0
    } else {
        rect.left() + 8.0
    };
    paint_match(ui, egui::pos2(name_x, rect.top() + 8.0), &entry.file_name, query, text);
    ui.painter().text(
        egui::pos2(name_x, rect.top() + 26.0),
        egui::Align2::LEFT_TOP,
        &entry.directory,
        egui::FontId::proportional(11.0),
        sub,
    );
    response
}

const PAGE_BG: egui::Color32 = egui::Color32::from_rgb(250, 250, 250);
const PAGE_MARGIN: f32 = 16.0;
const ACCENT: egui::Color32 = egui::Color32::from_rgb(0, 120, 212);
const INK: egui::Color32 = egui::Color32::from_rgb(32, 32, 32);
const RULE: egui::Color32 = egui::Color32::from_rgb(208, 208, 208);
const FIELD_LABEL_W: f32 = 120.0;
const FIELD_ROW_H: f32 = 32.0;
const STEP_BTN: f32 = 28.0;
const VALUE_W: f32 = 52.0;
const FIELD_GAP: f32 = 8.0;

fn settings_card(ui: &mut egui::Ui, title: &str, add: impl FnOnce(&mut egui::Ui)) {
    let width = ui.available_width();
    ui.set_min_width(width);
    let mut frame = egui::Frame::NONE;
    frame.fill = egui::Color32::WHITE;
    frame.stroke = egui::Stroke::new(1.0, RULE);
    frame.corner_radius = egui::CornerRadius::same(8);
    frame.inner_margin = egui::Margin::same(16);
    frame.show(ui, |ui| {
        ui.set_min_width((width - 32.0).max(0.0));
        ui.label(
            egui::RichText::new(title)
                .strong()
                .size(14.0)
                .color(INK),
        );
        ui.add_space(8.0);
        add(ui);
    });
    ui.add_space(10.0);
}

fn apply_dialog_theme(ctx: &egui::Context) {
    let mut visuals = egui::Visuals::light();
    visuals.panel_fill = PAGE_BG;
    visuals.window_fill = PAGE_BG;
    visuals.extreme_bg_color = egui::Color32::WHITE;
    visuals.selection.bg_fill = ACCENT;
    visuals.widgets.inactive.bg_fill = egui::Color32::WHITE;
    visuals.widgets.hovered.bg_fill = egui::Color32::from_rgb(243, 246, 250);
    visuals.widgets.active.bg_fill = egui::Color32::from_rgb(232, 240, 248);
    ctx.set_visuals(visuals);
}

fn icon_text_button(ui: &mut egui::Ui, icon: &str, label: &str) -> egui::Response {
    let font = egui::FontId::proportional(13.0);
    let galley = ui.painter().layout_no_wrap(label.to_string(), font, INK);
    let icon_width = 16.0;
    let gap = 6.0;
    let width = (24.0 + icon_width + gap + galley.rect.width()).max(88.0);
    let (rect, response) = ui.allocate_exact_size(egui::vec2(width, 32.0), egui::Sense::click());
    let fill = if response.hovered() {
        egui::Color32::from_rgb(243, 246, 250)
    } else {
        egui::Color32::WHITE
    };
    ui.painter().rect_filled(rect, 4.0, fill);
    ui.painter().rect_stroke(
        rect,
        4.0,
        egui::Stroke::new(1.0, RULE),
        egui::StrokeKind::Inside,
    );
    let content = icon_width + gap + galley.rect.width();
    let left = rect.center().x - content / 2.0;
    glyph(
        ui,
        icon,
        14.0,
        INK,
        egui::pos2(left + icon_width / 2.0, rect.center().y),
    );
    ui.painter().galley(
        egui::pos2(left + icon_width + gap, rect.center().y - galley.rect.height() / 2.0),
        galley,
        INK,
    );
    response
}

fn dialog_button(label: &str, primary: bool) -> egui::Button<'_> {
    let text = if primary {
        egui::RichText::new(label)
            .size(13.0)
            .color(egui::Color32::WHITE)
    } else {
        egui::RichText::new(label)
            .size(13.0)
            .color(egui::Color32::from_rgb(32, 32, 32))
    };
    let button = egui::Button::new(text).min_size(egui::vec2(88.0, 32.0));
    if primary {
        button.fill(egui::Color32::from_rgb(0, 120, 212))
    } else {
        button.fill(egui::Color32::WHITE)
    }
}

fn field_hint(ui: &mut egui::Ui, text: &str) {
    ui.add_space(2.0);
    let width = ui.available_width();
    let galley = ui.painter().layout(
        text.to_string(),
        egui::FontId::proportional(11.0),
        egui::Color32::from_rgb(136, 136, 136),
        (width - 22.0).max(40.0),
    );
    let height = galley.rect.height();
    let (rect, _) = ui.allocate_exact_size(egui::vec2(width, height), egui::Sense::hover());
    ui.painter().galley(
        egui::pos2(rect.left() + 22.0, rect.top()),
        galley,
        egui::Color32::from_rgb(136, 136, 136),
    );
    ui.add_space(4.0);
}

fn combo_line(
    ui: &mut egui::Ui,
    salt: &str,
    label: &str,
    selected: &str,
    add: impl FnOnce(&mut egui::Ui),
) {
    let row = allocate_field_row(ui);
    paint_field_label(ui, row, label);
    let combo_rect = egui::Rect::from_min_max(
        egui::pos2(row.left() + FIELD_LABEL_W + FIELD_GAP, row.top() + 4.0),
        egui::pos2(row.right(), row.bottom() - 4.0),
    );
    let mut combo_ui = ui.new_child(egui::UiBuilder::new().max_rect(combo_rect));
    egui::ComboBox::from_id_salt(salt)
        .selected_text(selected)
        .width(combo_rect.width())
        .show_ui(&mut combo_ui, add);
}

fn step_i32(ui: &mut egui::Ui, salt: &str, label: &str, value: &mut i32, min: i32, max: i32) {
    let slots = field_step_slots(ui, salt, label);
    if slots.minus {
        *value = (*value - 1).clamp(min, max);
    }
    if slots.plus {
        *value = (*value + 1).clamp(min, max);
    }
    let mut combo_ui = ui.new_child(egui::UiBuilder::new().max_rect(slots.bar));
    combo_ui.add(
        egui::Slider::new(value, min..=max)
            .show_value(false)
            .trailing_fill(true),
    );
    paint_field_value(ui, slots.row, &format!("{value}%"));
}

fn step_f64(
    ui: &mut egui::Ui,
    salt: &str,
    label: &str,
    value: &mut f64,
    min: f64,
    max: f64,
    step: f64,
) {
    let slots = field_step_slots(ui, salt, label);
    if slots.minus {
        *value = ((*value - step).clamp(min, max) * 10.0).round() / 10.0;
    }
    if slots.plus {
        *value = ((*value + step).clamp(min, max) * 10.0).round() / 10.0;
    }
    let mut combo_ui = ui.new_child(egui::UiBuilder::new().max_rect(slots.bar));
    combo_ui.add(
        egui::Slider::new(value, min..=max)
            .show_value(false)
            .step_by(step)
            .trailing_fill(true),
    );
    paint_field_value(ui, slots.row, &format!("{value:.1}"));
}

fn readout_bar(ui: &mut egui::Ui, label: &str, fraction: f32, value_text: &str) {
    let row = allocate_field_row(ui);
    paint_field_label(ui, row, label);
    let bar = egui::Rect::from_min_max(
        egui::pos2(row.left() + FIELD_LABEL_W + FIELD_GAP, row.center().y - 4.0),
        egui::pos2(row.right() - VALUE_W - FIELD_GAP, row.center().y + 4.0),
    );
    ui.painter()
        .rect_filled(bar, 4.0, egui::Color32::from_rgb(230, 230, 230));
    let fill = egui::Rect::from_min_size(
        bar.min,
        egui::vec2(bar.width() * fraction.clamp(0.0, 1.0), bar.height()),
    );
    ui.painter().rect_filled(fill, 4.0, ACCENT);
    paint_field_value(ui, row, value_text);
}

struct FieldSlots {
    row: egui::Rect,
    bar: egui::Rect,
    minus: bool,
    plus: bool,
}

fn allocate_field_row(ui: &mut egui::Ui) -> egui::Rect {
    let width = ui.available_width();
    let (row, _) = ui.allocate_exact_size(egui::vec2(width, FIELD_ROW_H), egui::Sense::hover());
    row
}

fn paint_field_label(ui: &egui::Ui, row: egui::Rect, label: &str) {
    ui.painter().text(
        egui::pos2(row.left(), row.center().y),
        egui::Align2::LEFT_CENTER,
        label,
        egui::FontId::proportional(13.0),
        INK,
    );
}

fn paint_field_value(ui: &egui::Ui, row: egui::Rect, value: &str) {
    ui.painter().text(
        egui::pos2(row.right(), row.center().y),
        egui::Align2::RIGHT_CENTER,
        value,
        egui::FontId::proportional(13.0),
        INK,
    );
}

fn field_step_slots(ui: &mut egui::Ui, salt: &str, label: &str) -> FieldSlots {
    let row = allocate_field_row(ui);
    paint_field_label(ui, row, label);
    let minus_rect = egui::Rect::from_center_size(
        egui::pos2(
            row.left() + FIELD_LABEL_W + FIELD_GAP + STEP_BTN / 2.0,
            row.center().y,
        ),
        egui::vec2(STEP_BTN, STEP_BTN),
    );
    let plus_rect = egui::Rect::from_center_size(
        egui::pos2(
            row.right() - VALUE_W - FIELD_GAP - STEP_BTN / 2.0,
            row.center().y,
        ),
        egui::vec2(STEP_BTN, STEP_BTN),
    );
    let bar = egui::Rect::from_center_size(
        egui::pos2(
            (minus_rect.right() + plus_rect.left()) / 2.0,
            row.center().y,
        ),
        egui::vec2(plus_rect.left() - minus_rect.right() - FIELD_GAP * 2.0, 20.0),
    );
    let minus = step_button(ui, ui.id().with((salt, "minus")), minus_rect, "−");
    let plus = step_button(ui, ui.id().with((salt, "plus")), plus_rect, "+");
    FieldSlots {
        row,
        bar,
        minus,
        plus,
    }
}

fn step_button(ui: &mut egui::Ui, id: egui::Id, rect: egui::Rect, glyph: &str) -> bool {
    let response = ui.interact(rect, id, egui::Sense::click());
    let fill = if response.hovered() {
        egui::Color32::from_rgb(243, 246, 250)
    } else {
        egui::Color32::WHITE
    };
    ui.painter().rect_filled(rect, 4.0, fill);
    ui.painter().rect_stroke(
        rect,
        4.0,
        egui::Stroke::new(1.0, RULE),
        egui::StrokeKind::Inside,
    );
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        glyph,
        egui::FontId::proportional(16.0),
        INK,
    );
    response.clicked()
}

fn button_row(ui: &mut egui::Ui, buttons: &[(String, bool)]) -> Option<usize> {
    if buttons.is_empty() {
        return None;
    }
    let gap = 8.0;
    let columns = if buttons.len() > 2 && ui.available_width() < 460.0 {
        2
    } else {
        buttons.len()
    };
    let mut clicked = None;
    for (row_index, row) in buttons.chunks(columns).enumerate() {
        let width = ui.available_width();
        let each = ((width - gap * (columns.saturating_sub(1) as f32)) / columns as f32).max(32.0);
        let (rect, _) = ui.allocate_exact_size(egui::vec2(width, 32.0), egui::Sense::hover());
        for (column, (label, enabled)) in row.iter().enumerate() {
            let index = row_index * columns + column;
            let x = rect.left() + column as f32 * (each + gap);
            let button_rect = egui::Rect::from_min_size(egui::pos2(x, rect.top()), egui::vec2(each, 32.0));
            let response = ui.interact(
                button_rect,
                ui.id().with(("settings-action", index, label)),
                if *enabled {
                    egui::Sense::click()
                } else {
                    egui::Sense::hover()
                },
            );
            let primary = index == 0;
            let fill = if !enabled {
                egui::Color32::from_rgb(243, 243, 243)
            } else if primary {
                ACCENT
            } else if response.hovered() {
                egui::Color32::from_rgb(243, 246, 250)
            } else {
                egui::Color32::WHITE
            };
            let text = if !enabled {
                egui::Color32::from_rgb(160, 160, 160)
            } else if primary {
                egui::Color32::WHITE
            } else {
                INK
            };
            ui.painter().rect_filled(button_rect, 4.0, fill);
            if !primary {
                ui.painter().rect_stroke(
                    button_rect,
                    4.0,
                    egui::Stroke::new(1.0, RULE),
                    egui::StrokeKind::Inside,
                );
            }
            ui.painter().text(
                button_rect.center(),
                egui::Align2::CENTER_CENTER,
                label,
                egui::FontId::proportional(13.0),
                text,
            );
            if *enabled && response.clicked() {
                clicked = Some(index);
            }
        }
    }
    clicked
}

fn swatch_grid(ui: &mut egui::Ui, swatches: &[&str], mut apply: impl FnMut(&str)) {
    let gap = 8.0;
    let cell = 28.0;
    let width = ui.available_width();
    let columns = ((width + gap) / (cell + gap)).floor().max(1.0) as usize;
    let rows = swatches.len().div_ceil(columns);
    let height = rows as f32 * cell + (rows.saturating_sub(1) as f32) * gap;
    let (rect, _) = ui.allocate_exact_size(egui::vec2(width, height), egui::Sense::hover());
    for (index, swatch) in swatches.iter().enumerate() {
        let column = index % columns;
        let row = index / columns;
        let origin = egui::pos2(
            rect.left() + column as f32 * (cell + gap),
            rect.top() + row as f32 * (cell + gap),
        );
        let cell_rect = egui::Rect::from_min_size(origin, egui::vec2(cell, cell));
        if color_swatch_at(ui, ui.id().with(index), cell_rect, color32(swatch)) {
            apply(swatch);
        }
    }
}

fn color_swatch_at(ui: &mut egui::Ui, id: egui::Id, rect: egui::Rect, color: egui::Color32) -> bool {
    let response = ui.interact(rect, id, egui::Sense::click());
    ui.painter().rect_filled(rect, 4.0, color);
    let border = if response.hovered() {
        ACCENT
    } else {
        egui::Color32::from_rgb(187, 187, 187)
    };
    ui.painter().rect_stroke(
        rect,
        4.0,
        egui::Stroke::new(1.0, border),
        egui::StrokeKind::Inside,
    );
    response.clicked()
}

fn resize_edge(ui: &mut egui::Ui, bar: egui::Rect, left: bool) {
    let rect = if left {
        egui::Rect::from_min_size(bar.left_top(), egui::vec2(8.0, bar.height()))
    } else {
        egui::Rect::from_min_size(
            egui::pos2(bar.right() - 8.0, bar.top()),
            egui::vec2(8.0, bar.height()),
        )
    };
    let response = ui.interact(
        rect,
        ui.id().with(("bar-resize", left)),
        egui::Sense::click_and_drag(),
    );
    if response.hovered() || response.dragged() {
        ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeHorizontal);
    }
    if response.drag_started() {
        ui.ctx()
            .send_viewport_cmd(egui::ViewportCommand::BeginResize(if left {
                egui::ResizeDirection::West
            } else {
                egui::ResizeDirection::East
            }));
    }
}

fn normalize_hex(hex: &str) -> String {
    let body = hex.trim().trim_start_matches('#');
    format!("#{body}")
}

fn fade(color: egui::Color32, window_opacity: i32) -> egui::Color32 {
    let factor = window_opacity.clamp(0, 100) as f32 / 100.0;
    egui::Color32::from_rgba_unmultiplied(
        color.r(),
        color.g(),
        color.b(),
        (color.a() as f32 * factor) as u8,
    )
}

#[cfg(windows)]
fn pick_color(current: &str) -> Option<String> {
    use std::sync::Mutex;
    #[repr(C)]
    struct ChooseColorW {
        struct_size: u32,
        owner: *mut std::ffi::c_void,
        instance: *mut std::ffi::c_void,
        result: u32,
        custom: *mut u32,
        flags: u32,
        cust_data: isize,
        hook: *mut std::ffi::c_void,
        template: *const u16,
    }
    #[link(name = "comdlg32")]
    extern "system" {
        fn ChooseColorW(choose: *mut ChooseColorW) -> i32;
    }
    static CUSTOM: Mutex<[u32; 16]> = Mutex::new([0x00FF_FFFF; 16]);
    let parsed = parse_color(current);
    let mut custom = CUSTOM.lock().ok()?;
    let mut choose = ChooseColorW {
        struct_size: std::mem::size_of::<ChooseColorW>() as u32,
        owner: std::ptr::null_mut(),
        instance: std::ptr::null_mut(),
        result: (parsed.b as u32) << 16 | (parsed.g as u32) << 8 | parsed.r as u32,
        custom: custom.as_mut_ptr(),
        flags: 0x1 | 0x2,
        cust_data: 0,
        hook: std::ptr::null_mut(),
        template: std::ptr::null(),
    };
    let ok = unsafe { ChooseColorW(&mut choose) } != 0;
    if !ok {
        return None;
    }
    let r = (choose.result & 0xFF) as u8;
    let g = ((choose.result >> 8) & 0xFF) as u8;
    let b = ((choose.result >> 16) & 0xFF) as u8;
    Some(format!("#{r:02X}{g:02X}{b:02X}"))
}

#[cfg(not(windows))]
fn pick_color(_current: &str) -> Option<String> {
    None
}

fn resync_label(language: &str, hours: u32) -> String {
    match hours {
        0 => t(language, "Settings_Resync_Disabled"),
        168 => t(language, "Settings_Resync_Weekly"),
        other => format_template(&t(language, "Settings_Resync_Hours"), &[&other.to_string()]),
    }
}

fn color32(hex: &str) -> egui::Color32 {
    let color = parse_color(hex);
    egui::Color32::from_rgba_unmultiplied(color.r, color.g, color.b, color.a)
}

fn color_with_alpha(hex: &str, opacity_percent: i32) -> egui::Color32 {
    let color = parse_color(hex);
    let alpha = (opacity_percent.clamp(0, 100) as u16 * 255 / 100) as u8;
    egui::Color32::from_rgba_unmultiplied(color.r, color.g, color.b, alpha)
}
