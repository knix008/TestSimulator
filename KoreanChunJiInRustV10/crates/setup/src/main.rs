//! chunjiin-setup - 천지인 한글 입력기 설치 프로그램.
//!
//! C++ 판의 `installer/setup.c` 와 같은 생각으로 만들었다. 실행 파일을 자기
//! 안에 품고 있다가 설치 폴더에 푼다. 관리자 권한은 필요 없다. 다른 설치
//! 도구(Inno Setup, NSIS, dpkg)를 깔지 않아도 되도록 Rust 로만 짰다.
//!
//! ```text
//! Windows  %LOCALAPPDATA%\Programs\Chunjiin   + 시작 메뉴 바로 가기
//! Linux    ~/.local/share/Chunjiin            + .desktop 항목
//! macOS    ~/Applications/Chunjiin.app        (앱 묶음)
//! ```
//!
//! 품고 있는 실행 파일은 `payload` 폴더에서 온다. `scripts/package.ps1`
//! (또는 `package.sh`) 가 앱을 먼저 빌드해 그 폴더에 넣은 뒤 이 프로그램을
//! 빌드하고, 끝나면 그 폴더를 비운다. 저장소에 실행 파일이 남지 않는다.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

mod install;

use std::path::PathBuf;

use eframe::egui;
use egui::{Align, Color32, Layout, RichText, ViewportBuilder};

/// 설치할 판 번호다.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const APP_NAME: &str = "Chunjiin";

/// 창과 바로 가기에 쓰는 아이콘이다.
pub const ICON_PNG: &[u8] = include_bytes!("../../../assets/chunjiin.png");

/// 품고 있는 실행 파일이다.
///
/// `build.rs` 가 `payload/` 를 보고 만들어 준다. 비어 있으면 설치 단추가
/// 눌리지 않고, 무엇을 해야 하는지 알려 준다.
mod payload {
    include!(concat!(env!("OUT_DIR"), "/payload.rs"));
}

fn main() -> eframe::Result<()> {
    let icon = image::load_from_memory(ICON_PNG)
        .map(|i| {
            let img = i.into_rgba8();
            let (width, height) = img.dimensions();
            egui::IconData {
                rgba: img.into_raw(),
                width,
                height,
            }
        })
        .unwrap_or_default();

    let options = eframe::NativeOptions {
        viewport: ViewportBuilder::default()
            .with_title("천지인 한글 입력기 설치")
            .with_inner_size([560.0, 340.0])
            .with_resizable(false)
            .with_icon(icon),
        ..Default::default()
    };

    eframe::run_native(
        "chunjiin-setup",
        options,
        Box::new(|cc| {
            // 한글이 네모로 나오지 않게 내장 글꼴을 등록한다.
            chunjiin_ui::font::install(&cc.egui_ctx);
            Ok(Box::new(Setup::new()))
        }),
    )
}

/// 설치 창의 상태다.
struct Setup {
    target: String,
    status: String,
    /// 참이면 잘못된 일이라 빨갛게 보인다.
    failed: bool,
    /// 제거 전에 한 번 더 묻는 상자가 떠 있는지
    confirm_remove: bool,
}

impl Setup {
    fn new() -> Setup {
        let target = install::default_target().display().to_string();

        let status = if payload::EXE.is_empty() {
            "설치할 실행 파일이 들어 있지 않습니다.\n\
             scripts/package.ps1 (또는 package.sh) 로 다시 빌드하세요."
                .to_string()
        } else if install::is_installed(std::path::Path::new(&target)) {
            "이미 설치되어 있습니다. 다시 설치하면 덮어씁니다.".to_string()
        } else {
            String::new()
        };

        Setup {
            target,
            status,
            failed: false,
            confirm_remove: false,
        }
    }

    fn target_path(&self) -> PathBuf {
        PathBuf::from(self.target.trim())
    }

    fn do_install(&mut self) {
        let target = self.target_path();
        if target.as_os_str().is_empty() {
            self.set_status("설치 폴더를 정해 주세요.", true);
            return;
        }
        if payload::EXE.is_empty() {
            self.set_status("품고 있는 실행 파일이 없습니다.", true);
            return;
        }

        match install::install(&target, payload::EXE) {
            Ok(()) => self.set_status(&format!("설치를 마쳤습니다.\n{}", target.display()), false),
            Err(e) => self.set_status(&format!("실패: {e}"), true),
        }
    }

    fn do_remove(&mut self) {
        let target = self.target_path();
        match install::uninstall(&target) {
            Ok(()) => self.set_status("제거를 마쳤습니다.", false),
            Err(e) => self.set_status(&format!("실패: {e}"), true),
        }
    }

    fn set_status(&mut self, msg: &str, failed: bool) {
        self.status = msg.to_string();
        self.failed = failed;
    }
}

impl eframe::App for Setup {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();

        egui::CentralPanel::default().show(ui, |ui| {
            ui.add_space(4.0);
            ui.label(
                RichText::new(format!("천지인 한글 입력기  {VERSION}"))
                    .size(17.0)
                    .strong(),
            );
            ui.label(
                "12키 천지인 자판으로 한글을 조합하는 프로그램입니다.\n\
                 관리자 권한 없이 아래 폴더에 설치됩니다.",
            );
            ui.add_space(6.0);
            ui.separator();
            ui.add_space(6.0);

            ui.label(RichText::new("설치 폴더").strong());
            ui.horizontal(|ui| {
                let width = ui.available_width() - 44.0;
                ui.add_sized([width, 24.0], egui::TextEdit::singleline(&mut self.target));
                if ui.button("찾기…").clicked() {
                    if let Some(dir) = rfd::FileDialog::new().pick_folder() {
                        self.target = dir.join(APP_NAME).display().to_string();
                    }
                }
            });

            ui.add_space(8.0);
            ui.separator();
            ui.add_space(6.0);

            let has_payload = !payload::EXE.is_empty();
            let installed = install::is_installed(&self.target_path());

            ui.horizontal(|ui| {
                if ui
                    .add_enabled(has_payload, egui::Button::new("설치"))
                    .clicked()
                {
                    self.do_install();
                }
                if ui
                    .add_enabled(installed, egui::Button::new("제거"))
                    .clicked()
                {
                    self.confirm_remove = true;
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui.button("닫기").clicked() {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                });
            });

            ui.add_space(8.0);
            if !self.status.is_empty() {
                let color = if self.failed {
                    Color32::from_rgb(0xD9, 0x30, 0x25)
                } else {
                    ui.visuals().text_color()
                };
                ui.label(RichText::new(&self.status).color(color));
            }
        });

        // 제거는 되돌릴 수 없으므로 한 번 더 묻는다.
        if self.confirm_remove {
            let target = self.target_path();
            egui::Modal::new(egui::Id::new("confirm-remove")).show(&ctx, |ui| {
                ui.set_width(360.0);
                ui.label(RichText::new("제거").strong().size(15.0));
                ui.add_space(6.0);
                ui.label(format!(
                    "설치한 파일을 모두 지울까요?\n\n{}",
                    target.display()
                ));
                ui.add_space(10.0);
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui.button("지우기").clicked() {
                        self.confirm_remove = false;
                        self.do_remove();
                    }
                    if ui.button("그만두기").clicked() {
                        self.confirm_remove = false;
                    }
                });
            });
        }
    }
}
