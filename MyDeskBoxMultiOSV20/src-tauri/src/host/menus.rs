// 설정 창, 프로그램 설정, 테마·이름 바꾸기, 속성 줄, 박스·트레이 메뉴 (Electron 판 fences.js 뒷부분, tray.js).

use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::time::Instant;

use super::{is_directory, Host, AUTHOR_EMAIL, AUTHOR_NAME};
use crate::desktop::is_shell_item;
use crate::geom::{is_recycle, is_shortcut, Point, Rect, SHADOW};
use crate::i18n;
use crate::js::{grouped, locale_string, round, to_fixed};
use crate::pathx::{basename, dirname, extname};
use crate::store::{js_number, Custom};
use crate::themes;
use crate::ui::{Action, MenuIcon, MenuItem, Props, Row, WinSpec};

const PREFS_W: f64 = 380.0;
const PREFS_H: f64 = 479.0;
// 폴더를 따라 내려가 크기를 잴 때의 한도. 한도에 닿으면 잰 값에 '이상'을 붙인다.
pub const WALK_ENTRIES: i64 = 40_000;
pub const WALK_MS: u64 = 1200;

pub struct Budget {
    pub entries: i64,
    pub until: Instant,
    pub capped: bool,
}

impl Budget {
    pub fn new(entries: i64, ms: u64) -> Self {
        Self { entries, until: Instant::now() + std::time::Duration::from_millis(ms), capped: false }
    }
}

pub(crate) fn asset(name: &str) -> MenuIcon {
    MenuIcon::Asset(format!("menu/{name}.png"))
}

pub(crate) fn theme_chip(id: &str) -> MenuIcon {
    asset(&format!("theme-{}", themes::theme_of(id).id))
}

pub(crate) fn corner_icon(radius: i64) -> MenuIcon {
    asset(&format!("corner-{}", themes::corner_name(&json!(radius))))
}

pub(crate) fn opacity_icon(value: f64) -> MenuIcon {
    let list = themes::opacities();
    let mut near = list[0];
    for step in list {
        if (step - value).abs() < (near - value).abs() {
            near = *step;
        }
    }
    asset(&format!("opacity-{}", round(near * 100.0) as i64))
}

pub(crate) fn flag(lang: &str) -> MenuIcon {
    asset(&format!("lang-{}", i18n::lang_of(lang)))
}

fn act(label: String, icon: MenuIcon, action: Action) -> MenuItem {
    MenuItem::Action { label, icon, enabled: true, accel: String::new(), action }
}

impl Host {
    // 가운데에 띄울 창 자리 (Electron 은 x, y 가 없으면 첫 화면 한가운데에 띄운다).
    fn centered(&self, width: f64, height: f64) -> Rect {
        let area = self.ui.primary_work_area();
        Rect::new(round(area.x + (area.width - width) / 2.0), round(area.y + (area.height - height) / 2.0), width, height)
    }

    pub fn open_settings(&mut self, id: &str) {
        if self.fence(id).is_none() {
            return;
        }
        if let Some(win) = self.setting_wins.get(id) {
            self.ui.show(&win.label, true);
            return;
        }
        // 테마 조각은 한 줄에 열 개씩 세 줄이다.
        let bounds = self.centered(380.0 + SHADOW * 2.0, 457.0 + SHADOW * 2.0);
        let label = self.new_label("settings");
        self.ui.open(WinSpec {
            label: label.clone(),
            page: "renderer/settings.html",
            query: format!("?id={}", super::encode_query(id)),
            bounds,
            focusable: true,
            always_on_top: false,
            ignore_mouse: false,
            fence: false,
        });
        self.setting_wins.insert(id.to_string(), super::Win { label, bounds, visible: false, loaded: false });
    }

    // 프로그램 전체 설정 창. 크기는 고정이다.
    pub fn open_prefs(&mut self) {
        if let Some(win) = &self.prefs_win {
            self.ui.show(&win.label, true);
            return;
        }
        let bounds = self.centered(PREFS_W + SHADOW * 2.0, PREFS_H + SHADOW * 2.0);
        let label = "prefs".to_string();
        self.ui.open(WinSpec {
            label: label.clone(),
            page: "renderer/prefs.html",
            query: String::new(),
            bounds,
            focusable: true,
            always_on_top: false,
            ignore_mouse: false,
            fence: false,
        });
        self.prefs_win = Some(super::Win { label, bounds, visible: false, loaded: false });
    }

    pub fn close_prefs(&mut self) {
        if let Some(win) = &self.prefs_win {
            self.ui.close(&win.label);
        }
    }

