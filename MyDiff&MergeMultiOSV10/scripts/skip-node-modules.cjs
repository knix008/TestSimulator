/**
 * Tells electron-builder that node_modules are already handled.
 *
 * Returning false sets areNodeModulesHandledExternally, which skips both the
 * native-module rebuild and the production-dependency walk. That walk is only
 * noise here: the server is bundled into dist-server/, and the files list
 * excludes node_modules. Without this, electron-builder logs
 * "duplicate dependency references" once for every architecture it packages.
 */
module.exports = async function beforeBuild() {
  return false;
};
