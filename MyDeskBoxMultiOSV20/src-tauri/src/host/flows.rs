// 사람의 답을 기다리는 일. 묻는 창·메뉴·끌어 넘기기가 떠 있는 동안에는 자물쇠를 풀어 둔다.
// 자바스크립트 판의 await 자리마다 여기서 lock 을 놓고 다시 잡는다.

use std::path::Path;

use super::{lock, same_path, Host, Incoming, Shared};
use crate::clipfiles;
use crate::desktop::is_shell_item;
use crate::geom::Point;
use crate::pathx::{basename, dirname, join, resolve};
use crate::store::Item;
use crate::ui::{Action, Ask};

impl Host {
    pub(crate) fn ask(&self, title: String, detail: String, confirm: String, cancel: String, icon: &str, danger: bool) -> Ask {
        Ask { title, detail, confirm, cancel, danger, lone: false, icon: icon.into() }
    }

    // 같은 이름이 이미 있다. 대체할지 묻는다.
    pub(crate) fn ask_replace(&self, id: &str, name: &str) -> Ask {
        let title = self.fence(id).map(|f| f.title.clone()).filter(|t| !t.is_empty()).unwrap_or_else(|| self.say("box.untitled"));
        self.ask(
            self.sayv("dialog.replace", &[("name", name.to_string()), ("title", title)]),
            self.say("dialog.replaceDetail"),
            self.say("dialog.replaceGo"),
            self.say("dialog.cancel"),
            "menu/remove.png",
            true,
        )
    }
}

// 복사해서 새로 만들 때만 묻는다. 대체하겠다면 박스에 있던 것을 휴지통으로 보내 자리를 비운다.
async fn clear_clash(sh: &Shared, id: &str, path: &str) -> bool {
    let (older, ask, ui) = {
        let h = lock(sh);
        let Some(fence) = h.fence(id) else { return false };
        let older = h.hold.clash(fence, path);
        if older.is_empty() {
            return true;
        }
        (older, h.ask_replace(id, &basename(path)), h.ui.clone())
    };
    if !ui.confirm(ask).await {
        return false;
    }
    let mut h = lock(sh);
    // 지우지 못했으면 담지 않는다. 번호를 붙여 몰래 늘리지 않는다.
    if !h.throw_away(&older) {
        return false;
    }
    h.take_out(&older);
    h.watch_bin();
    true
}

// 클립보드의 파일을 이 박스에 붙인다. 잘라내기는 옮긴 뒤 클립보드를 비운다.
pub async fn paste_files(sh: &Shared, id: &str) -> bool {
    let clip = lock(sh).clip.read();
    if clip.paths.is_empty() || lock(sh).fence(id).is_none() {
        return false;
    }
    if clip.cut {
        let mut h = lock(sh);
        let entries: Vec<Incoming> = clip.paths.iter().map(|p| Incoming::path(p.clone())).collect();
        let taken = h.drop_files(id, &entries, None, None);
        let left: Vec<String> = clip.paths.iter().filter(|p| !taken.contains(p)).cloned().collect();
        if left.is_empty() {
            h.clip.clear();
        } else if left.len() != clip.paths.len() {
            h.clip.write(&left, clipfiles::MOVE);
        }
        return !taken.is_empty();
    }
    let mut incoming = Vec::new();
    for path in &clip.paths {
        let Some(item) = lock(sh).remembered(path) else { continue };
        if !clear_clash(sh, id, &item.path).await {
            continue;
        }
        let mut h = lock(sh);
        let Some(at) = h.fence_index(id) else { return false };
        if let Some(copied) = h.copy_into(at, &item) {
            incoming.push(copied);
        }
    }
    if incoming.is_empty() {
        return false;
    }
    let mut h = lock(sh);
    let Some(f) = h.fence_mut(id) else { return false };
    f.items.extend(incoming);
    h.persist();
    h.push_all();
    h.refresh_icons();
    true
}

