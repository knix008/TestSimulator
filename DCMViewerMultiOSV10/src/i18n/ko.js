window.I18N_DATA = window.I18N_DATA || {};
window.I18N_DATA.ko = {
  "menu.file": "파일", "menu.view": "보기", "menu.tools": "도구", "menu.window": "윈도우", "menu.cine": "시네", "menu.help": "도움말",

  "file.recent": "최근 폴더", "file.recentNone": "(없음)", "file.recentClear": "모두 지우기", "file.recentRemove": "목록에서 제거", "file.recentMissing": "폴더를 찾을 수 없습니다: {dir}", "file.open": "파일 열기…", "file.openFolder": "폴더 열기…", "file.export": "이미지 내보내기", "file.exportTags": "DICOM 태그 내보내기",
  "file.exportTiff16": "16비트 TIFF (원본 픽셀 값)", "file.exportAllFrames": "모든 프레임을 PNG로 (ZIP)…", "file.exportGifAnimated": "애니메이션 GIF (모든 프레임)…",
  "file.copyImage": "이미지 복사", "file.batch": "폴더 일괄 변환…", "file.print": "인쇄…", "file.close": "파일 닫기", "file.exit": "종료",

  "view.fit": "화면에 맞춤", "view.actual": "실제 크기 (100%)", "view.zoomIn": "확대", "view.zoomOut": "축소",
  "view.rotateLeft": "왼쪽으로 회전", "view.rotateRight": "오른쪽으로 회전", "view.flipH": "좌우 반전", "view.flipV": "상하 반전", "view.resetView": "보기 초기화",
  "view.invert": "반전 (네거티브)", "view.interpolation": "부드러운 보간", "view.cornerInfo": "모서리 정보 표시", "view.orientationMarkers": "방향 표시 (R/L/A/P)",
  "view.overlays": "DICOM 오버레이 평면", "view.measurements": "측정 표시", "view.burnAnnotations": "내보내기에 주석 포함",
  "view.zoomLabel": "현재 배율 (클릭: 실제 크기 100%)", "view.ruler": "눈금자 (스케일 바)", "view.grid": "격자 (10 mm)", "view.sidebar": "사이드바", "view.fullscreen": "전체 화면", "view.themeNext": "다음 테마로 전환 (클릭)", "view.theme": "테마", "view.themeDark": "다크", "view.themeLight": "라이트",
  "view.language": "언어", "view.devtools": "개발자 도구",

  "tools.pan": "이동 (드래그) — 1", "tools.wl": "윈도우 / 레벨 (드래그) — 2", "tools.zoom": "확대/축소 (드래그) — 3", "tools.stack": "프레임 / 슬라이스 스크롤 (휠, 드래그) — 4",
  "tools.probe": "픽셀 값 조사 — 5", "tools.length": "길이 측정 — 6", "tools.angle": "각도 측정 — 7", "tools.rect": "사각형 ROI — 8", "tools.ellipse": "타원 ROI — 9",
  "tools.text": "텍스트 주석 — 0", "tools.deleteLast": "마지막 측정 삭제", "tools.clear": "측정 모두 지우기",

  "wl.auto": "자동 (최소 – 최대)", "wl.file": "파일 값", "wl.presets": "프리셋", "wl.lut": "VOI LUT", "wl.function": "VOI 함수", "wl.colormap": "컬러맵",
  "wl.reset": "윈도우 초기화", "wl.none": "(없음)", "wl.custom": "사용자 지정", "wl.fileWindow": "파일 {n}",
  "preset.brain": "뇌", "preset.subdural": "경막하", "preset.stroke": "뇌졸중", "preset.soft": "연부 조직", "preset.liver": "간",
  "preset.mediastinum": "종격동", "preset.lung": "폐", "preset.bone": "뼈", "preset.abdomen": "복부", "preset.spine": "척추", "preset.angio": "혈관",
  "cm.gray": "회색", "cm.hotiron": "핫 아이언", "cm.pet": "PET", "cm.hotmetalblue": "핫 메탈 블루", "cm.pet20": "PET 20단계", "cm.jet": "제트", "cm.rainbow": "무지개", "cm.bone": "뼈",

  "cine.playPause": "재생 / 일시정지", "cine.first": "첫 프레임", "cine.prev": "이전 프레임", "cine.next": "다음 프레임", "cine.last": "마지막 프레임", "cine.loop": "반복", "cine.fps": "fps",
  "series.prev": "시리즈의 이전 파일", "series.next": "시리즈의 다음 파일", "series.load": "폴더를 DICOM 시리즈로 정렬", "series.scanning": "검사 중 {done} / {total}…",
  "series.files": "{n}개 파일", "series.none": "이 폴더에 DICOM 시리즈가 없습니다.", "series.unsorted": "폴더의 파일 (이름순)",

  "help.shortcuts": "키보드 단축키", "help.about": "DCM Viewer 정보",
  "tb.open": "열기", "tb.folder": "폴더", "tb.preset": "프리셋", "tb.colormap": "컬러", "tb.export": "내보내기", "tb.batch": "일괄 변환",

  "sidebar.folder": "폴더", "sidebar.up": "상위 폴더", "sidebar.refresh": "새로 고침", "sidebar.choose": "폴더 선택…",
  "sidebar.info": "정보", "sidebar.tags": "태그", "sidebar.histogram": "히스토그램", "sidebar.series": "시리즈", "sidebar.search": "태그 검색…", "sidebar.noFile": "열린 파일이 없습니다",
  "sidebar.noRoots": "연결된 폴더가 없습니다. 폴더 열기… 를 사용하거나 폴더를 끌어다 놓으세요.", "tags.copy": "태그를 클립보드에 복사", "tags.count": "태그 {n}개",
  "tree.parent": ".. (상위 폴더)", "tree.empty": "(비어 있음)", "tree.drives": "드라이브",

  "ctx.open": "열기", "ctx.showInFolder": "파일 관리자에서 보기", "ctx.copy": "복사", "ctx.cut": "잘라내기", "ctx.paste": "붙여넣기", "ctx.delete": "삭제", "ctx.copyPath": "경로 복사", "ctx.chooseFolder": "폴더 선택…",

  "status.ready": "준비", "status.loading": "불러오는 중…", "status.decoding": "{name} 디코딩 중…", "status.frame": "프레임 {n}/{total}", "status.zoom": "배율 {z}%",
  "status.wlWidth": "윈도우 폭 (W)", "status.wlCenter": "윈도우 중심 (L)", "status.wl": "W {ww} / L {wc}", "status.probe": "({x}, {y}) {v}", "status.file": "{name} — {size}",

  "about.text": "Web, Windows, macOS, Linux에서 동작하는 DICOM 뷰어입니다. 비압축·RLE·JPEG·JPEG-LS·JPEG 2000 DICOM 이미지를 읽고 윈도우/레벨, VOI LUT, 컬러맵, 오버레이, 시네 재생, 시리즈 스택, 측정, 태그 브라우저, 내보내기와 일괄 변환을 지원합니다.",
  "about.version": "버전", "about.platform": "플랫폼", "about.runtime": "런타임", "about.formats": "지원 형식",
  "about.formatsList": "DICOM (.dcm, .dicm, .dicom) · JPEG · PNG · GIF · WebP · BMP · TIFF · ICO · SVG",

  "dlg.close": "닫기", "dlg.ok": "확인", "dlg.cancel": "취소", "dlg.copy": "복사", "dlg.errorTitle": "오류",

  "batch.title": "폴더 일괄 변환", "batch.source": "소스 폴더", "batch.choose": "선택…", "batch.format": "형식", "batch.options": "옵션",
  "batch.recursive": "하위 폴더 포함", "batch.allFrames": "모든 프레임 (다중 프레임 파일)", "batch.currentWL": "현재 윈도우 / 컬러맵 사용",
  "batch.hint": "결과는 소스 파일 옆의 converted_<형식> 폴더에 저장됩니다 (브라우저에서 읽기 전용 폴더인 경우 ZIP 다운로드).",
  "batch.start": "시작", "batch.scanning": "검사 중…", "batch.progress": "{done} / {total} — {name}", "batch.done": "{ok}개 변환 완료, {fail}개 실패.",
  "batch.output": "출력: {dir}", "batch.noFiles": "폴더에 DICOM 파일이 없습니다.", "batch.noSource": "먼저 소스 폴더를 선택하세요.", "batch.failures": "실패한 파일",

  "export.frameSuffix": "frame", "export.done": "{name} 저장됨", "export.noImage": "먼저 이미지를 여세요.", "export.notDicom": "DICOM 이미지에서만 사용할 수 있습니다.",
  "export.singleFrame": "이 파일은 프레임이 하나뿐입니다.", "export.zipDone": "{n}개 프레임을 {name}에 저장했습니다",

  "msg.dropTitle": "DICOM 파일 열기", "msg.dropHint": ".dcm 파일이나 폴더를 여기에 끌어다 놓거나 파일 → 열기를 사용하세요.",
  "msg.loadFailed": "{name}을(를) 열 수 없습니다", "msg.unsupported": "지원하지 않는 파일 형식: {name}", "msg.copied": "클립보드에 복사했습니다",
  "msg.deleteConfirm": "\"{name}\"을(를) 휴지통으로 이동할까요?", "msg.deleted": "휴지통으로 이동: {name}", "msg.pasted": "{n}개 항목 붙여넣기 완료", "msg.noClipboard": "붙여넣을 항목이 없습니다.",
  "msg.notInBrowser": "브라우저에서는 사용할 수 없습니다.", "msg.printFailed": "인쇄 실패: {reason}", "msg.textPrompt": "주석 텍스트", "msg.noPixelData": "이 DICOM에는 이미지(픽셀 데이터)가 없습니다. 태그는 왼쪽에 표시됩니다.",
  "msg.sortedSeries": "{series}개 시리즈, {files}개 파일", "msg.warning": "경고: {text}",

  "meta.patientName": "환자명", "meta.patientId": "환자 ID", "meta.patientSex": "성별", "meta.patientBirthDate": "생년월일", "meta.patientAge": "나이",
  "meta.modality": "Modality", "meta.sopClass": "SOP 클래스", "meta.manufacturer": "제조사", "meta.institution": "기관", "meta.stationName": "스테이션",
  "meta.studyDate": "검사 날짜", "meta.studyTime": "검사 시간", "meta.studyDescription": "검사 설명", "meta.seriesDescription": "시리즈 설명", "meta.seriesNumber": "시리즈 번호",
  "meta.instanceNumber": "인스턴스 번호", "meta.accessionNumber": "Accession 번호", "meta.bodyPart": "검사 부위", "meta.protocolName": "프로토콜", "meta.patientPosition": "환자 자세",
  "meta.imageSize": "이미지 크기", "meta.photometric": "Photometric", "meta.bitDepth": "비트 깊이", "meta.frames": "프레임 수", "meta.frameRate": "프레임 속도", "meta.transferSyntax": "전송 구문",
  "meta.pixelSpacing": "픽셀 간격", "meta.sliceThickness": "슬라이스 두께", "meta.sliceLocation": "슬라이스 위치", "meta.imagePosition": "이미지 위치", "meta.imageOrientation": "방향",
  "meta.window": "윈도우 (파일)", "meta.voiLut": "VOI LUT", "meta.rescale": "Rescale", "meta.units": "단위", "meta.presentationLut": "Presentation LUT", "meta.overlays": "오버레이",
  "meta.lossyCompression": "손실 압축", "meta.studyInstanceUid": "Study UID", "meta.seriesInstanceUid": "Series UID", "meta.sopInstanceUid": "SOP Instance UID",
  "meta.fileName": "파일", "meta.fileSize": "크기", "meta.format": "형식", "meta.dimensions": "픽셀 크기", "meta.frameInfo": "현재 프레임",

  "hist.title": "히스토그램", "hist.range": "범위 {min} – {max}", "hist.window": "노란색: 현재 윈도우", "hist.none": "컬러 이미지는 히스토그램을 제공하지 않습니다.",
  "roi.stats": "n={n} 평균={mean} 표준편차={sd} 최소={min} 최대={max}", "roi.area": "면적 {a}",

  "view.settings": "설정…", "tb.settings": "설정",
  "settings.title": "프로그램 설정", "settings.appearance": "모양", "settings.viewer": "뷰어", "settings.files": "파일",
  "settings.reset": "기본값 복원", "settings.resetDone": "설정을 기본값으로 되돌렸습니다.", "settings.clear": "지우기",
  "settings.theme": "테마 (기본 20종)", "settings.lang": "언어", "settings.sidebar": "사이드바 표시",
  "settings.interpolate": "확대 시 부드러운 보간", "settings.cornerInfo": "모서리 정보 (환자 / 검사 / 윈도우)",
  "settings.markers": "방향 표시 (R / L / A / P / H / F)", "settings.overlays": "DICOM 오버레이 평면(60xx) 표시",
  "settings.measurements": "측정 표시", "settings.burnAnnotations": "내보내는 이미지에 주석 포함",
  "settings.wheelMode": "마우스 휠 동작", "settings.wheelZoom": "확대/축소 (Ctrl+휠: 프레임 이동)", "settings.wheelStack": "프레임/슬라이스 이동 (Ctrl+휠: 확대/축소)",
  "settings.defaultFps": "기본 시네 속도 (fps)", "settings.defaultFpsDesc": "파일에 프레임 속도가 없을 때 사용합니다.",
  "settings.loop": "시네 반복 재생", "settings.annotationColor": "측정 색상", "settings.overlayColor": "오버레이 평면 색상",
  "settings.rememberLastDir": "마지막 폴더 기억", "settings.startupDir": "시작 시 열 폴더",
  "settings.startupDirHint": "(마지막 폴더 / 사진)", "settings.confirmDelete": "휴지통으로 이동하기 전에 확인",

  "tools.mpr": "MPR / MIP 볼륨 보기…", "tools.anonymize": "익명화 사본 저장…", "file.exportWebm": "시네 동영상 (WebM)…", "view.languageToggle": "언어 전환 (한국어 / English)", "sc.settings": "설정",
  "popup.about": "DCM Viewer 정보", "popup.settings": "프로그램 설정", "popup.batch": "일괄 변환", "popup.error": "오류", "popup.shortcuts": "키보드 단축키", "popup.mpr": "MPR / MIP", "popup.anonymize": "익명화", "popup.prompt": "입력",
  "mpr.title": "MPR / MIP 볼륨 보기", "mpr.mode": "모드", "mpr.avg": "평균", "mpr.slab": "슬랩 두께", "mpr.crosshair": "십자선", "mpr.export": "3면 내보내기 (PNG)",
  "mpr.axial": "축상면 (Axial)", "mpr.coronal": "관상면 (Coronal)", "mpr.sagittal": "시상면 (Sagittal)", "mpr.loading": "슬라이스 읽는 중 {done} / {total}…", "mpr.noSlices": "재구성할 슬라이스가 없습니다.",
  "mpr.notGray": "MPR은 회색조 슬라이스가 필요합니다.", "mpr.sizeMismatch": "모든 슬라이스의 크기가 같아야 합니다.", "mpr.needSeries": "먼저 폴더를 DICOM 시리즈로 정렬(시네 → 시리즈로 정렬)하거나 다중 프레임 파일을 여세요.",
  "anon.title": "익명화 사본 저장", "anon.hint": "선택한 값을 파일 사본에서 덮어씁니다 (길이는 유지되어 파일 구조가 그대로 유효합니다). 픽셀 데이터는 변경하지 않습니다.",
  "anon.private": "모든 비공개(private, 홀수 그룹) 태그 비우기", "anon.replacement": "대체 문자열", "anon.save": "사본 저장…", "anon.done": "{n}개 요소를 익명화 → {name}",
  "video.unsupported": "이 환경에서는 동영상 녹화를 지원하지 않습니다.",

  "sc.open": "파일 열기", "sc.openFolder": "폴더 열기", "sc.export": "PNG 내보내기", "sc.copy": "이미지 복사", "sc.print": "인쇄", "sc.fit": "화면에 맞춤", "sc.actual": "실제 크기",
  "sc.zoom": "확대 / 축소", "sc.wheel": "마우스 휠: 확대/축소 (스택 도구에서는 프레임 이동)", "sc.rotate": "회전", "sc.flip": "좌우 / 상하 반전", "sc.reset": "보기 초기화",
  "sc.invert": "반전", "sc.tools": "도구 선택", "sc.frames": "이전 / 다음 프레임", "sc.frameEnds": "첫 / 마지막 프레임", "sc.play": "시네 재생 / 일시정지",
  "sc.series": "이전 / 다음 파일", "sc.wlAuto": "자동 윈도우", "sc.wlFile": "파일 윈도우", "sc.wlReset": "윈도우 초기화", "sc.delete": "마지막 / 모든 측정 삭제",
  "sc.sidebar": "사이드바 토글", "sc.fullscreen": "전체 화면", "sc.escape": "도구 취소 / 메뉴 닫기", "sc.rightDrag": "오른쪽 드래그: 윈도우/레벨 · 가운데 드래그: 이동"
};
