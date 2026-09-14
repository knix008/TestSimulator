//! 화면 시험 - 색표 · 설정 · 배치 · 커서 변환 · 언어 · 그림.
//!
//! 조합 규칙 시험은 여기 없다. 그것은 `chunjiin-engine` 의 시험이 본다.
//! 여기서는 화면이 들고 있는 표들이 서로 어긋나지 않는지, 배치 계산이
//! 맞는지, 그리고 창이 실제로 만들어지는지를 본다.

use chunjiin_engine::{InputMode, KeyRole, State, KEY_COUNT, MODE_COUNT};
use chunjiin_testkit as kit;
use chunjiin_ui::app::{App, FN_ICONS, MIN_WINDOW_W, WINDOW_W};
use chunjiin_ui::icons::{Icon, TOOL_ICONS};
use chunjiin_ui::lang::{strings_for, Lang, FN_COUNT, LANGS};
use chunjiin_ui::layout::{equal_row, flat_pos_of, row_col_of, v_grid, weighted_row, FN_WEIGHT};
use chunjiin_ui::settings::{
    load_settings, set_settings_path, settings_path, Settings, FONT_CHOICES, TAP_CHOICES,
};
use chunjiin_ui::theme::{ui_role, visuals_for, BtnRole, BtnState, Palette, PALETTES};
use chunjiin_ui::TOOL_COUNT;

const GROUP: &str = "데스크톱 화면";

/// 두 실수가 사실상 같은지 본다. 배치 계산은 부동소수라 정확히 같지 않다.
fn close(a: f32, b: f32) -> bool {
    (a - b).abs() < 0.01
}

/// 설정 파일 자리는 전역이라, 시험마다 다른 폴더를 써야 서로 밟지 않는다.
fn unique_temp(tag: &str) -> std::path::PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    let n = N.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("chunjiin-{tag}-{}-{n}", std::process::id()))
}

// ---------------------------------------------------------------------
// 테마
// ---------------------------------------------------------------------

/// 테마 4종이 빠짐없이 채워져 있는지 본다.
#[test]
fn palettes() {
    let mut tally = kit::Tally::default();
    let section = "테마 색표";

    for p in PALETTES.iter() {
        let named = !p.name.is_empty();
        tally.add(kit::check(named, GROUP, section, "이름이 있는가", p.name));

        // 창 배경과 글자색이 같으면 아무것도 보이지 않는다.
        tally.add(kit::check(
            p.wnd != p.text && p.card != p.text,
            GROUP,
            section,
            &format!("{} 배경/글자 구분", p.name),
            "배경과 글자색이 달라야 한다",
        ));

        // 여섯 역할 × 다섯 색이 모두 불투명해야 한다.
        let mut solid = true;
        for role in BtnRole::all() {
            for st in [BtnState::Base, BtnState::Hover, BtnState::Press] {
                if p.fill(role, st).a() != 255 {
                    solid = false;
                }
            }
            if p.border_of(role).a() != 255 || p.text_of(role).a() != 255 {
                solid = false;
            }
        }
        tally.add(kit::check(
            solid,
            GROUP,
            section,
            &format!("{} 색이 다 찼는가", p.name),
            "6역할 × 5색이 모두 불투명",
        ));

        // 눌림색은 기본색과 달라야 눌린 것이 보인다.
        let mut distinct = true;
        for role in BtnRole::all() {
            if p.fill(role, BtnState::Base) == p.fill(role, BtnState::Press) {
                distinct = false;
            }
        }
        tally.add(kit::check(
            distinct,
            GROUP,
            section,
            &format!("{} 눌림이 보이는가", p.name),
            "기본색과 눌림색이 달라야 한다",
        ));
    }

    tally.assert_clean("테마 색표");
}

/// 겉모습이 어떤 자리에도 비치는 색을 두지 않는지 본다.
///
/// egui 는 판을 그릴 때 배경을 덮어 그리므로, 배경색이 반투명하면 아래
/// 것이 비쳐서 글자가 읽히지 않는다.
#[test]
fn theme_visuals() {
    let mut tally = kit::Tally::default();

    for p in PALETTES.iter() {
        let v = visuals_for(p);
        let opaque = v.panel_fill.a() == 255
            && v.window_fill.a() == 255
            && v.extreme_bg_color.a() == 255
            && v.widgets.inactive.bg_fill.a() == 255;
        tally.add(kit::check(
            opaque,
            GROUP,
            "테마 색표",
            &format!("{} 겉모습 불투명", p.name),
            "판 · 창 · 입력칸 배경",
        ));

        tally.add(kit::check(
            v.override_text_color == Some(p.text),
            GROUP,
            "테마 색표",
            &format!("{} 글자색", p.name),
            "팔레트의 글자색을 쓴다",
        ));
    }
    tally.assert_clean("겉모습");
}

/// 테마 이름이 언어마다 갖춰져 있는지 본다.
#[test]
fn theme_names_per_language() {
    let mut tally = kit::Tally::default();

    for l in LANGS {
        let names = strings_for(l).theme_names;
        tally.add(kit::check(
            names.len() == PALETTES.len() && names.iter().all(|n| !n.is_empty()),
            GROUP,
            "테마 색표",
            &format!("{} 테마 이름", l.code()),
            &names.join(" · "),
        ));
    }
    tally.assert_clean("테마 이름");
}

