// The window background color for a theme id.
//
// Reads the same seed table `core/themes.ts` does, so a window never opens in a color
// the stylesheet is about to replace — which is what a white flash on a dark theme is.
const seeds = require("../core/themeSeeds.json");

const BY_ID = new Map(seeds.map((seed) => [seed.id, seed.bg]));

function themeBackground(id) {
  return BY_ID.get(id) || BY_ID.get("light") || "#f1f3f7";
}

function isDarkTheme(id) {
  const seed = seeds.find((item) => item.id === id);
  return Boolean(seed && seed.kind === "dark");
}

module.exports = { themeBackground, isDarkTheme, seeds };
