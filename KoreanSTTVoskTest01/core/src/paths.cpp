#include "paths.h"

#include <algorithm>
#include <cstdlib>
#include <filesystem>

#include "vosk_bind.h"

#if defined(_WIN32)
#include <windows.h>
#elif defined(__APPLE__)
#include <mach-o/dyld.h>
#else
#include <unistd.h>
#endif

namespace fs = std::filesystem;

namespace kstt {

#if defined(_WIN32)
std::wstring utf8ToWide(const std::string& s) {
    if (s.empty()) return {};
    const int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
    std::wstring out(static_cast<size_t>(n), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), out.data(), n);
    return out;
}

std::string wideToUtf8(const std::wstring& s) {
    if (s.empty()) return {};
    const int n =
        WideCharToMultiByte(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0, nullptr,
                            nullptr);
    std::string out(static_cast<size_t>(n), '\0');
    WideCharToMultiByte(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), out.data(), n, nullptr,
                        nullptr);
    return out;
}
#endif

std::string executablePath() {
#if defined(_WIN32)
    std::wstring buf(1024, L'\0');
    const DWORD n = GetModuleFileNameW(nullptr, buf.data(), static_cast<DWORD>(buf.size()));
    if (n == 0) return {};
    buf.resize(n);
    return wideToUtf8(buf);
#elif defined(__APPLE__)
    char buf[4096];
    uint32_t size = sizeof(buf);
    if (_NSGetExecutablePath(buf, &size) != 0) return {};
    std::error_code ec;
    const fs::path resolved = fs::canonical(fs::path(buf), ec);
    return ec ? std::string(buf) : resolved.string();
#else
    std::error_code ec;
    const fs::path p = fs::read_symlink("/proc/self/exe", ec);
    return ec ? std::string() : p.string();
#endif
}

std::string executableDir() {
    const std::string exe = executablePath();
    if (exe.empty()) return {};
    return fs::path(exe).parent_path().string();
}

std::string joinPath(const std::string& a, const std::string& b) {
    if (a.empty()) return b;
    if (b.empty()) return a;
    return (fs::path(a) / b).string();
}

bool isDirectory(const std::string& path) {
    std::error_code ec;
    return fs::is_directory(path, ec);
}

bool isFile(const std::string& path) {
    std::error_code ec;
    return fs::is_regular_file(path, ec);
}

std::string envOrEmpty(const char* name) {
    const char* v = std::getenv(name);
    return v ? std::string(v) : std::string();
}

std::vector<std::string> searchRoots() {
    std::vector<std::string> roots;
    const auto push = [&roots](const std::string& p) {
        if (p.empty() || !isDirectory(p)) return;
        std::error_code ec;
        const std::string norm = fs::weakly_canonical(p, ec).string();
        const std::string key = ec ? p : norm;
        if (std::find(roots.begin(), roots.end(), key) == roots.end()) roots.push_back(key);
    };

    const std::string exeDir = executableDir();
    push(exeDir);
    if (!exeDir.empty()) {
        fs::path p(exeDir);
        for (int i = 0; i < 3 && p.has_parent_path(); ++i) {
            p = p.parent_path();
            push(p.string());
        }
    }

    std::error_code ec;
    const fs::path cwd = fs::current_path(ec);
    if (!ec) {
        push(cwd.string());
        if (cwd.has_parent_path()) push(cwd.parent_path().string());
    }
    return roots;
}

std::vector<std::string> voskLibraryCandidates() {
    std::vector<std::string> out;
    const auto push = [&out](const std::string& p) {
        if (p.empty()) return;
        if (std::find(out.begin(), out.end(), p) == out.end()) out.push_back(p);
    };

    const std::string fileName = voskLibraryFileName();

    // 1) 환경변수로 직접 지정
    const std::string envLib = envOrEmpty("KSTT_VOSK_LIB");
    if (!envLib.empty()) {
        push(envLib);
        push(joinPath(envLib, fileName));
    }
    const std::string envDir = envOrEmpty("VOSK_LIB_DIR");
    if (!envDir.empty()) push(joinPath(envDir, fileName));

    // 2) exe 폴더와 그 주변, third_party 아래
    for (const std::string& root : searchRoots()) {
        push(joinPath(root, fileName));
        push(joinPath(joinPath(root, "vosk"), fileName));
        push(joinPath(joinPath(root, "lib"), fileName));

        const std::string tp = joinPath(root, "third_party");
        if (!isDirectory(tp)) continue;
        push(joinPath(tp, fileName));
        std::error_code ec;
        for (const auto& entry : fs::directory_iterator(tp, ec)) {
            if (!entry.is_directory()) continue;
            push(joinPath(entry.path().string(), fileName));
        }
    }

    // 3) 시스템 기본 탐색 경로 (PATH / LD_LIBRARY_PATH / 설치된 패키지)
    push(fileName);
    return out;
}

std::vector<std::string> modelCandidates() {
    std::vector<std::string> out;
    const auto push = [&out](const std::string& p) {
        if (p.empty() || !isDirectory(p)) return;
        if (std::find(out.begin(), out.end(), p) == out.end()) out.push_back(p);
    };
    // 모델 디렉터리인지 (am/ 과 conf/ 가 있으면 Vosk 모델)
    const auto looksLikeModel = [](const fs::path& p) {
        return fs::is_directory(p / "am") || fs::is_directory(p / "conf") ||
               fs::is_directory(p / "graph");
    };

    for (const char* name : {"KSTT_MODEL", "KSTT_MODEL_PATH", "VOSK_MODEL_PATH"}) {
        const std::string env = envOrEmpty(name);
        if (!env.empty()) push(env);
    }

    for (const std::string& root : searchRoots()) {
        for (const char* sub : {"models", "model", "."}) {
            const fs::path dir = fs::path(root) / sub;
            if (!isDirectory(dir.string())) continue;
            if (looksLikeModel(dir)) push(dir.string());
            std::error_code ec;
            std::vector<fs::path> children;
            for (const auto& entry : fs::directory_iterator(dir, ec)) {
                if (entry.is_directory() && looksLikeModel(entry.path()))
                    children.push_back(entry.path());
            }
            // 한국어 모델을 먼저 (ko 가 이름에 든 것)
            std::sort(children.begin(), children.end(), [](const fs::path& a, const fs::path& b) {
                const std::string an = a.filename().string();
                const std::string bn = b.filename().string();
                const bool ak = an.find("-ko") != std::string::npos;
                const bool bk = bn.find("-ko") != std::string::npos;
                if (ak != bk) return ak;
                return an < bn;
            });
            for (const fs::path& c : children) push(c.string());
        }
    }
    return out;
}

}  // namespace kstt
