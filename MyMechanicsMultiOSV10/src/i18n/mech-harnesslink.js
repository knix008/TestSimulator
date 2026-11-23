// Texts of the schematic ↔ 3D harness link (cad/harness-link.js, app-schematic.js, the harness route). { key: [Korean, English] }.
const T = {
  'sch.h.title': ['3D 하네스 연결', '3D harness link'],
  'sch.h.none': ['프로젝트에 하네스 경로가 없습니다. 부품에 하네스 경로를 만들고 커넥터 이름을 회로도의 태그(X1, M1 …)와 같게 하세요.', 'There is no harness route in the project. Make one in a part and name its connectors like the tags of the schematic (X1, M1 …).'],
  'sch.h.inSync': ['회로도와 하네스가 일치합니다.', 'The schematic and the harness match.'],
  'sch.h.outOfSync': ['차이: 하네스에 없는 선 {missing} · 회로도에 없는 선 {extra} · 다른 속성 {changed}', 'Differences: {missing} not in the harness · {extra} not in the schematic · {changed} changed'],
  'sch.h.missing': ['{wire} ({pins}) 이(가) 하네스에 없습니다', '{wire} ({pins}) is not in the harness'],
  'sch.h.extra': ['하네스의 {wire} ({pins}) 이(가) 회로도에 없습니다', 'Harness wire {wire} ({pins}) is not in the schematic'],
  'sch.h.changed.color': ['{wire}: 색 회로도 {schematic} · 하네스 {harness}', '{wire}: colour {schematic} in the schematic, {harness} in the harness'],
  'sch.h.changed.gauge': ['{wire}: 단면적 회로도 {schematic} mm² · 하네스 {harness} mm²', '{wire}: size {schematic} mm² in the schematic, {harness} mm² in the harness'],
  'sch.h.issue.no-connector': ['커넥터 {tag} 이(가) 하네스에 없어 그 선은 빠집니다', 'Connector {tag} is not in the harness: its wires are left out'],
  'sch.h.issue.pin-range': ['{tag} 핀 {pin}: 하네스 커넥터의 핀은 {pins}개뿐입니다', '{tag} pin {pin}: the harness connector has only {pins} pins'],
  'sch.h.issue.splice': ['네트 {net} 이(가) 핀 {pins} 을(를) 잇습니다. 스플라이스가 필요해 처음 두 핀만 연결합니다', 'Net {net} joins {pins}: it needs a splice, so only the first two pins get a wire'],
  'sch.h.issue.colour': ['네트 {net}: 색 "{value}" 을(를) 알 수 없어 검정(BK)으로 둡니다', 'Net {net}: colour "{value}" is not known; black (BK) is used'],
  'sch.h.issue.size': ['네트 {net}: 단면적 "{value}" 을(를) 알 수 없어 0.5 mm² 로 둡니다', 'Net {net}: size "{value}" is not known; 0.5 mm² is used'],
  'sch.h.send': ['하네스로 보내기', 'Send to harness'],
  'sch.h.getLengths': ['하네스 길이 가져오기', 'Lengths from harness'],
  'sch.h.sent': ['선 {count}개를 "{name}" 하네스에 넣었습니다 (경고 {issues}).', '{count} wires sent to the harness of "{name}" ({issues} warnings).'],
  'sch.h.lengths': ['네트 {count}개에 3D 배선 길이를 적었습니다. 결선표(CSV)에도 나옵니다.', 'Routed 3D lengths written on {count} nets; the from–to list (CSV) shows them.'],
  'sch.h.hasLengths': ['3D 길이가 있는 회로도 선: {count}', 'Schematic wires with a 3D length: {count}'],
  'sch.h.wireLength': ['3D 길이 {length} mm (하네스 선 {wire})', '3D length {length} mm (harness wire {wire})'],
  'sch.h.rule': ['태그가 하네스 커넥터 이름과 같은 기호가 하네스의 끝점입니다. 핀은 기호의 핀 순서대로(커넥터는 번호대로) 대응합니다. 그런 핀 둘을 잇는 네트마다 하네스 선 하나가 되고, 선 번호·색·단면적은 회로도에서 옵니다. 클립 경유는 하네스 쪽 설정이 유지됩니다.', 'A symbol whose tag is the name of a harness connector is an end of the harness; its pins map in the symbol\'s pin order (connectors by number). Each net joining two such pins is one harness wire, with the wire number, colour and size from the schematic. The clips a wire passes stay as set in the harness.'],
  'op.schHarness': ['회로도 → 하네스', 'Schematic to harness'],
  'op.schLengths': ['하네스 길이 → 회로도', 'Harness lengths to schematic'],
  'harness.fromSchematic': ['회로도에서 가져오기', 'Wires from schematic'],
  'harness.noSchematicWires': ['이 하네스의 커넥터 이름과 같은 태그를 잇는 회로도 선이 없습니다.', 'No schematic connects tags named like this harness\'s connectors.'],
  'harness.fromSchematicDone': ['회로도 "{name}" 에서 선 {count}개를 가져왔습니다 (경고 {issues}).', '{count} wires taken from schematic "{name}" ({issues} warnings).'],
};

export const ko = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[0]]));
export const en = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[1]]));
