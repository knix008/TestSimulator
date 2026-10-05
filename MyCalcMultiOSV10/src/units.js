// Unit conversion: every group keeps one base unit and each unit says how it
// relates to that base. Most units are a plain factor; temperature needs an
// offset as well, so those units carry their own pair of functions.
const UNIT_STORE = "mycalc-unit";

const UNIT_GROUPS = [
  {
    id: "length",
    name: ["길이", "Length"],
    base: "m",
    units: [
      { id: "nm", symbol: "nm", name: ["나노미터", "Nanometre"], factor: 1e-9 },
      { id: "um", symbol: "µm", name: ["마이크로미터", "Micrometre"], factor: 1e-6 },
      { id: "mm", symbol: "mm", name: ["밀리미터", "Millimetre"], factor: 0.001 },
      { id: "cm", symbol: "cm", name: ["센티미터", "Centimetre"], factor: 0.01 },
      { id: "m", symbol: "m", name: ["미터", "Metre"], factor: 1 },
      { id: "km", symbol: "km", name: ["킬로미터", "Kilometre"], factor: 1000 },
      { id: "in", symbol: "in", name: ["인치", "Inch"], factor: 0.0254 },
      { id: "ft", symbol: "ft", name: ["피트", "Foot"], factor: 0.3048 },
      { id: "yd", symbol: "yd", name: ["야드", "Yard"], factor: 0.9144 },
      { id: "mi", symbol: "mi", name: ["마일", "Mile"], factor: 1609.344 },
      { id: "nmi", symbol: "nmi", name: ["해리", "Nautical mile"], factor: 1852 },
      { id: "ly", symbol: "ly", name: ["광년", "Light year"], factor: 9460730472580800 },
    ],
  },
  {
    id: "area",
    name: ["면적", "Area"],
    base: "m2",
    units: [
      { id: "mm2", symbol: "mm²", name: ["제곱밀리미터", "Square millimetre"], factor: 1e-6 },
      { id: "cm2", symbol: "cm²", name: ["제곱센티미터", "Square centimetre"], factor: 1e-4 },
      { id: "m2", symbol: "m²", name: ["제곱미터", "Square metre"], factor: 1 },
      { id: "km2", symbol: "km²", name: ["제곱킬로미터", "Square kilometre"], factor: 1e6 },
      { id: "a", symbol: "a", name: ["아르", "Are"], factor: 100 },
      { id: "ha", symbol: "ha", name: ["헥타르", "Hectare"], factor: 10000 },
      { id: "pyeong", symbol: "평", name: ["평", "Pyeong"], factor: 400 / 121 },
      { id: "in2", symbol: "in²", name: ["제곱인치", "Square inch"], factor: 0.00064516 },
      { id: "ft2", symbol: "ft²", name: ["제곱피트", "Square foot"], factor: 0.09290304 },
      { id: "yd2", symbol: "yd²", name: ["제곱야드", "Square yard"], factor: 0.83612736 },
      { id: "acre", symbol: "ac", name: ["에이커", "Acre"], factor: 4046.8564224 },
      { id: "mi2", symbol: "mi²", name: ["제곱마일", "Square mile"], factor: 2589988.110336 },
    ],
  },
  {
    id: "volume",
    name: ["부피", "Volume"],
    base: "L",
    units: [
      { id: "mL", symbol: "mL", name: ["밀리리터", "Millilitre"], factor: 0.001 },
      { id: "cL", symbol: "cL", name: ["센티리터", "Centilitre"], factor: 0.01 },
      { id: "L", symbol: "L", name: ["리터", "Litre"], factor: 1 },
      { id: "kL", symbol: "kL", name: ["킬로리터", "Kilolitre"], factor: 1000 },
      { id: "cm3", symbol: "cm³", name: ["세제곱센티미터", "Cubic centimetre"], factor: 0.001 },
      { id: "m3", symbol: "m³", name: ["세제곱미터", "Cubic metre"], factor: 1000 },
      { id: "in3", symbol: "in³", name: ["세제곱인치", "Cubic inch"], factor: 0.016387064 },
      { id: "ft3", symbol: "ft³", name: ["세제곱피트", "Cubic foot"], factor: 28.316846592 },
      { id: "tsp", symbol: "tsp", name: ["티스푼", "Teaspoon"], factor: 0.00492892159375 },
      { id: "tbsp", symbol: "tbsp", name: ["테이블스푼", "Tablespoon"], factor: 0.01478676478125 },
      { id: "cup", symbol: "cup", name: ["컵", "Cup"], factor: 0.2365882365 },
      { id: "pt", symbol: "pt", name: ["파인트", "Pint"], factor: 0.473176473 },
      { id: "qt", symbol: "qt", name: ["쿼트", "Quart"], factor: 0.946352946 },
      { id: "gal", symbol: "gal", name: ["갤런", "Gallon"], factor: 3.785411784 },
      { id: "bbl", symbol: "bbl", name: ["배럴", "Oil barrel"], factor: 158.987294928 },
    ],
  },
  {
    id: "mass",
    name: ["무게", "Mass"],
    base: "kg",
    units: [
      { id: "mg", symbol: "mg", name: ["밀리그램", "Milligram"], factor: 1e-6 },
      { id: "g", symbol: "g", name: ["그램", "Gram"], factor: 0.001 },
      { id: "kg", symbol: "kg", name: ["킬로그램", "Kilogram"], factor: 1 },
      { id: "t", symbol: "t", name: ["톤", "Tonne"], factor: 1000 },
      { id: "don", symbol: "돈", name: ["돈", "Don"], factor: 0.00375 },
      { id: "geun", symbol: "근", name: ["근", "Geun"], factor: 0.6 },
      { id: "oz", symbol: "oz", name: ["온스", "Ounce"], factor: 0.028349523125 },
      { id: "lb", symbol: "lb", name: ["파운드", "Pound"], factor: 0.45359237 },
      { id: "st", symbol: "st", name: ["스톤", "Stone"], factor: 6.35029318 },
      { id: "ton_us", symbol: "ton", name: ["쇼트톤", "Short ton"], factor: 907.18474 },
      { id: "ct", symbol: "ct", name: ["캐럿", "Carat"], factor: 0.0002 },
    ],
  },
  {
    id: "temperature",
    name: ["온도", "Temperature"],
    base: "C",
    units: [
      {
        id: "C",
        symbol: "°C",
        name: ["섭씨", "Celsius"],
        toBase: (value) => value,
        fromBase: (value) => value,
      },
      {
        id: "F",
        symbol: "°F",
        name: ["화씨", "Fahrenheit"],
        toBase: (value) => ((value - 32) * 5) / 9,
        fromBase: (value) => (value * 9) / 5 + 32,
      },
      {
        id: "K",
        symbol: "K",
        name: ["켈빈", "Kelvin"],
        toBase: (value) => value - 273.15,
        fromBase: (value) => value + 273.15,
      },
      {
        id: "R",
        symbol: "°R",
        name: ["랭킨", "Rankine"],
        toBase: (value) => ((value - 491.67) * 5) / 9,
        fromBase: (value) => (value * 9) / 5 + 491.67,
      },
    ],
  },
  {
    id: "speed",
    name: ["속도", "Speed"],
    base: "mps",
    units: [
      { id: "mps", symbol: "m/s", name: ["미터/초", "Metre per second"], factor: 1 },
      { id: "kmh", symbol: "km/h", name: ["킬로미터/시", "Kilometre per hour"], factor: 1 / 3.6 },
      { id: "mph", symbol: "mph", name: ["마일/시", "Mile per hour"], factor: 0.44704 },
      { id: "fps", symbol: "ft/s", name: ["피트/초", "Foot per second"], factor: 0.3048 },
      { id: "kn", symbol: "kn", name: ["노트", "Knot"], factor: 1852 / 3600 },
      { id: "mach", symbol: "Mach", name: ["마하", "Mach"], factor: 340.29 },
    ],
  },
  {
    id: "time",
    name: ["시간", "Time"],
    base: "s",
    units: [
      { id: "ns", symbol: "ns", name: ["나노초", "Nanosecond"], factor: 1e-9 },
      { id: "us", symbol: "µs", name: ["마이크로초", "Microsecond"], factor: 1e-6 },
      { id: "ms", symbol: "ms", name: ["밀리초", "Millisecond"], factor: 0.001 },
      { id: "s", symbol: "s", name: ["초", "Second"], factor: 1 },
      { id: "min", symbol: "min", name: ["분", "Minute"], factor: 60 },
      { id: "h", symbol: "h", name: ["시간", "Hour"], factor: 3600 },
      { id: "d", symbol: "d", name: ["일", "Day"], factor: 86400 },
      { id: "wk", symbol: "wk", name: ["주", "Week"], factor: 604800 },
      { id: "mon", symbol: "mo", name: ["달", "Month"], factor: 2629746 },
      { id: "yr", symbol: "yr", name: ["년", "Year"], factor: 31556952 },
    ],
  },
  {
    id: "data",
    name: ["데이터", "Data"],
    base: "B",
    units: [
      { id: "bit", symbol: "bit", name: ["비트", "Bit"], factor: 0.125 },
      { id: "B", symbol: "B", name: ["바이트", "Byte"], factor: 1 },
      { id: "KB", symbol: "KB", name: ["킬로바이트", "Kilobyte"], factor: 1e3 },
      { id: "KiB", symbol: "KiB", name: ["키비바이트", "Kibibyte"], factor: 1024 },
      { id: "MB", symbol: "MB", name: ["메가바이트", "Megabyte"], factor: 1e6 },
      { id: "MiB", symbol: "MiB", name: ["메비바이트", "Mebibyte"], factor: 1024 ** 2 },
      { id: "GB", symbol: "GB", name: ["기가바이트", "Gigabyte"], factor: 1e9 },
      { id: "GiB", symbol: "GiB", name: ["기비바이트", "Gibibyte"], factor: 1024 ** 3 },
      { id: "TB", symbol: "TB", name: ["테라바이트", "Terabyte"], factor: 1e12 },
      { id: "TiB", symbol: "TiB", name: ["테비바이트", "Tebibyte"], factor: 1024 ** 4 },
      { id: "PB", symbol: "PB", name: ["페타바이트", "Petabyte"], factor: 1e15 },
    ],
  },
  {
    id: "pressure",
    name: ["압력", "Pressure"],
    base: "Pa",
    units: [
      { id: "Pa", symbol: "Pa", name: ["파스칼", "Pascal"], factor: 1 },
      { id: "hPa", symbol: "hPa", name: ["헥토파스칼", "Hectopascal"], factor: 100 },
      { id: "kPa", symbol: "kPa", name: ["킬로파스칼", "Kilopascal"], factor: 1000 },
      { id: "MPa", symbol: "MPa", name: ["메가파스칼", "Megapascal"], factor: 1e6 },
      { id: "bar", symbol: "bar", name: ["바", "Bar"], factor: 1e5 },
      { id: "atm", symbol: "atm", name: ["기압", "Atmosphere"], factor: 101325 },
      { id: "mmHg", symbol: "mmHg", name: ["수은주밀리미터", "Millimetre of mercury"], factor: 133.322387415 },
      { id: "psi", symbol: "psi", name: ["제곱인치당 파운드", "Pound per square inch"], factor: 6894.757293168 },
      { id: "kgfcm2", symbol: "kgf/cm²", name: ["킬로그램힘/제곱센티미터", "Kilogram-force per square centimetre"], factor: 98066.5 },
    ],
  },
  {
    id: "energy",
    name: ["에너지", "Energy"],
    base: "J",
    units: [
      { id: "J", symbol: "J", name: ["줄", "Joule"], factor: 1 },
      { id: "kJ", symbol: "kJ", name: ["킬로줄", "Kilojoule"], factor: 1000 },
      { id: "cal", symbol: "cal", name: ["칼로리", "Calorie"], factor: 4.184 },
      { id: "kcal", symbol: "kcal", name: ["킬로칼로리", "Kilocalorie"], factor: 4184 },
      { id: "Wh", symbol: "Wh", name: ["와트시", "Watt hour"], factor: 3600 },
      { id: "kWh", symbol: "kWh", name: ["킬로와트시", "Kilowatt hour"], factor: 3.6e6 },
      { id: "BTU", symbol: "BTU", name: ["영국열량단위", "British thermal unit"], factor: 1055.05585262 },
      { id: "eV", symbol: "eV", name: ["전자볼트", "Electronvolt"], factor: 1.602176634e-19 },
      { id: "ftlb", symbol: "ft·lbf", name: ["피트파운드", "Foot pound"], factor: 1.3558179483314004 },
    ],
  },
  {
    id: "power",
    name: ["일률", "Power"],
    base: "W",
    units: [
      { id: "mW", symbol: "mW", name: ["밀리와트", "Milliwatt"], factor: 0.001 },
      { id: "W", symbol: "W", name: ["와트", "Watt"], factor: 1 },
      { id: "kW", symbol: "kW", name: ["킬로와트", "Kilowatt"], factor: 1000 },
      { id: "MW", symbol: "MW", name: ["메가와트", "Megawatt"], factor: 1e6 },
      { id: "hp", symbol: "hp", name: ["마력", "Horsepower"], factor: 745.69987158227 },
      { id: "PS", symbol: "PS", name: ["미터마력", "Metric horsepower"], factor: 735.49875 },
      { id: "kcalh", symbol: "kcal/h", name: ["킬로칼로리/시", "Kilocalorie per hour"], factor: 4184 / 3600 },
      { id: "BTUh", symbol: "BTU/h", name: ["BTU/시", "BTU per hour"], factor: 1055.05585262 / 3600 },
    ],
  },
  {
    id: "angle",
    name: ["각도", "Angle"],
    base: "deg",
    units: [
      { id: "deg", symbol: "°", name: ["도", "Degree"], factor: 1 },
      { id: "rad", symbol: "rad", name: ["라디안", "Radian"], factor: 180 / Math.PI },
      { id: "grad", symbol: "grad", name: ["그라드", "Gradian"], factor: 0.9 },
      { id: "arcmin", symbol: "′", name: ["분", "Arcminute"], factor: 1 / 60 },
      { id: "arcsec", symbol: "″", name: ["초", "Arcsecond"], factor: 1 / 3600 },
      { id: "rev", symbol: "rev", name: ["회전", "Revolution"], factor: 360 },
    ],
  },
];

