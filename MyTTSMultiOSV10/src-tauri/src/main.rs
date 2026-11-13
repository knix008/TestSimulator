// No console window next to the program in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tts_multios_lib::run()
}
