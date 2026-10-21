# samples/ — 테스트용 DICOM

공개된 DICOM 테스트 데이터를 출처별 하위 폴더에 모아 두었습니다 (2026-09-19 내려받음, 총 ≈61 MB).
모두 익명화된 시험용 데이터이며, 각 폴더의 파일은 원 저장소의 라이선스를 따릅니다.

| 폴더 | 출처 | 내용 |
|------|------|------|
| `./*.dcm` | (기존) pydicom 테스트 파일 + 파노라마 X-ray | CT/MR/NM/PX 기본 샘플 |
| `pydicom/` | [pydicom/pydicom](https://github.com/pydicom/pydicom) `src/pydicom/data/test_files` (MIT) — 파일별 설명은 `pydicom/README.txt` | 전송 구문별 소형 파일: Big Endian, Deflated, RLE(8/16-bit, 2 프레임), JPEG Baseline/Extended/Lossless, JPEG-LS(lossless/near-lossless), JPEG 2000, YBR/RGB/PALETTE, 오버레이(`examples_overlay`), RTDOSE 다중 프레임 |
| `pydicom-data/` | [pydicom/pydicom-data](https://github.com/pydicom/pydicom-data) `data_store/data` | 실제 크기 영상: CR 1841×1955 (`RG1_*`, MONOCHROME1), MR 1024² (`MR2_*`), US 640×480 컬러(`US1_*`, `color3d_jpeg_baseline` 120프레임 시네), Enhanced MR 다중 프레임(`emri_small*` 10프레임, 5가지 전송 구문), Enhanced CT(`eCT_Supplemental`), HTJ2K, JPEG-LS, SEG(`liver*` 3프레임), Modality/VOI LUT(`mlut_18`, `vlut_04`), Parametric Map(float/double), Siemens MR 오버레이, 16/32-bit RGB |
| `cornerstone/` | [cornerstonejs/cornerstoneWADOImageLoader](https://github.com/cornerstonejs/cornerstoneWADOImageLoader) `testImages` (MIT) | 같은 CT 512² 영상을 **모든 전송 구문**으로 변환한 세트(`CTImage.dcm_*`), 확장자 없는 J2K 파일(`CT1_J2KR`, `CT2_J2KR`), 조각(fragment)만 있고 BOT 없는 JPEG, 20프레임 MR(`paramap.dcm`), Pixel Spacing 없는 US |
| `rubo/` | [Rubo Medical](https://www.rubomedical.com/dicom_files/) 데모 파일 | XA 시네 17·70·96·137 프레임(JPEG), RF 1024², US 11프레임 PALETTE COLOR(RLE), MR 뇌 |
| `more/` | 위 저장소들 | 예전에 `_unsupported/` 에 따로 두었던 **까다로운 파일** — preamble/메타 없는 데이터셋, 비압축 YBR_FULL_422, Deflated Image Frame Compression, 폐기된 JPEG 전송 구문, 픽셀 없는 문서(SR·Waveform·RT). 이제 모두 열립니다 — 아래 표 참고 |
| `video/` | `pydicom-data/color3d_jpeg_baseline.dcm` 의 60프레임으로 만든 **DICOM 동영상** | `us_h264.dcm`(MPEG-4 AVC / H.264 High, B-프레임, 1.2.840.10008.1.2.4.102), `us_hevc.dcm`(HEVC Main, .107), `us_mpeg2.dcm`(MPEG-2 MP@ML, .100) — 25 fps, 64 KB 조각. `node scripts/make-video-samples.mjs`(ffmpeg + pydicom)로 다시 만들 수 있습니다 |
| `dicomdir/` | 위 샘플로 만든 파일 세트 | `DICOMDIR` + 참조 파일 4개(CT, MR, Enhanced MR 10프레임, SR). 모두 Explicit VR Little Endian 사본이며 `node test/helpers/makeDicomDir.js` 로 다시 만들 수 있습니다 |

## `more/` — 무엇을 시험하는 파일인가

| 파일 | 시험 내용 |
|------|------|
| `no_meta.dcm` | preamble·`DICM`·File Meta 없이 **데이터셋만** 있는 파일(Explicit VR LE). 맨 앞에 쓰레기 1바이트가 붙어 있어 오프셋 0 이 아닌 곳에서 데이터셋을 찾아야 함. `CT_small.dcm` 과 같은 영상 |
| `rtstruct.dcm`, `OT-PAL-8-face.dcm` | 메타 없는 **Implicit VR LE** 데이터셋(그룹 0008 부터 시작). `OT-PAL-8-face` 는 PALETTE COLOR 640×480 |
| `JLSL_RGB_ILV0.dcm`, `JLSN_RGB_ILV0.dcm` | preamble·`DICM` 없이 **그룹 0002(전송 구문만)** 로 시작하는 파일 + JPEG-LS(lossless / near-lossless) **interleave mode 0** RGB — 평면 순서를 RGB 로 맞게 풀어야 함 |
| `SC_ybr_full_422_uncompressed.dcm`, `US-YBR_FULL_422-EVRLE.dcm` | 비압축 **YBR_FULL_422** — 두 화소마다 Y0 Y1 Cb Cr (크로마 2:1). 업샘플링 후 RGB 로 변환. 앞의 것은 `pydicom-data/SC_rgb.dcm` 과 같은 그림 |
| `liver_deflate.dcm` | **Deflated Image Frame Compression** (1.2.840.10008.1.2.8.1) — 프레임 조각마다 deflate 된 1-bit SEG. `pydicom-data/liver.dcm`·`liver_rle.dcm` 과 프레임별로 같아야 함 |
| `CTImage.dcm_JPEGProcess6_8…4.53.dcm`, `CTImage.dcm_JPEGProcess10_12…4.55.dcm` | **폐기(retired)된 JPEG 전송 구문** — libjpeg-turbo 로 풂. `cornerstone/CTImage.dcm` 대비 평균 오차 ≈3.8 HU (손실 압축) |
| `test-SR.dcm` | **Structured Report** — CONTAINER/TEXT/CODE/NUM/DATE/TIME/DATETIME/UIDREF/IMAGE/COMPOSITE/WAVEFORM/SCOORD/TCOORD 및 참조(by-reference) 항목 |
| `waveform_ecg.dcm` | 12유도 **ECG Waveform** — 두 다중화 그룹(RHYTHM 10000 샘플, MEDIAN BEAT 1200 샘플), 1000 Hz, 16-bit SS |
| `rtplan.dcm` | **RT Plan** — 분할 그룹 1개(30회), 빔 1개(제어점 2개), 처방(Dose Reference) 2개 |
| `rtstruct.dcm` | **RT Structure Set** — ROI 3개(외곽 윤곽 3개 + 아이소센터 점 2개), 색·해석 유형 포함 |

픽셀이 없는 파일(SR·Waveform·RT Plan·RT Structure Set)은 `DicomDecoder.load()` 가 `err.docKind` 를 붙여 거부하고, 내용은 `DicomDocs` 로 읽습니다.

## 다시 내려받기

원본 URL 패턴:

```
https://raw.githubusercontent.com/pydicom/pydicom/main/src/pydicom/data/test_files/<파일>
https://raw.githubusercontent.com/pydicom/pydicom-data/master/data_store/data/<파일>
https://raw.githubusercontent.com/cornerstonejs/cornerstoneWADOImageLoader/master/testImages/<파일>
https://www.rubomedical.com/dicom_files/dicom_viewer_<0002|0003|0004|0009|0012|0015|0020|Mrbrain>.zip
```
