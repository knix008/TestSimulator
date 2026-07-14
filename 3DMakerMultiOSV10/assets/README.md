# App icons

| File | Use |
|------|-----|
| `app-icon.png` | 원본 앱 아이콘 (1024×1024) |
| `icon.png` | PNG 엔트리 (원본과 동일) |
| `icon.ico` | Windows 창·작업 표시줄 아이콘 |
| `icon-256.png` / `icon-32.png` | 크기별 PNG 보조 |

Electron 메인 프로세스(`src/main/index.js`)가 실행 시 `assets/`에서
Windows는 `icon.ico`를 우선, 그다음 PNG를 찾습니다.

아이콘을 바꾼 뒤에는 `app-icon.png`와 `icon.png`를 갱신하고,
필요하면 `icon.ico`도 다시 생성하세요.
