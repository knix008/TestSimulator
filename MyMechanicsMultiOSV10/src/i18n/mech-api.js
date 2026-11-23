// Texts of the automation API additions and custom properties (app-macros.js, app.js). { key: [Korean, English] }.
const T = {
  'macro.noPlane': ['평면 "{name}" 이(가) 없습니다.', 'There is no plane "{name}".'],
  'macro.badShape': ['스케치 도형 "{kind}" 을(를) 알 수 없습니다.', 'Unknown sketch shape "{kind}".'],
  'macro.featureFailed': ['{name} 을(를) 만들지 못했습니다: {error}', '{name} failed: {error}'],
  'macro.noEdges': ['조건에 맞는 모서리가 없습니다.', 'No edge matches.'],
  'macro.noConfig': ['구성 "{name}" 이(가) 없습니다.', 'There is no configuration "{name}".'],
  'macro.noDocument': ['열린 문서가 없습니다.', 'No document is open.'],
  'macro.noPartNamed': ['부품 "{name}" 이(가) 없습니다.', 'There is no part "{name}".'],
  'macro.noAssembly': ['어셈블리를 열어야 합니다.', 'Open an assembly first.'],
  'macro.noComponent': ['구성 요소 "{name}" 이(가) 없습니다.', 'There is no component "{name}".'],
  'macro.eventsReset': ['이벤트 처리기를 모두 지웠습니다.', 'All event handlers removed.'],
  'sim.radiation': ['복사', 'Radiation'],
  'sim.emissivity': ['방사율 (0–1)', 'Emissivity (0–1)'],
  'sim.radiationNote': ['고른 면이 주변으로 열을 복사합니다: εσ(T⁴ − T∞⁴), 절대 온도. 비선형이라 뉴턴 반복으로 풉니다.', 'The faces radiate to the surroundings: εσ(T⁴ − T∞⁴) in absolute temperature. It is nonlinear: solved by Newton steps.'],
  'sim.radiated': ['복사로 나간 열', 'Heat radiated'],
  'sim.error.radiationTet': ['복사는 사면체 해석에서만 됩니다.', 'Radiation needs the tetrahedral solver.'],
  'op.customProperty': ['사용자 정의 속성', 'Custom property'],
  'props.custom': ['사용자 정의 속성', 'Custom properties'],
  'props.customNone': ['사용자 정의 속성이 없습니다.', 'No custom properties.'],
  'props.customAdd': ['속성 추가', 'Add property'],
  'props.customName': ['속성 이름', 'Property name'],
  'props.customValue': ['값', 'Value'],
  'props.customDefault': ['속성', 'Property'],
  'props.customKeyBad': ['속성 이름 "{name}" 을(를) 쓸 수 없습니다 (비었거나 이미 있음).', 'Property name "{name}" cannot be used (empty or taken).'],
};

export const ko = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[0]]));
export const en = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[1]]));
