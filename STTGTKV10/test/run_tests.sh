#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODEL_DIR="${HOME}/.local/share/sttgtk/models"
MODELS=(tiny base small)

TOTAL_PASS=0
TOTAL_FAIL=0
PASS=0
FAIL=0

# Per-model result arrays (parallel)
M_NAMES=()
M_PASS=()
M_FAIL=()
M_SKIP=()

ok() { printf "  ✓  %-30s %s\n" "$1" "$2"; PASS=$((PASS+1)); TOTAL_PASS=$((TOTAL_PASS+1)); }
ng() { printf "  ✗  %-30s %s\n" "$1" "$2"; FAIL=$((FAIL+1)); TOTAL_FAIL=$((TOTAL_FAIL+1)); }

run_stt() {
    local wav="$1" label="$2" model_path="$3"
    local output result elapsed
    output=$("$SCRIPT_DIR/test_stt" "$model_path" "$SCRIPT_DIR/$wav" 2>/dev/null)
    result=$(echo "$output" | grep "RESULT:" | sed 's/  RESULT: //')
    elapsed=$(echo "$output" | grep "TIME:"   | sed 's/  TIME: //')
    if [ -n "$result" ]; then ok "$label" "→ $result (${elapsed})"
    else                       ng "$label" "→ (결과 없음)"
    fi
}

run_stt_suite() {
    local model_path="$1"

    echo ""
    echo "  ┌─ 일반 문장 ─────────────────────────────────┐"
    run_stt ko_test_1.wav            "ko_test_1"            "$model_path"
    run_stt ko_test_2.wav            "ko_test_2"            "$model_path"
    run_stt ko_test_3.wav            "ko_test_3"            "$model_path"
    echo "  └─────────────────────────────────────────────┘"

    echo ""
    echo "  ┌─ 경비 명령어 ───────────────────────────────┐"
    run_stt guard_chulgeun1.wav      "guard_chulgeun1"      "$model_path"
    run_stt guard_chulgeun2.wav      "guard_chulgeun2"      "$model_path"
    run_stt guard_toigeun1.wav       "guard_toigeun1"       "$model_path"
    run_stt guard_toigeun2.wav       "guard_toigeun2"       "$model_path"
    run_stt guard_gyeongbi1.wav      "guard_gyeongbi1"      "$model_path"
    run_stt guard_gyeongbi2.wav      "guard_gyeongbi2"      "$model_path"
    run_stt guard_haeje1.wav         "guard_haeje1"         "$model_path"
    run_stt guard_haeje2.wav         "guard_haeje2"         "$model_path"
    run_stt guard_mixed1.wav         "guard_mixed1"         "$model_path"
    run_stt guard_mixed2.wav         "guard_mixed2"         "$model_path"
    run_stt guard_mixed3.wav         "guard_mixed3"         "$model_path"
    echo "  └─────────────────────────────────────────────┘"

    echo ""
    echo "  ┌─ 짧은 명령어 ───────────────────────────────┐"
    run_stt extra_short_chulgeun.wav "extra_short_chulgeun" "$model_path"
    run_stt extra_short_toigeun.wav  "extra_short_toigeun"  "$model_path"
    run_stt extra_short_gyeongbi.wav "extra_short_gyeongbi" "$model_path"
    run_stt extra_short_haeje.wav    "extra_short_haeje"    "$model_path"
    run_stt extra_short_ne.wav       "extra_short_ne"       "$model_path"
    run_stt extra_short_yes.wav      "extra_short_yes"      "$model_path"
    echo "  └─────────────────────────────────────────────┘"

    echo ""
    echo "  ┌─ 추가 문장 ─────────────────────────────────┐"
    run_stt extra_sentence_1.wav     "extra_sentence_1"     "$model_path"
    run_stt extra_sentence_2.wav     "extra_sentence_2"     "$model_path"
    run_stt extra_sentence_3.wav     "extra_sentence_3"     "$model_path"
    run_stt extra_sentence_4.wav     "extra_sentence_4"     "$model_path"
    echo "  └─────────────────────────────────────────────┘"
}

# ════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  STT Korean – 테스트 실행                ║"
echo "╚══════════════════════════════════════════╝"

# ── [1] 필터 단위 테스트 ─────────────────────────────────────────────────────
echo ""
echo "━━━ [1] 필터 단위 테스트 ━━━━━━━━━━━━━━━━━━━━━━"
echo ""
"$SCRIPT_DIR/test_filter"
if [ $? -eq 0 ]; then
    FILTER_RESULT="✓  35 / 35"
    TOTAL_PASS=$((TOTAL_PASS + 1))
else
    FILTER_RESULT="✗  실패"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
fi

# ── [2] 모델별 STT 통합 테스트 ───────────────────────────────────────────────
echo ""
echo "━━━ [2] STT 통합 테스트 ━━━━━━━━━━━━━━━━━━━━━━━"

for m in "${MODELS[@]}"; do
    model_path="$MODEL_DIR/ggml-${m}.bin"
    echo ""
    echo "  ══ 모델: ${m} ══════════════════════════════════"

    if [ ! -f "$model_path" ]; then
        echo "  [건너뜀] 파일 없음: $model_path"
        M_NAMES+=("$m"); M_PASS+=(0); M_FAIL+=(0); M_SKIP+=(1)
        continue
    fi

    PASS=0; FAIL=0
    run_stt_suite "$model_path"
    echo ""
    printf "  소계: %d 통과 / %d 실패\n" "$PASS" "$FAIL"
    M_NAMES+=("$m"); M_PASS+=("$PASS"); M_FAIL+=("$FAIL"); M_SKIP+=(0)
done

# ── [3] 최종 결과 ────────────────────────────────────────────────────────────
echo ""
echo "━━━ [3] 최종 결과 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
printf "  %-10s  %s\n"  "필터"    "$FILTER_RESULT"
echo "  ──────────────────────────────"
for i in "${!M_NAMES[@]}"; do
    name="${M_NAMES[$i]}"
    p="${M_PASS[$i]}"
    f="${M_FAIL[$i]}"
    if [ "${M_SKIP[$i]}" -eq 1 ]; then
        printf "  %-10s  (건너뜀)\n" "$name"
    else
        total_m=$((p + f))
        if [ "$f" -eq 0 ]; then mark="✓"
        else                    mark="✗"
        fi
        printf "  %-10s  %s  %d / %d\n" "$name" "$mark" "$p" "$total_m"
    fi
done
echo "  ──────────────────────────────"
GRAND=$((TOTAL_PASS + TOTAL_FAIL))
if [ $TOTAL_FAIL -eq 0 ]; then
    printf "  %-10s  ✓  %d / %d\n\n" "전체" "$TOTAL_PASS" "$GRAND"
else
    printf "  %-10s  ✗  %d 통과 / %d 실패 / %d 전체\n\n" \
           "전체" "$TOTAL_PASS" "$TOTAL_FAIL" "$GRAND"
fi
[ $TOTAL_FAIL -eq 0 ]
