# My3DBlender

웹, Windows, macOS, Linux용 3D 제작 프로그램입니다. Tauri 2 + JavaScript + three.js로 만들었고, 설치한 뒤에는 Node.js 없이 실행됩니다. Blender에서 영감을 받은 독립 프로그램이며 Blender의 코드나 아이콘을 쓰지 않았습니다.

**구현 범위:** Blender의 모든 기능을 목표로 하지만 아직 일부입니다. 항목별 현황은 앱의 **도움말 › 기능 구현 현황** 또는 `npm run coverage`로 봅니다. 목록은 [src/core/features.js](src/core/features.js)에 있습니다.

## 실행

```
npm install
npm start            # 데스크톱 앱 (Tauri, Rust 필요)
npm run dev          # 웹 개발 서버 (http://localhost:1537)
```

## 테스트

```
npm test             # js · rust · web · desktop 전부
npm run test:js      # 코어 단위 테스트
npm run test:web     # 실제 마우스·키 입력으로 앱을 조작하는 웹 E2E
npm run coverage     # 기능 구현 현황 (--planned 로 남은 항목까지)
npm run verify:formats  # 다른 프로그램이 만든 실제 .blend·FBX·Collada 파일로 판독기 확인 (내려받기 필요)
npm run verify:blender -- <blender.exe>   # both directions against a real Blender (Alembic, FBX, glTF, Collada, USD, OBJ, STL, PLY, .blend)
npm run tutorial:video                    # records the tutorial as My3DBlender-Tutorial.mp4 (--preview first)
npm run samples      # sample/ 의 샘플 프로젝트와 미리보기를 다시 만들기
npm run guide:images # doc/images/ 의 설명서 그림을 다시 찍기
```

결과는 `test-results/`에 남습니다. 웹 E2E는 워크스페이스별 스크린샷도 저장합니다.

## 설치 파일

```
npm run build:win    # Windows (NSIS)
npm run build:mac    # macOS (dmg)
npm run build:linux  # Linux (deb, rpm, AppImage)
npm run build:all    # 지금 OS에서 만들 수 있는 전부
npm run build:web    # 웹 빌드 (dist/)
```

Tauri는 교차 빌드를 하지 않으므로 각 OS에서 만듭니다. 만든 파일은 `release/`와 프로젝트 루트에 복사됩니다.

## 문서

- [사용자 설명서](doc/UsersGuide.md) / [User's Guide](doc/UsersGuide.en.md)
- [튜토리얼](doc/Tutorial.md) / [Tutorial](doc/Tutorial.en.md)
- [구조](ARCHITECTURE.md)