/// 엔진이 알려 준 키 역할이 화면 역할로 제대로 바뀌는지 본다.
#[test]
fn roles() {
    let mut tally = kit::Tally::default();
    let pairs = [
        (KeyRole::Cons, BtnRole::Cons),
        (KeyRole::Vowel, BtnRole::Vowel),
        (KeyRole::Mod, BtnRole::Mod),
    ];
    for (from, want) in pairs {
        tally.add(kit::check(
            ui_role(from) == want,
            GROUP,
            "테마 색표",
            &format!("{from:?} -> {want:?}"),
            "엔진 역할 -> 화면 역할",
        ));
    }

    // 한글 모드 12키의 역할이 자판과 맞는지 본다.
    let s = State::new();
    let want: [BtnRole; KEY_COUNT] = [
        BtnRole::Vowel,
        BtnRole::Vowel,
        BtnRole::Vowel,
        BtnRole::Cons,
        BtnRole::Cons,
        BtnRole::Cons,
        BtnRole::Cons,
        BtnRole::Cons,
        BtnRole::Cons,
        BtnRole::Mod,
        BtnRole::Cons,
        BtnRole::Mod,
    ];
    let ok = (0..KEY_COUNT).all(|k| ui_role(s.key_role_of(k)) == want[k]);
    tally.add(kit::check(
        ok,
        GROUP,
        "테마 색표",
        "한글 12키 역할",
        "모음 3 · 부호 2 · 나머지 자음",
    ));

    tally.assert_clean("키 역할");
}

// ---------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------

/// 설정을 썼다 읽었을 때 그대로 돌아오는지 본다.
///
/// 진짜 사용자 설정을 건드리지 않도록 임시 폴더로 자리를 갈아 끼운다.
#[test]
fn settings_round_trip() {
    let dir = unique_temp("set");
    let _ = std::fs::create_dir_all(&dir);
    set_settings_path(Some(dir.join("settings.json")));

    let mut tally = kit::Tally::default();
    let section = "설정";

    // 파일이 없으면 기본값이 온다.
    let _ = std::fs::remove_file(settings_path().unwrap());
    let fresh = load_settings();
    tally.add(kit::check(
        fresh.theme == 0 && fresh.font_size == 21 && fresh.multitap_ms == 800,
        GROUP,
        section,
        "파일 없음 -> 기본값",
        &format!(
            "테마 {} · {}px · {}ms",
            fresh.theme, fresh.font_size, fresh.multitap_ms
        ),
    ));

    // 썼다 읽으면 그대로다.
    let saved = Settings {
        theme: 2,
        font_size: 28,
        multitap_ms: 1500,
        start_mode: 3,
        show_toolbar: false,
        show_status: false,
        compact: true,
        language: "en".into(),
    };
    let wrote = saved.save().is_ok();
    let back = load_settings();
    tally.add(kit::check(
        wrote && back == saved,
        GROUP,
        section,
        "썼다 읽기",
        &format!("{back:?}"),
    ));

    // 깨진 파일이면 기본값으로 떨어진다.
    std::fs::write(settings_path().unwrap(), "{ 이건 JSON 이 아니다").unwrap();
    let broken = load_settings();
    tally.add(kit::check(
        broken.theme == 0 && broken.font_size == 21,
        GROUP,
        section,
        "깨진 파일 -> 기본값",
        &format!("테마 {}", broken.theme),
    ));

    // 범위를 벗어난 값은 다듬어진다.
    std::fs::write(
        settings_path().unwrap(),
        r#"{"theme":99,"fontSize":3,"multitapMs":99999,"startMode":42,"language":"zz"}"#,
    )
    .unwrap();
    let fixed = load_settings();
    let ok = fixed.theme == PALETTES.len() - 1
        && fixed.font_size == FONT_CHOICES[0]
        && fixed.multitap_ms == TAP_CHOICES[TAP_CHOICES.len() - 1]
        && fixed.start_mode == MODE_COUNT - 1
        && fixed.lang() == Lang::Ko;
    tally.add(kit::check(
        ok,
        GROUP,
        section,
        "범위 밖 값 다듬기",
        &format!("{fixed:?}"),
    ));

    set_settings_path(None);
    let _ = std::fs::remove_dir_all(&dir);
    tally.assert_clean("설정");
}

/// 기본값이 고를 수 있는 목록 안에 있는지 본다.
#[test]
fn settings_choices() {
    let mut tally = kit::Tally::default();
    let d = Settings::default();

    tally.add(kit::check(
        FONT_CHOICES.contains(&d.font_size),
        GROUP,
        "설정",
        "기본 글꼴 크기가 목록에 있는가",
        &format!("{}px", d.font_size),
    ));
    tally.add(kit::check(
        TAP_CHOICES.contains(&d.multitap_ms),
        GROUP,
        "설정",
        "기본 연타 시간이 목록에 있는가",
        &format!("{}ms", d.multitap_ms),
    ));
    tally.add(kit::check(
        d.theme < PALETTES.len() && d.start_mode < MODE_COUNT,
        GROUP,
        "설정",
        "기본 테마 · 시작 모드가 범위 안인가",
        &format!("테마 {} · 모드 {}", d.theme, d.start_mode),
    ));
    tally.assert_clean("설정 목록");
}

// ---------------------------------------------------------------------
// 배치
// ---------------------------------------------------------------------

/// 기능 버튼 줄의 폭이 비율대로 나뉘고 오른쪽 끝에 정확히 닿는지 본다.
#[test]
fn weighted_row_layout() {
    let mut tally = kit::Tally::default();
    let section = "키패드 배치";

    for width in [200.0_f32, 383.0, 420.0, 1000.0] {
        let gap = 6.0;
        let cells = weighted_row(width, gap, &FN_WEIGHT);

        tally.add(kit::check(
            cells.len() == FN_WEIGHT.len(),
            GROUP,
            section,
            &format!("{width}px 칸 수"),
            &format!("{} 칸", cells.len()),
        ));

        // 마지막 칸의 오른쪽 끝이 폭에 정확히 닿아야 한다.
        let (x, w) = cells[cells.len() - 1];
        tally.add(kit::check(
            close(x + w, width),
            GROUP,
            section,
            &format!("{width}px 오른쪽 끝"),
            &format!("{:.2} (기대 {width})", x + w),
        ));

        // 칸 사이의 틈이 늘 같아야 한다.
        let even = cells
            .windows(2)
            .all(|p| close(p[1].0 - (p[0].0 + p[0].1), gap));
        tally.add(kit::check(
            even,
            GROUP,
            section,
            &format!("{width}px 틈 고름"),
            &format!("{gap}px"),
        ));

        // 폭이 비율을 따라야 한다. 스페이스(10)는 커서 왼쪽(4)의 2.5배다.
        tally.add(kit::check(
            close(cells[2].1 / cells[1].1, 10.0 / 4.0),
            GROUP,
            section,
            &format!("{width}px 비율"),
            "스페이스 : 커서왼쪽 = 10 : 4",
        ));
    }
    tally.assert_clean("비율 배치");
}

