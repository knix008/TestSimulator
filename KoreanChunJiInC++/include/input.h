/*
 * input.h - 천지인 입력 오토마타 및 GUI 연동 API
 *
 * chunjiin.c 가 "../include/input.h" 로 참조하는 헤더이다.
 * chunjiin_process_input() 이 호출하는 6개 함수와, GUI 가 쓰는
 * 편집/모드 전환 API 를 선언한다. 구현은 src/input.c 에 있다.
 */
#ifndef INPUT_H
#define INPUT_H

#include "chunjiin.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ---- chunjiin_process_input() 이 호출하는 오토마타 ---- */
void hangul_make(ChunjiinState *state, int input);
void write_hangul(ChunjiinState *state);
void eng_make(ChunjiinState *state, int input);
void num_make(ChunjiinState *state, int input);
void special_make(ChunjiinState *state, int input);
void write_engnum(ChunjiinState *state);

/* ---- GUI 에서 쓰는 편집 API ---- */

/* chunjiin_init() 에 더해 확장 필드까지 초기화한다. 새 상태는 항상 이걸로 시작. */
void chunjiin_reset(ChunjiinState *state);

/* 조합 중인 글자를 확정한다(더 이상 수정되지 않게 만든다). */
void chunjiin_commit(ChunjiinState *state);

/* 임의의 문자를 커서 위치에 그대로 넣는다(공백, 줄바꿈, 물리 키보드 직접 입력). */
void chunjiin_insert_char(ChunjiinState *state, wchar_t ch);

/* 공백 입력. 조합을 확정한 뒤 space 를 넣는다. */
void chunjiin_space(ChunjiinState *state);

/* 백스페이스. 조합 중이면 낱자 단위로 되돌리고, 아니면 글자를 지운다. */
void chunjiin_backspace(ChunjiinState *state);

/* 커서 이동 (delta 만큼). 조합은 확정된다. */
void chunjiin_move_cursor(ChunjiinState *state, int delta);

/* 커서를 절대 위치로 옮긴다. 조합은 확정된다. */
void chunjiin_set_cursor(ChunjiinState *state, int pos);

/* 전체 지우기 */
void chunjiin_clear(ChunjiinState *state);

/* 입력 모드 변경. 조합은 확정된다. */
void chunjiin_set_mode(ChunjiinState *state, InputMode mode);

/* 한글 -> 영소 -> 영대 -> 숫자 -> 기호 -> 한글 순환 */
void chunjiin_cycle_mode(ChunjiinState *state);

/* 현재 모드에서 키 인덱스(0~11)에 표시할 라벨. 정적 문자열을 돌려준다. */
const wchar_t *chunjiin_key_label(const ChunjiinState *state, int key);

/* 현재 모드 이름 ("한글", "영문 abc" ...) */
const wchar_t *chunjiin_mode_name(const ChunjiinState *state);

/* 조합 중인 낱자 상태를 사람이 읽을 수 있는 문자열로 만든다(상태 표시줄용). */
void chunjiin_composition_text(const ChunjiinState *state, wchar_t *out, size_t out_len);

/* 멀티탭 연타 시간이 지났음을 알린다(다음 같은 키는 새 문자로 시작). */
void chunjiin_break_multitap(ChunjiinState *state);

#ifdef __cplusplus
}
#endif

#endif /* INPUT_H */
