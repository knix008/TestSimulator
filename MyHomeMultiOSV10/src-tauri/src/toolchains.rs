// Whether Node.js, Go, Rust and Python are on PATH, and how the desktop app starts an installer.
// The published board server runs with one of these. Nothing is installed unless the user asks.
use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
pub struct ToolStatus {
    pub id: String,
    pub found: bool,
    pub version: String,
}

#[derive(Serialize)]
pub struct InstallStarted {
    pub started: bool,
    pub url: String,
}

pub fn winget_id(id: &str) -> Option<&'static str> {
    match id {
        "node" => Some("OpenJS.NodeJS.LTS"),
        "go" => Some("GoLang.Go"),
        "rust" => Some("Rustlang.Rustup"),
        "python" => Some("Python.Python.3.13"),
        _ => None,
    }
}

pub fn download_url(id: &str) -> &'static str {
    match id {
        "node" => "https://nodejs.org/en/download",
        "go" => "https://go.dev/dl/",
        "rust" => "https://www.rust-lang.org/tools/install",
        "python" => "https://www.python.org/downloads/",
        _ => "https://nodejs.org/en/download",
    }
}

fn first_line(command: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let err = String::from_utf8_lossy(&output.stderr);
    text.lines().chain(err.lines()).map(str::trim).find(|line| !line.is_empty()).map(str::to_string)
}

fn one(id: &str, command: &str, args: &[&str]) -> ToolStatus {
    match first_line(command, args) {
        Some(version) => ToolStatus { id: id.to_string(), found: true, version },
        None => ToolStatus { id: id.to_string(), found: false, version: String::new() },
    }
}

pub fn probe() -> Vec<ToolStatus> {
    let python = first_line("python", &["--version"]).or_else(|| first_line("py", &["-3", "--version"]));
    vec![
        one("node", "node", &["--version"]),
        one("go", "go", &["version"]),
        one("rust", "rustc", &["--version"]),
        match python {
            Some(version) => ToolStatus { id: "python".to_string(), found: true, version },
            None => ToolStatus { id: "python".to_string(), found: false, version: String::new() },
        },
    ]
}

/// Starts the OS installer. On Windows that is winget, in its own console. Elsewhere the caller
/// opens the download page (`started` is false).
pub fn install(id: &str) -> Result<InstallStarted, String> {
    let url = download_url(id).to_string();
    let Some(package) = winget_id(id) else {
        return Err(format!("unknown tool {id}"));
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        Command::new("winget")
            .args(["install", "-e", "--accept-package-agreements", "--accept-source-agreements", "--id", package])
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(|error| format!("{error}"))?;
        return Ok(InstallStarted { started: true, url });
    }
    #[cfg(not(windows))]
    {
        let _ = package;
        Ok(InstallStarted { started: false, url })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_server_language_has_an_installer() {
        for id in ["node", "go", "rust", "python"] {
            assert!(winget_id(id).is_some(), "{id}");
            assert!(download_url(id).starts_with("https://"));
        }
        assert!(winget_id("ruby").is_none());
    }
}
