#include "json_light.h"

#include <cctype>
#include <cstring>
#include <cstdlib>

namespace kstt::json {
namespace {

struct Parser {
    const std::string& s;
    size_t i = 0;
    std::string err;

    explicit Parser(const std::string& text) : s(text) {}

    void skipWs() {
        while (i < s.size()) {
            const char c = s[i];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r')
                ++i;
            else
                break;
        }
    }

    bool fail(const std::string& what) {
        if (err.empty()) err = what + " (offset " + std::to_string(i) + ")";
        return false;
    }

    bool literal(const char* lit) {
        const size_t n = std::strlen(lit);
        if (s.compare(i, n, lit) != 0) return fail(std::string("expected ") + lit);
        i += n;
        return true;
    }

    // UTF-8 로 코드포인트 하나를 덧붙인다.
    static void appendUtf8(std::string& out, unsigned int cp) {
        if (cp <= 0x7F) {
            out.push_back(static_cast<char>(cp));
        } else if (cp <= 0x7FF) {
            out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else if (cp <= 0xFFFF) {
            out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else {
            out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        }
    }

    bool hex4(unsigned int* out) {
        if (i + 4 > s.size()) return fail("truncated \\u escape");
        unsigned int v = 0;
        for (int k = 0; k < 4; ++k) {
            const char c = s[i + k];
            v <<= 4;
            if (c >= '0' && c <= '9')
                v |= static_cast<unsigned>(c - '0');
            else if (c >= 'a' && c <= 'f')
                v |= static_cast<unsigned>(c - 'a' + 10);
            else if (c >= 'A' && c <= 'F')
                v |= static_cast<unsigned>(c - 'A' + 10);
            else
                return fail("bad hex digit in \\u escape");
        }
        i += 4;
        *out = v;
        return true;
    }

    bool parseString(std::string* out) {
        if (i >= s.size() || s[i] != '"') return fail("expected string");
        ++i;
        out->clear();
        while (true) {
            if (i >= s.size()) return fail("unterminated string");
            const char c = s[i++];
            if (c == '"') return true;
            if (c != '\\') {
                out->push_back(c);
                continue;
            }
            if (i >= s.size()) return fail("unterminated escape");
            const char e = s[i++];
            switch (e) {
                case '"': out->push_back('"'); break;
                case '\\': out->push_back('\\'); break;
                case '/': out->push_back('/'); break;
                case 'b': out->push_back('\b'); break;
                case 'f': out->push_back('\f'); break;
                case 'n': out->push_back('\n'); break;
                case 'r': out->push_back('\r'); break;
                case 't': out->push_back('\t'); break;
                case 'u': {
                    unsigned int cp = 0;
                    if (!hex4(&cp)) return false;
                    // 서러게이트 쌍 (한글은 BMP 안이라 보통 안 쓰이지만 이모지 등에 필요)
                    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < s.size() && s[i] == '\\' &&
                        s[i + 1] == 'u') {
                        const size_t save = i;
                        i += 2;
                        unsigned int lo = 0;
                        if (!hex4(&lo)) return false;
                        if (lo >= 0xDC00 && lo <= 0xDFFF) {
                            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                        } else {
                            i = save;  // 짝이 아니면 되돌린다
                        }
                    }
                    appendUtf8(*out, cp);
                    break;
                }
                default: return fail("unknown escape");
            }
        }
    }

    bool parseValue(Value* out) {
        skipWs();
        if (i >= s.size()) return fail("unexpected end of input");
        const char c = s[i];
        if (c == '{') return parseObject(out);
        if (c == '[') return parseArray(out);
        if (c == '"') {
            out->type = Value::Type::String;
            return parseString(&out->string);
        }
        if (c == 't') {
            if (!literal("true")) return false;
            out->type = Value::Type::Bool;
            out->boolean = true;
            return true;
        }
        if (c == 'f') {
            if (!literal("false")) return false;
            out->type = Value::Type::Bool;
            out->boolean = false;
            return true;
        }
        if (c == 'n') {
            if (!literal("null")) return false;
            out->type = Value::Type::Null;
            return true;
        }
        return parseNumber(out);
    }

    bool parseNumber(Value* out) {
        const size_t start = i;
        if (i < s.size() && (s[i] == '-' || s[i] == '+')) ++i;
        bool digits = false;
        while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
            ++i;
            digits = true;
        }
        if (i < s.size() && s[i] == '.') {
            ++i;
            while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
                ++i;
                digits = true;
            }
        }
        if (digits && i < s.size() && (s[i] == 'e' || s[i] == 'E')) {
            ++i;
            if (i < s.size() && (s[i] == '-' || s[i] == '+')) ++i;
            while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) ++i;
        }
        if (!digits) return fail("expected value");
        out->type = Value::Type::Number;
        out->number = std::strtod(s.substr(start, i - start).c_str(), nullptr);
        return true;
    }

    bool parseArray(Value* out) {
        ++i;  // '['
        out->type = Value::Type::Array;
        skipWs();
        if (i < s.size() && s[i] == ']') {
            ++i;
            return true;
        }
        while (true) {
            Value item;
            if (!parseValue(&item)) return false;
            out->array.push_back(std::move(item));
            skipWs();
            if (i < s.size() && s[i] == ',') {
                ++i;
                continue;
            }
            if (i < s.size() && s[i] == ']') {
                ++i;
                return true;
            }
            return fail("expected ',' or ']'");
        }
    }

    bool parseObject(Value* out) {
        ++i;  // '{'
        out->type = Value::Type::Object;
        skipWs();
        if (i < s.size() && s[i] == '}') {
            ++i;
            return true;
        }
        while (true) {
            skipWs();
            std::string key;
            if (!parseString(&key)) return false;
            skipWs();
            if (i >= s.size() || s[i] != ':') return fail("expected ':'");
            ++i;
            Value item;
            if (!parseValue(&item)) return false;
            out->object[key] = std::move(item);
            skipWs();
            if (i < s.size() && s[i] == ',') {
                ++i;
                continue;
            }
            if (i < s.size() && s[i] == '}') {
                ++i;
                return true;
            }
            return fail("expected ',' or '}'");
        }
    }
};

}  // namespace

const Value* Value::find(const std::string& key) const {
    if (type != Type::Object) return nullptr;
    const auto it = object.find(key);
    return it == object.end() ? nullptr : &it->second;
}

std::string Value::stringOr(const std::string& key, const std::string& fallback) const {
    const Value* v = find(key);
    return (v && v->type == Type::String) ? v->string : fallback;
}

double Value::numberOr(const std::string& key, double fallback) const {
    const Value* v = find(key);
    return (v && v->type == Type::Number) ? v->number : fallback;
}

bool parse(const std::string& text, Value* out, std::string* err) {
    Parser p(text);
    Value v;
    if (!p.parseValue(&v)) {
        if (err) *err = p.err;
        return false;
    }
    p.skipWs();
    if (p.i != text.size()) {
        if (err) *err = "trailing characters (offset " + std::to_string(p.i) + ")";
        return false;
    }
    *out = std::move(v);
    return true;
}

}  // namespace kstt::json