/// 균등 배치와 세로 배치도 끝에 닿는지 본다.
#[test]
fn equal_and_vgrid() {
    let mut tally = kit::Tally::default();
    let section = "키패드 배치";

    let cells = equal_row(300.0, 6.0, 3);
    let same = close(cells[0].1, cells[1].1) && close(cells[1].1, cells[2].1);
    tally.add(kit::check(
        same && close(cells[2].0 + cells[2].1, 300.0),
        GROUP,
        section,
        "3열 균등",
        &format!("{:.1}px 씩", cells[0].1),
    ));

    let rows = v_grid(280.0, 6.0, 5);
    tally.add(kit::check(
        rows.len() == 5 && close(rows[4].0 + rows[4].1, 280.0),
        GROUP,
        section,
        "5행 균등",
        &format!("{:.1}px 씩", rows[0].1),
    ));

    // 자리가 아주 좁아도 죽지 않아야 한다.
    let tiny = weighted_row(1.0, 6.0, &FN_WEIGHT);
    tally.add(kit::check(
        tiny.iter().all(|(_, w)| *w >= 0.0),
        GROUP,
        section,
        "좁은 자리",
        "폭이 음수가 되지 않는다",
    ));

    tally.assert_clean("배치");
}

// ---------------------------------------------------------------------
// 커서 자리 옮기기
// ---------------------------------------------------------------------

/// 평평한 위치와 (줄, 칸) 사이를 오갔을 때 제자리로 오는지 본다.
#[test]
fn cursor_round_trip() {
    let mut tally = kit::Tally::default();
    let section = "커서 변환";

    for text in [
        "",
        "가",
        "가나다",
        "가나\n다라",
        "\n\n가",
        "안녕\n하세요\n반갑",
    ] {
        let n = text.chars().count();
        let mut ok = true;
        for pos in 0..=n {
            let (row, col) = row_col_of(text, pos);
            if flat_pos_of(text, row, col) != pos {
                ok = false;
            }
        }
        tally.add(kit::check(
            ok,
            GROUP,
            section,
            &format!("{:?}", text.replace('\n', "\\n")),
            &format!("{n}+1 자리를 모두 오간다"),
        ));
    }

    // 범위를 넘는 (줄, 칸) 이 안전하게 잘리는지 본다.
    let text = "가나\n다";
    let clamped =
        flat_pos_of(text, 99, 99) == text.chars().count() && flat_pos_of(text, 0, 99) == 2;
    tally.add(kit::check(
        clamped,
        GROUP,
        section,
        "범위 밖 자르기",
        "줄 · 칸이 넘쳐도 버퍼 안에 머문다",
    ));

    tally.assert_clean("커서 변환");
}

// ---------------------------------------------------------------------
// 언어 · 라벨
// ---------------------------------------------------------------------

/// 두 언어의 글자 표에 빈 칸이 없는지 본다.
#[test]
fn lang_tables_complete() {
    let mut tally = kit::Tally::default();
    let section = "언어";

    for l in LANGS {
        let t = strings_for(l);

        let scalars: [(&str, &str); 20] = [
            ("app_title", t.app_title),
            ("help_title", t.help_title),
            ("about_title", t.about_title),
            ("menu_file", t.menu_file),
            ("menu_edit", t.menu_edit),
            ("menu_input", t.menu_input),
            ("menu_config", t.menu_config),
            ("menu_help", t.menu_help),
            ("new", t.new),
            ("open", t.open),
            ("save", t.save),
            ("quit", t.quit),
            ("copy", t.copy),
            ("paste", t.paste),
            ("clear_all", t.clear_all),
            ("set_ok", t.set_ok),
            ("set_cancel", t.set_cancel),
            ("set_default", t.set_default),
            ("close", t.close),
            ("about_body", t.about_body),
        ];
        let filled = scalars.iter().all(|(_, v)| !v.is_empty());
        tally.add(kit::check(
            filled,
            GROUP,
            section,
            &format!("{} 낱말", l.code()),
            &format!("{} 칸", scalars.len()),
        ));

        // 기능 버튼은 글자가 비어도 되지만(그림을 쓴다) 설명은 늘 있어야 한다.
        tally.add(kit::check(
            t.fn_hints.iter().all(|h| !h.is_empty()),
            GROUP,
            section,
            &format!("{} 기능 버튼 설명", l.code()),
            &format!("{FN_COUNT} 개"),
        ));
        tally.add(kit::check(
            t.tips.iter().all(|h| !h.is_empty()) && t.tips.len() == TOOL_COUNT,
            GROUP,
            section,
            &format!("{} 툴바 설명", l.code()),
            &format!("{TOOL_COUNT} 개"),
        ));
        tally.add(kit::check(
            t.mode_names.iter().all(|m| !m.is_empty()) && t.mode_names.len() == MODE_COUNT,
            GROUP,
            section,
            &format!("{} 모드 이름", l.code()),
            &t.mode_names.join(" · "),
        ));
        tally.add(kit::check(
            !t.help.is_empty() && t.help.contains("ㅣ") && t.help.contains("ㅡ"),
            GROUP,
            section,
            &format!("{} 사용법 본문", l.code()),
            &format!("{} 줄", t.help.lines().count()),
        ));
    }

    tally.assert_clean("언어 표");
}

