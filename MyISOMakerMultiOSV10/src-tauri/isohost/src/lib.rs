//! MyISOMaker's engine, in Rust: everything that reads or writes images and the tools around
//! them. The Tauri program calls `Host::call` with the page's channel names (the ones the
//! Electron build used); `isomaker-host` (src/main.rs) serves the same calls over stdin/stdout
//! for the tests.
//!
//!   session:*      the open image: ISO / IMG / AppImage / Docker tar — edit, save, export
//!   iso:*          create (xorriso), bootable, extract, AppImage from a folder, mount, list
//!   pkg:*          xorriso / squashfs-tools: status, install, reinstall, remove
//!   fs:*           the left explorer
//!   paths:*        the folder the dialogs remember
//!   engine:info    which xorriso is used
//!
//! Events (job:progress, pkg:progress) go out through the `emit` callback.

pub mod appimage;
pub mod archive;
pub mod fsx;
pub mod iso_read;
pub mod iso_write;
pub mod mount;
pub mod packages;
pub mod paths;
pub mod session;
pub mod squashfs;
pub mod tree;
pub mod util;
pub mod xorriso;

use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use util::*;

pub use paths::Config;

pub type Emit = Arc<dyn Fn(&str, Value) + Send + Sync>;

pub struct Host {
    emit: Emit,
    session: Mutex<session::Session>,
    /// The running image job (create / extract / save), for iso:cancel.
    job: Mutex<Option<Cancel>>,
    pkg_job: Mutex<Option<Cancel>>,
}

