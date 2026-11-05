// The compiler for native runs on Windows: a private copy that belongs to this app. It lives in one
// folder of its own, nothing outside it changes (no PATH, no registry, no system package), and the
// uninstaller deletes it (windows/hooks.nsh). Only the files a C build with SDL2 needs are unpacked.
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

pub const GCC_VERSION: &str = "16.2.0";
pub const CMAKE_VERSION: &str = "4.4.3";
pub const NINJA_VERSION: &str = "1.13.2";
pub const SDL_VERSION: &str = "2.32.10";

const COMPLETE: &str = "complete.txt";
const ATTEMPTS: u32 = 3;
const USER_AGENT: &str = "MyLVGLStudio";
const INSTALLED_MEGABYTES: u32 = 410;
const PROGRESS_EVERY: Duration = Duration::from_millis(150);
/// A connection that has gone quiet is given up on and tried again, rather than waited for forever.
const QUIET_LIMIT: Duration = Duration::from_secs(30);

struct Archive {
    name: &'static str,
    url: &'static str,
    sha256: &'static str,
    megabytes: u32,
    folder: &'static str,
    keep: fn(&str) -> Option<String>,
}

/// Fixed versions, checked against their published SHA-256, so every PC builds with the same tools.
const ARCHIVES: [Archive; 2] = [
    Archive {
        name: "GCC, CMake, Ninja (WinLibs)",
        url: "https://github.com/brechtsanders/winlibs_mingw/releases/download/16.2.0posix-14.0.0-ucrt-r2/winlibs-x86_64-posix-seh-gcc-16.2.0-mingw-w64ucrt-14.0.0-r2.zip",
        sha256: "d5dbafc4a170e762ca6143151ec918fb9e2c72736fb14cd704abebc6bdd5276a",
        megabytes: 274,
        folder: "mingw64",
        keep: keep_compiler,
    },
    Archive {
        name: "SDL2",
        url: "https://github.com/libsdl-org/SDL/releases/download/release-2.32.10/SDL2-devel-2.32.10-mingw.zip",
        sha256: "f15cff5fca62ec9381a016ef1d42a95c638cd72d2f226ba5781c76fe43dbd1ac",
        megabytes: 15,
        folder: "sdl2",
        keep: keep_sdl,
    },
];

const BIN_PROGRAMS: [&str; 16] = ["gcc", "ar", "as", "ld", "nm", "ranlib", "strip", "objcopy", "objdump", "windres", "dlltool", "gcc-ar", "gcc-nm", "gcc-ranlib", "cmake", "ninja"];
const TARGET_PROGRAMS: [&str; 9] = ["ar", "as", "ld", "nm", "ranlib", "strip", "objcopy", "objdump", "dlltool"];
/// What the programs above import, read from the import tables of this archive.
const BIN_DLLS: [&str; 35] = [
    "libarchive-13", "libb2-1", "libbrotlicommon", "libbrotlidec", "libbz2", "libcurl-4", "libdl", "libexpat-1", "libgcc_s_seh-1", "libgcrypt-20",
    "libgmp-10", "libgnutls-30", "libgomp-1", "libgpg-error-0", "libgss-3", "libhogweed-6", "libiconv-2", "libidn-12", "libidn2-0", "libintl-8",
    "liblz4", "liblzma-5", "liblzo2-2", "libnettle-8", "libpsl-5", "librhash", "libshishi-0", "libssh2-1", "libstdc++-6", "libtasn1-6",
    "libunistring-5", "libuv-1", "libwinpthread-1", "libzstd", "zlib1",
];

