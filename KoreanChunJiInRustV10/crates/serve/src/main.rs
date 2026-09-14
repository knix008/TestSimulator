//! chunjiin-serve - 웹 판을 띄우는 작은 서버.
//!
//! `web/` 아래의 파일을 실행 파일 안에 품고 있으므로, 이 파일 하나만 있으면
//! 어디서든 웹 판을 띄울 수 있다.
//!
//! ```text
//! chunjiin-serve                       http://localhost:8080 에서 띄운다
//! chunjiin-serve -addr 127.0.0.1:9000  다른 자리에서 띄운다
//! chunjiin-serve -addr :8080           같은 망의 다른 기기에도 연다
//! chunjiin-serve -dir web              품고 있는 것 대신 그 폴더를 쓴다(개발용)
//! ```
//!
//! `.wasm` 은 형식(`application/wasm`)을 제대로 알려 주어야 브라우저가
//! 스트리밍으로 받는다.
//!
//! 서버 꾸러미를 들이지 않고 표준 라이브러리만으로 짰다. 하는 일이
//! "정적 파일 내려 주기" 하나뿐이라 그것으로 넉넉하다.

#![forbid(unsafe_code)]

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};

/// `build.rs` 가 만든 `FILES` 목록을 들여온다.
mod site {
    include!(concat!(env!("OUT_DIR"), "/site.rs"));
}

fn main() {
    // 기본값은 이 컴퓨터에서만 열린다. 바깥에 열려면 -addr :8080 처럼
    // 주소를 비워 준다. 기본값을 :8080 으로 두면 Windows 방화벽이
    // 실행할 때마다 허용 여부를 묻는다.
    let mut addr = "127.0.0.1:8080".to_string();
    let mut dir: Option<PathBuf> = None;

    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-addr" | "--addr" if i + 1 < args.len() => {
                addr = args[i + 1].clone();
                i += 2;
            }
            "-dir" | "--dir" if i + 1 < args.len() => {
                dir = Some(PathBuf::from(&args[i + 1]));
                i += 2;
            }
            "-h" | "--help" => {
                usage();
                return;
            }
            other => {
                eprintln!("모르는 옵션: {other}");
                usage();
                std::process::exit(2);
            }
        }
    }

    // ":8080" 처럼 앞을 비우면 모든 이름에 연다.
    let bind = if let Some(port) = addr.strip_prefix(':') {
        format!("0.0.0.0:{port}")
    } else {
        addr.clone()
    };

    if let Some(d) = &dir {
        if !d.is_dir() {
            eprintln!("폴더를 찾지 못했습니다: {}", d.display());
            std::process::exit(1);
        }
        println!("폴더에서 띄웁니다: {}", d.display());
    } else if site::FILES.is_empty() {
        eprintln!("품고 있는 웹 판이 없습니다. scripts/build-web 을 먼저 돌리거나");
        eprintln!("  chunjiin-serve -dir web  처럼 폴더를 알려 주세요.");
        std::process::exit(1);
    }

    let listener = match TcpListener::bind(&bind) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("{bind} 을 열지 못했습니다: {e}");
            std::process::exit(1);
        }
    };

    println!("천지인 한글 입력기 - {}", browse_url(&addr));
    println!("멈추려면 Ctrl+C");

    for stream in listener.incoming().flatten() {
        let dir = dir.clone();
        // 한 요청씩 실 하나. 파일 몇 개를 내려 주는 것이 전부라 넉넉하다.
        std::thread::spawn(move || {
            let _ = handle(stream, dir.as_deref());
        });
    }
}

fn usage() {
    println!("chunjiin-serve - 천지인 한글 입력기 웹 판 서버");
    println!();
    println!("  -addr <주소>   들을 자리 (기본 127.0.0.1:8080)");
    println!("  -dir  <폴더>   품고 있는 것 대신 쓸 폴더 (개발용)");
}

fn handle(mut stream: TcpStream, dir: Option<&Path>) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut line = String::new();
    if reader.read_line(&mut line)? == 0 {
        return Ok(());
    }

    // "GET /경로 HTTP/1.1"
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");

    // 나머지 머리글은 읽어서 버린다. 몸통이 필요한 요청이 없다.
    for h in reader.lines() {
        match h {
            Ok(h) if h.is_empty() => break,
            Ok(_) => {}
            Err(_) => break,
        }
    }

    if method != "GET" && method != "HEAD" {
        return respond(&mut stream, 405, "text/plain; charset=utf-8", b"405", true);
    }

    let path = clean_path(target);
    let body = match dir {
        Some(d) => read_from_dir(d, &path),
        None => site::FILES
            .iter()
            .find(|(name, _)| *name == path)
            .map(|(_, data)| data.to_vec()),
    };

    match body {
        Some(data) => respond(&mut stream, 200, mime_of(&path), &data, method == "HEAD"),
        None => respond(
            &mut stream,
            404,
            "text/plain; charset=utf-8",
            "404 찾지 못했습니다\n".as_bytes(),
            method == "HEAD",
        ),
    }
}

