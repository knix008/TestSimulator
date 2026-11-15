// Templates (File › New from template) and sample models (start page, File ›
// Open sample). They are built in code with a small builder so they always
// match the current block catalog; `npm run samples` also writes them to
// samples/*.mpf for the installer and for opening from Explorer.
import { addLink, createModel, makeBlock, normalizeModel } from './model.js';

/** A tiny builder: add blocks by name, link them, add charts. */
function build(name, settings, fn) {
  const m = createModel(name);
  Object.assign(m.settings, settings);
  const by = new Map();
  const api = {
    add(type, blockName, x, y, props = {}, extra = {}) {
      const b = makeBlock(m, type, x, y, { name: blockName, props, ...extra });
      m.blocks.push(b); by.set(blockName, b);
      return b;
    },
    link(a, b, fromPort = 0, toPort = 0, points = []) {
      const l = addLink(m, { block: by.get(a).id, port: fromPort }, { block: by.get(b).id, port: toPort });
      l.points = points;
      return l;
    },
    influence(a, b) { return addLink(m, { block: by.get(a).id, port: -1 }, { block: by.get(b).id, port: -1 }, 'influence'); },
    chain(...names) { for (let i = 1; i < names.length; i++) api.link(names[i - 1], names[i]); },
    chart(title, series, kind = 'line') { m.charts.push({ id: `c${m.charts.length + 1}`, title, kind, series }); },
    get model() { return m; },
  };
  fn(api);
  return normalizeModel(JSON.parse(JSON.stringify(m)));
}

const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
const expo = (mean) => ({ type: 'exponential', mean });
const norm = (mean, sd) => ({ type: 'normal', mean, sd });
const uni = (min, max) => ({ type: 'uniform', min, max });
const cst = (value) => ({ type: 'constant', value });

// ───────────────────────── templates (File › New from template, start page "New model")

