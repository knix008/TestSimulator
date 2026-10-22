<!-- tour: samples -->
# 파일 열기

## 여는 방법

| 방법 | 설명 |
| --- | --- |
| 파일 › 파일 열기 (`Ctrl+O`) | 파일 하나를 엽니다 |
| 파일 › 폴더 열기 (`Ctrl+Shift+O`) | 폴더를 트리에 열고, 파일을 한 번 눌러 엽니다 |
| 파일 › DICOMDIR 열기 | CD · DVD · USB 의 `DICOMDIR` 을 엽니다 |
| 끌어 놓기 | 파일이나 폴더를 창에 끌어 놓습니다 |
| 탐색기에서 더블 클릭 | 설치할 때 *DICOM 파일의 기본 프로그램* 으로 등록하면 `.dcm` 파일이 MyDCMViewer 로 열립니다. 이미 실행 중이면 그 창에서 엽니다 |
| 최근 파일 · 최근 폴더 | 파일 메뉴와 시작 화면 |

## 지원 형식

| 구분 | 형식 |
| --- | --- |
| DICOM | `.dcm` `.dicm` `.dicom`, 확장자 없는 파일, 파일 메타가 없는 데이터셋 — 내용으로 알아봅니다 |
| 전송 구문 | 비압축(Little / Big Endian), Deflated, RLE, JPEG Baseline · Extended · Lossless · Process 6/10, JPEG-LS, JPEG 2000, HTJ2K, Deflated Image Frame, **MPEG-4 AVC(H.264) · HEVC · MPEG-2 동영상** |
| 영상 종류 | MONOCHROME1/2, RGB, YBR(422 포함), PALETTE COLOR, 8 ~ 32비트 · 실수, 여러 프레임, Enhanced(Functional Groups), Modality · VOI · Presentation LUT, 오버레이 |
| 문서 | 구조화 보고서(SR), 파형(심전도), 내장 PDF · CDA, RT 구조 · 계획 · 선량, DICOMDIR |
| 그림 | JPEG, PNG, GIF, WebP, AVIF, BMP, ICO, SVG, TIFF(여러 쪽 · 16비트), HEIF/HEIC, JPEG 2000 |
| 묶음 | ZIP — 읽기 전용 폴더처럼 탐색합니다 |

## DICOMDIR

![DICOMDIR](images/help-dicomdir.jpg)

환자 › 검사 › 시리즈 순서로 목록이 나오고, **시리즈로 불러오기** 를 누르면 그 시리즈가 시리즈 막대로 넘겨 볼 수 있게 열립니다.

## 폴더를 시리즈로 정렬

폴더를 연 뒤 **시네 › 폴더를 DICOM 시리즈로 정렬**(또는 시리즈 패널의 단추)을 누르면 모든 DICOM 머리말을 읽어 Series Instance UID 로 묶고, Instance Number 와 슬라이스 위치 순으로 정렬합니다. 정렬된 시리즈는 MPR, 3D, 동기 스크롤에 쓰입니다.
