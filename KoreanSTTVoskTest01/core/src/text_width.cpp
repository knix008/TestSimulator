#include "kstt/text_width.h"

namespace kstt {
namespace {

// UTF-8 한 글자를 읽는다. 잘못된 바이트는 1바이트 폭 1로 넘긴다.
// 반환값은 소비한 바이트 수.
size_t decodeUtf8(const std::string& s, size_t i, unsigned int* codePoint) {
    const unsigned char c = static_cast<unsigned char>(s[i]);
    if (c < 0x80) {
        *codePoint = c;
        return 1;
    }
    size_t length = 0;
    unsigned int cp = 0;
    if ((c & 0xE0) == 0xC0) {
        length = 2;
        cp = c & 0x1Fu;
    } else if ((c & 0xF0) == 0xE0) {
        length = 3;
        cp = c & 0x0Fu;
    } else if ((c & 0xF8) == 0xF0) {
        length = 4;
        cp = c & 0x07u;
    } else {
        *codePoint = c;  // 이어지는 바이트가 홀로 왔다
        return 1;
    }
    if (i + length > s.size()) {
        *codePoint = c;
        return 1;
    }
    for (size_t k = 1; k < length; ++k) {
        const unsigned char cont = static_cast<unsigned char>(s[i + k]);
        if ((cont & 0xC0) != 0x80) {
            *codePoint = c;
            return 1;
        }
        cp = (cp << 6) | (cont & 0x3Fu);
    }
    *codePoint = cp;
    return length;
}

int widthOf(unsigned int cp) {
    // 결합 문자 (한글 자모 결합 영역 포함) 는 폭 0
    if ((cp >= 0x0300 && cp <= 0x036F) || (cp >= 0x1AB0 && cp <= 0x1AFF) ||
        (cp >= 0x20D0 && cp <= 0x20FF) || (cp >= 0xFE20 && cp <= 0xFE2F) ||
        (cp >= 0x1160 && cp <= 0x11FF))
        return 0;

    // 두 칸 차지하는 영역 (한글, 한자, 가나, 전각 기호 등)
    if ((cp >= 0x1100 && cp <= 0x115F) ||  // 한글 초성
        (cp >= 0x2E80 && cp <= 0x303E) ||  // CJK 부수·기호
        (cp >= 0x3041 && cp <= 0x33FF) ||  // 가나, 한글 호환 자모, CJK 기호
        (cp >= 0x3400 && cp <= 0x4DBF) ||  // CJK 확장 A
        (cp >= 0x4E00 && cp <= 0x9FFF) ||  // CJK 기본
        (cp >= 0xA000 && cp <= 0xA4CF) ||  // 이족 문자
        (cp >= 0xAC00 && cp <= 0xD7A3) ||  // 한글 음절
        (cp >= 0xF900 && cp <= 0xFAFF) ||  // CJK 호환 한자
        (cp >= 0xFE30 && cp <= 0xFE6F) ||  // CJK 호환 형태
        (cp >= 0xFF00 && cp <= 0xFF60) ||  // 전각 영문·기호
        (cp >= 0xFFE0 && cp <= 0xFFE6) ||  // 전각 통화 기호
        (cp >= 0x1F300 && cp <= 0x1F64F) ||  // 그림문자
        (cp >= 0x1F900 && cp <= 0x1F9FF) || (cp >= 0x20000 && cp <= 0x3FFFD))
        return 2;

    return 1;
}

}  // namespace

size_t displayWidth(const std::string& utf8) {
    size_t width = 0;
    for (size_t i = 0; i < utf8.size();) {
        unsigned int cp = 0;
        i += decodeUtf8(utf8, i, &cp);
        width += static_cast<size_t>(widthOf(cp));
    }
    return width;
}

std::string truncateToWidth(const std::string& utf8, size_t columns) {
    size_t width = 0;
    for (size_t i = 0; i < utf8.size();) {
        unsigned int cp = 0;
        const size_t bytes = decodeUtf8(utf8, i, &cp);
        const size_t next = width + static_cast<size_t>(widthOf(cp));
        if (next > columns) return utf8.substr(0, i);
        width = next;
        i += bytes;
    }
    return utf8;
}

std::string padRight(const std::string& utf8, size_t columns) {
    std::string out = truncateToWidth(utf8, columns);
    const size_t width = displayWidth(out);
    if (width < columns) out.append(columns - width, ' ');
    return out;
}

}  // namespace kstt
