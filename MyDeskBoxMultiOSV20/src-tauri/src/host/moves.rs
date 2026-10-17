// 박스 자리 맞추기, 담기·꺼내기·옮기기, 바탕화면과 맞추기 (Electron 판 fences.js 의 가운데 부분).

use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

use super::{is_directory, names_in, same_path, shadow_pad, Host, Incoming};
use crate::deskgrid::{self, What, BOTH};
use crate::desktop::is_shell_item;
use crate::geom::{self, is_recycle, panel_height, Point, Rect, CELL_H, CELL_W, PAD, TITLE_H};
use crate::hold;
use crate::js::{now_ms, round};
use crate::pathx::{self, basename, dirname, join, resolve};
use crate::store::{normalize_fence, Fence, Item};
use crate::ui::Ask;

pub struct NewRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

const NUDGE_GAP: f64 = 40.0;
pub(crate) const ORPHAN_GRACE_MS: f64 = 60_000.0;

// 프로그램 파일을 가리키는가. 문서나 폴더를 가리키는 바로가기는 지우지 않는다.
fn names_program(target: &str) -> bool {
    target.to_lowercase().ends_with(".exe")
}

// 빠진 USB 나 끊긴 네트워크의 프로그램은 지운 것이 아니다. 드라이브가 보일 때만 따진다.
fn on_reachable_drive(target: &str) -> bool {
    if target.starts_with("\\\\") || target.starts_with("//") {
        return false;
    }
    let path = Path::new(target);
    path.is_absolute() && path.ancestors().last().map(|root| root.exists()).unwrap_or(false)
}

impl Host {
    // ── 박스 자리 ───────────────────────────────────────────────────────

    pub fn create_fence(&mut self, rect: NewRect) -> String {
        let n = self.state.fences.len() + 1;
        let id = format!("{}-{}", crate::js::base36(now_ms() as u64), self.random5());
        let title = if n == 1 { self.say("box.first") } else { self.sayv("box.nth", &[("n", n.to_string())]) };
        let s = &self.state.settings;
        let fence = normalize_fence(&json!({
            "id": id,
            "title": title,
            "x": rect.x,
            "y": rect.y,
            "w": rect.w.max(220.0),
            "h": rect.h.max(180.0),
            "theme": s.theme,
            "opacity": s.opacity,
            "corner": s.corner,
            "showHidden": s.show_hidden,
        }));
        self.state.fences.push(fence);
        // 새 박스도 바탕화면 아이콘과 같은 줄에 서고, 다른 박스를 덮지 않는다.
        self.snap_to_grid(&id, BOTH);
        self.keep_apart(&id, None);
        self.clamp_to_screen(&id);
        self.persist();
        self.open_fence(&id);
        if !self.state.hidden {
            self.show_fence(&id);
        }
        // 새 박스가 깔고 앉은 바탕화면 아이콘을 바로 밀어낸다.
        self.refresh_icons();
        id
    }

    // 이 박스가 놓인 화면의 작업 영역.
    pub(crate) fn area_for(&self, id: &str) -> Option<Rect> {
        let f = self.fence(id)?;
        let found = self.ui.display_nearest(Point::new(round(f.x), round(f.y)))?.work_area;
        (found.width != 0.0).then_some(found)
    }

    pub(crate) fn snap_to_grid(&mut self, id: &str, what: What) -> bool {
        let Some(grid) = self.desk.grid_info() else { return false };
        if grid.dx == 0.0 || grid.dy == 0.0 {
            return false;
        }
        let area = self.area_for(id);
        let Some(f) = self.fence_mut(id) else { return false };
        let snapped = deskgrid::snap_rect(
            Rect::new(f.x, f.y, f.w, panel_height(f.collapsed, f.h)),
            &deskgrid::Lattice { x0: grid.x0, y0: grid.y0, dx: grid.dx, dy: grid.dy },
            CELL_W + PAD * 2.0,
            TITLE_H + CELL_H,
            area,
            what,
        );
        f.x = round(snapped.x);
        f.y = round(snapped.y);
        f.w = round(snapped.width);
        // 접은 박스는 제목 줄이 전부다. 높이는 접기가 정한다.
        if !f.collapsed {
            f.h = round(snapped.height);
        }
        true
    }

    // 이 박스 말고 지금 놓여 있는 박스들의 자리.
    pub(crate) fn other_rects(&self, id: &str) -> Vec<Rect> {
        self.state
            .fences
            .iter()
            .filter(|f| f.id != id)
            .map(|f| Rect::new(f.x, f.y, f.w, panel_height(f.collapsed, f.h)))
            .collect()
    }

    // 크기만 바꾸다 옆 박스에 닿았다. 자리를 옮기는 대신 닿은 데서 멈춘다.
    fn trim_to_fit(&mut self, id: &str, others: &[Rect]) -> bool {
        let Some(f) = self.fence_mut(id) else { return false };
        let mut width = f.w;
        let mut height = panel_height(f.collapsed, f.h);
        let mut cut = false;
        for other in others {
            if !deskgrid::overlaps(&Rect::new(f.x, f.y, width, height), other) {
                continue;
            }
            let to_right = other.x - f.x;
            let to_bottom = other.y - f.y;
            if to_right >= 180.0 && to_right < width {
                width = to_right;
                cut = true;
                continue;
            }
            if to_bottom >= 160.0 && to_bottom < height {
                height = to_bottom;
                cut = true;
                continue;
            }
            // 줄여서는 비킬 수 없는 자리다. 그때는 옆으로 비킨다.
            return false;
        }
        if !cut {
            return true;
        }
        f.w = round(width);
        if !f.collapsed {
            f.h = round(height);
        }
        true
    }

    // 끌고 가다 다른 박스에 닿으면 거기서 멈춘다.
    fn slide_along(&mut self, id: &str, from: Rect) -> bool {
        let others = self.other_rects(id);
        if others.is_empty() {
            return false;
        }
        let Some(f) = self.fence_mut(id) else { return false };
        let moved = deskgrid::slide_to(from, Rect::new(f.x, f.y, f.w, panel_height(f.collapsed, f.h)), &others);
        if moved.x == f.x && moved.y == f.y {
            return false;
        }
        f.x = round(moved.x);
        f.y = round(moved.y);
        true
    }

