// Window background colors, kept in step with core/themes.ts so the first paint matches
// the theme instead of flashing white.
const BACKGROUNDS = {
  light: "#f1f3f7",
  dark: "#111722",
};

function themeBackground(id) {
  return BACKGROUNDS[id] || BACKGROUNDS.light;
}

module.exports = { themeBackground, BACKGROUNDS };