/// 두 언어가 실제로 다른 글자를 쓰는지 본다.
/// (새 언어를 넣다가 한쪽을 그대로 두는 실수를 막는다)
#[test]
fn languages_differ() {
    let ko = strings_for(Lang::Ko);
    let en = strings_for(Lang::En);
    let mut tally = kit::Tally::default();

    let pairs = [
        ("app_title", ko.app_title, en.app_title),
        ("menu_file", ko.menu_file, en.menu_file),
        ("set_ok", ko.set_ok, en.set_ok),
        ("close", ko.close, en.close),
    ];
    for (name, a, b) in pairs {
        tally.add(kit::check(
            a != b,
            GROUP,
            "언어",
            &format!("{name} 이 다른가"),
            &format!("{a} / {b}"),
        ));
    }

    // 모르는 코드를 물으면 한국어가 온다.
    tally.add(kit::check(
        Lang::from_code("zz") == Lang::Ko,
        GROUP,
        "언어",
        "모르는 코드 -> 한국어",
        "zz -> ko",
    ));
    tally.assert_clean("언어 구분");
}

/// 숫자열이 키패드에 제대로 대응하는지, 그리고 그 자리 버튼에 적힌 글자와
/// 실제로 들어가는 글자가 같은지 본다.
#[test]
fn physical_keys() {
    use egui::Key;

    let mut tally = kit::Tally::default();
    let section = "물리 키보드";

    let want: [(Key, usize); 12] = [
        (Key::Num1, 0),
        (Key::Num2, 1),
        (Key::Num3, 2),
        (Key::Num4, 3),
        (Key::Num5, 4),
        (Key::Num6, 5),
        (Key::Num7, 6),
        (Key::Num8, 7),
        (Key::Num9, 8),
        (Key::Minus, 9),
        (Key::Num0, 10),
        (Key::Equals, 11),
    ];

    for (key, idx) in want {
        tally.add(kit::check(
            App::hangul_key_of(key) == Some(idx),
            GROUP,
            section,
            &format!("{key:?} -> 키{idx}"),
            "숫자열 대응",
        ));
    }

    // 자판에 없는 키는 대응이 없어야 한다.
    tally.add(kit::check(
        App::hangul_key_of(Key::A).is_none() && App::hangul_key_of(Key::Space).is_none(),
        GROUP,
        section,
        "대응 없는 키",
        "A · Space 는 키패드가 아니다",
    ));

    // 숫자열로 친 글자가 그 자리 버튼 라벨의 첫 글자와 같아야 한다.
    for (key, idx) in want {
        let mut s = State::new();
        let label = s.key_label(idx);
        let expect = label.chars().next().unwrap().to_string();

        s.key(App::hangul_key_of(key).unwrap() as i32);
        s.commit();

        tally.add(kit::check(
            s.text() == expect,
            GROUP,
            section,
            &format!("{key:?} 라벨 일치"),
            &format!("{label} -> {}", s.text()),
        ));
    }

    tally.assert_clean("물리 키보드");
}

// ---------------------------------------------------------------------
// 그림
// ---------------------------------------------------------------------

/// 그림마다 그릴 것이 하나라도 있는지 본다.
/// (표를 비워 두면 버튼이 빈칸으로 나온다)
#[test]
fn icons_have_shapes() {
    let mut tally = kit::Tally::default();

    let all = [
        ("New", Icon::New),
        ("Open", Icon::Open),
        ("Save", Icon::Save),
        ("Copy", Icon::Copy),
        ("Paste", Icon::Paste),
        ("Clear", Icon::Clear),
        ("Mode", Icon::Mode),
        ("Theme", Icon::Theme),
        ("Language", Icon::Language),
        ("Settings", Icon::Settings),
        ("About", Icon::About),
        ("Help", Icon::Help),
        ("Enter", Icon::Enter),
        ("Backspace", Icon::Backspace),
    ];

    for (name, ic) in all {
        let d = ic.def();
        let shapes =
            d.lines.len() + d.circles.len() + d.dots.len() + d.ellipses.len() + d.arcs.len();

        // 선은 점이 둘 이상이어야 보인다.
        let lines_ok = d.lines.iter().all(|l| l.len() >= 2);
        // 좌표는 24x24 자리 안에 있어야 한다.
        let inside = d
            .lines
            .iter()
            .flat_map(|l| l.iter())
            .all(|(x, y)| (-1.0..=25.0).contains(x) && (-1.0..=25.0).contains(y));

        tally.add(kit::check(
            shapes > 0 && lines_ok && inside,
            GROUP,
            "그림",
            name,
            &format!("{shapes} 조각"),
        ));
    }
    tally.assert_clean("그림");
}

/// 툴바 그림 수가 설명 수와 맞는지, 기능 버튼이 글자든 그림이든 하나는
/// 갖는지 본다.
#[test]
fn button_tables_match() {
    let mut tally = kit::Tally::default();

    tally.add(kit::check(
        TOOL_ICONS.len() == TOOL_COUNT,
        GROUP,
        "표 맞추기",
        "툴바 그림 수",
        &format!("{} 개 (설명 {TOOL_COUNT} 개)", TOOL_ICONS.len()),
    ));

    let about = TOOL_ICONS.iter().position(|&ic| ic == Icon::About);
    let settings = TOOL_ICONS.iter().position(|&ic| ic == Icon::Settings);
    tally.add(kit::check(
        about.zip(settings).is_some_and(|(a, s)| a + 1 == s),
        GROUP,
        "표 맞추기",
        "정보가 설정 왼쪽",
        "About 바로 다음에 Settings",
    ));

    let compact: Vec<Icon> = TOOL_ICONS
        .iter()
        .copied()
        .filter(|ic| *ic != Icon::About)
        .collect();
    tally.add(kit::check(
        compact.len() == TOOL_COUNT - 1 && compact.last() == Some(&Icon::Settings),
        GROUP,
        "표 맞추기",
        "컴팩트에서 정보 단추 없음",
        "Settings 가 맨 오른쪽",
    ));

    for l in LANGS {
        let t = strings_for(l);
        // 글자가 비면 반드시 그림이 있어야 한다.
        let ok = t
            .fn_labels
            .iter()
            .zip(FN_ICONS.iter())
            .all(|(label, icon)| !label.is_empty() || icon.is_some());
        tally.add(kit::check(
            ok,
            GROUP,
            "표 맞추기",
            &format!("{} 기능 버튼 얼굴", l.code()),
            "글자가 없으면 그림이 있다",
        ));
        // Go TestFnIcons: 그림과 글자가 동시에 있으면 겹쳐 그린다.
        let xor_ok = t
            .fn_labels
            .iter()
            .zip(FN_ICONS.iter())
            .all(|(label, icon)| label.is_empty() != icon.is_none());
        tally.add(kit::check(
            xor_ok,
            GROUP,
            "표 맞추기",
            &format!("{} 기능 버튼 하나만", l.code()),
            "글자와 그림은 하나만",
        ));
    }

    tally.add(kit::check(
        FN_WEIGHT.len() == FN_COUNT && FN_ICONS.len() == FN_COUNT,
        GROUP,
        "표 맞추기",
        "기능 버튼 표 길이",
        &format!("비율 {} · 그림 {}", FN_WEIGHT.len(), FN_ICONS.len()),
    ));

    tally.assert_clean("표 맞추기");
}