    fn data_url(&self, name: &str, size: u32) -> String {
        match self.ui.asset(name) {
            Some(img) => img.resize(size, size, true).data_url(),
            None => String::new(),
        }
    }

    fn theme_rows() -> Vec<Value> {
        themes::themes().iter().map(|t| json!({ "id": t.id, "label": t.label, "bg": t.bg, "bar": t.bar })).collect()
    }

    pub fn push_prefs(&mut self) {
        let Some(win) = &self.prefs_win else { return };
        let label = win.label.clone();
        let mut settings = serde_json::to_value(&self.state.settings).unwrap();
        settings["corner"] = json!(self.state.settings.corner);
        let root = self.hold.root_dir();
        let payload = json!({
            "lang": self.state.settings.lang,
            "settings": settings,
            "langs": i18n::LANGS.iter().map(|(id, label)| json!({ "id": id, "label": label })).collect::<Vec<_>>(),
            "themes": Self::theme_rows(),
            "corner": { "min": themes::min_corner(), "max": themes::max_corner() },
            "opacity": { "min": 0.15, "max": 0.9 },
            "gear": self.data_url("menu/settings.png", 18),
            "boxRoot": root,
            "about": {
                "name": self.ui.app_name(),
                "version": self.ui.app_version(),
                "author": AUTHOR_NAME,
                "email": AUTHOR_EMAIL,
                "icon": self.data_url("icon.png", 56),
            },
        });
        self.ui.send(&label, "prefs:state", payload);
    }

    // 설정 창에서 바꾼 프로그램 전체 값.
    pub fn change_prefs(&mut self, patch: &Value) {
        if let Some(lang) = patch.get("lang").and_then(Value::as_str) {
            self.set_lang(lang);
        }
        if let Some(on) = patch.get("openAtLogin").and_then(Value::as_bool) {
            self.set_login(on);
        }
        if let Some(kind) = patch.get("openWith").and_then(Value::as_str) {
            self.set_open_with(kind);
        }
        if let Some(on) = patch.get("shadow").and_then(Value::as_bool) {
            self.set_shadow(on);
        }
        if let Some(on) = patch.get("showHidden").and_then(Value::as_bool) {
            self.set_show_hidden_all(on);
        }
        if let Some(theme) = patch.get("theme").and_then(Value::as_str) {
            self.set_default_theme(theme);
        }
        if let Some(corner) = patch.get("corner") {
            self.set_default_corner(themes::corner_radius(corner));
        }
        if let Some(opacity) = patch.get("opacity").and_then(Value::as_f64) {
            self.set_default_opacity(opacity);
        }
        self.push_prefs();
    }

    // 설정 창의 단추들. 폴더를 열거나, 담은 것을 모두 바탕화면으로 돌려준다.
    pub fn prefs_action(&mut self, what: &str) {
        match what {
            "boxes" => {
                let dir = self.box_root();
                if !dir.is_empty() {
                    self.ui.open_path(&dir);
                }
            }
            "data" => self.ui.open_path(&self.ui.user_dir()),
            "putBack" => {
                self.return_all();
                self.push_prefs();
            }
            _ => {}
        }
    }

    // 설정 창을 내용 높이에 맞춘다. 스크롤 막대가 생기지 않게 한다.
    pub fn fit_settings(&mut self, id: &str, height: f64) {
        let want = round(if height.is_finite() { height } else { 0.0 }).clamp(240.0, 900.0);
        let ui = self.ui.clone();
        let Some(win) = self.setting_wins.get_mut(id) else { return };
        let outer = want + SHADOW * 2.0;
        if (win.bounds.height - outer).abs() < 2.0 {
            return;
        }
        win.bounds.height = outer;
        ui.set_bounds(&win.label, win.bounds);
    }

    pub fn close_settings(&mut self, id: &str) {
        if let Some(win) = self.setting_wins.get(id) {
            self.ui.close(&win.label);
        }
    }

    pub fn push_settings(&mut self, id: &str) {
        let Some(win) = self.setting_wins.get(id) else { return };
        let label = win.label.clone();
        let Some(fence) = self.fence(id).cloned() else { return };
        let payload = json!({
            "fence": fence,
            "lang": self.state.settings.lang,
            "icon": self.data_url("icon.png", 18),
            "themes": Self::theme_rows(),
            "corner": { "radius": fence.corner, "min": themes::min_corner(), "max": themes::max_corner() },
            "look": super::resolve_theme(&fence),
            "opacity": { "value": fence.opacity, "min": 0.15, "max": 0.9 },
            "shadow": self.state.settings.shadow,
        });
        self.ui.send(&label, "box:state", payload);
    }