fn arg<'a>(a: &'a [Value], i: usize) -> &'a Value {
    a.get(i).unwrap_or(&Value::Null)
}
fn s(a: &[Value], i: usize) -> Res<String> {
    arg(a, i).as_str().map(String::from).ok_or_else(|| format!("argument {} must be text", i + 1))
}
fn s_opt(a: &[Value], i: usize) -> Option<String> {
    arg(a, i).as_str().map(String::from)
}
fn list(a: &[Value], i: usize) -> Res<Vec<String>> {
    arg(a, i)
        .as_array()
        .map(|v| v.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .ok_or_else(|| format!("argument {} must be a list", i + 1))
}

impl Host {
    pub fn new(config: Config, emit: Emit) -> Arc<Host> {
        paths::set_config(config);
        Arc::new(Host { emit, session: Mutex::new(session::Session::default()), job: Mutex::new(None), pkg_job: Mutex::new(None) })
    }

    fn progress(&self, phase: &str, percent: Option<f64>, message: &str) {
        (self.emit)("job:progress", progress_value(phase, percent, message));
    }

    /// One job at a time (the page shows one progress bar).
    fn job<T>(&self, f: impl FnOnce(&Cancel) -> Res<T>) -> Res<T> {
        let c = {
            let mut j = self.job.lock().unwrap();
            if j.is_some() {
                return err("A job is already running");
            }
            let c = Cancel::new();
            *j = Some(c.clone());
            c
        };
        let r = f(&c);
        *self.job.lock().unwrap() = None;
        r
    }

    fn session(&self) -> std::sync::MutexGuard<'_, session::Session> {
        self.session.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// A page call. Blocking: run it off the UI thread.
    pub fn call(&self, method: &str, a: &[Value]) -> Res<Value> {
        let progress = |phase: &str, pct: Option<f64>, msg: &str| self.progress(phase, pct, msg);
        let ok = || json!({ "ok": true });
        match method {
            "engine:info" => Ok(xorriso::engine_info()),
            "paths:dialogDefault" => Ok(paths::dialog_default_path(s_opt(a, 0).as_deref(), s_opt(a, 1).as_deref()).map(Value::String).unwrap_or(Value::Null)),
            "paths:remember" => {
                if let Some(p) = s_opt(a, 0).filter(|p| !p.is_empty()) {
                    paths::remember_path(&p);
                }
                Ok(ok())
            }
            "iso:extract" => self.job(|c| xorriso::extract(arg(a, 0), &progress, c)).map(|_| ok()),
            "iso:create" => self.job(|c| xorriso::create(arg(a, 0), &progress, c)).map(|_| ok()),
            "iso:createBootable" => self.job(|c| xorriso::create_bootable(arg(a, 0), &progress, c)).map(|_| ok()),
            "iso:createAppImage" => {
                let opts = arg(a, 0);
                self.job(|c| {
                    progress("appimage", Some(5.0), "AppImage runtime…");
                    let n = std::sync::atomic::AtomicUsize::new(0);
                    let mut r = appimage::create(opts, &|p| {
                        if n.fetch_add(1, std::sync::atomic::Ordering::SeqCst) % 20 == 19 {
                            progress("appimage", None, p);
                        }
                    }, c)?;
                    progress("appimage", Some(100.0), opts.get("output").and_then(Value::as_str).unwrap_or_default());
                    r["ok"] = json!(true);
                    Ok(r)
                })
            }
            "iso:cancel" => {
                let j = self.job.lock().unwrap().clone();
                match j {
                    Some(c) => {
                        c.set();
                        self.progress("cancel", None, "Canceling job…");
                        Ok(json!({ "ok": true, "canceled": true }))
                    }
                    None => Ok(json!({ "ok": true, "canceled": false })),
                }
            }
            "iso:mount" => Ok(mount::mount(&s(a, 0)?)),
            "iso:unmount" => Ok(mount::unmount(&s(a, 0)?)),
            "iso:listTree" => session::list_tree(&s(a, 0)?),

            "session:open" => self.session().open(&s(a, 0)?),
            "session:get" => Ok(self.session().snapshot()),
            "session:sourcePath" => Ok(self.session().source_path()),
            "session:isDirty" => Ok(json!({ "dirty": self.session().is_dirty() })),
            "session:close" => {
                self.session().close();
                Ok(ok())
            }
            "session:addPaths" => self.session().add_paths(&s(a, 0).unwrap_or_default(), &list(a, 1)?),
            "session:remove" => self.session().remove(&s(a, 0)?),
            "session:removeMany" => self.session().remove_many(&list(a, 0)?),
            "session:mkdir" => self.session().mkdir(&s(a, 0).unwrap_or_default(), &s(a, 1)?),
            "session:rename" => self.session().rename(&s(a, 0)?, &s(a, 1)?),
            "session:exportFile" => self.session().export_file(&s(a, 0)?, &s(a, 1)?),
            "session:exportFilesToDir" => self.session().export_files_to_dir(&list(a, 0)?, &s(a, 1)?),
            "session:prepareDragOut" => self.session().prepare_drag_out(&s(a, 0)?),
            "session:prepareDragOutMany" => self.session().prepare_drag_out_many(&list(a, 0)?),
            "session:save" => {
                let out = s(a, 0)?;
                let snap = self.job(|c| self.session().save(&out, &progress, c))?;
                paths::remember_path(&out);
                Ok(snap)
            }

            "pkg:status" => Ok(packages::status()),
            "pkg:missingRequired" => Ok(packages::missing_required()),
            "pkg:run" => {
                let (id, action) = (s(a, 0)?, s(a, 1)?);
                let c = {
                    let mut j = self.pkg_job.lock().unwrap();
                    if j.is_some() {
                        return err("A package job is already running");
                    }
                    let c = Cancel::new();
                    *j = Some(c.clone());
                    c
                };
                let emit = self.emit.clone();
                let r = packages::run_job(&id, &action, &c, &move |v| emit("pkg:progress", v));
                *self.pkg_job.lock().unwrap() = None;
                r
            }
            "pkg:cancel" => {
                let j = self.pkg_job.lock().unwrap().clone();
                if let Some(c) = &j {
                    c.set();
                }
                Ok(json!({ "canceled": j.is_some() }))
            }

            "fs:places" => Ok(fsx::places()),
            "fs:list" => fsx::list(&s(a, 0)?),
            "fs:stat" => Ok(fsx::stat(&s(a, 0)?)),
            _ => err(format!("unknown channel: {method}")),
        }
    }

    /// The program is closing: drop the session's temp files.
    pub fn shutdown(&self) {
        if let Some(c) = self.job.lock().unwrap().as_ref() {
            c.set();
        }
        if let Some(c) = self.pkg_job.lock().unwrap().as_ref() {
            c.set();
        }
        if let Ok(mut s) = self.session.try_lock() {
            s.close();
        }
    }
}