/// 요청한 자리를 파일 이름으로 다듬는다.
///
/// 물음표 뒤를 떼고, 폴더면 `index.html` 을 붙이고, `..` 을 없앤다.
/// `..` 을 남겨 두면 서버 밖의 파일까지 내려 주게 된다.
fn clean_path(target: &str) -> String {
    let target = target.split(['?', '#']).next().unwrap_or("/");
    let target = target.trim_start_matches('/');

    let mut out: Vec<&str> = Vec::new();
    for seg in target.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            s => out.push(s),
        }
    }

    let joined = out.join("/");
    if joined.is_empty() {
        "index.html".to_string()
    } else {
        joined
    }
}

fn read_from_dir(dir: &Path, rel: &str) -> Option<Vec<u8>> {
    let path = dir.join(rel);
    // clean_path 가 이미 걸렀지만 한 번 더 본다.
    if path.components().any(|c| c == Component::ParentDir) {
        return None;
    }
    std::fs::read(path).ok()
}

/// 파일 이름 끝을 보고 형식을 고른다.
///
/// `.wasm` 을 `application/wasm` 으로 알려 주어야 브라우저가 받으면서
/// 곧바로 번역한다. 모르는 형식으로 주면 통째로 받은 뒤에야 시작한다.
fn mime_of(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("");
    match ext {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "wasm" => "application/wasm",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn respond(
    stream: &mut TcpStream,
    status: u16,
    mime: &str,
    body: &[u8],
    head_only: bool,
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "OK",
    };

    // 브라우저가 옛 파일을 붙들고 있지 않게 한다.
    // 고친 것이 바로 보이지 않으면 헷갈리기 때문이다.
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Type: {mime}\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n\r\n",
        body.len()
    );

    stream.write_all(head.as_bytes())?;
    if !head_only {
        stream.write_all(body)?;
    }
    stream.flush()
}

/// 들을 자리를 브라우저 주소창에 넣을 수 있는 꼴로 바꾼다.
///
/// ```text
/// 127.0.0.1:8080  ->  http://localhost:8080
/// :8080           ->  http://localhost:8080
/// 0.0.0.0:8080    ->  http://localhost:8080
/// ```
fn browse_url(addr: &str) -> String {
    let (host, port) = match addr.rsplit_once(':') {
        Some(v) => v,
        None => return format!("http://{addr}"),
    };
    let host = match host {
        "" | "0.0.0.0" | "127.0.0.1" | "::" | "[::]" => "localhost",
        h => h,
    };
    format!("http://{host}:{port}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chunjiin_testkit as kit;

    const GROUP: &str = "웹 서버";

    #[test]
    fn clean_path_is_safe() {
        let mut tally = kit::Tally::default();
        let section = "경로";
        for (src, want) in [
            ("/", "index.html"),
            ("/index.html", "index.html"),
            ("/app.js?v=2", "app.js"),
            ("/style.css", "style.css"),
            ("/chunjiin_wasm_bg.wasm", "chunjiin_wasm_bg.wasm"),
            ("/web/app.js", "web/app.js"),
            ("/../../etc/passwd", "etc/passwd"),
            ("/a/../b.css", "b.css"),
            ("/./foo.js", "foo.js"),
            ("", "index.html"),
        ] {
            let got = clean_path(src);
            tally.add(kit::check(
                got == want,
                GROUP,
                section,
                src,
                &format!("{src} -> {got}"),
            ));
        }
        tally.assert_clean("경로");
    }

    #[test]
    fn wasm_gets_its_own_mime() {
        let mut tally = kit::Tally::default();
        let section = "MIME";
        for (path, want) in [
            ("chunjiin_wasm_bg.wasm", "application/wasm"),
            ("app.js", "text/javascript; charset=utf-8"),
            ("app.mjs", "text/javascript; charset=utf-8"),
            ("style.css", "text/css; charset=utf-8"),
            ("index.html", "text/html; charset=utf-8"),
            ("data.json", "application/json; charset=utf-8"),
            ("chunjiin.png", "image/png"),
            ("icon.svg", "image/svg+xml"),
            ("favicon.ico", "image/x-icon"),
            ("readme.txt", "text/plain; charset=utf-8"),
            ("무엇", "application/octet-stream"),
            ("file.bin", "application/octet-stream"),
        ] {
            let got = mime_of(path);
            tally.add(kit::check(
                got == want,
                GROUP,
                section,
                path,
                got,
            ));
        }
        tally.assert_clean("MIME");
    }

    #[test]
    fn browse_url_says_localhost() {
        let mut tally = kit::Tally::default();
        let section = "주소";
        for (src, want) in [
            ("127.0.0.1:8080", "http://localhost:8080"),
            (":8080", "http://localhost:8080"),
            ("0.0.0.0:9000", "http://localhost:9000"),
            ("[::]:8080", "http://localhost:8080"),
            ("192.168.0.5:80", "http://192.168.0.5:80"),
            ("example.test:443", "http://example.test:443"),
        ] {
            let got = browse_url(src);
            tally.add(kit::check(
                got == want,
                GROUP,
                section,
                src,
                &got,
            ));
        }
        tally.assert_clean("주소");
    }
}
