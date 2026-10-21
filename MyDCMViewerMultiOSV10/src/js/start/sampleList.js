// The sample DICOM files shown on the start page. The desktop app ships exactly these
// (scripts/stage-samples.mjs copies them into the bundle); the web version serves them
// from samples/. `file` is relative to the samples folder, '/'-separated.
export const START_SAMPLES = [
  { id: 'ct', file: 'cornerstone/CTImage.dcm', icon: 'ct', ko: ['CT 영상', '512×512 흉부 CT · HU 값 · CT 프리셋'], en: ['CT slice', '512×512 chest CT · HU values · CT presets'] },
  { id: 'mrbrain', file: 'rubo/MRBRAIN.DCM', icon: 'mr', ko: ['MR 뇌', '뇌 MR · 윈도우/레벨 · 측정'], en: ['MR brain', 'Brain MR · window/level · measuring'] },
  { id: 'emri', file: 'pydicom-data/emri_small.dcm', icon: 'cine', ko: ['Enhanced MR (10프레임)', '다중 프레임 · 시네 재생 · MPR'], en: ['Enhanced MR (10 frames)', 'Multi-frame · cine · MPR'] },
  { id: 'echo', file: 'pydicom-data/color3d_jpeg_baseline.dcm', icon: 'us', ko: ['컬러 도플러 초음파', '120프레임 심장 초음파 시네 · 동영상 내보내기'], en: ['Colour Doppler echo', '120-frame cardiac ultrasound cine · video export'] },
  { id: 'xa', file: 'rubo/0002.DCM', icon: 'cine', ko: ['혈관 조영 (XA)', '심장 혈관 조영 시네 · JPEG 압축'], en: ['Angiography (XA)', 'Cardiac angiography cine · JPEG'] },
  { id: 'cr', file: 'pydicom-data/RG1_J2KI.dcm', icon: 'xray', ko: ['흉부 X선 (CR)', 'MONOCHROME1 · JPEG 2000 · 1841×1955'], en: ['Chest X-ray (CR)', 'MONOCHROME1 · JPEG 2000 · 1841×1955'] },
  { id: 'mr2', file: 'pydicom-data/MR2_J2KR.dcm', icon: 'mr', ko: ['고해상도 MR', '1024×1024 · JPEG 2000 무손실'], en: ['High-resolution MR', '1024×1024 · lossless JPEG 2000'] },
  { id: 'us', file: 'pydicom-data/US1_J2KR.dcm', icon: 'us', ko: ['초음파 (컬러)', 'RGB 초음파 · JPEG 2000'], en: ['Ultrasound (colour)', 'RGB ultrasound · JPEG 2000'] },
  { id: 'ect', file: 'pydicom-data/eCT_Supplemental.dcm', icon: 'ct', ko: ['Enhanced CT', 'Functional Groups · 프레임별 윈도우'], en: ['Enhanced CT', 'Functional groups · per-frame windows'] },
  { id: 'overlay', file: 'pydicom/examples_overlay.dcm', icon: 'layers', ko: ['오버레이 평면', 'DICOM 60xx 오버레이 표시'], en: ['Overlay planes', 'DICOM 60xx overlays'] },
  { id: 'palette', file: 'pydicom/examples_palette.dcm', icon: 'palette', ko: ['팔레트 컬러', 'PALETTE COLOR 영상'], en: ['Palette colour', 'PALETTE COLOR image'] },
  { id: 'mlut', file: 'pydicom-data/mlut_18.dcm', icon: 'lut', ko: ['Modality LUT', '비선형 Modality LUT · VOI LUT'], en: ['Modality LUT', 'Non-linear modality LUT · VOI LUT'] },
  { id: 'rtdose', file: 'pydicom/rtdose.dcm', icon: 'dose', ko: ['RT 선량 분포', '다중 프레임 선량 · 컬러맵'], en: ['RT dose', 'Multi-frame dose · colour maps'] },
  { id: 'rtstruct', file: 'more/rtstruct.dcm', icon: 'contour', ko: ['RT 구조 (윤곽)', 'ROI 윤곽선 · 구조 목록'], en: ['RT structures', 'ROI contours · structure list'] },
  { id: 'rtplan', file: 'more/rtplan.dcm', icon: 'plan', ko: ['RT 치료 계획', '빔 · 분할 · 처방 요약'], en: ['RT plan', 'Beams · fractions · prescription'] },
  { id: 'sr', file: 'more/test-SR.dcm', icon: 'report', ko: ['구조화 보고서 (SR)', '판독 보고서 트리 · HTML/텍스트 내보내기'], en: ['Structured report (SR)', 'Report tree · HTML / text export'] },
  { id: 'ecg', file: 'more/waveform_ecg.dcm', icon: 'ecg', ko: ['12유도 심전도', 'DICOM 파형 · CSV / PNG 내보내기'], en: ['12-lead ECG', 'DICOM waveform · CSV / PNG export'] },
  { id: 'video', file: 'video/us_h264.dcm', icon: 'cine', ko: ['DICOM 동영상 (H.264)', 'MPEG-4 AVC 심장 초음파 · 재생 / 잠시 멈춤 / 멈춤'], en: ['DICOM video (H.264)', 'MPEG-4 AVC echo · play / pause / stop'] },
  { id: 'video-hevc', file: 'video/us_hevc.dcm', icon: 'cine', ko: ['DICOM 동영상 (HEVC)', 'H.265 동영상 · 엔진에 디코더가 없으면 추출'], en: ['DICOM video (HEVC)', 'H.265 video · extracted when the engine has no decoder'] },
  { id: 'video-mpeg2', file: 'video/us_mpeg2.dcm', icon: 'cine', ko: ['DICOM 동영상 (MPEG-2)', '브라우저가 재생할 수 없는 형식 · 동영상 추출'], en: ['DICOM video (MPEG-2)', 'Not playable in a browser · extract the video'] },
  { id: 'dicomdir', file: 'dicomdir/DICOMDIR', icon: 'dicomdir', ko: ['DICOMDIR (CD/DVD)', '환자 › 검사 › 시리즈 목록으로 열기'], en: ['DICOMDIR (CD/DVD)', 'Browse patient › study › series'] },
];

/** Everything under samples/ the desktop bundle needs (folders are copied whole). */
export const START_SAMPLE_FOLDERS = ['dicomdir'];
