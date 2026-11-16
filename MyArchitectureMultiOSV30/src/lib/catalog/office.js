// Office and electronics: desks and workstations, office chairs, meeting tables,
// storage, reception, booths, screens, printers and home electronics.
import { B, C, S, L, E, T, R, G, SB, item, variant, table, cabinet, officeChair, cantilever, padChair, move, place, books, four, taperLeg, smoothProfile, rrect, ellipsePts, rng, sofa } from "./common.js";

// A monitor on a stand: screen width sw, its foot at (x, y, z), facing +y.
const monitor = (x, y, z, sw = 600, c = "black") => [
  B(x, y, z, sw * 0.32, sw * 0.28, 8, c, 20), B(x, y - sw * 0.08, z + 8, 50, 30, sw * 0.3, c, 0, { tx: -8 }),
  B(x, y, z + sw * 0.14, sw, 22, sw * 0.58, c, 6), B(x, y + 11.5, z + sw * 0.14 + 10, sw - 20, 1, sw * 0.58 - 26, "screen", 0, { plan: false }),
];
const keyboard = (x, y, z) => [B(x, y, z, 440, 140, 18, "black", 6, { tx: 4 }), SB(x + 300, y, z, 65, 110, 32, "black", 0.5)];
const laptop = (x, y, z, k = 1) => [B(x, y, z, 330 * k, 230 * k, 12, "steel", 8, { m: "metal" }), B(x, y - 115 * k, z + 12, 330 * k, 8, 220 * k, "steel", 6, { tx: 15, m: "metal" }), B(x, y - 110 * k, z + 20, 300 * k, 2, 190 * k, "screen", 0, { tx: 15, plan: false })];
// Office desk on a steel frame, with what is on it.
function officeDeskParts(w, d, h, o = {}) {
  const out = [B(0, 0, h - 25, w, d, 25, o.topC || "main", 6, { b: 3 })];
  for (const s of [-1, 1]) out.push(B(s * (w / 2 - 50), 0, 0, 60, d - 80, 30, o.frameC || "steel", 4), B(s * (w / 2 - 50), 0, 30, 60, 60, h - 55, o.frameC || "steel", 4));
  out.push(B(0, -d / 2 + 60, h - 120, w - 160, 15, 90, o.frameC || "steel", 0, { plan: false }));
  if (o.screens !== false) out.push(...monitor(o.dual ? -170 : 0, -d * 0.2, h, 560), ...(o.dual ? monitor(370, -d * 0.2, h, 560) : []), ...keyboard(0, 0.1 * d, h));
  if (o.pedestal) out.push(...move(cabinet(400, d * 0.7, h - 60, { fronts: "D,D,D", handle: "bar", plinth: 30 }), w / 2 - 280, -0.1 * d));
  return out;
}

const officeDesk = item("officeDesk", "Office", "Office desk", 1600, 800, 750, "lightwood", (w, d, h) => officeDeskParts(w, d, h, { pedestal: true }), { tags: "workstation" });
const officeChairDef = item("officeChair", "Office", "Office chair", 600, 600, 1000, "dark", (w, d, h) => officeChair(w, d, h, { seatC: "main" }));