    // 설정 창에서 바꾼 것을 곧바로 박스에 반영한다.
    pub fn change_box(&mut self, id: &str, patch: &Value) {
        if let Some(title) = patch.get("title").and_then(Value::as_str) {
            self.rename(id, title);
        }
        if let Some(on) = patch.get("collapsed").and_then(Value::as_bool) {
            self.set_collapsed(id, on);
        }
        if let Some(on) = patch.get("shadow").and_then(Value::as_bool) {
            self.set_shadow(on);
        }
        if let Some(on) = patch.get("showHidden").and_then(Value::as_bool) {
            self.set_show_hidden(id, on);
        }
        let has = |k: &str| patch.get(k).map(|v| !v.is_null() && v != &json!(false) && v != &json!("")).unwrap_or(false);
        if has("theme") || has("custom") || patch.get("corner").is_some() || patch.get("opacity").map(Value::is_number).unwrap_or(false) {
            self.restyle(id, patch);
        }
        self.push_settings(id);
    }

    // 숨김·임시 파일을 보여 줄지. 파일은 그대로 두고 그리는 것만 바뀐다.
    pub fn set_show_hidden(&mut self, id: &str, on: bool) {
        let Some(f) = self.fence_mut(id) else { return };
        if f.show_hidden == on {
            return;
        }
        f.show_hidden = on;
        self.persist();
        self.push(id);
    }

    // 이 박스만 처음 모습으로 되돌린다. 안의 아이콘과 자리는 그대로 둔다.
    pub fn reset_box(&mut self, id: &str) {
        let s = self.state.settings.clone();
        let Some(f) = self.fence_mut(id) else { return };
        f.theme = s.theme.clone();
        f.custom = None;
        f.corner = s.corner;
        f.opacity = s.opacity;
        f.collapsed = false;
        f.show_hidden = s.show_hidden;
        let (x, y, w, h) = (f.x, f.y, f.w, f.h);
        self.persist();
        self.apply_bounds(id, x, y, w, h, true);
        self.push(id);
    }

    pub fn rename(&mut self, id: &str, title: &str) {
        let next = title.trim().to_string();
        if next.is_empty() {
            return;
        }
        let Some(f) = self.fence_mut(id) else { return };
        f.title = next;
        self.persist();
        self.push(id);
    }

    pub fn restyle(&mut self, id: &str, patch: &Value) {
        let Some(f) = self.fence_mut(id) else { return };
        if let Some(theme) = patch.get("theme").and_then(Value::as_str) {
            f.theme = if theme == "custom" { "custom".into() } else { themes::theme_of(theme).id.clone() };
        }
        if let Some(custom) = patch.get("custom").filter(|c| crate::store::truthy(c)) {
            let made = themes::custom_theme(custom.get("bg").and_then(Value::as_str), custom.get("bar").and_then(Value::as_str));
            f.custom = Some(Custom { bg: made.bg, bar: made.bar });
            f.theme = "custom".into();
        }
        if let Some(corner) = patch.get("corner") {
            f.corner = themes::corner_radius(corner);
        }
        if let Some(opacity) = patch.get("opacity").and_then(Value::as_f64) {
            f.opacity = opacity.clamp(0.15, 0.9);
        }
        self.persist();
        self.push(id);
    }

    pub fn set_hidden(&mut self, hidden: bool) {
        if self.state.hidden == hidden {
            return;
        }
        self.state.hidden = hidden;
        self.persist();
        let ids: Vec<String> = self.wins.iter().map(|(id, _)| id.clone()).collect();
        for id in ids {
            if hidden {
                let ui = self.ui.clone();
                if let Some(win) = self.win_mut(&id) {
                    win.visible = false;
                    ui.hide(&win.label);
                }
            } else {
                self.show_fence(&id);
                self.push(&id);
            }
        }
        self.refresh_icons();
        self.announce();
    }

    pub fn toggle_hidden(&mut self) {
        let next = !self.state.hidden;
        self.set_hidden(next);
    }

    pub fn begin_draw(&mut self) {
        if let Some(label) = &self.draw_win {
            self.ui.show(label, true);
            return;
        }
        let cursor = self.ui.cursor().unwrap_or_default();
        let bounds = self.ui.display_nearest(cursor).map(|d| d.bounds).unwrap_or_else(|| self.ui.primary_work_area());
        let label = "draw".to_string();
        self.ui.open(WinSpec {
            label: label.clone(),
            page: "renderer/draw.html",
            query: format!("?lang={}", self.state.settings.lang),
            bounds,
            focusable: true,
            always_on_top: true,
            ignore_mouse: false,
            fence: false,
        });
        self.draw_win = Some(label);
    }

