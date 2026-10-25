//! The engine's platform services on the desktop: data files (paths relative
//! to the pipeline's folder) and external programs — Python scripts and
//! command-line tools — run in a temporary folder with the input table as
//! `in.csv` and the result read back from `out.csv`.
use sim_core::{ExternalCall, ExternalOutput, Host};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

pub struct DesktopHost {
    /// The folder of the open pipeline file: relative paths start there.
    pub base: Option<PathBuf>,
}

impl DesktopHost {
    fn resolve(&self, path: &str) -> PathBuf {
        let p = PathBuf::from(path);
        if p.is_absolute() {
            return p;
        }
        match &self.base {
            Some(base) => base.join(p),
            None => p,
        }
    }
}

/// What the Python code sees: `data` (dict of input columns), `columns`, `out` (fill it) and `result(name, value)`.
pub const PYTHON_PRELUDE: &str = r#"# MySimulator: the input table is `data` (a dict of column name -> list),
# fill `out` (a dict of column name -> list, a pandas DataFrame or numpy arrays)
# and report single values with result("name", value).
import csv, sys, math
def _cell(v):
    try:
        return float(v)
    except ValueError:
        return v
def _load(path):
    try:
        with open(path, newline='', encoding='utf-8') as f:
            rows = list(csv.reader(f))
    except FileNotFoundError:
        return {}, []
    if not rows:
        return {}, []
    head = rows[0]
    cols = {h: [] for h in head}
    for r in rows[1:]:
        for h, v in zip(head, r):
            cols[h].append(_cell(v))
    return cols, head
data, columns = _load(sys.argv[1])
out = {}
def result(name, value):
    print("@result %s = %r" % (name, float(value)))
# ---- user code ----
"#;

pub const PYTHON_EPILOGUE: &str = r#"
# ---- end of user code ----
def _save(path, table):
    if hasattr(table, 'to_csv'):
        table.to_csv(path, index=False)
        return
    if not table:
        return
    keys = list(table.keys())
    cols = []
    for k in keys:
        v = table[k]
        if not hasattr(v, '__len__') or isinstance(v, str):
            v = [v]
        cols.append(list(v))
    n = max(len(c) for c in cols)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(keys)
        for i in range(n):
            row = []
            for c in cols:
                x = c[i] if i < len(c) else ''
                try:
                    row.append(repr(float(x)))
                except (TypeError, ValueError):
                    row.append(x)
            w.writerow(row)
_save(sys.argv[2], out)
"#;

static COUNTER: AtomicUsize = AtomicUsize::new(0);

/// A fresh folder for one external run, removed when dropped.
struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Result<Scratch, String> {
        let dir = std::env::temp_dir().join(format!("mysimulator-run-{}-{}", std::process::id(), COUNTER.fetch_add(1, Ordering::Relaxed)));
        std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create a work folder: {e}"))?;
        Ok(Scratch(dir))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: no console flashes up for the tool.
        cmd.creation_flags(0x0800_0000);
    }
    let _ = cmd;
}

/// Python on this computer: `py -3`, `python`, `python3` (whichever answers --version).
pub fn find_python() -> Option<Vec<String>> {
    static FOUND: OnceLock<Option<Vec<String>>> = OnceLock::new();
    FOUND
        .get_or_init(|| {
            let candidates: Vec<Vec<&str>> = if cfg!(windows) { vec![vec!["py", "-3"], vec!["python"], vec!["python3"]] } else { vec![vec!["python3"], vec!["python"]] };
            for c in candidates {
                let mut cmd = Command::new(c[0]);
                cmd.args(&c[1..]).arg("--version").stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
                no_window(&mut cmd);
                if let Ok(out) = cmd.output() {
                    let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
                    if out.status.success() && text.contains("Python 3") {
                        return Some(c.iter().map(|s| s.to_string()).collect());
                    }
                }
            }
            None
        })
        .clone()
}

/// Runs the command, enforcing the timeout and the cancel flag.
fn run_process(mut cmd: Command, timeout: f64, cancel: &dyn Fn() -> bool, what: &str) -> Result<(String, String), String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    no_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("{what} could not be started: {e}"))?;
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out_thread = std::thread::spawn(move || {
        let mut s = Vec::new();
        let _ = stdout.read_to_end(&mut s);
        s
    });
    let err_thread = std::thread::spawn(move || {
        let mut s = Vec::new();
        let _ = stderr.read_to_end(&mut s);
        s
    });
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if cancel() {
            let _ = child.kill();
            let _ = child.wait();
            return Err("cancelled".into());
        }
        if started.elapsed().as_secs_f64() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{what} did not finish within {timeout} s (raise the time limit)"));
        }
        std::thread::sleep(Duration::from_millis(15));
    };
    let out = String::from_utf8_lossy(&out_thread.join().unwrap_or_default()).to_string();
    let err = String::from_utf8_lossy(&err_thread.join().unwrap_or_default()).to_string();
    if !status.success() {
        let tail: Vec<&str> = err.lines().rev().take(12).collect::<Vec<_>>().into_iter().rev().collect();
        return Err(format!("{what} failed ({status}):\n{}", if tail.is_empty() { out.trim().to_string() } else { tail.join("\n") }));
    }
    Ok((out, err))
}

