//! testreport - 시험 결과를 구역별로 정리해 보여 준다.
//!
//! `cargo test` 는 시험 함수마다 ok/FAIL 만 찍어서, 그 안에서 무엇을 얼마나
//! 보고 있는지 알 수 없다. C++ 판 `test_engine` 은 구역별 집계와 전체 요약을
//! 보여 주었는데 그 편이 훨씬 낫다. 그래서 이 프로그램이 `cargo test` 를
//! 돌리고, 시험이 남긴 줄을 모아 같은 모양으로 정리한다.
//!
//! ```text
//!   cargo test --workspace -- --nocapture
//!         │
//!         │  @@CASE<탭>ok<탭>묶음<탭>구역<탭>이름<탭>설명
//!         ▼
//!   묶음 · 구역별 집계와 요약
//! ```
//!
//! ```sh
//! cargo run -p chunjiin-testreport            # 구역별 집계와 요약
//! cargo run -p chunjiin-testreport -- -v      # 항목마다 한 줄씩
//! cargo run -p chunjiin-testreport -- -run 모음   # 이름이 맞는 것만
//! ```
//!
//! 보고기 자체도 시험한다(`tests/report.rs`). 보고기가 조용히 망가지면
//! "0개 중 0개 통과" 같은 헛된 요약이 나오고, 그것을 보고 다 잘 돌아간다고
//! 믿게 되기 때문이다.

#![forbid(unsafe_code)]

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};

use chunjiin_testreport::{color_enabled, parse_line, Report};

/// 저장소 루트의 test-summary.txt 자리.
fn summary_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test-summary.txt")
}

fn main() {
    let mut verbose = false;
    let mut color: Option<bool> = None;
    let mut filter: Option<String> = None;
    let mut passthrough: Vec<String> = Vec::new();

    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-v" | "--verbose" => {
                verbose = true;
                i += 1;
            }
            "-color" | "--color" => {
                color = Some(true);
                i += 1;
            }
            "-no-color" | "--no-color" => {
                color = Some(false);
                i += 1;
            }
            "-run" | "--run" if i + 1 < args.len() => {
                filter = Some(args[i + 1].clone());
                i += 2;
            }
            "-h" | "--help" => {
                println!("testreport [-v] [-run <낱말>] [--color|--no-color] [-- <cargo test 인자>]");
                return;
            }
            "--" => {
                passthrough.extend_from_slice(&args[i + 1..]);
                break;
            }
            other => {
                eprintln!("모르는 옵션: {other}");
                std::process::exit(2);
            }
        }
    }

    // cargo test 는 사람이 읽는 결과를 표준 출력으로 낸다.
    // 우리 시험이 남긴 @@CASE 줄도 거기 섞여 나온다.
    let mut cmd = Command::new(std::env::var("CARGO").unwrap_or_else(|_| "cargo".into()));
    cmd.args(["test", "--workspace"]);
    cmd.args(&passthrough);
    cmd.args(["--", "--nocapture"]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::inherit());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("cargo test 를 돌리지 못했습니다: {e}");
            std::process::exit(1);
        }
    };

    let mut report = Report::default();
    let mut compile_error = false;

    if let Some(out) = child.stdout.take() {
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            match parse_line(&line) {
                Some(case) => report.add(case),
                None => {
                    // 시험 자체가 죽었을 때의 자취는 그대로 보여 준다.
                    // 그러지 않으면 왜 항목이 없는지 알 수 없다.
                    if line.starts_with("error")
                        || line.contains("panicked at")
                        || line.starts_with("thread '")
                    {
                        compile_error = true;
                        eprintln!("{line}");
                    }
                }
            }
        }
    }

    let status = child.wait().ok();
    let ok = status.map(|s| s.success()).unwrap_or(false);

    if let Some(f) = &filter {
        report.retain(f);
    }

    report.print_colored(verbose, color.unwrap_or_else(color_enabled));

    // 콘솔이 뒤를 잘라도 루트에서 전체 요약을 볼 수 있게 남긴다.
    let summary = summary_path();
    if let Err(e) = report.write_plain_file(&summary) {
        eprintln!("요약을 루트에 쓰지 못했습니다: {e}");
    }

    if report.total() == 0 {
        eprintln!();
        eprintln!("항목을 하나도 모으지 못했습니다.");
        if compile_error {
            eprintln!("  시험이 빌드되지 않았거나 도중에 죽었습니다. 위 자취를 보세요.");
        } else if filter.is_some() {
            eprintln!("  -run 에 걸린 것이 없습니다.");
        } else {
            eprintln!("  cargo test --workspace 가 시험을 찾지 못했습니다.");
        }
        std::process::exit(1);
    }

    if !ok || report.failed() > 0 {
        std::process::exit(1);
    }
}