// ---------------------------------------------------------------------
// 스모크 - 창을 실제로 만들어 본다
// ---------------------------------------------------------------------

/// 창과 단추를 실제로 만들어 화면 배선을 본다.
///
/// Go 판 `TestAppSmoke` 에 해당한다. egui 는 그리는 데 창이 필요 없으므로
/// 화면 없는 곳에서도 그대로 돈다.
#[test]
fn app_smoke() {
    let mut tally = kit::Tally::default();
    let section = "스모크";

    // 진짜 사용자 설정을 건드리지 않는다.
    let dir = unique_temp("smoke");
    let _ = std::fs::create_dir_all(&dir);
    set_settings_path(Some(dir.join("settings.json")));
    let _ = std::fs::remove_file(dir.join("settings.json"));

    let ctx = egui::Context::default();
    let mut app = App::new_in(&ctx);

    // 한 판을 그려 본다. 배선이 어긋났으면 여기서 죽는다.
    // egui 0.36 은 뿌리 Ui 를 만들어 준다. 진짜 창이 없어도 그대로 돈다.
    //
    // 한 판을 그리면 글꼴 그림판이 딸려 나온다. 진짜 그리는 쪽이라면 그것을
    // 그래픽 카드로 올리겠지만 여기서는 쓸 데가 없으므로 치운다.
    // 그냥 버리면 egui 가 "처리하지 않은 것이 있다" 며 죽는다.
    let frame = |app: &mut App, ctx: &egui::Context| {
        let mut out = ctx.run_ui(egui::RawInput::default(), |ui| app.show(ui));
        out.textures_delta.clear();
    };

    frame(&mut app, &ctx);
    tally.add(kit::check(true, GROUP, section, "첫 판", "창이 만들어졌다"));

    // 테마 4종을 모두 그려 본다.
    for i in 0..PALETTES.len() {
        app.set_theme(i);
        frame(&mut app, &ctx);
    }
    tally.add(kit::check(
        true,
        GROUP,
        section,
        "테마 4종",
        "모두 그려진다",
    ));

    // 다섯 모드를 모두 그려 본다.
    for m in 0..MODE_COUNT {
        app.state_mut().set_mode_index(m);
        frame(&mut app, &ctx);
    }
    tally.add(kit::check(
        true,
        GROUP,
        section,
        "모드 5종",
        "모두 그려진다",
    ));

    // 딸린 창 셋을 열고 그려 본다.
    for open in [App::open_help, App::open_about, App::open_settings_window] {
        open(&mut app);
        frame(&mut app, &ctx);
        app.close_all();
        frame(&mut app, &ctx);
    }
    tally.add(kit::check(
        true,
        GROUP,
        section,
        "딸린 창",
        "사용법 · 정보 · 설정",
    ));

    // 두 언어로 모두 그려 본다.
    for l in LANGS {
        app.set_lang(l);
        frame(&mut app, &ctx);
    }
    tally.add(kit::check(
        true,
        GROUP,
        section,
        "언어 2종",
        "모두 그려진다",
    ));

    // 엔진과 이어져 있는지 본다. "가" 를 치면 편집칸에 "가" 가 있어야 한다.
    app.state_mut().set_mode(InputMode::Hangul);
    for k in [3, 0, 1] {
        app.state_mut().key(k);
    }
    frame(&mut app, &ctx);
    tally.add(kit::check(
        app.state().text() == "가",
        GROUP,
        section,
        "엔진 배선",
        &format!("ㄱ ㅣ · -> {:?}", app.state().text()),
    ));

    set_settings_path(None);
    let _ = std::fs::remove_dir_all(&dir);
    tally.assert_clean("스모크");
}

/// 팔레트를 바꿔 가며 상태줄 글이 늘 채워지는지 본다.
#[test]
fn status_text_never_empty() {
    let mut tally = kit::Tally::default();
    let mut s = State::new();

    for seq in ["", "3", "301", "30147"] {
        for c in seq.chars() {
            s.key(c as i32 - '0' as i32);
        }
        let text = s.status_text();
        tally.add(kit::check(
            !text.is_empty() && text.contains("자"),
            GROUP,
            "상태줄",
            &format!("{seq:?}"),
            &text,
        ));
    }
    tally.assert_clean("상태줄");
}

/// 팔레트 하나를 골라 색을 읽어 오는 길이 막히지 않았는지 본다.
#[test]
fn palette_lookup() {
    let p: &Palette = &PALETTES[0];
    assert_eq!(p.name, "라이트");
    assert_ne!(p.fill(BtnRole::Primary, BtnState::Base), p.wnd);
    kit::pass(
        GROUP,
        "테마 색표",
        "팔레트 조회",
        "라이트 · 모드 단추 색이 창 배경과 다르다",
    );
}