    fn overlaps_others(&self, id: &str) -> bool {
        let Some(f) = self.fence(id) else { return false };
        let rect = Rect::new(f.x, f.y, f.w, panel_height(f.collapsed, f.h));
        self.other_rects(id).iter().any(|o| deskgrid::overlaps(&rect, o))
    }

    // 박스끼리는 겹치지 않는다. 겹쳤으면 가장 적게 움직이는 쪽으로 비킨다.
    pub(crate) fn keep_apart(&mut self, id: &str, what: Option<What>) -> bool {
        let others = self.other_rects(id);
        if others.is_empty() {
            return false;
        }
        if let Some(w) = what {
            if !w.place && self.trim_to_fit(id, &others) {
                return true;
            }
        }
        let area = self.area_for(id);
        let Some(f) = self.fence_mut(id) else { return false };
        let moved = deskgrid::push_out(Rect::new(f.x, f.y, f.w, panel_height(f.collapsed, f.h)), &others, area);
        if moved.x == f.x && moved.y == f.y {
            return false;
        }
        f.x = moved.x;
        f.y = moved.y;
        true
    }

    // 박스는 화면 밖으로 나가지 않는다. 가장 가까운 화면의 작업 영역 안으로 들인다.
    pub(crate) fn clamp_to_screen(&mut self, id: &str) {
        let pad = shadow_pad(self.state.settings.shadow);
        let Some(f) = self.fence(id) else { return };
        let Some(display) = self.ui.display_nearest(Point::new(round(f.x), round(f.y))) else { return };
        let area = display.work_area;
        if area.width == 0.0 || area.height == 0.0 {
            return;
        }
        let Some(f) = self.fence_mut(id) else { return };
        let left = area.x + pad;
        let top = area.y + pad;
        let width = (area.width - pad * 2.0).max(180.0);
        let height = (area.height - pad * 2.0).max(160.0);
        f.w = f.w.min(width);
        if !f.collapsed {
            f.h = f.h.min(height);
        }
        let tall = panel_height(f.collapsed, f.h);
        f.x = f.x.max(left).min(left + width - f.w);
        f.y = f.y.max(top).min(top + (height - tall).max(0.0));
    }

    pub fn apply_bounds(&mut self, id: &str, x: f64, y: f64, w: f64, h: f64, save: bool) {
        if self.win(id).is_none() {
            return;
        }
        let Some(f) = self.fence(id).cloned() else { return };
        let last = self.settled.get(id).copied().unwrap_or((f.x, f.y, f.w, f.h));
        // 끌기 전 자리. 여기서 어디까지 갈 수 있는지 잰다.
        let from = Rect::new(f.x, f.y, f.w, panel_height(f.collapsed, f.h));
        let (was_w, was_h) = (f.w, f.h);
        {
            let f = self.fence_mut(id).unwrap();
            f.x = x;
            f.y = y;
            if !f.collapsed {
                f.w = w.max(180.0);
                f.h = h.max(160.0);
            }
        }
        // 다른 박스에 닿으면 거기서 멈춘다. 보이는 자리가 곧 놓일 자리가 된다.
        self.slide_along(id, from);
        if save {
            let f = self.fence(id).unwrap().clone();
            // 크기만 바꾼 것이면 자리는 손대지 않는다.
            let what = What { place: f.x != last.0 || f.y != last.1, size: f.w != last.2 || f.h != last.3 };
            let before = (f.x, f.y, f.w, f.h);
            self.snap_to_grid(id, what);
            // 줄을 맞추다 남의 자리를 덮으면 맞추지 않은 자리가 낫다.
            if self.overlaps_others(id) {
                let f = self.fence_mut(id).unwrap();
                (f.x, f.y, f.w, f.h) = before;
            }
            self.keep_apart(id, Some(what));
        }
        self.clamp_to_screen(id);
        let f = self.fence(id).unwrap().clone();
        let rect = geom::window_rect(f.x, f.y, f.w, f.collapsed, f.h, self.state.settings.shadow);
        self.set_bounds(id, rect);
        let label = self.win(id).map(|w| w.label.clone()).unwrap_or_default();
        if save {
            self.settled.insert(id.to_string(), (f.x, f.y, f.w, f.h));
            self.persist();
            self.ui.send(&label, "fence:resize", Value::Null);
            self.refresh_icons();
            return;
        }
        // 자리만 옮긴 것이면 안의 칸은 그대로다. 옮기는 동안 다시 그리지 않아야 따라온다.
        if f.w != was_w || f.h != was_h {
            self.ui.send(&label, "fence:resize", Value::Null);
        }
        // 끄는 동안에도 새로 가린 바탕화면 아이콘을 밀어낸다.
        self.nudge_soon();
    }

    // 박스를 끄는 동안에도 그 자리의 바탕화면 아이콘이 옆으로 비킨다. 한 칸마다 부르면 무거우니 사이를 둔다.
    pub(crate) fn nudge_soon(&mut self) {
        if self.state.hidden || self.closing {
            return;
        }
        let left = NUDGE_GAP - (now_ms() - self.nudged_at);
        if left > 0.0 {
            if self.nudge_timer {
                return;
            }
            self.nudge_timer = true;
            if let Some(shared) = self.shared() {
                self.ui.later(left.ceil() as u64, Box::pin(async move {
                    let mut h = super::lock(&shared);
                    h.nudge_timer = false;
                    h.nudge_soon();
                }));
            }
            return;
        }
        self.nudged_at = now_ms();
        // 끄는 중에는 가벼운 길로 간다. 목록을 다시 읽지 않고 자리만 던져 둔다.
        let blocks = self.block_rects();
        self.desk.nudge(&blocks, true);
    }

    pub fn set_collapsed(&mut self, id: &str, collapsed: bool) {
        let Some(f) = self.fence_mut(id) else { return };
        f.collapsed = collapsed;
        let (x, y, w, h) = (f.x, f.y, f.w, f.h);
        self.persist();
        self.apply_bounds(id, x, y, w, h, true);
        self.push(id);
    }

    pub fn set_scroll(&mut self, id: &str, top: f64) {
        self.scroll_tops.insert(id.to_string(), if top.is_finite() { top.max(0.0) } else { 0.0 });
    }