/// The place inside the private folder of a file of the compiler archive, if it is needed.
/// C only: C++, Fortran, Objective-C, the debugger, Python and the documentation stay out.
fn keep_compiler(path: &str) -> Option<String> {
    let inner = path.strip_prefix("mingw64/")?;
    let other_language = ["libgfortran", "libobjc", "libstdc++", "libsupc++", "/c++/", "/finclude/", "/adainclude/", "/adalib/"].iter().any(|word| inner.contains(word));
    let keep = if let Some(file) = inner.strip_prefix("bin/") {
        file.strip_suffix(".exe").is_some_and(|name| BIN_PROGRAMS.contains(&name)) || file.strip_suffix(".dll").is_some_and(|name| BIN_DLLS.contains(&name))
    } else if let Some(file) = inner.strip_prefix("x86_64-w64-mingw32/bin/") {
        file.strip_suffix(".exe").is_some_and(|name| TARGET_PROGRAMS.contains(&name))
    } else if inner.starts_with("share/cmake-") {
        !inner.contains("/Help/")
    } else if inner.starts_with("libexec/") {
        ["/cc1.exe", "/collect2.exe", "/lto-wrapper.exe"].iter().any(|end| inner.ends_with(end)) || inner.ends_with(".dll")
    } else if inner.starts_with("lib/gcc/") {
        !other_language && !inner.contains("/plugin/") && !inner.contains("/install-tools/")
    } else if inner.starts_with("x86_64-w64-mingw32/include/") || inner.starts_with("x86_64-w64-mingw32/lib/") {
        !other_language
    } else {
        false
    };
    keep.then(|| inner.to_string())
}

/// The 64-bit SDL2: its DLL, headers, link libraries and the CMake description of them.
fn keep_sdl(path: &str) -> Option<String> {
    let (_, inner) = path.split_once("/x86_64-w64-mingw32/")?;
    let keep = inner == "bin/SDL2.dll" || inner.starts_with("include/SDL2/") || inner.starts_with("lib/cmake/SDL2/") || inner == "lib/libSDL2.a" || inner == "lib/libSDL2.dll.a" || inner == "lib/libSDL2main.a";
    keep.then(|| inner.to_string())
}

/// %LOCALAPPDATA%\MyLVGLStudio\toolchain; a run with its own data folder keeps it there.
pub fn dir() -> PathBuf {
    if std::env::var_os("MLS_SETTINGS_DIR").is_some() {
        return crate::data_dir().join("toolchain");
    }
    PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".into())).join(crate::SETTINGS_FOLDER).join("toolchain")
}

/// True once everything is unpacked: the folder gets its name only at the very end.
pub fn ready() -> bool {
    dir().join(COMPLETE).is_file()
}

pub fn sdl_dir() -> PathBuf {
    dir().join("sdl2")
}

/// The folders a build needs on PATH, in front of Windows' own.
pub fn path_dirs() -> Vec<PathBuf> {
    vec![dir().join("mingw64").join("bin"), sdl_dir().join("bin")]
}

