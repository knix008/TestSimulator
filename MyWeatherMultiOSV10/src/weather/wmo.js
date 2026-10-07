const TEXT = {
  0: ["맑음", "Clear"],
  1: ["대체로 맑음", "Mainly clear"],
  2: ["부분적으로 흐림", "Partly cloudy"],
  3: ["흐림", "Overcast"],
  45: ["안개", "Fog"],
  48: ["상고대 안개", "Rime fog"],
  51: ["약한 이슬비", "Light drizzle"],
  53: ["이슬비", "Drizzle"],
  55: ["강한 이슬비", "Dense drizzle"],
  61: ["약한 비", "Slight rain"],
  63: ["비", "Rain"],
  65: ["강한 비", "Heavy rain"],
  71: ["약한 눈", "Slight snow"],
  73: ["눈", "Snow"],
  75: ["강한 눈", "Heavy snow"],
  80: ["소나기", "Rain showers"],
  81: ["보통 소나기", "Moderate showers"],
  82: ["강한 소나기", "Violent showers"],
  95: ["뇌우", "Thunderstorm"],
  96: ["우박을 동반한 뇌우", "Thunderstorm with hail"],
  99: ["강한 우박 뇌우", "Heavy hail thunderstorm"],
};

export function conditionText(code, language) {
  const row = TEXT[Number(code)];
  if (!row) return language === "ko" ? "알 수 없음" : "Unknown";
  return language === "ko" ? row[0] : row[1];
}

export function conditionIcon(code) {
  const n = Number(code);
  if (n === 0 || n === 1) return "sun";
  if (n === 2) return "partly";
  if (n === 3) return "cloud";
  if (n === 45 || n === 48) return "fog";
  if (n >= 71 && n <= 75) return "snow";
  if (n >= 95) return "storm";
  if (n >= 51) return "rain";
  return "cloud";
}

const MET_SYMBOLS = [
  ["clearsky", 0],
  ["fair", 1],
  ["partlycloudy", 2],
  ["cloudy", 3],
  ["fog", 45],
  ["heavyrain", 65],
  ["lightrain", 61],
  ["rain", 63],
  ["heavysnow", 75],
  ["snow", 73],
  ["thunderstorm", 95],
  ["sleet", 71],
];

export function metSymbolToWmo(symbol) {
  const value = String(symbol || "").toLowerCase();
  for (const [name, code] of MET_SYMBOLS) {
    if (value.includes(name)) return code;
  }
  return 2;
}

const WTTR = {
  113: 0,
  116: 2,
  119: 3,
  122: 3,
  143: 45,
  176: 61,
  179: 71,
  200: 95,
  227: 73,
  230: 75,
  248: 45,
  260: 48,
  263: 51,
  266: 53,
  281: 51,
  284: 55,
  293: 61,
  296: 61,
  299: 63,
  302: 63,
  305: 65,
  308: 65,
  329: 73,
  332: 73,
  335: 75,
  338: 75,
  353: 80,
  356: 81,
  359: 82,
  386: 95,
  389: 95,
  392: 96,
};

export function wttrToWmo(code) {
  return WTTR[Number(code)] ?? 2;
}