const MIN = { timeUnit: 'min', duration: 480 };
const PART = [{ name: 'Part', color: '#3b82f6', weight: 1 }];
/** [id, icon, ko [name, desc], en [name, desc], settings, build(a)] */
const TEMPLATE_DEFS = [
  ['blank', 'fileNew', ['빈 모델', '아무것도 없는 바닥에서 시작'], ['Empty model', 'Start on an empty floor'], MIN, () => {}],
  ['flow', 'fProcess', ['기본 공정', '소스 → 대기열 → 기계 → 싱크'], ['Basic process', 'Source → queue → machine → sink'], MIN, (a) => {
    a.add('source', 'Arrivals', -15, 0, { interarrival: expo(5) }); a.add('queue', 'Buffer', -8, 0); a.add('process', 'Machine', -1, 0, { time: tri(3, 4, 6) }); a.add('sink', 'Exit', 6, 0);
    a.chain('Arrivals', 'Buffer', 'Machine', 'Exit'); a.chart('Buffer', ['Buffer.length']);
  }],
  ['twoStations', 'fQueue', ['직렬 2공정', '버퍼를 사이에 둔 두 공정'], ['Two stations in series', 'Two machines with a buffer between'], MIN, (a) => {
    a.add('source', 'Arrivals', -18, 0, { interarrival: expo(4) }); a.add('queue', 'Q1', -12, 0); a.add('process', 'Station1', -6, 0, { time: tri(2, 3, 4) });
    a.add('queue', 'Q2', 0, 0, { capacity: 5 }); a.add('process', 'Station2', 6, 0, { time: tri(2.5, 3.5, 5) }); a.add('sink', 'Done', 12, 0);
    a.chain('Arrivals', 'Q1', 'Station1', 'Q2', 'Station2', 'Done');
  }],
  ['parallel', 'fSelect', ['병렬 설비', '가장 짧은 줄로 나눠 세 대가 처리 후 합류'], ['Parallel machines', 'Shortest queue to three machines, then merge'], MIN, (a) => {
    a.add('source', 'Arrivals', -16, 0, { interarrival: expo(1.5) }); a.add('select', 'Split', -10, 0, { outputs: 3, mode: 'shortest' });
    for (let i = 0; i < 3; i++) { a.add('queue', `Q${i + 1}`, -4, -5 + i * 5, { capacity: 6 }); a.add('process', `M${i + 1}`, 2, -5 + i * 5, { time: tri(3, 4, 6) }); }
    a.add('merge', 'Join', 8, 0, { inputs: 3 }); a.add('sink', 'Done', 13, 0);
    a.link('Arrivals', 'Split'); for (let i = 0; i < 3; i++) { a.link('Split', `Q${i + 1}`, i); a.link(`Q${i + 1}`, `M${i + 1}`); a.link(`M${i + 1}`, 'Join', 0, i); } a.link('Join', 'Done');
  }],
  ['assemblyCell', 'fCombine', ['조립 셀', '두 부품을 모아 조립'], ['Assembly cell', 'Two parts assembled into one'], MIN, (a) => {
    a.add('source', 'Parts A', -14, -4, { interarrival: expo(3), types: [{ name: 'A', color: '#2563eb', weight: 1 }] }); a.add('source', 'Parts B', -14, 4, { interarrival: expo(1.5), types: [{ name: 'B', color: '#f59e0b', weight: 1 }] });
    a.add('combine', 'Assemble', -5, 0, { inputs: 2, quantities: '1, 2', time: tri(2, 2.5, 3) }); a.add('sink', 'Done', 3, 0);
    a.link('Parts A', 'Assemble', 0, 0); a.link('Parts B', 'Assemble', 0, 1); a.link('Assemble', 'Done');
  }],
  ['batchOven', 'fOven', ['묶음 굽기', '묶어서 오븐에 넣고 다시 풂'], ['Batch oven', 'Batch, bake, unbatch'], MIN, (a) => {
    a.add('source', 'Trays', -16, 0, { interarrival: expo(0.8), shape: 'carton' }); a.add('batch', 'Load', -10, 0, { size: 10, outType: 'Load', shape: 'pallet' });
    a.add('oven', 'Oven', -3, 0, { capacity: 2, time: cst(12) }); a.add('unbatch', 'Unload', 4, 0); a.add('sink', 'Done', 9, 0);
    a.chain('Trays', 'Load', 'Oven', 'Unload', 'Done');
  }],
  ['rework', 'fInspect', ['재작업 루프', '검사 불량은 수리 후 다시 검사'], ['Rework loop', 'Rejects are repaired and inspected again'], MIN, (a) => {
    a.add('source', 'Arrivals', -16, 0, { interarrival: expo(3) }); a.add('merge', 'Merge', -10, 0, { inputs: 2 });
    a.add('inspectionStation', 'Inspect', -4, 0, { defectRate: 0.15 }); a.add('sink', 'Good', 3, 0); a.add('process', 'Repair', -4, 6, { look: 'workstation', time: tri(3, 5, 8) });
    a.link('Arrivals', 'Merge', 0, 0); a.link('Merge', 'Inspect'); a.link('Inspect', 'Good', 0); a.link('Inspect', 'Repair', 1); a.link('Repair', 'Merge', 0, 1, [[-10, 6]]);
  }],
  ['operators', 'fPool', ['작업자 확보', '작업자를 잡고 작업한 뒤 반납'], ['Operators', 'Seize an operator, work, release'], MIN, (a) => {
    a.add('resourcePool', 'Operators', -2, 7, { capacity: 2 }); a.add('source', 'Jobs', -16, 0, { interarrival: expo(3) }); a.add('queue', 'Queue', -10, 0);
    a.add('seize', 'Get', -5, 0, { pool: 'Operators' }); a.add('delay', 'Work', 0, 0, { time: tri(3, 5, 7) }); a.add('release', 'Free', 5, 0, { pool: 'Operators' }); a.add('sink', 'Done', 10, 0);
    a.chain('Jobs', 'Queue', 'Get', 'Work', 'Free', 'Done');
  }],
  ['shiftsTemplate', 'calendar', ['교대 근무', '시간대별 인원이 바뀌는 자원'], ['Shifts', 'Staff that changes by time of day'], { timeUnit: 'min', duration: 1440 }, (a) => {
    a.add('resourcePool', 'Crew', -2, 7, { capacity: 3, shifts: true, period: 1440, schedule: [{ start: 0, end: 480, value: 3 }, { start: 480, end: 960, value: 2 }, { start: 960, end: 1440, value: 1 }] });
    a.add('source', 'Jobs', -14, 0, { interarrival: expo(4) }); a.add('queue', 'Backlog', -8, 0); a.add('process', 'Cell', -1, 0, { capacity: 3, time: tri(5, 7, 10), pool: 'Crew' }); a.add('sink', 'Done', 6, 0);
    a.chain('Jobs', 'Backlog', 'Cell', 'Done'); a.chart('Backlog', ['Backlog.length']);
  }],
  ['kanban', 'fAreaStart', ['칸반 (CONWIP)', '구역 안 재공을 8개로 제한'], ['Kanban (CONWIP)', 'At most 8 jobs inside the area'], MIN, (a) => {
    a.add('source', 'Orders', -18, 0, { interarrival: expo(2) }); a.add('queue', 'Backlog', -13, 0); a.add('restrictedStart', 'Kanban in', -8, 0, { capacity: 8 });
    a.add('process', 'Step1', -3, 0, { time: tri(1, 1.5, 2) }); a.add('queue', 'Buffer', 2, 0); a.add('process', 'Step2', 7, 0, { time: tri(1.2, 1.8, 2.5) });
    a.add('restrictedEnd', 'Kanban out', 11, 0, { start: 'Kanban in' }); a.add('sink', 'Done', 15, 0);
    a.chain('Orders', 'Backlog', 'Kanban in', 'Step1', 'Buffer', 'Step2', 'Kanban out', 'Done'); a.chart('WIP', ['Kanban in.inside', 'Backlog.length']);
  }],
  ['timeMeasure', 'fTimerStart', ['구간 시간 측정', '두 지점 사이 걸린 시간'], ['Time measurement', 'Time between two points'], MIN, (a) => {
    a.add('source', 'Arrivals', -16, 0, { interarrival: expo(3) }); a.add('timeStart', 'Start', -11, 0); a.add('queue', 'Queue', -6, 0);
    a.add('process', 'Machine', 0, 0, { time: tri(2, 2.5, 3.5) }); a.add('timeEnd', 'End', 5, 0, { start: 'Start' }); a.add('sink', 'Done', 9, 0);
    a.chain('Arrivals', 'Start', 'Queue', 'Machine', 'End', 'Done'); a.chart('Time in section', ['End.time']);
  }],
  ['maintenanceTemplate', 'fMaintenance', ['정기 보전', '4시간마다 20분 보전'], ['Planned maintenance', '20 minutes every 4 hours'], { timeUnit: 'min', duration: 960 }, (a) => {
    a.add('source', 'Arrivals', -14, 0, { interarrival: expo(3) }); a.add('queue', 'Queue', -8, 0); a.add('cncMachine', 'CNC', -1, 0, { failures: false, time: tri(1.5, 2, 2.6) }); a.add('sink', 'Done', 6, 0);
    a.add('maintenance', 'PM', -1, 6, { target: 'CNC', interval: cst(240), duration: tri(15, 20, 30), firstAt: 120 });
    a.chain('Arrivals', 'Queue', 'CNC', 'Done'); a.chart('Queue', ['Queue.length']);
  }],
  ['splitMatch', 'fMatch', ['복제와 짝 맞추기', '주문서 사본과 물건이 다시 만남'], ['Split and match', 'An order copy meets its goods again'], MIN, (a) => {
    a.add('source', 'Orders', -18, 0, { interarrival: expo(3) }); a.add('split', 'Copy', -12, 0, { copies: 1, copyType: '' });
    a.add('process', 'Picking', -5, -4, { look: 'workstation', time: tri(2, 3, 5), capacity: 2 }); a.add('delay', 'Paperwork', -5, 4, { time: tri(1, 2, 3) });
    a.add('match', 'Match', 2, 0); a.add('sink', 'Shipped', 8, -2); a.add('sink', 'Filed', 8, 2);
    a.link('Orders', 'Copy'); a.link('Copy', 'Picking', 0); a.link('Copy', 'Paperwork', 1); a.link('Picking', 'Match', 0, 0); a.link('Paperwork', 'Match', 0, 1); a.link('Match', 'Shipped', 0); a.link('Match', 'Filed', 1);
  }],
  ['machiningCell', 'fCnc', ['가공 셀', '선반·밀링·검사 설비'], ['Machining cell', 'Lathe, mill and inspection'], MIN, (a) => {
    a.add('source', 'Blanks', -18, 0, { interarrival: expo(4), shape: 'part' }); a.add('queue', 'Q', -13, 0); a.add('lathe', 'Lathe', -7, 0);
    a.add('millingMachine', 'Mill', -1, 0); a.add('inspectionStation', 'QC', 5, 0); a.add('sink', 'Done', 10, 0); a.add('sink', 'Scrap', 5, 6);
    a.chain('Blanks', 'Q', 'Lathe', 'Mill', 'QC', 'Done'); a.link('QC', 'Scrap', 1);
  }],
  ['robotCell', 'fRobot', ['로봇 셀', '컨베이어 사이 로봇이 옮겨 실음'], ['Robot cell', 'A robot transfers between conveyors'], { timeUnit: 'min', duration: 240 }, (a) => {
    a.add('source', 'Parts', -18, 0, { interarrival: expo(0.6), shape: 'part' }); a.add('conveyor', 'In belt', -16, 0, {}, { points: [[0, 0], [10, 0]] });
    a.add('robot', 'Robot', -3, 0, { time: uni(0.3, 0.5) }); a.add('conveyor', 'Out belt', -1, 0, {}, { points: [[0, 0], [10, 0]] }); a.add('palletizer', 'Palletize', 12, 0, { size: 12 }); a.add('sink', 'Done', 17, 0);
    a.chain('Parts', 'In belt', 'Robot', 'Out belt', 'Palletize', 'Done');
  }],
  ['conveyor', 'fConveyor', ['컨베이어 라인', '컨베이어로 이은 라벨링 공정'], ['Conveyor line', 'A labelling station joined by conveyors'], { timeUnit: 'min', duration: 240 }, (a) => {
    a.add('source', 'Infeed', -20, 0, { interarrival: expo(0.5), shape: 'carton', types: [{ name: 'Carton', color: '#b45309', weight: 1 }] });
    a.add('conveyor', 'Belt1', -17, 0, { speed: 20 }, { points: [[0, 0], [12, 0]] }); a.add('labeler', 'Labeler', -2, 0);
    a.add('conveyor', 'Belt2', 1, 0, { speed: 20 }, { points: [[0, 0], [10, 0], [10, 6]] }); a.add('sink', 'Outfeed', 11, 9.5);
    a.chain('Infeed', 'Belt1', 'Labeler', 'Belt2', 'Outfeed');
  }],
  ['sortation', 'fSorter', ['분류 라인', '유형별로 세 라인에 분류'], ['Sortation line', 'Sorted by type onto three lines'], { timeUnit: 'min', duration: 240 }, (a) => {
    a.add('source', 'Induct', -20, 0, { interarrival: expo(0.4), shape: 'carton', types: [{ name: 'A', color: '#2563eb', weight: 1 }, { name: 'B', color: '#16a34a', weight: 1 }, { name: 'C', color: '#f59e0b', weight: 1 }] });
    a.add('rollerConveyor', 'Main', -18, 0, {}, { points: [[0, 0], [8, 0]] }); a.add('sorter', 'Sorter', -7, 0, { outputs: 3, typeMap: 'A:1, B:2, C:3' });
    for (let i = 0; i < 3; i++) { a.add('rollerConveyor', `Lane${i + 1}`, -5.5, (i - 1) * 0.6, {}, { points: [[0, 0], [3, (i - 1) * 6], [12, (i - 1) * 6]] }); a.add('sink', `Out${i + 1}`, 9, (i - 1) * 6.6); }
    a.chain('Induct', 'Main', 'Sorter'); for (let i = 0; i < 3; i++) { a.link('Sorter', `Lane${i + 1}`, i); a.link(`Lane${i + 1}`, `Out${i + 1}`); }
  }],
  ['agvLoop', 'fAgv', ['AGV 운반', 'AGV가 두 공정 사이를 운반'], ['AGV transport', 'AGVs carry between two cells'], MIN, (a) => {
    a.add('source', 'Store', -18, -6, { interarrival: expo(2.5) }); a.add('agvFleet', 'AGVs', -12, -6, { fleet: 3 }); a.add('queue', 'In', 0, 6, { capacity: 6 });
    a.add('process', 'Cell', 6, 6, { look: 'robot', time: tri(1.5, 2, 2.5) }); a.add('sink', 'Out', 12, 6);
    a.chain('Store', 'AGVs', 'In', 'Cell', 'Out');
  }],
  ['warehouse', 'tplWarehouse', ['창고', '도크 → 지게차 → 랙 → 피킹'], ['Warehouse', 'Dock → forklifts → rack → picking'], { timeUnit: 'min', duration: 960 }, (a) => {
    a.add('zone', 'Storage', 0, 0, { fill: '#e2e8f0' }, { w: 30, h: 18 });
    a.add('source', 'Trucks', -18, -5, { interarrival: expo(6), shape: 'pallet', types: [{ name: 'Pallet', color: '#a16207', weight: 1 }] });
    a.add('receivingDock', 'Receiving', -12, -5, { doors: 2, time: tri(2, 3, 5) }); a.add('forkliftFleet', 'Forklifts', -6, -5);
    a.add('rack', 'Rack', 4, -5, { bays: 8, levels: 4, dwell: expo(120) }); a.add('pickStation', 'Picking', 4, 4); a.add('sink', 'Shipping', 12, 4);
    a.chain('Trucks', 'Receiving', 'Forklifts', 'Rack', 'Picking', 'Shipping');
  }],
  ['asrsTemplate', 'fAsrs', ['자동 창고', 'AS/RS에 넣고 꺼냄'], ['AS/RS', 'Store in and retrieve from an AS/RS'], { timeUnit: 'min', duration: 960 }, (a) => {
    a.add('source', 'Inbound', -16, 0, { interarrival: expo(1.5), shape: 'carton' }); a.add('rollerConveyor', 'Infeed', -14, 0, {}, { points: [[0, 0], [6, 0]] });
    a.add('asrs', 'AS/RS', 0, 0, { bays: 20, levels: 8, dwell: expo(300) }); a.add('rollerConveyor', 'Outfeed', 8, 0, {}, { points: [[0, 0], [6, 0]] }); a.add('sink', 'Picked', 16, 0);
    a.chain('Inbound', 'Infeed', 'AS/RS', 'Outfeed', 'Picked'); a.chart('Stock', ['AS/RS.contents']);
  }],
  ['craneBay', 'fCrane', ['크레인 베이', '천장 크레인이 무거운 부품을 옮김'], ['Crane bay', 'An overhead crane moves heavy parts'], MIN, (a) => {
    a.add('source', 'Castings', -14, -4, { interarrival: expo(8), shape: 'part' }); a.add('overheadCrane', 'Crane', -9, -4);
    a.add('process', 'Machining', 4, 4, { look: 'cnc', time: tri(5, 6, 8) }); a.add('sink', 'Done', 10, 4);
    a.chain('Castings', 'Crane', 'Machining', 'Done');
  }],
  ['crossDock', 'fShipping', ['입고에서 출고로', '입고 도크 → 스테이징 → 출고 도크'], ['Dock to dock', 'Receiving → staging → shipping'], MIN, (a) => {
    a.add('source', 'Trucks in', -16, 0, { interarrival: expo(2), shape: 'pallet' }); a.add('receivingDock', 'Receiving', -10, 0, { doors: 2, time: tri(1, 2, 3) });
    a.add('stagingLane', 'Staging', -2, 0); a.add('shippingDock', 'Shipping', 6, 0, { doors: 2, time: tri(1, 2, 3) }); a.add('sink', 'Trucks out', 12, 0);
    a.chain('Trucks in', 'Receiving', 'Staging', 'Shipping', 'Trucks out');
  }],
  ['traffic', 'tplTraffic', ['교통 신호', '도로와 신호등, 차량 흐름'], ['Traffic light', 'A road, a light and car traffic'], { timeUnit: 'min', duration: 60, floorWidth: 120, floorDepth: 60 }, (a) => {
    a.add('carSource', 'Cars', -50, 0, { interarrival: expo(0.12) }); a.add('road', 'Avenue', -48, 0, { lanes: 2 }, { points: [[0, 0], [45, 0]] });
    a.add('signal', 'Light', 0, -6, { green: 0.6, red: 0.5 }); a.add('road', 'Exit road', 2, 0, { lanes: 2 }, { points: [[0, 0], [40, 0]] }); a.add('carSink', 'Away', 46, 0);
    a.chain('Cars', 'Avenue', 'Light', 'Exit road', 'Away');
  }],
  ['tollRoad', 'fToll', ['고속도로 요금소', '3차로 고속도로와 톨게이트'], ['Toll road', 'A three-lane highway and a toll plaza'], { timeUnit: 'min', duration: 60, floorWidth: 160, floorDepth: 40 }, (a) => {
    a.add('carSource', 'Traffic', -70, 0, { interarrival: expo(0.08) }); a.add('highway', 'Highway', -68, 0, {}, { points: [[0, 0], [55, 0]] });
    a.add('tollBooth', 'Toll', -9, 0, { capacity: 4 }); a.add('highway', 'Beyond', -5, 0, {}, { points: [[0, 0], [60, 0]] }); a.add('carSink', 'Away', 58, 0);
    a.chain('Traffic', 'Highway', 'Toll', 'Beyond', 'Away'); a.chart('Queue at toll', ['Highway.contents']);
  }],
  ['busLine', 'fBusStop', ['버스 노선', '도로와 정류장 두 곳'], ['Bus line', 'A road with two stops'], { timeUnit: 'min', duration: 120, floorWidth: 140 }, (a) => {
    a.add('source', 'Depot', -60, 0, { interarrival: cst(6), shape: 'bus', types: [{ name: 'Bus', color: '#0ea5e9', weight: 1 }] });
    a.add('road', 'Street1', -58, 0, { lanes: 1, vehicleLength: 14 }, { points: [[0, 0], [35, 0]] }); a.add('busStop', 'Stop1', -20, -4);
    a.add('road', 'Street2', -18, 0, { lanes: 1, vehicleLength: 14 }, { points: [[0, 0], [35, 0]] }); a.add('busStop', 'Stop2', 20, -4);
    a.add('road', 'Street3', 22, 0, { lanes: 1, vehicleLength: 14 }, { points: [[0, 0], [30, 0]] }); a.add('sink', 'Terminal', 55, 0);
    a.chain('Depot', 'Street1', 'Stop1', 'Street2', 'Stop2', 'Street3', 'Terminal');
  }],
  ['railLine', 'fTrack', ['철도 노선', '선로·역·신호'], ['Rail line', 'Track, station and signal'], { timeUnit: 'min', duration: 240, floorWidth: 260, floorDepth: 40 }, (a) => {
    a.add('trainSource', 'Trains', -120, 0, { interarrival: cst(15) }); a.add('railTrack', 'Track1', -118, 0, {}, { points: [[0, 0], [90, 0]] });
    a.add('railStation', 'Station', -16, -6); a.add('railSignal', 'Signal', -8, 4);
    a.add('railTrack', 'Track2', -6, 0, {}, { points: [[0, 0], [110, 0]] }); a.add('trainSink', 'End', 108, 0);
    a.chain('Trains', 'Track1', 'Station', 'Signal', 'Track2', 'End');
  }],
  ['metroGates', 'fTurnstile', ['지하철 개찰구', '보행자 → 개찰구 → 에스컬레이터'], ['Metro gates', 'Pedestrians → turnstiles → escalator'], { timeUnit: 'min', duration: 60 }, (a) => {
    a.add('pedSource', 'Passengers', -18, 0, { interarrival: expo(0.08) }); a.add('walkway', 'Hall', -16, 0, {}, { points: [[0, 0], [8, 0]] });
    a.add('select', 'Choose', -6, 0, { outputs: 3, mode: 'shortest' });
    for (let i = 0; i < 3; i++) a.add('turnstile', `Gate${i + 1}`, 0, (i - 1) * 3);
    a.add('merge', 'Concourse', 5, 0, { inputs: 3 }); a.add('escalator', 'Escalator', 7, 0, {}, { points: [[0, 0], [10, 0]] }); a.add('pedSink', 'Platform', 20, 0);
    a.chain('Passengers', 'Hall', 'Choose'); for (let i = 0; i < 3; i++) { a.link('Choose', `Gate${i + 1}`, i); a.link(`Gate${i + 1}`, 'Concourse', 0, i); } a.chain('Concourse', 'Escalator', 'Platform');
  }],
  ['serviceDesk', 'fCounter', ['민원 창구', '대기 구역과 창구 3개'], ['Service desks', 'A waiting area and three desks'], MIN, (a) => {
    a.add('pedSource', 'Visitors', -16, 0, { interarrival: expo(0.8) }); a.add('waitingArea', 'Waiting', -8, 0, { timeout: 20 });
    a.add('pedService', 'Desks', 0, 0); a.add('pedSink', 'Leave', 7, 0); a.add('pedSink', 'Gave up', -8, 6);
    a.chain('Visitors', 'Waiting', 'Desks', 'Leave'); a.link('Waiting', 'Gave up', 1);
  }],
  ['elevatorLobby', 'fElevator', ['엘리베이터 로비', '여러 명이 함께 타는 엘리베이터 두 대'], ['Elevator lobby', 'Two elevators carrying groups'], { timeUnit: 'min', duration: 120 }, (a) => {
    a.add('pedSource', 'Arrivals', -14, 0, { interarrival: expo(0.15) }); a.add('waitingArea', 'Lobby', -7, 0); a.add('select', 'Choose', -2, 0, { outputs: 2, mode: 'first' });
    a.add('elevator', 'Lift A', 3, -3); a.add('elevator', 'Lift B', 3, 3); a.add('pedSink', 'Floors', 9, 0);
    a.chain('Arrivals', 'Lobby', 'Choose'); a.link('Choose', 'Lift A', 0); a.link('Choose', 'Lift B', 1); a.link('Lift A', 'Floors'); a.link('Lift B', 'Floors');
  }],
  ['tankFill', 'fTank', ['탱크 채우고 비우기', '공급 → 탱크 → 펌프'], ['Tank fill and drain', 'Supply → tank → pump'], { timeUnit: 'min', duration: 120, sdDt: 0.25 }, (a) => {
    a.add('fluidSource', 'Supply', -8, 0, { equation: '12' }); a.add('tank', 'Tank', 0, 0, { initial: '100', capacity: 600 }); a.add('pump', 'Pump', 8, 0, { equation: 'if(Tank > 300, 20, 5)' });
    a.link('Supply', 'Tank'); a.link('Tank', 'Pump'); a.influence('Tank', 'Pump'); a.chart('Level', ['Tank']);
  }],
  ['valveCycle', 'fValve', ['밸브 주기', '10분 열림 · 10분 닫힘'], ['Valve cycle', 'Open 10 min, closed 10 min'], { timeUnit: 'min', duration: 120, sdDt: 0.25 }, (a) => {
    a.add('tank', 'Upper', -6, 0, { initial: '800', capacity: 1000 }); a.add('valve', 'Valve', 0, 0, { equation: '30', openTime: 10, closedTime: 10 }); a.add('tank', 'Lower', 6, 0, { initial: '0', capacity: 1000 });
    a.link('Upper', 'Valve'); a.link('Valve', 'Lower'); a.chart('Tanks', ['Upper', 'Lower']);
  }],
  ['sd', 'fStock', ['시스템 다이내믹스', '인구: 저량·흐름·매개변수'], ['System dynamics', 'Population: stocks, flows, parameters'], { timeUnit: 'day', duration: 100, sdDt: 0.25 }, (a) => {
    a.add('stock', 'Population', 0, 0, { initial: '1000' }); a.add('flow', 'Births', -8, 0, { equation: 'Population * BirthRate' }); a.add('flow', 'Deaths', 8, 0, { equation: 'Population * DeathRate' });
    a.add('parameter', 'BirthRate', -8, -5, { value: 0.03, min: 0, max: 0.1 }); a.add('parameter', 'DeathRate', 8, -5, { value: 0.02, min: 0, max: 0.1 });
    a.link('Births', 'Population'); a.link('Population', 'Deaths'); a.influence('BirthRate', 'Births'); a.influence('DeathRate', 'Deaths'); a.chart('Population', ['Population']);
  }],
  ['forecast', 'fSmooth', ['수요 예측', '조회 테이블과 지수 평활'], ['Demand forecast', 'Lookup table and smoothing'], { timeUnit: 'day', duration: 120, sdDt: 0.5 }, (a) => {
    a.add('lookup', 'Season', -8, 0, { input: 'time', xs: '0, 30, 60, 90, 120', ys: '100, 160, 120, 80, 110' }); a.add('variable', 'Demand', 0, 0, { equation: 'Season + normal(0, 10)' });
    a.add('smooth', 'Forecast', 8, 0, { input: 'Demand', delay: 7 }); a.influence('Season', 'Demand'); a.influence('Demand', 'Forecast'); a.chart('Demand vs forecast', ['Demand', 'Forecast']);
  }],
  ['sirSd', 'tplEpidemic', ['SIR (SD)', '감염병 저량 모델'], ['SIR (SD)', 'Epidemic stock-and-flow model'], { timeUnit: 'day', duration: 120, sdDt: 0.1, sdMethod: 'rk4' }, (a) => {
    a.add('stock', 'S', -10, 0, { initial: '990' }); a.add('stock', 'I', 0, 0, { initial: '10' }); a.add('stock', 'R', 10, 0, { initial: '0' });
    a.add('flow', 'Infection', -5, 0, { equation: 'Beta * S * I / (S + I + R)' }); a.add('flow', 'Recovery', 5, 0, { equation: 'I / Duration' });
    a.add('parameter', 'Beta', -5, -6, { value: 0.3, min: 0, max: 1 }); a.add('parameter', 'Duration', 5, -6, { value: 10, min: 1, max: 30 });
    a.link('S', 'Infection'); a.link('Infection', 'I'); a.link('I', 'Recovery'); a.link('Recovery', 'R'); a.influence('Beta', 'Infection'); a.influence('Duration', 'Recovery');
    a.chart('SIR', ['S', 'I', 'R']);
  }],
  ['agents', 'fAgents', ['에이전트', 'SIR 감염병 에이전트 집단'], ['Agents', 'An SIR epidemic population'], { timeUnit: 'day', duration: 90, agentDt: 0.2 }, (a) => {
    a.add('population', 'People', 0, 0, { count: 300 }, { w: 30, h: 20 }); a.chart('Epidemic', ['People.Susceptible', 'People.Infected', 'People.Recovered']);
  }],
  ['market', 'fMarket', ['시장 확산', '광고와 입소문으로 채택'], ['Market adoption', 'Adoption by advertising and word of mouth'], { timeUnit: 'day', duration: 200, agentDt: 0.5 }, (a) => {
    a.add('marketPopulation', 'Consumers', 0, 0, {}, { w: 30, h: 20 }); a.chart('Adoption', ['Consumers.Potential', 'Consumers.Adopter']);
  }],
  ['crowdTemplate', 'fCrowd', ['군중', '걷다가 쉬는 사람들'], ['Crowd', 'People walking and resting'], { timeUnit: 'min', duration: 60, agentDt: 0.1 }, (a) => {
    a.add('crowd', 'Visitors', 0, 0, {}, { w: 30, h: 20 }); a.chart('Crowd', ['Visitors.Walking', 'Visitors.Resting']);
  }],
  ['forestFire', 'fCells', ['산불', '셀 격자에서 불이 번짐'], ['Forest fire', 'Fire spreading on a cell grid'], { timeUnit: 'day', duration: 100, agentDt: 1 }, (a) => {
    a.add('cellGrid', 'Forest', 0, 0, { cols: 60, rows: 40 }, { w: 30, h: 20 }); a.chart('Forest', ['Forest.Tree', 'Forest.Fire', 'Forest.Ash']);
  }],
  ['life', 'fLife', ['생명 게임', '콘웨이의 생명 게임'], ['Game of Life', "Conway's Game of Life"], { timeUnit: 's', duration: 200, agentDt: 1 }, (a) => {
    a.add('gameOfLife', 'Life', 0, 0, {}, { w: 30, h: 20 }); a.chart('Alive', ['Life.Alive']);
  }],
  ['dashboard', 'fGauge', ['대시보드', '게이지·막대·원 차트가 있는 공정'], ['Dashboard', 'A process with gauges and charts'], MIN, (a) => {
    a.add('source', 'Arrivals', -14, 0, { interarrival: expo(2) }); a.add('queue', 'Queue', -8, 0); a.add('process', 'Machine', -2, 0, { time: tri(1.2, 1.7, 2.4) }); a.add('sink', 'Done', 4, 0);
    a.chain('Arrivals', 'Queue', 'Machine', 'Done');
    a.add('gauge', 'Utilization', -10, -8, { expression: 'Machine.utilization * 100', max: 100, unitLabel: '%' }); a.add('counter', 'Finished', -4, -8, { expression: 'Done.count' });
    a.add('progressBar', 'Day', 3, -8, { expression: 'time', max: 480 }); a.add('barChart', 'Counts', -6, 10, { series: 'Arrivals.count, Done.count' }, { w: 10, h: 6 });
    a.add('pieChart', 'Where', 7, 10, { series: 'Queue.length, Machine.contents' }, { w: 7, h: 6 });
  }],
];

export const TEMPLATES = TEMPLATE_DEFS.map(([id, icon]) => [id, icon]);