// 박스에 담긴 항목의 이름을 바꾼다. 박스 폴더 안의 파일 이름이 실제로 바뀐다.
pub async fn rename_item(sh: &Shared, id: &str, path: &str, text: &str) {
    let (item, base, dest) = {
        let mut h = lock(sh);
        let Some(item) = h.fence(id).and_then(|f| f.items.iter().find(|i| i.path == path).cloned()) else { return };
        if is_shell_item(&item.path) {
            return;
        }
        let base = h.wanted_name(&item, text);
        if base.is_empty() || base == basename(&item.path) {
            return;
        }
        let dest = join(&dirname(&item.path), &base);
        (item, base, dest)
    };
    // 대소문자만 바꾼 것은 그 파일 자신이라 물을 것이 없다.
    if !same_path(&dest, &item.path) && Path::new(&dest).exists() {
        let (ask, ui) = {
            let h = lock(sh);
            (h.ask_replace(id, &base), h.ui.clone())
        };
        if !ui.confirm(ask).await {
            return;
        }
        let mut h = lock(sh);
        if !h.throw_away(&dest) {
            return;
        }
        h.take_out(&dest);
        h.watch_bin();
    }
    let mut h = lock(sh);
    let Some(current) = h.fence(id).and_then(|f| f.items.iter().find(|i| i.path == path).cloned()) else { return };
    let Some(moved) = h.hold.relabel(&current, &base) else { return };
    // 적어 둔 이름표는 경로를 열쇠로 삼는다. 바뀐 경로는 다시 물어본다.
    h.labels.remove(&current.path);
    if let Some(f) = h.fence_mut(id) {
        if let Some(it) = f.items.iter_mut().find(|i| i.path == path) {
            it.name = moved.name.clone();
            it.path = moved.path.clone();
            if !moved.home.is_empty() {
                it.home = Some(moved.home.clone());
            }
        }
    }
    h.persist();
    h.push(id);
    h.refresh_folders(&[dirname(&item.path)]);
}

// 지우기 전에 묻는다. 휴지통으로 보내는 길은 확인 창을 띄우지 않으므로 여기서 묻는다.
async fn ask_delete(sh: &Shared, list: &[Item]) -> bool {
    if list.is_empty() {
        return false;
    }
    let (ask, ui) = {
        let mut h = lock(sh);
        let title = if list.len() == 1 {
            let name = if list[0].name.is_empty() { basename(&list[0].path) } else { list[0].name.clone() };
            h.sayv("dialog.trash", &[("name", name)])
        } else {
            h.sayv("dialog.trashMany", &[("n", list.len().to_string())])
        };
        h.asking = true;
        (h.ask(title, h.say("dialog.trashDetail"), h.say("dialog.delete"), h.say("dialog.cancel"), "menu/remove.png", true), h.ui.clone())
    };
    let yes = ui.confirm(ask).await;
    lock(sh).asking = false;
    yes
}

// 박스 안에서 바로 지운다. 파일은 휴지통으로 간다. 지우기 전에 한 번 묻는다.
pub async fn trash_items(sh: &Shared, id: &str, paths: &[String]) -> bool {
    let list: Vec<Item> = {
        let h = lock(sh);
        let Some(fence) = h.fence(id) else { return false };
        paths.iter().filter_map(|p| fence.items.iter().find(|i| &i.path == p)).filter(|i| !is_shell_item(&i.path)).cloned().collect()
    };
    if list.is_empty() || !ask_delete(sh, &list).await {
        return false;
    }
    let mut h = lock(sh);
    let mut changed = false;
    for item in &list {
        if !h.throw_away(&item.path) {
            // 지우지 못한 것은 박스에 그대로 둔다.
            continue;
        }
        if let Some(f) = h.fence_mut(id) {
            f.items.retain(|i| i.path != item.path);
        }
        changed = true;
    }
    if !changed {
        return false;
    }
    h.persist();
    h.push(id);
    h.watch_bin();
    true
}

pub async fn remove_fence(sh: &Shared, id: &str) {
    let (ask, ui) = {
        let h = lock(sh);
        let Some(fence) = h.fence(id) else { return };
        (
            h.ask(
                h.sayv("dialog.remove", &[("title", fence.title.clone())]),
                h.say("dialog.removeDetail"),
                h.say("dialog.delete"),
                h.say("dialog.cancel"),
                "menu/remove.png",
                true,
            ),
            h.ui.clone(),
        )
    };
    if !ui.confirm(ask).await {
        return;
    }
    let mut h = lock(sh);
    let Some(at) = h.fence_index(id) else { return };
    // 박스를 지우면 담고 있던 파일을 모두 담기 전 폴더로 돌려준다.
    h.empty_box(at);
    h.state.fences.retain(|f| f.id != id);
    h.persist();
    h.close_settings(id);
    if let Some(label) = h.win(id).map(|w| w.label.clone()) {
        h.ui.close(&label);
        h.wins.retain(|(k, _)| k != id);
    }
    h.refresh_icons();
}

// 바탕화면에서 사각형을 끌었을 때. 곧바로 만들지 않고 물어본다.
pub async fn offer_fence(sh: &Shared, x: f64, y: f64, w: f64, h: f64) -> Option<String> {
    if w < 120.0 || h < 90.0 {
        return None;
    }
    let (ask, ui) = {
        let mut host = lock(sh);
        if host.asking {
            return None;
        }
        host.asking = true;
        (
            host.ask(host.say("dialog.create"), host.say("dialog.createDetail"), host.say("dialog.make"), host.say("dialog.cancel"), "menu/draw.png", false),
            host.ui.clone(),
        )
    };
    let yes = ui.confirm(ask).await;
    let mut host = lock(sh);
    host.asking = false;
    if !yes {
        return None;
    }
    host.set_hidden(false);
    Some(host.create_fence(super::moves::NewRect { x, y, w, h }))
}

