// Names of the mechanical moving backgrounds (ANIMATIONS in domain/settings.js): { key: [Korean, English] }.
// Spread last in i18n.js, so these win over the shell's dictionaries.
const T = {
  'animation.gears': ['맞물린 기어', 'Meshing gears'],
  'animation.piston': ['피스톤과 크랭크', 'Pistons and crankshaft'],
  'animation.toolpath': ['CNC 공구 경로', 'CNC toolpath'],
  'animation.stressField': ['FEA 응력 분포', 'FEA stress plot'],
  'animation.tessellation': ['메시 테셀레이션', 'Mesh tessellation'],
  'animation.exploded': ['분해도', 'Exploded assembly'],
  'animation.sheetMetal': ['판금 절곡', 'Sheet-metal bending'],
  'animation.weldBead': ['용접 비드', 'Weld bead'],
  'animation.printLayers': ['3D 프린팅 적층', '3D-printed layers'],
  'animation.threading': ['볼트와 너트', 'Nuts and bolts'],
  'animation.bearing': ['볼 베어링', 'Ball bearings'],
  'animation.spring': ['압축 스프링', 'Compression springs'],
  'animation.cam': ['캠과 종동절', 'Cam and follower'],
  'animation.conveyor': ['컨베이어', 'Conveyors'],
  'animation.triads': ['좌표계와 뷰 큐브', 'Triads and view cube'],
  'animation.gdtFrames': ['기하 공차 기호', 'GD&T frames'],
  'animation.laserCut': ['레이저 절단', 'Laser cutting'],
  'animation.helixSweep': ['나선 스윕', 'Helix sweep'],
  'animation.sectionHatch': ['단면도 해칭', 'Section hatching'],
  'animation.turbine': ['팬 로터', 'Fan rotor'],
  'animation.fourBar': ['4절 링크', 'Four-bar linkage'],
  'animation.chainDrive': ['체인 구동', 'Chain drive'],
};

export const ko = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[0]]));
export const en = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[1]]));