/** Template names for the dictionaries: { 'template.flow': '…', 'template.flow.desc': '…' }. */
export function templateTexts(lang) {
  const out = {};
  for (const [id, , ko, en] of TEMPLATE_DEFS) { const [n, d] = lang === 'en' ? en : ko; out[`template.${id}`] = n; out[`template.${id}.desc`] = d; }
  return out;
}

export function buildTemplate(id, name = '') {
  const def = TEMPLATE_DEFS.find((x) => x[0] === id) ?? TEMPLATE_DEFS[0];
  return build(name, { ...def[4] }, def[5]);
}

// ───────────────────────── samples

export const SAMPLE_GROUPS = [
  { id: 'manufacturing', icon: 'tplFactory', ko: '제조', en: 'Manufacturing' },
  { id: 'logistics', icon: 'tplWarehouse', ko: '물류·창고', en: 'Logistics' },
  { id: 'services', icon: 'tplService', ko: '서비스', en: 'Services' },
  { id: 'transport', icon: 'tplTraffic', ko: '교통·철도·보행자', en: 'Traffic, rail, pedestrians' },
  { id: 'dynamics', icon: 'fStock', ko: '시스템 다이내믹스·유체', en: 'System dynamics & fluids' },
  { id: 'agents', icon: 'fAgents', ko: '에이전트·하이브리드', en: 'Agents & hybrid' },
];

const S = (id, group, icon, ko, en, make) => ({ id, group, icon, ko, en, make });