impl Host {
    // 미뤄 둔 물음을 하나씩 푼다. 다른 물음이 떠 있으면 다음 기회에 다시 온다.
    pub(crate) fn drain_fresh(&mut self) {
        if self.draining || self.asking || self.closing || self.fresh_queue.is_empty() {
            return;
        }
        let Some(shared) = self.shared() else { return };
        self.draining = true;
        self.ui.spawn(Box::pin(async move {
            loop {
                let next = {
                    let mut h = lock(&shared);
                    if h.closing {
                        None
                    } else {
                        h.fresh_queue.pop_front()
                    }
                };
                let Some(path) = next else { break };
                offer_replace(&shared, &path).await;
            }
            lock(&shared).draining = false;
        }));
    }
}

// 새로 만든 것 하나. 대체할지 그대로 둘지 묻고, 대체하겠다면 박스로 옮긴다.
pub async fn offer_replace(sh: &Shared, path: &str) -> bool {
    let name = basename(path);
    let (ask, ui) = {
        let mut h = lock(sh);
        let Some((fence_id, item)) = h.holder_of(&name) else { return false };
        if !Path::new(path).exists() {
            return false;
        }
        // 박스가 들고 있다고 적혀 있어도 그 파일이 없으면 부딪힐 것이 없다.
        if !Path::new(&item.path).exists() {
            return false;
        }
        h.asking = true;
        let title = h.fence(&fence_id).map(|f| f.title.clone()).filter(|t| !t.is_empty()).unwrap_or_else(|| h.say("box.untitled"));
        (
            h.ask(
                h.sayv("dialog.fresh", &[("name", name.clone())]),
                h.sayv("dialog.freshDetail", &[("title", title)]),
                h.say("dialog.freshGo"),
                h.say("dialog.freshKeep"),
                "menu/remove.png",
                true,
            ),
            h.ui.clone(),
        )
    };
    let yes = ui.confirm(ask).await;
    let mut h = lock(sh);
    h.asking = false;
    if !yes {
        return false;
    }
    let Some((fence_id, older)) = h.holder_of(&name) else { return false };
    h.replace_held(&fence_id, &older, path)
}

impl Host {
    // 박스에 있던 것을 새로 만든 것으로 바꾼다. 있던 것은 휴지통으로 간다.
    pub(crate) fn replace_held(&mut self, id: &str, older: &Item, path: &str) -> bool {
        let at = self.fence(id).and_then(|f| f.items.iter().position(|i| i.path == older.path));
        // 묻는 동안 새로 만든 것이 없어졌으면 박스에 있던 것도 그대로 둔다.
        if !Path::new(path).exists() {
            return false;
        }
        if !self.throw_away(&older.path) {
            return false;
        }
        self.take_out(&older.path);
        self.watch_bin();
        let len = self.fence(id).map(|f| f.items.len()).unwrap_or(0);
        self.drop_files(id, &[Incoming::path(path)], Some(at.unwrap_or(len)), None);
        true
    }
}

// 파일이나 바로가기를 다른 프로그램에 넘긴다. 손을 뗄 때까지 기다린 뒤, 그 파일이 어디로 갔는지 본다.
pub async fn drag_out(sh: &Shared, owner_label: &str, paths: &[String]) -> bool {
    let (list, ui, icon, desk_dir, before) = {
        let mut h = lock(sh);
        let mut list: Vec<String> = Vec::new();
        for p in paths {
            if Host::can_drag_out(p) && !list.contains(p) {
                list.push(p.clone());
            }
        }
        if list.is_empty() {
            return false;
        }
        h.hide_ghost();
        h.clear_hover();
        let (desk_dir, before) = h.desk_snapshot();
        let icon = h.drag_icon_for(&list[0]);
        (list, h.ui.clone(), icon, desk_dir, before)
    };
    let files: Vec<String> = list.iter().map(|p| resolve(p)).collect();
    if !ui.drag_out(owner_label, files, Some(icon)).await {
        return false;
    }
    let mut h = lock(sh);
    for path in &list {
        h.after_drag_out(path, &desk_dir, &before);
    }
    true
}

// 지울지 묻는 창과 지우는 동안의 진행률은 시스템이 그대로 보여 준다.
pub async fn empty_bin(sh: &Shared, id: &str) {
    let (desk, owner, ui) = {
        let h = lock(sh);
        (h.desk.clone(), h.handle_of(id), h.ui.clone())
    };
    let emptied = ui.blocking(Box::new(move || desk.empty_recycle(owner))).await;
    if emptied {
        lock(sh).push_all();
    }
}