/// 어떤 폭에서도 툴바 버튼 열한 칸이 모두 보이는지 본다.
///
/// 창을 좁힐 수 있는 한계는 [`MIN_WINDOW_W`] 지만, 창 관리자가 그것을
/// 지키지 않거나 프로그램이 창 크기를 직접 바꾸는 일이 있다. 그때도
/// 버튼이 잘려 나가면 안 되므로 아주 좁은 폭까지 훑어 본다.
#[test]
fn toolbar_never_clips() {
    use chunjiin_ui::app::{toolbar_metrics, toolbar_slot_x};

    let mut tally = kit::Tally::default();
    let section = "툴바 폭";

    // 판 안쪽 여백을 뺀 실제로 그릴 수 있는 폭들
    let widths = [
        MIN_WINDOW_W - 20.0, // 최소 창에서 쓸 수 있는 폭
        WINDOW_W - 20.0,
        600.0,
        1200.0,
        200.0, // 최소보다 좁게 억지로 줄였을 때
        120.0,
        60.0,
    ];

    for width in widths {
        let (size, gap, tail_gap) = toolbar_metrics(width);
        let slots: Vec<f32> = (0..TOOL_COUNT)
            .map(|i| toolbar_slot_x(i, width, size, gap, tail_gap))
            .collect();

        // 모두 판 안에 들어와야 한다.
        let inside = slots[0] >= -0.01 && slots[TOOL_COUNT - 1] + size <= width + 0.01;
        tally.add(kit::check(
            inside,
            GROUP,
            section,
            &format!("{width:.0}px 판 안에 드는가"),
            &format!(
                "칸 {size:.1}px · 마지막 끝 {:.1}px",
                slots[TOOL_COUNT - 1] + size
            ),
        ));

        // 서로 겹치지 않아야 한다.
        let apart = slots.windows(2).all(|p| p[1] >= p[0] + size - 0.01);
        tally.add(kit::check(
            apart,
            GROUP,
            section,
            &format!("{width:.0}px 겹치지 않는가"),
            &format!("{} 칸", slots.len()),
        ));

        // 눌러야 하므로 칸이 사라져서는 안 된다.
        tally.add(kit::check(
            size > 1.0,
            GROUP,
            section,
            &format!("{width:.0}px 칸이 남아 있는가"),
            &format!("{size:.1}px"),
        ));
    }

    // 처음 띄우는 폭이 최소 폭보다 좁으면 처음부터 가려진다.
    tally.add(kit::check(
        WINDOW_W >= MIN_WINDOW_W,
        GROUP,
        section,
        "처음 폭이 최소 폭 이상인가",
        &format!("{WINDOW_W:.0}px / {MIN_WINDOW_W:.0}px"),
    ));

    // 최소 폭에서는 줄이지 않고 제 크기로 그려야 한다.
    let (size, _, _) = toolbar_metrics(MIN_WINDOW_W - 20.0);
    tally.add(kit::check(
        size >= chunjiin_ui::app::TOOL_SIZE - 0.01,
        GROUP,
        section,
        "최소 폭에서 제 크기인가",
        &format!("{size:.1}px"),
    ));

    tally.assert_clean("툴바 폭");
}

/// 사용법 창 본문이 스스로 정한 자리 안에만 머무는지 본다.
///
/// 남은 자리를 다 차지하는 위젯(`ui.separator()` 같은 것)이 하나라도 끼면
/// 본문이 얼마나 쓰는지 잴 수 없게 되고, 그러면 창을 내용에 맞출 수 없어
/// 오른쪽과 아래에 빈 자리가 크게 남는다. 실제로 겪은 일이라 못박아 둔다.
#[test]
fn help_body_measures_its_own_size() {
    use chunjiin_ui::app::{help_body, help_width};

    let mut tally = kit::Tally::default();
    let section = "창 크기 맞추기";

    // 어떤 창도 이보다 길 수 없을 만큼 넉넉히 잡은 한계. app.rs 와 같은 값이다.
    const MAX_H: f32 = 4000.0;

    let ctx = egui::Context::default();
    chunjiin_ui::font::install(&ctx);
    // 글꼴은 다음 판부터 듣는다. 빈 판을 한 번 돌려 등록을 끝낸다.
    let mut warm = ctx.run_ui(egui::RawInput::default(), |_| {});
    warm.textures_delta.clear();

    for l in LANGS {
        let (left, right) = chunjiin_ui::help::two_columns(strings_for(l).help);
        let want_w = help_width(&ctx, &left, &right);

        let mut used = egui::Vec2::ZERO;
        let mut out = ctx.run_ui(egui::RawInput::default(), |ui| {
            let frame = egui::Frame::central_panel(ui.style());
            egui::CentralPanel::default().frame(frame).show(ui, |ui| {
                let at = egui::Rect::from_min_size(ui.min_rect().min, egui::vec2(want_w, MAX_H));
                used = ui
                    .scope_builder(
                        egui::UiBuilder::new()
                            .max_rect(at)
                            .layout(egui::Layout::top_down(egui::Align::Min)),
                        |ui| {
                            help_body(ui, &left, &right, strings_for(l).close);
                            ui.min_rect().size()
                        },
                    )
                    .inner;
            });
        });
        out.textures_delta.clear();

        // 폭을 미리 셈한 값과 실제로 쓴 값이 같아야 한다.
        tally.add(kit::check(
            close(used.x, want_w),
            GROUP,
            section,
            &format!("{} 사용법 폭", l.code()),
            &format!("셈 {want_w:.0}px · 실제 {:.0}px", used.x),
        ));

        // 높이가 한계에 닿았다면 무언가가 자리를 다 차지한 것이다.
        tally.add(kit::check(
            used.y < MAX_H * 0.5,
            GROUP,
            section,
            &format!("{} 사용법 높이", l.code()),
            &format!("{:.0}px (한계 {MAX_H:.0}px)", used.y),
        ));

        // 두 칸이 크게 어긋나면 짧은 칸 아래가 휑하다.
        let (a, b) = (left.lines().count(), right.lines().count());
        tally.add(kit::check(
            a.abs_diff(b) * 5 <= a.max(b),
            GROUP,
            section,
            &format!("{} 두 칸 균형", l.code()),
            &format!("{a}줄 / {b}줄"),
        ));
    }

    tally.assert_clean("창 크기 맞추기");
}

