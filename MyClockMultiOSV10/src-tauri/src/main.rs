// 설치본에서는 트레이 아이콘 옆에 콘솔 창을 띄우지 않는다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  myclock_lib::run();
}
