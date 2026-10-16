// macOS 와 Linux. Finder 나 리눅스 데스크톱의 아이콘 좌표를 바꾸는 공개 길이 없다
// (Electron 판 src/main/desktop/darwin.js, linux.js). 박스는 바탕화면 위의 진짜 창이고,
// 안의 아이콘은 Desktop 폴더의 파일이다. 나머지는 트레이트의 기본값(아무 일도 하지 않음)을 쓴다.

use super::Desktop;

pub struct OtherDesktop;

impl Desktop for OtherDesktop {}