export default [
  officeDesk,
  item("deskDual", "Office", "Desk with two monitors", 1600, 800, 1200, "white", (w, d, h) => officeDeskParts(w, d, 740, { dual: true, frameC: "black" })),
  item("standingDesk", "Office", "Height-adjustable desk", 1600, 800, 1150, "oak", (w, d, h) => officeDeskParts(w, d, 1100, { frameC: "black", screens: false }).concat(laptop(0, 0, 1100), monitor(-w * 0.3, -d * 0.25, 1100, 500))),
  item("lDesk", "Office", "L-shaped desk", 1800, 1600, 750, "walnut", (w, d, h) => [E(0, 0, h - 28, [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [w / 2 - 700, d / 2], [w / 2 - 700, -d / 2 + 750], [-w / 2, -d / 2 + 750]], 28, "main", { b: 3 }), ...[[-w / 2 + 40, -d / 2 + 375], [w / 2 - 350, d / 2 - 40], [w / 2 - 40, -d / 2 + 40]].map(([x, y]) => B(x, y, 0, x === w / 2 - 350 ? 640 : 60, x === w / 2 - 350 ? 60 : 680, h - 28, "black", 3)), ...monitor(-w * 0.15, -d / 2 + 180, h, 600), ...keyboard(-w * 0.15, -d / 2 + 500, h)]),
  item("executiveDesk", "Office", "Executive desk", 2000, 900, 760, "darkwood", (w, d, h) => [...move(cabinet(500, d - 40, h - 35, { fronts: "D,D,D", handle: "bar", handleC: "brass", plinth: 40 }), -w / 2 + 250), ...move(cabinet(500, d - 40, h - 35, { fronts: "d", handle: "bar", handleC: "brass", plinth: 40 }), w / 2 - 250), B(0, -d / 2 + 40, 150, w - 1000, 25, h - 185, "main", 0), B(0, 0, h - 35, w + 40, d + 20, 35, "main", 10, { b: 6 }), B(0, 0.05 * d, h, 900, 500, 3, "leather", 10, { plan: false }), ...laptop(0, 0.05 * d, h + 3), L(w * 0.35, -0.25 * d, h, [[60, 0], [50, 250], [20, 280], [0, 280]], "brass"), L(w * 0.35, -0.25 * d, h + 250, [[150, 0], [110, 160], [108, 160], [148, 0]], "leaf2")]),
  item("benchDesk4", "Office", "Bench desking (4 people)", 3200, 1600, 1200, "white", (w, d, h) => [
    ...[-1, 1].flatMap((s) => move(officeDeskParts(w, d / 2 - 10, 740, { screens: false }), 0, s * (d / 4))),
    ...[-1, 1].flatMap((s) => [-1, 1].flatMap((k) => [...place(monitor(0, 0, 740, 600), (k * w) / 4, s * (d / 4 - 150), s < 0 ? 0 : 180), ...place(keyboard(0, 0, 740), (k * w) / 4, s * (d / 4 + 50), s < 0 ? 0 : 180)])),
    B(0, 0, 740, w - 100, 30, h - 740, "sage", 4, { m: "fabric" }),
  ], { tags: "workstation cluster" }),
  item("workstation", "Office", "Workstation with screen", 1400, 700, 1200, "white", (w, d, h) => [...officeDeskParts(w, d, 740, { pedestal: true }), B(0, -d / 2 + 20, 740, w, 40, h - 740, "fabric2", 10, { m: "fabric" })]),
  officeChairDef,
  item("officeChairMesh", "Office", "Mesh task chair with headrest", 650, 650, 1250, "black", (w, d, h) => officeChair(w, d, h, { seatC: "charcoal", backC: "grey", headrest: true })),
  item("executiveChair", "Office", "Executive leather chair", 700, 720, 1200, "leather", (w, d, h) => officeChair(w, d, h, { seatC: "main", baseC: "chrome", headrest: true })),
  item("visitorChair", "Office", "Visitor chair", 560, 580, 830, "charcoal", (w, d, h) => cantilever(w, d, h, { seatC: "main" })),
  item("meetingTable", "Office", "Meeting table", 2400, 1200, 750, "wood", (w, d, h) => table(w, d, h, { top: "oval", legs: "trestle", thick: 35, legC: "steel" })),
  item("conferenceSet", "Office", "Conference table with 10 chairs", 4400, 2400, 1050, "walnut", (w, d, h) => {
    const tw = w - 1100, td = d - 1100, out = [E(0, 0, 715, ellipsePts(0, 0, tw / 2, td / 2, 48).map(([x, y]) => [Math.sign(x) * Math.min(Math.abs(x) * 1.4, tw / 2), y]), 35, "main", { b: 6 }), ...[-1, 1].map((s) => B(s * tw * 0.3, 0, 0, 120, td * 0.6, 715, "black", 10))];
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) out.push(...place(officeChair(620, 620, 1000, { seatC: "charcoal" }), -tw / 2 + 300 + ((tw - 600) * (i + 0.5)) / 4 + 0, s * (td / 2 + 250), s < 0 ? 0 : 180));
    for (const s of [-1, 1]) out.push(...place(officeChair(620, 620, 1000, { seatC: "charcoal" }), s * (tw / 2 + 250), 0, s < 0 ? -90 : 90));
    return out;
  }, { tags: "boardroom meeting" }),
  item("meetingSet", "Office", "Meeting table with 6 chairs", 2800, 2200, 900, "white", (w, d, h) => {
    const tw = w - 1000, td = d - 1100, out = table(tw, td, 740, { legs: "frame", legC: "black", thick: 25 });
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) out.push(...place(cantilever(520, 560, 830, { seatC: "sage" }), -tw / 2 + (tw * (i + 0.5)) / 3, s * (td / 2 + 200), s < 0 ? 0 : 180));
    return out;
  }),
  item("filing", "Office", "Filing cabinet", 500, 600, 1300, "metal", (w, d, h) => cabinet(w, d, h, { fronts: "D,D,D,D", handle: "bar", bodyC: "main" })),
  item("pedestal", "Office", "Mobile drawer pedestal", 400, 550, 600, "white", (w, d, h) => [...cabinet(w, d, h - 40, { fronts: "D,D,D", handle: "bar" }).map((p) => ({ ...p, z: p.z + 40 })), ...four(w - 60, d - 60, (x, y) => S(x, y, 20, 20, "rubber"))]),
  item("officeStorage", "Office", "Office storage cabinet", 800, 420, 2000, "white", (w, d, h) => [...cabinet(w, d, h, { fronts: "dd,o,dd", handle: "bar", plinth: 50 }), ...books(-w / 2 + 30, w / 2 - 30, 0, h * 0.48, 280, d * 0.7, 55, 0.95).map((p) => ({ ...p, c: ["blue", "white", "black", "red"][Math.floor(Math.abs(p.x)) % 4] }))]),
  item("officeBookcase", "Office", "Office bookcase", 1000, 400, 2000, "oak", (w, d, h) => { const out = [B(-w / 2 + 12, 0, 0, 24, d, h), B(w / 2 - 12, 0, 0, 24, d, h), B(0, -d / 2 + 6, 0, w, 12, h, "main", 0, { plan: false })]; for (let i = 0; i <= 5; i++) out.push(B(0, 0, i === 5 ? h - 24 : 50 + i * ((h - 74) / 5), w - 48, d, 24, "main", 0, { plan: i === 5 })); for (let i = 0; i < 5; i++) out.push(...books(-w / 2 + 24, w / 2 - 24, 0, 74 + i * ((h - 74) / 5), (h - 74) / 5 - 60, d * 0.8, 60 + i, 0.75).map((p) => ({ ...p, c: ["white", "blue", "black", "grey", "book3"][Math.floor(Math.abs(p.x * 7)) % 5] }))); return out; }),
  item("reception", "Office", "Reception desk", 2400, 800, 1100, "lightwood", (w, d, h) => [
    E(0, 0, 0, [[-w / 2, -d / 2 + 100], [w / 2, -d / 2 + 100], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => [x, y]), h - 40, "main", { b: 6 }),
    B(0, d / 2 - 120, h - 40, w + 40, 280, 40, "white", 6, { b: 4 }), B(0, -d / 2 + 300, 720, w - 100, 450, 30, "white", 4),
    B(0, d / 2 + 2, 150, w * 0.6, 2, 200, "brass", 0, { plan: false }),
    ...place(monitor(0, 0, 750, 560), -w * 0.2, -d / 2 + 300, 180), ...place(monitor(0, 0, 750, 560), w * 0.2, -d / 2 + 300, 180),
  ], { tags: "front desk counter" }),
  item("phoneBooth", "Office", "Phone booth (acoustic pod)", 1000, 1000, 2200, "charcoal", (w, d, h) => [B(0, 0, 0, w, d, 60, "main", 10), B(0, -d / 2 + 30, 60, w, 60, h - 60, "main", 10), ...[-1, 1].map((s) => B(s * (w / 2 - 30), 0, 60, 60, d, h - 60, "main", 10)), B(0, 0, h - 80, w, d, 80, "main", 10), B(0, d / 2 - 20, 60, w - 120, 20, h - 140, "glass", 0), T([[w / 2 - 120, d / 2, 900], [w / 2 - 120, d / 2 + 30, 900], [w / 2 - 120, d / 2 + 30, 1300], [w / 2 - 120, d / 2, 1300]], 10, "black", { plan: false }), B(0, -d / 2 + 210, 1050, w - 120, 300, 30, "oak", 6), SB(0, -d / 2 + 110, 1200, w - 140, 40, 500, "sage", 0.2, { m: "fabric", plan: false }), G(C(0, 0, h - 85, 150, 5, "bulb"), 0.6)], { light: { type: "point", lumens: 300, at: (w, d, h) => [0, 0, h - 120] } }),
  item("loungeOffice", "Office", "Office lounge sofa", 1800, 800, 750, "teal", (w, d, h) => sofa(w, d, h, { seats: 2, arms: "slim", legs: "metal", legC: "chrome", backCushions: false })),
  item("printer", "Office", "Copier / printer", 600, 550, 1000, "white", (w, d, h) => [B(0, 0, 0, w, d, 0.6 * h, "main", 10, { b: 4 }), B(0, 0, 0.6 * h, w, d * 0.95, 0.25 * h, "main", 10, { b: 4 }), B(0, 0, 0.85 * h, w * 0.98, d * 0.9, 0.12 * h, "grey", 8, { b: 4 }), B(w * 0.25, d / 2 - 60, 0.85 * h + 0.12 * h, w * 0.4, 100, 0.03 * h, "black", 4, { tx: -20, m: "screen" }), ...[0.12, 0.27, 0.42].map((z) => B(0, d / 2 - 5, z * h, w - 30, 10, 3, "grey", 0, { plan: false })), ...four(w - 60, d - 60, (x, y) => S(x, y, 10, 15, "rubber"))]),
  item("plotter", "Office", "Large-format plotter", 1400, 700, 1100, "black", (w, d, h) => [B(0, 0, 0.6 * h, w, d * 0.6, 0.4 * h, "main", 30, { b: 15 }), ...[-1, 1].map((s) => T([[s * (w / 2 - 80), 0, 0.6 * h], [s * (w / 2 - 80), 0, 30]], 22, "grey")), ...[-1, 1].map((s) => B(s * (w / 2 - 80), 0, 0, 60, d, 40, "grey", 10)), B(0, d * 0.3, 0.55 * h, w - 200, 120, 6, "paper", 0, { tx: -40, plan: false })]),
  item("whiteboard", "Office", "Whiteboard", 1800, 60, 2100, "white", (w, d, h) => [B(0, 0, 0.4 * h, w, d * 0.4, 0.5 * h, "main", 8), B(0, d * 0.2, 0.4 * h - 30, w * 0.9, 60, 25, "steel", 0, { plan: false }), ...[-1, 1].flatMap((s) => [C(s * (w / 2 - 50), 0, 30, 18, h - 30, "steel"), B(s * (w / 2 - 50), 0, 0, 50, 550, 30, "steel", 10)])].map((p) => ({ ...p })), { tags: "board" }),
  item("projectorScreen", "Office", "Projector screen", 2400, 120, 1800, "white", (w, d, h) => [T([[-w / 2, 0, h - 50], [w / 2, 0, h - 50]], 50, "white"), B(0, 0, h * 0.2, w - 120, 2, h * 0.8 - 100, "paper", 0), B(0, 0, h * 0.2 - 20, w - 120, 25, 25, "black")], { mount: "wall", elev: 800 }),
  item("tvStand", "Office", "Display screen on stand", 1500, 700, 1800, "black", (w, d, h) => [B(0, 0, 0, 900, d, 40, "main", 20), ...[-1, 1].map((s) => B(s * 200, 0, 40, 60, 60, h * 0.6, "main")), B(0, -40, h * 0.45, w, 70, w * 0.57, "main", 8), B(0, -4, h * 0.45 + 12, w - 24, 2, w * 0.57 - 24, "screen", 0, { plan: false })]),
  item("serverRack", "Office", "Server rack", 600, 1000, 2000, "black", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 6), B(0, d / 2 - 5, 30, w - 30, 10, h - 60, "glass", 0, { plan: false }), ...Array.from({ length: 12 }, (_, i) => B(0, d / 2 - 60, 120 + i * 140, w - 80, 20, 90, i % 3 ? "dark" : "grey", 0, { plan: false })), ...Array.from({ length: 12 }, (_, i) => G(B(w * 0.3, d / 2 - 48, 160 + i * 140, 20, 4, 8, "leaf3", 0, { plan: false }), 0.8))]),
  item("lockers", "Office", "Lockers", 900, 500, 1800, "metal", (w, d, h) => [...cabinet(w, d, h, { fronts: "ddd,ddd", handle: "knob", handleC: "black", plinth: 100 }), ...Array.from({ length: 6 }, (_, i) => B(-w / 3 + (i % 3) * (w / 3), d / 2 + 1, h * (i < 3 ? 0.88 : 0.45), 80, 2, 12, "black", 0, { plan: false }))]),
  item("roomDivider", "Office", "Room divider", 1500, 40, 1700, "fabric", (w, d, h) => [B(0, 0, 40, w, d, h - 40, "main", 10, { b: 8 }), ...[-1, 1].map((s) => B(s * (w / 2 - 100), 0, 0, 60, 400, 40, "steel", 10))]),
  item("waterCooler", "Office", "Water cooler", 330, 350, 1350, "white", (w, d, h) => [B(0, 0, 0, w, d, 0.72 * h, "main", 30, { b: 8 }), L(0, 0, 0.72 * h, smoothProfile([[60, 0], [130, 30], [140, 200], [130, 330], [40, 370], [0, 375]], 3), "water", { m: "glass" }), B(0, d / 2 - 20, 0.5 * h, w * 0.6, 60, 140, "grey", 10, { plan: false }), ...[-1, 1].map((s) => B(s * 50, d / 2 - 10, 0.62 * h, 30, 30, 40, s < 0 ? "blue" : "red", 4, { plan: false }))]),
  item("shredder", "Office", "Paper shredder", 400, 300, 650, "black", (w, d, h) => [B(0, 0, 0, w, d, h - 120, "main", 20, { b: 6 }), B(0, 0, h - 120, w, d, 120, "grey", 20, { b: 8 }), B(0, 0, h - 1, w * 0.6, 8, 2, "black", 0, { plan: false })]),
  item("safe", "Office", "Safe", 500, 500, 700, "grey", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 10, { b: 6, m: "metal" }), C(0, d / 2, h * 0.6, 50, 20, "chrome", 50, { tx: -90, plan: false }), T([[w * 0.3, d / 2, h * 0.45], [w * 0.3, d / 2 + 30, h * 0.45], [w * 0.3, d / 2 + 30, h * 0.65], [w * 0.3, d / 2, h * 0.65]], 10, "chrome", { plan: false })]),
  // ---------------------------------------------------------------- electronics
  item("monitor", "Electronics", "Computer monitor", 620, 220, 470, "black", (w, d, h) => monitor(0, 0, 0, w)),
  item("monitorDual", "Electronics", "Dual monitors on an arm", 1250, 300, 520, "black", (w, d, h) => [C(0, -d / 2 + 40, 0, 60, 30, "black"), C(0, -d / 2 + 40, 30, 18, 350, "black"), T([[0, -d / 2 + 40, 350], [-w * 0.25, -d / 2 + 90, 350]], 15, "black"), T([[0, -d / 2 + 40, 350], [w * 0.25, -d / 2 + 90, 350]], 15, "black"), ...[-1, 1].flatMap((s) => [B((s * w) / 4, -d / 2 + 110, 160, w / 2 - 10, 22, 0.58 * (w / 2 - 10), "main", 6, { tz: -s * 8 }), B((s * w) / 4, -d / 2 + 122, 170, w / 2 - 30, 1, 0.58 * (w / 2 - 10) - 20, "screen", 0, { tz: -s * 8, plan: false })])]),
  item("laptop", "Electronics", "Laptop", 330, 240, 230, "steel", (w, d, h) => laptop(0, 0.02 * d, 0, w / 330)),
  item("desktopPC", "Electronics", "Desktop computer", 200, 450, 450, "black", (w, d, h) => [B(0, 0, 20, w, d, h - 20, "main", 8, { b: 4 }), B(w / 2 - 1, 0, 60, 2, d - 80, h - 120, "glass", 0, { plan: false }), G(B(w / 2 - 15, d * 0.1, h * 0.4, 4, d * 0.4, 20, "blue", 0, { plan: false }), 0.6), ...four(w - 30, d - 60, (x, y) => C(x, y, 0, 15, 20, "rubber"))]),
  item("tv65", "Electronics", "65\" TV on a stand", 1460, 300, 900, "black", (w, d, h) => [B(0, 0, 0, w * 0.35, d, 12, "main", 20), B(0, -0.2 * d, 12, 60, 40, 0.1 * h, "main"), B(0, -0.2 * d, 0.06 * h, w, 30, w * 0.575, "main", 4), B(0, -0.2 * d + 15.5, 0.06 * h + 10, w - 20, 1, w * 0.575 - 30, "screen", 0, { plan: false })], { tags: "television" }),
  item("soundbar", "Electronics", "Soundbar", 900, 100, 70, "black", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 30, { b: 25, m: "fabric" })]),
  item("speakerFloor", "Electronics", "Floor-standing speaker", 220, 300, 1050, "walnut", (w, d, h) => [B(0, 0, 40, w, d, h - 40, "main", 10, { b: 6 }), B(0, d / 2, 40, w - 10, 4, h - 50, "black", 0, { m: "fabric", plan: false }), ...[0.3, 0.55, 0.78].map((k) => C(0, d / 2 + 2, k * h, k > 0.7 ? 30 : 65, 6, "charcoal", k > 0.7 ? 30 : 65, { tx: -90, plan: false })), ...four(w, d, (x, y) => C(x * 0.9, y * 0.9, 0, 15, 40, "chrome", 15, { top: 0.4 }))]),
  item("gameConsole", "Electronics", "Game console", 160, 320, 400, "white", (w, d, h) => [B(0, 0, 0, w * 0.5, d, h, "black", 10), ...[-1, 1].map((s) => B(s * w * 0.35, 0, 0, w * 0.3, d, h * 0.98, "main", 30, { b: 10 }))]),
  item("router", "Electronics", "Wi-Fi router", 250, 180, 200, "black", (w, d, h) => [B(0, 0, 0, w, d, 40, "main", 20, { b: 10 }), ...[-0.35, -0.12, 0.12, 0.35].map((k) => C(k * w, -d / 2 + 20, 40, 7, h - 40, "main"))]),
];
