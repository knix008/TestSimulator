//! chunjiin-setup - 천지인 한글 입력기 설치 프로그램.
//!
//! C++ 판의 `installer/setup.c` 와 같은 생각으로 만들었다. 실행 파일을 자기
//! 안에 품고 있다가 설치 폴더에 푼다. 관리자 권한은 필요 없다. 다른 설치
//! 도구(Inno Setup, NSIS, dpkg)를 깔지 않아도 되도록 Rust 로만 짰다.
//!
//! ```text
//! Windows  %LOCALAPPDATA%\Programs\Chunjiin   + 시작 메뉴 · 바탕화면 바로 가기
//! Linux    ~/.local/share/Chunjiin            + 프로그램 목록 · 바탕화면
//! macOS    ~/Applications/Chunjiin.app        + 바탕화면 별칭
//! ```
//!
//! 바로 가기는 설치 창에서 고른다. 시작하자마자 삭제 상자를 띄우지 않는다.
//! 그 상자가 설치 · 제거 단추를 가리기 때문이다.
//!
//! 품고 있는 실행 파일은 `payload` 폴더에서 온다. `scripts/package.ps1`
//! (또는 `package.sh`) 가 앱을 먼저 빌드해 그 폴더에 넣은 뒤 이 프로그램을
//! 빌드하고, 끝나면 그 폴더를 비운다. 저장소에 실행 파일이 남지 않는다.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

mod install;

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver};
use std::thread;

use eframe::egui;
use egui::{Align, Color32, Layout, Margin, RichText, ViewportBuilder};

/// 본문이 창 테두리에 붙지 않게 두는 자리.
const PAD: Margin = Margin {
    left: 24,
    right: 24,
    top: 18,
    bottom: 16,
};

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
            .with_inner_size([640.0, 460.0])
            .with_min_inner_size([560.0, 400.0])
            .with_resizable(true)
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

/// 지울지 한 번 더 묻는 상자다.
enum Prompt {
    None,
    /// 이미 있는 것을 지울지 묻는다. `then_install` 이면 지운 뒤 다시 넣는다.
    Delete { then_install: bool },
}

/// 설치 창의 상태다.
struct Setup {
    target: String,
    status: String,
    /// 참이면 잘못된 일이라 빨갛게 보인다.
    failed: bool,
    /// 시작 메뉴 바로 가기를 만들까
    link_start_menu: bool,
    /// 바탕화면 바로 가기를 만들까
    link_desktop: bool,
    /// 지울지 묻는 상자
    prompt: Prompt,
    /// 설치·제거가 다른 줄에서 돌아가고 있는지
    busy: bool,
    /// 다른 줄이 마치면 여기로 결과를 보낸다.
    job: Option<Receiver<Result<String, String>>>,
}

impl Setup {
    fn new() -> Setup {
        let target = install::default_target().display().to_string();

        let already = install::is_installed(std::path::Path::new(&target));
        let status = if payload::EXE.is_empty() {
            "설치할 실행 파일이 들어 있지 않습니다.\n\
             scripts/package.ps1 (또는 package.sh) 로 다시 빌드하세요."
                .to_string()
        } else if already {
            "이미 설치되어 있습니다.".to_string()
        } else {
            String::new()
        };

        Setup {
            target,
            status,
            failed: false,
            link_start_menu: true,
            link_desktop: true,
            // 시작하자마자 상자를 띄우면 설치 단추가 가려진다.
            // 이미 있는지는 상태 글로만 알리고, 지울지는 단추를 누를 때 묻는다.
            prompt: Prompt::None,
            busy: false,
            job: None,
        }
    }

    fn target_path(&self) -> PathBuf {
        PathBuf::from(self.target.trim())
    }

    fn do_install(&mut self) {
        if self.busy {
            return;
        }
        let target = self.target_path();
        if target.as_os_str().is_empty() {
            self.set_status("설치 폴더를 정해 주세요.", true);
            return;
        }
        if payload::EXE.is_empty() {
            self.set_status("품고 있는 실행 파일이 없습니다.", true);
            return;
        }
        if install::is_installed(&target) {
            self.prompt = Prompt::Delete { then_install: true };
            return;
        }

        self.begin_install(target);
    }

    fn link_opts(&self) -> install::LinkOpts {
        install::LinkOpts {
            start_menu: self.link_start_menu,
            desktop: self.link_desktop,
        }
    }

    fn begin_install(&mut self, target: PathBuf) {
        // 파일을 쓰고 바로 가기를 만드는 동안 화면이 멈추지 않게
        // 다른 줄에서 한다. 여기서 기다리면 창이 죽은 것처럼 보인다.
        let bytes: &'static [u8] = payload::EXE;
        let links = self.link_opts();
        self.start_job("설치하는 중입니다…", move || {
            install::install(&target, bytes, links)
                .map(|()| format!("설치를 마쳤습니다.\n{}", target.display()))
                .map_err(|e| format!("실패: {e}"))
        });
    }

    fn begin_reinstall(&mut self) {
        if self.busy {
            return;
        }
        let target = self.target_path();
        let bytes: &'static [u8] = payload::EXE;
        let links = self.link_opts();
        self.start_job("다시 설치하는 중입니다…", move || {
            if let Err(e) = install::uninstall(&target) {
                return Err(format!("기존 프로그램을 지우지 못했습니다: {e}"));
            }
            install::install(&target, bytes, links)
                .map(|()| format!("설치를 마쳤습니다.\n{}", target.display()))
                .map_err(|e| format!("실패: {e}"))
        });
    }

