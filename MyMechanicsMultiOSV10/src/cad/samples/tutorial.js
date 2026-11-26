// The tutorial: building the six-axis articulated robot (the "asmRobot" sample) step by step, in 17 lessons.
// Each lesson's result is a start-page sample of the "tutorial" group — the robot model cut back to that lesson:
// the parts made so far (the part being made with only its features up to that lesson), then the gripper
// sub-assembly, the robot assembly with the joints placed so far (each with its motor), the exploded view and the
// assembly drawing. The video (scripts/make-tutorial-video.mjs) replays the same model feature by feature, and the
// tutorial documents (doc/Tutorial*.md) describe the same steps. Part lessons show their part on a turntable (every
// sample moves). Nothing from the imported modules is used at module top level (samples.js imports this file).
import { robotModel, assemblyDrawing } from './assembly.js';
import { STAGE } from './motion.js';

const G = 'tutorial';
/** Project parts in build order (robotModel's): base, waist, upper arm, forearm, wrist yoke, wrist pitch, tool flange, gripper body, finger. */
export const PART_ORDER = ['base', 'waist', 'upper', 'fore', 'wrist', 'pitch', 'flange', 'gBody', 'finger'];

/**
 * The lessons: id, titles and notes (ko / en), what the result holds — `parts` (how many parts are complete),
 * `partial` ([part index, features kept] of the part being made), `show` (the part to show on the turntable),
 * `grip` (the gripper sub-assembly), `robot` (robot components placed: 2 = base and waist …), `explode`, `drawing`.
 */
export const LESSONS = [
  { id: 'tut01', parts: 0, partial: [0, 2], show: 0, icon: 'featRevolve', ko: ['1과 · 베이스 — 회전 몸체', '정면 스케치 · 중심선 · 회전 피처'], en: ['Lesson 1 · Base — revolved body', 'Front sketch · centreline · revolve'] },
  { id: 'tut02', parts: 0, partial: [0, 5], show: 0, icon: 'featCirPattern', ko: ['2과 · 베이스 — 리브와 원형 패턴', '중간 평면 돌출 · 원형 패턴 6개'], en: ['Lesson 2 · Base — ribs and a circular pattern', 'Mid-plane extrude · circular pattern of 6'] },
  { id: 'tut03', parts: 1, show: 0, icon: 'featHole', ko: ['3과 · 베이스 — 구멍과 베어링 자리', '오프셋 평면 · 카운터보어 구멍 패턴 · 잘라내기 · 모따기'], en: ['Lesson 3 · Base — holes and the bearing seat', 'Offset planes · counterbored hole pattern · cut · chamfer'] },
  { id: 'tut04', parts: 1, partial: [1, 8], show: 1, icon: 'featExtrude', ko: ['4과 · 선회 몸체 (J1) — 턴테이블과 기둥', '위·아래 돌출 · 사각 기둥 · 세로 모서리 필렛'], en: ['Lesson 4 · Waist (J1) — turntable and column', 'Extrude up and down · square column · vertical edge fillets'] },
  { id: 'tut05', parts: 2, show: 1, icon: 'featHole', ko: ['5과 · 선회 몸체 (J1) — J2 하우징과 구멍', '보스 · 베어링 구멍 · 나사 구멍 원형 패턴 · 케이블 통로'], en: ['Lesson 5 · Waist (J1) — J2 housing and holes', 'Boss · bearing bore · screw-hole pattern · cable passage'] },
  { id: 'tut06', parts: 3, show: 2, icon: 'featCut', ko: ['6과 · 상완 (J2)', '축 · 웨브 · 관절 허브 · 슬롯 포켓 · J3 베어링 구멍'], en: ['Lesson 6 · Upper arm (J2)', 'Shaft · web · joint hubs · slot pockets · J3 bearing bore'] },
  { id: 'tut07', parts: 4, show: 3, icon: 'featFillet', ko: ['7과 · 전완 (J3)', '허브 · 오른쪽 평면 튜브 · 모터 하우징 · 필렛 · J4 구멍'], en: ['Lesson 7 · Forearm (J3)', 'Hub · tube on the Right plane · motor housing · fillet · J4 bore'] },
  { id: 'tut08', parts: 5, show: 4, icon: 'featMirror', ko: ['8과 · 손목 요크 (J4)', '선·호 스케치 · 대칭 복사 · J5 구멍'], en: ['Lesson 8 · Wrist yoke (J4)', 'Line and arc sketch · mirror · J5 bore'] },
  { id: 'tut09', parts: 7, show: 6, icon: 'featCirPattern', ko: ['9과 · 손목 피치 (J5)와 툴 플랜지 (J6)', '중간 평면 돌출 · ISO 9409 구멍 패턴'], en: ['Lesson 9 · Wrist pitch (J5) and tool flange (J6)', 'Mid-plane extrudes · ISO 9409 hole pattern'] },
  { id: 'tut10', parts: 9, show: 8, icon: 'featChamfer', ko: ['10과 · 그리퍼 몸체와 핑거', '슬롯 홈 · 나사·공기 구멍 · V 홈 잘라내기'], en: ['Lesson 10 · Gripper body and finger', 'Finger slot · screw and air holes · V-jaw cut'] },
  { id: 'tut11', parts: 9, grip: true, icon: 'assembly', ko: ['11과 · 그리퍼 서브 어셈블리', '일치 · 폭 메이트 · 거리 제한 · 핑거 모터'], en: ['Lesson 11 · Gripper sub-assembly', 'Coincident · width mates · limit distance · finger motor'] },
  { id: 'tut12', parts: 9, grip: true, robot: 2, icon: 'mateHinge', ko: ['12과 · 로봇 어셈블리 — J1', '베이스 고정 · 힌지 메이트 · 회전 모터'], en: ['Lesson 12 · Robot assembly — J1', 'Fixed base · hinge mate · rotary motor'] },
  { id: 'tut13', parts: 9, grip: true, robot: 4, icon: 'mateAngle', ko: ['13과 · 로봇 어셈블리 — J2·J3', '힌지 · 각도 제한 · 부모 관절 위의 모터'], en: ['Lesson 13 · Robot assembly — J2 and J3', 'Hinges · limit angles · motors on the joint below'] },
  { id: 'tut14', parts: 9, grip: true, robot: 7, icon: 'mateHinge', ko: ['14과 · 로봇 어셈블리 — 손목 J4·J5·J6', '힌지 · 각도 제한 · 툴 플랜지 연속 회전'], en: ['Lesson 14 · Robot assembly — wrist J4, J5, J6', 'Hinges · limit angle · tool flange turning on'] },
  { id: 'tut15', parts: 9, grip: true, robot: 8, icon: 'motion', ko: ['15과 · 그리퍼 장착과 전체 모션', '서브 어셈블리 넣기 · 일치·동심 · 6관절 모션 스터디'], en: ['Lesson 15 · The gripper on, the whole motion', 'Insert a sub-assembly · coincident and concentric · six-joint motion study'] },
  { id: 'tut16', parts: 9, grip: true, robot: 8, explode: true, icon: 'explode', ko: ['16과 · 분해도', '분해 단계 7개 · 분해 애니메이션'], en: ['Lesson 16 · Exploded view', 'Seven explode steps · explode animation'] },
  { id: 'tut17', parts: 9, grip: true, robot: 8, explode: true, drawing: true, icon: 'bom', ko: ['17과 · 조립 도면', '등각도 · 부품표 · 품번 풍선 · 주기'], en: ['Lesson 17 · Assembly drawing', 'Isometric view · bill of materials · balloons · notes'] },
];

