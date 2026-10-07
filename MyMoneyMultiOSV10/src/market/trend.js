/** How a quote moved, in the three words the scene and the lists use. */

const TEXT = {
  up: ["상승", "Up"],
  down: ["하락", "Down"],
  flat: ["보합", "Unchanged"],
  none: ["자료 없음", "No data"],
};

/** Anything inside a tenth of a percent reads as unchanged. */
export const FLAT_BAND = 0.05;

export function trendOf(changePercent) {
  if (changePercent == null || Number.isNaN(Number(changePercent))) return "none";
  const value = Number(changePercent);
  if (value > FLAT_BAND) return "up";
  if (value < -FLAT_BAND) return "down";
  return "flat";
}

export function trendText(trend, language) {
  const row = TEXT[trend] || TEXT.none;
  return language === "en" ? row[1] : row[0];
}

export function trendIcon(trend) {
  if (trend === "up") return "up";
  if (trend === "down") return "down";
  if (trend === "flat") return "flat";
  return "blank";
}

/** Korean and most Asian markets paint gains red; the app follows the Western convention everywhere. */
export function trendTone(trend) {
  if (trend === "up") return "gain";
  if (trend === "down") return "loss";
  return "even";
}
