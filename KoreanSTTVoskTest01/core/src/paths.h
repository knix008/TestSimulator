// core/src/paths.h
//
// 실행 파일 위치, 모델/라이브러리 자동 탐색 같은 경로 잡일. 코어 내부 전용.
#pragma once

#include <string>
#include <vector>

namespace kstt {

std::string executablePath();
std::string executableDir();
std::string joinPath(const std::string& a, const std::string& b);
bool isDirectory(const std::string& path);
bool isFile(const std::string& path);
std::string envOrEmpty(const char* name);

// exe 폴더와 그 상위 몇 단계, 현재 작업 폴더 — 모델/DLL 을 찾아볼 뿌리들
std::vector<std::string> searchRoots();

// libvosk 후보 경로 (환경변수 → exe 폴더 → third_party → 시스템 기본 이름)
std::vector<std::string> voskLibraryCandidates();

// 한국어 모델 디렉터리 후보
std::vector<std::string> modelCandidates();

#if defined(_WIN32)
std::wstring utf8ToWide(const std::string& s);
std::string wideToUtf8(const std::wstring& s);
#endif

}  // namespace kstt
