// No console window next to the installed app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mypaint_lib::run();
}