export const SAMPLE_PROJECTS = [
  // ── manufacturing
  S('line', 'manufacturing', 'tplFactory', ['가공 라인', 'CNC·검사·포장, 불량은 폐기'], ['Machining line', 'CNC, inspection and packing; rejects scrapped'], () => build('Machining line', { timeUnit: 'min', duration: 960, warmup: 60 }, (a) => {
    a.add('zone', 'Shop floor', 2, 0, { fill: '#dbeafe' }, { w: 46, h: 16 });
    a.add('source', 'Raw parts', -18, 0, { interarrival: expo(2.2), types: [{ name: 'Shaft', color: '#64748b', weight: 1 }], shape: 'part' });
    a.add('queue', 'Buffer A', -12, 0, { capacity: 15 });
    a.add('process', 'CNC', -5, 0, { look: 'cnc', capacity: 1, time: tri(1.5, 1.9, 2.6), failures: true, mtbf: expo(240), mttr: tri(5, 10, 20) });
    a.add('queue', 'Buffer B', 2, 0, { capacity: 10 });
    a.add('process', 'Inspection', 9, 0, { look: 'inspection', time: tri(1, 1.4, 2), defectRate: 0.06 });
    a.add('process', 'Packing', 16, 0, { look: 'packing', time: tri(1.2, 1.6, 2.1) });
    a.add('sink', 'Finished', 22, 0);
    a.add('sink', 'Scrap', 9, 6);
    a.chain('Raw parts', 'Buffer A', 'CNC', 'Buffer B', 'Inspection', 'Packing', 'Finished');
    a.link('Inspection', 'Scrap', 1);
    a.add('display', 'Output', 2, -6, { expression: 'Finished.count', digits: 0, unitLabel: 'pcs' });
    a.chart('Buffers', ['Buffer A.length', 'Buffer B.length']);
    a.chart('Utilization', ['CNC.utilization', 'Inspection.utilization', 'Packing.utilization']);
  })),
  S('assembly', 'manufacturing', 'fCombine', ['조립 라인', '차체 1 + 바퀴 4 → 조립 → 도장 → 컨베이어'], ['Assembly line', '1 body + 4 wheels → assembly → paint → conveyor'], () => build('Assembly line', { timeUnit: 'min', duration: 720 }, (a) => {
    a.add('source', 'Bodies', -20, -4, { interarrival: expo(4), types: [{ name: 'Body', color: '#2563eb', weight: 1 }], shape: 'carton' });
    a.add('source', 'Wheels', -20, 4, { interarrival: expo(1.02), types: [{ name: 'Wheel', color: '#1f2937', weight: 1 }], shape: 'part' });
    a.add('queue', 'Body buffer', -13, -4, { capacity: 10 });
    a.add('queue', 'Wheel buffer', -13, 4, { capacity: 40 });
    a.add('combine', 'Assembly', -5, 0, { inputs: 2, quantities: '1, 4', time: tri(2.5, 3, 4), outType: 'Car', outColor: '#dc2626' });
    a.add('process', 'Paint booth', 2, 0, { look: 'paint', time: tri(2.5, 3, 3.5) });
    a.add('conveyor', 'Line conveyor', 4, 0, { speed: 6 }, { points: [[0, 0], [10, 0], [10, 6]] });
    a.add('process', 'Final check', 14, 9, { look: 'inspection', time: tri(1, 2, 3) });
    a.add('sink', 'Yard', 20, 9);
    a.link('Bodies', 'Body buffer'); a.link('Wheels', 'Wheel buffer');
    a.link('Body buffer', 'Assembly', 0, 0); a.link('Wheel buffer', 'Assembly', 0, 1);
    a.chain('Assembly', 'Paint booth', 'Line conveyor', 'Final check', 'Yard');
    a.chart('Buffers', ['Body buffer.length', 'Wheel buffer.length']);
  })),
  S('jobshop', 'manufacturing', 'fPool', ['작업자 공유 잡숍', '작업자 3명이 3개 기계를 맡음, 유형별 경로'], ['Job shop with operators', '3 operators run 3 machines; routes by type'], () => build('Job shop', { timeUnit: 'min', duration: 960 }, (a) => {
    a.add('resourcePool', 'Operators', 0, 9, { capacity: 3, kind: 'worker', cost: 0.5 });
    a.add('source', 'Orders', -18, 0, { interarrival: expo(3), types: [{ name: 'A', color: '#2563eb', weight: 5 }, { name: 'B', color: '#16a34a', weight: 3 }, { name: 'C', color: '#f59e0b', weight: 2 }] });
    a.add('queue', 'Order queue', -12, 0, { discipline: 'fifo' });
    a.add('select', 'Router', -6, 0, { outputs: 3, mode: 'type', typeMap: 'A:1, B:2, C:3' });
    a.add('queue', 'Q lathe', 0, -6); a.add('queue', 'Q mill', 0, 0); a.add('queue', 'Q drill', 0, 6);
    a.add('process', 'Lathe', 7, -6, { look: 'machine', time: tri(4, 5, 8), pool: 'Operators' });
    a.add('process', 'Mill', 7, 0, { look: 'cnc', time: tri(5, 6, 9), pool: 'Operators' });
    a.add('process', 'Drill', 7, 6, { look: 'press', time: tri(3, 4, 6), pool: 'Operators' });
    a.add('sink', 'Done', 15, 0);
    a.chain('Orders', 'Order queue', 'Router');
    a.link('Router', 'Q lathe', 0); a.link('Router', 'Q mill', 1); a.link('Router', 'Q drill', 2);
    a.link('Q lathe', 'Lathe'); a.link('Q mill', 'Mill'); a.link('Q drill', 'Drill');
    a.link('Lathe', 'Done'); a.link('Mill', 'Done'); a.link('Drill', 'Done');
    a.chart('Queues', ['Q lathe.length', 'Q mill.length', 'Q drill.length']);
    a.chart('Operators', ['Operators.utilization']);
  })),
  S('bottling', 'manufacturing', 'fConveyor', ['병입 라인', '컨베이어 연결 충전·캡핑·12개 묶음·팔레타이저'], ['Bottling line', 'Conveyors link filler, capper, 12-packs and a palletizing robot'], () => build('Bottling line', { timeUnit: 'min', duration: 240 }, (a) => {
    a.add('source', 'Empty bottles', -26, 0, { interarrival: cst(0.1), shape: 'bottle', types: [{ name: 'Bottle', color: '#22d3ee', weight: 1 }] });
    a.add('conveyor', 'C1', -24, 0, { speed: 15, spacing: 0.4, width: 0.5 }, { points: [[0, 0], [10, 0]] });
    a.add('process', 'Filler', -11, 0, { look: 'machine', capacity: 4, time: cst(0.35), failures: true, mtbf: expo(60), mttr: tri(1, 2, 4) });
    a.add('conveyor', 'C2', -8.5, 0, { speed: 15, spacing: 0.4, width: 0.5 }, { points: [[0, 0], [8, 0]] });
    a.add('process', 'Capper', 2, 0, { look: 'press', capacity: 1, time: cst(0.08) });
    a.add('conveyor', 'C3', 4.5, 0, { speed: 15, spacing: 0.4, width: 0.5 }, { points: [[0, 0], [6, 0], [6, 6]] });
    a.add('batch', 'Case packer', 10.5, 9, { size: 12, outType: 'Case', shape: 'carton', outColor: '#b45309' });
    a.add('robot', 'Palletizer', 16, 9, { time: uni(0.4, 0.7) });
    a.add('sink', 'Warehouse', 21, 9);
    a.chain('Empty bottles', 'C1', 'Filler', 'C2', 'Capper', 'C3', 'Case packer', 'Palletizer', 'Warehouse');
    a.chart('Conveyors', ['C1.contents', 'C2.contents', 'C3.contents']);
  })),
  S('shifts', 'manufacturing', 'calendar', ['교대 근무', '주간 4명·야간 2명, 처리량 변화'], ['Shift work', '4 workers by day, 2 by night'], () => build('Shift work', { timeUnit: 'min', duration: 2880 }, (a) => {
    a.add('resourcePool', 'Crew', -2, 7, { capacity: 4, shifts: true, period: 1440, schedule: [{ start: 0, end: 720, value: 4 }, { start: 720, end: 1440, value: 2 }] });
    a.add('source', 'Jobs', -16, 0, { interarrival: expo(2.6) });
    a.add('queue', 'Backlog', -9, 0);
    a.add('process', 'Workcell', -2, 0, { look: 'workstation', capacity: 4, time: tri(6, 8, 11), pool: 'Crew' });
    a.add('sink', 'Shipped', 6, 0);
    a.chain('Jobs', 'Backlog', 'Workcell', 'Shipped');
    a.chart('Backlog', ['Backlog.length']);
    a.chart('Crew', ['Crew.utilization']);
  })),
  // ── logistics
  S('warehouse', 'logistics', 'tplWarehouse', ['창고 입출고', '하역 → 지게차 → 랙 보관 → 피킹 → 출하'], ['Warehouse', 'Unloading → forklifts → racks → picking → shipping'], () => build('Warehouse', { timeUnit: 'min', duration: 1440, floorWidth: 70, floorDepth: 40 }, (a) => {
    a.add('zone', 'Receiving area', -22, 0, { fill: '#fef3c7' }, { w: 16, h: 24 });
    a.add('zone', 'Storage', 2, 0, { fill: '#e2e8f0' }, { w: 26, h: 26 });
    a.add('zone', 'Shipping area', 24, 0, { fill: '#dcfce7' }, { w: 14, h: 24 });
    a.add('wall', 'Wall N', -32, -14, {}, { points: [[0, 0], [64, 0]] });
    a.add('source', 'Inbound trucks', -28, 0, { interarrival: expo(4), shape: 'pallet', types: [{ name: 'Pallet', color: '#a16207', weight: 1 }] });
    a.add('dock', 'Dock doors', -22, 0, { doors: 3, time: tri(2, 3, 6) });
    a.add('transporter', 'Forklifts', -15, 0, { vehicle: 'forklift', fleet: 4, speed: 90 });
    a.add('rack', 'Rack A', 2, -8, { bays: 10, levels: 5, dwell: expo(300) }, { rot: 0 });
    a.add('rack', 'Rack B', 2, 0, { bays: 10, levels: 5, dwell: expo(300) });
    a.add('rack', 'Rack C', 2, 8, { bays: 10, levels: 5, dwell: expo(300) });
    a.add('select', 'Slotting', -9, 0, { outputs: 3, mode: 'shortest' });
    a.add('transporter', 'Pickers', 14, 0, { vehicle: 'cart', fleet: 3, speed: 60 });
    a.add('process', 'Pack station', 21, 0, { look: 'packing', capacity: 2, time: tri(3, 4, 6) });
    a.add('sink', 'Outbound', 28, 0);
    a.chain('Inbound trucks', 'Dock doors', 'Forklifts', 'Slotting');
    a.link('Slotting', 'Rack A', 0); a.link('Slotting', 'Rack B', 1); a.link('Slotting', 'Rack C', 2);
    a.link('Rack A', 'Pickers'); a.link('Rack B', 'Pickers'); a.link('Rack C', 'Pickers');
    a.chain('Pickers', 'Pack station', 'Outbound');
    a.chart('Rack fill', ['Rack A.contents', 'Rack B.contents', 'Rack C.contents']);
    a.chart('Fleet', ['Forklifts.utilization', 'Pickers.utilization']);
  })),
  S('crossdock', 'logistics', 'fSelect', ['크로스도킹', '입고 화물을 목적지별로 분류해 출고 도크로'], ['Cross-dock', 'Sort inbound freight by destination to outbound docks'], () => build('Cross-dock', { timeUnit: 'min', duration: 600, floorWidth: 70 }, (a) => {
    a.add('source', 'Inbound', -26, 0, { interarrival: expo(0.8), shape: 'carton', types: [{ name: 'North', color: '#2563eb', weight: 2 }, { name: 'South', color: '#16a34a', weight: 2 }, { name: 'West', color: '#f59e0b', weight: 1 }] });
    a.add('conveyor', 'Induction', -24, 0, { speed: 25 }, { points: [[0, 0], [12, 0]] });
    a.add('select', 'Sorter', -9, 0, { outputs: 3, mode: 'type', typeMap: 'North:1, South:2, West:3' });
    a.add('conveyor', 'Lane N', -7.5, -0.7, { speed: 25 }, { points: [[0, 0], [4, -8], [16, -8]] });
    a.add('conveyor', 'Lane S', -7.5, 0, { speed: 25 }, { points: [[0, 0], [16, 0]] });
    a.add('conveyor', 'Lane W', -7.5, 0.7, { speed: 25 }, { points: [[0, 0], [4, 8], [16, 8]] });
    a.add('dock', 'Door N', 12, -8.7, { doors: 1, time: uni(0.4, 0.9) });
    a.add('dock', 'Door S', 12, 0, { doors: 1, time: uni(0.4, 0.9) });
    a.add('dock', 'Door W', 12, 8.7, { doors: 1, time: uni(0.6, 1.2) });
    a.add('sink', 'Trucks', 20, 0);
    a.chain('Inbound', 'Induction', 'Sorter');
    a.link('Sorter', 'Lane N', 0); a.link('Sorter', 'Lane S', 1); a.link('Sorter', 'Lane W', 2);
    a.link('Lane N', 'Door N'); a.link('Lane S', 'Door S'); a.link('Lane W', 'Door W');
    a.link('Door N', 'Trucks'); a.link('Door S', 'Trucks'); a.link('Door W', 'Trucks');
  })),
  S('agv', 'logistics', 'fAgv', ['AGV 공장 물류', 'AGV 4대가 공정 사이를 운반'], ['AGV factory', '4 AGVs carry parts between cells'], () => build('AGV factory', { timeUnit: 'min', duration: 720, floorWidth: 60 }, (a) => {
    a.add('source', 'Stores', -22, -8, { interarrival: expo(3) });
    a.add('transporter', 'AGV fleet', -16, -8, { vehicle: 'agv', fleet: 4, speed: 50, routing: 'manhattan' });
    a.add('queue', 'Cell 1 in', -2, 6, { capacity: 6 });
    a.add('process', 'Cell 1', 4, 6, { look: 'robot', time: tri(2, 2.6, 3.5) });
    a.add('transporter', 'AGV loop', 10, 6, { vehicle: 'agv', fleet: 2, speed: 50 });
    a.add('process', 'Cell 2', 20, -8, { look: 'cnc', time: tri(2, 2.5, 3) });
    a.add('sink', 'Dispatch', 26, -8);
    a.chain('Stores', 'AGV fleet', 'Cell 1 in', 'Cell 1', 'AGV loop', 'Cell 2', 'Dispatch');
    a.chart('AGVs', ['AGV fleet.utilization', 'AGV loop.utilization']);
  })),
  S('supplychain', 'logistics', 'tplSupply', ['공급망 재고 (SD)', '수요·주문·재고·입고 지연 — 채찍 효과'], ['Supply chain (SD)', 'Demand, orders, inventory and supply delay — bullwhip'], () => build('Supply chain', { timeUnit: 'day', duration: 200, sdDt: 0.25 }, (a) => {
    a.add('parameter', 'TargetInventory', -14, -8, { value: 400, min: 100, max: 1000 });
    a.add('parameter', 'AdjustTime', -4, -8, { value: 8, min: 1, max: 30 });
    a.add('parameter', 'LeadTime', 6, -8, { value: 6, min: 1, max: 20 });
    a.add('variable', 'Demand', 14, -8, { equation: '100 + step(30, 50, t)' });
    a.add('stock', 'OnOrder', -8, 0, { initial: '600' });
    a.add('stock', 'Inventory', 8, 0, { initial: '400' });
    a.add('flow', 'Ordering', -16, 0, { equation: 'max(0, Demand + (TargetInventory - Inventory) / AdjustTime)' });
    a.add('flow', 'Receiving', 0, 0, { equation: 'OnOrder / LeadTime' });
    a.add('flow', 'Shipping', 16, 0, { equation: 'min(Demand, Inventory)' });
    a.link('Ordering', 'OnOrder'); a.link('OnOrder', 'Receiving'); a.link('Receiving', 'Inventory'); a.link('Inventory', 'Shipping');
    a.influence('Demand', 'Ordering'); a.influence('TargetInventory', 'Ordering'); a.influence('AdjustTime', 'Ordering'); a.influence('Inventory', 'Ordering'); a.influence('LeadTime', 'Receiving'); a.influence('Demand', 'Shipping');
    a.chart('Stocks', ['Inventory', 'OnOrder']);
    a.chart('Flows', ['Ordering', 'Receiving', 'Shipping']);
  })),
  // ── services & traffic
  S('bank', 'services', 'tplBank', ['은행 창구', '창구 3개, 오래 기다리면 이탈'], ['Bank tellers', '3 tellers; customers leave after waiting too long'], () => build('Bank', { timeUnit: 'min', duration: 480 }, (a) => {
    a.add('source', 'Customers', -14, 0, { interarrival: expo(1.1), shape: 'person', types: [{ name: 'Customer', color: '#7c3aed', weight: 1 }] });
    a.add('queue', 'Waiting line', -7, 0, { timeout: 15 });
    a.add('process', 'Tellers', 1, 0, { look: 'desk', capacity: 3, time: tri(2, 3, 5) });
    a.add('sink', 'Served', 8, 0);
    a.add('sink', 'Gave up', -7, 6);
    a.chain('Customers', 'Waiting line', 'Tellers', 'Served');
    a.link('Waiting line', 'Gave up', 1);
    a.chart('Line', ['Waiting line.length']);
  })),
  S('hospital', 'services', 'tplHospital', ['응급실', '분류 → 우선순위 대기 → 의사 → 입원/퇴원'], ['Emergency room', 'Triage → priority queue → doctors → admit or discharge'], () => build('Emergency room', { timeUnit: 'min', duration: 1440 }, (a) => {
    a.add('resourcePool', 'Doctors', 2, -8, { capacity: 3, kind: 'worker' });
    a.add('source', 'Patients', -20, 0, { interarrival: expo(6), shape: 'patient', types: [{ name: 'Urgent', color: '#ef4444', weight: 1 }, { name: 'Standard', color: '#f59e0b', weight: 3 }, { name: 'Minor', color: '#22c55e', weight: 4 }] });
    a.add('process', 'Triage', -14, 0, { look: 'desk', capacity: 2, time: tri(2, 3, 5) });
    a.add('assign', 'Set priority', -8, 0, { setPriority: 'random() < 0.15 ? 3 : random() < 0.4 ? 2 : 1' });
    a.add('queue', 'Waiting room', -2, 0, { discipline: 'priority' });
    a.add('seize', 'Get doctor', 4, 0, { pool: 'Doctors' });
    a.add('process', 'Treatment', 9, 0, { look: 'bed', capacity: 6, time: tri(10, 20, 45) });
    a.add('release', 'Free doctor', 14, 0, { pool: 'Doctors' });
    a.add('select', 'Outcome', 18, 0, { outputs: 2, mode: 'probability', weights: '0.25, 0.75' });
    a.add('delay', 'Ward', 23, -5, { time: tri(240, 480, 1200) });
    a.add('sink', 'Discharged', 28, 0);
    a.chain('Patients', 'Triage', 'Set priority', 'Waiting room', 'Get doctor', 'Treatment', 'Free doctor', 'Outcome');
    a.link('Outcome', 'Ward', 0); a.link('Outcome', 'Discharged', 1); a.link('Ward', 'Discharged');
    a.chart('Waiting room', ['Waiting room.length']);
  })),
  S('airport', 'services', 'tplAirport', ['공항 보안 검색', '가장 짧은 줄로, 검색대 4개'], ['Airport security', 'Shortest line to 4 scanners'], () => build('Airport security', { timeUnit: 'min', duration: 360 }, (a) => {
    a.add('source', 'Passengers', -18, 0, { arrivalMode: 'schedule', period: 360, schedule: [{ start: 0, end: 90, value: 1.5 }, { start: 90, end: 180, value: 4 }, { start: 180, end: 360, value: 2 }], shape: 'person', types: [{ name: 'Passenger', color: '#0ea5e9', weight: 1 }] });
    a.add('queue', 'Check-in line', -12, 0);
    a.add('select', 'Lane choice', -6, 0, { outputs: 4, mode: 'shortest' });
    for (let i = 0; i < 4; i++) {
      a.add('queue', `Lane ${i + 1}`, 0, -7.5 + i * 5, { capacity: 12 });
      a.add('process', `Scanner ${i + 1}`, 7, -7.5 + i * 5, { look: 'scanner', time: tri(0.6, 1, 2) });
    }
    a.add('sink', 'Gates', 14, 0);
    a.chain('Passengers', 'Check-in line', 'Lane choice');
    for (let i = 0; i < 4; i++) { a.link('Lane choice', `Lane ${i + 1}`, i); a.link(`Lane ${i + 1}`, `Scanner ${i + 1}`); a.link(`Scanner ${i + 1}`, 'Gates'); }
    a.chart('Lines', ['Check-in line.length', 'Lane 1.length', 'Lane 2.length']);
  })),
  S('intersection', 'transport', 'tplTraffic', ['교차로 신호', '남북·동서 차량이 신호에 따라 통과'], ['Signalised junction', 'North-south and east-west traffic through lights'], () => build('Junction', { timeUnit: 'min', duration: 60, floorWidth: 140, floorDepth: 140 }, (a) => {
    const car = [{ name: 'Car', color: '#2563eb', weight: 4 }, { name: 'Car', color: '#e11d48', weight: 2 }, { name: 'Car', color: '#f1f5f9', weight: 3 }, { name: 'Truck', color: '#f59e0b', weight: 1 }];
    a.add('source', 'West cars', -62, 3.5, { interarrival: expo(0.1), shape: 'car', types: car });
    a.add('road', 'West road', -60, 3.5, { lanes: 1 }, { points: [[0, 0], [50, 0]] });
    a.add('signal', 'Light EW', -8, 8, { green: 0.5, yellow: 0.05, red: 0.55, offset: 0, headway: 0.025 });
    a.add('road', 'East road', -6, 3.5, { lanes: 1 }, { points: [[0, 0], [62, 0]] });
    a.add('sink', 'East', 60, 3.5);
    a.add('source', 'North cars', -3.5, -62, { interarrival: expo(0.14), shape: 'car', types: car });
    a.add('road', 'North road', -3.5, -60, { lanes: 1 }, { points: [[0, 0], [0, 50]] });
    a.add('signal', 'Light NS', -8, -8, { green: 0.5, yellow: 0.05, red: 0.55, offset: 0.55, headway: 0.025 });
    a.add('road', 'South road', -3.5, -6, { lanes: 1 }, { points: [[0, 0], [0, 62]] });
    a.add('sink', 'South', -3.5, 60);
    a.chain('West cars', 'West road', 'Light EW', 'East road', 'East');
    a.chain('North cars', 'North road', 'Light NS', 'South road', 'South');
    a.chart('Roads', ['West road.contents', 'North road.contents']);
  })),
  S('parking', 'transport', 'fParking', ['주차장', '차단기 → 주차 → 출차, 만차 대기'], ['Car park', 'Barrier → parking → exit; queues when full'], () => build('Car park', { timeUnit: 'min', duration: 720, floorWidth: 90 }, (a) => {
    a.add('source', 'Arrivals', -40, 0, { interarrival: expo(1.2), shape: 'car', types: [{ name: 'Car', color: '#2563eb', weight: 1 }, { name: 'Car', color: '#dc2626', weight: 1 }] });
    a.add('road', 'Access road', -38, 0, { lanes: 1, speed: 400 }, { points: [[0, 0], [24, 0]] });
    a.add('gate', 'Barrier', -11, -3, { mode: 'open' });
    a.add('parking', 'Lot', 4, 0, { spaces: 60, dwell: norm(60, 20) }, { w: 20, h: 14 });
    a.add('road', 'Exit lane', 15, 0, { lanes: 1, speed: 400 }, { points: [[0, 0], [20, 0]] });
    a.add('sink', 'Leave', 38, 0);
    a.chain('Arrivals', 'Access road', 'Barrier', 'Lot', 'Exit lane', 'Leave');
    a.chart('Occupancy', ['Lot.contents', 'Access road.contents']);
  })),
  S('carwash', 'services', 'tplCarwash', ['세차장', '셀프·자동 세차 선택, 시간대별 도착'], ['Car wash', 'Self or automatic wash; arrivals by time of day'], () => build('Car wash', { timeUnit: 'min', duration: 600 }, (a) => {
    a.add('source', 'Cars', -16, 0, { arrivalMode: 'schedule', period: 600, schedule: [{ start: 0, end: 120, value: 0.2 }, { start: 120, end: 360, value: 0.45 }, { start: 360, end: 600, value: 0.3 }], shape: 'car', types: [{ name: 'Car', color: '#334155', weight: 1 }] });
    a.add('queue', 'Lineup', -9, 0, { capacity: 8 });
    a.add('select', 'Choice', -3, 0, { outputs: 2, mode: 'probability', weights: '0.6, 0.4' });
    a.add('process', 'Automatic', 4, -4, { look: 'washer', time: tri(5, 6, 8) });
    a.add('process', 'Self bays', 4, 4, { look: 'washer', capacity: 2, time: tri(8, 12, 20) });
    a.add('sink', 'Clean', 11, 0);
    a.chain('Cars', 'Lineup', 'Choice');
    a.link('Choice', 'Automatic', 0); a.link('Choice', 'Self bays', 1); a.link('Automatic', 'Clean'); a.link('Self bays', 'Clean');
  })),
  // ── system dynamics
  S('bass', 'dynamics', 'tplMarket', ['신제품 확산 (Bass)', '광고와 입소문으로 잠재 고객이 사용자로'], ['Product diffusion (Bass)', 'Advertising and word of mouth turn prospects into adopters'], () => build('Bass diffusion', { timeUnit: 'day', duration: 365, sdDt: 0.5 }, (a) => {
    a.add('stock', 'Potential', -10, 0, { initial: '100000' });
    a.add('stock', 'Adopters', 10, 0, { initial: '0' });
    a.add('flow', 'Adoption', 0, 0, { equation: 'Potential * (Advertising + WordOfMouth * Adopters / (Potential + Adopters))' });
    a.add('parameter', 'Advertising', -6, -6, { value: 0.003, min: 0, max: 0.02 });
    a.add('parameter', 'WordOfMouth', 6, -6, { value: 0.04, min: 0, max: 0.2 });
    a.link('Potential', 'Adoption'); a.link('Adoption', 'Adopters');
    a.influence('Advertising', 'Adoption'); a.influence('WordOfMouth', 'Adoption'); a.influence('Adopters', 'Adoption');
    a.chart('Market', ['Potential', 'Adopters']);
    a.chart('Adoption rate', ['Adoption']);
  })),
  S('predator', 'dynamics', 'tplEcology', ['포식자–피식자', 'Lotka–Volterra, RK4 적분'], ['Predator and prey', 'Lotka–Volterra, RK4 integration'], () => build('Predator and prey', { timeUnit: 'day', duration: 200, sdDt: 0.05, sdMethod: 'rk4' }, (a) => {
    a.add('stock', 'Rabbits', -8, 0, { initial: '40' });
    a.add('stock', 'Foxes', 8, 0, { initial: '9' });
    a.add('flow', 'RabbitBirths', -16, 0, { equation: '0.1 * Rabbits' });
    a.add('flow', 'Predation', 0, -4, { equation: '0.02 * Rabbits * Foxes' });
    a.add('flow', 'FoxBirths', 0, 4, { equation: '0.01 * Rabbits * Foxes' });
    a.add('flow', 'FoxDeaths', 16, 0, { equation: '0.1 * Foxes' });
    a.link('RabbitBirths', 'Rabbits'); a.link('Rabbits', 'Predation'); a.link('FoxBirths', 'Foxes'); a.link('Foxes', 'FoxDeaths');
    a.influence('Foxes', 'Predation'); a.influence('Rabbits', 'FoxBirths'); a.influence('Foxes', 'FoxBirths');
    a.chart('Populations', ['Rabbits', 'Foxes']);
  })),
  S('workforce', 'dynamics', 'fPool', ['인력 계획 (SD)', '채용·교육·이직이 생산 능력에 미치는 영향'], ['Workforce planning (SD)', 'Hiring, training and attrition versus capacity'], () => build('Workforce planning', { timeUnit: 'day', duration: 730, sdDt: 1 }, (a) => {
    a.add('stock', 'Trainees', -6, 0, { initial: '10' });
    a.add('stock', 'Experienced', 8, 0, { initial: '80' });
    a.add('flow', 'Hiring', -16, 0, { equation: 'max(0, (Target - Trainees - Experienced) / 30 + Attrition)' });
    a.add('flow', 'Training', 1, 0, { equation: 'Trainees / 60' });
    a.add('flow', 'Attrition', 16, 0, { equation: 'Experienced * 0.0008' });
    a.add('variable', 'Target', -12, -7, { equation: '100 + step(40, 180, t)' });
    a.add('variable', 'Capacity', 8, 7, { equation: 'Experienced * 8 + Trainees * 3' });
    a.link('Hiring', 'Trainees'); a.link('Trainees', 'Training'); a.link('Training', 'Experienced'); a.link('Experienced', 'Attrition');
    a.influence('Target', 'Hiring'); a.influence('Experienced', 'Capacity'); a.influence('Trainees', 'Capacity');
    a.chart('Staff', ['Trainees', 'Experienced', 'Target']);
    a.chart('Capacity', ['Capacity']);
  })),
  // ── agents & hybrid
  S('epidemic', 'agents', 'tplEpidemic', ['감염병 확산 (SIR)', '에이전트 400명, 접촉 감염·회복'], ['Epidemic (SIR)', '400 agents, infection by contact, recovery'], () => build('Epidemic', { timeUnit: 'day', duration: 120, agentDt: 0.2 }, (a) => {
    a.add('population', 'Town', 0, 0, { count: 400, speed: 6, initial: 'Susceptible:396, Infected:4', transitions: [
      { from: 'Susceptible', to: 'Infected', kind: 'contact', value: 1.2, trigger: 'Infected', radius: 1 },
      { from: 'Infected', to: 'Recovered', kind: 'timeout', value: 10 },
      { from: 'Recovered', to: 'Susceptible', kind: 'rate', value: 0.004 },
    ] }, { w: 40, h: 26 });
    a.add('display', 'Infected now', 0, -16, { expression: 'Town.Infected', digits: 0 });
    a.chart('SIR', ['Town.Susceptible', 'Town.Infected', 'Town.Recovered']);
  })),
  S('adoption', 'agents', 'fAgents', ['제품 입소문 (에이전트)', 'Bass 확산의 에이전트 버전'], ['Word of mouth (agents)', 'The agent-based Bass model'], () => build('Word of mouth', { timeUnit: 'day', duration: 200, agentDt: 0.5 }, (a) => {
    a.add('population', 'Consumers', 0, 0, { count: 600, speed: 3, shape: 'dot', states: [{ name: 'Potential', color: '#94a3b8' }, { name: 'Adopter', color: '#16a34a' }], initial: 'Potential:1, Adopter:0', transitions: [
      { from: 'Potential', to: 'Adopter', kind: 'rate', value: 0.002 },
      { from: 'Potential', to: 'Adopter', kind: 'contact', value: 0.25, trigger: 'Adopter', radius: 1.5 },
    ] }, { w: 36, h: 24 });
    a.chart('Adoption', ['Consumers.Potential', 'Consumers.Adopter']);
  })),
  S('hybrid', 'agents', 'tplHybrid', ['하이브리드: SD 수요 → 생산', 'SD 계절 수요가 공정 도착률을 정하고 완제품 재고를 SD로'], ['Hybrid: SD demand → production', 'Seasonal SD demand drives arrivals; finished stock in SD'], () => build('Hybrid demand', { timeUnit: 'min', duration: 1440, sdDt: 1 }, (a) => {
    a.add('variable', 'Demand', -14, -8, { equation: '0.35 + sinwave(0.2, 720, t)' });
    a.add('source', 'Orders', -16, 0, { arrivalMode: 'rate', rate: 'Demand' });
    a.add('queue', 'Order book', -10, 0);
    a.add('process', 'Production', -3, 0, { look: 'machine', capacity: 2, time: tri(3.5, 4.5, 6) });
    a.add('sink', 'Made', 4, 0);
    a.add('stock', 'Stock', 12, -8, { initial: '50' });
    a.add('flow', 'Produced', 6, -8, { equation: 'Production.busy / 4.6' });
    a.add('flow', 'Sold', 18, -8, { equation: 'min(Stock, 0.4)' });
    a.chain('Orders', 'Order book', 'Production', 'Made');
    a.link('Produced', 'Stock'); a.link('Stock', 'Sold');
    a.influence('Demand', 'Orders');
    a.chart('Demand and backlog', ['Demand', 'Order book.length']);
    a.chart('Finished stock', ['Stock']);
  })),
  // ── more manufacturing
  S('kanbanLine', 'manufacturing', 'fAreaStart', ['칸반 생산 라인', 'CONWIP 10으로 재공을 제한한 4공정 라인'], ['Kanban line', 'A four-step line with WIP capped at 10 (CONWIP)'], () => build('Kanban line', { timeUnit: 'min', duration: 960, warmup: 60 }, (a) => {
    a.add('source', 'Orders', -24, 0, { interarrival: expo(1.6) }); a.add('queue', 'Order backlog', -19, 0);
    a.add('restrictedStart', 'CardIn', -14, 0, { capacity: 10 }); a.add('timeStart', 'StartClock', -10.5, 0);
    a.add('cncMachine', 'Cut', -6, 0, { time: tri(1, 1.3, 1.8), failures: false }); a.add('queue', 'B1', -1, 0, { capacity: 4 });
    a.add('drillPress', 'Drill', 4, 0); a.add('queue', 'B2', 8, 0, { capacity: 4 }); a.add('grinder', 'Finish', 12.5, 0, { time: tri(1, 1.4, 1.9) });
    a.add('timeEnd', 'StopClock', 16, 0, { start: 'StartClock' }); a.add('restrictedEnd', 'CardOut', 19, 0, { start: 'CardIn' }); a.add('sink', 'Shipped', 23, 0);
    a.chain('Orders', 'Order backlog', 'CardIn', 'StartClock', 'Cut', 'B1', 'Drill', 'B2', 'Finish', 'StopClock', 'CardOut', 'Shipped');
    a.add('gauge', 'WIP gauge', -14, -7, { expression: 'CardIn.inside', max: 10 }); a.add('counter', 'Lead time', 16, -7, { expression: 'StopClock.time', digits: 2, unitLabel: 'min' });
    a.chart('WIP and backlog', ['CardIn.inside', 'Order backlog.length']); a.chart('Lead time', ['StopClock.time']);
  })),
  S('machiningPm', 'manufacturing', 'fMaintenance', ['예방 보전 가공 셀', 'CNC 3대, 정기 보전과 고장, 작업자 2명'], ['Machining with maintenance', '3 CNCs, planned maintenance and breakdowns, 2 setters'], () => build('Machining with maintenance', { timeUnit: 'min', duration: 1440 }, (a) => {
    a.add('resourcePool', 'Setters', 0, 10, { capacity: 3 });
    a.add('source', 'Blanks', -20, 0, { interarrival: expo(1.7), shape: 'part', types: [{ name: 'Shaft', color: '#64748b', weight: 2 }, { name: 'Flange', color: '#0ea5e9', weight: 1 }] });
    a.add('queue', 'Queue', -14, 0); a.add('select', 'Load', -9, 0, { outputs: 3, mode: 'shortest' });
    for (let i = 0; i < 3; i++) { a.add('cncMachine', `CNC${i + 1}`, -2, -6 + i * 6, { time: tri(3, 3.6, 4.8), setup: 1.5, pool: 'Setters' }); a.add('maintenance', `PM${i + 1}`, 4, -6 + i * 6, { target: `CNC${i + 1}`, interval: cst(360), duration: tri(15, 20, 30), firstAt: 120 + i * 120 }); }
    a.add('merge', 'Collect', 9, 0, { inputs: 3 }); a.add('inspectionStation', 'Gauge', 14, 0); a.add('sink', 'OK', 19, 0); a.add('sink', 'NG', 14, 6);
    a.chain('Blanks', 'Queue', 'Load'); for (let i = 0; i < 3; i++) { a.link('Load', `CNC${i + 1}`, i); a.link(`CNC${i + 1}`, 'Collect', 0, i); }
    a.chain('Collect', 'Gauge', 'OK'); a.link('Gauge', 'NG', 1);
    a.chart('Machines', ['CNC1.utilization', 'CNC2.utilization', 'CNC3.utilization']);
  })),
  S('paintShop', 'manufacturing', 'fPaint', ['도장 공장', '세척 → 건조 → 도장 → 오븐 경화, 묶음 처리'], ['Paint shop', 'Wash → dry → paint → cure in batches'], () => build('Paint shop', { timeUnit: 'min', duration: 960 }, (a) => {
    a.add('source', 'Panels', -24, 0, { interarrival: expo(1.2), shape: 'carton', types: [{ name: 'Red', color: '#dc2626', weight: 1 }, { name: 'Blue', color: '#2563eb', weight: 1 }, { name: 'White', color: '#e5e7eb', weight: 2 }] });
    a.add('washingMachine', 'Washer', -18, 0, { capacity: 6 }); a.add('dryer', 'Dryer', -11, 0, { capacity: 22 }); a.add('queue', 'Before paint', -5, 0);
    a.add('paintBooth', 'Booth', 1, 0, { capacity: 3, time: tri(1.5, 2, 2.8), setup: 0.5 }); a.add('batch', 'Rack up', 7, 0, { size: 8, outType: 'Rack', shape: 'pallet' });
    a.add('oven', 'Cure oven', 14, 0, { capacity: 3, time: cst(25) }); a.add('unbatch', 'Unrack', 20, 0); a.add('sink', 'Finished', 25, 0);
    a.chain('Panels', 'Washer', 'Dryer', 'Before paint', 'Booth', 'Rack up', 'Cure oven', 'Unrack', 'Finished');
    a.chart('Before paint', ['Before paint.length']);
  })),
  S('electronics', 'manufacturing', 'fTestBench', ['전자 조립', '3D 프린터 시제품, 키팅·조립·시험, 불량 재작업'], ['Electronics assembly', 'Kitting, assembly, test with rework'], () => build('Electronics assembly', { timeUnit: 'min', duration: 960 }, (a) => {
    a.add('source', 'Orders', -22, 0, { interarrival: expo(2.5) }); a.add('kittingStation', 'Kitting', -16, 0);
    a.add('rollerConveyor', 'To assembly', -14, 0, {}, { points: [[0, 0], [6, 0]] }); a.add('assemblyStation', 'Assembly', -4, 0, { capacity: 2, time: tri(3, 4, 6) });
    a.add('merge', 'Into test', 1, 0, { inputs: 2 }); a.add('testBench', 'Test', 6, 0, { defectRate: 0.08 }); a.add('labeler', 'Label', 11, 0); a.add('packingMachine', 'Pack', 15, 0); a.add('sink', 'Ship', 20, 0);
    a.add('process', 'Rework', 6, 7, { look: 'workstation', time: tri(4, 6, 10) });
    a.chain('Orders', 'Kitting', 'To assembly', 'Assembly'); a.link('Assembly', 'Into test', 0, 0); a.chain('Into test', 'Test', 'Label', 'Pack', 'Ship');
    a.link('Test', 'Rework', 1); a.link('Rework', 'Into test', 0, 1, [[1, 7]]);
    a.chart('Test', ['Test.utilization', 'Rework.utilization']);
  })),
  // ── more logistics
  S('asrsCenter', 'logistics', 'fAsrs', ['자동 창고 센터', 'AS/RS 2기, 컨베이어, 피킹·포장'], ['AS/RS centre', 'Two AS/RS aisles, conveyors, picking and packing'], () => build('AS/RS centre', { timeUnit: 'min', duration: 1440, floorWidth: 80 }, (a) => {
    a.add('receivingDock', 'Inbound', -30, 0, { doors: 2, time: tri(0.5, 0.8, 1.2) }); a.add('source', 'Trucks', -36, 0, { interarrival: expo(0.7), shape: 'carton' });
    a.add('rollerConveyor', 'Infeed', -27, 0, {}, { points: [[0, 0], [6, 0]] }); a.add('diverter', 'Aisle choice', -19, 0);
    a.add('asrs', 'Aisle 1', -3, -4, { dwell: expo(400) }); a.add('asrs', 'Aisle 2', -3, 4, { dwell: expo(400) });
    a.add('merge', 'Outfeed', 7, 0, { inputs: 2 }); a.add('pickStation', 'Pick', 12, 0, { capacity: 3 }); a.add('packStation', 'Pack', 17, 0, { capacity: 3 }); a.add('shippingDock', 'Outbound', 23, 0, { doors: 2, time: tri(0.3, 0.6, 1) }); a.add('sink', 'Customers', 29, 0);
    a.chain('Trucks', 'Inbound', 'Infeed', 'Aisle choice'); a.link('Aisle choice', 'Aisle 1', 0); a.link('Aisle choice', 'Aisle 2', 1); a.link('Aisle 1', 'Outfeed', 0, 0); a.link('Aisle 2', 'Outfeed', 0, 1);
    a.chain('Outfeed', 'Pick', 'Pack', 'Outbound', 'Customers');
    a.chart('Stock', ['Aisle 1.contents', 'Aisle 2.contents']);
  })),
  S('ecommerce', 'logistics', 'fSorter', ['이커머스 풀필먼트', '주문 복제 → 피킹·송장 → 짝 맞춤 → 분류 → 출하'], ['E-commerce fulfilment', 'Order split → pick + label → match → sort → ship'], () => build('E-commerce fulfilment', { timeUnit: 'min', duration: 720, floorWidth: 80 }, (a) => {
    a.add('source', 'Web orders', -30, 0, { arrivalMode: 'schedule', period: 720, schedule: [{ start: 0, end: 240, value: 1.2 }, { start: 240, end: 480, value: 2 }, { start: 480, end: 720, value: 1.4 }], types: [{ name: 'North', color: '#2563eb', weight: 2 }, { name: 'South', color: '#16a34a', weight: 2 }, { name: 'Express', color: '#dc2626', weight: 1 }] });
    a.add('split', 'Order + label', -24, 0, { copies: 1, copyType: '', copyColor: '#fbbf24' });
    a.add('resourcePool', 'Pickers', -16, -9, { capacity: 5 }); a.add('pickStation', 'Pick', -16, -3, { capacity: 5, pool: 'Pickers', time: tri(1.5, 2.5, 4) }); a.add('delay', 'Print label', -16, 3, { time: cst(0.5) });
    a.add('match', 'Pair', -9, 0, { byType: true }); a.add('packStation', 'Pack', -3, -2, { capacity: 3 }); a.add('sink', 'Labels used', -3, 4);
    a.add('rollerConveyor', 'To sorter', -0.5, -2, {}, { points: [[0, 0], [6, 0]] }); a.add('sorter', 'Sorter', 8, -2, { outputs: 3, typeMap: 'North:1, South:2, Express:3' });
    a.add('stagingLane', 'Lane North', 16, -9, { capacity: 30 }); a.add('stagingLane', 'Lane South', 16, -2, { capacity: 30 }); a.add('stagingLane', 'Lane Express', 16, 5, { capacity: 30 });
    a.add('shippingDock', 'Trucks', 24, -2, { doors: 3, time: tri(0.3, 0.5, 0.8) }); a.add('sink', 'Delivered', 30, -2);
    a.link('Web orders', 'Order + label'); a.link('Order + label', 'Pick', 0); a.link('Order + label', 'Print label', 1);
    a.link('Pick', 'Pair', 0, 0); a.link('Print label', 'Pair', 0, 1); a.link('Pair', 'Pack', 0); a.link('Pair', 'Labels used', 1);
    a.chain('Pack', 'To sorter', 'Sorter'); a.link('Sorter', 'Lane North', 0); a.link('Sorter', 'Lane South', 1); a.link('Sorter', 'Lane Express', 2);
    for (const l of ['Lane North', 'Lane South', 'Lane Express']) a.link(l, 'Trucks'); a.link('Trucks', 'Delivered');
    a.chart('Pickers', ['Pickers.utilization']);
  })),
  S('port', 'logistics', 'fCrane', ['컨테이너 항만', '선박 하역 크레인 → 야드 → 트럭 반출'], ['Container port', 'Ship-to-shore cranes → yard → trucks'], () => build('Container port', { timeUnit: 'min', duration: 1440, floorWidth: 100, floorDepth: 60 }, (a) => {
    a.add('zone', 'Quay', -30, 0, { fill: '#93c5fd', floor: 'concrete' }, { w: 20, h: 40 }); a.add('zone', 'Yard', 8, 0, { fill: '#e7e5e4', floor: 'asphalt' }, { w: 36, h: 40 });
    a.add('source', 'Vessel', -38, 0, { interarrival: expo(3.6), shape: 'container', types: [{ name: 'Box', color: '#ea580c', weight: 2 }, { name: 'Box', color: '#2563eb', weight: 2 }, { name: 'Box', color: '#16a34a', weight: 1 }] });
    a.add('select', 'Crane pick', -33, 0, { outputs: 2, mode: 'shortest' });
    a.add('overheadCrane', 'STS crane 1', -28, -8, { speed: 40, loadTime: 1, unloadTime: 1 }); a.add('overheadCrane', 'STS crane 2', -28, 8, { speed: 40, loadTime: 1, unloadTime: 1 });
    a.add('floorStorage', 'Container yard', 4, 0, { bays: 140, levels: 1, dwell: tri(120, 300, 720) }, { w: 20, h: 20 });
    a.add('forkliftFleet', 'Reach stackers', 18, 0, { fleet: 3, speed: 80 }); a.add('shippingDock', 'Gate', 26, 0, { doors: 4, time: tri(2, 4, 8) }); a.add('sink', 'Hinterland', 32, 0);
    a.link('Vessel', 'Crane pick'); a.link('Crane pick', 'STS crane 1', 0); a.link('Crane pick', 'STS crane 2', 1); a.link('STS crane 1', 'Container yard'); a.link('STS crane 2', 'Container yard');
    a.chain('Container yard', 'Reach stackers', 'Gate', 'Hinterland');
    a.chart('Yard', ['Container yard.contents']);
  })),
  // ── more services
  S('restaurant', 'services', 'tplRestaurant', ['레스토랑', '테이블 확보 → 주문 → 식사 → 계산 → 테이블 반납'], ['Restaurant', 'Seize a table → order → eat → pay → free the table'], () => build('Restaurant', { timeUnit: 'min', duration: 600 }, (a) => {
    a.add('resourcePool', 'Tables', 0, -8, { capacity: 12, kind: 'tool' }); a.add('resourcePool', 'Waiters', 6, -8, { capacity: 3 });
    a.add('pedSource', 'Guests', -18, 0, { arrivalMode: 'schedule', period: 600, schedule: [{ start: 0, end: 120, value: 0.2 }, { start: 120, end: 240, value: 0.6 }, { start: 240, end: 420, value: 0.25 }, { start: 420, end: 600, value: 0.55 }] });
    a.add('waitingArea', 'Entrance', -12, 0, { timeout: 25 }); a.add('seize', 'Get table', -7, 0, { pool: 'Tables' });
    a.add('process', 'Order', -2, 0, { look: 'desk', capacity: 12, time: tri(2, 4, 6), pool: 'Waiters' }); a.add('delay', 'Eat', 4, 0, { time: tri(25, 40, 60) });
    a.add('pedService', 'Pay', 10, 0, { capacity: 1, time: tri(1, 1.5, 3), look: 'checkout' }); a.add('release', 'Free table', 15, 0, { pool: 'Tables' }); a.add('pedSink', 'Leave', 20, 0); a.add('pedSink', 'Walked away', -12, 6);
    a.chain('Guests', 'Entrance', 'Get table', 'Order', 'Eat', 'Pay', 'Free table', 'Leave'); a.link('Entrance', 'Walked away', 1);
    a.chart('Tables', ['Tables.utilization', 'Entrance.length']);
  })),
  S('callCenter', 'services', 'fPool', ['콜센터', '교대 상담원, 대기 중 포기, 전문 상담 이관'], ['Call centre', 'Agents on shifts, abandoned calls, escalation'], () => build('Call centre', { timeUnit: 'min', duration: 1440 }, (a) => {
    a.add('resourcePool', 'Agents', -2, -8, { capacity: 6, shifts: true, period: 1440, schedule: [{ start: 0, end: 480, value: 2 }, { start: 480, end: 1080, value: 8 }, { start: 1080, end: 1440, value: 4 }] });
    a.add('source', 'Calls', -16, 0, { arrivalMode: 'schedule', period: 1440, schedule: [{ start: 0, end: 480, value: 0.3 }, { start: 480, end: 720, value: 2.4 }, { start: 720, end: 1080, value: 1.8 }, { start: 1080, end: 1440, value: 0.8 }], shape: 'person' });
    a.add('queue', 'On hold', -10, 0, { timeout: 6 }); a.add('process', 'Answer', -3, 0, { look: 'desk', capacity: 8, time: expo(3.5), pool: 'Agents' });
    a.add('select', 'Solved?', 3, 0, { outputs: 2, mode: 'probability', weights: '0.85, 0.15' }); a.add('sink', 'Solved', 9, -3); a.add('process', 'Specialist', 9, 3, { look: 'desk', capacity: 2, time: tri(5, 10, 20) }); a.add('sink', 'Escalated', 15, 3); a.add('sink', 'Abandoned', -10, 6);
    a.chain('Calls', 'On hold', 'Answer', 'Solved?'); a.link('Solved?', 'Solved', 0); a.link('Solved?', 'Specialist', 1); a.link('Specialist', 'Escalated'); a.link('On hold', 'Abandoned', 1);
    a.chart('Hold queue', ['On hold.length']); a.chart('Agents', ['Agents.utilization']);
  })),
  // ── transport (traffic, rail, pedestrians)
  S('tollPlaza', 'transport', 'fToll', ['고속도로 톨게이트', '3차로 고속도로, 요금소 6개, 정체'], ['Highway toll plaza', 'Three-lane highway, six booths, queues'], () => build('Toll plaza', { timeUnit: 'min', duration: 120, floorWidth: 180, floorDepth: 60 }, (a) => {
    a.add('carSource', 'Traffic', -80, 0, { arrivalMode: 'schedule', period: 120, schedule: [{ start: 0, end: 40, value: 8 }, { start: 40, end: 80, value: 14 }, { start: 80, end: 120, value: 9 }] });
    a.add('highway', 'Approach', -78, 0, {}, { points: [[0, 0], [60, 0]] }); a.add('select', 'Lanes', -15, 0, { outputs: 3, mode: 'shortest' });
    for (let i = 0; i < 3; i++) a.add('tollBooth', `Booth ${i + 1}`, -8, (i - 1) * 6, { capacity: 2 });
    a.add('junction', 'Merge', 0, 0, { inputs: 3 }); a.add('highway', 'Exit', 2, 0, {}, { points: [[0, 0], [70, 0]] }); a.add('carSink', 'Away', 74, 0);
    a.chain('Traffic', 'Approach', 'Lanes'); for (let i = 0; i < 3; i++) { a.link('Lanes', `Booth ${i + 1}`, i); a.link(`Booth ${i + 1}`, 'Merge', 0, i); } a.chain('Merge', 'Exit', 'Away');
    a.chart('Approach', ['Approach.contents']);
  })),
  S('railNetwork', 'transport', 'fTrack', ['철도 노선', '여객·화물 분기, 역, 조차장, 신호'], ['Rail network', 'Passenger / freight switch, station, yard, signals'], () => build('Rail network', { timeUnit: 'min', duration: 480, floorWidth: 320, floorDepth: 80 }, (a) => {
    a.add('trainSource', 'Trains', -150, 0, { interarrival: tri(6, 10, 16) }); a.add('railTrack', 'Main line', -148, 0, {}, { points: [[0, 0], [80, 0]] });
    a.add('railSwitch', 'Junction', -64, 0); a.add('railTrack', 'Passenger line', -62, -1, {}, { points: [[0, 0], [20, -20], [60, -20]] });
    a.add('railStation', 'Central station', 10, -24); a.add('railSignal', 'Exit signal', 22, -16);
    a.add('railTrack', 'East line', 24, -20, {}, { points: [[0, 0], [100, 0]] }); a.add('trainSink', 'East', 126, -20);
    a.add('railTrack', 'Freight line', -62, 1, {}, { points: [[0, 0], [20, 20], [50, 20]] }); a.add('railYard', 'Freight yard', 6, 22); a.add('railTrack', 'Yard exit', 24, 20, {}, { points: [[0, 0], [100, 0]] }); a.add('trainSink', 'Port', 126, 20);
    a.chain('Trains', 'Main line', 'Junction'); a.link('Junction', 'Passenger line', 0); a.link('Junction', 'Freight line', 1);
    a.chain('Passenger line', 'Central station', 'Exit signal', 'East line', 'East'); a.chain('Freight line', 'Freight yard', 'Yard exit', 'Port');
    a.chart('Lines', ['Main line.contents', 'Freight yard.contents']);
  })),
  S('metroStation', 'transport', 'fPedIn', ['지하철역', '개찰구·에스컬레이터·승강장 대기·보안 검색'], ['Metro station', 'Turnstiles, escalators, platform waiting, security'], () => build('Metro station', { timeUnit: 'min', duration: 120, floorWidth: 80 }, (a) => {
    a.add('pedSource', 'Entrance', -30, 0, { arrivalMode: 'schedule', period: 120, schedule: [{ start: 0, end: 30, value: 6 }, { start: 30, end: 70, value: 14 }, { start: 70, end: 120, value: 8 }] });
    a.add('walkway', 'Hall', -28, 0, {}, { points: [[0, 0], [8, 0]] }); a.add('securityCheck', 'Security', -16, 0, { capacity: 3, time: tri(0.05, 0.1, 0.3), defectRate: 0 });
    a.add('select', 'Gates', -10, 0, { outputs: 4, mode: 'shortest' });
    for (let i = 0; i < 4; i++) a.add('turnstile', `Gate ${i + 1}`, -4, -4.5 + i * 3);
    a.add('merge', 'Concourse', 2, 0, { inputs: 4 }); a.add('escalator', 'Escalator', 4, 0, {}, { points: [[0, 0], [12, 0]] });
    a.add('waitingArea', 'Platform', 22, 0, { capacity: 400 }, { w: 10, h: 6 }); a.add('delay', 'Train boarding', 30, 0, { time: cst(0.5), capacity: 0 }); a.add('pedSink', 'Departed', 35, 0);
    a.chain('Entrance', 'Hall', 'Security', 'Gates'); for (let i = 0; i < 4; i++) { a.link('Gates', `Gate ${i + 1}`, i); a.link(`Gate ${i + 1}`, 'Concourse', 0, i); }
    a.chain('Concourse', 'Escalator', 'Platform', 'Train boarding', 'Departed');
    a.chart('Crowding', ['Platform.length', 'Escalator.contents']);
  })),
  S('stadium', 'transport', 'fCrowd', ['경기장 퇴장', '관중이 출구와 통로로 빠져나감'], ['Stadium exit', 'Spectators leaving through gates and walkways'], () => build('Stadium exit', { timeUnit: 'min', duration: 60, floorWidth: 90 }, (a) => {
    a.add('pedSource', 'Stands', -30, 0, { interarrival: cst(0.01), maxArrivals: 4000 }); a.add('select', 'Exits', -24, 0, { outputs: 3, mode: 'shortest' });
    for (let i = 0; i < 3; i++) { a.add('waitingArea', `Gate area ${i + 1}`, -17, (i - 1) * 9, { capacity: 0 }); a.add('turnstile', `Exit gate ${i + 1}`, -10, (i - 1) * 9, { time: cst(0.012) }); a.add('walkway', `Ramp ${i + 1}`, -8, (i - 1) * 9, { speed: 60 }, { points: [[0, 0], [20, 0]] }); }
    a.add('merge', 'Plaza', 16, 0, { inputs: 3 }); a.add('pedSink', 'Streets', 22, 0);
    a.link('Stands', 'Exits'); for (let i = 0; i < 3; i++) { a.link('Exits', `Gate area ${i + 1}`, i); a.chain(`Gate area ${i + 1}`, `Exit gate ${i + 1}`, `Ramp ${i + 1}`); a.link(`Ramp ${i + 1}`, 'Plaza', 0, i); } a.link('Plaza', 'Streets');
    a.add('counter', 'Left', 0, -16, { expression: 'Streets.count' }); a.chart('Queues', ['Gate area 1.length', 'Gate area 2.length', 'Gate area 3.length']);
  })),
  S('busCorridor', 'transport', 'fBusStop', ['버스 전용 차로', '버스와 승용차, 정류장 세 곳'], ['Bus corridor', 'Buses and cars with three stops'], () => build('Bus corridor', { timeUnit: 'min', duration: 120, floorWidth: 200 }, (a) => {
    a.add('source', 'Depot', -90, 0, { interarrival: tri(4, 6, 9), shape: 'bus', types: [{ name: 'Bus', color: '#0ea5e9', weight: 1 }] });
    a.add('carSource', 'Cars', -90, 12, { interarrival: expo(0.25) });
    a.add('junction', 'Merge in', -82, 6, { inputs: 2 }); a.add('road', 'Street 1', -80, 6, { lanes: 2, vehicleLength: 9 }, { points: [[0, 0], [40, 0]] });
    a.add('select', 'Bus or car 1', -37, 6, { outputs: 2, mode: 'type', typeMap: 'Bus:1, Car:2, Truck:2' }); a.add('busStop', 'Stop A', -32, 0);
    a.add('junction', 'Rejoin 1', -27, 6, { inputs: 2 }); a.add('road', 'Street 2', -25, 6, { lanes: 2, vehicleLength: 9 }, { points: [[0, 0], [40, 0]] });
    a.add('select', 'Bus or car 2', 18, 6, { outputs: 2, mode: 'type', typeMap: 'Bus:1, Car:2, Truck:2' }); a.add('busStop', 'Stop B', 23, 0);
    a.add('junction', 'Rejoin 2', 28, 6, { inputs: 2 }); a.add('road', 'Street 3', 30, 6, { lanes: 2, vehicleLength: 9 }, { points: [[0, 0], [50, 0]] }); a.add('sink', 'Terminal', 84, 6);
    a.link('Depot', 'Merge in', 0, 0); a.link('Cars', 'Merge in', 0, 1); a.chain('Merge in', 'Street 1', 'Bus or car 1');
    a.link('Bus or car 1', 'Stop A', 0); a.link('Bus or car 1', 'Rejoin 1', 1, 1); a.link('Stop A', 'Rejoin 1', 0, 0); a.chain('Rejoin 1', 'Street 2', 'Bus or car 2');
    a.link('Bus or car 2', 'Stop B', 0); a.link('Bus or car 2', 'Rejoin 2', 1, 1); a.link('Stop B', 'Rejoin 2', 0, 0); a.chain('Rejoin 2', 'Street 3', 'Terminal');
    a.chart('Traffic', ['Street 1.contents', 'Street 2.contents', 'Street 3.contents']);
  })),
  // ── dynamics (SD, fluids)
  S('waterTreatment', 'dynamics', 'fTank', ['정수 처리장', '취수 → 침전조 → 여과조 → 배수지, 밸브 주기'], ['Water treatment', 'Intake → settling → filter → reservoir, valve cycle'], () => build('Water treatment', { timeUnit: 'h', duration: 72, sdDt: 0.05 }, (a) => {
    a.add('fluidSource', 'Intake', -18, 0, { equation: '120 + sinwave(20, 24, t)' });
    a.add('tank', 'Settling', -10, 0, { initial: '300', capacity: 800, unitLabel: 'm³' }); a.add('pump', 'Transfer', -5, 0, { equation: 'min(130, Settling * 0.5)' });
    a.add('tank', 'FilterBed', 0, 0, { initial: '100', capacity: 400, unitLabel: 'm³' }); a.add('valve', 'Backwash', 5, 0, { equation: 'min(160, FilterBed)', openTime: 5, closedTime: 1 });
    a.add('tank', 'Reservoir', 10, 0, { initial: '1500', capacity: 4000, unitLabel: 'm³' }); a.add('fluidSink', 'CityDemand', 17, 0, { equation: '110 + sinwave(40, 24, t + 6)' });
    a.link('Intake', 'Settling'); a.link('Settling', 'Transfer'); a.link('Transfer', 'FilterBed'); a.link('FilterBed', 'Backwash'); a.link('Backwash', 'Reservoir'); a.link('Reservoir', 'CityDemand');
    a.chart('Levels', ['Settling', 'FilterBed', 'Reservoir']); a.chart('Flows', ['Intake', 'CityDemand']);
  })),
  S('batchMixing', 'dynamics', 'fMixer', ['배합 공정 (유체)', '원료 두 가지를 혼합조로, 넘치면 경고'], ['Batch mixing (fluids)', 'Two ingredients into a mixing tank'], () => build('Batch mixing', { timeUnit: 'min', duration: 240, sdDt: 0.1 }, (a) => {
    a.add('tank', 'IngredientA', -12, -5, { initial: '600', capacity: 1000 }); a.add('tank', 'IngredientB', -12, 5, { initial: '400', capacity: 1000 });
    a.add('valve', 'DoseA', -6, -5, { equation: '6', openTime: 20, closedTime: 10 }); a.add('valve', 'DoseB', -6, 5, { equation: '4', openTime: 20, closedTime: 10 });
    a.add('mixingTank', 'Mixer', 0, 0); a.add('pump', 'FillLine', 6, 0, { equation: 'if(Mixer > 200, 9, 0)' }); a.add('tank', 'Product', 12, 0, { initial: '0', capacity: 2000 });
    a.link('IngredientA', 'DoseA'); a.link('DoseA', 'Mixer'); a.link('IngredientB', 'DoseB'); a.link('DoseB', 'Mixer'); a.link('Mixer', 'FillLine'); a.link('FillLine', 'Product'); a.influence('Mixer', 'FillLine');
    a.chart('Tanks', ['IngredientA', 'IngredientB', 'Mixer', 'Product']);
  })),
  S('inventoryPolicy', 'dynamics', 'fLookup', ['재고 정책 (SD)', '계절 수요 조회 테이블, 평활 예측, 발주'], ['Inventory policy (SD)', 'Seasonal lookup demand, smoothed forecast, ordering'], () => build('Inventory policy', { timeUnit: 'day', duration: 365, sdDt: 0.5 }, (a) => {
    a.add('lookup', 'Season', -14, -8, { input: 't % 365', xs: '0, 90, 180, 270, 365', ys: '80, 140, 200, 120, 80' }); a.add('variable', 'Demand', -6, -8, { equation: 'Season * uniform(0.9, 1.1)' });
    a.add('smooth', 'Forecast', 2, -8, { input: 'Demand', delay: 14 }); a.add('parameter', 'CoverDays', 10, -8, { value: 10, min: 2, max: 30 });
    a.add('stock', 'Pipeline', -6, 2, { initial: '1000' }); a.add('stock', 'Inventory', 8, 2, { initial: '1500' });
    a.add('flow', 'Orders', -14, 2, { equation: 'max(0, Forecast + (Forecast * CoverDays - Inventory) / 5)' }); a.add('flow', 'Arrivals', 1, 2, { equation: 'Pipeline / 7' }); a.add('flow', 'Sales', 15, 2, { equation: 'min(Demand, Inventory)' });
    a.link('Orders', 'Pipeline'); a.link('Pipeline', 'Arrivals'); a.link('Arrivals', 'Inventory'); a.link('Inventory', 'Sales');
    a.influence('Season', 'Demand'); a.influence('Demand', 'Forecast'); a.influence('Forecast', 'Orders'); a.influence('CoverDays', 'Orders'); a.influence('Inventory', 'Orders'); a.influence('Demand', 'Sales');
    a.chart('Inventory', ['Inventory', 'Pipeline']); a.chart('Demand vs forecast', ['Demand', 'Forecast']);
  })),
  // ── agents
  S('forestFireSample', 'agents', 'fCells', ['산불 확산 (셀 자동자)', '번개로 불이 나고 이웃으로 번지고 다시 자람'], ['Forest fire (cellular)', 'Lightning, spread to neighbours, regrowth'], () => build('Forest fire', { timeUnit: 'day', duration: 300, agentDt: 1 }, (a) => {
    a.add('cellGrid', 'Forest', 0, 0, { cols: 80, rows: 50, initial: 'Tree:0.7, Fire:0.001, Ash:0.299', transitions: [
      { from: 'Tree', to: 'Fire', kind: 'neighbors', value: 1, trigger: 'Fire' },
      { from: 'Tree', to: 'Fire', kind: 'rate', value: 0.00005 },
      { from: 'Fire', to: 'Ash', kind: 'timeout', value: 1 },
      { from: 'Ash', to: 'Tree', kind: 'rate', value: 0.02 },
    ] }, { w: 40, h: 25 });
    a.add('display', 'Burning', 0, -16, { expression: 'Forest.Fire', digits: 0 }); a.chart('Forest', ['Forest.Tree', 'Forest.Fire', 'Forest.Ash']);
  })),
  S('lifeSample', 'agents', 'fLife', ['생명 게임', '콘웨이 규칙의 셀 자동자 패턴'], ['Game of Life', "Conway's rules on a cell grid"], () => build('Game of Life', { timeUnit: 's', duration: 300, agentDt: 1 }, (a) => {
    a.add('gameOfLife', 'Life', 0, 0, { cols: 90, rows: 56 }, { w: 45, h: 28 }); a.chart('Alive cells', ['Life.Alive']);
  })),
  // ── more samples (10 in every group)
  S('injectionMolding', 'manufacturing', 'fInjection', ['사출 성형 공장', '사출기 4대(유형 변경 준비·고장), 검사, 팔레타이징, 잔업 이벤트'], ['Injection moulding', '4 moulding machines (changeovers, breakdowns), inspection, palletizing, overtime event'], () => build('Injection moulding', { timeUnit: 'min', duration: 1440, warmup: 60 }, (a) => {
    a.add('source', 'Resin orders', -24, 0, { interarrival: expo(1.1), shape: 'part', types: [{ name: 'Cap', color: '#2563eb', weight: 3 }, { name: 'Housing', color: '#16a34a', weight: 2 }, { name: 'Clip', color: '#f59e0b', weight: 1 }] });
    a.add('queue', 'Order queue', -18, 0); a.add('select', 'Assign press', -13, 0, { outputs: 4, mode: 'shortest' });
    for (let i = 0; i < 4; i++) a.add('injectionMolder', `Press ${i + 1}`, -6, -9 + i * 6, { time: tri(3, 3.8, 5), setup: 12, failures: true, mtbf: expo(600), mttr: tri(15, 25, 45) });
    a.add('merge', 'Collect', 1, 0, { inputs: 4 }); a.add('inspectionStation', 'Vision check', 6, 0, { defectRate: 0.03 });
    a.add('palletizer', 'Palletize', 11, 0, { size: 24, outType: 'Pallet', shape: 'pallet' }); a.add('sink', 'Warehouse', 17, 0); a.add('sink', 'Regrind', 6, 7);
    a.add('event', 'Overtime', 11, -8, { trigger: 'once', startAt: 960, targetBlock: 'Vision check', property: 'capacity', newValue: 'current + 1' });
    a.chain('Resin orders', 'Order queue', 'Assign press');
    for (let i = 0; i < 4; i++) { a.link('Assign press', `Press ${i + 1}`, i); a.link(`Press ${i + 1}`, 'Collect', 0, i); }
    a.chain('Collect', 'Vision check', 'Palletize', 'Warehouse'); a.link('Vision check', 'Regrind', 1);
    a.chart('Presses', ['Press 1.utilization', 'Press 2.utilization', 'Press 3.utilization', 'Press 4.utilization']); a.chart('Order queue', ['Order queue.length']);
  })),
  S('coldChain', 'logistics', 'fCold', ['콜드체인 물류센터', '입고 → 품질 보류 → 냉장 창고 → 피킹 → 출고'], ['Cold-chain centre', 'Receiving → quality hold → cold storage → picking → shipping'], () => build('Cold-chain centre', { timeUnit: 'min', duration: 1440, floorWidth: 80 }, (a) => {
    a.add('zone', 'Cold room', 2, 0, { fill: '#cffafe' }, { w: 22, h: 18 });
    a.add('source', 'Reefer trucks', -28, 0, { interarrival: expo(2.5), shape: 'pallet', types: [{ name: 'Dairy', color: '#f8fafc', weight: 2 }, { name: 'Meat', color: '#dc2626', weight: 1 }, { name: 'Produce', color: '#16a34a', weight: 2 }] });
    a.add('receivingDock', 'Receiving', -22, 0, { doors: 2, time: tri(1, 2, 4) }); a.add('qualityHold', 'Temp check', -15, 0, { time: tri(5, 10, 20), capacity: 20 });
    a.add('forkliftFleet', 'Reach trucks', -9, 0, { fleet: 2, speed: 70 }); a.add('coldStorage', 'Cold store', 2, 0, { bays: 12, levels: 4, dwell: tri(120, 360, 900) });
    a.add('pickStation', 'Order pick', 14, 0, { capacity: 2, time: tri(1.5, 2.5, 4) }); a.add('shippingDock', 'Dispatch', 20, 0, { doors: 2, time: tri(1, 1.5, 3) }); a.add('sink', 'Stores', 26, 0);
    a.chain('Reefer trucks', 'Receiving', 'Temp check', 'Reach trucks', 'Cold store', 'Order pick', 'Dispatch', 'Stores');
    a.chart('Cold store', ['Cold store.contents']); a.chart('Hold', ['Temp check.contents']);
  })),
  S('droneDelivery', 'logistics', 'fDrone', ['드론 배송 허브', '주문 포장 후 드론 무리가 배송, 충전 시간 포함'], ['Drone delivery hub', 'Orders packed, then a drone fleet delivers (with recharge time)'], () => build('Drone delivery hub', { timeUnit: 'min', duration: 720, floorWidth: 70 }, (a) => {
    a.add('source', 'App orders', -24, 0, { arrivalMode: 'schedule', period: 720, schedule: [{ start: 0, end: 180, value: 0.5 }, { start: 180, end: 420, value: 1.2 }, { start: 420, end: 720, value: 0.8 }], shape: 'carton' });
    a.add('queue', 'Order pool', -18, 0); a.add('packStation', 'Pack', -12, 0, { capacity: 2, time: tri(0.8, 1.2, 2) });
    a.add('queue', 'Launch pad', -6, 0, { capacity: 20 }); a.add('droneFleet', 'Drones', 4, 0, { fleet: 6, speed: 300, loadTime: 0.5, unloadTime: 0.5 });
    a.add('delay', 'Flight', 12, 0, { time: tri(8, 12, 18) }); a.add('sink', 'Delivered', 18, 0);
    a.chain('App orders', 'Order pool', 'Pack', 'Launch pad', 'Drones', 'Flight', 'Delivered');
    a.chart('Drones', ['Drones.utilization']); a.chart('Waiting', ['Order pool.length', 'Launch pad.length']);
  })),
  S('milkRun', 'logistics', 'fTugger', ['밀크런 부품 공급', '슈퍼마켓 → 6개씩 묶어 견인 열차 → 조립 셀 3곳'], ['Milk run', 'Supermarket → batches of 6 on a tugger train → 3 assembly cells'], () => build('Milk run', { timeUnit: 'min', duration: 960, floorWidth: 70 }, (a) => {
    a.add('source', 'Parts', -26, 0, { interarrival: expo(1), shape: 'carton' }); a.add('floorStorage', 'Supermarket', -18, 0, { bays: 20, levels: 2, dwell: cst(5) });
    a.add('batch', 'Load train', -10, 0, { size: 6, outType: 'Train load', shape: 'pallet' }); a.add('tuggerTrain', 'Tugger', -3, 0, { fleet: 1, speed: 60 });
    a.add('unbatch', 'Unload', 4, 0); a.add('select', 'Line side', 8, 0, { outputs: 3, mode: 'roundRobin' });
    for (let i = 0; i < 3; i++) a.add('assemblyStation', `Cell ${i + 1}`, 14, -6 + i * 6, { time: tri(2, 2.8, 4) });
    a.add('merge', 'Done', 20, 0, { inputs: 3 }); a.add('sink', 'Finished', 25, 0);
    a.chain('Parts', 'Supermarket', 'Load train', 'Tugger', 'Unload', 'Line side');
    for (let i = 0; i < 3; i++) { a.link('Line side', `Cell ${i + 1}`, i); a.link(`Cell ${i + 1}`, 'Done', 0, i); } a.link('Done', 'Finished');
    a.chart('Tugger', ['Tugger.utilization']); a.chart('Cells', ['Cell 1.utilization', 'Cell 2.utilization', 'Cell 3.utilization']);
  })),
  S('supermarket', 'services', 'fCounter', ['마트 계산대', '쇼핑 후 일반 계산대 4곳과 셀프 계산대 중 짧은 줄로'], ['Supermarket checkout', 'Shop, then the shortest of 4 tills or self-checkout'], () => build('Supermarket', { timeUnit: 'min', duration: 600 }, (a) => {
    a.add('pedSource', 'Shoppers', -22, 0, { arrivalMode: 'schedule', period: 600, schedule: [{ start: 0, end: 180, value: 1.2 }, { start: 180, end: 420, value: 2.5 }, { start: 420, end: 600, value: 1.6 }] });
    a.add('delay', 'Shopping', -15, 0, { time: tri(8, 18, 40), capacity: 0 }); a.add('select', 'Pick a line', -8, 0, { outputs: 5, mode: 'shortest' });
    for (let i = 0; i < 4; i++) { a.add('queue', `Line ${i + 1}`, -2, -10 + i * 5, { capacity: 10 }); a.add('pedService', `Till ${i + 1}`, 4, -10 + i * 5, { look: 'checkout', time: tri(1, 2, 4) }); }
    a.add('queue', 'Self line', -2, 10, { capacity: 10 }); a.add('pedService', 'Self-checkout', 4, 10, { look: 'checkout', capacity: 4, time: tri(1.5, 3, 6) });
    a.add('merge', 'Exit', 10, 0, { inputs: 5 }); a.add('pedSink', 'Car park', 15, 0);
    a.chain('Shoppers', 'Shopping', 'Pick a line');
    for (let i = 0; i < 4; i++) { a.link('Pick a line', `Line ${i + 1}`, i); a.link(`Line ${i + 1}`, `Till ${i + 1}`); a.link(`Till ${i + 1}`, 'Exit', 0, i); }
    a.link('Pick a line', 'Self line', 4); a.link('Self line', 'Self-checkout'); a.link('Self-checkout', 'Exit', 0, 4); a.link('Exit', 'Car park');
    a.chart('Lines', ['Line 1.length', 'Line 2.length', 'Self line.length']);
  })),
  S('clinic', 'services', 'tplHospital', ['외래 진료소', '접수 → 의사 진료(자원 풀) → 검사 30% → 약국'], ['Outpatient clinic', 'Reception → doctor (pool) → lab for 30% → pharmacy'], () => build('Outpatient clinic', { timeUnit: 'min', duration: 540 }, (a) => {
    a.add('resourcePool', 'Doctors', 0, -9, { capacity: 4, kind: 'worker' });
    a.add('source', 'Patients', -24, 0, { arrivalMode: 'schedule', period: 540, schedule: [{ start: 0, end: 120, value: 0.6 }, { start: 120, end: 300, value: 0.35 }, { start: 300, end: 540, value: 0.5 }], shape: 'patient' });
    a.add('process', 'Reception', -18, 0, { look: 'desk', capacity: 2, time: tri(1, 2, 4) }); a.add('queue', 'Waiting room', -12, 0);
    a.add('seize', 'Call doctor', -6, 0, { pool: 'Doctors' }); a.add('process', 'Consultation', 0, 0, { look: 'bed', capacity: 4, time: tri(5, 9, 18) }); a.add('release', 'Doctor free', 5, 0, { pool: 'Doctors' });
    a.add('select', 'Needs lab?', 9, 0, { outputs: 2, mode: 'probability', weights: '0.3, 0.7' }); a.add('process', 'Lab', 14, -5, { look: 'test', capacity: 2, time: tri(5, 10, 20) });
    a.add('merge', 'To pharmacy', 18, 0, { inputs: 2 }); a.add('process', 'Pharmacy', 22, 0, { look: 'checkout', capacity: 2, time: tri(1, 3, 6) }); a.add('sink', 'Home', 27, 0);
    a.chain('Patients', 'Reception', 'Waiting room', 'Call doctor', 'Consultation', 'Doctor free', 'Needs lab?');
    a.link('Needs lab?', 'Lab', 0); a.link('Needs lab?', 'To pharmacy', 1, 1); a.link('Lab', 'To pharmacy', 0, 0); a.chain('To pharmacy', 'Pharmacy', 'Home');
    a.chart('Waiting', ['Waiting room.length']); a.chart('Doctors', ['Doctors.utilization']);
  })),
  S('driveThru', 'services', 'fCar', ['드라이브 스루', '주문 창구 → 결제 → 픽업, 줄이 길면 그냥 지나감'], ['Drive-through', 'Order → pay → pick up; cars drive past when the lane is long'], () => build('Drive-through', { timeUnit: 'min', duration: 300 }, (a) => {
    a.add('carSource', 'Cars', -22, 0, { arrivalMode: 'schedule', period: 300, schedule: [{ start: 0, end: 90, value: 0.6 }, { start: 90, end: 180, value: 1.4 }, { start: 180, end: 300, value: 0.8 }] });
    a.add('queue', 'Lane', -15, 0, { capacity: 10, timeout: 8 }); a.add('process', 'Order window', -8, 0, { look: 'desk', time: tri(0.5, 0.9, 1.6) });
    a.add('queue', 'Between', -3, 0, { capacity: 3 }); a.add('process', 'Pay window', 2, 0, { look: 'checkout', time: tri(0.3, 0.5, 0.9) });
    a.add('queue', 'Wait food', 7, 0, { capacity: 2 }); a.add('process', 'Pickup', 12, 0, { look: 'desk', time: tri(0.4, 0.8, 1.8) }); a.add('carSink', 'Served', 18, 0); a.add('carSink', 'Drove past', -15, 6);
    a.chain('Cars', 'Lane', 'Order window', 'Between', 'Pay window', 'Wait food', 'Pickup', 'Served'); a.link('Lane', 'Drove past', 1);
    a.chart('Lane', ['Lane.length']); a.chart('Windows', ['Order window.utilization', 'Pickup.utilization']);
  })),
  S('hotelFrontDesk', 'services', 'fCounter', ['호텔 프런트', '체크인 저녁 몰림, 이벤트로 17~20시에 직원 2명 추가'], ['Hotel front desk', 'Evening check-in peak; events add 2 staff from 17:00 to 20:00'], () => build('Hotel front desk', { timeUnit: 'min', duration: 1440 }, (a) => {
    a.add('pedSource', 'Guests', -16, 0, { arrivalMode: 'schedule', period: 1440, schedule: [{ start: 0, end: 840, value: 0.1 }, { start: 840, end: 1200, value: 0.6 }, { start: 1200, end: 1440, value: 0.15 }] });
    a.add('queue', 'Lobby queue', -9, 0, { timeout: 30 }); a.add('process', 'Front desk', -2, 0, { look: 'desk', capacity: 2, time: tri(2, 4, 8) });
    a.add('process', 'Bell desk', 5, 0, { look: 'desk', capacity: 2, time: tri(1, 2, 4) }); a.add('pedSink', 'Rooms', 11, 0); a.add('pedSink', 'Complaints', -9, 6);
    a.add('event', 'Evening staff', -2, -8, { trigger: 'once', startAt: 1020, targetBlock: 'Front desk', property: 'capacity', newValue: 'current + 2' });
    a.add('event', 'Staff off', 4, -8, { trigger: 'once', startAt: 1200, targetBlock: 'Front desk', property: 'capacity', newValue: '2' });
    a.chain('Guests', 'Lobby queue', 'Front desk', 'Bell desk', 'Rooms'); a.link('Lobby queue', 'Complaints', 1);
    a.chart('Lobby', ['Lobby queue.length']); a.chart('Desk', ['Front desk.utilization']);
  })),
  S('fuelStationSample', 'transport', 'fFuel', ['주유소', '도로에서 들어와 가장 짧은 줄의 주유기 4대로'], ['Fuel station', 'Cars come off the road to the shortest of 4 pumps'], () => build('Fuel station', { timeUnit: 'min', duration: 240, floorWidth: 120 }, (a) => {
    a.add('carSource', 'Traffic', -50, 0, { interarrival: expo(0.9) }); a.add('road', 'Entry road', -48, 0, { lanes: 1 }, { points: [[0, 0], [30, 0]] });
    a.add('select', 'Pick pump', -15, 0, { outputs: 4, mode: 'shortest' });
    for (let i = 0; i < 4; i++) { a.add('queue', `Bay ${i + 1}`, -8, -9 + i * 6, { capacity: 3 }); a.add('fuelStation', `Pump ${i + 1}`, -1, -9 + i * 6, { time: tri(2, 3.5, 6) }); }
    a.add('junction', 'Exit', 6, 0, { inputs: 4 }); a.add('road', 'Exit road', 8, 0, { lanes: 1 }, { points: [[0, 0], [36, 0]] }); a.add('carSink', 'Away', 48, 0);
    a.chain('Traffic', 'Entry road', 'Pick pump');
    for (let i = 0; i < 4; i++) { a.link('Pick pump', `Bay ${i + 1}`, i); a.link(`Bay ${i + 1}`, `Pump ${i + 1}`); a.link(`Pump ${i + 1}`, 'Exit', 0, i); } a.chain('Exit', 'Exit road', 'Away');
    a.chart('Bays', ['Bay 1.length', 'Bay 2.length', 'Bay 3.length', 'Bay 4.length']);
  })),
  S('crosswalk', 'transport', 'fCrosswalk', ['횡단보도', '차량 신호와 보행 신호가 번갈아, 양쪽 대기'], ['Pedestrian crossing', 'Car and pedestrian lights alternate; both sides wait'], () => build('Pedestrian crossing', { timeUnit: 'min', duration: 60, floorWidth: 120, floorDepth: 80 }, (a) => {
    a.add('carSource', 'Cars', -55, 0, { interarrival: expo(0.12) }); a.add('road', 'Approach', -53, 0, { lanes: 1 }, { points: [[0, 0], [45, 0]] });
    a.add('signal', 'Car light', -6, 4, { green: 1, yellow: 0.08, red: 0.6, offset: 0, headway: 0.03 }); a.add('road', 'Beyond', -4, 0, { lanes: 1 }, { points: [[0, 0], [50, 0]] }); a.add('carSink', 'Downtown', 48, 0);
    a.add('pedSource', 'Walkers', 0, -30, { interarrival: expo(0.08) }); a.add('waitingArea', 'Kerb', 0, -18, { capacity: 0 });
    a.add('crosswalk', 'Walk light', 0, -10, { green: 0.5, yellow: 0.08, red: 1.1, offset: 1.08, headway: 0.005 }); a.add('walkway', 'Zebra', 0, -8, {}, { points: [[0, 0], [0, 20]] }); a.add('pedSink', 'Other side', 0, 16);
    a.chain('Cars', 'Approach', 'Car light', 'Beyond', 'Downtown'); a.chain('Walkers', 'Kerb', 'Walk light', 'Zebra', 'Other side');
    a.chart('Waiting', ['Approach.contents', 'Kerb.length']);
  })),
  S('commuterRail', 'transport', 'fTrainIn', ['통근 열차', '역 세 곳을 지나는 노선, 정차 시간과 신호'], ['Commuter rail', 'A line through three stations, dwell times and signals'], () => build('Commuter rail', { timeUnit: 'min', duration: 300, floorWidth: 340 }, (a) => {
    a.add('trainSource', 'Depot', -160, 0, { interarrival: tri(8, 10, 14) });
    let x = -158; let prev = 'Depot';
    for (let i = 0; i < 3; i++) {
      a.add('railTrack', `Track ${i + 1}`, x, 0, {}, { points: [[0, 0], [70, 0]] }); a.add('railStation', `Station ${String.fromCharCode(65 + i)}`, x + 76, 0, { capacity: 1, time: tri(1, 1.5, 3) }); a.add('railSignal', `Signal ${i + 1}`, x + 84, 0);
      a.link(prev, `Track ${i + 1}`); a.chain(`Track ${i + 1}`, `Station ${String.fromCharCode(65 + i)}`, `Signal ${i + 1}`); prev = `Signal ${i + 1}`; x += 90;
    }
    a.add('railTrack', 'Track 4', x, 0, {}, { points: [[0, 0], [40, 0]] }); a.add('trainSink', 'Terminus', x + 44, 0); a.chain(prev, 'Track 4', 'Terminus');
    a.chart('Tracks', ['Track 1.contents', 'Track 2.contents', 'Track 3.contents']);
  })),
  S('damReservoir', 'dynamics', 'fTank', ['댐 저수지 (유체)', '계절 유입, 발전 방류, 넘치면 여수로'], ['Dam reservoir (fluids)', 'Seasonal inflow, turbine release, spillway when full'], () => build('Dam reservoir', { timeUnit: 'day', duration: 365, sdDt: 0.25 }, (a) => {
    a.add('lookup', 'Rainfall', -16, -8, { input: 't % 365', xs: '0, 90, 180, 210, 270, 365', ys: '40, 60, 260, 300, 90, 40' });
    a.add('fluidSource', 'RiverIn', -12, 0, { equation: 'Rainfall' }); a.add('tank', 'Reservoir', -2, 0, { initial: '8000', capacity: 20000, unitLabel: 'k m³' });
    a.add('pump', 'Turbines', 6, -4, { equation: 'min(Reservoir, 110)' }); a.add('valve', 'Spillway', 6, 4, { equation: 'if(Reservoir > 18000, (Reservoir - 18000) / 2, 0)' });
    a.add('fluidSink', 'Downstream', 14, 0, { equation: 'Turbines + Spillway' }); a.add('variable', 'Power', 6, -10, { equation: 'Turbines * 0.9' });
    a.link('RiverIn', 'Reservoir'); a.link('Reservoir', 'Turbines'); a.link('Reservoir', 'Spillway'); a.influence('Rainfall', 'RiverIn'); a.influence('Reservoir', 'Spillway'); a.influence('Turbines', 'Power');
    a.chart('Storage', ['Reservoir']); a.chart('Flows', ['RiverIn', 'Turbines', 'Spillway']);
  })),
  S('projectRework', 'dynamics', 'fStock', ['프로젝트 재작업 순환 (SD)', '할 일 → 완료, 숨은 오류가 발견되어 다시 할 일로'], ['Project rework cycle (SD)', 'Work to do → done; hidden errors come back as rework'], () => build('Project rework', { timeUnit: 'day', duration: 300, sdDt: 0.25 }, (a) => {
    a.add('stock', 'WorkToDo', -10, 0, { initial: '1000' }); a.add('stock', 'WorkDone', 10, -4, { initial: '0' }); a.add('stock', 'HiddenRework', 10, 4, { initial: '0' });
    a.add('parameter', 'Staff', -10, -8, { value: 10, min: 1, max: 40 }); a.add('parameter', 'Quality', 0, -10, { value: 0.8, min: 0.3, max: 1 });
    a.add('variable', 'Progress', 0, 0, { equation: 'min(WorkToDo, Staff * 0.5)' });
    a.add('flow', 'CorrectWork', 3, -4, { equation: 'Progress * Quality' }); a.add('flow', 'FlawedWork', 3, 4, { equation: 'Progress * (1 - Quality)' }); a.add('flow', 'Discovery', 0, 9, { equation: 'HiddenRework / 20' });
    a.link('WorkToDo', 'CorrectWork'); a.link('CorrectWork', 'WorkDone'); a.link('WorkToDo', 'FlawedWork'); a.link('FlawedWork', 'HiddenRework'); a.link('HiddenRework', 'Discovery'); a.link('Discovery', 'WorkToDo');
    a.influence('Staff', 'Progress'); a.influence('Quality', 'CorrectWork'); a.influence('Quality', 'FlawedWork'); a.influence('Progress', 'CorrectWork'); a.influence('Progress', 'FlawedWork');
    a.chart('Project', ['WorkToDo', 'WorkDone', 'HiddenRework']);
  })),
  S('startupCash', 'dynamics', 'fLookup', ['스타트업 현금 흐름 (SD)', '고객·매출·마케팅·고정비, 손익분기까지의 현금'], ['Start-up cash flow (SD)', 'Customers, revenue, marketing and fixed costs; cash until break-even'], () => build('Start-up cash flow', { timeUnit: 'day', duration: 720, sdDt: 1 }, (a) => {
    a.add('stock', 'Cash', 0, 0, { initial: '500000', nonNegative: false }); a.add('stock', 'Customers', 0, -10, { initial: '100' });
    a.add('parameter', 'Price', -14, -14, { value: 30, min: 5, max: 100 }); a.add('parameter', 'Marketing', -14, -6, { value: 1500, min: 0, max: 10000 }); a.add('parameter', 'FixedCost', 14, 6, { value: 1200, min: 0, max: 5000 });
    a.add('flow', 'NewCustomers', -8, -10, { equation: 'Marketing / 60 + Customers * 0.004' }); a.add('flow', 'Churn', 8, -10, { equation: 'Customers * 0.01' });
    a.add('flow', 'Revenue', -8, 0, { equation: 'Customers * Price / 30' }); a.add('flow', 'Spending', 8, 0, { equation: 'Marketing + FixedCost' });
    a.link('NewCustomers', 'Customers'); a.link('Customers', 'Churn'); a.link('Revenue', 'Cash'); a.link('Cash', 'Spending');
    a.influence('Marketing', 'NewCustomers'); a.influence('Customers', 'Revenue'); a.influence('Price', 'Revenue'); a.influence('Marketing', 'Spending'); a.influence('FixedCost', 'Spending');
    a.add('display', 'Cash now', 0, 8, { expression: 'Cash', digits: 0 });
    a.chart('Cash', ['Cash']); a.chart('Customers', ['Customers']);
  })),
  S('refinery', 'dynamics', 'fMixer', ['정유 공정 (유체)', '원유 탱크 → 증류 → 휘발유·경유 탱크, 출하 주기'], ['Refinery (fluids)', 'Crude tank → distillation → petrol and diesel tanks, shipping cycles'], () => build('Refinery', { timeUnit: 'h', duration: 168, sdDt: 0.1 }, (a) => {
    a.add('fluidSource', 'Pipeline', -18, 0, { equation: '100' }); a.add('tank', 'Crude', -10, 0, { initial: '3000', capacity: 8000 });
    a.add('pump', 'Feed', -4, 0, { equation: 'min(Crude, 105)' }); a.add('mixingTank', 'Column', 2, 0, { initial: '200', capacity: 600 });
    a.add('flow', 'ToPetrol', 7, -5, { equation: 'Column * 0.25' }); a.add('flow', 'ToDiesel', 7, 5, { equation: 'Column * 0.25' });
    a.add('tank', 'Petrol', 13, -5, { initial: '500', capacity: 4000 }); a.add('tank', 'Diesel', 13, 5, { initial: '500', capacity: 4000 });
    a.add('valve', 'ShipPetrol', 19, -5, { equation: 'min(Petrol, 300)', openTime: 4, closedTime: 20 }); a.add('valve', 'ShipDiesel', 19, 5, { equation: 'min(Diesel, 300)', openTime: 4, closedTime: 20 });
    a.add('fluidSink', 'Terminal', 25, 0, { equation: 'ShipPetrol + ShipDiesel' });
    a.link('Pipeline', 'Crude'); a.link('Crude', 'Feed'); a.link('Feed', 'Column'); a.link('Column', 'ToPetrol'); a.link('Column', 'ToDiesel'); a.link('ToPetrol', 'Petrol'); a.link('ToDiesel', 'Diesel'); a.link('Petrol', 'ShipPetrol'); a.link('Diesel', 'ShipDiesel');
    a.chart('Tanks', ['Crude', 'Petrol', 'Diesel']); a.chart('Column', ['Column']);
  })),
  S('evacuation', 'agents', 'fCrowd', ['건물 대피', '경보 후 사람들이 출구로 이동해 대피'], ['Building evacuation', 'After the alarm people head out and leave'], () => build('Building evacuation', { timeUnit: 'min', duration: 30, agentDt: 0.05 }, (a) => {
    a.add('population', 'Occupants', 0, 0, { count: 500, speed: 40, states: [{ name: 'Working', color: '#64748b' }, { name: 'Alarmed', color: '#f59e0b' }, { name: 'Evacuated', color: '#22c55e' }], initial: 'Working:1', transitions: [
      { from: 'Working', to: 'Alarmed', kind: 'condition', value: 'time > 5' },
      { from: 'Alarmed', to: 'Evacuated', kind: 'rate', value: 0.4 },
      { from: 'Working', to: 'Alarmed', kind: 'contact', value: 2, trigger: 'Alarmed', radius: 1.5 },
    ] }, { w: 40, h: 26 });
    a.add('display', 'Still inside', 0, -16, { expression: 'Occupants.Working + Occupants.Alarmed', digits: 0 });
    a.chart('Evacuation', ['Occupants.Working', 'Occupants.Alarmed', 'Occupants.Evacuated']);
  })),
  S('rumor', 'agents', 'fAgents', ['소문 퍼짐', '모름 → 퍼뜨림 → 시들해짐, 접촉으로 전파'], ['Rumour spreading', 'Unaware → spreader → bored, passed on by contact'], () => build('Rumour spreading', { timeUnit: 'day', duration: 60, agentDt: 0.1 }, (a) => {
    a.add('population', 'Town', 0, 0, { count: 500, speed: 5, states: [{ name: 'Unaware', color: '#94a3b8' }, { name: 'Spreader', color: '#e11d48' }, { name: 'Bored', color: '#0ea5e9' }], initial: 'Unaware:495, Spreader:5', transitions: [
      { from: 'Unaware', to: 'Spreader', kind: 'contact', value: 1, trigger: 'Spreader', radius: 1.2 },
      { from: 'Spreader', to: 'Bored', kind: 'contact', value: 0.3, trigger: 'Bored', radius: 1.2 },
      { from: 'Spreader', to: 'Bored', kind: 'timeout', value: 10 },
    ] }, { w: 40, h: 26 });
    a.chart('Rumour', ['Town.Unaware', 'Town.Spreader', 'Town.Bored']);
  })),
  S('urbanGrowth', 'agents', 'fCells', ['도시 성장 (셀 자동자)', '건물이 이웃한 땅이 개발되고 공원은 남음'], ['Urban growth (cellular)', 'Land next to built-up cells gets developed; parks stay'], () => build('Urban growth', { timeUnit: 'day', duration: 60, agentDt: 1 }, (a) => {
    a.add('cellGrid', 'Region', 0, 0, { cols: 80, rows: 50, states: [{ name: 'Rural', color: '#84cc16' }, { name: 'Urban', color: '#64748b' }, { name: 'Park', color: '#15803d' }], initial: 'Rural:0.9, Urban:0.01, Park:0.09', transitions: [
      { from: 'Rural', to: 'Urban', kind: 'neighbors', value: 3, max: 8, trigger: 'Urban' },
      { from: 'Rural', to: 'Urban', kind: 'rate', value: 0.002 },
    ] }, { w: 40, h: 25 });
    a.chart('Land use', ['Region.Rural', 'Region.Urban', 'Region.Park']);
  })),
  S('epidemicHospital', 'agents', 'tplHybrid', ['하이브리드: 감염병 → 병원', '에이전트 감염자 수가 병원 입원(이산 사건) 도착률을 정함'], ['Hybrid: epidemic → hospital', 'The agents\' infected count sets the hospital (discrete-event) admission rate'], () => build('Epidemic and hospital', { timeUnit: 'day', duration: 120, agentDt: 0.2 }, (a) => {
    a.add('population', 'City', -14, 0, { count: 600, speed: 6, initial: 'Susceptible:594, Infected:6', transitions: [
      { from: 'Susceptible', to: 'Infected', kind: 'contact', value: 0.9, trigger: 'Infected', radius: 1 },
      { from: 'Infected', to: 'Recovered', kind: 'timeout', value: 12 },
    ] }, { w: 26, h: 20 });
    a.add('source', 'Admissions', 4, 0, { arrivalMode: 'rate', rate: 'City.Infected * 0.03', shape: 'patient' });
    a.add('queue', 'Waiting beds', 9, 0); a.add('process', 'Ward', 14, 0, { look: 'bed', capacity: 8, time: tri(4, 7, 14) }); a.add('sink', 'Discharged', 19, 0);
    a.chain('Admissions', 'Waiting beds', 'Ward', 'Discharged');
    a.chart('Epidemic', ['City.Susceptible', 'City.Infected', 'City.Recovered']); a.chart('Hospital', ['Ward.contents', 'Waiting beds.length']);
  })),
  S('hybridWarehouse', 'agents', 'tplSupply', ['하이브리드: SD 수요 → 창고 출고', 'SD 주간 수요가 주문 도착률을 정하고 SD가 미출고 잔량을 계산'], ['Hybrid: SD demand → warehouse', 'Weekly SD demand sets order arrivals; SD tracks the shipping backlog'], () => build('Hybrid warehouse', { timeUnit: 'h', duration: 336, sdDt: 0.5 }, (a) => {
    a.add('lookup', 'Weekday', -18, -10, { input: 't % 168', xs: '0, 24, 48, 72, 96, 120, 144, 168', ys: '6, 9, 8, 8, 10, 5, 2, 6' });
    a.add('variable', 'OrderRate', -10, -10, { equation: 'Weekday' }); a.add('source', 'Orders', -18, 0, { arrivalMode: 'rate', rate: 'OrderRate', shape: 'carton' });
    a.add('queue', 'Order pool', -12, 0); a.add('resourcePool', 'Pickers', -4, -8, { capacity: 4 }); a.add('pickStation', 'Pick', -4, 0, { capacity: 4, pool: 'Pickers', time: tri(0.2, 0.35, 0.6) });
    a.add('packStation', 'Pack', 3, 0, { capacity: 2, time: tri(0.1, 0.2, 0.3) }); a.add('sink', 'Shipped', 9, 0);
    a.add('stock', 'Backlog', 12, -10, { initial: '0' }); a.add('flow', 'Ordered', 6, -10, { equation: 'OrderRate' }); a.add('flow', 'Done', 18, -10, { equation: 'min(Backlog, Pack.busy / 0.2 + 0.0001)' });
    a.chain('Orders', 'Order pool', 'Pick', 'Pack', 'Shipped'); a.link('Ordered', 'Backlog'); a.link('Backlog', 'Done');
    a.influence('Weekday', 'OrderRate'); a.influence('OrderRate', 'Orders'); a.influence('OrderRate', 'Ordered');
    a.chart('Demand', ['OrderRate', 'Order pool.length']); a.chart('Backlog', ['Backlog']);
  })),
];

export function buildSample(id) {
  const s = SAMPLE_PROJECTS.find((x) => x.id === id);
  if (!s) return null;
  const m = s.make();
  m.description = s.en[1];
  return m;
}
