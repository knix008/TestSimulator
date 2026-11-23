// Texts of the free-surface study (app-freesurface.js, cad/cfd/freesurface.js). { key: [Korean, English] }.
const T = {
  'cmd.freeSurface': ['자유 표면 유동', 'Free Surface'],
  'pm.help.freeSurface': ['부품을 용기(탱크·컵)로 보고 액체를 일정 높이까지(또는 길이의 일부에만 — 댐) 채운 뒤, 정지 또는 옆으로 가속하는 용기 안에서 자유 표면이 어떻게 움직이는지 격자 볼츠만 자유 표면 방법으로 계산합니다. 장면마다 액체 표면, 벽에서 올라간 높이, 무게 중심의 이동을 봅니다.', 'The part is a container (a tank, a cup): fill it with a liquid up to a level (or over part of its length only — a dam) and see how the free surface moves while the vessel stands still or accelerates sideways, by the free-surface lattice Boltzmann method. Step through the frames: the liquid surface, the run-up at the walls and the shift of the centre of mass.'],
  'fs.setup': ['액체와 용기', 'Liquid and vessel'],
  'fs.liquid.water': ['물', 'Water'],
  'fs.liquid.oil': ['오일', 'Oil'],
  'fs.liquid.glycerine': ['글리세린', 'Glycerine'],
  'fs.level': ['채움 높이', 'Fill level'],
  'fs.dam': ['채운 길이 (x 방향)', 'Filled length (along x)'],
  'fs.accel': ['용기 가속도 (+x)', 'Vessel acceleration (+x)'],
  'fs.note': ['부품이 옆과 아래로 둘러싼 공간이 용기 안입니다. 중력은 −Z. 가속하면 액체는 반대쪽(−x)으로 쏠립니다(기울기 a/g). 물처럼 점성이 낮은 액체는 격자에서 대와류 감쇠를 씁니다.', 'The container is the space the part encloses at its sides and below. Gravity is −Z. Accelerated, the liquid leans back (−x, slope a/g). A thin liquid like water gets large-eddy damping on the grid.'],
  'fs.frame': ['장면 (0 – {n})', 'Frame (0 – {n})'],
  'fs.time': ['시각', 'Time'],
  'fs.top': ['액체 최고 높이', 'Highest liquid'],
  'fs.com': ['무게 중심 이동', 'Centre of mass moved'],
  'fs.mass': ['질량 변화', 'Mass change'],
  'fs.done': ['자유 표면 해석 완료 — {time} s, 최고 높이 변화 {rise} mm', 'Free surface done — {time} s, highest liquid {rise} mm'],
  'fs.error.not-a-vessel': ['부품이 액체를 담을 공간(옆과 아래가 막힌 곳)을 만들지 않습니다.', 'The part does not enclose a space that holds liquid (closed at the sides and below).'],
  'fs.error.no-liquid': ['채울 액체가 없습니다 (채움 높이·길이를 늘리세요).', 'No liquid to fill (raise the level or the filled length).'],
};

export const ko = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[0]]));
export const en = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[1]]));
