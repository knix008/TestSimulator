// core/include/kstt/text_width.h
//
// UTF-8 문자열의 "보이는 폭" 계산. 한글·한자·전각 문자는 터미널에서 두 칸을
// 차지하므로, printf 의 %-12s 처럼 바이트 수로 맞추면 표가 어긋난다. 콘솔
// 프런트엔드와 시험 출력이 이 함수들로 칸을 맞춘다.
#pragma once

#include <cstddef>
#include <string>

namespace kstt {

// 터미널에서 차지하는 칸 수 (한글/한자/전각 = 2, 결합 문자 = 0)
size_t displayWidth(const std::string& utf8);

// 보이는 폭이 columns 를 넘지 않도록 자른다 (문자 중간에서 자르지 않는다).
std::string truncateToWidth(const std::string& utf8, size_t columns);

// 보이는 폭이 columns 가 되도록 오른쪽에 공백을 채운다. 넘치면 잘라 낸다.
std::string padRight(const std::string& utf8, size_t columns);

}  // namespace kstt