    pub fn finish_draw(&mut self, x: f64, y: f64, w: f64, h: f64) -> Option<String> {
        if let Some(label) = &self.draw_win {
            self.ui.close(label);
        }
        if w < 80.0 || h < 64.0 {
            return None;
        }
        // 박스를 그렸다면 보고 싶다는 뜻이다. 숨겨 둔 상태면 함께 되돌린다.
        self.set_hidden(false);
        Some(self.create_fence(super::moves::NewRect { x, y, w, h }))
    }

    pub fn cancel_draw(&mut self) {
        if let Some(label) = &self.draw_win {
            self.ui.close(label);
        }
    }

    pub fn set_lang(&mut self, lang: &str) {
        let next = i18n::lang_of(lang);
        if self.state.settings.lang == next {
            return;
        }
        self.state.settings.lang = next.into();
        self.persist();
        self.push_all();
        self.announce();
    }

    pub fn set_default_theme(&mut self, theme: &str) {
        self.state.settings.theme = themes::theme_of(theme).id.clone();
        self.persist();
        self.announce();
    }

    pub fn set_default_corner(&mut self, corner: i64) {
        self.state.settings.corner = themes::corner_radius(&json!(corner));
        self.persist();
        self.announce();
    }

    // 아이콘을 한 번 눌러 열지, 두 번 눌러 열지 정한다.
    pub fn set_open_with(&mut self, kind: &str) {
        let next = if kind == "single" { "single" } else { "double" };
        if self.state.settings.open_with == next {
            return;
        }
        self.state.settings.open_with = next.into();
        self.persist();
        self.push_all();
        self.announce();
    }

    // 모든 박스에 함께 걸고, 새 박스도 이 값을 따른다.
    pub fn set_show_hidden_all(&mut self, on: bool) {
        self.state.settings.show_hidden = on;
        for f in &mut self.state.fences {
            f.show_hidden = on;
        }
        self.persist();
        self.push_all();
        self.announce();
    }

    pub fn set_shadow(&mut self, on: bool) {
        self.state.settings.shadow = on;
        self.persist();
        let fences = self.state.fences.clone();
        for f in fences {
            if self.win(&f.id).is_none() {
                continue;
            }
            let rect = crate::geom::window_rect(f.x, f.y, f.w, f.collapsed, f.h, on);
            self.set_bounds(&f.id, rect);
        }
        self.push_all();
        self.announce();
    }

    pub fn set_default_opacity(&mut self, opacity: f64) {
        let value = if opacity.is_finite() && opacity != 0.0 { opacity } else { themes::default_opacity() };
        self.state.settings.opacity = value.clamp(0.15, 0.9);
        self.persist();
        self.announce();
    }

    pub fn set_login(&mut self, on: bool) {
        self.state.settings.open_at_login = on;
        // 설치본이 아니거나 운영체제가 거절하면 적히지 않는다. 그래도 고른 값은 남긴다.
        self.autostart.apply(on, &self.ui.app_name());
        self.persist();
        self.announce();
    }

    // 켜질 때 한 번. 설정에 적힌 대로 운영체제의 시작프로그램 목록을 다시 맞춘다.
    pub fn sync_login(&self) -> bool {
        self.autostart.sync(self.state.settings.open_at_login, &self.ui.app_name())
    }

    // ── 속성 ────────────────────────────────────────────────────────────

    fn size_text(&self, bytes: u64, capped: bool) -> String {
        let units = ["B", "KB", "MB", "GB", "TB"];
        let mut n = bytes as f64;
        let mut unit = 0;
        while n >= 1024.0 && unit < units.len() - 1 {
            n /= 1024.0;
            unit += 1;
        }
        let exact = self.sayv("props.bytes", &[("n", grouped(bytes))]);
        // 1024 바이트가 안 되면 바이트 수만으로 충분하다.
        let text = if unit == 0 { exact } else { format!("{} {} ({exact})", to_fixed(n, if n < 10.0 { 1 } else { 0 }), units[unit]) };
        if capped {
            self.sayv("props.atLeast", &[("size", text)])
        } else {
            text
        }
    }