export const SAMPLES = LESSONS.map(({ id, icon, ko, en }) => ({ id, group: G, icon, ko, en }));

const T = (lang) => (ko, en) => (lang === 'en' ? en : ko);

/** The robot model cut back to the end of a lesson (Y-up, as the samples are built). */
export function lessonProject(lesson, L) {
  const model = robotModel(L);
  const { project } = model;
  const [grip, robot] = project.assemblies;
  const parts = project.parts.slice(0, lesson.partial ? lesson.partial[0] + 1 : lesson.parts);
  if (lesson.partial) parts[lesson.partial[0]].features = parts[lesson.partial[0]].features.slice(0, lesson.partial[1]);
  project.parts = parts;
  project.assemblies = [];
  if (lesson.grip) project.assemblies.push(grip);
  if (lesson.robot) {
    robot.components = robot.components.slice(0, lesson.robot);
    const has = new Set(robot.components.map((c) => c.id));
    robot.mates = robot.mates.filter((m) => [m.a?.comp, m.b?.comp, m.c?.comp, m.d?.comp].filter(Boolean).every((c) => has.has(c)));
    if (robot.motion) robot.motion.motors = robot.motion.motors.filter((m) => has.has(m.comp));
    if (!lesson.explode) delete robot.explode;
    project.assemblies.push(robot);
  }
  project.name = L('튜토리얼 로봇', 'Tutorial robot');
  if (lesson.drawing) {
    return assemblyDrawing(L, model, { notes: L('주기\n1. 관절 감속기: 하모닉 드라이브 (J4–J6)\n2. 툴 플랜지 ISO 9409-1-50-4-M6\n3. 케이블은 J1–J3 중공부로 배선', 'NOTES\n1. Joint reducers: harmonic drives (J4–J6)\n2. Tool flange ISO 9409-1-50-4-M6\n3. Route cables through the J1–J3 hollow passages'), sheet: 'A2', drop: ['v-right', 'v-top'] });
  }
  const shown = project.assemblies.at(-1);
  project.active = shown ? { kind: 'assembly', id: shown.id } : { kind: 'part', id: project.parts[lesson.show ?? project.parts.length - 1].id };
  return project;
}

export function build(id, lang = 'ko') {
  const lesson = LESSONS.find((x) => x.id === id);
  return lesson ? lessonProject(lesson, T(lang)) : null;
}

/** Motion stages: a part lesson shows its part turning on a turntable (the assemblies have their own motion). */
export const SCENES = Object.fromEntries(LESSONS.filter((x) => !x.grip).map((x) => [x.id, (p, L) => {
  const part = p.parts.find((q) => q.id === p.active?.id) ?? p.parts.at(-1);
  STAGE.turntable(p, L, part);
}]));
export const MOTION_NOTES = Object.fromEntries(LESSONS.filter((x) => !x.grip).map((x) => [x.id, ['턴테이블 모션', 'turntable motion']]));
