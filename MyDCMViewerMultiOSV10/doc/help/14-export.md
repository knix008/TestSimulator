<!-- tour: export -->
# 내보내기 · 인쇄 · 일괄 변환

**파일 › 이미지 내보내기** 메뉴, 도구 모음의 **내보내기 ▾** 단추, 영상 위 오른쪽 단추 메뉴에서 내보냅니다. 데스크톱에서는 저장 창이 열리고, 웹에서는 내려받기로 저장됩니다.

![내보내기 메뉴](images/help-export.jpg)

| 항목 | 내용 |
| --- | --- |
| PNG · JPEG · WebP · BMP · TIFF · GIF | 지금 보이는 그대로(윈도우 · 컬러맵 · 회전 · 필터, 설정에 따라 주석) |
| 다른 형식으로 내보내기 | 45가지 형식 — 아래 참고 |
| 16비트 TIFF | 원래 화소 값 그대로 |
| 모든 프레임을 PNG 로 (ZIP) | 여러 프레임 파일의 모든 프레임 |
| 애니메이션 GIF | 모든 프레임을 fps 로 반복 |
| 시네 동영상 (MP4 · WebM) | 프레임 또는 시리즈를 동영상으로 |
| PDF 보고서 | 영상 + 환자 · 검사 정보 + 측정 표 |
| DICOM (비압축) · Secondary Capture | DICOM 도구 참고 |
| 측정값 (CSV) · DICOM 태그 (TXT · JSON · CSV) | 표 형식 |
| 시리즈를 DICOMDIR 로 | CD · USB 용 파일 세트 |
| 이미지 복사 (`Ctrl+C`) | 클립보드로 |

<!-- tour: exportas -->
## 다른 형식으로 내보내기 (모든 형식)

![다른 형식으로 내보내기](images/help-exportas.jpg)

형식을 그룹에서 고르고 형식마다 있는 옵션(품질, 비트 깊이, 압축, 무손실, 투명도 …)을 정합니다.

| 그룹 | 형식 |
| --- | --- |
| 일반 | PNG(8/16비트), APNG, JPEG(점진적), WebP, AVIF(8/10/12비트), HEIC, JPEG XL, GIF, 애니메이션 GIF, BMP, TIFF(LZW · Deflate · PackBits, 16비트 · 실수, 여러 쪽) |
| 전문가용 | JPEG 2000(.jp2 · .j2k), JPEG-LS, PSD, TGA, DDS, QOI |
| HDR / 실수 | OpenEXR, Radiance HDR, PFM |
| 의료 / 연구용 볼륨 | NIfTI(.nii · .nii.gz), Analyze 7.5, MetaImage(.mha · .mhd), NRRD |
| 과학 · 문서 · 아이콘 · 고전 | FITS · SVG, EPS, PDF · ICO, CUR, ICNS · PCX, PBM · PGM · PPM · PAM, SGI, Sun Raster, XBM, XPM, WBMP, Farbfeld |

- 16비트 · 실수 · 의료 형식은 화면 그림이 아니라 **원래 화소 값(HU 등)** 을 담습니다.
- 여러 쪽 · 볼륨 형식은 **모든 프레임 또는 정렬된 시리즈** 를 담습니다(현재 프레임만도 고를 수 있음). 화소 간격 · 슬라이스 두께도 기록합니다.
- 모든 형식은 다른 프로그램(Pillow, OpenCV, ffmpeg, pydicom 등)으로 다시 열어 검증되어 있습니다.

## 진행률 창

![진행률](images/help-progress.jpg)

저장 · 내보내기 · 복사를 하는 동안 **진행률 창** 이 뜹니다. 프레임처럼 개수를 아는 작업은 막대와 %로, 한 장을 인코딩하거나 파일을 쓰는 동안은 움직이는 막대로 보입니다. 저장 창이 열려 있는 동안 잠시 숨었다가 파일을 쓰는 동안 *"… 저장하는 중"* 으로 다시 나타납니다.

<!-- tour: print -->
## 인쇄

![인쇄 미리보기](images/help-print.jpg)

**파일 › 인쇄** (`Ctrl+P`) — 미리보기에서 용지(A4 · Letter · A3 · Legal), 방향, 머리글(파일 · 환자) · 바닥글, 가운데 정렬, 맞춤, 매수를 정하고 **인쇄** 를 누르면 프린터로 바로 보냅니다. **시스템 인쇄 창…** 은 운영체제의 인쇄 창을 엽니다.

<!-- tour: batch -->
## 폴더 일괄 변환

![일괄 변환](images/help-batch.jpg)

**파일 › 폴더 일괄 변환** — 폴더(하위 폴더 포함 가능)의 DICOM 을 고른 형식으로 바꿔 `converted_<형식>` 폴더에 저장합니다. 모든 프레임, 현재 윈도우 · 컬러맵 사용을 고를 수 있고, 끝나면 성공 · 실패 수와 실패 목록을 보여 줍니다.
