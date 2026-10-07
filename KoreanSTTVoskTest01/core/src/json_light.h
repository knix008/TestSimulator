// core/src/json_light.h
//
// Vosk 가 돌려주는 JSON 한 줄을 읽기 위한 최소 JSON 파서. 외부 의존성을 들이지
// 않으려고 직접 두었다. 코어 내부 전용.
#pragma once

#include <map>
#include <string>
#include <vector>

namespace kstt::json {

struct Value;
using Object = std::map<std::string, Value>;
using Array = std::vector<Value>;

struct Value {
    enum class Type { Null, Bool, Number, String, Array, Object };

    Type type = Type::Null;
    bool boolean = false;
    double number = 0.0;
    std::string string;  // UTF-8 로 디코딩된 문자열
    Array array;
    Object object;

    // 객체일 때 키 찾기. 없으면 nullptr.
    const Value* find(const std::string& key) const;

    std::string stringOr(const std::string& key, const std::string& fallback = {}) const;
    double numberOr(const std::string& key, double fallback = 0.0) const;
};

// 성공하면 true. 실패하면 err 에 사유(위치 포함)를 채운다.
bool parse(const std::string& text, Value* out, std::string* err);

}  // namespace kstt::json