impl Host for DesktopHost {
    fn read_file(&self, path: &str) -> Result<String, String> {
        let p = self.resolve(path);
        crate::files::read_text(&p, |_, _| {})
    }

    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let p = self.resolve(path);
        std::fs::read(&p).map_err(|e| format!("cannot read {}: {e}", p.display()))
    }

    fn write_file(&self, path: &str, text: &str) -> Result<(), String> {
        let p = self.resolve(path);
        crate::files::write_with_progress(&p, text.as_bytes(), |_, _| {})
    }

    fn external(&self, call: &ExternalCall, cancel: &dyn Fn() -> bool) -> Result<ExternalOutput, String> {
        let scratch = Scratch::new()?;
        let input = scratch.0.join("in.csv");
        let output = scratch.0.join("out.csv");
        std::fs::write(&input, &call.input_csv).map_err(|e| format!("cannot write the input data: {e}"))?;
        let path_text = |p: &Path| p.to_string_lossy().to_string();
        let (mut cmd, what, reads_out) = if call.kind == "python" {
            let script = scratch.0.join("node.py");
            std::fs::write(&script, format!("{PYTHON_PRELUDE}{}\n{PYTHON_EPILOGUE}", call.code)).map_err(|e| format!("cannot write the script: {e}"))?;
            let interpreter: Vec<String> = if call.program.trim().is_empty() {
                find_python().ok_or("Python 3 was not found (install it, or give the interpreter's path in the node)")?
            } else {
                vec![call.program.trim().to_string()]
            };
            let mut cmd = Command::new(&interpreter[0]);
            cmd.args(&interpreter[1..]).arg("-X").arg("utf8").arg(&script).arg(&input).arg(&output);
            cmd.env("PYTHONIOENCODING", "utf-8");
            (cmd, "Python".to_string(), true)
        } else {
            let uses_out = call.args.iter().any(|a| a.contains("{out}"));
            let mut cmd = Command::new(self.resolve(&call.program).exists().then(|| self.resolve(&call.program)).unwrap_or_else(|| PathBuf::from(&call.program)));
            cmd.args(call.args.iter().map(|a| a.replace("{in}", &path_text(&input)).replace("{out}", &path_text(&output)).replace("{dir}", &path_text(&scratch.0))));
            (cmd, format!("\"{}\"", call.program), uses_out)
        };
        if let Some(base) = &self.base {
            cmd.current_dir(base);
        }
        let (stdout, stderr) = run_process(cmd, call.timeout_s, cancel, &what)?;
        if reads_out {
            let csv = if output.exists() { std::fs::read_to_string(&output).map_err(|e| format!("cannot read the result: {e}"))? } else { String::new() };
            Ok(ExternalOutput { csv, stdout, stderr })
        } else {
            // Without {out} the program's standard output is the table.
            Ok(ExternalOutput { csv: stdout, stdout: String::new(), stderr })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_reads_stdout_as_table() {
        let host = DesktopHost { base: None };
        let (program, args) = if cfg!(windows) {
            ("cmd".to_string(), vec!["/C".to_string(), "echo a,b& echo 1,2".to_string()])
        } else {
            ("sh".to_string(), vec!["-c".to_string(), "printf 'a,b\\n1,2\\n'".to_string()])
        };
        let call = ExternalCall { kind: "command".into(), program, args, code: String::new(), input_csv: String::new(), timeout_s: 20.0 };
        let out = host.external(&call, &|| false).unwrap();
        assert!(out.csv.contains("a,b") && out.csv.contains("1,2"), "{:?}", out.csv);
    }

    #[test]
    fn timeout_kills_the_program() {
        let host = DesktopHost { base: None };
        let (program, args) = if cfg!(windows) {
            ("powershell".to_string(), vec!["-NoProfile".to_string(), "-Command".to_string(), "Start-Sleep -Seconds 20".to_string()])
        } else {
            ("sleep".to_string(), vec!["20".to_string()])
        };
        let call = ExternalCall { kind: "command".into(), program, args, code: String::new(), input_csv: String::new(), timeout_s: 0.5 };
        let started = Instant::now();
        let err = host.external(&call, &|| false).unwrap_err();
        assert!(err.contains("did not finish"), "{err}");
        assert!(started.elapsed().as_secs_f64() < 10.0);
    }

    #[test]
    fn python_round_trip_when_installed() {
        if find_python().is_none() {
            // No Python on this computer: nothing to check (the error message is covered by the engine tests).
            return;
        }
        let host = DesktopHost { base: None };
        let call = ExternalCall {
            kind: "python".into(),
            program: String::new(),
            args: Vec::new(),
            code: "out['s'] = [a + b for a, b in zip(data['a'], data['b'])]\nresult('n', len(columns))\nprint('hi')".into(),
            input_csv: "a,b\n1,2\n3,4\n".into(),
            timeout_s: 60.0,
        };
        let out = host.external(&call, &|| false).unwrap();
        assert!(out.csv.starts_with("s\n3.0\n7.0") || out.csv.starts_with("s\r\n3.0\r\n7.0"), "{:?}", out.csv);
        assert!(out.stdout.contains("@result n = 2.0") && out.stdout.contains("hi"), "{:?}", out.stdout);
    }
}