// The pair each group starts with, chosen so the first look is a familiar one.
const UNIT_DEFAULTS = {
  length: ["cm", "in"],
  area: ["m2", "pyeong"],
  volume: ["L", "gal"],
  mass: ["kg", "lb"],
  temperature: ["C", "F"],
  speed: ["kmh", "mph"],
  time: ["h", "min"],
  data: ["MB", "MiB"],
  pressure: ["hPa", "atm"],
  energy: ["kcal", "kJ"],
  power: ["kW", "hp"],
  angle: ["deg", "rad"],
};

function unitGroupById(id) {
  return UNIT_GROUPS.find((group) => group.id === id) || null;
}

function unitById(group, id) {
  if (!group) return null;
  return group.units.find((unit) => unit.id === id) || null;
}

function unitGroupLabel(group, lang) {
  if (!group) return "";
  return lang === "en" ? group.name[1] : group.name[0];
}

function unitLabel(unit, lang) {
  if (!unit) return "";
  return lang === "en" ? unit.name[1] : unit.name[0];
}

function unitToBase(unit, value) {
  if (!unit) return NaN;
  if (typeof unit.toBase === "function") return unit.toBase(value);
  return value * unit.factor;
}

function unitFromBase(unit, value) {
  if (!unit) return NaN;
  if (typeof unit.fromBase === "function") return unit.fromBase(value);
  return value / unit.factor;
}

