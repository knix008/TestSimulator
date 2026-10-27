// Installed builds start without a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  myvideoplayer_lib::run();
}
