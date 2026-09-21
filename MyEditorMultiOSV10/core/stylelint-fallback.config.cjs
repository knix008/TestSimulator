// Used when the document's folder has no Stylelint config. Enough to
// report invalid CSS after the checker is installed from settings.
module.exports = {
  rules: {
    'color-no-invalid-hex': true,
    'block-no-empty': true,
    'declaration-block-no-duplicate-properties': true,
    'property-no-unknown': true,
  },
};
