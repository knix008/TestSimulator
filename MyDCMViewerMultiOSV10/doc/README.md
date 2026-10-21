# MyDCMViewer 도움말

프로그램 안에서는 **도움말 › 도움말** (`Ctrl+F1`) 창에서 같은 내용을 그림과 함께 보고, 찾고, 각 기능의 튜토리얼 단계로 바로 갈 수 있습니다.

## 튜토리얼

- [튜토리얼 — 모든 기능을 단계별로](tutorial.md) (그림 포함)
- 동영상: [MyDCMViewer-Tutorial.mp4](../MyDCMViewer-Tutorial.mp4) — 튜토리얼 전체를 실제 프로그램에서 녹화한 것
- 프로그램에서: **도움말 › 튜토리얼** 또는 시작 화면의 **튜토리얼** 카드

## 기능별 도움말

| 주제 | 내용 |
| --- | --- |
| [시작 화면과 예제 영상](help/01-start.md) | 시작 화면, 예제 21종, 최근 파일, 배경 18종 |
| [화면 구성](help/02-screen.md) | 메뉴, 도구 모음, 패널, 탭, 상태 표시줄, 오른쪽 단추 메뉴, 크기 조절 |
| [파일 열기](help/03-open.md) | 파일 · 폴더 · DICOMDIR · ZIP, 지원 형식, 시리즈 정렬 |
| [영상 보기](help/04-view.md) | 확대 · 이동 · 회전 · 반전, 화면 위 정보, 태그 패널 |
| [윈도우 / 레벨과 컬러맵](help/05-window.md) | W/L, 프리셋, VOI LUT, 컬러맵, 반전 |
| [측정 도구](help/06-measure.md) | 길이 · 각도 · Cobb · ROI · 점 · 화살표 · 돋보기, 실측 보정 |
| [시네 · DICOM 동영상 · 시리즈](help/07-cine.md) | 재생 · 잠시 멈춤 · 멈춤, H.264 · HEVC · MPEG-2 동영상, 시리즈 |
| [화면 배치 · 동기 스크롤 · 기준선](help/08-layout.md) | 여러 영상 비교 |
| [MPR · MIP · 곡면 MPR](help/09-mpr.md) | 축상 · 관상 · 시상면 재구성 |
| [3D 볼륨 렌더링](help/10-volume.md) | VR · MIP · 등위면 · 자르기 |
| [영상 필터 · 영상 융합](help/11-filters-fusion.md) | 필터 연결, PET/CT 융합 |
| [DICOM 도구](help/12-dicom-tools.md) | 태그 편집, 익명화, 압축 변환, Secondary Capture, DICOMDIR 만들기 |
| [문서 보기](help/13-documents.md) | 구조화 보고서, 심전도, RT, 내장 PDF |
| [내보내기 · 인쇄 · 일괄 변환](help/14-export.md) | 45가지 형식, 동영상, PDF, 진행률 창, 인쇄 |
| [PACS](help/15-pacs.md) | C-ECHO · C-FIND · C-GET · C-MOVE · C-STORE, 받기 |
| [설정 · 테마 · 언어 · 단축키](help/16-settings.md) | 설정 창, 단축키, 도움말 창, 프로그램 정보 |
| [문제 해결](help/17-troubleshooting.md) | 자주 생기는 문제 |

## 그림과 도움말 창 다시 만들기

```bash
npm run help:media       # doc/images/help-*.jpg 를 실제 프로그램에서 다시 찍고 도움말 창 데이터를 만듭니다
npm run help:build       # doc/help/*.md 만 고쳤을 때: src/help/help-data.js 다시 만들기
npm run tutorial:video   # MyDCMViewer-Tutorial.mp4, doc/tutorial.md, doc/images/tutorial-*.jpg
```