function convertUnit(amount, groupId, fromId, toId) {
  if (!Number.isFinite(amount)) return NaN;
  const group = unitGroupById(groupId);
  const from = unitById(group, fromId);
  const to = unitById(group, toId);
  if (!from || !to) return NaN;
  return unitFromBase(to, unitToBase(from, amount));
}

// Eight significant digits read well for both 25.4 mm and 0.00000001 km.
function formatUnit(value) {
  if (!Number.isFinite(value)) return String.fromCharCode(8212);
  if (value === 0) return "0";
  const size = Math.abs(value);
  if (size >= 1e12 || size < 1e-6) return value.toExponential(6);
  const decimals = Math.max(0, Math.min(8, 7 - Math.floor(Math.log10(size))));
  return Number(value.toFixed(decimals)).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function unitDefaultPair(groupId) {
  const group = unitGroupById(groupId);
  if (!group) return ["", ""];
  const picked = UNIT_DEFAULTS[groupId] || [];
  const first = unitById(group, picked[0]) ? picked[0] : group.units[0].id;
  const second = unitById(group, picked[1]) ? picked[1] : group.units[1] ? group.units[1].id : first;
  return [first, second];
}

function validUnitPick(value) {
  if (!value || typeof value !== "object") return null;
  const group = unitGroupById(value.group);
  if (!group) return null;
  const from = unitById(group, value.from);
  const to = unitById(group, value.to);
  if (!from || !to) return null;
  return {
    group: group.id,
    from: from.id,
    to: to.id,
    amount: typeof value.amount === "string" ? value.amount : "1",
  };
}

function readStoredUnit() {
  try {
    return validUnitPick(JSON.parse(localStorage.getItem(UNIT_STORE)));
  } catch {
    return null;
  }
}

function storeUnitPick(pick) {
  try {
    localStorage.setItem(UNIT_STORE, JSON.stringify(pick));
  } catch {
    /* Private windows keep nothing; the choice stays in memory. */
  }
}