    pub(crate) fn index_at(&self, id: &str, sx: f64, sy: f64, skip: &[String]) -> Option<usize> {
        let fence = self.fence(id)?;
        let Some(bounds) = self.bounds_of(id) else { return Some(fence.items.len()) };
        let grid = geom::grid_of(bounds.width, bounds.height, fence.collapsed);
        let without: Vec<Item> = self.shown_items(fence, None).into_iter().filter(|i| !skip.contains(&i.path)).collect();
        // 박스 안이 스크롤돼 있으면 커서 아래 칸은 그만큼 내려가 있다.
        let local_y = sy - bounds.y + self.scroll_tops.get(id).copied().unwrap_or(0.0);
        let index = geom::insert_index(sx - bounds.x, local_y, &grid, without.len());
        self.slot_for(id, Some(index), skip)
    }

    // 고른 여러 개를 그 자리로 한데 옮긴다.
    pub(crate) fn reorder_many(&mut self, id: &str, paths: &[String], index: Option<usize>) {
        let Some(f) = self.fence_mut(id) else { return };
        let mut held = Vec::new();
        for path in paths {
            if let Some(at) = f.items.iter().position(|i| &i.path == path) {
                held.push(f.items.remove(at));
            }
        }
        if held.is_empty() {
            return;
        }
        let at = index.unwrap_or(f.items.len()).min(f.items.len());
        f.items.splice(at..at, held);
        self.persist();
        self.push(id);
    }

    // ── 담기 ────────────────────────────────────────────────────────────

    // 파일 경로만 오기도 하고, 이름이 함께 오기도 한다(휴지통 같은 셸 항목).
    pub(crate) fn to_item(&self, entry: &Incoming) -> Option<Item> {
        if entry.path.is_empty() {
            return None;
        }
        if let Some(name) = &entry.name {
            let name = if name.is_empty() { basename(&entry.path) } else { name.clone() };
            return Some(Item::new(name, entry.path.clone()));
        }
        if is_shell_item(&entry.path) || !Path::new(&entry.path).exists() {
            return None;
        }
        Some(Item::new(basename(&entry.path), entry.path.clone()))
    }

    // 바탕화면에서 끌어다 놓았다. 여러 개를 골라 끌었으면 그 모두가 함께 온다.
    pub fn accept_desktop_drop(&mut self, entries: Vec<Incoming>, dip: Point) {
        let list: Vec<Incoming> = entries.into_iter().filter(|e| !e.path.is_empty()).collect();
        if list.is_empty() {
            return;
        }
        let Some(target) = self.hit(dip.x, dip.y) else { return };
        // 그 박스가 이미 들고 있는 것은 옮길 것이 없다.
        let held: HashSet<String> = self.fence(&target).map(|f| f.items.iter().map(|i| i.path.clone()).collect()).unwrap_or_default();
        let coming: Vec<Incoming> = list.into_iter().filter(|e| !held.contains(&e.path)).collect();
        if coming.is_empty() {
            return;
        }
        let paths: Vec<String> = coming.iter().map(|e| e.path.clone()).collect();
        // 휴지통이면 버리고, 폴더면 그 안으로. 겨눈 자리는 커서 아래의 그림으로 고른다.
        let into = self.receiver_at(&target, dip.x, dip.y, &paths[0]);
        let index = self.index_at(&target, dip.x, dip.y, &paths);
        self.drop_files(&target, &coming, index, into.as_deref());
    }

    // 폴더를 그 폴더 안(또는 그 자신)으로 옮기면 운영체제가 거절한다.
    fn nested_in(parent: &str, child: &str) -> bool {
        pathx::within(parent, child)
    }

    fn move_into(&self, path: &str, dir: &str) -> bool {
        let dest = join(dir, &basename(path));
        if Self::nested_in(path, dir) || Self::nested_in(path, &dest) {
            return false;
        }
        if Path::new(&dest).exists() {
            return false;
        }
        match fs::rename(path, &dest) {
            Ok(_) => return true,
            Err(err) => {
                // 드라이브가 다르면 이름 바꾸기가 거절된다.
                let cross = if cfg!(windows) { err.raw_os_error() == Some(17) } else { err.raw_os_error() == Some(18) };
                if !cross {
                    return false;
                }
            }
        }
        if hold::copy_tree(Path::new(path), Path::new(&dest)).is_ok() && hold::remove_tree(Path::new(path)).is_ok() {
            return true;
        }
        let _ = hold::remove_tree(Path::new(&dest));
        false
    }