// ---------------------------------------------------------------------
// Go 판 ui_test.go · app_smoke_test.go 에 맞춰 넓힌 시험
// ---------------------------------------------------------------------

/// 테마 네 이름의 차례와 호버색이 기본색과 다른지 본다.
#[test]
fn theme_names_and_hover() {
    let mut tally = kit::Tally::default();
    let want = ["라이트", "다크", "세피아", "고대비"];
    for (i, name) in want.iter().enumerate() {
        tally.add(kit::check(
            PALETTES[i].name == *name,
            GROUP,
            "테마 색표",
            &format!("이름 {i}"),
            PALETTES[i].name,
        ));
    }

    for p in PALETTES.iter() {
        let mut distinct = true;
        for role in BtnRole::all() {
            if p.fill(role, BtnState::Base) == p.fill(role, BtnState::Hover) {
                distinct = false;
            }
        }
        tally.add(kit::check(
            distinct,
            GROUP,
            "테마 색표",
            &format!("{} 호버가 보이는가", p.name),
            "기본색과 호버색이 달라야 한다",
        ));
    }
    tally.assert_clean("테마 이름 · 호버");
}

/// Go `TestHelpText` — 사용법에 꼭 있어야 하는 낱말.
#[test]
fn help_keywords() {
    let mut tally = kit::Tally::default();
    let ko = [
        "키패드", "모음", "자음", "물리 키보드", "설정", "ㄱㅋ", "ㅅㅎ", "F1", "Ctrl+S",
    ];
    let en = [
        "Keypad",
        "Vowels",
        "Consonants",
        "Physical keyboard",
        "Settings",
        "ㄱㅋ",
        "ㅅㅎ",
        "F1",
        "Ctrl+S",
    ];
    for (l, words) in [(Lang::Ko, ko.as_slice()), (Lang::En, en.as_slice())] {
        let help = strings_for(l).help;
        tally.add(kit::check(
            help.len() >= 500,
            GROUP,
            "사용법",
            &format!("{} 길이", l.code()),
            &format!("{} 바이트", help.len()),
        ));
        for w in words {
            tally.add(kit::check(
                help.contains(w),
                GROUP,
                "사용법",
                &format!("{} {w}", l.code()),
                "본문에 있다",
            ));
        }
    }
    tally.assert_clean("사용법 낱말");
}

/// Go `TestAppFileRoundTrip` — UTF-8 BOM 을 붙였다 뗀다.
#[test]
fn file_bom_roundtrip() {
    use chunjiin_ui::app::{decode_saved_text, encode_saved_text};

    let mut tally = kit::Tally::default();
    let section = "파일 BOM";
    for src in ["", "가", "한글", "안녕\n하세요", "a가1!"] {
        let raw = encode_saved_text(src);
        tally.add(kit::check(
            raw.starts_with(&[0xEF, 0xBB, 0xBF]),
            GROUP,
            section,
            &format!("{src:?} BOM"),
            "앞에 EF BB BF",
        ));
        tally.add(kit::check(
            decode_saved_text(&raw) == src,
            GROUP,
            section,
            &format!("{src:?} 왕복"),
            "떼면 원래 글",
        ));
    }
    tally.add(kit::check(
        decode_saved_text("한글".as_bytes()) == "한글",
        GROUP,
        section,
        "BOM 없는 파일",
        "그대로 읽는다",
    ));
    tally.assert_clean("파일 BOM");
}

/// Go `TestAppLanguageSwitch` — 언어를 바꾸면 화면 글이 따라간다.
#[test]
fn language_switch() {
    let mut tally = kit::Tally::default();
    let section = "언어 전환";

    let dir = unique_temp("lang");
    let _ = std::fs::create_dir_all(&dir);
    set_settings_path(Some(dir.join("settings.json")));

    let ctx = egui::Context::default();
    let mut app = App::new_in(&ctx);
    app.set_lang(Lang::Ko);

    tally.add(kit::check(
        strings_for(app.settings().lang()).app_title.contains("천지인"),
        GROUP,
        section,
        "한국어 제목",
        strings_for(Lang::Ko).app_title,
    ));

    app.set_lang(Lang::En);
    let en = strings_for(app.settings().lang());
    tally.add(kit::check(
        en.app_title.contains("Chunjiin") || en.app_title.contains("Hangul"),
        GROUP,
        section,
        "영어 제목",
        en.app_title,
    ));
    tally.add(kit::check(
        en.mode_names[0].starts_with("Hangul") || en.mode_names[0] == "한글",
        GROUP,
        section,
        "영어 모드 이름",
        en.mode_names[0],
    ));
    tally.add(kit::check(
        en.fn_labels[0] != strings_for(Lang::Ko).fn_labels[0],
        GROUP,
        section,
        "기능 단추 글",
        en.fn_labels[0],
    ));

    app.clear_text();
    app.state_mut().set_mode(InputMode::Hangul);
    for k in [7, 7, 0, 1, 4] {
        app.state_mut().key(k);
    }
    app.state_mut().break_multitap();
    for k in [3, 2] {
        app.state_mut().key(k);
    }
    app.state_mut().break_multitap();
    app.state_mut().key(4);
    app.state_mut().key(4);
    app.state_mut().commit();
    tally.add(kit::check(
        app.state().text() == "한글",
        GROUP,
        section,
        "언어와 무관한 조합",
        &format!("{:?}", app.state().text()),
    ));

    set_settings_path(None);
    let _ = std::fs::remove_dir_all(&dir);
    tally.assert_clean("언어 전환");
}

