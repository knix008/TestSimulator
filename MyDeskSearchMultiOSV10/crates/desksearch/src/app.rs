use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, TryRecvError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use desksearch_core::color::{parse_color, BACKGROUND_SWATCHES};
use desksearch_core::debounce::Debouncer;
use desksearch_core::inclusion::normalize_drive_root;
use desksearch_core::instance::InstanceLock;
use desksearch_core::locale::{format_count, format_template, t};
use desksearch_core::model::{AppSettings, FileEntry, IndexOutcome, IndexProgress};
use desksearch_core::paths::{desktop_dir, settings_file};
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
    menu_open: bool,
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
        let mut app = Self {
            data_dir,
            draft: settings.clone(),
            saved: settings,
            query: String::new(),
            results: Vec::new(),
            selected: 0,
            status: String::new(),
            indexing: true,
            progress: None,
            using_previous: false,
            error: warn_settings.then(|| t("ko", "Error_SettingsLoad")),
            settings_open: false,
            about_open: false,
            reset_open: false,
            menu_open: false,
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
            _lock: lock,
        };
        app.status = t(&app.saved.language, "Index_InProgress");
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
                TrayAction::Exit => self.exit_requested = true,
            }
        }
        loop {
            match self.events.try_recv() {
                Ok(UiEvent::Results(results)) => {
                    self.results = results;
                    self.selected = 0;
                }
                Ok(UiEvent::Progress(progress)) => {
                    self.indexing = progress.percent < 100;
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
        self.menu_open = false;
    }

    fn submit_search(&self) {
        let source = self.appearance();
        let _ = self.commands.send(Command::Search {
            query: self.query.clone(),
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
        self.saved.window_height = Some(rect.height() as f64);
        self.draft.window_left = self.saved.window_left;
        self.draft.window_top = self.saved.window_top;
        self.draft.window_width = self.saved.window_width;
        self.draft.window_height = self.saved.window_height;
        self.geometry_dirty = Some(Instant::now() + Duration::from_millis(600));
    }

    fn desired_height(&self) -> f32 {
        let rows = if self.query.trim().is_empty() {
            0
        } else {
            self.results.len().clamp(1, 10)
        };
        50.0 + if rows == 0 {
            0.0
        } else {
            8.0 + rows as f32 * 42.0
        }
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
        let appearance = self.appearance().clone();
        if let Some(rect) = ctx.input(|input| input.viewport().inner_rect) {
            let width = rect.width().clamp(MIN_WIDTH, MAX_WIDTH);
            let height = self.desired_height();
            if (rect.width() - width).abs() > 1.0 || (rect.height() - height).abs() > 12.0 {
                ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(width, height)));
            }
        }

        let bg = color_with_alpha(&appearance.background_color, appearance.background_opacity);
        let text = color32(&appearance.text_color);
        let sub = color32(&appearance.sub_text_color);
        let border = color32(&appearance.border_color);
        egui::CentralPanel::default()
            .frame(
                egui::Frame::NONE
                    .fill(bg)
                    .stroke(egui::Stroke::new(
                        appearance.border_thickness as f32,
                        border,
                    ))
                    .inner_margin(egui::Margin::same(8)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let handle = ui.allocate_response(egui::vec2(18.0, 24.0), egui::Sense::drag());
                    ui.painter().text(
                        handle.rect.center(),
                        egui::Align2::CENTER_CENTER,
                        "≡",
                        egui::TextStyle::Body.resolve(ui.style()),
                        text,
                    );
                    if handle.dragged() {
                        ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
                    }
                    let hint = self.tr("Search_Placeholder");
                    let response = ui.add(
                        egui::TextEdit::singleline(&mut self.query)
                            .hint_text(hint)
                            .desired_width(f32::INFINITY),
                    );
                    if response.changed() {
                        self.query_dirty = true;
                        self.debounce.push(Instant::now());
                    }
                    if response.lost_focus()
                        && ui.input(|input| input.key_pressed(egui::Key::Enter))
                    {
                        self.open_selected(false);
                    }
                    if ui.input(|input| input.key_pressed(egui::Key::Escape)) {
                        self.query.clear();
                        self.results.clear();
                    }
                    if ui.button("⚙").clicked() {
                        self.open_settings();
                    }
                    if ui.button("▾").clicked() {
                        self.menu_open = !self.menu_open;
                    }
                });
                if self.menu_open {
                    self.draw_menu(ui);
                }
                ui.label(
                    egui::RichText::new(self.status_line())
                        .size(11.0)
                        .color(sub),
                );
                if let Some(error) = self.error.clone() {
                    ui.colored_label(egui::Color32::from_rgb(180, 40, 40), error);
                }
                self.draw_results(ui, text, sub);
            });

        self.draw_settings(&ctx);
        self.draw_about(&ctx);
        self.draw_reset(&ctx);
    }
}

