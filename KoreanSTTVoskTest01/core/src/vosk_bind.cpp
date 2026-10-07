#include "vosk_bind.h"

#include <vector>

#include "paths.h"

#if defined(_WIN32)
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace kstt {
namespace {

#if defined(_WIN32)
std::string lastOsError() {
    const DWORD code = GetLastError();
    if (code == 0) return "unknown error";
    char* text = nullptr;
    const DWORD n = FormatMessageA(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr, code, 0, reinterpret_cast<char*>(&text), 0, nullptr);
    std::string out = n && text ? std::string(text, n) : ("error " + std::to_string(code));
    if (text) LocalFree(text);
    while (!out.empty() && (out.back() == '\n' || out.back() == '\r')) out.pop_back();
    return out;
}

void* osLoad(const std::string& path) {
    const std::wstring wide = utf8ToWide(path);
    // 의존 DLL(libgcc/libstdc++/libwinpthread)이 같은 폴더에 있으므로 그 폴더도 탐색시킨다.
    return reinterpret_cast<void*>(
        LoadLibraryExW(wide.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH));
}

void* osSymbol(void* handle, const char* name) {
    return reinterpret_cast<void*>(GetProcAddress(static_cast<HMODULE>(handle), name));
}

void osUnload(void* handle) { FreeLibrary(static_cast<HMODULE>(handle)); }
#else
std::string lastOsError() {
    const char* e = dlerror();
    return e ? std::string(e) : std::string("unknown error");
}

void* osLoad(const std::string& path) { return dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL); }
void* osSymbol(void* handle, const char* name) { return dlsym(handle, name); }
void osUnload(void* handle) { dlclose(handle); }
#endif

}  // namespace

const char* voskLibraryFileName() {
#if defined(_WIN32)
    return "libvosk.dll";
#elif defined(__APPLE__)
    return "libvosk.dylib";
#else
    return "libvosk.so";
#endif
}

VoskLibrary::~VoskLibrary() { unload(); }

void VoskLibrary::unload() {
    if (handle_) {
        osUnload(handle_);
        handle_ = nullptr;
    }
    path_.clear();
    model_new = nullptr;
    model_free = nullptr;
    recognizer_new = nullptr;
    recognizer_new_grm = nullptr;
    model_find_word = nullptr;
    recognizer_free = nullptr;
    recognizer_set_words = nullptr;
    recognizer_set_partial_words = nullptr;
    recognizer_set_max_alternatives = nullptr;
    recognizer_accept_waveform_s = nullptr;
    recognizer_result = nullptr;
    recognizer_partial_result = nullptr;
    recognizer_final_result = nullptr;
    recognizer_reset = nullptr;
    set_log_level = nullptr;
}

bool VoskLibrary::load(const std::string& path, std::string* err) {
    unload();

    std::vector<std::string> candidates;
    if (!path.empty()) {
        candidates.push_back(path);
        // 디렉터리를 받았으면 그 안의 파일을 본다.
        if (isDirectory(path)) candidates.push_back(joinPath(path, voskLibraryFileName()));
    } else {
        candidates = voskLibraryCandidates();
    }

    std::string tried;
    for (const std::string& candidate : candidates) {
        void* h = osLoad(candidate);
        if (!h) {
            tried += "\n  " + candidate + " : " + lastOsError();
            continue;
        }
        handle_ = h;
        path_ = candidate;
        break;
    }

    if (!handle_) {
        if (err) {
            *err = std::string("could not load ") + voskLibraryFileName() + "; tried:" +
                   (tried.empty() ? std::string("\n  (no candidate paths)") : tried);
        }
        return false;
    }

    struct Binding {
        const char* name;
        void** slot;
        bool required;
    };
    const Binding bindings[] = {
        {"vosk_model_new", reinterpret_cast<void**>(&model_new), true},
        {"vosk_model_free", reinterpret_cast<void**>(&model_free), true},
        {"vosk_recognizer_new", reinterpret_cast<void**>(&recognizer_new), true},
        {"vosk_recognizer_new_grm", reinterpret_cast<void**>(&recognizer_new_grm), false},
        {"vosk_model_find_word", reinterpret_cast<void**>(&model_find_word), false},
        {"vosk_recognizer_free", reinterpret_cast<void**>(&recognizer_free), true},
        {"vosk_recognizer_set_words", reinterpret_cast<void**>(&recognizer_set_words), false},
        {"vosk_recognizer_set_partial_words",
         reinterpret_cast<void**>(&recognizer_set_partial_words), false},
        {"vosk_recognizer_set_max_alternatives",
         reinterpret_cast<void**>(&recognizer_set_max_alternatives), false},
        {"vosk_recognizer_accept_waveform_s",
         reinterpret_cast<void**>(&recognizer_accept_waveform_s), true},
        {"vosk_recognizer_result", reinterpret_cast<void**>(&recognizer_result), true},
        {"vosk_recognizer_partial_result", reinterpret_cast<void**>(&recognizer_partial_result),
         true},
        {"vosk_recognizer_final_result", reinterpret_cast<void**>(&recognizer_final_result), true},
        {"vosk_recognizer_reset", reinterpret_cast<void**>(&recognizer_reset), false},
        {"vosk_set_log_level", reinterpret_cast<void**>(&set_log_level), false},
    };

    for (const Binding& b : bindings) {
        void* sym = osSymbol(handle_, b.name);
        if (!sym && b.required) {
            const std::string missing = b.name;
            const std::string where = path_;
            unload();
            if (err) *err = "symbol " + missing + " missing in " + where;
            return false;
        }
        *b.slot = sym;
    }
    return true;
}

}  // namespace kstt
