// No console window next to the installed app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  myebookreader_lib::run();
}
