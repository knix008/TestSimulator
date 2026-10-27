/** Relative humidity bands: below 30% is dry, 30–60% comfortable, 60–80% humid, 80% and up very humid. */
export function humidityGrade(value) {
  const number = Number(value);
  if (value == null || value === "" || !Number.isFinite(number)) return "";
  if (number < 30) return "dry";
  if (number < 60) return "comfortable";
  if (number < 80) return "humid";
  return "veryHumid";
}

export function humidityValue(value) {
  const number = Number(value);
  if (value == null || value === "" || !Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, Math.round(number)));
}

export function humidityBrief(value) {
  const shown = humidityValue(value);
  return shown == null ? "" : `${shown}%`;
}

export function humidityText(value, t) {
  const shown = humidityValue(value);
  if (shown == null) return "";
  return `${t("humidity.label")} ${shown}% ${t(`humidity.${humidityGrade(shown)}`)}`;
}

/** The hour's reading when there is one, otherwise the day's average. */
export function humidityAt(day, hour) {
  return humidityValue(hour?.humidity ?? day?.humidity);
}

const HUMIDITY_COLOR = { dry: "#e0a35a", comfortable: "#3dbe7a", humid: "#3d8bfd", veryHumid: "#1f4fd1" };
const DROP_TOP = 16;
const DROP_WAIST = 74;
const DROP_BOTTOM = 104;
const DROP_RADIUS = 30;

/** Half the drop's width at height y: a tapering top over a round bottom. */
function dropHalfWidth(y) {
  if (y <= DROP_TOP) return 0;
  if (y <= DROP_WAIST) return DROP_RADIUS * Math.sqrt((y - DROP_TOP) / (DROP_WAIST - DROP_TOP));
  const below = Math.min(DROP_RADIUS, y - DROP_WAIST);
  return Math.sqrt(DROP_RADIUS * DROP_RADIUS - below * below);
}

/** Outline of the drop from height `from` down to the bottom. Polygons need no ids, so many drops can share a page. */
function dropPoints(from) {
  const steps = 24;
  const left = [];
  const right = [];
  for (let index = 0; index <= steps; index += 1) {
    const y = from + ((DROP_BOTTOM - from) * index) / steps;
    const half = dropHalfWidth(y);
    left.push(`${(60 - half).toFixed(1)},${y.toFixed(1)}`);
    right.push(`${(60 + half).toFixed(1)},${y.toFixed(1)}`);
  }
  return [...left, ...right.reverse()].join(" ");
}

const DROP_OUTLINE = dropPoints(DROP_TOP);

/** A water drop filled up to the humidity, coloured by its band. */
export function humidityArt(value, size = 72) {
  const shown = humidityValue(value);
  const grade = humidityGrade(shown);
  const color = HUMIDITY_COLOR[grade] || "#9aa8b5";
  const level = DROP_BOTTOM - ((DROP_BOTTOM - DROP_TOP) * (shown ?? 0)) / 100;
  const water = shown ? `<polygon points="${dropPoints(level)}" fill="${color}"/>` : "";
  const body = `<polygon points="${DROP_OUTLINE}" fill="#ffffff" fill-opacity="0.85"/>${water}<polygon points="${DROP_OUTLINE}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>`;
  return `<span class="humidity-art" data-humidity="${grade || "none"}"><svg viewBox="12 12 96 96" width="${size}" height="${size}" aria-hidden="true">${body}</svg></span>`;
}
