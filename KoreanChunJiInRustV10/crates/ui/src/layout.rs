//! layout.rs - 키패드 배치와 커서 자리 옮기기.
//!
//! 위 4행은 3열 균등, 마지막 행은 기능 버튼 6개를 비율로 나눈다.
//! x 좌표를 누적 비율로 계산해서 반올림 오차가 쌓이지 않게 한다
//! (C++ 판 `relayout()` 과 같은 방식이다).
//!
//! 여기 있는 것은 모두 순수한 계산이라 화면 없이 시험할 수 있다.

/// 기능 버튼의 폭 비율이다(합 35). C++ 판과 같은 값이다.
pub const FN_WEIGHT: [u32; 6] = [7, 4, 10, 4, 4, 6];

/// 자식들을 가로로 비율만큼 나눈 뒤 각 칸의 `(x, 폭)` 을 돌려준다.
///
/// `gap` 은 칸 사이의 틈이다. 마지막 칸의 오른쪽 끝은 언제나 `width` 에
/// 정확히 닿는다.
pub fn weighted_row(width: f32, gap: f32, weights: &[u32]) -> Vec<(f32, f32)> {
    let n = weights.len();
    if n == 0 {
        return Vec::new();
    }

    let sum: u32 = weights.iter().sum::<u32>().max(1);
    let span = (width - gap * (n as f32 - 1.0)).max(0.0);

    let mut out = Vec::with_capacity(n);
    let mut cum = 0u32;
    for (i, w) in weights.iter().enumerate() {
        let x0 = gap * i as f32 + span * cum as f32 / sum as f32;
        cum += w;
        let x1 = gap * i as f32 + span * cum as f32 / sum as f32;
        out.push((x0, x1 - x0));
    }
    out
}

/// `n` 칸을 균등하게 나눈다.
pub fn equal_row(width: f32, gap: f32, n: usize) -> Vec<(f32, f32)> {
    weighted_row(width, gap, &vec![1u32; n])
}

/// 자식들을 세로로 균등하게 나눈 뒤 각 줄의 `(y, 높이)` 를 돌려준다
/// (키패드 5행).
pub fn v_grid(height: f32, gap: f32, n: usize) -> Vec<(f32, f32)> {
    equal_row(height, gap, n)
}

// ---------------------------------------------------------------------
// 커서 자리 옮기기
//
// 엔진은 커서를 "버퍼 앞에서 몇 번째 글자" 하나로 들고 있고, 입력칸은
// (줄, 칸) 두 값으로 들고 있다. 그 사이를 옮긴다.
// ---------------------------------------------------------------------

/// 평평한 글자 위치를 `(줄, 칸)` 으로 바꾼다.
pub fn row_col_of(text: &str, pos: usize) -> (usize, usize) {
    let (mut row, mut col) = (0usize, 0usize);
    for (i, ch) in text.chars().enumerate() {
        if i >= pos {
            break;
        }
        if ch == '\n' {
            row += 1;
            col = 0;
        } else {
            col += 1;
        }
    }
    (row, col)
}

/// `(줄, 칸)` 을 평평한 글자 위치로 바꾼다. 범위를 넘으면 안전하게 자른다.
pub fn flat_pos_of(text: &str, row: usize, col: usize) -> usize {
    let lines: Vec<&str> = text.split('\n').collect();
    let row = row.min(lines.len() - 1);

    let mut pos = 0usize;
    for line in &lines[..row] {
        pos += line.chars().count() + 1; // 줄바꿈 한 칸
    }
    pos + col.min(lines[row].chars().count())
}