/// What will be installed and where, shown before a confirmation.
pub fn plan() -> Vec<String> {
    let mut lines: Vec<String> = ARCHIVES.iter().map(|archive| format!("{} ({} MB)", archive.name, archive.megabytes)).collect();
    lines.push(dir().display().to_string());
    lines
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// What the progress window needs: the bytes or files of one archive, as they happen.
fn progress(app: &AppHandle, phase: &str, item: usize, done: u64, total: u64) {
    let _ = app.emit("tools-progress", json!({ "item": item, "phase": phase, "done": done, "total": total }));
}

/// What will be installed, with what each thing is for (the page has the words for that).
pub fn items() -> Value {
    let parts = |list: &[(&str, &str)]| list.iter().map(|(id, version)| json!({ "id": id, "version": version })).collect::<Vec<_>>();
    json!({
        "dir": dir().display().to_string(),
        "installedMegabytes": INSTALLED_MEGABYTES,
        "items": [
            { "id": ARCHIVES[0].folder, "megabytes": ARCHIVES[0].megabytes, "parts": parts(&[("gcc", GCC_VERSION), ("cmake", CMAKE_VERSION), ("ninja", NINJA_VERSION)]) },
            { "id": ARCHIVES[1].folder, "megabytes": ARCHIVES[1].megabytes, "parts": parts(&[("sdl2", SDL_VERSION)]) },
        ],
    })
}

fn download(app: &AppHandle, stopped: &AtomicBool, part: usize, archive: &Archive, target: &Path) -> Result<(), String> {
    progress(app, "download", part, 0, 0);
    let agent = ureq::AgentBuilder::new().timeout_connect(QUIET_LIMIT).timeout_read(QUIET_LIMIT).build();
    let response = agent.get(archive.url).set("User-Agent", USER_AGENT).call().map_err(|e| e.to_string())?;
    let total: u64 = response.header("Content-Length").and_then(|value| value.parse().ok()).unwrap_or(0);
    let mut reader = response.into_reader();
    let mut file = fs::File::create(target).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 256 * 1024];
    let mut received = 0u64;
    let mut told = Instant::now();
    progress(app, "download", part, 0, total);
    loop {
        if stopped.load(Ordering::SeqCst) {
            return Err("stopped".into());
        }
        let count = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        file.write_all(&buffer[..count]).map_err(|e| e.to_string())?;
        hasher.update(&buffer[..count]);
        received += count as u64;
        if told.elapsed() >= PROGRESS_EVERY {
            told = Instant::now();
            progress(app, "download", part, received, total);
        }
    }
    let actual = hex(&hasher.finalize());
    if actual != archive.sha256 {
        return Err(format!("{}: the download is damaged (SHA-256 {actual})", archive.name));
    }
    Ok(())
}

/// Unpacks only what `keep` wants, and returns how many files that was.
fn unpack(app: &AppHandle, stopped: &AtomicBool, part: usize, archive: &Archive, file: &Path, target: &Path) -> Result<usize, String> {
    progress(app, "unpack", part, 0, 1);
    let source = fs::File::open(file).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(source).map_err(|e| e.to_string())?;
    let total = zip.len();
    let mut written = 0;
    let mut told = Instant::now();
    for index in 0..total {
        if stopped.load(Ordering::SeqCst) {
            return Err("stopped".into());
        }
        // By the clock: most entries of an archive are passed over, some big ones take a while.
        if told.elapsed() >= PROGRESS_EVERY {
            told = Instant::now();
            progress(app, "unpack", part, index as u64, total as u64);
        }
        let mut entry = zip.by_index(index).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        // enclosed_name refuses paths that would leave the target folder.
        let Some(path) = entry.enclosed_name() else { continue };
        let name = path.to_string_lossy().replace('\\', "/");
        let Some(relative) = (archive.keep)(&name) else { continue };
        let output = target.join(relative);
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = fs::File::create(&output).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        written += 1;
    }
    Ok(written)
}

/// Installs everything. The folder appears under its own name only when complete, so an interrupted
/// install never looks like a finished one and the next start simply tries again.
pub fn install(app: &AppHandle, stopped: &AtomicBool) -> Result<(), String> {
    let root = dir();
    let partial = root.with_file_name("toolchain.partial");
    if partial.exists() {
        fs::remove_dir_all(&partial).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&partial).map_err(|e| e.to_string())?;
    let result = install_into(app, stopped, &partial).and_then(|()| {
        if root.exists() {
            fs::remove_dir_all(&root).map_err(|e| e.to_string())?;
        }
        fs::rename(&partial, &root).map_err(|e| e.to_string())
    });
    if result.is_err() {
        let _ = fs::remove_dir_all(&partial);
    }
    result
}

