# Enhanced Screenshot

gnome-screenshot를 기반으로 한 향상된 스크린샷 프로그램입니다.

## 주요 기능

### 1. 스크린샷 캡처
- 전체 화면 스크린샷 캡처
- 창 선택 캡처 (구현 예정)
- 영역 선택 캡처 (구현 예정)

### 2. 자동 저장
- 스크린샷 캡처 후 자동으로 `~/Pictures/Screenshots/` 디렉토리에 저장
- 파일명 형식: `Screenshot_YYYY-MM-DD_HH-MM-SS.png`
- 자동 저장 기능은 체크박스로 활성화/비활성화 가능

### 3. 이미지 편집
- **사각형**: 스크린샷에 사각형 그리기
- **화살표**: 화살표로 중요한 부분 표시
- **텍스트**: 텍스트 주석 추가 (구현 예정)
- **색상 선택**: 그리기 도구의 색상 변경
- 편집 후 별도 파일로 저장 가능

## 빌드 방법

### 의존성
```bash
# Ubuntu/Debian
sudo apt-get install meson ninja-build libgtk-3-dev libcairo2-dev libx11-dev

# Fedora
sudo dnf install meson ninja-build gtk3-devel cairo-devel libX11-devel

# Arch Linux
sudo pacman -S meson ninja gtk3 cairo libx11
```

### 빌드 및 실행
```bash
# 빌드 디렉토리 설정
meson setup build

# 컴파일
meson compile -C build

# 실행
./build/enhanced-screenshot
```

**또는 Makefile 사용:**
```bash
# 의존성 설치 (처음 한 번만)
make deps

# 빌드
make

# 실행
./enhanced-screenshot
```

### 중요: X11 환경에서 실행

현재 버전은 X11에서만 완전히 지원됩니다. Wayland 환경에서는 다음과 같이 실행하세요:

```bash
GDK_BACKEND=x11 ./enhanced-screenshot
```

## 사용 방법

1. **스크린샷 캡처**: "스크린샷 캡처" 버튼 클릭
   - 프로그램 창이 잠시 숨겨진 후 전체 화면이 캡처됩니다
   - 캡처된 이미지가 프로그램 창에 표시됩니다

2. **자동 저장**: 체크박스 활성화
   - 스크린샷 캡처 시 자동으로 저장됩니다
   - 저장 위치: `~/Pictures/Screenshots/`

3. **편집**: "편집" 버튼 클릭
   - 새 창에서 스크린샷을 편집할 수 있습니다
   - 사각형, 화살표 등의 도구 선택
   - 마우스로 드래그하여 그리기
   - 색상 버튼으로 색상 변경
   - "저장" 버튼으로 편집된 이미지 저장

4. **수동 저장**: "저장" 버튼 클릭
   - 파일 저장 대화상자가 열립니다
   - 원하는 위치와 파일명 지정

## 기술 스택

- **언어**: C
- **GUI 프레임워크**: GTK+ 3
- **그래픽**: Cairo
- **화면 캡처**: X11/GDK
- **빌드 시스템**: Meson

## 향후 개발 계획

- [ ] 창 선택 스크린샷
- [ ] 영역 선택 스크린샷
- [ ] 텍스트 주석 기능
- [ ] 흐림 효과/모자이크 도구
- [ ] 실행 취소/다시 실행
- [ ] 단축키 지원
- [ ] 클립보드 복사
- [ ] 다양한 이미지 포맷 지원

## 라이선스

이 프로젝트는 gnome-screenshot의 개념을 기반으로 새롭게 작성되었습니다.

## 기여

버그 리포트와 기능 제안을 환영합니다!
