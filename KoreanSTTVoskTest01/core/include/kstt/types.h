// core/include/kstt/types.h
//
// STT 코어가 외부에 노출하는 값 타입들. GUI/플랫폼 의존성 없음.
#pragma once

#include <string>
#include <vector>

namespace kstt {

// 인식된 낱말 하나 (EngineConfig::withWords 가 켜진 경우에만 채워진다)
struct Word {
    std::string text;
    double start = 0.0;  // 초
    double end = 0.0;    // 초
    double conf = 0.0;   // 0..1
};

// 인식 결과 한 덩어리
struct Transcript {
    std::string text;
    std::vector<Word> words;
    bool isFinal = false;
};

enum class EngineState {
    Unloaded,  // 모델 없음
    Loading,   // 모델 적재 중
    Ready,     // 모델 적재됨, 인식 대기
    Running,   // 인식 중
    Error,     // 오류 (lastError 참조)
};

const char* toString(EngineState state);

// 진행 중(부분) 결과를 어떻게 내보낼지.
//
// 인식기는 말이 끝나기 전까지 추측을 계속 고쳐 쓴다("참 좋 습니까" → "참 초" →
// "참 좋습니다"). 그대로 보여 주면 글자가 쉴 새 없이 바뀌어 거슬리므로, 기본은
// 직전 추측과 겹치는 앞부분만 보여 준다.
enum class PartialMode {
    Off,     // 부분 결과를 아예 내보내지 않는다 (확정 문장만)
    Stable,  // 직전 추측과 공통인 앞부분만 (기본)
    Raw,     // 인식기가 주는 그대로
};

struct EngineConfig {
    std::string modelPath;    // 모델 디렉터리. 비우면 findDefaultModel() 결과 사용
    std::string voskLibPath;  // libvosk 경로. 비우면 자동 탐색
    int sampleRate = 16000;   // Vosk 한국어 모델 기본값
    bool withWords = false;   // 낱말 단위 타임스탬프를 Transcript 에 담을지
    int maxAlternatives = 0;  // 0 = 단일 가설
    int logLevel = -1;        // Vosk 내부 로그 (-1 = 끔)

    // --- 말하지 않은 것을 받아쓰지 않기 위한 설정 ---

    // 소리가 들어오지 않은 구간의 결과를 버린다. 잡음·기침·키보드 소리에
    // 인식기가 아무 낱말이나 붙이는 것을 막는다.
    bool gateSilence = true;

    // 유성음으로 칠 RMS 기준(0..1). 0 이면 잡음 바닥을 추적해 자동으로 정한다.
    float silenceThreshold = 0.0f;

    // 한 구간에 이만큼은 소리가 있어야 결과로 인정한다.
    int minSpeechMillis = 200;

    // 이 신뢰도에 못 미치는 낱말은 결과에서 뺀다. 0 이면 거르지 않는다.
    // (인식기가 자신 없게 끼워 넣은 어미·낱말을 떨어낸다)
    float minConfidence = 0.4f;

    // 소리가 사람 목소리다운지 보는 잣대. 선풍기·키보드·바람 소리는 에너지만
    // 보면 말소리와 구별되지 않아서, 영교차율(소리가 0 을 가로지르는 빈도)도 함께
    // 본다. 말소리는 낮고(0.02~0.3) 쉭쉭거리는 잡음은 높다(0.4 이상).
    // 1 이상이면 이 검사를 끈다.
    float maxZeroCrossingRate = 0.35f;

    // 인식된 낱말이 차지한 시간 동안 실제로 목소리가 나고 있어야 하는 비율.
    // 짧은 소음이 긴 낱말로 둔갑하는 것을 막는다. 0 이면 끔.
    float minVoicedFraction = 0.6f;

    // 낱말 하나가 이보다 길면 버린다(초). 소음을 길게 늘여 맞춘 결과를 걸러낸다.
    // 0 이면 끔.
    double maxWordSeconds = 2.0;

    PartialMode partialMode = PartialMode::Stable;

    // 받아쓸 말을 이 목록으로 한정한다 (예: {"출근", "퇴근"}).
    // 비어 있으면 자유 받아쓰기. 자세한 것은 kstt/vocabulary.h 참고.
    std::vector<std::string> vocabulary;
};

// 오디오 입력 장치 하나
struct AudioDevice {
    int id = -1;  // 플랫폼 장치 번호 (-1 = 시스템 기본)
    std::string name;
};

}  // namespace kstt