fn install_into(app: &AppHandle, stopped: &AtomicBool, partial: &Path) -> Result<(), String> {
    for (part, archive) in ARCHIVES.iter().enumerate() {
        crate::native::emit_line(app, "build", &format!("Downloading {} ({} MB)", archive.name, archive.megabytes));
        let file = partial.join(format!("{}.zip", archive.folder));
        let mut outcome = Err(String::new());
        for attempt in 1..=ATTEMPTS {
            outcome = download(app, stopped, part, archive, &file);
            if outcome.is_ok() || stopped.load(Ordering::SeqCst) {
                break;
            }
            if let Err(message) = &outcome {
                crate::native::emit_line(app, "build", &format!("Download failed ({attempt}/{ATTEMPTS}): {message}"));
            }
        }
        outcome?;
        crate::native::emit_line(app, "build", &format!("Unpacking {}", archive.name));
        let written = unpack(app, stopped, part, archive, &file, &partial.join(archive.folder))?;
        crate::native::emit_line(app, "build", &format!("{written} files"));
        fs::remove_file(&file).map_err(|e| e.to_string())?;
        progress(app, "done", part, 1, 1);
    }
    fs::write(partial.join(COMPLETE), format!("gcc {GCC_VERSION}\ncmake {CMAKE_VERSION}\nninja {NINJA_VERSION}\nsdl2 {SDL_VERSION}\n")).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_compiler_keeps_what_a_c_build_needs() {
        for path in [
            "mingw64/bin/gcc.exe",
            "mingw64/bin/cmake.exe",
            "mingw64/bin/ninja.exe",
            "mingw64/bin/libwinpthread-1.dll",
            "mingw64/share/cmake-4.4/Modules/CMakeCCompiler.cmake.in",
            "mingw64/libexec/gcc/x86_64-w64-mingw32/16.2.0/cc1.exe",
            "mingw64/libexec/gcc/x86_64-w64-mingw32/16.2.0/liblto_plugin.dll",
            "mingw64/lib/gcc/x86_64-w64-mingw32/16.2.0/libgcc.a",
            "mingw64/x86_64-w64-mingw32/include/windows.h",
            "mingw64/x86_64-w64-mingw32/lib/libkernel32.a",
            "mingw64/x86_64-w64-mingw32/bin/ld.exe",
        ] {
            assert!(keep_compiler(path).is_some(), "{path}");
        }
    }

    #[test]
    fn the_compiler_leaves_out_everything_else() {
        for path in [
            "mingw64/bin/gdb.exe",
            "mingw64/bin/g++.exe",
            "mingw64/bin/doxygen.exe",
            "mingw64/bin/libpython3.9.dll",
            "mingw64/share/cmake-4.4/Help/index.rst",
            "mingw64/share/doc/readme.txt",
            "mingw64/libexec/gcc/x86_64-w64-mingw32/16.2.0/cc1plus.exe",
            "mingw64/libexec/gcc/x86_64-w64-mingw32/16.2.0/f951.exe",
            "mingw64/lib/gcc/x86_64-w64-mingw32/16.2.0/libgfortran.a",
            "mingw64/x86_64-w64-mingw32/include/c++/16.2.0/vector",
            "mingw64/x86_64-w64-mingw32/lib/libstdc++.a",
            "other/bin/gcc.exe",
        ] {
            assert!(keep_compiler(path).is_none(), "{path}");
        }
    }

    #[test]
    fn sdl_keeps_only_the_64_bit_files_for_linking_and_running() {
        assert_eq!(keep_sdl("SDL2-2.32.10/x86_64-w64-mingw32/bin/SDL2.dll").as_deref(), Some("bin/SDL2.dll"));
        assert_eq!(keep_sdl("SDL2-2.32.10/x86_64-w64-mingw32/include/SDL2/SDL.h").as_deref(), Some("include/SDL2/SDL.h"));
        assert_eq!(keep_sdl("SDL2-2.32.10/x86_64-w64-mingw32/lib/cmake/SDL2/sdl2-config.cmake").as_deref(), Some("lib/cmake/SDL2/sdl2-config.cmake"));
        assert!(keep_sdl("SDL2-2.32.10/i686-w64-mingw32/bin/SDL2.dll").is_none());
        assert!(keep_sdl("SDL2-2.32.10/docs/README.md").is_none());
    }
}
