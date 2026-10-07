// core/include/kstt/vocabulary.h
//
// 받아쓸 말을 몇 개로 한정하는 기능.
//
// Vosk 는 들어온 소리에 어떻게든 낱말을 붙이려 하기 때문에, 자유 받아쓰기로는
// "출근" 을 "출그", "축근" 처럼 흘리거나 하지도 않은 말을 만들어 낸다. 받을 말이
// 정해져 있다면 인식기에 **문법**을 주어 그 말들만 후보로 두는 편이 훨씬 정확하다
// (Vosk 의 vosk_recognizer_new_grm).
//
// 목록이 비어 있으면 자유 받아쓰기로 동작한다.
#pragma once

#include <string>
#include <vector>

namespace kstt {

// 이 프로그램이 기본으로 받는 말. 바꾸려면 여기 한 곳만 고치면 된다.
const std::vector<std::string>& defaultVocabulary();

// "출근, 퇴근" 또는 "출근 퇴근" 처럼 적힌 것을 목록으로 바꾼다.
std::vector<std::string> parseVocabulary(const std::string& text);

// 목록을 "출근, 퇴근" 형태로 되돌린다 (설정 칸에 보여 줄 때).
std::string formatVocabulary(const std::vector<std::string>& words);

// 문법에 함께 넣는 "미끼" 낱말들 — 흔한 한국어 낱말 모음.
//
// 한국어 소형 모델은 Vosk 의 "[unk]"(이 중 어느 것도 아님)를 모른다. 그래서
// 문법에 받을 말만 주면 인식기가 **모든 소리를 그 말들로 억지로 맞춘다**.
// 빠져나갈 곳을 함께 주고, 결과에서는 받을 말만 남기는 것이 이 목록의 쓰임이다.
const std::vector<std::string>& decoyWords();

// Vosk 에 넘길 문법 JSON 을 만든다.
//   words        : 받을 말
//   decoys       : 함께 넣을 미끼 (결과에서는 걸러진다)
//   includeUnknownToken : 모델이 "[unk]" 를 알 때만 참으로 준다
std::string buildGrammarJson(const std::vector<std::string>& words,
                             const std::vector<std::string>& decoys = {},
                             bool includeUnknownToken = false);

}  // namespace kstt
