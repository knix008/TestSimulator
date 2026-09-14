//! help.rs - 사용법 본문. 한국어와 영어 두 벌이다.
//!
//! 한국어 본문은 KoreanChunJiInC++ 의 main.c `HELP_TEXT` 를 옮긴 것이다.
//! 자판 그림과 모음 조합표의 칸이 맞아야 하므로 줄 모양을 그대로 지킨다.
//! 그래서 이스케이프가 없는 날 문자열(`r#"..."#`)로 둔다.

/// 한국어 사용법.
pub const HELP_KO: &str = r#"[ 키패드 ]

    ㅣ      ·      ㅡ
    ㄱㅋ   ㄴㄹ   ㄷㅌ
    ㅂㅍ   ㅅㅎ   ㅈㅊ
    . ,    ㅇㅁ   ? !


[ 모음 ]

  ㅣ 와 · 와 ㅡ 를 이어서 모든 모음을 만듭니다.

  ㅏ = ㅣ+·        ㅑ = ㅣ+·+·        ㅐ = ㅏ+ㅣ
  ㅓ = ·+ㅣ        ㅕ = ·+·+ㅣ        ㅔ = ㅓ+ㅣ
  ㅗ = ·+ㅡ        ㅛ = ·+·+ㅡ        ㅚ = ㅗ+ㅣ
  ㅜ = ㅡ+·        ㅠ = ㅡ+·+·        ㅟ = ㅜ+ㅣ
  ㅡ = ㅡ          ㅣ = ㅣ            ㅢ = ㅡ+ㅣ
  ㅘ = ㅚ+·        ㅙ = ㅘ+ㅣ         ㅝ = ㅠ+ㅣ


[ 자음 ]

  같은 키를 연달아 누르면 순환합니다.

  ㄱ → ㅋ → ㄲ      ㄷ → ㅌ → ㄸ      ㅂ → ㅍ → ㅃ
  ㅅ → ㅎ → ㅆ      ㅈ → ㅊ → ㅉ      ㄴ → ㄹ      ㅇ → ㅁ

  받침 뒤에 모음을 누르면 자동으로 연음됩니다.   간 + ㅏ → 가나
  겹받침은 자음을 이어 누르면 합쳐집니다.        값 = ㄱ ㅏ ㅂ ㅅ
  첫 타에 안 붙는 겹받침은 한 번 더 누르면 합쳐집니다.   만 → 만ㅅ → 많


[ 같은 키를 연달아 써야 할 때 ]

  "안녕" 처럼 ㄴ 을 두 번 눌러야 하면 사이에 오른쪽 화살표 키를 누르거나
  잠시 기다리세요. 순환이 끊기고 새 글자가 시작됩니다.


[ 물리 키보드 ]

  한글 모드에서 숫자열이 키패드에 대응합니다.

    1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
    4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !

    Space  띄어쓰기          Backspace  한 단계 지우기
    Enter  줄바꿈            Esc        조합 확정
    ← →    커서 이동         Home End   줄 처음 · 끝

    F1  도움말      F2  입력 모드      F3  테마      F4  설정

    Ctrl+N 새로   Ctrl+O 열기   Ctrl+S 저장
    Ctrl+C 복사   Ctrl+V 붙여넣기


[ 영문 · 숫자 · 기호 ]

  모드 버튼(F2)으로 한글, 영문 abc, 영문 ABC, 숫자, 기호 순으로 바뀝니다.
  영문·숫자·기호 모드에서는 물리 키보드로 그냥 타이핑해도 됩니다.

    abc  def  ghi        알파벳 26자가 위 3x3 아홉 키에 들어갑니다.
    jkl  mno  pqr        마지막 줄 세 키는 자주 쓰는 기호입니다.
    stu  vwx  yz         나머지 기호는 기호 모드에 36개가 있습니다.


[ 설정 ]

  설정 > 설정...(F4) 에서 테마, 글꼴 크기, 연타 유지 시간,
  시작 입력 모드, 툴바 · 상태줄 · 컴팩트 모드를 바꿀 수 있습니다.
"#;

/// 영어 사용법.
pub const HELP_EN: &str = r#"[ Keypad ]

    ㅣ      ·      ㅡ
    ㄱㅋ   ㄴㄹ   ㄷㅌ
    ㅂㅍ   ㅅㅎ   ㅈㅊ
    . ,    ㅇㅁ   ? !


[ Vowels ]

  Every vowel is built from ㅣ, · and ㅡ.

  ㅏ = ㅣ+·        ㅑ = ㅣ+·+·        ㅐ = ㅏ+ㅣ
  ㅓ = ·+ㅣ        ㅕ = ·+·+ㅣ        ㅔ = ㅓ+ㅣ
  ㅗ = ·+ㅡ        ㅛ = ·+·+ㅡ        ㅚ = ㅗ+ㅣ
  ㅜ = ㅡ+·        ㅠ = ㅡ+·+·        ㅟ = ㅜ+ㅣ
  ㅡ = ㅡ          ㅣ = ㅣ            ㅢ = ㅡ+ㅣ
  ㅘ = ㅚ+·        ㅙ = ㅘ+ㅣ         ㅝ = ㅠ+ㅣ