    fn when_text(&self, time: Option<std::time::SystemTime>) -> String {
        let Some(t) = time else { return String::new() };
        let ms = t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0);
        if ms == 0.0 {
            return String::new();
        }
        locale_string(ms, &self.state.settings.lang)
    }

    fn kind_text(&self, path: &str, folder: bool) -> String {
        if is_shell_item(path) {
            return self.say("props.system");
        }
        if is_shortcut(path) {
            return self.say("props.shortcut");
        }
        if folder {
            return self.say("props.folder");
        }
        let ext = extname(path);
        if ext.is_empty() {
            self.say("props.plainFile")
        } else {
            self.sayv("props.extFile", &[("ext", ext[1..].to_uppercase())])
        }
    }

    fn group_rows(&mut self, id: &str, group: &[String], budget: &mut Budget) -> (String, String, Vec<Row>) {
        let box_name = self.fence(id).map(|f| if f.title.is_empty() { self.say("box.untitled") } else { f.title.clone() }).unwrap_or_default();
        let (mut bytes, mut files, mut dirs) = (0u64, 0u64, 0u64);
        for one in group {
            if is_shell_item(one) {
                continue;
            }
            let Some(found) = measure(one, budget) else { continue };
            bytes += found.bytes;
            // 고른 것 자체도 하나로 센다. 폴더는 그 안의 것까지 더한다.
            if found.folder {
                dirs += 1 + found.dirs;
                files += found.files;
            } else {
                files += 1;
            }
        }
        let mut kinds: Vec<String> = group.iter().map(|one| self.kind_text(one, is_directory(one))).collect();
        kinds.dedup();
        let kinds_unique: std::collections::BTreeSet<String> = kinds.iter().cloned().collect();
        let kind = if kinds_unique.len() == 1 { kinds[0].clone() } else { self.say("props.manyKinds") };
        let rows = vec![
            Row { label: self.say("props.box"), value: box_name, wide: false },
            Row { label: self.say("props.where"), value: dirname(&group[0]), wide: true },
            Row { label: self.say("props.size"), value: self.size_text(bytes, budget.capped), wide: false },
            Row { label: self.say("props.count"), value: self.sayv("props.inside", &[("files", files.to_string()), ("dirs", dirs.to_string())]), wide: false },
        ];
        (self.sayv("props.many", &[("n", group.len().to_string())]), kind, rows)
    }

    fn item_rows(&mut self, id: &str, path: &str, budget: &mut Budget) -> (String, String, Vec<Row>) {
        let box_name = self.fence(id).map(|f| if f.title.is_empty() { self.say("box.untitled") } else { f.title.clone() }).unwrap_or_default();
        let name = basename(path);
        let label = {
            let l = self.label_for(&crate::store::Item::new(name.clone(), path));
            if l.is_empty() {
                name.clone()
            } else {
                l
            }
        };
        let mut rows = Vec::new();
        // 셸 항목(휴지통 따위)에는 잴 파일이 없다. 아는 것만 적는다.
        if is_shell_item(path) {
            rows.push(Row { label: self.say("props.box"), value: box_name, wide: false });
            rows.push(Row { label: self.say("props.where"), value: path.to_string(), wide: true });
            if is_recycle(path) {
                let left = self.desk.recycle_count();
                if left >= 0 {
                    rows.push(Row { label: self.say("props.count"), value: self.sayv("props.many", &[("n", left.to_string())]), wide: false });
                }
            }
            return (label, self.say("props.system"), rows);
        }
        let found = measure(path, budget);
        let kind = self.kind_text(path, found.as_ref().map(|f| f.folder).unwrap_or(false));
        if label != name {
            rows.push(Row { label: self.say("props.file"), value: name.clone(), wide: true });
        }
        rows.push(Row { label: self.say("props.box"), value: box_name, wide: false });
        rows.push(Row { label: self.say("props.where"), value: dirname(path), wide: true });
        if let Some(link) = self.shortcut_link(path) {
            rows.push(Row { label: self.say("props.target"), value: link.target, wide: true });
        }
        let Some(found) = found else {
            // 박스에 담긴 뒤 바깥에서 지워진 항목. 다음 훑기에서 아이콘이 사라진다.
            return (label, format!("{kind} · {}", self.say("props.gone")), rows);
        };
        rows.push(Row { label: self.say("props.size"), value: self.size_text(found.bytes, budget.capped), wide: false });
        if found.folder {
            rows.push(Row {
                label: self.say("props.count"),
                value: self.sayv("props.inside", &[("files", found.files.to_string()), ("dirs", found.dirs.to_string())]),
                wide: false,
            });
        }
        let made = self.when_text(found.meta.created().ok());
        if !made.is_empty() {
            rows.push(Row { label: self.say("props.made"), value: made, wide: false });
        }
        rows.push(Row { label: self.say("props.changed"), value: self.when_text(found.meta.modified().ok()), wide: false });
        rows.push(Row { label: self.say("props.used"), value: self.when_text(found.meta.accessed().ok()), wide: false });
        let mut attrs = Vec::new();
        if found.meta.permissions().readonly() {
            attrs.push(self.say("props.readonly"));
        }
        if fs::symlink_metadata(path).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
            attrs.push(self.say("props.link"));
        }
        let value = if attrs.is_empty() { self.say("props.none") } else { attrs.join(" · ") };
        rows.push(Row { label: self.say("props.attrs"), value, wide: false });
        (label, kind, rows)
    }

    // limits 는 폴더를 얼마나 따라 내려갈지다. 검사에서 한도에 닿는 경우를 흉내 낼 수 있게 열어 둔다.
    pub fn show_props(&mut self, id: &str, path: &str, paths: &[String], limits: Option<(i64, u64)>) -> Option<Props> {
        if path.is_empty() || self.fence(id).is_none() {
            return None;
        }
        let group: Vec<String> = if paths.len() > 1 && paths.iter().any(|p| p == path) { paths.to_vec() } else { vec![path.to_string()] };
        let (entries, ms) = limits.unwrap_or((WALK_ENTRIES, WALK_MS));
        let mut budget = Budget::new(entries, ms);
        let (title, kind, rows) = if group.len() > 1 { self.group_rows(id, &group, &mut budget) } else { self.item_rows(id, path, &mut budget) };
        // 같은 항목의 창을 두 번 열지 않는다. 묶음은 고른 것이 달라지면 다른 창이다.
        let key = if group.len() > 1 {
            let mut sorted = group.clone();
            sorted.sort();
            format!("{id}:{}", sorted.join("|"))
        } else {
            path.to_string()
        };
        let props = Props { key, title, kind, rows, close: self.say("props.close"), icon: self.icon_of(path) };
        self.ui.props(props.clone());
        Some(props)
    }

    // ── 박스 메뉴 ───────────────────────────────────────────────────────

    // 휴지통처럼 끌어 넣을 수 없는 바탕화면 항목은 메뉴로 담는다.
    fn special_items(&self, id: &str) -> Vec<MenuItem> {
        let taken: std::collections::HashSet<String> = self.captured().into_iter().map(|i| i.path).collect();
        let left: Vec<_> = self.desk.shell_items().into_iter().filter(|i| !taken.contains(&i.path)).collect();
        if left.is_empty() {
            return vec![];
        }
        let items = left
            .into_iter()
            .map(|item| {
                let icon = match self.desk.file_icon(&item.path) {
                    Some(img) => MenuIcon::Pic(img.resize(16, 16, true)),
                    None => asset("gather"),
                };
                act(item.name.clone(), icon, Action::Special(id.to_string(), item))
            })
            .collect();
        vec![MenuItem::Sub { label: self.say("menu.special"), icon: asset("gather"), items }]
    }

    pub fn fence_menu(&self, id: &str, path: Option<&str>, paths: &[String]) -> Option<Vec<MenuItem>> {
        let fence = self.fence(id)?.clone();
        self.win(id)?;
        let lang = self.state.settings.lang.clone();
        let mut t = Vec::new();
        // 여러 개를 고른 채 그중 하나를 누르면 그 묶음이 복사·잘라내기·삭제의 대상이다.
        let group: Vec<String> = match path {
            Some(p) if paths.iter().any(|x| x == p) => paths.to_vec(),
            Some(p) => vec![p.to_string()],
            None => vec![],
        };
        let clipable = group.iter().any(|one| self.clip_target(id, one).is_some());
        let deletable = group.iter().any(|one| !is_shell_item(one));
        let can_paste = !self.clip.read().paths.is_empty();
        if let Some(p) = path {
            t.push(act(self.say("menu.open"), asset("open"), Action::Open(p.into())));
            if is_recycle(p) {
                // 비울 것이 없으면 누르지 못하게 한다. 개수를 모를 때(-1)는 열어 둔다.
                let left = self.desk.recycle_count();
                t.push(MenuItem::Action { label: self.say("menu.emptyBin"), icon: asset("remove"), enabled: left != 0, accel: String::new(), action: Action::EmptyBin(id.into()) });
            }
            t.push(MenuItem::Action { label: self.say("menu.copy"), icon: asset("copy"), enabled: clipable, accel: "Ctrl+C".into(), action: Action::Copy(id.into(), group.clone()) });
            t.push(MenuItem::Action { label: self.say("menu.cut"), icon: asset("cut"), enabled: clipable, accel: "Ctrl+X".into(), action: Action::Cut(id.into(), group.clone()) });
            t.push(MenuItem::Action { label: self.say("menu.paste"), icon: asset("paste"), enabled: can_paste, accel: "Ctrl+V".into(), action: Action::Paste(id.into()) });
            t.push(MenuItem::Separator);
            // 박스 폴더 안의 파일 이름을 바꾼다. 셸 항목은 바꿀 파일이 없다.
            t.push(MenuItem::Action { label: self.say("menu.rename"), icon: asset("rename"), enabled: !is_shell_item(p), accel: String::new(), action: Action::RenameItem(id.into(), p.into()) });
            t.push(act(self.say("menu.eject"), asset("eject"), Action::Eject(id.into(), p.into())));
            t.push(MenuItem::Action { label: self.say("menu.delete"), icon: asset("remove"), enabled: deletable, accel: String::new(), action: Action::Delete(id.into(), group.clone()) });
            t.push(act(self.say("menu.props"), asset("info"), Action::Props(id.into(), p.into(), group.clone())));
            t.push(MenuItem::Separator);
        } else {
            t.push(MenuItem::Action { label: self.say("menu.paste"), icon: asset("paste"), enabled: can_paste, accel: "Ctrl+V".into(), action: Action::Paste(id.into()) });
            t.push(MenuItem::Separator);
        }
        t.push(act(self.say("menu.renameBox"), asset("rename"), Action::RenameBox(id.into())));
        t.push(act(
            self.say(if fence.collapsed { "menu.expand" } else { "menu.collapse" }),
            asset(if fence.collapsed { "expand" } else { "collapse" }),
            Action::Collapse(id.into(), !fence.collapsed),
        ));
        // 이 박스만. 모든 박스에 걸려면 트레이 설정 메뉴나 설정 창의 폴더 탭에서 바꾼다.
        t.push(MenuItem::Check { label: self.say("settings.showHidden"), icon: asset("show"), checked: fence.show_hidden, action: Action::ShowHidden(id.into(), !fence.show_hidden) });
        t.push(act(self.say("menu.settings"), asset("settings"), Action::Settings(id.into())));
        t.push(MenuItem::Separator);
        t.push(MenuItem::Sub {
            label: self.say("menu.theme"),
            icon: theme_chip(&fence.theme),
            items: themes::themes()
                .iter()
                .map(|th| MenuItem::Radio { label: themes::label(&th.label, &lang).into(), icon: theme_chip(&th.id), checked: fence.theme == th.id, action: Action::Theme(id.into(), th.id.clone()) })
                .collect(),
        });
        t.push(MenuItem::Sub {
            label: self.say("menu.corner"),
            icon: corner_icon(fence.corner),
            items: themes::corners()
                .iter()
                .map(|c| MenuItem::Radio { label: themes::label(&c.label, &lang).into(), icon: corner_icon(c.radius), checked: fence.corner == c.radius, action: Action::Corner(id.into(), c.radius) })
                .collect(),
        });
        t.push(MenuItem::Sub {
            label: self.say("menu.opacity"),
            icon: opacity_icon(fence.opacity),
            items: themes::opacities()
                .iter()
                .map(|o| MenuItem::Radio {
                    label: format!("{}%", round(o * 100.0) as i64),
                    icon: opacity_icon(*o),
                    checked: (fence.opacity - o).abs() < 0.05,
                    action: Action::Opacity(id.into(), *o),
                })
                .collect(),
        });
        t.push(MenuItem::Separator);
        t.extend(self.special_items(id));
        t.push(act(self.say("menu.newBox"), asset("draw"), Action::NewBox));
        t.push(act(self.say("menu.remove"), asset("remove"), Action::Remove(id.into())));
        Some(t)
    }

    // ── 트레이 메뉴 (Electron 판 tray.js) ───────────────────────────────

    fn language_menu(&self) -> Vec<MenuItem> {
        i18n::LANGS
            .iter()
            .map(|(id, label)| MenuItem::Radio { label: label.to_string(), icon: flag(id), checked: self.state.settings.lang == *id, action: Action::Lang(id.to_string()) })
            .collect()
    }

    fn settings_menu(&self) -> Vec<MenuItem> {
        let s = &self.state.settings;
        let lang = s.lang.clone();
        vec![
            MenuItem::Sub { label: self.say("tray.language"), icon: flag(&s.lang), items: self.language_menu() },
            MenuItem::Separator,
            MenuItem::Check { label: self.say("tray.startup"), icon: asset("startup"), checked: s.open_at_login, action: Action::Startup(!s.open_at_login) },
            MenuItem::Separator,
            MenuItem::Sub {
                label: self.say("tray.newTheme"),
                icon: theme_chip(&s.theme),
                items: themes::themes()
                    .iter()
                    .map(|th| MenuItem::Radio { label: themes::label(&th.label, &lang).into(), icon: theme_chip(&th.id), checked: s.theme == th.id, action: Action::DefaultTheme(th.id.clone()) })
                    .collect(),
            },
            MenuItem::Sub {
                label: self.say("tray.newCorner"),
                icon: corner_icon(s.corner),
                items: themes::corners()
                    .iter()
                    .map(|c| MenuItem::Radio { label: themes::label(&c.label, &lang).into(), icon: corner_icon(c.radius), checked: s.corner == c.radius, action: Action::DefaultCorner(c.radius) })
                    .collect(),
            },
            MenuItem::Sub {
                label: self.say("tray.newOpacity"),
                icon: opacity_icon(s.opacity),
                items: themes::opacities()
                    .iter()
                    .map(|o| MenuItem::Radio {
                        label: format!("{}%", round(o * 100.0) as i64),
                        icon: opacity_icon(*o),
                        checked: (s.opacity - o).abs() < 0.05,
                        action: Action::DefaultOpacity(*o),
                    })
                    .collect(),
            },
            MenuItem::Sub {
                label: self.say("tray.openWith"),
                icon: asset("open"),
                items: vec![
                    MenuItem::Radio { label: self.say("tray.openDouble"), icon: asset("open"), checked: s.open_with != "single", action: Action::OpenWith("double".into()) },
                    MenuItem::Radio { label: self.say("tray.openSingle"), icon: asset("open"), checked: s.open_with == "single", action: Action::OpenWith("single".into()) },
                ],
            },
            MenuItem::Check { label: self.say("tray.shadow"), icon: asset("draw"), checked: s.shadow, action: Action::Shadow(!s.shadow) },
            // 모든 박스에 한꺼번에 건다.
            MenuItem::Check { label: self.say("tray.showHidden"), icon: asset("show"), checked: s.show_hidden, action: Action::ShowHiddenAll(!s.show_hidden) },
            MenuItem::Separator,
            // 박스는 그대로 두고 안의 파일만 바탕화면으로 돌려준다.
            act(self.say("tray.putBack"), asset("eject"), Action::ReturnAll),
            act(self.say("tray.boxRoot"), asset("folder"), Action::OpenBoxRoot),
            act(self.say("tray.folder"), asset("folder"), Action::OpenDataDir),
        ]
    }

    pub fn tray_menu(&self) -> Vec<MenuItem> {
        let hidden = self.state.hidden;
        vec![
            act(self.say("tray.draw"), asset("draw"), Action::Draw),
            act(self.say(if hidden { "tray.show" } else { "tray.hide" }), asset(if hidden { "show" } else { "hide" }), Action::ToggleHidden),
            MenuItem::Separator,
            // 자주 바꾸는 값이라 설정 안과 밖 모두에 둔다.
            MenuItem::Sub { label: self.say("tray.language"), icon: flag(&self.state.settings.lang), items: self.language_menu() },
            act(self.say("tray.settings"), asset("settings"), Action::Prefs),
            MenuItem::Sub { label: self.say("tray.quickSettings"), icon: asset("settings"), items: self.settings_menu() },
            MenuItem::Separator,
            act(self.say("tray.about"), asset("info"), Action::About),
            act(self.say("tray.quit"), asset("quit"), Action::Quit),
        ]
    }

    pub fn tray_tip(&self) -> String {
        self.say("tray.tip")
    }
}

