// The installed dock opens no console window beside its tray icon.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  mydockbar_lib::run();
}
