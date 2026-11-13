// Library categories (the left panel's Library tab). Every catalog entry has one of these ids.
export const CATEGORIES = [
  { id: 'living', ko: '거실', en: 'Living room', icon: 'libLiving' },
  { id: 'dining', ko: '식당', en: 'Dining', icon: 'libDining' },
  { id: 'bedroom', ko: '침실', en: 'Bedroom', icon: 'libBedroom' },
  { id: 'kitchen', ko: '주방', en: 'Kitchen', icon: 'libKitchen' },
  { id: 'bathroom', ko: '욕실', en: 'Bathroom', icon: 'libBathroom' },
  { id: 'office', ko: '서재·사무', en: 'Study & office', icon: 'libOffice' },
  { id: 'workplace', ko: '회사 사무', en: 'Workplace', icon: 'libWorkplace' },
  { id: 'officeprops', ko: '사무실', en: 'Office props', icon: 'libOfficeProps' },
  { id: 'computer', ko: '컴퓨터', en: 'Computers', icon: 'libComputer' },
  { id: 'serverroom', ko: '서버실', en: 'Server room', icon: 'libServerRoom' },
  { id: 'security', ko: '보안', en: 'Security', icon: 'libSecurity' },
  { id: 'kids', ko: '아이 방', en: 'Kids', icon: 'libKids' },
  { id: 'storage', ko: '수납', en: 'Storage', icon: 'libStorage' },
  { id: 'lighting', ko: '조명', en: 'Lighting', icon: 'libLighting' },
  { id: 'decor', ko: '장식', en: 'Decor', icon: 'libDecor' },
  { id: 'accessories', ko: '소품', en: 'Accessories', icon: 'libAccessories' },
  { id: 'plants', ko: '식물', en: 'Plants', icon: 'libPlants' },
  { id: 'appliances', ko: '가전', en: 'Appliances', icon: 'libAppliances' },
  { id: 'doors', ko: '문', en: 'Doors', icon: 'libDoor' },
  { id: 'windows', ko: '창문', en: 'Windows', icon: 'libWindow' },
  { id: 'structure', ko: '구조·마감', en: 'Structure', icon: 'libStructure' },
  { id: 'landscape', ko: '조경', en: 'Landscaping', icon: 'libLandscape' },
  { id: 'outdoor', ko: '실외', en: 'Outdoor', icon: 'libOutdoor' },
  { id: 'mine', ko: '내 객체', en: 'My objects', icon: 'libMine' },
];

/** The user's own categories (domain/userlibrary.js), placed before My objects. Replaces the previous ones. */
export function setUserCategories(list = []) {
  for (let i = CATEGORIES.length - 1; i >= 0; i--) if (CATEGORIES[i].user) CATEGORIES.splice(i, 1);
  const at = CATEGORIES.findIndex((c) => c.id === 'mine');
  CATEGORIES.splice(at < 0 ? CATEGORIES.length : at, 0, ...list.map((c) => ({ id: c.id, ko: c.name, en: c.name, icon: c.icon || 'libMine', user: true })));
}