pub struct Measured {
    pub meta: fs::Metadata,
    pub bytes: u64,
    pub files: u64,
    pub dirs: u64,
    pub folder: bool,
}

// 폴더 하나를 따라 내려가 크기와 개수를 잰다. 심볼릭 링크는 따라가지 않는다.
fn walk(root: &str, budget: &mut Budget) -> (u64, u64, u64) {
    let (mut bytes, mut files, mut dirs) = (0u64, 0u64, 0u64);
    let mut stack = vec![std::path::PathBuf::from(root)];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            // 한도는 항목 하나마다 본다.
            if budget.entries <= 0 || Instant::now() > budget.until {
                budget.capped = true;
                return (bytes, files, dirs);
            }
            budget.entries -= 1;
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_symlink() {
                files += 1;
                continue;
            }
            if kind.is_dir() {
                dirs += 1;
                stack.push(entry.path());
                continue;
            }
            files += 1;
            bytes += fs::metadata(entry.path()).map(|m| m.len()).unwrap_or(0);
        }
    }
    (bytes, files, dirs)
}

// 파일 하나든 폴더 하나든 크기와 안의 개수를 같은 모양으로 돌려준다.
pub fn measure(path: &str, budget: &mut Budget) -> Option<Measured> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_dir() {
        let bytes = meta.len();
        return Some(Measured { meta, bytes, files: 1, dirs: 0, folder: false });
    }
    let (bytes, files, dirs) = walk(path, budget);
    Some(Measured { meta, bytes, files, dirs, folder: true })
}

#[allow(dead_code)]
fn unused(_: Point, _: &Path, _: Value) -> f64 {
    js_number(&Value::Null)
}
