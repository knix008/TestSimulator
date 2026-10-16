// 켜고 끄는 길 (Electron 판 src/main/main.js 의 운영체제와 무관한 부분).
//
//  - 켤 때 : 바탕화면 모듈 준비, 시작프로그램 맞추기, 남은 파일 되돌리기, 첫 실행 분류, 박스 띄우기
//  - 끌 때 : 담아 둔 파일을 담기 전 자리로 되돌리고, 밀어낸 아이콘과 감춘 셸 아이콘을 되돌린다.
//            트레이로 끝내든, Ctrl+C 든, 로그아웃이든, 큰 오류든 모두 이 길 하나를 지난다.

use std::sync::atomic::{AtomicBool, Ordering};

use crate::catalog;
use crate::conceal;
use crate::geom::Rect;
use crate::host::{lock, Shared};
use crate::i18n;
use crate::store::{self, normalize_fence, Fence};
use crate::ui::Ask;

// 자물쇠를 잡지 못해 기록만으로 되돌린 적이 있는가.
static RECORDS_DONE: AtomicBool = AtomicBool::new(false);

// 설치 후 처음에는 바탕화면 항목을 종류별로 나눠 담을 수 있다. 나눠 보기만 하고 옮기지는 않는다.
pub fn plan_desktop(sh: &Shared) -> Vec<Fence> {
    let h = lock(sh);
    let desk = h.desk.clone();
    // 숨김·임시 파일은 탐색기에도 보이지 않는다. 나눠 담을 때 끌어오지 않는다.
    let files: Vec<catalog::Entry> = desk
        .list_desktop_files()
        .into_iter()
        .filter(|f| !conceal::is_concealed(&f.name, desk.file_flags(&f.path)))
        .map(|f| catalog::Entry { name: f.name, path: f.path, directory: f.directory })
        .collect();
    let shell: Vec<catalog::Item> = desk.shell_items().into_iter().map(|e| catalog::Item { name: e.name, path: e.path }).collect();
    let lang = h.state.settings.lang.clone();
    let area: Rect = h.ui.primary_work_area();
    catalog::plan_fences(&files, &shell, area, |kind| i18n::t(&lang, &format!("box.{kind}")))
        .into_iter()
        .map(|p| {
            let items: Vec<serde_json::Value> = p.items.iter().map(|i| serde_json::json!({ "name": i.name, "path": i.path })).collect();
            normalize_fence(&serde_json::json!({
                "id": p.id, "title": p.title, "x": p.x, "y": p.y, "w": p.w, "h": p.h, "theme": p.theme, "items": items,
            }))
        })
        .collect()
}

// 켜졌다. 창과 트레이가 생긴 뒤에 부른다.
pub async fn start(sh: &Shared) {
    let first_run = {
        let mut h = lock(sh);
        let user = h.ui.user_dir();
        h.desk.init(&user);
        // 설치한 뒤 처음 켤 때 시작프로그램으로 자기를 적어 둔다. 설정에서 끈 사람은 건드리지 않는다.
        h.sync_login();
        // 앞선 실행이 갑자기 끝나 보관함에 남은 파일이 있으면 먼저 제자리로 돌려놓는다.
        h.recover_held();
        !h.state.did_welcome
    };
    if first_run {
        lock(sh).state.did_welcome = true;
        // 나눠 담으면 파일이 박스 폴더로 옮겨 간다. 그래서 먼저 묻는다.
        let planned = plan_desktop(sh);
        let count: usize = planned.iter().map(|f| f.items.len()).sum();
        if count > 0 {
            let (ask, ui) = {
                let h = lock(sh);
                let lang = h.state.settings.lang.clone();
                let ask = Ask {
                    title: i18n::t(&lang, "dialog.sort"),
                    detail: i18n::tv(&lang, "dialog.sortDetail", &[("n", count.to_string())]),
                    confirm: i18n::t(&lang, "dialog.sortGo"),
                    cancel: i18n::t(&lang, "dialog.cancel"),
                    danger: false,
                    lone: false,
                    icon: String::new(),
                };
                (ask, h.ui.clone())
            };
            if ui.confirm(ask).await {
                lock(sh).state.fences = planned;
            }
        }
        lock(sh).persist();
    }
    let mut h = lock(sh);
    h.open_all();
    if first_run && h.state.fences.is_empty() {
        h.begin_draw();
    }
}

// 끝낼 때 바탕화면을 켜기 전 모습으로 돌려놓는다. 담아 둔 파일은 원래 있던 폴더로, 밀어낸 아이콘은 적어 둔 자리로.
// 두 번 불러도 한 번만 한다.
// 큰 오류로 들어온 길에서는 자물쇠를 이미 이 스레드가 쥐고 있을 수 있다. 그때는 보관함 기록만으로 되돌린다.
pub fn restore_desktop(sh: &Shared) {
    crate::watch::stop_all();
    fn run(h: &mut crate::host::Host) {
        if h.restored {
            return;
        }
        h.restored = true;
        h.put_back();
        let items = h.captured();
        h.desk.release(&items);
        h.desk.shutdown();
    }
    match sh.try_lock() {
        Ok(mut h) => run(&mut h),
        Err(std::sync::TryLockError::Poisoned(p)) => run(&mut p.into_inner()),
        Err(std::sync::TryLockError::WouldBlock) => {
            // 누가 쥐고 있다. 잠깐 기다려 보고, 그래도 안 되면 기록만으로 되돌린다.
            for _ in 0..20 {
                std::thread::sleep(std::time::Duration::from_millis(50));
                if let Ok(mut h) = sh.try_lock() {
                    run(&mut h);
                    return;
                }
            }
            if !RECORDS_DONE.swap(true, Ordering::SeqCst) {
                restore_from_records();
            }
        }
    }
}

// 자물쇠 없이 되돌린다. --restore-desktop 과 같은 길이다.
fn restore_from_records() {
    let user = crate::paths::user_dir();
    let state = store::load(std::path::Path::new(&user), "");
    let desk = crate::desktop::platform();
    let dir = desk.desktop_directories().into_iter().next().unwrap_or_else(crate::paths::desktop_fallback);
    crate::restore::restore_desktop(desk.as_ref(), &user, &dir, &state.settings.root);
}

// 오류를 그대로 옮겨 적는다. 붙여 넣어 보낼 수 있어야 하므로 자취까지 담는다.
pub fn describe(body: &str, version: &str) -> String {
    let when = {
        let ms = crate::js::now_ms();
        let (y, mo, d, h, mi, s) = crate::js::local_parts(ms);
        format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{s:02}")
    };
    [
        format!("MyDeskBox {version}"),
        format!("{} {} · Tauri {}", std::env::consts::OS, std::env::consts::ARCH, tauri::VERSION),
        when,
        String::new(),
        body.to_string(),
    ]
    .join("\n")
}
