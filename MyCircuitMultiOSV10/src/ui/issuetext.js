// Localises ERC/DRC messages for display. The engines produce plain English
// sentences (handy in tests and logs); the UI rewrites them with these
// ordered patterns when Korean is selected. $1… are the captured parts.

import { getLanguage } from "./i18n.js";

const WORDS = { track: "트랙", via: "비아", zone: "영역" };
const w = (s) => s.replace(/\bpad (\S+)/g, "패드 $1").replace(/^(track|via|zone)$/, (m) => WORDS[m]).replace(/\(no net\)/g, "(넷 없음)");

const KO_PATTERNS = [
  // ERC
  [/^Sheet "(.*)" points to a page that does not exist$/, m => `시트 "${m[1]}"이(가) 가리키는 페이지가 없습니다`],
  [/^Hierarchical label "(.*)" has no matching sheet pin$/, m => `계층 레이블 "${m[1]}"에 맞는 시트 핀이 없습니다`],
  [/^Unknown symbol "(.*)"$/, m => `알 수 없는 심볼 "${m[1]}"`],
  [/^(.*) is not annotated$/, m => `${m[1]}에 참조 번호가 없습니다 (참조 번호 부여 실행)`],
  [/^Duplicate reference (.*)$/, m => `참조 번호 ${m[1]}이(가) 중복됩니다`],
  [/^(.*) has no footprint assigned$/, m => `${m[1]}에 풋프린트가 지정되지 않았습니다`],
  [/^Outputs (.*) drive the same net (.*)$/, m => `출력 핀 ${m[1]}이(가) 같은 넷 ${m[2]}을(를) 구동합니다`],
  [/^Power input (\S+) \((.*)\) on net (.*) is not driven by any power output \(add a PWR_FLAG\)$/, m => `전원 입력 ${m[1]} (${m[2]}, 넷 ${m[3]})을 구동하는 전원 출력이 없습니다 — PWR_FLAG를 추가하세요`],
  [/^Pin (\S+) \((.*)\) is not connected$/, m => `핀 ${m[1]} (${m[2]})이(가) 연결되지 않았습니다`],
  [/^Pin (\S+) has a no-connect flag but is connected$/, m => `핀 ${m[1]}에 연결 없음 플래그가 있지만 연결되어 있습니다`],
  [/^Net (.*) has only input pins$/, m => `넷 ${m[1]}에 입력 핀만 있습니다 (구동원이 없음)`],
  [/^Wire end is not connected to anything$/, () => `배선 끝이 아무 것에도 연결되지 않았습니다`],
  [/^Label "(.*)" is only used once$/, m => `레이블 "${m[1]}"이(가) 한 번만 사용되었습니다`],
  [/^No-connect flag is not on a pin$/, () => `연결 없음 플래그가 핀 위에 있지 않습니다`],
  // DRC
  [/^(.*): footprint "(.*)" not found in the library$/, m => `${m[1]}: 라이브러리에 풋프린트 "${m[2]}"이(가) 없습니다`],
  [/^Board outline needs at least 3 points$/, () => `기판 외곽선에는 점이 3개 이상 필요합니다`],
  [/^Board outline has an invalid point$/, () => `기판 외곽선에 잘못된 점이 있습니다`],
  [/^Board outline has zero area$/, () => `기판 외곽선의 면적이 0입니다`],
  [/^Board outline crosses itself$/, () => `기판 외곽선이 스스로 교차합니다`],
  [/^(.*): footprint is outside the board outline$/, m => `${m[1]}: 풋프린트가 기판 외곽선 밖에 있습니다`],
  [/^(.*): footprint is not fully inside the board outline$/, m => `${m[1]}: 풋프린트가 기판 외곽선 안에 완전히 들어 있지 않습니다`],
  [/^Courtyards of (.*) and (.*) overlap$/, m => `${m[1]}과(와) ${m[2]}의 코트야드가 겹칩니다`],
  [/^Track width (.*) mm < minimum (.*) mm$/, m => `트랙 폭 ${m[1]} mm < 최소 ${m[2]} mm`],
  [/^Via drill (.*) mm < minimum (.*) mm$/, m => `비아 드릴 ${m[1]} mm < 최소 ${m[2]} mm`],
  [/^Via annular ring (.*) mm < (.*) mm$/, m => `비아 애뉼러 링 ${m[1]} mm < ${m[2]} mm`],
  [/^Pad (\S+) drill (.*) mm < minimum (.*) mm$/, m => `패드 ${m[1]} 드릴 ${m[2]} mm < 최소 ${m[3]} mm`],
  [/^Pad (\S+) annular ring (.*) mm < (.*) mm$/, m => `패드 ${m[1]} 애뉼러 링 ${m[2]} mm < ${m[3]} mm`],
  [/^Hole spacing (.*) mm < (.*) mm \((.*) \/ (.*)\)$/, m => `홀 간격 ${m[1]} mm < ${m[2]} mm (${m[3]} / ${m[4]})`],
  [/^Unnetted (\w+) touches (.*) of net (.*)$/, m => `넷이 없는 ${w(m[1])}이(가) 넷 ${m[3]}의 ${w(m[2])}에 닿아 있습니다`],
  [/^Short between (.*) and (.*) \((.*) \/ (.*)\)$/, m => `${w(m[1])}과(와) ${w(m[2])} 사이 단락 (${w(m[3])} / ${w(m[4])})`],
  [/^Clearance (.*) mm < (.*) mm between (.*) and (.*) \((.*) \/ (.*)\)$/, m => `간격 ${m[1]} mm < ${m[2]} mm: ${w(m[3])} ↔ ${w(m[4])} (${w(m[5])} / ${w(m[6])})`],
  [/^Zones (.*) and (.*) overlap on (.*) with equal priority$/, m => `${m[3]}에서 같은 우선순위의 영역 ${w(m[1])}과(와) ${w(m[2])}이(가) 겹칩니다`],
  [/^(.*) is outside the board outline$/, m => `${w(m[1])}이(가) 기판 외곽선 밖에 있습니다`],
  [/^(.*) is (.*) mm from the board edge \(< (.*) mm\)$/, m => `${w(m[1])}이(가) 기판 가장자리에서 ${m[2]} mm 떨어져 있습니다 (< ${m[3]} mm)`],
  [/^Dangling track end \((.*)\)$/, m => `연결되지 않은 트랙 끝 (${w(m[1])})`],
  [/^Silkscreen over pad (.*)$/, m => `실크스크린이 패드 ${m[1]} 위에 있습니다`],
  [/^Unconnected net (.*)$/, m => `연결되지 않은 넷 ${m[1]}`],
];

export function issueText(message) {
  if (getLanguage() !== "ko") return message;
  for (const [re, fn] of KO_PATTERNS) {
    const m = re.exec(message);
    if (m) return fn(m);
  }
  return message;
}

export { KO_PATTERNS };
