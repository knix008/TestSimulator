# 빌드 가이드

## 필수 요구사항

### 소프트웨어

- Windows 10/11 (64-bit)
- Visual Studio 2019 이상 (Community 버전 가능)
  - "C++를 사용한 데스크톱 개발" 워크로드
  - Windows 10 SDK
- CMake 3.15 이상

### 하드웨어

- DirectX 11 지원 그래픽 카드

## 빌드 단계

### 1. 저장소 클론 (또는 디렉토리 이동)

```bash
cd d:\Home\Projects\TestSimulator\XManWindowsV10
```

### 2. CMake 빌드 디렉토리 생성

```bash
mkdir build
cd build
```

### 3. CMake 설정

#### Visual Studio 사용

```bash
cmake .. -G "Visual Studio 16 2019" -A x64
```

Visual Studio 2022를 사용하는 경우:

```bash
cmake .. -G "Visual Studio 17 2022" -A x64
```

#### MinGW 사용 (선택사항)

```bash
cmake .. -G "MinGW Makefiles"
```

### 4. 빌드

#### Visual Studio

```bash
cmake --build . --config Release
```

또는 생성된 `.sln` 파일을 Visual Studio에서 열어 빌드.

#### MinGW

```bash
cmake --build .
```

### 5. 실행

```bash
cd bin\Release
XManWindowsV10.exe 0
```

## 디버그 빌드

디버그 심볼을 포함한 빌드:

```bash
cmake --build . --config Debug
```

## 문제 해결

### DirectX SDK를 찾을 수 없음

최신 Windows SDK에는 DirectX가 포함되어 있습니다. Visual Studio Installer에서 "Windows 10 SDK"가 설치되어 있는지 확인하세요.

### 링크 오류

`d3d11.lib`, `dxgi.lib` 등의 라이브러리를 찾을 수 없는 경우, Visual Studio 설치를 확인하세요.

### CMake 오류

CMake 버전이 3.15 이상인지 확인:

```bash
cmake --version
```

## IDE 설정

### Visual Studio

CMake 프로젝트를 직접 열 수 있습니다:

1. Visual Studio 실행
2. "폴더 열기" 선택
3. `XManWindowsV10` 폴더 선택

### VS Code

`.vscode/settings.json`:

```json
{
  "cmake.configureOnOpen": true,
  "C_Cpp.default.configurationProvider": "ms-vscode.cmake-tools"
}
```

필요한 확장:

- C/C++
- CMake Tools

## 테스트 실행

```bash
cd build
ctest -C Release
```

## 설치

시스템에 설치하려면:

```bash
cmake --install . --prefix "C:\Program Files\XManWindowsV10"
```

관리자 권한이 필요할 수 있습니다.