/// Go `TestAppSmoke` · `TestAppWindows` 의 화면 배선.
#[test]
fn app_smoke_go_parity() {
    use egui::Key;

    let mut tally = kit::Tally::default();
    let section = "스모크 심화";

    let dir = unique_temp("smoke2");
    let _ = std::fs::create_dir_all(&dir);
    set_settings_path(Some(dir.join("settings.json")));
    let _ = std::fs::remove_file(dir.join("settings.json"));

    let ctx = egui::Context::default();
    let mut app = App::new_in(&ctx);
    app.set_lang(Lang::Ko);

    let frame = |app: &mut App, ctx: &egui::Context| {
        let mut out = ctx.run_ui(egui::RawInput::default(), |ui| app.show(ui));
        out.textures_delta.clear();
    };
    frame(&mut app, &ctx);

    tally.add(kit::check(
        app.state().text().is_empty() && app.settings().show_toolbar && app.settings().show_status,
        GROUP,
        section,
        "시작 상태",
        "빈 편집칸 · 툴바 · 상태줄",
    ));

    app.clear_text();
    for k in [7, 7, 0, 1, 4] {
        app.state_mut().key(k);
    }
    app.state_mut().break_multitap();
    for k in [3, 2] {
        app.state_mut().key(k);
    }
    app.state_mut().break_multitap();
    app.state_mut().key(4);
    app.state_mut().key(4);
    app.state_mut().commit();
    tally.add(kit::check(
        app.state().text() == "한글",
        GROUP,
        section,
        "한글 조합",
        &format!("{:?}", app.state().text()),
    ));

    app.clear_text();
    app.state_mut().key(10);
    app.state_mut().key(10);
    app.state_mut().key(0);
    app.state_mut().key(1);
    app.state_mut().key(4);
    app.state_mut().key(7);
    app.state_mut().key(7);
    app.state_mut().commit();
    tally.add(kit::check(
        app.state().text() == "많",
        GROUP,
        section,
        "겹받침 병합",
        &format!("{:?}", app.state().text()),
    ));

    app.clear_text();
    app.state_mut().key(3);
    app.state_mut().key(0);
    app.state_mut().key(1);
    app.state_mut().space();
    app.state_mut().key(4);
    app.state_mut().key(0);
    app.state_mut().key(1);
    app.state_mut().backspace();
    tally.add(kit::check(
        app.state().text() == "가 니",
        GROUP,
        section,
        "단추 누르기 · 지우기",
        &format!("{:?}", app.state().text()),
    ));

    app.clear_text();
    app.state_mut().key(3);
    app.state_mut().key(0);
    app.state_mut().key(1);
    app.state_mut().key(4);
    app.state_mut().key(0);
    app.state_mut().key(1);
    app.press(&ctx, Key::Backspace);
    tally.add(kit::check(
        app.state().text() == "가니",
        GROUP,
        section,
        "백스페이스",
        &format!("{:?}", app.state().text()),
    ));

    let start = app.state().now_mode;
    for _ in 0..MODE_COUNT {
        app.press(&ctx, Key::F2);
    }
    tally.add(kit::check(
        app.state().now_mode == start,
        GROUP,
        section,
        "F2 모드 한 바퀴",
        app.state().mode_name(),
    ));

    let first_theme = app.settings().theme;
    for _ in 0..PALETTES.len() {
        app.press(&ctx, Key::F3);
        frame(&mut app, &ctx);
    }
    tally.add(kit::check(
        app.settings().theme == first_theme,
        GROUP,
        section,
        "F3 테마 한 바퀴",
        &format!("테마 {}", app.settings().theme),
    ));

    app.clear_text();
    app.state_mut().set_mode(InputMode::Hangul);
    app.state_mut().key(3);
    app.state_mut().key(0);
    app.state_mut().key(1);
    frame(&mut app, &ctx);
    tally.add(kit::check(
        app.status_line().contains("한글") && app.status_line().contains("ㄱ"),
        GROUP,
        section,
        "상태줄",
        &app.status_line(),
    ));

    app.clear_text();
    app.state_mut().insert_str("가");
    app.clear_text();
    tally.add(kit::check(
        app.state().text().is_empty() && app.state().cursor_pos == 0,
        GROUP,
        section,
        "전체 지우기",
        "빈 편집칸",
    ));

    for (name, open, is_open) in [
        (
            "사용법",
            App::open_help as fn(&mut App),
            App::help_open as fn(&App) -> bool,
        ),
        (
            "정보",
            App::open_about as fn(&mut App),
            App::about_open as fn(&App) -> bool,
        ),
        (
            "설정",
            App::open_settings_window as fn(&mut App),
            App::settings_open as fn(&App) -> bool,
        ),
    ] {
        tally.add(kit::check(
            !is_open(&app),
            GROUP,
            section,
            &format!("{name} 열기 전"),
            "닫혀 있다",
        ));
        open(&mut app);
        frame(&mut app, &ctx);
        tally.add(kit::check(
            is_open(&app),
            GROUP,
            section,
            &format!("{name} 열림"),
            "창이 있다",
        ));
        open(&mut app);
        tally.add(kit::check(
            is_open(&app),
            GROUP,
            section,
            &format!("{name} 두 번"),
            "하나만",
        ));
        app.close_all();
        frame(&mut app, &ctx);
        tally.add(kit::check(
            !is_open(&app),
            GROUP,
            section,
            &format!("{name} 닫힘"),
            "손잡이 없음",
        ));

        app.clear_text();
        app.state_mut().set_mode(InputMode::Hangul);
        app.press(&ctx, Key::Num4);
        app.press(&ctx, Key::Num1);
        app.press(&ctx, Key::Num2);
        app.state_mut().commit();
        tally.add(kit::check(
            app.state().text() == "가",
            GROUP,
            section,
            &format!("{name} 닫은 뒤 입력"),
            &format!("{:?}", app.state().text()),
        ));
    }

    set_settings_path(None);
    let _ = std::fs::remove_dir_all(&dir);
    tally.assert_clean("스모크 심화");
}
