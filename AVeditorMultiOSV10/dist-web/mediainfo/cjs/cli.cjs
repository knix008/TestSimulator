#!/usr/bin/env node
"use strict";

var _nodeFs = require("node:fs");
var _helpers = require("yargs/helpers");
var _yargs = _interopRequireDefault(require("yargs/yargs"));
var _error = require("./error.cjs");
var _MediaInfo = require("./MediaInfo.cjs");
var _mediaInfoFactory = _interopRequireDefault(require("./mediaInfoFactory.cjs"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const analyze = async ({
  coverData,
  file,
  format,
  full
}) => {
  let fileHandle;
  let fileSize;
  let mediainfo;
  if (!file) {
    throw new TypeError('No file received!');
  }
  if (coverData && !['JSON', 'XML'].includes(format)) {
    throw new TypeError('For cover data you need to choose JSON or XML as output format!');
  }
  const readChunk = async (size, offset) => {
    if (fileHandle === undefined) {
      throw new Error('File unavailable');
    }
    const buffer = new Uint8Array(size);
    await fileHandle.read(buffer, 0, size, offset);
    return buffer;
  };
  try {
    fileHandle = await _nodeFs.promises.open(file, 'r');
    const fileStat = await fileHandle.stat();
    fileSize = fileStat.size;
    try {
      mediainfo = await (0, _mediaInfoFactory.default)({
        format,
        coverData,
        full
      });
    } catch (error) {
      throw (0, _error.unknownToError)(error);
    }
    console.log(await mediainfo.analyzeData(() => fileSize, readChunk));
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
    if (mediainfo) {
      mediainfo.close();
    }
  }
};
function parseArgs() {
  const yargsInstance = (0, _yargs.default)((0, _helpers.hideBin)(process.argv));
  return yargsInstance.wrap(yargsInstance.terminalWidth()).option('format', {
    alias: 'f',
    default: 'text',
    describe: 'Choose format',
    choices: _MediaInfo.FORMAT_CHOICES
  }).option('cover-data', {
    default: false,
    describe: 'Output cover data as base64',
    type: 'boolean'
  }).option('full', {
    default: false,
    describe: 'Full information display (all internal tags)',
    type: 'boolean'
  }).command('$0 <file>', 'Show information about media file').positional('file', {
    describe: 'File to analyze',
    type: 'string'
  }).help('h').alias('h', 'help').fail((message, error, argv) => {
    if (message) {
      console.error(argv.help());
      console.error(message);
    }
    console.error(error.message);
    process.exit(1);
  }).parseSync();
}
try {
  await analyze(parseArgs());
} catch (error) {
  console.error((0, _error.unknownToError)(error).message);
}
//# sourceMappingURL=cli.cjs.map
