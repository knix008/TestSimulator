// Installed builds start without a console window next to the tray icon.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  mymemopad_lib::run();
}
