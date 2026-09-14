//! build.rs - 탐색기·작업 표시줄에 아이콘이 보이게 한다.

#[path = "../../scripts/windows_icon.rs"]
mod windows_icon;

fn main() {
    windows_icon::embed(
        "chunjiin.exe",
        "천지인 한글 입력기",
        "천지인 한글 입력기",
    );
}
