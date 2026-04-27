# Enhanced Screenshot 실행 가이드

## 빠른 시작

가장 쉬운 방법:
```bash
./run.sh
```

## 실행 방법

### 1. 일반 실행 스크립트 (권장)
```bash
./run.sh
```

**특징:**
- 빌드가 안 되어 있으면 자동으로 빌드
- Wayland/X11 환경 자동 감지
- X11 백엔드 자동 설정

### 2. 디버그 모드
```bash
./debug.sh
```

**특징:**
- 모든 디버그 메시지 출력
- 시스템 정보 표시
- 로그를 `screenshot-debug.log`에 자동 저장
- 문제 해결에 유용

### 3. Makefile 사용
```bash
make run        # 빌드하고 실행
make debug      # 디버그 모드로 실행
```

### 4. 직접 실행
```bash
# X11 환경
./enhanced-screenshot

# Wayland 환경
GDK_BACKEND=x11 ./enhanced-screenshot
```

## 사용 방법

1. **스크린샷 캡처**
   - "스크린샷 캡처" 버튼 클릭
   - 프로그램이 잠시 숨겨지고 전체 화면 캡처

2. **자동 저장**
   - "자동 저장" 체크박스 활성화
   - 캡처할 때마다 자동으로 `~/Pictures/Screenshots/`에 저장

3. **편집**
   - "편집" 버튼 클릭
   - 사각형, 화살표 등 그리기 도구 사용
   - 색상 선택 가능
   - 편집 후 저장

4. **수동 저장**
   - "저장" 버튼 클릭
   - 원하는 위치와 파일명 지정

## 문제 해결

### 스크린샷이 캡처되지 않을 때

1. X11 백엔드 강제 사용:
   ```bash
   GDK_BACKEND=x11 ./enhanced-screenshot
   ```

2. 디버그 모드로 실행:
   ```bash
   ./debug.sh
   ```
   
   로그 파일 `screenshot-debug.log` 확인

3. 권한 확인:
   ```bash
   chmod +x run.sh debug.sh enhanced-screenshot
   ```

### Wayland에서 실행 시

Wayland는 보안상 스크린샷 API가 제한되어 있습니다. `run.sh` 스크립트가 자동으로 X11 백엔드를 사용하지만, 완전한 Wayland 지원은 향후 업데이트 예정입니다.

### 빌드 에러

```bash
# 의존성 확인
make check-deps

# 의존성 설치
make deps

# 클린 빌드
make clean && make
```

## 로그 파일

디버그 모드 실행 시 `screenshot-debug.log` 파일이 생성됩니다. 문제 발생 시 이 파일을 확인하세요.

## 단축 실행

bashrc나 zshrc에 alias 추가:
```bash
alias screenshot='~/Projects/TestSimulator/GnomeScreenShot/run.sh'
```

그 후:
```bash
screenshot
```