    // 아래 항목이 무엇이냐에 따라 갈린다. 'moved' 면 옮겼고, 빈 값이면 아무것도 하지 않았다.
    pub(crate) fn send_into(&self, path: &str, into: &str) -> &'static str {
        if path.is_empty() || into.is_empty() || path == into {
            return "";
        }
        if is_recycle(into) {
            // 같은 이름이 휴지통에 이미 있어도 버린다.
            return if self.throw_away(path) { "moved" } else { "failed" };
        }
        if is_directory(into) {
            return if self.move_into(path, into) { "moved" } else { "" };
        }
        if let Some(link) = self.shortcut_link(into) {
            if is_directory(&link.target) {
                return if self.move_into(path, &link.target) { "moved" } else { "" };
            }
        }
        // 폴더도 휴지통도 아니면 받아 줄 것이 없다. 부른 쪽이 그 박스로 옮겨 담는다.
        ""
    }

    // 담지 못한 파일을 알린다. 다른 프로그램이 그 파일을 쓰고 있다는 뜻이다.
    pub(crate) fn tell_busy(&self, paths: &[String]) {
        if paths.is_empty() {
            return;
        }
        let title = if paths.len() == 1 {
            self.sayv("dialog.busy", &[("name", basename(&paths[0]))])
        } else {
            self.sayv("dialog.busyMany", &[("n", paths.len().to_string())])
        };
        let ask = Ask {
            title,
            detail: self.say("dialog.busyDetail"),
            confirm: self.say("settings.ok"),
            cancel: String::new(),
            danger: false,
            lone: true,
            icon: "menu/remove.png".into(),
        };
        let answer = self.ui.confirm(ask);
        self.ui.spawn(Box::pin(async move {
            answer.await;
        }));
    }

    // 휴지통으로 보낸다. 같은 이름이 이미 있어도 묻지 않고, 각각 다른 항목으로 남긴다.
    pub(crate) fn throw_away(&self, path: &str) -> bool {
        if self.desk.discard_file(path) {
            return true;
        }
        self.ui.trash(path)
    }

    pub(crate) fn take_out(&mut self, path: &str) {
        for f in &mut self.state.fences {
            f.items.retain(|i| i.path != path);
        }
    }

    // 담는다. 받아 간 원래 자리를 돌려준다. 잘라 붙이기가 클립보드를 비울지 이것으로 정한다.
    pub fn drop_files(&mut self, id: &str, entries: &[Incoming], index: Option<usize>, into: Option<&str>) -> Vec<String> {
        let mut accepted = Vec::new();
        if let Some(into) = into.filter(|p| !p.is_empty()) {
            let mut changed = false;
            let mut handled = false;
            for entry in entries {
                let Some(item) = self.to_item(entry) else { continue };
                let done = self.send_into(&item.path, into);
                if done == "moved" {
                    self.take_out(&item.path);
                    accepted.push(item.path.clone());
                    changed = true;
                }
                if !done.is_empty() {
                    handled = true;
                }
            }
            if changed {
                self.persist();
                self.push_all();
                self.refresh_icons();
            }
            // 아래 항목이 받아 갔으면 박스에 새로 담을 것이 없다.
            if handled {
                return accepted;
            }
        }
        let Some(at) = self.fence_index(id) else { return accepted };
        let mut incoming: Vec<(Item, String)> = Vec::new();
        // 다른 프로그램이 붙잡고 있어 옮기지 못한 것. 다 해 본 뒤에 한 번만 알린다.
        let mut busy = Vec::new();
        for entry in entries {
            let Some(item) = self.to_item(entry) else { continue };
            // 휴지통 같은 셸 항목은 파일이 아니므로 목록에만 담는다.
            if is_shell_item(&item.path) {
                accepted.push(item.path.clone());
                incoming.push((item.clone(), item.path.clone()));
                continue;
            }
            // 옮기는 일은 대체가 아니다. 그래서 묻지 않는다.
            let (got, stuck) = self.bring_in(at, &item, false);
            if let Some(got) = got {
                accepted.push(item.path.clone());
                incoming.push((got, item.path.clone()));
            } else if stuck {
                busy.push(item.path.clone());
            }
        }
        if !busy.is_empty() {
            self.tell_busy(&busy);
        }
        if incoming.is_empty() {
            return accepted;
        }
        // 담기면서 자리가 바뀌므로 옮기기 전 자리로도 견준다.
        let gone: HashSet<String> = incoming.iter().flat_map(|(i, from)| [i.path.clone(), from.clone()]).filter(|p| !p.is_empty()).collect();
        for f in &mut self.state.fences {
            f.items.retain(|i| !gone.contains(&i.path));
        }
        let f = &mut self.state.fences[at];
        let pos = index.unwrap_or(f.items.len()).min(f.items.len());
        f.items.splice(pos..pos, incoming.into_iter().map(|(i, _)| i));
        self.persist();
        self.push_all();
        self.refresh_icons();
        accepted
    }

    // 창에서 놓은 자리로 담는다. 창이 주는 자리는 그려진 항목 기준이다.
    pub fn drop_at(&mut self, id: &str, paths: &[String], index: Option<usize>, into: Option<&str>) -> Vec<String> {
        let slot = self.slot_for(id, index, paths);
        let entries: Vec<Incoming> = paths.iter().map(|p| Incoming::path(p.clone())).collect();
        self.drop_files(id, &entries, slot.or(index), into)
    }

    // 복사해서 담는다. 원래 파일은 그 자리에 남는다.
    pub(crate) fn copy_into(&mut self, at: usize, item: &Item) -> Option<Item> {
        if item.path.is_empty() || is_shell_item(&item.path) {
            return None;
        }
        let from = item.path.clone();
        let meta = fs::metadata(&from).ok()?;
        if !meta.is_file() && !meta.is_dir() {
            return None;
        }
        let mut fence = self.state.fences[at].clone();
        let dir = self.hold.dir_for(&mut fence);
        self.state.fences[at].folder = fence.folder;
        if dir.is_empty() {
            return None;
        }
        let dest = hold::spare_name(&dir, &basename(&from));
        hold::copy_tree(Path::new(&from), Path::new(&dest)).ok()?;
        // 박스 안에서 온 복사는 그 박스 폴더를 집으로 적으면 안 된다.
        let home = match item.home.as_deref().filter(|h| !h.is_empty()) {
            Some(h) => h.to_string(),
            None if self.hold.inside(&from) => {
                let noted = self.hold.noted(&from);
                if noted.is_empty() {
                    self.desktop_folder()
                } else {
                    noted
                }
            }
            None => dirname(&from),
        };
        self.refresh_folders(&[dirname(&dest)]);
        Some(Item { name: basename(&dest), path: dest, home: Some(home) })
    }

    // 클립보드에 올릴 수 있는 항목. 휴지통 같은 셸 항목은 파일이 아니다.
    pub(crate) fn clip_target(&self, id: &str, path: &str) -> Option<Item> {
        let fence = self.fence(id)?;
        let item = fence.items.iter().find(|i| i.path == path)?;
        if is_shell_item(&item.path) || !Path::new(&item.path).exists() {
            return None;
        }
        Some(item.clone())
    }

    pub(crate) fn clip_paths(&self, id: &str, paths: &[String]) -> Vec<String> {
        paths.iter().filter_map(|p| self.clip_target(id, p)).map(|i| i.path).collect()
    }

    pub fn copy_item(&self, id: &str, paths: &[String]) -> bool {
        let list = self.clip_paths(id, paths);
        !list.is_empty() && self.clip.write(&list, crate::clipfiles::COPY)
    }

    pub fn cut_item(&self, id: &str, paths: &[String]) -> bool {
        let list = self.clip_paths(id, paths);
        !list.is_empty() && self.clip.write(&list, crate::clipfiles::MOVE)
    }

    // 박스에 적어 둔 항목이면 집(담기 전 폴더)을 함께 가져온다.
    pub(crate) fn remembered(&self, path: &str) -> Option<Item> {
        for f in &self.state.fences {
            if let Some(found) = f.items.iter().find(|i| same_path(&i.path, path)) {
                return Some(found.clone());
            }
        }
        self.to_item(&Incoming::path(path))
    }

    // 박스에 담긴 항목의 이름 (확장자를 감춘 이름일 수 있다).
    pub(crate) fn wanted_name(&mut self, item: &Item, text: &str) -> String {
        // Windows 는 끝의 점과 빈칸을 말없이 떼어 낸다. 우리가 먼저 떼어 둔다.
        let typed = text.trim().trim_end_matches(['.', ' ']).to_string();
        if typed.is_empty() || typed.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
            return String::new();
        }
        let ext = pathx::extname(&item.path);
        if ext.is_empty() {
            return typed;
        }
        let low = ext.to_lowercase();
        if typed.to_lowercase().ends_with(&low) {
            return typed;
        }
        if self.label_for(item).to_lowercase().ends_with(&low) {
            return typed;
        }
        format!("{typed}{ext}")
    }

    // ── 꺼내기 ──────────────────────────────────────────────────────────

    // 박스에서 꺼내면 파일이 담기 전 폴더(보통 바탕화면)로 돌아간다.
    // at 이 있으면 그 자리(끌어다 놓은 곳)에 아이콘을 둔다.
    pub fn eject(&mut self, id: &str, path: &str, at: Option<Point>) {
        let Some(fence) = self.fence(id) else { return };
        let Some(item) = fence.items.iter().find(|i| i.path == path).cloned() else { return };
        // 돌려보내지 못했으면 박스에 그대로 둔다.
        if !self.let_go(&item, at) {
            return;
        }
        if let Some(f) = self.fence_mut(id) {
            f.items.retain(|i| i.path != path);
        }
        self.persist();
        self.push(id);
        // 돌려놓은 자리가 다른 박스 밑이면 그 박스가 다시 밀어낸다.
        self.refresh_icons();
    }

    // 함께 옮길 경로. 고른 묶음이 있으면 그 묶음이고, 없으면 끌어 온 하나다.
    fn moving_paths(&self, from: &str, path: &str, paths: &[String]) -> Vec<String> {
        let wanted: Vec<String> = if paths.is_empty() { vec![path.to_string()] } else { paths.to_vec() };
        let wanted: Vec<String> = wanted.into_iter().filter(|p| !p.is_empty()).collect();
        let Some(fence) = self.fence(from) else { return wanted };
        let have: HashSet<&str> = fence.items.iter().map(|i| i.path.as_str()).collect();
        let found: Vec<String> = wanted.iter().filter(|p| have.contains(p.as_str())).cloned().collect();
        if found.is_empty() {
            [path.to_string()].into_iter().filter(|p| !p.is_empty()).collect()
        } else {
            found
        }
    }

    // 손을 뗐다. 같은 박스 안이면 차례만, 다른 박스면 그 박스 폴더로, 바탕화면이면 꺼낸다.
    pub fn transfer(&mut self, from: &str, path: &str, sx: f64, sy: f64, paths: &[String]) {
        self.hide_ghost();
        let moving = self.moving_paths(from, path, paths);
        // 받을 항목은 손을 뗀 자리에서 다시 잰다.
        let landed = self.hit(sx, sy);
        let into = landed.as_ref().and_then(|l| self.receiver_at(l, sx, sy, path));
        if let Some(into) = into {
            if !moving.iter().any(|m| same_path(m, &into)) {
                let mut changed = false;
                let mut handled = false;
                for one in &moving {
                    let done = self.send_into(one, &into);
                    if done == "moved" {
                        self.take_out(one);
                        changed = true;
                    }
                    if !done.is_empty() {
                        handled = true;
                    }
                }
                if changed {
                    self.persist();
                    self.push_all();
                    self.refresh_icons();
                }
                self.clear_hover();
                if handled {
                    return;
                }
            }
        }
        let target = self.hit(sx, sy);
        self.clear_hover();
        let Some(target) = target else {
            let at = self.release_on_desktop(sx, sy).then(|| Point::new(sx, sy));
            for one in &moving {
                self.eject(from, one, at);
            }
            return;
        };
        let index = self.index_at(&target, sx, sy, &moving);
        if target == from {
            self.reorder_many(from, &moving, index);
        } else {
            let entries: Vec<Incoming> = moving.iter().map(|p| Incoming::path(p.clone())).collect();
            self.drop_files(&target, &entries, index, None);
        }
    }

    // 담는다는 것은 그 파일을 이 박스의 폴더로 옮긴다는 뜻이다.
    // 옮기지 못했을 때 keep_stuck 이면 그대로 들고 있는다(settleBox), 아니면 담지 않는다(dropFiles).
    pub(crate) fn bring_in(&mut self, at: usize, item: &Item, keep_stuck: bool) -> (Option<Item>, bool) {
        let mut fence = self.state.fences[at].clone();
        let moved = self.hold.take(&mut fence, item);
        self.state.fences[at].folder = fence.folder;
        let Some(moved) = moved else { return (None, false) };
        if moved.stuck {
            if !keep_stuck {
                return (None, true);
            }
            return (Some(Item { name: item.name.clone(), path: item.path.clone(), home: item.home.clone() }), true);
        }
        if moved.path != item.path {
            self.refresh_folders(&[dirname(&item.path), dirname(&moved.path)]);
        }
        (Some(moved.item()), false)
    }

    // 꺼낸다. 파일을 담기 전 폴더로 돌려보낸다.
    pub(crate) fn let_go(&mut self, item: &Item, at: Option<Point>) -> bool {
        if is_shell_item(&item.path) {
            if let Some(at) = at {
                if self.desk.put_at(&item.name, at) {
                    return true;
                }
            }
            return self.desk.put_home(&[item.name.clone()]);
        }
        // 담는 동안 감춰 두었던 파일이면 속성을 먼저 되돌린다. 꺼낸 것은 반드시 눈에 보여야 한다.
        self.desk.reveal_file(&item.path);
        let back = self.hold.give(item);
        if back.is_empty() || back == item.path {
            return false;
        }
        self.refresh_folders(&[dirname(&item.path), dirname(&back)]);
        let name = basename(&back);
        if let Some(at) = at {
            if self.desk.put_at(&name, at) {
                return true;
            }
        }
        self.desk.put_home(&[name]);
        true
    }

    // 파일을 옮기면 탐색기가 곧 알아채지만, 알려 주면 바로 다시 그린다.
    pub(crate) fn refresh_folders(&self, dirs: &[String]) {
        let mut seen = Vec::new();
        for dir in dirs.iter().filter(|d| !d.is_empty()) {
            if seen.contains(dir) {
                continue;
            }
            seen.push(dir.clone());
            self.desk.refresh_folder(dir);
        }
    }

    // ── 폴더와 맞추기 ───────────────────────────────────────────────────

    // 박스를 제 폴더와 맞춘다. 차례는 적어 둔 것을 따르고, 처음 보는 파일은 뒤에 붙인다.
    pub(crate) fn settle_box(&mut self, at: usize) -> bool {
        let before: Vec<String> = self.state.fences[at].items.iter().map(|i| i.path.clone()).collect();
        let fence = self.state.fences[at].clone();
        let mut in_folder: Vec<String> = self.hold.names(&fence);
        let root = self.hold.root_dir();
        let dir = if !root.is_empty() && !fence.folder.is_empty() { join(&root, &fence.folder) } else { String::new() };
        let mut kept = Vec::new();
        for item in &fence.items {
            if is_shell_item(&item.path) {
                kept.push(item.clone());
                continue;
            }
            let name = basename(&item.path);
            if !dir.is_empty() && resolve(&dirname(&item.path)) == resolve(&dir) {
                if let Some(pos) = in_folder.iter().position(|n| *n == name) {
                    kept.push(item.clone());
                    in_folder.remove(pos);
                }
                continue;
            }
            // 아직 폴더 밖에 있는 것은 옮겨 담는다. 예전 판에서 올라온 박스가 이 길로 들어온다.
            let (got, stuck) = self.bring_in(at, item, true);
            if let Some(got) = got {
                if !stuck {
                    let base = basename(&got.path);
                    in_folder.retain(|n| *n != base);
                }
                kept.push(got);
            }
        }
        // 탐색기에서 폴더에 바로 넣은 파일.
        let dir = if dir.is_empty() {
            let root = self.hold.root_dir();
            let folder = &self.state.fences[at].folder;
            if !root.is_empty() && !folder.is_empty() {
                join(&root, folder)
            } else {
                String::new()
            }
        } else {
            dir
        };
        for name in in_folder {
            kept.push(Item { path: join(&dir, &name), name, home: None });
        }
        let after: Vec<String> = kept.iter().map(|i| i.path.clone()).collect();
        self.state.fences[at].items = kept;
        before != after
    }

    // 앞선 실행이 갑자기 끝나 보관함에 남은 파일을 돌려준다. 박스가 들고 있는 것은 그대로 둔다.
    pub fn recover_held(&mut self) -> Vec<String> {
        let keep: Vec<String> = self.captured().into_iter().map(|i| i.path).collect();
        let back = self.hold.recover(&keep);
        if !back.is_empty() {
            let dirs: Vec<String> = back.iter().map(|p| dirname(p)).collect();
            self.refresh_folders(&dirs);
        }
        back
    }

    pub fn settle_all(&mut self) -> bool {
        let mut changed = false;
        for at in 0..self.state.fences.len() {
            if self.settle_box(at) {
                changed = true;
            }
        }
        if changed {
            self.persist();
            self.push_all();
        }
        changed
    }

    // 마지막으로 본 휴지통 상태. 바뀌면 박스의 그림을 다시 보낸다.
    pub(crate) fn watch_bin(&mut self) {
        let now = self.bin_state();
        if self.last_bin.as_deref() == Some(now.as_str()) {
            return;
        }
        self.last_bin = Some(now);
        let shown = self.state.fences.iter().any(|f| f.items.iter().any(|i| is_recycle(&i.path)));
        if shown {
            self.push_all();
        }
    }

    // 끝낼 때 바탕화면을 켜기 전 모습으로 돌려놓는다. 두 번 불러도 한 번만 한다.
    // 담은 파일을 담기 전 폴더로 되돌리되, 어느 박스의 무엇이었는지는 남긴다.
    pub fn put_back(&mut self) -> bool {
        self.closing = true;
        if self.put_back_done {
            return true;
        }
        self.put_back_done = true;
        let items = self.captured();
        for at in 0..self.state.fences.len() {
            let kept = self.park_box(at);
            self.state.fences[at].items = kept;
        }
        self.persist();
        self.desk.release(&items);
        true
    }

    // 담긴 파일을 담기 전 폴더로 돌려보내고, 다시 담을 목록은 남긴다.
    fn park_box(&mut self, at: usize) -> Vec<Item> {
        let fence = self.state.fences[at].clone();
        let mut kept = Vec::new();
        let mut names = Vec::new();
        for item in &fence.items {
            if is_shell_item(&item.path) {
                kept.push(item.clone());
                if !item.name.is_empty() {
                    names.push(item.name.clone());
                }
                continue;
            }
            let back = self.hold.give(item);
            if back.is_empty() {
                continue;
            }
            let home = item.home.clone().filter(|h| !h.is_empty()).unwrap_or_else(|| dirname(&back));
            kept.push(Item { name: basename(&back), path: back.clone(), home: Some(home) });
            names.push(basename(&back));
            if back != item.path {
                self.refresh_folders(&[dirname(&item.path), dirname(&back)]);
            }
        }
        self.hold.drop_box(&fence);
        if !names.is_empty() {
            self.desk.put_home(&names);
        }
        kept
    }

    // 박스 하나를 비운다. 돌려준 개수를 준다.
    pub(crate) fn empty_box(&mut self, at: usize) -> usize {
        let fence = self.state.fences[at].clone();
        let mut count = 0;
        let mut names = Vec::new();
        for item in &fence.items {
            if is_shell_item(&item.path) {
                names.push(item.name.clone());
                continue;
            }
            let back = self.hold.give(item);
            if !back.is_empty() && back != item.path {
                self.refresh_folders(&[dirname(&item.path), dirname(&back)]);
                names.push(basename(&back));
                count += 1;
            } else if !back.is_empty() {
                names.push(basename(&back));
            }
        }
        self.state.fences[at].items.clear();
        // 빈 폴더는 남길 까닭이 없다.
        self.hold.drop_box(&self.state.fences[at].clone());
        if !names.is_empty() {
            self.desk.put_home(&names);
        }
        count
    }

    // 트레이의 '바탕화면으로 모두 돌려주기'. 박스는 그대로 두고 안의 것만 비운다.
    pub fn return_all(&mut self) -> usize {
        let mut count = 0;
        for at in 0..self.state.fences.len() {
            count += self.empty_box(at);
        }
        self.persist();
        self.push_all();
        self.refresh_icons();
        count
    }

    // ── 바탕화면에 새로 생긴 항목 ─────────────────────────────────────────

    fn desk_paths(&self) -> Vec<String> {
        self.desk.desktop_entries().into_iter().filter(|e| !e.path.is_empty()).map(|e| e.path).collect()
    }

    // 이 이름을 이미 들고 있는 박스. 들고 있는 항목까지 함께 준다.
    pub(crate) fn holder_of(&self, name: &str) -> Option<(String, Item)> {
        for f in &self.state.fences {
            for item in &f.items {
                if is_shell_item(&item.path) {
                    continue;
                }
                if same_label(&basename(&item.path), name) {
                    return Some((f.id.clone(), item.clone()));
                }
            }
        }
        None
    }

    // 바탕화면을 다시 볼 때마다 새로 생긴 항목을 찾아 둔다.
    fn watch_fresh(&mut self) {
        let now = self.desk_paths();
        let keys: HashSet<String> = now.iter().map(|p| resolve(p)).collect();
        // 처음 보는 것이면 지금 있는 것은 모두 '이미 있던 것' 이다.
        let Some(seen) = &self.seen_on_desk else {
            self.seen_on_desk = Some(keys);
            return;
        };
        let mut fresh = Vec::new();
        for at in &now {
            if seen.contains(&resolve(at)) {
                continue;
            }
            if self.holder_of(&basename(at)).is_some() {
                fresh.push(at.clone());
            }
        }
        self.fresh_queue.extend(fresh);
        self.seen_on_desk = Some(keys);
    }

    // ── 지운 프로그램의 바로가기 ─────────────────────────────────────────

    // 박스에 담은 바로가기는 박스 폴더에 있어서, 프로그램을 지울 때 제거 프로그램이 찾지 못한다.
    // 가리키던 프로그램이 ORPHAN_GRACE_MS 동안 계속 없으면 우리가 휴지통으로 보낸다.
    // 업데이트하며 잠깐 없어지는 것은 그 사이에 돌아온다.
    // 이번에 켜 있는 동안 있는 것을 본 적이 없으면, 설치 폴더까지 없어졌을 때만 지운다
    // (원래 깨져 있던 바로가기를 두고 싶은 사람도 있다).
    pub(crate) fn drop_orphan_links(&mut self) -> bool {
        let paths: Vec<String> = self
            .state
            .fences
            .iter()
            .flat_map(|f| f.items.iter())
            .filter(|i| !is_shell_item(&i.path) && i.path.to_lowercase().ends_with(".lnk"))
            .map(|i| i.path.clone())
            .collect();
        let links: Vec<(String, String)> = paths
            .into_iter()
            .filter_map(|path| {
                let mtime = super::mtime_ms(&path)?;
                let link = self.link_of(&path, mtime)?;
                Some((path, link.target))
            })
            .collect();
        let now = now_ms();
        let mut gone = Vec::new();
        let mut watched = HashSet::new();
        for (path, target) in links {
            if !names_program(&target) || !on_reachable_drive(&target) {
                continue;
            }
            watched.insert(path.clone());
            if Path::new(&target).exists() {
                self.link_alive.insert(path.clone());
                self.link_gone.remove(&path);
                continue;
            }
            let since = *self.link_gone.entry(path.clone()).or_insert(now);
            if now - since < ORPHAN_GRACE_MS {
                continue;
            }
            if self.link_alive.contains(&path) || !Path::new(&dirname(&target)).exists() {
                gone.push(path);
            }
        }
        self.link_gone.retain(|p, _| watched.contains(p));
        let mut changed = false;
        for path in gone {
            if !self.throw_away(&path) {
                continue;
            }
            self.take_out(&path);
            self.link_alive.remove(&path);
            self.link_gone.remove(&path);
            self.link_info.remove(&path);
            changed = true;
        }
        if changed {
            self.persist();
            self.push_all();
            self.watch_bin();
        }
        changed
    }

    // 박스에 담긴 것은 박스 폴더에 있어 바탕화면 아이콘이 없다. 할 일은 박스 자리의 아이콘을 비키는 것.
    pub fn refresh_icons(&mut self) {
        if self.closing {
            return;
        }
        self.watch_bin();
        // 박스를 폴더와 먼저 맞춘다. 그런 다음에 바탕화면에 새로 생긴 것을 본다.
        let mut changed = self.settle_all();
        if self.drop_orphan_links() {
            changed = true;
        }
        self.watch_fresh();
        self.drain_fresh();
        // 휴지통 같은 셸 항목은 바탕화면 쪽 아이콘을 레지스트리로 감추고 박스 창이 대신 그린다.
        let captured = if self.state.hidden { vec![] } else { self.captured() };
        self.desk.sync_shell_icons(&captured);
        if changed || self.icons_stale() {
            self.push_all();
        }
        if self.state.hidden {
            // 박스를 숨기면 밀어낸 아이콘도 제자리로 돌려준다.
            self.desk.release(&[]);
            return;
        }
        // 바탕화면에서 무언가를 끌고 있는 동안에는 건드리지 않는다.
        if self.desk.mouse_down() {
            return;
        }
        self.nudged_at = now_ms();
        let blocks = self.block_rects();
        self.desk.nudge(&blocks, false);
    }

    // 지금 화면에 보이는 박스들이 차지한 자리.
    pub(crate) fn block_rects(&self) -> Vec<Rect> {
        if self.state.hidden {
            return vec![];
        }
        self.state.fences.iter().filter_map(|f| self.bounds_of(&f.id)).collect()
    }

    pub fn open_item(&self, path: &str) {
        if path.is_empty() {
            return;
        }
        self.ui.open_path(path);
    }

    // ── 다른 프로그램으로 끌어 낸 뒤 ──────────────────────────────────────

    // 손을 뗀 뒤 그 파일이 어디로 갔는지 보고 박스를 맞춘다.
    pub(crate) fn after_drag_out(&mut self, path: &str, desk_dir: &str, before: &Option<HashSet<String>>) {
        if !Path::new(path).exists() {
            // 나간 것은 그 파일 하나다.
            self.take_out(path);
            self.persist();
            self.push_all();
            self.refresh_icons();
            return;
        }
        // 탐색기는 파일을 옮기지 않고 바로가기만 만들어 두기도 한다. 그 바로가기를 치우고 파일을 꺼낸다.
        let fresh = self.fresh_links(path, desk_dir, before);
        if !fresh.is_empty() {
            for full in fresh {
                let _ = fs::remove_file(&full);
            }
            self.release_to_desktop(path, desk_dir, before);
            return;
        }
        // 다른 박스의 휴지통 위에 놓으면 버린다.
        if self.land_on_box(path) {
            return;
        }
        if self.dropped_on_desktop() {
            self.release_to_desktop(path, desk_dir, before);
        }
    }

    // 손을 뗀 곳이 박스 안이다. 휴지통이면 버리고, 다른 박스의 빈 자리면 그 박스로 옮긴다.
    fn land_on_box(&mut self, path: &str) -> bool {
        let Some(at) = self.cursor_dip() else { return false };
        let Some(landed) = self.hit(at.x, at.y) else { return false };
        let into = self.receiver_at(&landed, at.x, at.y, path);
        let owner = self.owner_of(path);
        if let Some(into) = into.filter(|i| i != path) {
            let done = self.send_into(path, &into);
            if done == "moved" {
                self.take_out(path);
                self.persist();
                self.push_all();
                self.refresh_icons();
                return true;
            }
            if !done.is_empty() {
                return true;
            }
            if owner.is_none() || owner.as_deref() == Some(landed.as_str()) {
                return true;
            }
            self.drop_files(&landed, &[Incoming::path(path)], None, None);
            return true;
        }
        if owner.as_deref() == Some(landed.as_str()) {
            return true;
        }
        self.drop_files(&landed, &[Incoming::path(path)], None, None);
        true
    }

    // 바탕화면에 놓인 것이다. 박스 폴더에 남은 파일은 지운다.
    // 탐색기가 이미 같은 이름으로 복사해 두었으면 그 복사를 남기고 박스 쪽만 지운다.
    fn release_to_desktop(&mut self, path: &str, desk_dir: &str, before: &Option<HashSet<String>>) {
        let Some(owner) = self.owner_of(path) else { return };
        let base = basename(path);
        let landed = if desk_dir.is_empty() { String::new() } else { join(desk_dir, &base) };
        let copied = match before {
            Some(b) => !landed.is_empty() && !b.contains(&base.to_lowercase()) && !same_path(&landed, path) && Path::new(&landed).exists(),
            None => false,
        };
        if copied {
            if hold::remove_tree(Path::new(path)).is_err() || Path::new(path).exists() {
                return;
            }
            self.take_out(path);
            self.persist();
            self.push_all();
            self.refresh_icons();
            return;
        }
        self.drop_fresh_links(desk_dir, path, before);
        let at = self.cursor_dip();
        self.eject(&owner, path, at);
    }

    // 끌어 내는 동안 바탕화면에 새로 생긴, 이 파일을 가리키는 바로가기.
    fn fresh_links(&self, path: &str, dir: &str, before: &Option<HashSet<String>>) -> Vec<String> {
        let Some(before) = before else { return vec![] };
        if dir.is_empty() || path.is_empty() {
            return vec![];
        }
        let Ok(list) = fs::read_dir(dir) else { return vec![] };
        let mut found = Vec::new();
        for entry in list.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if before.contains(&name.to_lowercase()) || !name.to_lowercase().ends_with(".lnk") {
                continue;
            }
            let full = join(dir, &name);
            if self.points_at(&full, path) {
                found.push(full);
            }
        }
        found
    }

    fn points_at(&self, lnk: &str, path: &str) -> bool {
        let Some(link) = self.shortcut_link(lnk) else { return false };
        if same_path(&link.target, path) {
            return true;
        }
        match (fs::canonicalize(&link.target), fs::canonicalize(path)) {
            (Ok(a), Ok(b)) => same_path(&pathx::s(a), &pathx::s(b)),
            _ => false,
        }
    }

    // 탐색기가 박스 파일을 가리키는 바로가기를 바탕화면에 만든 것은 지운다.
    fn drop_fresh_links(&self, dir: &str, path: &str, before: &Option<HashSet<String>>) {
        let Some(before) = before else { return };
        if dir.is_empty() {
            return;
        }
        let Ok(list) = fs::read_dir(dir) else { return };
        for entry in list.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if before.contains(&name.to_lowercase()) || !name.to_lowercase().ends_with(".lnk") {
                continue;
            }
            let full = join(dir, &name);
            if let Some(link) = self.shortcut_link(&full) {
                if same_path(&link.target, path) {
                    let _ = fs::remove_file(&full);
                }
            }
        }
    }

    pub(crate) fn can_drag_out(path: &str) -> bool {
        !path.is_empty() && !is_recycle(path) && !is_shell_item(path) && Path::new(path).exists()
    }

    // 끄는 동안 커서 밑에 둘 그림. 비어 있으면 운영체제가 끌기를 거절한다.
    pub(crate) fn drag_icon_for(&self, path: &str) -> crate::image::Picture {
        let image = self.drag_icons.get(path).cloned().or_else(|| self.ui.asset("icon.png"));
        let Some(image) = image else { return crate::image::Picture::solid(16, 16, 0xff) };
        if image.width > 48 {
            return image.resize(32, 32, true);
        }
        image
    }

    pub(crate) fn desk_snapshot(&self) -> (String, Option<HashSet<String>>) {
        let dir = self.desktop_folder();
        let before = names_in(&dir);
        (dir, before)
    }
}

// 같은 이름인가. Windows 는 대소문자를 가리지 않는다.
pub(crate) fn same_label(a: &str, b: &str) -> bool {
    if a.is_empty() || b.is_empty() {
        return false;
    }
    if cfg!(windows) {
        a.to_lowercase() == b.to_lowercase()
    } else {
        a == b
    }
}

#[allow(dead_code)]
fn fence_rect(f: &Fence) -> Rect {
    Rect::new(f.x, f.y, f.w, panel_height(f.collapsed, f.h))
}
