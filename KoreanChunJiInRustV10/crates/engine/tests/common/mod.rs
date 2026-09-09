//! 시험이 함께 쓰는 키 시퀀스 실행기.

use chunjiin_engine::{InputMode, State};

/// 키 시퀀스 문자열을 그대로 실행한다.
///
/// ```text
/// 0~9   키 0~9            a  키 10 (ㅇㅁ)      b  키 11 (? !)
/// _     스페이스          <  백스페이스        |  연타 순환 끊기
/// !     조합 확정         ~  전체 지우기       /  줄바꿈
/// [ ]   커서 왼쪽/오른쪽  {  맨 앞으로         }  맨 뒤로
/// H E U N S              모드: 한글/영소/영대/숫자/기호
/// M     모드 순환
/// ```
///
/// 그 밖의 문자(공백 등)는 무시하므로 긴 시퀀스를 띄어 읽기 좋게 적어도 된다.
pub fn run_keys(s: &mut State, seq: &str) {
    for c in seq.chars() {
        match c {
            'a' => s.key(10),
            'b' => s.key(11),
            '_' => s.space(),
            '<' => s.backspace(),
            '|' => s.break_multitap(),
            '!' => s.commit(),
            '~' => s.clear(),
            '/' => s.insert_char('\n'),
            '[' => s.move_cursor(-1),
            ']' => s.move_cursor(1),
            '{' => s.set_cursor(0),
            '}' => s.set_cursor(s.len()),
            'H' => s.set_mode(InputMode::Hangul),
            'E' => s.set_mode(InputMode::English),
            'U' => s.set_mode(InputMode::UpperEnglish),
            'N' => s.set_mode(InputMode::Number),
            'S' => s.set_mode(InputMode::Special),
            'M' => s.cycle_mode(),
            '0'..='9' => s.key(c as i32 - '0' as i32),
            _ => {}
        }
    }
}
