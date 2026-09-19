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
| `_unsupported/` | 위 저장소들 | **현재 디코더가 열지 못하는 파일** — 아래 표 참고. `samples/` 를 폴더로 열 때 오류가 나지 않도록 따로 두었습니다. |

## `_unsupported/` — 열리지 않는 이유

| 파일 | 이유 |
|------|------|
| `no_meta.dcm`, `rtstruct.dcm`, `OT-PAL-8-face.dcm`, `JLSL_RGB_ILV0.dcm`, `JLSN_RGB_ILV0.dcm` | File Meta Information(128바이트 preamble + `DICM`) 없이 데이터셋만 있는 파일. `dicomParser.readPart10Header` 가 거부함 |
| `rtplan.dcm`, `test-SR.dcm`, `waveform_ecg.dcm` | 픽셀 데이터가 없는 IOD(RT Plan, SR, Waveform) — 태그만 있는 파일 |
| `SC_ybr_full_422_uncompressed.dcm`, `US-YBR_FULL_422-EVRLE.dcm` | 비압축 **YBR_FULL_422** — 크로마가 2:1로 서브샘플링되어 프레임 바이트 수가 RGB의 2/3 인데 디코더가 "Frame is short" 로 거부 |
| `liver_deflate.dcm` | Deflated Image Frame Compression (1.2.840.10008.1.2.8.1, DICOM 2023) |
| `CTImage.dcm_JPEGProcess6_8…4.53.dcm`, `CTImage.dcm_JPEGProcess10_12…4.55.dcm` | 폐기(retired)된 JPEG 전송 구문 |

## 다시 내려받기

원본 URL 패턴:

```
https://raw.githubusercontent.com/pydicom/pydicom/main/src/pydicom/data/test_files/<파일>
https://raw.githubusercontent.com/pydicom/pydicom-data/master/data_store/data/<파일>
https://raw.githubusercontent.com/cornerstonejs/cornerstoneWADOImageLoader/master/testImages/<파일>
https://www.rubomedical.com/dicom_files/dicom_viewer_<0002|0003|0004|0009|0012|0015|0020|Mrbrain>.zip
```
