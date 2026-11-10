// Import floor plan from other programs: PDF drawings, IFC (BIM) and Sweet Home 3D buildings, more plan pictures
// (TIFF, TGA, AVIF, HEIC). Both languages side by side (merged in i18n.js).
const T = {
  'plan.buildingTitle': ['건물 가져오기', 'Import building'],
  'plan.page': ['{n}쪽', 'Page {n}'],
  'plan.pageScan': ['스캔(그림)', 'scanned (picture)'],
  'plan.pageLines': ['선 {lines}개', '{lines} lines'],
  'plan.choosePage': ['가져올 쪽', 'Page to import'],
  'plan.pagesHint': ['선으로 그린 쪽은 벽·문·창으로, 스캔한 쪽은 그림(밑그림)으로 가져옵니다.', 'Pages drawn with lines become walls, doors and windows; scanned pages come in as a picture to trace over.'],
  'plan.scale': ['축척 1 :', 'Scale 1 :'],
  'plan.scaleFromText': ['도면의 "{text}"에서 읽었습니다', 'Read from "{text}" on the drawing'],
  'plan.scaleFromTextPaper': ['도면의 "{text}"({paper} 용지)를 {page} 쪽에 맞췄습니다', '"{text}" ({paper} paper) on the drawing, adjusted to this {page} page'],
  'plan.scaleFromDoors': ['축척 표시가 없어 문 크기에서 1:{scale}로 추정했습니다. 가져온 뒤 두 점으로 맞추세요', 'No scale on the drawing: 1:{scale} guessed from the door sizes. Set it with two points after the import'],
  'plan.scaleDefault': ['축척 표시가 없어 1:{scale}로 둡니다. 가져온 뒤 두 점으로 맞추세요', 'No scale on the drawing: 1:{scale} assumed. Set it with two points after the import'],
  'plan.calibratePlan': ['가져온 뒤 두 점으로 축척 맞추기', 'Set the scale with two points after the import'],
  'plan.pdfHint': ['PDF의 선·호·글자를 CAD 도면처럼 읽습니다(레이어가 있으면 레이어별로). 축척은 도면의 "1:100" 같은 표시에서 읽고, 없으면 두 점으로 맞춥니다.', 'The lines, arcs and texts of the PDF are read like a CAD drawing (by layer when it has layers). The scale comes from a "1:100" on the drawing, else set it with two points.'],
  'plan.buildingSummary': ['층 {levels} · 벽 {walls} · 문 {doors} · 창 {windows} · 방 {rooms}', '{levels} levels · {walls} walls · {doors} doors · {windows} windows · {rooms} rooms'],
  'plan.buildingFurniture': ['가구 {total}개: 라이브러리 {matched}개, 파일의 모델 {models}개', '{total} pieces of furniture: {matched} from the library, {models} with their own model'],
  'plan.targetAddBuilding': ['현재 프로젝트에 층 추가', 'Add levels to this project'],
  'plan.furniture': ['가구', 'Furniture'],
  'plan.furnitureModels': ['라이브러리 + 파일의 모델', 'Library + own models'],
  'plan.furnitureLibrary': ['라이브러리만', 'Library only'],
  'plan.furnitureNone': ['가져오지 않음', 'None'],
  'plan.buildingRooms': ['방(이름·바닥색) 가져오기', 'Import rooms (names, floor colours)'],
  'plan.buildingHint': ['층·벽·문·창·방·계단을 그대로 만들고, 가구는 이름과 크기가 맞는 라이브러리 항목으로 바꿉니다. 맞는 항목이 없는 가구는 파일 속 모델을 내 개체로 가져옵니다.', 'Levels, walls, doors, windows, rooms and stairs are made as they are; furniture becomes the library item of the same name and size, and pieces without one bring their own model into My objects.'],
  'plan.ifcComplexWalls': ['곧지 않은 벽 {count}개(곡선·꺾인 벽)는 가져오지 않았습니다.', '{count} walls that are not straight (curved or bent) were left out.'],
  'plan.ifcSlabs': ['바닥판 {count}개는 방 바닥으로 대신합니다.', '{count} slabs are shown by the room floors instead.'],
  'plan.sh3dOld': ['{name}: Sweet Home 3D 5.3 이전 판으로 저장된 파일이라 읽을 수 없습니다(Home.xml 없음). Sweet Home 3D에서 열어 다시 저장한 뒤 가져오세요.', '{name}: saved by Sweet Home 3D older than 5.3 (no Home.xml), which no other program can read. Open it in Sweet Home 3D, save it again and import that.'],
  'plan.heicUnsupported': ['{name}: 이 컴퓨터는 HEIC 사진을 읽지 못합니다. 사진 앱에서 JPG나 PNG로 저장해 가져오세요.', '{name}: this computer cannot read HEIC pictures. Save it as JPG or PNG in a photo app and import that.'],
  'progress.readPdf': ['PDF 도면을 읽는 중', 'Reading the PDF drawing'],
  'progress.readBuilding': ['건물을 읽는 중', 'Reading the building'],
  'notice.buildingImported': ['{name}: 층 {levels} · 벽 {walls} · 문 {doors} · 창 {windows} · 방 {rooms} · 가구 {objects}', '{name}: {levels} levels, {walls} walls, {doors} doors, {windows} windows, {rooms} rooms, {objects} objects'],
  'error.code.pdf-invalid': ['PDF 파일이 아닙니다', 'This is not a PDF file'],
  'error.code.sh3d-invalid': ['Sweet Home 3D 파일이 아닙니다', 'This is not a Sweet Home 3D file'],
  'error.code.raster-invalid': ['그림을 읽지 못했습니다(지원하지 않는 TIFF/TGA 형식)', 'The picture could not be read (an unsupported TIFF / TGA kind)'],
};

export const ko = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[0]]));
export const en = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[1]]));
