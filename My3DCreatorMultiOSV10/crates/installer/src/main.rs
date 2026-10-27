use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

static APP_BINARY: &[u8] = include_bytes!("../../../target/release/my-3d-creator.exe");

fn main() {
    println!("====================================================");
    println!("       Omni3D Studio Setup Wizard v0.1.0           ");
    println!("  Universal 3D Modeling, CAD & Sculpting Suite      ");
    println!("====================================================");
    println!();

    // Try LOCALAPPDATA, otherwise fallback to local directory
    let mut target_dir = PathBuf::from("Omni3DStudio");
    if let Ok(app_data) = env::var("LOCALAPPDATA") {
        let candidate = PathBuf::from(app_data).join("Omni3DStudio");
        if fs::create_dir_all(&candidate).is_ok() {
            target_dir = candidate;
        }
    }

    if !target_dir.is_absolute() {
        if let Ok(curr) = env::current_dir() {
            target_dir = curr.join(&target_dir);
        }
    }

    if let Err(e) = fs::create_dir_all(&target_dir) {
        eprintln!("[!] Warning: Could not create dir {:?}: {}", target_dir, e);
    }

    println!("[*] Installing to: {}", target_dir.display());

    let exe_path = target_dir.join("omni3d-studio.exe");
    println!("[*] Extracting Omni3D Studio Engine...");
    if let Err(e) = fs::write(&exe_path, APP_BINARY) {
        eprintln!("[!] Failed to extract executable: {}", e);
        return;
    }

    println!("[*] Registering application environment...");

    // Create desktop launcher batch script if desktop exists
    if let Ok(user_profile) = env::var("USERPROFILE") {
        let desktop = PathBuf::from(user_profile).join("Desktop");
        if desktop.exists() {
            let shortcut_cmd = desktop.join("Omni3D Studio.cmd");
            let cmd_content = format!("@echo off\r\nstart \"\" \"{}\"\r\n", exe_path.display());
            let _ = fs::write(shortcut_cmd, cmd_content);
            println!("[*] Desktop shortcut created.");
        }
    }

    println!();
    println!("====================================================");
    println!("      Omni3D Studio installed successfully!         ");
    println!("====================================================");
    println!();
    println!("[>] Launching Omni3D Studio Engine...");

    let _ = Command::new(&exe_path).status();
}
