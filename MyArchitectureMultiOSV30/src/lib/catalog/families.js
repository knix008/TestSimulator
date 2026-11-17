// Families of products the smaller library categories were short of: the same product in the sizes and finishes
// it is sold in (lift cars by capacity, escalators by step width and rise, cars by colour, waiting-room benches by
// seats …), people in many roles and outfits, healthcare and gym equipment, shop fittings, and basic shapes and
// site props. Each entry has its Korean name in FAMILY_KO (i18n-ko.js uses it).
import { B, C, S, L, E, T, R, SB, item, cabinet, table, figure, four, smoothProfile } from "./common.js";
import { car, mover } from "./transport.js";

export const FAMILY_KO = {};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The families, made from the catalogue's own products (byKind) where they are variants of one. */
export function familyItems(byKind) {
  const out = [];
  const add = (e, ko) => { out.push(e); FAMILY_KO[e.name] = ko; return e; };
  // A variant of a catalogue product: [suffix en, suffix ko, changes].
  const vary = (base, baseKo, list, cat) => {
    const b = byKind.get(base);
    if (!b) throw new Error(`family of unknown kind ${base}`);
    for (const [en, ko, over] of list) add({ ...b, ...(cat ? { cat } : {}), kind: `${base}V-${slug(en)}`, name: `${b.name}, ${en}`, ...over, variantOf: base }, `${baseKo}, ${ko}`);
  };
  const colours = (list) => list.map(([c, en, ko]) => [en, ko, { color: c }]);
  const COL = {
    white: ["white", "white", "흰색"], black: ["black", "black", "검정"], silver: ["steel", "silver", "은색"], blue: ["blue", "blue", "파랑"],
    red: ["red", "red", "빨강"], grey: ["grey", "grey", "회색"], green: ["sage", "green", "초록"], navy: ["navy", "navy", "남색"],
    yellow: ["yellow", "yellow", "노랑"], orange: ["orange", "orange", "주황"], cream: ["cream", "cream", "크림색"], teal: ["teal", "teal", "청록"],
    terracotta: ["terracotta", "terracotta", "테라코타"], charcoal: ["charcoal", "charcoal", "차콜"], walnut: ["walnut", "walnut", "월넛"],
    oak: ["oak", "oak", "오크"], blush: ["blush", "blush pink", "연분홍"], mustard: ["mustard", "mustard", "머스터드"], brass: ["brass", "brass", "황동"],
    leather: ["leather", "brown leather", "갈색 가죽"], chrome: ["chrome", "chrome", "크롬"], sage: ["sage", "sage", "세이지"],
  };
  const cols = (...names) => colours(names.map((n) => COL[n]));

  // ---------------------------------------------------------------- people: roles in three outfits each
  {
    const P = "People";
    // Things people carry or wear, in the figure's frame (k = height / 1750).
    const acc = {
      helmet: (h, k, c) => [S(0, -5 * k, h - 95 * k, 125 * k, c, { sz: 0.75 }), B(0, 95 * k, h - 120 * k, 200 * k, 60 * k, 12 * k, c, 6)],
      cap: (h, k, c) => [C(0, -5 * k, h - 90 * k, 112 * k, 55 * k, c), B(0, 110 * k, h - 90 * k, 190 * k, 110 * k, 10 * k, c, 20)],
      chefHat: (h, k) => [C(0, -5 * k, h - 60 * k, 100 * k, 200 * k, "white", 100 * k, { top: 1.25 })],
      coat: (h, k, c) => [C(0, 0, 0.53 * h - 420 * k, 190 * k, 460 * k, c, 135 * k, { top: 0.85 })],
      apron: (h, k, c) => [B(0, 100 * k, 0.53 * h - 420 * k, 300 * k, 12 * k, 560 * k, c, 4, { plan: false })],
      vest: (h, k, c) => [B(0, 0, 0.53 * h + 60 * k, 330 * k, 215 * k, 380 * k, c, 40, { plan: false })],
      shorts: (h, k, c) => [B(0, 0, 0.53 * h - 230 * k, 340 * k, 210 * k, 270 * k, c, 40)],
      backpack: (h, k, c) => [SB(0, -150 * k, 0.53 * h + 60 * k, 300 * k, 150 * k, 400 * k, c, 0.3)],
      bags: (h, k, c) => [-1, 1].flatMap((s) => [B(s * 260 * k, 50 * k, 0.53 * h - 470 * k, 290 * k, 120 * k, 330 * k, s < 0 ? c : "cream", 4, { m: "paper" }), T([[s * 210 * k, 50 * k, 0.53 * h - 140 * k], [s * 205 * k, 45 * k, 0.53 * h - 70 * k], [s * 310 * k, 50 * k, 0.53 * h - 140 * k]], 6 * k, "black")]),
      suitcase: (h, k, c) => [B(300 * k, 160 * k, 60 * k, 380 * k, 230 * k, 560 * k, c, 30, { b: 10 }), T([[300 * k, 160 * k, 620 * k], [260 * k, 90 * k, 0.53 * h - 60 * k]], 10 * k, "black"), ...[-1, 1].map((s) => C(300 * k + s * 140 * k, 160 * k, 0, 30 * k, 60 * k, "black"))],
      umbrella: (h, k, c) => [T([[205 * k, 60 * k, 0.53 * h - 70 * k], [120 * k, 30 * k, h + 250 * k]], 8 * k, "black"), L(120 * k, 30 * k, h + 120 * k, [[520 * k, 0], [360 * k, 110 * k], [0, 160 * k], [0, 150 * k], [355 * k, 100 * k], [515 * k, -6 * k]], c, { seg: 8, plan: false })],
      cane: (h, k) => [T([[230 * k, 150 * k, 0], [210 * k, 60 * k, 0.53 * h - 70 * k], [260 * k, 60 * k, 0.53 * h - 40 * k]], 11 * k, "darkwood")],
      phone: (h, k) => [B(150 * k, 40 * k, h - 230 * k, 40 * k, 10 * k, 80 * k, "black", 4, { plan: false })],
      clipboard: (h, k) => [B(-120 * k, 160 * k, 0.53 * h + 60 * k, 230 * k, 12 * k, 310 * k, "oak", 4), B(-120 * k, 168 * k, 0.53 * h + 80 * k, 200 * k, 2 * k, 260 * k, "paper", 0, { plan: false })],
      tray: (h, k) => [C(230 * k, 120 * k, 0.53 * h + 120 * k, 180 * k, 12 * k, "steel"), C(260 * k, 120 * k, 0.53 * h + 132 * k, 35 * k, 110 * k, "glass")],
      laptopBag: (h, k, c) => [B(-260 * k, 40 * k, 0.53 * h - 260 * k, 90 * k, 380 * k, 290 * k, c, 20), T([[-230 * k, 40 * k, 0.53 * h + 30 * k], [-120 * k, 0, 0.82 * h]], 8 * k, "black")],
      toolbelt: (h, k) => [B(0, 0, 0.53 * h - 40 * k, 360 * k, 230 * k, 70 * k, "leather", 10)],
      stethoscope: (h, k) => [T([[-70 * k, 95 * k, 0.82 * h - 30 * k], [0, 115 * k, 0.53 * h + 180 * k], [70 * k, 95 * k, 0.82 * h - 30 * k]], 6 * k, "black", { smooth: true, plan: false })],
      ball: (h, k) => [S(260 * k, 80 * k, 0.53 * h - 40 * k, 110 * k, "orange")],
      book: (h, k) => [B(-200 * k, 140 * k, 0.53 * h + 40 * k, 160 * k, 40 * k, 230 * k, "book2", 4)],
      flowers: (h, k) => [T([[150 * k, 140 * k, 0.53 * h], [150 * k, 160 * k, 0.53 * h + 300 * k]], 8 * k, "leaf"), S(150 * k, 160 * k, 0.53 * h + 340 * k, 90 * k, "flower")],
      camera: (h, k) => [B(0, 150 * k, 0.53 * h + 220 * k, 140 * k, 80 * k, 90 * k, "black", 10, { plan: false })],
    };
    // [kind, en, ko, height, figure options (top colour from the outfit), accessory names, outfits [colour key, en, ko]]
    const ROLES = [
      ["man", "Man standing", "서 있는 남자", 1780, { pants: "charcoal" }, [], ["navy", "grey", "terracotta"]],
      ["woman", "Woman standing", "서 있는 여자", 1650, { pants: "cream", longHair: true, hair: "darkwood" }, [], ["teal", "blush", "mustard"]],
      ["dress", "Woman in a dress", "원피스 입은 여자", 1680, { pants: "skin", longHair: true, skirtTop: true }, [], ["navy", "red", "sage"]],
      ["suit", "Man in a suit", "정장 입은 남자", 1800, { suit: true, shoes: "black" }, ["laptopBag"], ["charcoal", "navy", "grey"]],
      ["suitW", "Woman in a suit", "정장 입은 여자", 1690, { suit: true, skirtTop: true, longHair: true, hair: "hair", shoes: "black" }, [], ["charcoal", "navy", "cream"]],
      ["teen", "Teenage boy", "십대 남학생", 1650, { pants: "navy", hair: "hair" }, ["phone"], ["red", "white", "mustard"]],
      ["child", "Child", "어린이", 1200, { pants: "navy", hair: "tan" }, [], ["yellow", "red", "teal"]],
      ["toddler", "Small child", "유아", 950, { pants: "cream", hair: "tan" }, [], ["blush", "blue", "sage"]],
      ["kidBall", "Child with a ball", "공을 든 어린이", 1250, { pants: "charcoal", hair: "hair" }, ["ball"], ["blue", "white", "orange"]],
      ["elderM", "Older man with a cane", "지팡이 짚은 노인 남성", 1700, { pants: "grey", hair: "offwhite" }, ["cane"], ["oak", "navy", "sage"]],
      ["elderW", "Older woman", "노인 여성", 1580, { pants: "charcoal", hair: "offwhite" }, ["bags"], ["blush", "cream", "terracotta"]],
      ["doctor", "Doctor in a white coat", "흰 가운 입은 의사", 1760, { top: "white", sleeves: "white" }, ["coat:white", "stethoscope", "clipboard"], ["navy", "charcoal", "teal"]],
      ["nurse", "Nurse in scrubs", "간호사", 1660, { scrubs: true, hair: "hair" }, ["stethoscope"], ["teal", "blue", "sage"]],
      ["surgeon", "Surgeon", "외과 의사", 1740, { scrubs: true }, ["cap:sage"], ["sage", "blue", "teal"]],
      ["chef", "Chef", "요리사", 1750, { top: "white", sleeves: "white" }, ["chefHat", "apron:white"], ["charcoal", "black", "grey"]],
      ["waiter", "Waiter with a tray", "쟁반 든 웨이터", 1760, { top: "white", sleeves: "white", shoes: "black" }, ["apron:black", "tray"], ["black", "charcoal", "navy"]],
      ["barista", "Barista", "바리스타", 1700, { pants: "black" }, ["apron:leather"], ["white", "grey", "black"]],
      ["worker", "Construction worker", "건설 작업자", 1780, { pants: "navy", shoes: "leather" }, ["helmet:yellow", "vest:orange", "toolbelt"], ["grey", "blue", "white"]],
      ["engineer", "Site engineer", "현장 기술자", 1760, { pants: "charcoal" }, ["helmet:white", "vest:yellow", "clipboard"], ["blue", "white", "grey"]],
      ["police", "Police officer", "경찰관", 1790, { suit: true, shoes: "black" }, ["cap:navy", "vest:yellow"], ["navy", "charcoal", "black"]],
      ["guard", "Security guard", "경비원", 1780, { suit: true, shoes: "black" }, ["cap:black"], ["black", "navy", "charcoal"]],
      ["student", "Student with a backpack", "책가방 멘 학생", 1640, { pants: "navy", hair: "hair" }, ["backpack:red", "book"], ["white", "sage", "mustard"]],
      ["teacher", "Teacher with a book", "책을 든 선생님", 1700, { pants: "charcoal", longHair: true, hair: "darkwood" }, ["book"], ["cream", "sage", "blush"]],
      ["jogger", "Man jogging", "조깅하는 남자", 1760, { pants: "skin", sleeves: "skin", shoes: "white" }, ["shorts:black"], ["orange", "blue", "red"]],
      ["shopper", "Shopper with bags", "쇼핑백 든 사람", 1680, { pants: "navy", longHair: true, hair: "darkwood" }, ["bags"], ["terracotta", "white", "teal"]],
      ["traveller", "Traveller with a suitcase", "여행 가방 든 여행자", 1750, { pants: "tan" }, ["suitcase:charcoal", "backpack:sage"], ["navy", "white", "mustard"]],
      ["umbrella", "Person with an umbrella", "우산 쓴 사람", 1720, { pants: "charcoal" }, ["umbrella"], ["navy", "red", "yellow"]],
      ["phone", "Person on the phone", "전화하는 사람", 1740, { pants: "charcoal" }, ["phone"], ["white", "grey", "blush"]],
      ["tourist", "Tourist with a camera", "카메라 든 관광객", 1720, { pants: "tan" }, ["camera", "cap:white"], ["red", "teal", "white"]],
      ["florist", "Person with flowers", "꽃다발 든 사람", 1680, { pants: "cream", longHair: true, hair: "tan" }, ["flowers"], ["sage", "blush", "white"]],
      ["girl", "Girl", "여자아이", 1250, { pants: "skin", skirtTop: true, longHair: true, hair: "tan" }, [], ["blush", "yellow", "teal"]],
      ["boy", "Boy", "남자아이", 1300, { pants: "navy", hair: "hair" }, ["backpack:blue"], ["red", "white", "sage"]],
      ["teenGirl", "Teenage girl", "십대 여학생", 1600, { pants: "navy", longHair: true, hair: "darkwood" }, ["phone"], ["white", "blush", "mustard"]],
      ["elderW2", "Older woman with a cane", "지팡이 짚은 노인 여성", 1560, { pants: "skin", skirtTop: true, hair: "offwhite" }, ["cane"], ["cream", "navy", "sage"]],
      ["elderM2", "Older man", "노인 남성", 1690, { pants: "tan", hair: "offwhite" }, ["cap:charcoal"], ["grey", "oak", "navy"]],
      ["doctorW", "Woman doctor", "여자 의사", 1660, { top: "white", sleeves: "white", longHair: true, hair: "hair" }, ["coat:white", "stethoscope"], ["navy", "sage", "charcoal"]],
      ["workerW", "Woman construction worker", "여성 건설 작업자", 1660, { pants: "navy", longHair: true, hair: "tan", shoes: "leather" }, ["helmet:white", "vest:orange"], ["grey", "blue", "white"]],
      ["policeW", "Woman police officer", "여자 경찰관", 1680, { suit: true, shoes: "black", longHair: true, hair: "hair" }, ["cap:navy"], ["navy", "charcoal", "black"]],
      ["mother", "Woman with a handbag", "핸드백 든 여자", 1660, { pants: "charcoal", longHair: true, hair: "hair" }, ["laptopBag:leather"], ["red", "cream", "navy"]],
      ["runnerW", "Woman jogging", "조깅하는 여자", 1650, { pants: "skin", sleeves: "skin", shoes: "white", longHair: true, hair: "tan" }, ["shorts:black"], ["blush", "teal", "yellow"]],
    ];
    const OUTFIT_KO = { navy: "남색 옷", grey: "회색 옷", terracotta: "테라코타 옷", teal: "청록 옷", blush: "분홍 옷", mustard: "겨자색 옷", red: "빨간 옷", sage: "초록 옷", charcoal: "차콜 옷", cream: "크림색 옷", white: "흰 옷", yellow: "노란 옷", blue: "파란 옷", orange: "주황 옷", oak: "베이지 옷", black: "검은 옷" };
    const OUTFIT_EN = { oak: "beige" };
    ROLES.forEach(([kind, en, ko, height, o, accs, outfits]) => outfits.forEach((c, i) => {
      const skin = i === 1 ? "skin2" : "skin";
      const k = height / 1750;
      const fo = { ...o, skin, top: o.top || c, sleeves: o.sleeves === "skin" ? skin : o.sleeves || (o.suit ? c : o.top || c) };
      if (o.suit) fo.pants = c;
      if (o.scrubs) fo.pants = c, fo.sleeves = skin;
      if (o.skirtTop) fo.skirt = c;
      if (o.pants === "skin") fo.pants = skin;
      const parts = (w, d, hh) => {
        const kk = hh / height, out = figure(hh, fo);
        for (const a of accs) { const [n, col] = a.split(":"); out.push(...acc[n](hh, k * kk, col || c)); }
        return out;
      };
      const wide = accs.some((a) => /bags|suitcase|umbrella|cane|ball|tray/.test(a));
      const cName = OUTFIT_EN[c] || c;
      add(item(`person-${kind}-${i + 1}`, P, `${en} (${cName})`, Math.round((wide ? 760 : 520) * k), Math.round((wide ? 420 : 320) * k), Math.round(height + (accs.some((a) => /umbrella/.test(a)) ? 280 * k : 0)), c, parts, { tags: "figure scale person people" }),
        `${ko} (${OUTFIT_KO[c] || c})`);
    }));
  }

  // ---------------------------------------------------------------- lifts and escalators
  {
    const LC = "Lifts & escalators";
    const CAPS = [[6, 1100, 1250], [8, 1400, 1250], [9, 1400, 1350], [11, 1600, 1350], [13, 1600, 1500], [15, 1800, 1500], [17, 2000, 1500], [20, 2000, 1750], [24, 2150, 1600]];
    const FIN = [["stainless steel", "스테인리스", { wall: "steel", floor: "granite" }], ["mirror", "거울 마감", { wall: "mirror", floor: "marble" }], ["wood panels", "목재 패널", { wall: "oak", floor: "granite", bumpers: [900], bumperC: "walnut" }], ["white", "흰색 패널", { wall: "white", floor: "terrazzo" }]];
    for (const [n, w, d] of CAPS) for (const [fen, fko, fo] of FIN) {
      add(item(`liftCar-${n}-${slug(fen)}`, LC, `Elevator car (${n} persons), ${fen}`, w, d, 2300, fo.wall, (ww, dd, hh) => [...car(ww, dd, hh, { ...fo, wall: "main" }), B(0, -dd / 2 + 32, 900, ww * 0.6, 4, 1100, "mirror", 0, { plan: false })], { tags: "lift elevator passenger" }),
        `엘리베이터 카 (${n}인승), ${fko}`);
    }
    for (const [w, d, fen, fko, floor] of [[1300, 1300, "small", "소형", "marble"], [1500, 1500, "medium", "중형", "granite"], [1800, 1800, "large", "대형", "marble"], [1500, 1500, "bronze frame", "브론즈 프레임", "terrazzo"], [1600, 1400, "half-glass", "반유리", "granite"], [2000, 1600, "wide", "넓은", "marble"]]) {
      const half = /half/.test(fen), wall = /bronze/.test(fen) ? "brass" : "steel";
      add(item(`liftGlass-${slug(fen)}`, LC, `Panoramic glass elevator, ${fen}`, w, d, 2400, wall, (ww, dd, hh) => car(ww, dd, hh, { glassBack: true, glassSides: !half, floor, rail: 950 }), { tags: "lift elevator glass panoramic" }), `전망용 유리 엘리베이터, ${fko}`);
    }
    for (const [w, d, en, ko] of [[1500, 2500, "compact", "소형"], [1800, 2900, "large", "대형"], [1400, 2400, "with a stretcher size", "들것용"]]) add(item(`liftBed-${slug(en)}`, LC, `Bed elevator, ${en}`, w, d, 2300, "steel", (ww, dd, hh) => car(ww, dd, hh, { floor: "concrete", floorM: "matte", sideRails: true, bumpers: [250], bumperC: "grey" }), { tags: "lift elevator hospital stretcher bed" }), `침대용 엘리베이터, ${ko}`);
    for (const [w, d, en, ko] of [[2000, 2500, "2 tonnes", "2톤"], [2700, 3200, "4 tonnes", "4톤"], [3000, 3800, "5 tonnes", "5톤"]]) add(item(`liftFreight-${slug(en)}`, LC, `Freight elevator, ${en}`, w, d, 2600, "steel", (ww, dd, hh) => car(ww, dd, hh, { floor: "steel", rail: 0, bumpers: [200, 800, 1400], bumperC: "oak" }), { tags: "lift elevator goods service freight" }), `화물용 엘리베이터, ${ko}`);
    for (const [c, en, ko] of [["white", "white", "흰색"], ["walnut", "walnut", "월넛"], ["steel", "glass and steel", "유리와 스틸"]]) add(item(`liftHome-${slug(en)}`, LC, `Home elevator, ${en}`, 1000, 1250, 2200, c, (ww, dd, hh) => car(ww, dd, hh, { floor: "oak", rail: 900, glassSides: c === "steel" }), { tags: "lift elevator home residential" }), `가정용 엘리베이터, ${ko}`);
    for (const [step, w] of [[600, 1000], [800, 1200], [1000, 1400]]) for (const rise of [3500, 4500, 5000, 6000]) for (const glass of [false, true]) {
      const d = Math.round(rise * 1.732 + 2600);
      add(item(`escalator-${step}-${rise}${glass ? "-glass" : ""}`, LC, `Escalator, ${step} step, rise ${(rise / 1000).toFixed(1)} m${glass ? ", glass balustrade" : ""}`, w, d, rise + 1000, "steel", (ww, dd, hh) => mover(0, ww, dd, Math.max(0, hh - 1000), { steps: true, glass }), { tags: "escalator moving stairs mall station" }),
        `에스컬레이터, 디딤판 ${step}, 층고 ${(rise / 1000).toFixed(1)} m${glass ? ", 유리 난간" : ""}`);
    }
    for (const len of [10000, 15000, 30000, 50000]) add(item(`walkway-${len}`, LC, `Moving walkway, ${len / 1000} m`, 1600, len, 1100, "steel", (ww, dd) => mover(0, ww, dd, 0, { glass: true, land: 1500 }), { tags: "travelator airport conveyor" }), `무빙워크, ${len / 1000} m`);
    for (const rise of [3000, 5000]) add(item(`rampWalk-${rise}`, LC, `Inclined moving walkway, rise ${rise / 1000} m`, 1600, Math.round(rise / Math.tan((12 * Math.PI) / 180) + 3000), rise + 1000, "steel", (ww, dd, hh) => mover(0, ww, dd, Math.max(0, hh - 1000), { glass: true, land: 1500 }), { tags: "travelator ramp supermarket incline" }), `경사형 무빙워크, 층고 ${rise / 1000} m`);
  }

  // ---------------------------------------------------------------- vehicles: each body in six more colours
  {
    const BASES = [["car", "세단", "red"], ["carHatch", "소형 해치백", "blue"], ["carSUV", "SUV", "charcoal"], ["carCoupe", "스포츠 쿠페", "orange"], ["carRoadster", "오픈카 (로드스터)", "red"], ["carMinivan", "미니밴", "steel"],
      ["carCity", "소형 전기차", "sage"], ["carPickup", "픽업트럭", "navy"], ["van", "배달용 밴", "white"], ["motorbike", "오토바이", "black"], ["scooter", "스쿠터", "white"]];
    const PALETTE = ["white", "black", "silver", "blue", "red", "grey", "green", "navy", "yellow"];
    for (const [base, ko, own] of BASES) {
      if (!byKind.has(base)) continue;
      const pick = PALETTE.filter((n) => COL[n][0] !== own && !(own === "steel" && n === "silver")).slice(0, 6);
      vary(base, ko, cols(...pick));
    }
  }

  // ---------------------------------------------------------------- healthcare
  {
    const H = "Healthcare";
    vary("hospitalBed", "병원 침대", [["ICU", "중환자실용", { w: 1100, d: 2300 }], ["paediatric", "소아용", { w: 850, d: 1700, h: 950 }], ["bariatric", "고도비만 환자용", { w: 1300, d: 2300 }], ["low", "저상형", { h: 800 }], ...cols("blue", "sage", "oak")]);
    vary("examTable", "진찰대", [...cols("navy", "sage", "black", "cream", "terracotta"), ["wide", "넓은", { w: 800 }]]);
    vary("dentalChair", "치과 의자", cols("blue", "cream", "navy", "terracotta", "grey"));
    vary("waitingChairs", "대기실 의자 (3인)", cols("navy", "terracotta", "sage"));
    for (const [n, w] of [[2, 1200], [4, 2400], [5, 3000]]) for (const c of ["fabric", "navy", "terracotta", "sage"]) {
      const b = byKind.get("waitingChairs");
      const cen = c === "fabric" ? "blue-grey" : COL[c][1], cko = c === "fabric" ? "청회색" : COL[c][2];
      add({ ...b, kind: `waitingChairs-${n}-${c}`, name: `Waiting chairs (row of ${n}), ${cen}`, w, color: c, variantOf: "waitingChairs" }, `대기실 의자 (${n}인), ${cko}`);
    }
    vary("medCabinet", "의료용 수납장", [["narrow", "좁은", { w: 600 }], ["wide", "넓은", { w: 1200 }], ["narrow, grey", "좁은, 회색", { w: 600, color: "grey" }], ["wide, grey", "넓은, 회색", { w: 1200, color: "grey" }], ...cols("white")]);
    vary("ivPole", "수액 걸이", cols("white", "chrome"));
    vary("wheelchair", "휠체어", [...cols("blue", "red", "grey", "navy"), ["child size", "어린이용", { w: 550, d: 900, h: 800 }], ["wide", "넓은", { w: 750, d: 1100 }]]);
    vary("patientMonitor", "환자 모니터 (스탠드)", cols("grey"));
    vary("privacyCurtain", "병상 커튼", [["1.8 m", "1.8 m", { w: 1800 }], ["3 m", "3 m", { w: 3000 }], ["3.6 m", "3.6 m", { w: 3600 }], ...cols("blue", "cream", "terracotta")]);
    const tray = (w, d, h, c) => [B(0, d / 2 - 70, 0, w * 0.35, 140, 40, "steel", 10), ...[-1, 1].map((s) => C(s * w * 0.12, d / 2 - 70, 0, 25, 30, "black")), B(0, d / 2 - 70, 40, 60, 60, h - 80, "steel", 6), B(0, 0, h - 40, w, d, 30, c, 10)];
    for (const [c, en, ko] of [["white", "white", "흰색"], ["oak", "oak top", "오크 상판"]]) add(item(`overbedTable-${c}`, H, `Overbed table, ${en}`, 900, 450, 900, c, (w, d, h) => tray(w, d, h, "main"), { tags: "overbed table hospital patient" }), `침상용 식탁, ${ko}`);
    for (const [c, en, ko] of [["white", "white", "흰색"], ["oak", "oak", "오크"], ["sage", "green", "초록"]]) add(item(`bedsideCabinet-${c}`, H, `Hospital bedside cabinet, ${en}`, 500, 480, 850, c, (w, d, h) => [...cabinet(w, d, h, { fronts: "d,D", handles: "bar" }), ...four(w - 60, d - 60, (x, y) => C(x, y, -30, 25, 30, "black"))], { tags: "bedside locker hospital" }), `병원 침대 옆 수납장, ${ko}`);
    for (const [c, en, ko] of [["white", "white", "흰색"], ["blue", "blue", "파랑"], ["red", "red (crash cart)", "빨강 (응급 카트)"]]) add(item(`medTrolley-${c}`, H, `Medication trolley, ${en}`, 750, 500, 1000, c, (w, d, h) => [...cabinet(w, d, h - 100, { fronts: "d,d,d,D", handles: "bar" }).map((p) => ({ ...p, z: p.z + 100 })), ...four(w - 80, d - 80, (x, y) => C(x, y, 0, 45, 100, "black")), B(0, 0, h, w + 40, d + 40, 25, "steel", 10)], { tags: "medicine cart trolley hospital" }), `약품 카트, ${ko}`);
    for (const [c, en, ko] of [["teal", "teal", "청록"], ["navy", "navy", "남색"]]) add(item(`stretcher-${c}`, H, `Stretcher trolley, ${en}`, 700, 2050, 900, c, (w, d, h) => [...four(w - 120, d - 300, (x, y) => C(x, y, 0, 60, 60, "black")), B(0, 0, 60, w - 200, d - 400, 300, "steel", 20), B(0, 0, h - 160, w, d, 60, "steel", 20), SB(0, 0, h - 100, w - 60, d - 60, 100, "main", 0.3), ...[-1, 1].map((s) => T([[s * (w / 2 + 10), -d * 0.3, h - 60], [s * (w / 2 + 10), d * 0.3, h - 60]], 12, "chrome"))], { tags: "stretcher gurney hospital ambulance" }), `환자 이송 침대, ${ko}`);
    for (const [wheels, en, ko] of [[false, "", "고정형"], [true, " with wheels", "바퀴 달린"]]) add(item(`walkingFrame${wheels ? "-wheels" : ""}`, H, `Walking frame${en}`, 600, 500, 850, "steel", (w, d, h) => [...[-1, 1].flatMap((s) => [T([[s * (w / 2 - 20), -d / 2 + 20, 0], [s * (w / 2 - 20), -d / 2 + 40, h]], 14, "main"), T([[s * (w / 2 - 20), d / 2 - 20, 0], [s * (w / 2 - 20), d / 2 - 40, h]], 14, "main"), T([[s * (w / 2 - 20), -d / 2 + 40, h], [s * (w / 2 - 20), d / 2 - 40, h]], 16, "black")]), T([[-w / 2 + 20, -d / 2 + 30, h * 0.6], [w / 2 - 20, -d / 2 + 30, h * 0.6]], 12, "main"), ...(wheels ? [-1, 1].map((s) => C(s * (w / 2 - 20), d / 2 - 20, 0, 60, 40, "black", 60, { ty: 90 })) : [])], { tags: "walker zimmer frame rollator" }), `보행 보조기 (${ko})`);
    add(item("crutches", H, "Crutches (pair)", 400, 200, 1300, "steel", (w, d, h) => [-1, 1].flatMap((s) => [T([[s * 100, 0, 0], [s * 100, 0, h * 0.7]], 12, "main"), T([[s * 100, 0, h * 0.7], [s * 80, -20, h - 40], [s * 120, 20, h - 40], [s * 100, 0, h * 0.7]], 10, "main"), B(s * 100, 0, h - 50, 180, 50, 40, "black", 15), B(s * 100, 0, h * 0.55, 110, 30, 30, "black", 10)]), { tags: "crutches" }), "목발 (한 쌍)");
    for (const [hh, en, ko] of [[900, "small", "소형"], [1500, "large", "대형"]]) add(item(`oxygen-${en}`, H, `Oxygen cylinder on a trolley, ${en}`, 350, 400, hh, "leaf3", (w, d, h) => [B(0, 0, 0, w, d * 0.6, 30, "black", 10), ...[-1, 1].map((s) => C(s * (w / 2 - 30), d * 0.25, 0, 45, 40, "black", 45, { ty: 90 })), C(0, 0, 30, 90, h - 230, "main"), C(0, 0, h - 200, 40, 120, "chrome"), T([[0, -d / 2 + 30, 30], [0, -d / 2 + 30, h - 100]], 12, "steel")], { tags: "oxygen gas tank medical" }), `산소통과 카트, ${ko}`);
    for (const [c, en, ko] of [["white", "white", "흰색"], ["steel", "stainless", "스테인리스"]]) add(item(`examLamp-${c}`, H, `Examination lamp, ${en}`, 600, 600, 1700, c, (w, d, h) => [...Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * Math.PI * 2; return T([[0, 0, 60], [Math.cos(a) * w * 0.4, Math.sin(a) * d * 0.4, 30]], 14, "black"); }), C(0, 0, 60, 18, h * 0.6, "main"), T([[0, 0, h * 0.6], [0, 200, h - 100], [0, 300, h - 150]], 14, "main", { smooth: true }), C(0, 300, h - 220, 110, 80, "main", 110, { top: 0.6 }), C(0, 300, h - 222, 95, 2, "bulb", 95, { plan: false })], { tags: "exam light medical lamp" }), `진료용 조명, ${ko}`);
    for (const [c, en, ko] of [["sage", "green", "초록"], ["blue", "blue", "파랑"], ["cream", "cream", "크림색"]]) add(item(`medScreen-${c}`, H, `Folding privacy screen, ${en}`, 1800, 500, 1750, c, (w, d, h) => [0, 1, 2].flatMap((i) => { const x = -w / 2 + w / 6 + (i * w) / 3, y = i === 1 ? d / 2 - 30 : -d / 2 + 30; return [B(x, y, 100, w / 3 - 30, 20, h - 120, "main", 6, { m: "fabric" }), T([[x - w / 6 + 15, y, 0], [x - w / 6 + 15, y, h]], 12, "steel"), C(x - w / 6 + 15, y, 0, 30, 30, "black")]; }), { tags: "screen partition privacy clinic" }), `접이식 칸막이, ${ko}`);
    for (const [c, en, ko] of [["yellow", "clinical waste", "의료 폐기물"], ["red", "sharps", "주사기 폐기"], ["white", "general", "일반"]]) add(item(`medBin-${c}`, H, `Pedal bin, ${en}`, 400, 400, 650, c, (w, d, h) => [C(0, 0, 0, w / 2, h - 40, "main", d / 2, { top: 1.05, m: "plastic" }), C(0, 0, h - 40, w / 2 + 10, 40, c === "white" ? "steel" : "main", d / 2 + 10), B(0, d / 2, 10, 120, 60, 30, "black", 6)], { tags: "bin waste medical" }), `페달 휴지통, ${ko}`);
    for (const [c, en, ko] of [["navy", "navy", "남색"], ["teal", "teal", "청록"]]) add(item(`drawChair-${c}`, H, `Phlebotomy chair, ${en}`, 800, 900, 1100, c, (w, d, h) => [B(0, 0, 0, w * 0.6, d * 0.6, 60, "steel", 10), C(0, 0, 60, 60, 340, "steel"), SB(0, 0.05 * d, 400, w * 0.65, d * 0.7, 120, "main", 0.25), SB(0, -d / 2 + 90, 500, w * 0.65, 140, h - 520, "main", 0.25, { tx: 10 }), ...[-1, 1].map((s) => SB(s * (w / 2 - 70), 0, 680, 140, d * 0.8, 70, "main", 0.3))], { tags: "blood draw chair clinic" }), `채혈 의자, ${ko}`);
    add(item("bassinetHospital", H, "Hospital bassinet", 500, 900, 950, "white", (w, d, h) => [...four(w - 60, d - 100, (x, y) => C(x, y, 0, 35, 40, "black")), B(0, 0, 40, w - 80, d - 120, 40, "steel", 10), C(0, 0, 80, 25, h - 450, "steel"), B(0, 0, h - 370, w, d, 370, "glass", 20), SB(0, 0, h - 360, w - 40, d - 40, 60, "cream", 0.4)], { tags: "baby cot newborn hospital" }), "신생아 병원 침대");
    add(item("parallelBars", H, "Physiotherapy parallel bars", 900, 3000, 1000, "steel", (w, d, h) => [B(0, 0, 0, w, d, 30, "grey", 6), ...[-1, 1].flatMap((s) => [T([[s * (w / 2 - 60), -d / 2 + 100, h], [s * (w / 2 - 60), d / 2 - 100, h]], 20, "chrome"), ...[-1, 1].map((e) => T([[s * (w / 2 - 60), e * (d / 2 - 100), 30], [s * (w / 2 - 60), e * (d / 2 - 100), h]], 25, "main"))])], { tags: "physio rehabilitation walking bars" }), "재활용 평행봉");
    add(item("heightScale", H, "Medical scale with height rod", 400, 500, 2000, "white", (w, d, h) => [B(0, 0.05 * d, 0, w, d * 0.9, 80, "main", 20), B(0, -d / 2 + 40, 80, 60, 40, h - 80, "steel", 6), B(0, -d / 2 + 90, h - 300, 200, 60, 20, "white", 4), B(0, -d / 2 + 50, 1100, 220, 60, 160, "screen", 10, { plan: false })], { tags: "scale weight height clinic" }), "신장·체중계");
  }

  // ---------------------------------------------------------------- fitness
  {
    const F = "Fitness";
    vary("treadmill", "러닝머신", cols("white", "grey", "red"));
    vary("spinBike", "실내 자전거", cols("black", "blue", "white"));
    vary("rower", "로잉 머신", cols("oak", "white"));
    vary("weightBench", "웨이트 벤치", cols("red", "grey"));
    vary("dumbbellRack", "덤벨 거치대", [["short", "짧은", { w: 1000 }], ["long", "긴", { w: 2000 }], ["extra long", "아주 긴", { w: 2500 }]]);
    vary("kettlebells", "케틀벨", cols("orange", "blue"));
    vary("yogaMat", "요가 매트", cols("blue", "terracotta", "charcoal", "blush", "teal", "mustard"));
    vary("punchingBag", "샌드백", cols("black", "blue", "leather"));
    vary("poolTable", "당구대", [...cols("walnut", "black", "white"), ["7 ft", "7피트", { w: 1120, d: 2240 }], ["9 ft", "9피트", { w: 1550, d: 2840 }]]);
    vary("tableTennis", "탁구대", cols("green", "black"));
    vary("multiGym", "멀티 운동 기구", cols("grey", "red"));
    for (const [r, c, en, ko] of [[275, "blue", "55 cm, blue", "55 cm, 파랑"], [325, "grey", "65 cm, grey", "65 cm, 회색"], [425, "sage", "85 cm, green", "85 cm, 초록"], [375, "blush", "75 cm, pink", "75 cm, 분홍"]]) add(item(`gymBall-${r}`, F, `Exercise ball, ${en}`, r * 2, r * 2, r * 2, c, (w, d, h) => [S(0, 0, h / 2, w / 2, "main", { m: "plastic" })], { tags: "swiss ball gym ball yoga" }), `짐볼, ${ko}`);
    for (const hh of [300, 450, 600]) add(item(`plyoBox-${hh}`, F, `Plyo box, ${hh / 10} cm`, 600, 500, hh, "lightwood", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 10), B(0, 0, h * 0.45, w * 0.4, 4, 90, "black", 40, { plan: false })], { tags: "jump box gym" }), `점프 박스, ${hh / 10} cm`);
    for (const [c, en, ko] of [["black", "black", "검정"], ["red", "red", "빨강"]]) add(item(`squatRack-${c}`, F, `Squat rack, ${en}`, 1300, 1200, 2300, c, (w, d, h) => [...four(w - 100, d - 100, (x, y) => B(x, y, 0, 80, 80, h, "main", 4)), ...[-1, 1].map((s) => B(0, s * (d / 2 - 50), h - 40, w, 80, 40, "main")), T([[-w / 2, -d / 2 + 50, h - 80], [w / 2, -d / 2 + 50, h - 80]], 18, "chrome"), T([[-w / 2 - 300, 0, 1300], [w / 2 + 300, 0, 1300]], 15, "chrome"), ...[-1, 1].map((s) => C(s * (w / 2 + 200), 0, 1300 - 225, 225, 50, "black", 225, { tx: 90 }))], { tags: "power rack barbell gym" }), `스쿼트 랙, ${ko}`);
    add(item("plateTree", F, "Weight plate tree", 600, 600, 1300, "black", (w, d, h) => [B(0, 0, 0, w, d, 40, "main", 10), C(0, 0, 40, 40, h - 40, "main"), ...[300, 650, 1000].flatMap((z, i) => [-1, 1].map((s) => C(s * 150, 0, z - 180 + i * 20, 180 - i * 30, 40, "black", 180 - i * 30, { tx: 90 })))], { tags: "weight plates rack gym" }), "원판 거치대");
    add(item("barbellRack", F, "Barbell rack (5 bars)", 1400, 450, 1100, "black", (w, d, h) => [...[-1, 1].map((s) => B(s * (w / 2 - 40), 0, 0, 80, d, h, "main", 4)), ...Array.from({ length: 5 }, (_, i) => T([[-w / 2, 0, 300 + i * 160], [w / 2, 0, 300 + i * 160]], 14, "chrome"))], { tags: "barbell bars rack gym" }), "바벨 거치대 (5개)");
    for (const [c, en, ko] of [["black", "black", "검정"], ["blue", "blue", "파랑"]]) add(item(`aerobicStep-${c}`, F, `Aerobic step, ${en}`, 900, 350, 200, c, (w, d, h) => [B(0, 0, h - 40, w, d, 40, "main", 30, { m: "rubber" }), ...[-1, 1].map((s) => B(s * (w / 2 - 80), 0, 0, 140, d, h - 40, "grey", 10))], { tags: "step board aerobics" }), `에어로빅 스텝, ${ko}`);
    for (const [c, en, ko] of [["oak", "oak", "오크"], ["white", "white", "흰색"]]) add(item(`wallBars-${c}`, F, `Wall bars, ${en}`, 900, 150, 2400, c, (w, d, h) => [...[-1, 1].map((s) => B(s * (w / 2 - 30), 0, 0, 60, d, h, "main", 6)), ...Array.from({ length: 15 }, (_, i) => T([[-w / 2 + 60, 0, 150 + i * 150], [w / 2 - 60, 0, 150 + i * 150]], 18, "main"))], { mount: "wall", elev: 0, tags: "stall bars gymnastics ladder" }), `늑목, ${ko}`);
    add(item("medBallRack", F, "Medicine ball rack", 1000, 400, 1000, "black", (w, d, h) => [...[-1, 1].map((s) => B(s * (w / 2 - 30), 0, 0, 60, d, h, "main", 4)), ...[250, 600, 950].map((z) => B(0, 0, z - 40, w, d, 30, "main", 4)), ...[250, 600].flatMap((z, j) => [-0.3, 0, 0.3].map((k, i) => S(k * w, 0, z + 120, 120, ["red", "blue", "yellow", "orange", "leaf3", "navy"][i + j * 3], { m: "rubber" })))], { tags: "medicine balls gym" }), "메디신 볼 거치대");
    for (const [c, en, ko] of [["blue", "blue", "파랑"], ["black", "black", "검정"]]) add(item(`foamRoller-${c}`, F, `Foam roller, ${en}`, 900, 150, 150, c, (w, d, h) => [C(-w / 2, 0, h / 2, h / 2, w, "main", h / 2, { ty: 90, m: "rubber" })], { tags: "foam roller massage gym" }), `폼 롤러, ${ko}`);
    add(item("gymMats", F, "Stack of gym mats", 1000, 2000, 400, "blue", (w, d, h) => Array.from({ length: 5 }, (_, i) => B(0, 0, i * (h / 5), w, d, h / 5 - 4, i % 2 ? "main" : "red", 20, { m: "rubber" })), { tags: "mats gymnastics" }), "체육 매트 더미");
    add(item("balanceBoard", F, "Balance board", 500, 500, 100, "lightwood", (w, d, h) => [C(0, 0, h - 25, w / 2, 25, "main"), S(0, 0, 40, 60, "black", { sz: 0.7 })], { tags: "wobble board balance" }), "밸런스 보드");
    add(item("battleRope", F, "Battle rope with anchor", 600, 9000, 200, "black", (w, d, h) => [B(0, -d / 2 + 100, 0, 200, 200, 200, "steel", 10), ...[-1, 1].map((s) => T([[0, -d / 2 + 100, 100], [s * 150, -d / 2 + 2000, 30], [s * 250, d / 2 - 400, 30], [s * 250, d / 2 - 100, 60]], 25, "main", { smooth: true }))], { tags: "battle rope gym" }), "배틀 로프");
    add(item("pullUpStation", F, "Pull-up and dip station", 1100, 1200, 2200, "black", (w, d, h) => [...four(w - 100, d - 200, (x, y) => B(x, y, 0, 60, 60, y < 0 ? h : 1300, "main", 4)), T([[-w / 2, -d / 2 + 100, h], [w / 2, -d / 2 + 100, h]], 16, "chrome"), ...[-1, 1].map((s) => T([[s * 280, -d / 2 + 100, 1300], [s * 280, d / 2 - 100, 1300]], 22, "black")), SB(0, -d / 2 + 120, 900, 300, 80, 400, "fabric", 0.3)], { tags: "power tower pull up dip" }), "턱걸이·딥스 스테이션");
    add(item("elliptical", F, "Elliptical trainer", 700, 1900, 1650, "charcoal", (w, d, h) => [B(0, 0, 0, w * 0.5, d, 120, "main", 30), C(0, -d / 2 + 250, 120, 250, 120, "main", 250, { tx: 90 }), ...[-1, 1].flatMap((s) => [B(s * 150, 100, 300, 140, 450, 40, "black", 10), T([[s * 150, d * 0.2, 340], [s * 200, d / 2 - 350, h - 200]], 20, "steel")]), B(0, d / 2 - 300, 0, 120, 120, h - 300, "main", 10), B(0, d / 2 - 300, h - 300, 300, 120, 200, "screen", 20)], { tags: "cross trainer cardio" }), "일립티컬 트레이너");
    add(item("stairClimber", F, "Stair climber", 900, 1500, 2000, "black", (w, d, h) => [B(0, 0, 0, w, d, 100, "main", 20), ...Array.from({ length: 5 }, (_, i) => B(0, -d / 2 + 200 + i * 220, 100 + i * 200, w - 200, 260, 40, "steel", 4)), ...[-1, 1].map((s) => T([[s * (w / 2 - 40), -d / 2 + 100, 100], [s * (w / 2 - 40), d / 2 - 200, h - 300], [s * (w / 2 - 40), d / 2 - 100, h - 300]], 25, "main")), B(0, d / 2 - 120, h - 400, 400, 100, 250, "screen", 20)], { tags: "stepmill cardio stairs" }), "천국의 계단 (스테어 클라이머)");
  }

  // ---------------------------------------------------------------- shop fittings
  {
    vary("shelving", "매장 진열대", [["1.2 m", "1.2 m", { w: 1200 }], ["2.4 m", "2.4 m", { w: 2400 }], ["3 m", "3 m", { w: 3000 }], ["black", "검정", { color: "black" }]]);
    vary("wallShelving", "상품 진열 벽 선반", [["0.9 m", "0.9 m", { w: 900 }], ["1.8 m", "1.8 m", { w: 1800 }], ["black", "검정", { color: "black" }]]);
    vary("checkout", "계산대", cols("black", "oak"));
    vary("displayTable", "진열 테이블", [...cols("walnut", "white", "black"), ["small", "작은", { w: 1200, d: 800 }], ["large", "큰", { w: 2000, d: 1000 }]]);
    vary("displayCase", "유리 진열장", [["0.9 m", "0.9 m", { w: 900 }], ["1.5 m", "1.5 m", { w: 1500 }], ["2 m", "2 m", { w: 2000 }], ["black", "검정", { color: "black" }]]);
    vary("clothesRack", "옷걸이 행거", [...cols("black", "brass"), ["short", "짧은", { w: 1000 }], ["long", "긴", { w: 2000 }]]);
    vary("mannequin", "마네킹", [...cols("black", "oak", "grey"), ["child", "어린이", { w: 350, d: 250, h: 1200 }]]);
    vary("fittingRoom", "탈의실", cols("cream", "navy"));
    vary("vending", "자판기", cols("blue", "black", "white", "green"));
    vary("atm", "ATM", cols("black", "white"));
    vary("cashCounter", "진열 계산대", cols("white", "walnut", "black"));
    vary("cashRegister", "계산기 / POS", cols("white"));
    vary("shoppingCart", "쇼핑 카트", [["small", "소형", { w: 450, d: 700, h: 950 }]]);
  }

  // ---------------------------------------------------------------- school
  vary("studentDesk", "학생 책상", cols("white", "walnut"));
  vary("studentChair", "학생 의자", cols("blue", "red", "green"));
  vary("lockersSchool", "학교 사물함 (8칸)", cols("red", "grey"));
  vary("chalkboard", "교실 칠판", [["white (whiteboard)", "흰색 (화이트보드)", { color: "white" }]]);

  // ---------------------------------------------------------------- basic shapes and site props ("Other")
  {
    const O = "Other";
    const shape = (kind, en, ko, sizes, parts, tags = "shape primitive") => sizes.forEach(([w, d, h], i) => add(item(`${kind}-${i + 1}`, O, `${en} ${w} × ${d} × ${h}`, w, d, h, "main", parts, { tags }), `${ko} ${w} × ${d} × ${h}`));
    shape("shapeBox", "Box", "상자", [[300, 300, 300], [500, 500, 500], [1000, 500, 500], [2000, 1000, 200]], (w, d, h) => [B(0, 0, 0, w, d, h)]);
    shape("shapeCyl", "Cylinder", "원기둥", [[300, 300, 600], [500, 500, 500], [1000, 1000, 300]], (w, d, h) => [C(0, 0, 0, w / 2, h, "main", d / 2, { seg: 40 })]);
    shape("shapeSphere", "Sphere", "구", [[300, 300, 300], [500, 500, 500], [1500, 1500, 1500]], (w, d, h) => [S(0, 0, h / 2, Math.min(w, d) / 2, "main", { sz: h / Math.min(w, d) })]);
    shape("shapeCone", "Cone", "원뿔", [[300, 300, 500], [600, 600, 600], [1000, 1000, 2000]], (w, d, h) => [C(0, 0, 0, w / 2, h, "main", d / 2, { top: 0.001, seg: 40 })]);
    shape("shapePyramid", "Pyramid", "피라미드", [[500, 500, 500], [1000, 1000, 800], [2000, 2000, 1500]], (w, d, h) => [L(0, 0, 0, [[(w / 2) * Math.SQRT2, 0], [0.001, h]], "main", { seg: 4, sy: d / w })]);
    shape("shapeWedge", "Wedge", "쐐기", [[500, 500, 300], [1000, 1000, 500], [1000, 2000, 300]], (w, d, h) => [E(0, 0, 0, [[-d / 2, 0], [d / 2, 0], [d / 2, h]], w, "main", { axis: "x" })]);
    shape("shapePrism", "Triangular prism", "삼각기둥", [[500, 500, 500], [1000, 600, 300], [2000, 1000, 800]], (w, d, h) => [E(0, 0, 0, [[-d / 2, 0], [d / 2, 0], [0, h]], w, "main", { axis: "x" })]);
    shape("shapeDome", "Half sphere", "반구", [[600, 600, 300], [1200, 1200, 600]], (w, d, h) => [L(0, 0, 0, Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * (Math.PI / 2); return [Math.cos(a) * (w / 2), Math.sin(a) * h]; }).concat([[0, h]]), "main", { sy: d / w, seg: 40 })]);
    shape("shapeRing", "Ring", "고리", [[600, 600, 100], [1200, 1200, 200]], (w, d, h) => [R(0, 0, h / 2, w / 2 - h / 2, h / 2, "main")]);
    shape("shapeTube", "Tube (hollow cylinder)", "속이 빈 원통", [[400, 400, 1000], [1000, 1000, 500]], (w, d, h) => [L(0, 0, 0, [[w / 2, 0], [w / 2, h], [w / 2 - 40, h], [w / 2 - 40, 0]], "main", { seg: 40 })]);
    shape("shapeHex", "Hexagonal prism", "육각기둥", [[500, 500, 500], [1000, 1000, 300]], (w, d, h) => [C(0, 0, 0, w / 2, h, "main", d / 2, { seg: 6 })]);
    shape("shapeOct", "Octagonal prism", "팔각기둥", [[500, 500, 500], [1000, 1000, 300]], (w, d, h) => [C(0, 0, 0, w / 2, h, "main", d / 2, { seg: 8 })]);
    shape("shapeSteps", "Steps block", "계단 블록", [[1000, 900, 450], [1500, 1200, 600]], (w, d, h) => [0, 1, 2].map((i) => B(0, d / 2 - ((d / 3) * (3 - i)) / 2, (h / 3) * i, w, (d / 3) * (3 - i), h / 3, "main")));
    const prop = (kind, en, ko, w, d, h, c, parts, tags) => add(item(kind, O, en, w, d, h, c, parts, { tags }), ko);
    for (const [w, d, h] of [[400, 300, 250], [800, 600, 500], [1200, 800, 800]]) prop(`crate-${w}`, `Wooden crate ${w} × ${d}`, `나무 상자 ${w} × ${d}`, w, d, h, "oak", (ww, dd, hh) => [...[0, 1, 2].map((i) => B(0, 0, 20 + i * (hh / 3), ww, dd, hh / 3 - 30, "main", 4)), ...four(ww - 40, dd - 40, (x, y) => B(x, y, 0, 40, 40, hh, "main"))], "crate box wooden");
    prop("palletUS", "Pallet 1200 × 1000", "팔레트 1200 × 1000", 1200, 1000, 145, "lightwood", (w, d, h) => [...Array.from({ length: 7 }, (_, i) => B(0, -d / 2 + 50 + (i * (d - 100)) / 6, h - 22, w, 100, 22, "main")), ...[-1, 0, 1].map((k) => B((k * (w - 100)) / 2, 0, 0, 100, d, h - 22, "main"))], "pallet skid");
    prop("palletHalf", "Half pallet 800 × 600", "하프 팔레트 800 × 600", 800, 600, 145, "lightwood", (w, d, h) => [...Array.from({ length: 5 }, (_, i) => B(0, -d / 2 + 50 + (i * (d - 100)) / 4, h - 22, w, 100, 22, "main")), ...[-1, 0, 1].map((k) => B((k * (w - 100)) / 2, 0, 0, 100, d, h - 22, "main"))], "pallet skid");
    for (const n of [3, 6]) prop(`palletStack-${n}`, `Stack of ${n} pallets`, `팔레트 ${n}단 더미`, 1200, 800, 145 * n, "lightwood", (w, d, h) => Array.from({ length: n }, (_, j) => [...Array.from({ length: 7 }, (_, i) => B(0, -d / 2 + 50 + (i * (d - 100)) / 6, j * 145 + 123, w, 100, 22, "main")), ...[-1, 0, 1].map((k) => B((k * (w - 100)) / 2, 0, j * 145, 100, d, 123, "main"))]).flat(), "pallets stack");
    const drum = (c, ribs = true) => (w, d, h) => [C(0, 0, 0, w / 2, h, "main", d / 2, { seg: 32, m: c === "oak" ? "wood" : "gloss" }), ...(ribs ? [h * 0.33, h * 0.66].map((z) => R(0, 0, z, w / 2, 8, "main")) : []), C(-w * 0.2, 0, h, 30, 12, "black")];
    for (const [c, en, ko] of [["oak", "Wooden barrel", "나무 통"], ["blue", "Plastic drum, blue", "플라스틱 드럼, 파랑"], ["red", "Oil drum, red", "기름 드럼, 빨강"], ["yellow", "Oil drum, yellow", "기름 드럼, 노랑"], ["black", "Oil drum, black", "기름 드럼, 검정"], ["white", "Plastic drum, white", "플라스틱 드럼, 흰색"]]) prop(`drum-${c}`, en, ko, 580, 580, 880, c, drum(c), "barrel drum oil");
    for (const [h, en, ko] of [[450, "small", "소형"], [700, "medium", "중형"], [1000, "large", "대형"]]) prop(`trafficCone-${h}`, `Traffic cone, ${en}`, `교통 콘, ${ko}`, Math.round(h * 0.55), Math.round(h * 0.55), h, "orange", (w, d, hh) => [B(0, 0, 0, w, d, 30, "black", 10), C(0, 0, 30, w * 0.3, hh - 30, "main", d * 0.3, { top: 0.15 }), C(0, 0, hh * 0.45, w * 0.22, hh * 0.15, "white", d * 0.22, { top: 0.75, plan: false })], "traffic cone road works");
    for (const [c, en, ko] of [["steel", "steel", "스틸"], ["concrete", "concrete", "콘크리트"], ["yellow", "yellow", "노랑"]]) prop(`bollard-${c}`, `Bollard, ${en}`, `볼라드, ${ko}`, 200, 200, 900, c, (w, d, h) => [C(0, 0, 0, w / 2, h - w / 2, "main"), S(0, 0, h - w / 2, w / 2, "main", { sz: 1 }), ...(c === "yellow" ? [C(0, 0, h * 0.7, w / 2 + 2, 60, "black", w / 2 + 2, { plan: false })] : [])], "bollard post barrier");
    for (const [w, en, ko] of [[1200, "short", "짧은"], [2400, "long", "긴"]]) prop(`jersey-${w}`, `Concrete barrier, ${en}`, `콘크리트 방호벽, ${ko}`, w, 600, 810, "concrete", (ww, d, h) => [E(0, 0, 0, [[-d / 2, 0], [d / 2, 0], [d / 2 - 100, 250], [d / 2 - 230, h], [-d / 2 + 230, h], [-d / 2 + 100, 250]], ww, "main", { axis: "x" })], "jersey barrier concrete");
    for (const [c, en, ko] of [["red", "red", "빨강"], ["white", "white", "흰색"]]) prop(`waterBarrier-${c}`, `Water-filled barrier, ${en}`, `물 채움 방호벽, ${ko}`, 1500, 500, 800, c, (w, d, h) => [E(0, 0, 0, [[-d / 2, 0], [d / 2, 0], [d / 2 - 80, h], [-d / 2 + 80, h]], w, "main", { axis: "x", m: "plastic" })], "barrier road plastic");
    prop("roadBarrier", "Road works barrier", "공사 차단기", 1500, 500, 1000, "white", (w, d, h) => [...[-1, 1].flatMap((s) => [B(s * (w / 2 - 60), 0, 0, 120, d, 40, "black", 6), T([[s * (w / 2 - 60), 0, 40], [s * (w / 2 - 60), 0, h]], 20, "steel")]), ...[0.55, 0.85].map((k) => B(0, 0, k * h, w, 25, 150, "red", 4))], "barrier road works");
    prop("sandbags", "Sandbag wall", "모래주머니 벽", 1500, 400, 600, "sand", (w, d, h) => Array.from({ length: 4 }, (_, j) => Array.from({ length: 3 + (j % 2 ? 0 : 1) }, (_, i) => SB(-w / 2 + (j % 2 ? 250 : 0) + 250 + i * 500 - (j % 2 ? 0 : 250), 0, j * 150, 480, d, 150, "main", 0.4))).flat(), "sandbags flood");
    prop("ibcTank", "IBC tank", "IBC 탱크", 1200, 1000, 1150, "white", (w, d, h) => [B(0, 0, 0, w, d, 140, "black"), B(0, 0, 140, w - 40, d - 40, h - 160, "main", 40, { m: "plastic" }), ...Array.from({ length: 5 }, (_, i) => T([[-w / 2, -d / 2, 140 + i * 230], [w / 2, -d / 2, 140 + i * 230]], 10, "steel", { plan: false })), C(0, 0, h - 20, 100, 40, "black")], "tank water ibc tote");
    for (const [h, en, ko] of [[600, "small", "소형"], [1000, "medium", "중형"], [1500, "large", "대형"]]) prop(`gasCylinder-${h}`, `Gas cylinder, ${en}`, `가스통, ${ko}`, Math.round(h * 0.22), Math.round(h * 0.22), h, "grey", (w, d, hh) => [C(0, 0, 0, w / 2, hh - w / 2 - 60, "main"), S(0, 0, hh - w / 2 - 60, w / 2, "main", { sz: 0.6 }), C(0, 0, hh - 120, 40, 120, "brass")], "gas bottle cylinder lpg");
    // A cable drum lying on its side: the axis along x (a turned cylinder runs from its base along +x).
    for (const [D, en, ko] of [[800, "small", "소형"], [1500, "large", "대형"]]) prop(`cableDrum-${D}`, `Cable drum, ${en}`, `케이블 드럼, ${ko}`, Math.round(D * 0.7), D, D, "oak", (w, d, h) => [...[-1, 1].map((s) => C(s * (w / 2 - 20) - 20, 0, h / 2, h / 2, 40, "main", h / 2, { ty: 90 })), C(-(w / 2 - 40), 0, h / 2, h * 0.32, w - 80, "black", h * 0.32, { ty: 90 })], "cable reel drum spool");
    for (const [w, d, h] of [[300, 200, 200], [400, 300, 300], [600, 400, 400], [800, 600, 600]]) prop(`carton-${w}`, `Cardboard box ${w} × ${d} × ${h}`, `골판지 상자 ${w} × ${d} × ${h}`, w, d, h, "tan", (ww, dd, hh) => [B(0, 0, 0, ww, dd, hh, "main", 2, { m: "paper" }), B(0, 0, hh - 1, ww * 0.1, dd, 2, "cream", 0, { plan: false })], "cardboard box carton moving");
    for (const [c, en, ko] of [["blue", "blue", "파랑"], ["grey", "grey", "회색"], ["red", "red", "빨강"], ["yellow", "yellow", "노랑"], ["leaf3", "green", "초록"], ["black", "black", "검정"]]) prop(`plasticCrate-${c}`, `Stackable plastic crate, ${en}`, `적재용 플라스틱 상자, ${ko}`, 600, 400, 320, c, (w, d, h) => [B(0, 0, 0, w, d, h, "main", 10, { m: "plastic" }), ...[-1, 1].map((s) => B(s * (w / 2 - 1), 0, h - 80, 4, 120, 40, "black", 10, { plan: false }))], "crate box plastic stacking");
    prop("sawhorse", "Sawhorse", "작업대 받침 (소호스)", 900, 600, 750, "lightwood", (w, d, h) => [B(0, 0, h - 90, w, 90, 90, "main"), ...[-1, 1].flatMap((s) => [-1, 1].map((e) => T([[s * (w / 2 - 80), 0, h - 60], [s * (w / 2 - 40), e * (d / 2 - 30), 0]], 22, "main")))], "sawhorse trestle");
    prop("stepLadder", "Step ladder", "접이식 사다리", 500, 700, 1500, "steel", (w, d, h) => [...[-1, 1].flatMap((s) => [T([[s * (w / 2 - 20), -d / 2 + 30, 0], [s * (w / 2 - 40), -40, h]], 18, "main"), T([[s * (w / 2 - 20), d / 2 - 30, 0], [s * (w / 2 - 40), 40, h]], 18, "main")]), ...Array.from({ length: 4 }, (_, i) => B(0, -d / 2 + 60 + i * 80, 300 + i * 300, w - 60, 100, 20, "main", 4)), B(0, 0, h, w - 40, 160, 30, "grey", 10)], "ladder steps");
    for (const [c, en, ko] of [["red", "red", "빨강"], ["leaf3", "green", "초록"]]) prop(`jerryCan-${c}`, `Jerry can, ${en}`, `기름통, ${ko}`, 350, 170, 470, c, (w, d, h) => [B(0, 0, 0, w, d, h - 60, "main", 20, { m: "plastic" }), B(-w * 0.2, 0, h - 60, w * 0.4, 30, 60, "main", 10), C(w * 0.3, 0, h - 70, 30, 70, "black")], "jerry can fuel");
    prop("dumpster", "Dumpster (waste container)", "대형 쓰레기 수거함", 2000, 1100, 1300, "leaf2", (w, d, h) => [B(0, 0, 150, w, d, h - 150, "main", 20, { m: "gloss" }), ...four(w - 200, d - 200, (x, y) => C(x, y, 0, 70, 150, "black")), E(0, 0, h, [[-d / 2, 0], [d / 2, 0], [d / 2, 60], [-d / 2, 120]], w, "black", { axis: "x" })], "dumpster bin container waste");
    prop("skipBin", "Skip bin", "건설 폐기물 컨테이너", 1800, 3600, 1200, "yellow", (w, d, h) => [E(0, 0, 0, [[-d / 2 + 400, 0], [d / 2 - 400, 0], [d / 2, h], [-d / 2, h]], w, "main", { axis: "x" })].map((p) => ({ ...p })), "skip container rubble");
  }

  return out;
}