    fn do_remove(&mut self) {
        if self.busy {
            return;
        }
        let target = self.target_path();
        self.start_job("제거하는 중입니다…", move || {
            install::uninstall(&target)
                .map(|()| "제거를 마쳤습니다.".to_string())
                .map_err(|e| format!("실패: {e}"))
        });
    }

    fn start_job(&mut self, waiting: &str, work: impl FnOnce() -> Result<String, String> + Send + 'static) {
        self.busy = true;
        self.failed = false;
        self.status = waiting.to_string();
        let (tx, rx) = mpsc::channel();
        self.job = Some(rx);
        thread::spawn(move || {
            let _ = tx.send(work());
        });
    }

    fn poll_job(&mut self, ctx: &egui::Context) {
        let Some(rx) = &self.job else {
            return;
        };
        match rx.try_recv() {
            Ok(Ok(msg)) => {
                self.set_status(&msg, false);
                self.busy = false;
                self.job = None;
            }
            Ok(Err(msg)) => {
                self.set_status(&msg, true);
                self.busy = false;
                self.job = None;
            }
            Err(mpsc::TryRecvError::Empty) => {
                ctx.request_repaint();
            }
            Err(mpsc::TryRecvError::Disconnected) => {
                self.set_status("작업이 중간에 끊겼습니다.", true);
                self.busy = false;
                self.job = None;
            }
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
        self.poll_job(&ctx);

        // 설치 · 제거 · 닫기는 아래쪽에 고정한다. 본문이 길어져도 가리지 않는다.
        let bar = egui::Frame::central_panel(ui.style()).inner_margin(Margin {
            left: PAD.left,
            right: PAD.right,
            top: 10,
            bottom: PAD.bottom,
        });
        egui::Panel::bottom("setup-actions")
            .show_separator_line(false)
            .frame(bar)
            .show(ui, |ui| {
                let has_payload = !payload::EXE.is_empty();
                let installed = install::is_installed(&self.target_path());

                ui.separator();
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    if ui
                        .add_enabled(has_payload && !self.busy, egui::Button::new("설치"))
                        .clicked()
                    {
                        self.do_install();
                    }
                    if ui
                        .add_enabled(installed && !self.busy, egui::Button::new("제거"))
                        .clicked()
                    {
                        self.prompt = Prompt::Delete { then_install: false };
                    }
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if ui.button("닫기").clicked() {
                            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                        }
                    });
                });

                if self.busy || !self.status.is_empty() {
                    ui.add_space(8.0);
                    let color = if self.failed {
                        Color32::from_rgb(0xD9, 0x30, 0x25)
                    } else {
                        ui.visuals().text_color()
                    };
                    ui.horizontal(|ui| {
                        if self.busy {
                            ui.spinner();
                        }
                        ui.label(RichText::new(&self.status).color(color));
                    });
                }
            });

        let frame = egui::Frame::central_panel(ui.style()).inner_margin(PAD);
        egui::CentralPanel::default().frame(frame).show(ui, |ui| {
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
            ui.add_space(8.0);
            ui.separator();
            ui.add_space(8.0);

            ui.label(RichText::new("설치 폴더").strong());
            ui.add_space(4.0);
            // 찾기 단추를 먼저 오른쪽에 두고, 남은 폭을 경로 칸이 차지한다.
            // 단추 폭을 짐작해 빼면 오른쪽 여백이 사라진다.
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if ui
                    .add_enabled(!self.busy, egui::Button::new("찾기…"))
                    .clicked()
                {
                    if let Some(dir) = rfd::FileDialog::new().pick_folder() {
                        self.target = dir.join(APP_NAME).display().to_string();
                    }
                }
                ui.add_enabled(
                    !self.busy,
                    egui::TextEdit::singleline(&mut self.target)
                        .desired_width(ui.available_width()),
                );
            });

            ui.add_space(12.0);
            ui.label(RichText::new("바로 가기").strong());
            ui.add_space(4.0);
            ui.add_enabled_ui(!self.busy, |ui| {
                ui.checkbox(
                    &mut self.link_start_menu,
                    "시작 메뉴에 바로 가기 만들기",
                );
                ui.checkbox(
                    &mut self.link_desktop,
                    "바탕화면에 바로 가기 만들기",
                );
            });
        });

        // 이미 있으면 덮어쓰지 않고, 지울지 먼저 묻는다.
        if let Prompt::Delete { then_install } = self.prompt {
            let target = self.target_path();
            egui::Modal::new(egui::Id::new("confirm-delete")).show(&ctx, |ui| {
                ui.set_width(420.0);
                ui.label(RichText::new("이미 설치되어 있습니다").strong().size(15.0));
                ui.add_space(8.0);
                if then_install {
                    ui.label(format!(
                        "기존 프로그램을 지우고 다시 설치할까요?\n\n{}",
                        target.display()
                    ));
                } else {
                    ui.label(format!(
                        "설치한 파일을 모두 지울까요?\n\n{}",
                        target.display()
                    ));
                }
                ui.add_space(12.0);
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let ok = if then_install {
                        "지우기 후 설치"
                    } else {
                        "지우기"
                    };
                    if ui.add_enabled(!self.busy, egui::Button::new(ok)).clicked() {
                        self.prompt = Prompt::None;
                        if then_install {
                            self.begin_reinstall();
                        } else {
                            self.do_remove();
                        }
                    }
                    if ui.button("그만두기").clicked() {
                        self.prompt = Prompt::None;
                    }
                });
            });
        }
    }
}