[ Consonants ]

  Tapping the same key again cycles through its letters.

  ㄱ → ㅋ → ㄲ      ㄷ → ㅌ → ㄸ      ㅂ → ㅍ → ㅃ
  ㅅ → ㅎ → ㅆ      ㅈ → ㅊ → ㅉ      ㄴ → ㄹ      ㅇ → ㅁ

  A vowel after a final consonant moves it to the next syllable.   간 + ㅏ → 가나
  Two consonants in a row form a cluster where one exists.         값 = ㄱ ㅏ ㅂ ㅅ
  If the first tap does not join, tap once more.                   만 → 만ㅅ → 많


[ Typing the same key twice in a row ]

  For a word like "안녕" you need ㄴ twice. Press the right-arrow key in
  between, or simply wait a moment. The cycle ends and a new letter starts.


[ Physical keyboard ]

  In Hangul mode the number row maps onto the keypad.

    1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
    4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !

    Space  space              Backspace  step back
    Enter  new line           Esc        commit
    ← →    move cursor        Home End   start / end

    F1  guide      F2  input mode      F3  theme      F4  settings

    Ctrl+N new   Ctrl+O open   Ctrl+S save
    Ctrl+C copy  Ctrl+V paste


[ Latin · digits · symbols ]

  The mode button (F2) cycles Hangul, Latin abc, Latin ABC, digits, symbols.
  In those modes you can also type straight from the physical keyboard.

    abc  def  ghi        The 26 letters sit on the upper 3x3 keys.
    jkl  mno  pqr        The bottom row holds the common symbols.
    stu  vwx  yz         The other 36 symbols are in symbol mode.


[ Settings ]

  Settings > Preferences... (F4) changes the theme, font size, multi-tap
  window, start mode, language, compact mode, and toolbar / status bar.
"#;

/// 사용법 본문을 `[ 제목 ]` 이 나올 때마다 잘라 돌려준다.
///
/// 사용법 창이 이것을 두 칸으로 나눠 놓는다. 70줄을 한 줄로 세우면 창이
/// 화면보다 길어져 스크롤이 생기기 때문이다.
pub fn sections(text: &str) -> Vec<&str> {
    let mut at: Vec<usize> = Vec::new();
    let mut pos = 0usize;
    for line in text.split('\n') {
        if line.starts_with('[') {
            at.push(pos);
        }
        pos += line.len() + 1; // 줄바꿈 한 칸
    }
    if at.is_empty() {
        return vec![text];
    }

    let mut out = Vec::with_capacity(at.len());
    for (i, start) in at.iter().enumerate() {
        let end = at.get(i + 1).copied().unwrap_or(text.len());
        out.push(text[*start..end].trim_end_matches('\n'));
    }
    out
}

/// 구역들을 두 칸으로 나눈다. 줄 수가 고르게 되도록 자른다.
///
/// 구역 하나를 두 칸에 걸쳐 놓지 않는다. 그러면 읽는 차례가 끊긴다.
pub fn two_columns(text: &str) -> (String, String) {
    let secs = sections(text);
    let total: usize = secs.iter().map(|s| s.lines().count()).sum();

    let mut left: Vec<&str> = Vec::new();
    let mut right: Vec<&str> = Vec::new();
    let mut used = 0usize;

    for s in secs {
        let n = s.lines().count();
        // 이 구역을 왼쪽에 넣었을 때가 절반에 더 가까우면 왼쪽에 둔다.
        let before = total.abs_diff(used * 2);
        let after = total.abs_diff((used + n) * 2);
        if right.is_empty() && after <= before {
            used += n;
            left.push(s);
        } else {
            right.push(s);
        }
    }

    (left.join("\n\n"), right.join("\n\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sections_split_on_headings() {
        for text in [HELP_KO, HELP_EN] {
            let secs = sections(text);
            assert_eq!(secs.len(), 7, "구역이 일곱이어야 한다");
            assert!(secs.iter().all(|s| s.starts_with('[')));

            // 구역 끝의 빈 줄은 털어 내지만, 글이 적힌 줄은 하나도 새면 안 된다.
            let want: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
            let got: Vec<&str> = secs
                .iter()
                .flat_map(|s| s.lines())
                .filter(|l| !l.trim().is_empty())
                .collect();
            assert_eq!(got, want, "잘라 내면서 줄이 샜다");
        }
    }

    #[test]
    fn two_columns_are_balanced() {
        for text in [HELP_KO, HELP_EN] {
            let (a, b) = two_columns(text);
            assert!(!a.is_empty() && !b.is_empty());

            let (na, nb) = (a.lines().count(), b.lines().count());
            // 어느 쪽도 다른 쪽의 두 배를 넘지 않아야 한다.
            assert!(
                na < nb * 2 && nb < na * 2,
                "칸이 한쪽으로 쏠렸다: {na} / {nb}"
            );

            // 구역이 두 칸에 걸쳐 잘리지 않아야 한다.
            assert!(a.starts_with('[') && b.starts_with('['));
        }
    }
}
