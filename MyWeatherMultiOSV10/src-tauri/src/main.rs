// No console window next to the tray icon in a release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  myweather_lib::run();
}