pub async fn show_menu(sh: &Shared, id: &str, path: Option<&str>, paths: &[String]) {
    let (items, label, ui) = {
        let h = lock(sh);
        let Some(items) = h.fence_menu(id, path, paths) else { return };
        let Some(label) = h.win(id).map(|w| w.label.clone()) else { return };
        (items, label, h.ui.clone())
    };
    if let Some(action) = ui.menu(&label, items).await {
        run_action(sh, action).await;
    }
}

pub async fn about(sh: &Shared) {
    let (ask, ui) = {
        let h = lock(sh);
        let lines = [
            format!("{} {}", h.say("about.version"), h.ui.app_version()),
            format!("{} {}", h.say("about.made"), super::AUTHOR_NAME),
            format!("{} {}", h.say("about.mail"), super::AUTHOR_EMAIL),
        ];
        let ask = Ask {
            title: h.ui.app_name(),
            detail: lines.join("\n"),
            confirm: h.say("settings.ok"),
            cancel: String::new(),
            danger: false,
            lone: true,
            icon: "icon.png".into(),
        };
        (ask, h.ui.clone())
    };
    ui.confirm(ask).await;
}

// 메뉴에서 고른 일을 한다. 박스 메뉴와 트레이 메뉴가 함께 쓴다.
pub async fn run_action(sh: &Shared, action: Action) {
    match action {
        Action::Open(path) => lock(sh).open_item(&path),
        Action::EmptyBin(id) => empty_bin(sh, &id).await,
        Action::Copy(id, group) => {
            lock(sh).copy_item(&id, &group);
        }
        Action::Cut(id, group) => {
            lock(sh).cut_item(&id, &group);
        }
        Action::Paste(id) => {
            paste_files(sh, &id).await;
        }
        Action::RenameItem(id, path) => {
            let h = lock(sh);
            if let Some(w) = h.win(&id) {
                h.ui.send(&w.label, "fence:rename-item", serde_json::json!(path));
            }
        }
        Action::Eject(id, path) => lock(sh).eject(&id, &path, None),
        Action::Delete(id, group) => {
            trash_items(sh, &id, &group).await;
        }
        Action::Props(id, path, group) => {
            lock(sh).show_props(&id, &path, &group, None);
        }
        Action::RenameBox(id) => {
            let h = lock(sh);
            if let Some(w) = h.win(&id) {
                h.ui.send(&w.label, "fence:rename", serde_json::Value::Null);
            }
        }
        Action::Collapse(id, on) => lock(sh).set_collapsed(&id, on),
        Action::ShowHidden(id, on) => lock(sh).set_show_hidden(&id, on),
        Action::Settings(id) => lock(sh).open_settings(&id),
        Action::Theme(id, theme) => lock(sh).restyle(&id, &serde_json::json!({ "theme": theme })),
        Action::Corner(id, r) => lock(sh).restyle(&id, &serde_json::json!({ "corner": r })),
        Action::Opacity(id, v) => lock(sh).restyle(&id, &serde_json::json!({ "opacity": v })),
        Action::Special(id, entry) => {
            lock(sh).drop_files(&id, &[Incoming::named(entry.name, entry.path)], None, None);
        }
        Action::NewBox | Action::Draw => lock(sh).begin_draw(),
        Action::Remove(id) => remove_fence(sh, &id).await,
        Action::ToggleHidden => lock(sh).toggle_hidden(),
        Action::Lang(lang) => lock(sh).set_lang(&lang),
        Action::Prefs => lock(sh).open_prefs(),
        Action::Startup(on) => lock(sh).set_login(on),
        Action::DefaultTheme(t) => lock(sh).set_default_theme(&t),
        Action::DefaultCorner(c) => lock(sh).set_default_corner(c),
        Action::DefaultOpacity(o) => lock(sh).set_default_opacity(o),
        Action::OpenWith(k) => lock(sh).set_open_with(&k),
        Action::Shadow(on) => lock(sh).set_shadow(on),
        Action::ShowHiddenAll(on) => lock(sh).set_show_hidden_all(on),
        Action::ReturnAll => {
            lock(sh).return_all();
        }
        Action::OpenBoxRoot => {
            let mut h = lock(sh);
            let dir = h.box_root();
            h.ui.open_path(&dir);
        }
        Action::OpenDataDir => {
            let h = lock(sh);
            h.ui.open_path(&h.ui.user_dir());
        }
        Action::About => about(sh).await,
        Action::Quit => {
            let ui = lock(sh).ui.clone();
            ui.quit();
        }
    }
}

#[allow(dead_code)]
fn unused(_: Point) {}
