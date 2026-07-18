# ISO Maker Multi-OS

Windows / macOS / Linux에서 ISO를 **열기·편집·저장·생성·부팅 이미지 제작·마운트**하는 데스크톱 앱과, 브라우저에서 ISO를 **조회·편집**하는 웹 뷰어입니다.

| | Desktop (Electron) | Web |
|---|---|---|
| ISO 열기 · 트리 편집 · 새 ISO 저장 | ✅ (편집 세션) | ✅ (세션 편집) |
| 다중 선택 · 컨텍스트 메뉴 · Drag & Drop | ✅ | 제한적 |
| 폴더 → ISO 생성 / 부팅 ISO | ✅ (xorriso) | ❌ |
| 마운트 / 언마운트 | ✅ | ❌ |
| Windows 설치 파일 (NSIS) | ✅ (`npm run dist`) | — |

- **버전:** 0.1.0  
- **저작권:** Copyright © SHKWON (knix008@naver.com). All rights reserved.  
- **문서:** [Architecture.md](./Architecture.md) · [UsersGuide.md](./UsersGuide.md)

---

## 요구 사항

- **Node.js** 20 이상
- **데스크톱 엔진:** [xorriso](https://www.gnu.org/software/xorriso/) (생성·부팅 ISO·전체 추출 시)
  - Windows (권장): [MSYS2](https://www.msys2.org/) 설치 후 `pacman -S xorriso`
  - macOS: `brew install xorriso`
  - Linux: `sudo apt install xorriso` (또는 배포판 패키지)
- ISO **열기/트리 편집/드래그 추출**은 순수 JS(ISO9660)이며 xorriso 없이도 동작합니다.
- 웹 모드만 사용할 때는 xorriso가 필요하지 않습니다.

---

## 빠른 시작

```bash
npm install
npm start          # 데스크톱 (Electron + Vite)
```

Windows에서 더블클릭:

- `start.cmd` — 데스크톱
- `start-web.cmd` — 웹

```bash
npm run start:web  # 웹 (포트 5174, /web.html)
npm run typecheck
npm run build      # 데스크톱 프로덕션 빌드
npm run build:web  # 웹 프로덕션 빌드
npm run dist:win    # Windows → ISO Maker-Setup-<ver>.exe
npm run dist:mac    # macOS   → ISO Maker-<ver>-arm64.dmg / -x64.dmg  (macOS에서 빌드)
npm run dist:linux  # Linux   → ISO Maker-<ver>.AppImage
npm run dist:all    # win+mac+linux (가능하면; mac 빌드는 macOS 필요)
```

산출물은 `release/`에 생성된 뒤 **프로젝트 루트**로 복사됩니다.

| 명령 | 호스트 OS | 결과 예 |
|------|-----------|---------|
| `npm run dist:win` | Windows (권장) | `ISO Maker-Setup-0.1.0.exe` |
| `npm run dist:mac` | **macOS 필수** | `ISO Maker-0.1.0-arm64.dmg` 등 |
| `npm run dist:linux` | Linux 권장 (Windows에서도 시도 가능) | `ISO Maker-0.1.0.AppImage` |

`npm run dist`는 Windows 빌드(`dist:win`)와 동일합니다.

---

## 주요 기능 (데스크톱)

1. **ISO 열기 / 편집** — 트리를 보고 Ctrl·Shift 다중 선택, 컨텍스트 메뉴, 파일 드래그 인/아웃, 변경 시 dirty 표시 후 **새 ISO로 저장**
2. **ISO 생성** — 폴더 → ISO9660/Joliet (xorriso)
3. **부팅 ISO** — BIOS / UEFI (소스 트리에 부트로더 이미지 필요)
4. **마운트** — OS별 네이티브 마운트 (Windows `Mount-DiskImage`, macOS `hdiutil`, Linux `mount`/`fuseiso`)
5. **종료 확인** — 저장하지 않은 변경이 있으면 저장/폐기/취소
6. **설치 프로그램** — 바탕화면·시작 메뉴 바로가기 선택, 기존 설치 완전 제거 후 재설치

UI 기본 언어는 **한국어**, 테마 기본값은 **다크**이며 `localStorage`에 저장됩니다.

---

## 아이콘

`assets/` — 앱·설치용 아이콘 (`icon.ico`, `icon.png`, 크기별 PNG)  
`public/` — 웹 파비콘 (빌드 스크립트로 동기화)

```bash
python assets/build-icons.py   # icon-master.png 기준으로 재생성
```

---

## 프로젝트 구조 (요약)

```
electron/          Electron main, 편집 세션, xorriso, mount, preload, path-blob
src/               React UI, i18n, iso9660 리더/라이터/세션
build/installer.nsh  NSIS 커스텀(바로가기 선택 · 기존 설치 제거)
electron-builder.yml 패키징 설정
assets/            앱·설치 아이콘
public/            파비콘
release/           설치 파일 출력 (gitignore)
```

자세한 설계는 [Architecture.md](./Architecture.md)를 참고하세요.

---

## 라이선스 / 문의

Copyright © SHKWON (knix008@naver.com). All rights reserved.