impl DeskApp {
    fn status_line(&self) -> String {
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
            text
        } else if self.status.is_empty() {
            self.tr("Settings_ReadyStatus")
        } else {
            self.status.clone()
        }
    }

    fn draw_menu(&mut self, ui: &mut egui::Ui) {
        ui.separator();
        if ui.button(self.tr("Menu_ClearSearch")).clicked() {
            self.query.clear();
            self.results.clear();
            self.menu_open = false;
        }
        if ui.button(self.tr("Menu_RefreshIndex")).clicked() {
            self.full_retries = 0;
            self.start_index(true);
            self.menu_open = false;
        }
        if ui.button(self.tr("Menu_OpenDesktop")).clicked() {
            if let Some(desktop) = desktop_dir() {
                reveal_or_open(&desktop, false);
            }
            self.menu_open = false;
        }
        if ui.button(self.tr("Menu_ResetPosition")).clicked() {
            ui.ctx()
                .send_viewport_cmd(egui::ViewportCommand::OuterPosition(egui::pos2(80.0, 24.0)));
            self.menu_open = false;
        }
        let mut above = self.saved.always_on_top;
        if ui
            .checkbox(&mut above, self.tr("Menu_AboveOthers"))
            .changed()
        {
            self.saved.always_on_top = above;
            self.draft.always_on_top = above;
            let _ = save_settings_file(&settings_file(&self.data_dir), &self.saved);
        }
        if ui.button(self.tr("Menu_Settings")).clicked() {
            self.open_settings();
        }
        if ui.button(self.tr("Menu_Hide")).clicked() {
            self.hide_window(ui.ctx());
            self.menu_open = false;
        }
        if ui.button(self.tr("Menu_Exit")).clicked() {
            self.exit_requested = true;
        }
    }

    fn draw_results(&mut self, ui: &mut egui::Ui, _text: egui::Color32, sub: egui::Color32) {
        if self.query.trim().is_empty() {
            return;
        }
        if self.results.is_empty() {
            ui.label(egui::RichText::new(self.tr("Search_NoResults")).color(sub));
            return;
        }
        let mut open_index = None;
        let mut reveal_index = None;
        egui::ScrollArea::vertical()
            .max_height(420.0)
            .show(ui, |ui| {
                for index in 0..self.results.len() {
                    let entry = self.results[index].clone();
                    let selected = index == self.selected;
                    let icon = if entry.is_directory { "DIR" } else { "FILE" };
                    let response = ui.add_sized(
                        [ui.available_width(), 40.0],
                        egui::Button::new(format!(
                            "{icon}  {}\n{}",
                            entry.file_name, entry.directory
                        ))
                        .selected(selected),
                    );
                    if response.clicked() {
                        self.selected = index;
                        if entry.is_directory {
                            open_index = Some(index);
                        } else {
                            reveal_index = Some(index);
                        }
                    }
                    if response.double_clicked() {
                        open_index = Some(index);
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
        let mut open = true;
        let title = self.tr("Settings_Title");
        egui::Window::new(title)
            .open(&mut open)
            .resizable(true)
            .default_width(460.0)
            .show(ctx, |ui| {
                egui::ScrollArea::vertical().show(ui, |ui| {
                    ui.label(self.tr("Settings_Language"));
                    egui::ComboBox::from_id_salt("language")
                        .selected_text(if self.draft.language == "en" {
                            self.tr("Settings_Language_English")
                        } else {
                            self.tr("Settings_Language_Korean")
                        })
                        .show_ui(ui, |ui| {
                            ui.selectable_value(&mut self.draft.language, "ko".into(), "한국어");
                            ui.selectable_value(&mut self.draft.language, "en".into(), "English");
                        });
                    let case_label = self.tr("Settings_CaseSensitive");
                    let regex_label = self.tr("Settings_UseRegex");
                    ui.checkbox(&mut self.draft.case_sensitive_search, case_label);
                    ui.checkbox(&mut self.draft.use_regex_search, regex_label);
                    ui.label(self.tr("Settings_SearchMultilingualNote"));
                    self.draw_sort(ui);
                    self.draw_scope(ui);
                    self.draw_index_controls(ui);
                    let startup_label = self.tr("Settings_RunAtStartup");
                    ui.checkbox(&mut self.draft.run_at_startup, startup_label);
                    ui.label(self.tr("Settings_RunAtStartupDesc"));
                    let tray_label = self.tr("Settings_ShowTrayIcon");
                    ui.checkbox(&mut self.draft.show_tray_icon, tray_label);
                    ui.label(self.tr("Settings_ShowTrayIconDesc"));
                    ui.separator();
                    ui.label(self.tr("Settings_BackgroundColor"));
                    ui.horizontal_wrapped(|ui| {
                        for swatch in BACKGROUND_SWATCHES {
                            let color = color32(swatch);
                            if ui
                                .add(
                                    egui::Button::new(" ")
                                        .fill(color)
                                        .min_size(egui::vec2(18.0, 18.0)),
                                )
                                .clicked()
                            {
                                self.draft.background_color = (*swatch).to_string();
                                desksearch_core::color::sync_theme_text_colors(&mut self.draft);
                            }
                        }
                    });
                    let background_opacity = self.tr("Settings_BackgroundOpacity");
                    let window_opacity = self.tr("Settings_WindowOpacity");
                    let border_thickness = self.tr("Settings_BorderThickness");
                    ui.add(
                        egui::Slider::new(&mut self.draft.background_opacity, 40..=100)
                            .text(background_opacity),
                    );
                    ui.add(
                        egui::Slider::new(&mut self.draft.window_opacity, 50..=100)
                            .text(window_opacity),
                    );
                    ui.add(
                        egui::Slider::new(&mut self.draft.border_thickness, 0.0..=6.0)
                            .text(border_thickness),
                    );
                    let mut above = self.draft.always_on_top;
                    if ui
                        .checkbox(&mut above, self.tr("Settings_AboveOthers"))
                        .changed()
                    {
                        self.draft.always_on_top = above;
                    }
                    ui.horizontal(|ui| {
                        if ui.button(self.tr("Settings_Save")).clicked() {
                            self.save_settings();
                        }
                        if ui.button(self.tr("Settings_Cancel")).clicked() {
                            self.draft = self.saved.clone();
                            self.settings_open = false;
                        }
                        if ui.button(self.tr("About_Title")).clicked() {
                            self.about_open = true;
                        }
                    });
                });
            });
        if !open {
            self.draft = self.saved.clone();
            self.settings_open = false;
        }
    }

    fn draw_sort(&mut self, ui: &mut egui::Ui) {
        let current = self.tr(self.draft.search_result_sort.label_key());
        ui.label(self.tr("Settings_SearchResultSort"));
        egui::ComboBox::from_id_salt("sort")
            .selected_text(current)
            .show_ui(ui, |ui| {
                for sort in SearchResultSortOrder::ALL {
                    let label = t(&self.draft.language, sort.label_key());
                    ui.selectable_value(&mut self.draft.search_result_sort, sort, label);
                }
            });
    }

    fn draw_scope(&mut self, ui: &mut egui::Ui) {
        ui.separator();
        ui.label(self.tr("Settings_Exclusion"));
        ui.label(self.tr("Settings_ExcludedDrivesDesc"));
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
        for drive in &drives {
            let mut checked = next.iter().any(|item| item.eq_ignore_ascii_case(drive));
            let label = if Path::new(drive).exists() {
                drive.clone()
            } else {
                format!("{} ({})", drive, self.tr("Settings_DriveUnavailable"))
            };
            if ui.checkbox(&mut checked, label).changed() {
                next.retain(|item| !item.eq_ignore_ascii_case(drive));
                if checked {
                    next.push(drive.clone());
                }
            }
        }
        self.draft.included_drives = next;

        ui.label(self.tr("Settings_ExcludedDirectories"));
        ui.label(self.tr("Settings_ExcludedDirectoriesDesc"));
        let mut remove = None;
        for (index, directory) in self.draft.included_directories.iter().enumerate() {
            ui.horizontal(|ui| {
                if ui
                    .selectable_label(self.selected_folder == Some(index), directory)
                    .clicked()
                {
                    self.selected_folder = Some(index);
                }
            });
        }
        ui.horizontal(|ui| {
            if ui.button(self.tr("Settings_BrowseFolder")).clicked() {
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
            if ui.button(self.tr("Settings_RemoveExcluded")).clicked() {
                remove = self.selected_folder;
            }
        });
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
        ui.separator();
        ui.label(self.tr("Settings_PeriodicResync"));
        let current = resync_label(&self.draft.language, self.draft.resync_interval_hours);
        egui::ComboBox::from_id_salt("resync")
            .selected_text(current)
            .show_ui(ui, |ui| {
                for hours in [0, 1, 4, 8, 12, 24, 168] {
                    let label = resync_label(&self.draft.language, hours);
                    ui.selectable_value(&mut self.draft.resync_interval_hours, hours, label);
                }
            });
        ui.label(self.status_line());
        ui.horizontal(|ui| {
            if ui.button(self.tr("Settings_Indexing")).clicked() {
                self.save_draft_scope_for_index();
                self.full_retries = 0;
                self.start_index(true);
            }
            if ui
                .add_enabled(
                    self.indexing,
                    egui::Button::new(self.tr("Settings_StopIndexing")),
                )
                .clicked()
            {
                self.cancel.store(true, Ordering::Relaxed);
                let _ = self.commands.send(Command::Pause);
            }
            if ui
                .add_enabled(
                    !self.indexing,
                    egui::Button::new(self.tr("Settings_ResetIndex")),
                )
                .clicked()
            {
                self.reset_open = true;
            }
            if ui.button(self.tr("Settings_OpenDataFolder")).clicked() {
                let _ = std::fs::create_dir_all(&self.data_dir);
                reveal_or_open(&self.data_dir, false);
            }
        });
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
        let mut open = true;
        egui::Window::new(self.tr("About_Title"))
            .open(&mut open)
            .show(ctx, |ui| {
                ui.heading(self.tr("App_Title"));
                ui.label(format_template(
                    &self.tr("About_Version"),
                    &[desksearch_core::VERSION],
                ));
                ui.label(self.tr("About_Description"));
                ui.label(self.tr("About_Author"));
                if ui.button(self.tr("About_Ok")).clicked() {
                    self.about_open = false;
                }
            });
        if !open {
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
