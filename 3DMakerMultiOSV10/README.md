# 3D Space Maker

2D 이미지 한 장으로 **탐색 가능한 3D 공간**을 만드는 데스크톱 앱입니다.  
깊이 추정으로 공간을 구성하고, 1인칭으로 걸어 들어가 볼 수 있습니다.

| 구분 | 내용 |
|------|------|
| UI 셸 | Electron |
| 3D 렌더 | Three.js |
| 깊이 추정 | Depth Anything V2 Small (`@huggingface/transformers`, ONNX WASM) |
| 빌드 | electron-vite |

## 빠른 시작

```bash
npm install
npm run dev
```

- 첫 실행 시 깊이 모델을 Hugging Face에서 다운로드합니다 (네트워크 필요).
- 이후에는 로컬 `hf-model-cache`와 메모리 캐시를 재사용합니다.
- 뷰포트에는 XYZ 축·그리드가 항상 표시됩니다.
- `npm install` / `npm run dev` 시 ORT WASM 파일을 로컬로 복사합니다.

## 주요 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 모드 실행 |
| `npm run build` | 프로덕션 번들 생성 (`out/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run copy-ort` | ONNX Runtime WASM 로컬 복사 |

## 지원 이미지

JPEG, PNG, GIF, AVIF, WebP 및 고해상도 사진  
자세한 제한과 조작법은 [UsersGuide.md](./UsersGuide.md)를 참고하세요.

## 앱 아이콘

모던 광택 스타일 아이콘은 `assets/`에 있습니다.

- `assets/app-icon.png` — 원본
- `assets/icon.png` — Electron 창/독 아이콘

## 문서

- [UsersGuide.md](./UsersGuide.md) — 설치, 사용법, 조작, 문제 해결
- [Architecture.md](./Architecture.md) — 폴더 구조, 파이프라인, 설계 결정
- [assets/README.md](./assets/README.md) — 아이콘 에셋 설명

## 한계 (요약)

한 장의 이미지만 사용하므로 가려진 뒷면·측면은 비어 보이거나 왜곡될 수 있습니다.  
전방에서 공간 안으로 들어가는 탐색 경험에 맞춰져 있습니다.

## 라이선스

프로젝트 사용·배포 정책은 저장소 정책에 따릅니다.  
외부 모델·런타임은 각 패키지와 Hugging Face 모델 라이선스를 확인하세요.
