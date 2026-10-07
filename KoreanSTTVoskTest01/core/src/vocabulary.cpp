#include "kstt/vocabulary.h"

#include <algorithm>

#include "../src/decoy_words.inc"

namespace kstt {
namespace {

bool isSeparator(char c) {
    return c == ',' || c == ';' || c == '|' || c == ' ' || c == '\t' || c == '\n' || c == '\r';
}

// JSON 문자열로 안전하게 감싼다. 한글은 UTF-8 그대로 두면 된다.
std::string quote(const std::string& word) {
    std::string out = "\"";
    for (const char c : word) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    static const char* hex = "0123456789abcdef";
                    out += "\\u00";
                    out += hex[(c >> 4) & 0xF];
                    out += hex[c & 0xF];
                } else {
                    out += c;
                }
        }
    }
    out += "\"";
    return out;
}

}  // namespace

const std::vector<std::string>& defaultVocabulary() {
    static const std::vector<std::string> words = {"출근", "퇴근"};
    return words;
}

std::vector<std::string> parseVocabulary(const std::string& text) {
    std::vector<std::string> words;
    size_t i = 0;
    while (i < text.size()) {
        while (i < text.size() && isSeparator(text[i])) ++i;
        const size_t start = i;
        while (i < text.size() && !isSeparator(text[i])) ++i;
        if (i > start) {
            std::string word = text.substr(start, i - start);
            if (std::find(words.begin(), words.end(), word) == words.end())
                words.push_back(std::move(word));
        }
    }
    return words;
}

std::string formatVocabulary(const std::vector<std::string>& words) {
    std::string out;
    for (const std::string& word : words) {
        if (!out.empty()) out += ", ";
        out += word;
    }
    return out;
}

const std::vector<std::string>& decoyWords() {
    static const std::vector<std::string> words(
        std::begin(kDecoyWords), std::end(kDecoyWords));
    return words;
}

std::string buildGrammarJson(const std::vector<std::string>& words,
                             const std::vector<std::string>& decoys,
                             bool includeUnknownToken) {
    if (words.empty()) return {};

    std::vector<std::string> all = words;
    for (const std::string& decoy : decoys) {
        if (std::find(all.begin(), all.end(), decoy) == all.end()) all.push_back(decoy);
    }

    std::string out = "[";
    for (const std::string& word : all) {
        if (out.size() > 1) out += ",";
        out += quote(word);
    }
    // 모델이 아는 경우에만. 한국어 소형 모델은 "[unk]" 를 모르며, 그럴 때는
    // 미끼 낱말이 그 역할을 대신한다.
    if (includeUnknownToken) out += ",\"[unk]\"";
    out += "]";
    return out;
}

}  // namespace kstt
