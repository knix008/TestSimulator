// Texts of the help documents' entry points (the tutorial document next to the user's guide on the start page
// and in the Help menu): { key: [Korean, English] }. Registered last in i18n.js.
const T = {
  'start.tutorialDocShort': ['튜토리얼', 'Tutorial'],
  'action.tutorialDoc': ['튜토리얼 문서', 'Tutorial document'],
  'tip.tutorialDoc': ['튜토리얼 문서를 별도의 창에서 엽니다 (첫 부품부터 도면·해석까지, 단계마다 화면)', 'Open the tutorial in its own window (from a first part to drawings and simulation, a screen for every step)'],
};

export const ko = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[0]]));
export const en = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[1]]));
