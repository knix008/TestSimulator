//! Compiles every translated MATLAB example when a MinGW g++ is on the machine
//! and checks the simulation the GUI will plot.

use serde_json::Value;
use sim_core::mlang::cppgen::{self, HEADER, RUNTIME};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn mingw() -> Option<PathBuf> {
    let candidates = [
        r"C:\Msys64\ucrt64\bin\g++.exe",
        r"C:\msys64\ucrt64\bin\g++.exe",
        r"C:\Msys64\mingw64\bin\g++.exe",
        r"C:\msys64\mingw64\bin\g++.exe",
    ];
    candidates.iter().map(PathBuf::from).find(|p| p.exists()).or_else(|| {
        std::env::var_os("PATH").and_then(|path| {
            std::env::split_paths(&path).find_map(|dir| {
                let exe = dir.join("g++.exe");
                if !exe.exists() {
                    return None;
                }
                let out = Command::new(&exe).arg("-dumpmachine").output().ok()?;
                let machine = String::from_utf8_lossy(&out.stdout);
                machine.to_ascii_lowercase().contains("mingw").then_some(exe)
            })
        })
    })
}

fn scalar(v: &Value, name: &str) -> f64 {
    v["scalars"].as_array().and_then(|a| a.iter().find(|s| s["name"] == name)).and_then(|s| s["value"].as_f64()).unwrap_or_else(|| panic!("{name} missing in {v}"))
}

#[test]
fn examples_compile_and_simulate() {
    let Some(gxx) = mingw() else {
        eprintln!("no MinGW g++ — skipped");
        return;
    };
    let root = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let dir = root.join("cpp-examples");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("msim.hpp"), HEADER).unwrap();
    fs::write(dir.join("msim.cpp"), RUNTIME).unwrap();
    let obj = dir.join("msim.o");
    let status = Command::new(&gxx).args(["-std=c++17", "-O1", "-c", "msim.cpp", "-o"]).arg(&obj).current_dir(&dir).output().unwrap();
    assert!(status.status.success(), "runtime compile\n{}", String::from_utf8_lossy(&status.stderr));
    let path_env = format!("{};{}", gxx.parent().unwrap().display(), std::env::var("PATH").unwrap_or_default());
    for (name, code) in cppgen::examples() {
        let cpp = cppgen::generate(code, 1).unwrap();
        fs::write(dir.join("main.cpp"), &cpp).unwrap();
        let exe = dir.join(format!("{name}.exe"));
        let status = Command::new(&gxx).args(["-std=c++17", "-O1", "main.cpp"]).arg(&obj).arg("-o").arg(&exe).current_dir(&dir).output().unwrap();
        assert!(status.status.success(), "{name} compile\n{}\n{}", String::from_utf8_lossy(&status.stderr), cpp);
        let result = dir.join(format!("{name}.json"));
        let status = Command::new(&exe).arg(&result).current_dir(&dir).env("PATH", &path_env).output().unwrap();
        let body = fs::read_to_string(&result).unwrap_or_default();
        assert!(status.status.success(), "{name} run\n{body}\n{}", String::from_utf8_lossy(&status.stderr));
        let v: Value = serde_json::from_str(&body).unwrap_or_else(|e| panic!("{name} json {e}: {body}"));
        assert_eq!(v["ok"], true, "{name}: {body}");
        check(name, &v);
    }
    let _ = Path::new(".");
}

fn check(name: &str, v: &Value) {
    match name {
        "basics" => {
            assert!(scalar(v, "residual").abs() < 1e-6, "{v}");
            assert!(scalar(v, "condition") > 1.0, "{v}");
            assert!(v["text"].as_str().unwrap_or("").contains("det(A)"), "{v}");
        }
        "ode" => {
            let period = scalar(v, "period_estimate");
            assert!((5.0..12.0).contains(&period), "period {period}");
            assert!(!v["series"][0]["lines"].as_array().unwrap().is_empty());
        }
        "signal" => {
            let peak = scalar(v, "peak_Hz");
            assert!((48.0..52.0).contains(&peak), "peak {peak}");
            let lines = v["series"][0]["lines"].as_array().unwrap();
            assert_eq!(lines.len(), 2);
        }
        "fit" => {
            let area = scalar(v, "area");
            assert!((150.0..260.0).contains(&area), "area {area}");
            assert!(v["series"][0]["lines"].as_array().unwrap().len() >= 2);
        }
        "control" => {
            let lines = v["series"][0]["lines"].as_array().unwrap();
            assert_eq!(lines.len(), 2);
            let pos = lines[0]["y"].as_array().unwrap();
            let last = pos.last().unwrap().as_f64().unwrap();
            assert!(last.abs() < 0.3, "did not settle: {last}");
        }
        "surface" => {
            assert!(scalar(v, "zmax") > 5.0, "{v}");
            assert!(v["grids"][0]["z"].as_array().unwrap().len() > 100);
        }
        "table" => assert!(v["text"].as_str().unwrap_or("").contains('t'), "{v}"),
        "damped" => {
            let peak = scalar(v, "peak");
            assert!((0.0..1.0).contains(&peak), "peak {peak}");
            assert!(!v["series"][0]["lines"].as_array().unwrap().is_empty());
        }
        _ => {}
    }
}
