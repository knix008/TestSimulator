/* DICOM decoder — works in Electron main (CommonJS) and in the renderer / browser.
 *
 *   DicomDecoder.load(bytes) → Promise<image>
 *     image.width / height / frames / gray / photometric / modality …
 *     image.fileWindows          [{ wc, ww, label }] from the file (may be empty)
 *     image.presets              window presets for the modality (CT: brain, lung, bone …)
 *     image.state                { frame, wc, ww, invert } currently rendered
 *     image.range                { min, max } of the rendered frame (rescaled units)
 *     image.meta                 summary for the info panel (patient, study, series, pixel format …)
 *     image.tags                 every top-level element: [{ tag, name, vr, value }]
 *     image.render({ frame, wc, ww, invert }) → Promise<{ rgba, width, height, state }>
 *     image.toCanvas(opts)       browser only → Promise<{ canvas, state }>
 *     image.toDataUrl(opts)      browser only → Promise<{ dataUrl, state }>
 *
 * Tags are read with dicom-parser. Pixel data is decoded with the codec the transfer
 * syntax asks for: implicit / explicit little endian, explicit big endian, deflated,
 * RLE lossless (here), JPEG baseline / extended 12-bit (libjpeg-turbo), JPEG lossless
 * (jpeg-lossless-decoder-js), JPEG-LS (CharLS), JPEG 2000 / HTJ2K (OpenJPEG).
 * Photometric interpretations: MONOCHROME1 / 2, RGB, YBR_FULL / YBR_FULL_422, PALETTE COLOR.
 * 8 / 16 / 32-bit samples, signed or unsigned, multi-frame, modality rescale, VOI windows.
 *
 * Codecs are loaded on first use: `require()` in Node, a <script> tag from
 * `../node_modules/` (relative to the page) in the browser — see setVendorBase().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DicomDecoder = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const IS_NODE = typeof process === 'object' && process !== null
    && typeof process.versions === 'object' && !!process.versions.node
    && typeof window === 'undefined';

  /* ── Transfer syntaxes ── */
  const TS = {
    IMPLICIT_LE: '1.2.840.10008.1.2',
    EXPLICIT_LE: '1.2.840.10008.1.2.1',
    DEFLATED_LE: '1.2.840.10008.1.2.1.99',
    EXPLICIT_BE: '1.2.840.10008.1.2.2',
    RLE: '1.2.840.10008.1.2.5',
    JPEG_BASELINE: '1.2.840.10008.1.2.4.50',
    JPEG_EXTENDED: '1.2.840.10008.1.2.4.51',
    JPEG_LOSSLESS: '1.2.840.10008.1.2.4.57',
    JPEG_LOSSLESS_SV1: '1.2.840.10008.1.2.4.70',
    JPEG_LS_LOSSLESS: '1.2.840.10008.1.2.4.80',
    JPEG_LS: '1.2.840.10008.1.2.4.81',
    J2K_LOSSLESS: '1.2.840.10008.1.2.4.90',
    J2K: '1.2.840.10008.1.2.4.91',
    HTJ2K_LOSSLESS: '1.2.840.10008.1.2.4.201',
    HTJ2K_LOSSLESS_RPCL: '1.2.840.10008.1.2.4.202',
    HTJ2K: '1.2.840.10008.1.2.4.203',
  };
  const TS_NAME = {
    [TS.IMPLICIT_LE]: 'Implicit VR Little Endian',
    [TS.EXPLICIT_LE]: 'Explicit VR Little Endian',
    [TS.DEFLATED_LE]: 'Deflated Explicit VR Little Endian',
    [TS.EXPLICIT_BE]: 'Explicit VR Big Endian',
    [TS.RLE]: 'RLE Lossless',
    [TS.JPEG_BASELINE]: 'JPEG Baseline (8-bit)',
    [TS.JPEG_EXTENDED]: 'JPEG Extended (12-bit)',
    [TS.JPEG_LOSSLESS]: 'JPEG Lossless',
    [TS.JPEG_LOSSLESS_SV1]: 'JPEG Lossless (SV1)',
    [TS.JPEG_LS_LOSSLESS]: 'JPEG-LS Lossless',
    [TS.JPEG_LS]: 'JPEG-LS Near-lossless',
    [TS.J2K_LOSSLESS]: 'JPEG 2000 Lossless',
    [TS.J2K]: 'JPEG 2000',
    [TS.HTJ2K_LOSSLESS]: 'HTJ2K Lossless',
    [TS.HTJ2K_LOSSLESS_RPCL]: 'HTJ2K Lossless (RPCL)',
    [TS.HTJ2K]: 'HTJ2K',
  };
  const JPEG_FAMILY = new Set([
    TS.JPEG_BASELINE, TS.JPEG_EXTENDED, TS.JPEG_LOSSLESS, TS.JPEG_LOSSLESS_SV1,
    TS.JPEG_LS_LOSSLESS, TS.JPEG_LS, TS.J2K_LOSSLESS, TS.J2K,
    TS.HTJ2K_LOSSLESS, TS.HTJ2K_LOSSLESS_RPCL, TS.HTJ2K,
  ]);
  const J2K_FAMILY = new Set([TS.J2K_LOSSLESS, TS.J2K, TS.HTJ2K_LOSSLESS, TS.HTJ2K_LOSSLESS_RPCL, TS.HTJ2K]);

  /* CT window presets (Hounsfield units). Other modalities get "file" / "auto" only. */
  const CT_PRESETS = [
    { id: 'brain',       wc: 40,   ww: 80 },
    { id: 'subdural',    wc: 75,   ww: 215 },
    { id: 'stroke',      wc: 32,   ww: 8 },
    { id: 'soft',        wc: 50,   ww: 400 },
    { id: 'liver',       wc: 60,   ww: 150 },
    { id: 'mediastinum', wc: 50,   ww: 350 },
    { id: 'lung',        wc: -600, ww: 1500 },
    { id: 'bone',        wc: 400,  ww: 1800 },
  ];

  const SOP_CLASS = {
    '1.2.840.10008.5.1.4.1.1.1': 'CR Image', '1.2.840.10008.5.1.4.1.1.1.1': 'Digital X-Ray Image',
    '1.2.840.10008.5.1.4.1.1.1.2': 'Digital Mammography Image', '1.2.840.10008.5.1.4.1.1.2': 'CT Image',
    '1.2.840.10008.5.1.4.1.1.2.1': 'Enhanced CT Image', '1.2.840.10008.5.1.4.1.1.3.1': 'Ultrasound Multi-frame Image',
    '1.2.840.10008.5.1.4.1.1.4': 'MR Image', '1.2.840.10008.5.1.4.1.1.4.1': 'Enhanced MR Image',
    '1.2.840.10008.5.1.4.1.1.6.1': 'Ultrasound Image', '1.2.840.10008.5.1.4.1.1.7': 'Secondary Capture Image',
    '1.2.840.10008.5.1.4.1.1.12.1': 'X-Ray Angiographic Image', '1.2.840.10008.5.1.4.1.1.12.2': 'X-Ray Radiofluoroscopic Image',
    '1.2.840.10008.5.1.4.1.1.20': 'Nuclear Medicine Image', '1.2.840.10008.5.1.4.1.1.77.1.4': 'VL Photographic Image',
    '1.2.840.10008.5.1.4.1.1.77.1.5.1': 'Ophthalmic Photography 8-bit Image', '1.2.840.10008.5.1.4.1.1.128': 'PET Image',
    '1.2.840.10008.5.1.4.1.1.481.1': 'RT Image',
  };

  /* Tag dictionary for the "All DICOM tags" listing (common public tags). */
  const DICT = {
    '00020001': 'File Meta Information Version', '00020002': 'Media Storage SOP Class UID', '00020003': 'Media Storage SOP Instance UID',
    '00020010': 'Transfer Syntax UID', '00020012': 'Implementation Class UID', '00020013': 'Implementation Version Name', '00020016': 'Source Application Entity Title',
    '00080005': 'Specific Character Set', '00080008': 'Image Type', '00080012': 'Instance Creation Date', '00080013': 'Instance Creation Time',
    '00080014': 'Instance Creator UID', '00080016': 'SOP Class UID', '00080018': 'SOP Instance UID', '00080020': 'Study Date', '00080021': 'Series Date',
    '00080022': 'Acquisition Date', '00080023': 'Content Date', '0008002A': 'Acquisition DateTime', '00080030': 'Study Time', '00080031': 'Series Time',
    '00080032': 'Acquisition Time', '00080033': 'Content Time', '00080050': 'Accession Number', '00080060': 'Modality', '00080064': 'Conversion Type',
    '00080068': 'Presentation Intent Type', '00080070': 'Manufacturer', '00080080': 'Institution Name', '00080081': 'Institution Address',
    '00080090': 'Referring Physician Name', '00081010': 'Station Name', '00081030': 'Study Description', '00081032': 'Procedure Code Sequence',
    '0008103E': 'Series Description', '00081040': 'Institutional Department Name', '00081048': 'Physician(s) of Record', '00081050': 'Performing Physician Name',
    '00081060': 'Name of Physician(s) Reading Study', '00081070': 'Operators Name', '00081080': 'Admitting Diagnoses Description', '00081090': 'Manufacturer Model Name',
    '00081110': 'Referenced Study Sequence', '00081111': 'Referenced Performed Procedure Step Sequence', '00081120': 'Referenced Patient Sequence',
    '00081140': 'Referenced Image Sequence', '00081150': 'Referenced SOP Class UID', '00081155': 'Referenced SOP Instance UID', '00082111': 'Derivation Description',
    '00082112': 'Source Image Sequence', '00082218': 'Anatomic Region Sequence', '00089215': 'Derivation Code Sequence',
    '00100010': 'Patient Name', '00100020': 'Patient ID', '00100021': 'Issuer of Patient ID', '00100030': 'Patient Birth Date', '00100032': 'Patient Birth Time',
    '00100040': 'Patient Sex', '00101000': 'Other Patient IDs', '00101001': 'Other Patient Names', '00101010': 'Patient Age', '00101020': 'Patient Size',
    '00101030': 'Patient Weight', '00102160': 'Ethnic Group', '00102180': 'Occupation', '001021B0': 'Additional Patient History', '00104000': 'Patient Comments',
    '00120062': 'Patient Identity Removed', '00120063': 'De-identification Method',
    '00180010': 'Contrast/Bolus Agent', '00180015': 'Body Part Examined', '00180020': 'Scanning Sequence', '00180021': 'Sequence Variant', '00180022': 'Scan Options',
    '00180023': 'MR Acquisition Type', '00180024': 'Sequence Name', '00180025': 'Angio Flag', '00180050': 'Slice Thickness', '00180060': 'KVP',
    '00180080': 'Repetition Time', '00180081': 'Echo Time', '00180082': 'Inversion Time', '00180083': 'Number of Averages', '00180084': 'Imaging Frequency',
    '00180085': 'Imaged Nucleus', '00180086': 'Echo Number(s)', '00180087': 'Magnetic Field Strength', '00180088': 'Spacing Between Slices',
    '00180089': 'Number of Phase Encoding Steps', '00180090': 'Data Collection Diameter', '00180091': 'Echo Train Length', '00180093': 'Percent Sampling',
    '00180094': 'Percent Phase Field of View', '00180095': 'Pixel Bandwidth', '00181000': 'Device Serial Number', '00181004': 'Plate ID', '00181010': 'Secondary Capture Device ID',
    '00181016': 'Secondary Capture Device Manufacturer', '00181018': 'Secondary Capture Device Manufacturer Model Name', '00181019': 'Secondary Capture Device Software Versions',
    '00181020': 'Software Versions', '00181030': 'Protocol Name', '00181040': 'Contrast/Bolus Route', '00181041': 'Contrast/Bolus Volume', '00181050': 'Spatial Resolution',
    '00181063': 'Frame Time', '00181065': 'Frame Time Vector', '00181088': 'Heart Rate', '00181100': 'Reconstruction Diameter', '00181110': 'Distance Source to Detector',
    '00181111': 'Distance Source to Patient', '00181120': 'Gantry/Detector Tilt', '00181130': 'Table Height', '00181140': 'Rotation Direction', '00181150': 'Exposure Time',
    '00181151': 'X-Ray Tube Current', '00181152': 'Exposure', '00181153': 'Exposure in µAs', '00181160': 'Filter Type', '00181164': 'Imager Pixel Spacing',
    '00181170': 'Generator Power', '00181190': 'Focal Spot(s)', '00181200': 'Date of Last Calibration', '00181201': 'Time of Last Calibration',
    '00181210': 'Convolution Kernel', '00181250': 'Receive Coil Name', '00181251': 'Transmit Coil Name', '00181310': 'Acquisition Matrix', '00181312': 'In-plane Phase Encoding Direction',
    '00181314': 'Flip Angle', '00181315': 'Variable Flip Angle Flag', '00181316': 'SAR', '00181318': 'dB/dt', '00185100': 'Patient Position', '00185101': 'View Position',
    '00186011': 'Sequence of Ultrasound Regions', '00187004': 'Detector Type', '00187030': 'Field of View Origin', '00187050': 'Filter Material', '00188150': 'Exposure Time in µs',
    '00188151': 'X-Ray Tube Current in µA', '00189004': 'Content Qualification', '00189073': 'Acquisition Duration',
    '0020000D': 'Study Instance UID', '0020000E': 'Series Instance UID', '00200010': 'Study ID', '00200011': 'Series Number', '00200012': 'Acquisition Number',
    '00200013': 'Instance Number', '00200020': 'Patient Orientation', '00200032': 'Image Position (Patient)', '00200037': 'Image Orientation (Patient)',
    '00200052': 'Frame of Reference UID', '00200060': 'Laterality', '00200062': 'Image Laterality', '00201002': 'Images in Acquisition', '00201040': 'Position Reference Indicator',
    '00201041': 'Slice Location', '00204000': 'Image Comments', '00209056': 'Stack ID', '00209057': 'In-Stack Position Number',
    '00280002': 'Samples per Pixel', '00280004': 'Photometric Interpretation', '00280006': 'Planar Configuration', '00280008': 'Number of Frames', '00280009': 'Frame Increment Pointer',
    '00280010': 'Rows', '00280011': 'Columns', '00280014': 'Ultrasound Color Data Present', '00280030': 'Pixel Spacing', '00280034': 'Pixel Aspect Ratio',
    '00280100': 'Bits Allocated', '00280101': 'Bits Stored', '00280102': 'High Bit', '00280103': 'Pixel Representation', '00280106': 'Smallest Image Pixel Value',
    '00280107': 'Largest Image Pixel Value', '00280120': 'Pixel Padding Value', '00280121': 'Pixel Padding Range Limit', '00280300': 'Quality Control Image',
    '00280301': 'Burned In Annotation', '00280302': 'Recognizable Visual Features', '00280303': 'Longitudinal Temporal Information Modified', '00281040': 'Pixel Intensity Relationship',
    '00281041': 'Pixel Intensity Relationship Sign', '00281050': 'Window Center', '00281051': 'Window Width', '00281052': 'Rescale Intercept', '00281053': 'Rescale Slope',
    '00281054': 'Rescale Type', '00281055': 'Window Center & Width Explanation', '00281056': 'VOI LUT Function', '00281101': 'Red Palette Color Lookup Table Descriptor',
    '00281102': 'Green Palette Color Lookup Table Descriptor', '00281103': 'Blue Palette Color Lookup Table Descriptor', '00281201': 'Red Palette Color Lookup Table Data',
    '00281202': 'Green Palette Color Lookup Table Data', '00281203': 'Blue Palette Color Lookup Table Data', '00282110': 'Lossy Image Compression',
    '00282112': 'Lossy Image Compression Ratio', '00282114': 'Lossy Image Compression Method', '00283000': 'Modality LUT Sequence', '00283010': 'VOI LUT Sequence',
    '00286010': 'Representative Frame Number', '00286020': 'Frame Numbers of Interest', '00289001': 'Data Point Rows', '00289002': 'Data Point Columns',
    '00321032': 'Requesting Physician', '00321060': 'Requested Procedure Description', '00321064': 'Requested Procedure Code Sequence', '00324000': 'Study Comments',
    '00380010': 'Admission ID', '00380050': 'Special Needs', '00380300': 'Current Patient Location', '00380500': 'Patient State',
    '00400002': 'Scheduled Procedure Step Start Date', '00400244': 'Performed Procedure Step Start Date', '00400245': 'Performed Procedure Step Start Time',
    '00400253': 'Performed Procedure Step ID', '00400254': 'Performed Procedure Step Description', '00400260': 'Performed Protocol Code Sequence',
    '00400275': 'Request Attributes Sequence', '00401001': 'Requested Procedure ID', '00402016': 'Placer Order Number', '00402017': 'Filler Order Number',
    '0040A040': 'Value Type', '0040A043': 'Concept Name Code Sequence', '0040A730': 'Content Sequence',
    '00540011': 'Number of Energy Windows', '00540016': 'Radiopharmaceutical Information Sequence', '00540081': 'Number of Slices', '00540400': 'Image ID',
    '00541001': 'Units', '00541002': 'Counts Source', '00541100': 'Randoms Correction Method', '00541101': 'Attenuation Correction Method',
    '00541102': 'Decay Correction', '00541103': 'Reconstruction Method', '00541300': 'Frame Reference Time', '00541321': 'Decay Factor',
    '00541322': 'Dose Calibration Factor', '00541330': 'Image Index',
    '00700080': 'Content Label', '00700081': 'Content Description', '00700082': 'Presentation Creation Date', '00700083': 'Presentation Creation Time',
    '00880140': 'Storage Media File-set UID', '00880200': 'Icon Image Sequence',
    '20500020': 'Presentation LUT Shape',
    '52009229': 'Shared Functional Groups Sequence', '52009230': 'Per-frame Functional Groups Sequence',
    '7FE00008': 'Float Pixel Data', '7FE00009': 'Double Float Pixel Data', '7FE00010': 'Pixel Data',
    'FFFCFFFC': 'Data Set Trailing Padding',
  };
  // VRs that hold text
  const STRING_VR = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UI', 'UR', 'UT']);
  // Implicit VR files carry no VR — a small table so the common numeric tags still print as numbers.
  const IMPLICIT_VR = {
    '00280002': 'US', '00280006': 'US', '00280010': 'US', '00280011': 'US', '00280100': 'US', '00280101': 'US', '00280102': 'US',
    '00280103': 'US', '00280106': 'US', '00280107': 'US', '00280120': 'US', '00280121': 'US', '00281101': 'US', '00281102': 'US', '00281103': 'US',
    '00280008': 'IS', '00280030': 'DS', '00280034': 'IS', '00281050': 'DS', '00281051': 'DS', '00281052': 'DS', '00281053': 'DS', '00281054': 'LO', '00281055': 'LO',
    '00180050': 'DS', '00180088': 'DS', '00180060': 'DS', '00181150': 'IS', '00181151': 'IS', '00181152': 'IS', '00181210': 'SH', '00185100': 'CS',
    '00200011': 'IS', '00200012': 'IS', '00200013': 'IS', '00200032': 'DS', '00200037': 'DS', '00201041': 'DS', '00201002': 'IS', '00200010': 'SH',
    '00080008': 'CS', '00080016': 'UI', '00080018': 'UI', '00080020': 'DA', '00080021': 'DA', '00080022': 'DA', '00080023': 'DA', '00080030': 'TM', '00080031': 'TM',
    '00080032': 'TM', '00080033': 'TM', '00080050': 'SH', '00080060': 'CS', '00080064': 'CS', '00080070': 'LO', '00080080': 'LO', '00080090': 'PN', '00081010': 'SH',
    '00081030': 'LO', '0008103E': 'LO', '00081040': 'LO', '00081090': 'LO', '00081050': 'PN', '00081070': 'PN', '00082111': 'ST', '00080005': 'CS',
    '00100010': 'PN', '00100020': 'LO', '00100030': 'DA', '00100040': 'CS', '00101010': 'AS', '00101020': 'DS', '00101030': 'DS', '00104000': 'LT', '00102160': 'SH',
    '00180010': 'LO', '00180015': 'CS', '00180020': 'CS', '00180021': 'CS', '00180022': 'CS', '00180023': 'CS', '00180024': 'SH', '00180080': 'DS', '00180081': 'DS',
    '00180082': 'DS', '00180083': 'DS', '00180084': 'DS', '00180085': 'SH', '00180086': 'IS', '00180087': 'DS', '00180091': 'IS', '00180095': 'DS', '00181000': 'LO',
    '00181016': 'LO', '00181018': 'LO', '00181020': 'LO', '00181030': 'LO', '00181063': 'DS', '00181100': 'DS', '00181110': 'DS', '00181111': 'DS', '00181120': 'DS',
    '00181130': 'DS', '00181140': 'CS', '00181164': 'DS', '00181310': 'US', '00181312': 'CS', '00181314': 'DS', '00181250': 'SH', '00181251': 'SH', '00181160': 'SH',
    '0020000D': 'UI', '0020000E': 'UI', '00200020': 'CS', '00200052': 'UI', '00200060': 'CS', '00200062': 'CS', '00204000': 'LT', '00282110': 'CS', '00282112': 'DS',
    '00282114': 'CS', '00280004': 'CS', '00280301': 'CS', '00280300': 'CS', '00020010': 'UI', '00020002': 'UI', '00020003': 'UI', '00020012': 'UI', '00020013': 'SH',
    '00380010': 'LO', '00400244': 'DA', '00400245': 'TM', '00400253': 'SH', '00400254': 'LO', '00321060': 'LO', '00324000': 'LT', '00120062': 'CS', '00120063': 'LO',
  };

  /* ── Vendor modules (parser + codecs) ── */
  const VENDOR = {
    parser:   { node: 'dicom-parser', browser: 'dicom-parser/dist/dicomParser.min.js', global: 'dicomParser' },
    j2k:      { node: '@cornerstonejs/codec-openjpeg/decode', browser: '@cornerstonejs/codec-openjpeg/dist/openjpegjs_decode.js', global: 'OpenJPEGJS', factory: true },
    jpegls:   { node: '@cornerstonejs/codec-charls/decode', browser: '@cornerstonejs/codec-charls/dist/charlsjs_decode.js', global: 'CharLS', factory: true },
    jpeg8:    { node: '@cornerstonejs/codec-libjpeg-turbo-8bit/decode', browser: '@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbojs_decode.js', global: 'libjpegturbojs_decode', factory: true },
    jpeg12:   { node: '@cornerstonejs/codec-libjpeg-turbo-12bit', browser: '@cornerstonejs/codec-libjpeg-turbo-12bit/dist/libjpegturbo12js.js', global: 'libjpegturbo12js', factory: true },
    lossless: { node: 'jpeg-lossless-decoder-js', browser: 'jpeg-lossless-decoder-js/release/cjs/lossless.cjs', cjs: true },
  };
  const vendorCache = {};
  let vendorBase = null;

  function setVendorBase(url) { vendorBase = url; }

  function _vendorBase() {
    if (vendorBase) return vendorBase;
    if (typeof document !== 'undefined') {
      try { return new URL('../node_modules/', document.baseURI).href; } catch { /* fall through */ }
    }
    return '../node_modules/';
  }

  function _loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Could not load ${url}`));
      document.head.appendChild(s);
    });
  }

  function vendor(kind) {
    if (!vendorCache[kind]) {
      vendorCache[kind] = (async () => {
        const v = VENDOR[kind];
        if (!v) throw new Error(`Unknown vendor module ${kind}`);
        let mod;
        if (IS_NODE) {
          mod = require(v.node);
          if (mod && mod.default && v.factory) mod = mod.default;
        } else {
          const url = _vendorBase() + v.browser;
          if (v.cjs) {
            // A CommonJS build: give it a `module` to write to while it loads.
            const g = window;
            const prev = g.module;
            const shim = { exports: {} };
            g.module = shim;
            try { await _loadScript(url); } finally { if (prev === undefined) delete g.module; else g.module = prev; }
            mod = shim.exports;
          } else {
            if (!window[v.global]) await _loadScript(url);
            mod = window[v.global];
          }
        }
        if (!mod) throw new Error(`Vendor module ${kind} did not load`);
        if (v.factory) mod = await mod({ print() {}, printErr() {} });
        return mod;
      })().catch((err) => { delete vendorCache[kind]; throw err; });
    }
    return vendorCache[kind];
  }

  /** Preload everything a DICOM might need (optional; codecs load lazily anyway). */
  function preload(kinds) {
    return Promise.all((kinds || ['parser']).map((k) => vendor(k).catch(() => null)));
  }

  /* ── Helpers ── */
  function toU8(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
    return new Uint8Array(input);
  }

  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };
  const clean = (s) => String(s == null ? '' : s).replace(/\0+$/g, '').trim();
  const person = (s) => clean(s).replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim();
  const fmtDate = (s) => { const m = /^(\d{4})(\d{2})(\d{2})/.exec(clean(s)); return m ? `${m[1]}-${m[2]}-${m[3]}` : clean(s); };
  const fmtTime = (s) => { const m = /^(\d{2})(\d{2})(\d{2})?/.exec(clean(s)); return m ? `${m[1]}:${m[2]}${m[3] ? ':' + m[3] : ''}` : clean(s); };
  const fmtNum = (v) => (Number.isFinite(v) ? (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : String(+v.toFixed(4))) : '');

  /* ── Raw DEFLATE (RFC 1951) inflater ──
   * Own implementation: the browser's DecompressionStream aborts on the trailing bytes
   * some DICOM writers leave after the stream, and drops output when it does. */
  const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function buildHuffman(lengths) {
    const count = new Uint16Array(16);
    for (const l of lengths) count[l]++;
    count[0] = 0;
    const offs = new Uint16Array(16);
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    const symbols = new Uint16Array(lengths.length);
    for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbols[offs[lengths[s]]++] = s;
    return { count, symbols };
  }

  function inflateRawSync(src) {
    let out = new Uint8Array(Math.max(1024, src.length * 4));
    let outLen = 0;
    let pos = 0, bitBuf = 0, bitCnt = 0;
    const ensure = (n) => {
      if (outLen + n <= out.length) return;
      let cap = out.length * 2;
      while (cap < outLen + n) cap *= 2;
      const grown = new Uint8Array(cap);
      grown.set(out.subarray(0, outLen));
      out = grown;
    };
    const bits = (n) => {
      while (bitCnt < n) {
        if (pos >= src.length) throw new Error('Deflate stream is truncated');
        bitBuf |= src[pos++] << bitCnt;
        bitCnt += 8;
      }
      const v = bitBuf & ((1 << n) - 1);
      bitBuf >>>= n;
      bitCnt -= n;
      return v;
    };
    const decodeSym = (h) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const c = h.count[len];
        if (code - c < first) return h.symbols[index + (code - first)];
        index += c;
        first += c;
        first <<= 1;
        code <<= 1;
      }
      throw new Error('Deflate stream is corrupt (bad code)');
    };
    const fixedLit = (() => { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288); return buildHuffman(l); })();
    const fixedDist = buildHuffman(new Uint8Array(30).fill(5));

    let final = 0;
    do {
      final = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitBuf = 0; bitCnt = 0;   // stored: byte aligned
        if (pos + 4 > src.length) throw new Error('Deflate stream is truncated');
        const len = src[pos] | (src[pos + 1] << 8);
        pos += 4;
        if (pos + len > src.length) throw new Error('Deflate stream is truncated');
        ensure(len);
        out.set(src.subarray(pos, pos + len), outLen);
        outLen += len;
        pos += len;
        continue;
      }
      let lit, dist;
      if (type === 1) {
        lit = fixedLit; dist = fixedDist;
      } else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
        const clh = buildHuffman(cl);
        const lengths = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist;) {
          const sym = decodeSym(clh);
          if (sym < 16) lengths[i++] = sym;
          else if (sym === 16) { const prev = lengths[i - 1]; let r = 3 + bits(2); while (r--) lengths[i++] = prev; }
          else if (sym === 17) { let r = 3 + bits(3); while (r--) lengths[i++] = 0; }
          else { let r = 11 + bits(7); while (r--) lengths[i++] = 0; }
        }
        lit = buildHuffman(lengths.subarray(0, hlit));
        dist = buildHuffman(lengths.subarray(hlit));
      } else {
        throw new Error('Deflate stream is corrupt (bad block type)');
      }
      for (;;) {
        const sym = decodeSym(lit);
        if (sym < 256) { ensure(1); out[outLen++] = sym; continue; }
        if (sym === 256) break;
        const li = sym - 257;
        if (li >= 29) throw new Error('Deflate stream is corrupt (bad length)');
        const len = LEN_BASE[li] + bits(LEN_EXTRA[li]);
        const di = decodeSym(dist);
        if (di >= 30) throw new Error('Deflate stream is corrupt (bad distance)');
        const d = DIST_BASE[di] + bits(DIST_EXTRA[di]);
        if (d > outLen) throw new Error('Deflate stream is corrupt (distance too far)');
        ensure(len);
        for (let k = 0; k < len; k++) { out[outLen] = out[outLen - d]; outLen++; }
      }
    } while (!final);
    return out.subarray(0, outLen);
  }

  async function inflateRaw(bytes) {
    if (IS_NODE) {
      try {
        const zlib = require('zlib');
        const out = zlib.inflateRawSync(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
      } catch { /* fall back to the JS inflater */ }
    }
    return inflateRawSync(bytes);
  }

  function errorMessage(err) {
    if (!err) return 'unknown error';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (err.exception) return errorMessage(err.exception);
    return String(err);
  }

  /* ── Parse ── */
  async function parseDataSet(bytes) {
    const dicomParser = await vendor('parser');
    let header = null;
    try { header = dicomParser.readPart10Header(bytes); } catch { header = null; }
    const ts = header ? clean(header.string('x00020010')) : '';
    let data = bytes;
    let options;
    if (ts === TS.DEFLATED_LE && header) {
      const pos = header.position;
      const inflated = await inflateRaw(bytes.subarray(pos));
      data = new Uint8Array(pos + inflated.length);
      data.set(bytes.subarray(0, pos), 0);
      data.set(inflated, pos);
      options = { inflater: (b) => b };
    }
    try {
      return { ds: dicomParser.parseDicom(data, options), bytes: data, dicomParser };
    } catch (err) {
      // dicom-parser hands back what it managed to read ({ exception, dataSet }); a truncated
      // file that still carries its pixel data is worth showing.
      const partial = err && err.dataSet;
      if (partial && partial.elements && partial.elements.x7fe00010) {
        return { ds: partial, bytes: data, dicomParser, warning: errorMessage(err) };
      }
      throw new Error(`Not a readable DICOM file: ${errorMessage(err)}`);
    }
  }

  /* ── Pixel unpacking ── */
  // Raw bytes → one typed array of samples.
  function unpack(raw, { n, spp, bitsAllocated, signed, bigEndian }) {
    const count = n * spp;
    if (bitsAllocated === 8) {
      const len = Math.min(count, raw.length);
      return signed ? new Int8Array(raw.buffer, raw.byteOffset, len) : new Uint8Array(raw.buffer, raw.byteOffset, len);
    }
    if (bitsAllocated === 16) {
      const out = signed ? new Int16Array(count) : new Uint16Array(count);
      const m = Math.min(count, raw.length >> 1);
      if (bigEndian) for (let i = 0; i < m; i++) out[i] = (raw[i * 2] << 8) | raw[i * 2 + 1];
      else for (let i = 0; i < m; i++) out[i] = raw[i * 2] | (raw[i * 2 + 1] << 8);
      return out;
    }
    if (bitsAllocated === 32) {
      const out = signed ? new Int32Array(count) : new Float64Array(count);
      const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const m = Math.min(count, raw.length >> 2);
      for (let i = 0; i < m; i++) out[i] = signed ? dv.getInt32(i * 4, !bigEndian) : dv.getUint32(i * 4, !bigEndian);
      return out;
    }
    if (bitsAllocated === 1) {
      const out = new Uint8Array(count);
      for (let i = 0; i < count && (i >> 3) < raw.length; i++) out[i] = (raw[i >> 3] >> (i & 7)) & 1;
      return out;
    }
    if (bitsAllocated === 12) {   // two 12-bit samples packed in three bytes
      const out = signed ? new Int16Array(count) : new Uint16Array(count);
      for (let i = 0, b = 0; i + 1 < count && b + 2 < raw.length; i += 2, b += 3) {
        out[i] = raw[b] | ((raw[b + 1] & 0x0F) << 8);
        out[i + 1] = (raw[b + 1] >> 4) | (raw[b + 2] << 4);
      }
      return out;
    }
    throw new Error(`${bitsAllocated} bits allocated is not supported`);
  }

  // DICOM RLE (PackBits per segment; segments are planes: one per byte of each sample, MSB first).
  function rleDecode(frame, pixels, samples, bitsAllocated) {
    const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const nSeg = dv.getUint32(0, true);
    const bytesPer = Math.max(1, bitsAllocated >> 3);
    const out = new Uint8Array(pixels * samples * bytesPer);
    for (let s = 0; s < nSeg && s < 15; s++) {
      const start = dv.getUint32(4 + s * 4, true);
      const end = s + 1 < nSeg ? dv.getUint32(8 + s * 4, true) : frame.byteLength;
      const sample = Math.floor(s / bytesPer);
      const byte = bytesPer - 1 - (s % bytesPer);   // little-endian per pixel in the output
      let i = start, o = 0;
      while (i < end && o < pixels) {
        let n = frame[i++];
        if (n > 128) {
          n = 257 - n;
          const v = frame[i++];
          for (let k = 0; k < n && o < pixels; k++, o++) out[(sample * pixels + o) * bytesPer + byte] = v;
        } else if (n < 128) {
          n += 1;
          for (let k = 0; k < n && o < pixels && i < end; k++, o++) out[(sample * pixels + o) * bytesPer + byte] = frame[i++];
        }
      }
    }
    return out;
  }

  // A codec's output buffer as the typed array the frame info says it is.
  function typed(out, fi, signed) {
    if (out instanceof Uint16Array || out instanceof Int16Array) {
      return signed && out instanceof Uint16Array ? new Int16Array(out.buffer, out.byteOffset, out.length) : out;
    }
    const bytes = out instanceof Uint8Array || out instanceof Uint8ClampedArray ? out : new Uint8Array(out.buffer || out);
    if (fi.bitsPerSample > 8) {
      const len = bytes.byteLength >> 1;
      const copy = new Uint8Array(len * 2);
      copy.set(bytes.subarray(0, len * 2));
      return signed ? new Int16Array(copy.buffer) : new Uint16Array(copy.buffer);
    }
    return signed ? new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  // The encoded bytes of one frame of encapsulated pixel data.
  function encapsulatedFrame(dicomParser, ds, px, i, frames, ts) {
    const bot = px.basicOffsetTable || [];
    if (bot.length) { try { return dicomParser.readEncapsulatedImageFrame(ds, px, i, bot); } catch { /* fall through */ } }
    const frags = px.fragments || [];
    if (frames === 1) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, px, 0, frags.length);
    if (frags.length === frames) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, px, i, 1);
    if (JPEG_FAMILY.has(ts)) {
      const built = dicomParser.createJPEGBasicOffsetTable(ds, px);
      if (built && built.length) return dicomParser.readEncapsulatedImageFrame(ds, px, i, built);
    }
    if (frags.length % frames === 0) {
      const per = frags.length / frames;
      return dicomParser.readEncapsulatedPixelDataFromFragments(ds, px, i * per, per);
    }
    throw new Error('Cannot locate the frame in the pixel data (no offset table)');
  }

  async function decodeFragment(frag, ts, { rows, cols, spp, bitsAllocated, signed }) {
    const n = rows * cols;
    if (ts === TS.RLE) {
      return { samples: unpack(rleDecode(frag, n, spp, bitsAllocated), { n, spp, bitsAllocated, signed, bigEndian: false }), planar: true };
    }
    if (ts === TS.JPEG_BASELINE || ts === TS.JPEG_EXTENDED) {
      const order = bitsAllocated > 8 ? ['jpeg12', 'jpeg8'] : ['jpeg8', 'jpeg12'];
      let lastErr;
      for (const k of order) {
        try {
          const m = await vendor(k);
          const d = new m.JPEGDecoder();
          try {
            const eb = d.getEncodedBuffer(frag.length);
            eb.set(frag);
            d.decode();
            const fi = d.getFrameInfo();
            const out = d.getDecodedBuffer();
            return { samples: typed(out, fi, signed), planar: false, width: fi.width, height: fi.height, spp: fi.componentCount };
          } finally { d.delete(); }
        } catch (err) { lastErr = err; }
      }
      throw new Error(`JPEG decode failed: ${lastErr && lastErr.message ? lastErr.message : lastErr}`);
    }
    if (ts === TS.JPEG_LOSSLESS || ts === TS.JPEG_LOSSLESS_SV1) {
      const m = await vendor('lossless');
      const Decoder = m.Decoder || (m.default && m.default.Decoder);
      const d = new Decoder();
      const out = d.decode(frag.buffer.slice(frag.byteOffset, frag.byteOffset + frag.byteLength));
      const two = d.numBytes === 2;
      const samples = two
        ? (signed ? new Int16Array(out.buffer, out.byteOffset, out.length) : (out instanceof Uint16Array ? out : new Uint16Array(out.buffer, out.byteOffset, out.byteLength >> 1)))
        : (signed ? new Int8Array(out.buffer, out.byteOffset, out.byteLength) : new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
      return { samples, planar: false, width: d.xDim, height: d.yDim, spp: d.numComp || spp };
    }
    if (ts === TS.JPEG_LS_LOSSLESS || ts === TS.JPEG_LS) {
      const m = await vendor('jpegls');
      const d = new m.JpegLSDecoder();
      try {
        const eb = d.getEncodedBuffer(frag.length);
        eb.set(frag);
        d.decode();
        const fi = d.getFrameInfo();
        const out = d.getDecodedBuffer();
        return { samples: typed(out, fi, signed), planar: fi.componentCount > 1 && d.getInterleaveMode() === 0, width: fi.width, height: fi.height, spp: fi.componentCount };
      } finally { d.delete(); }
    }
    if (J2K_FAMILY.has(ts)) {
      const m = await vendor('j2k');
      const d = new m.J2KDecoder();
      try {
        const eb = d.getEncodedBuffer(frag.length);
        eb.set(frag);
        d.decode();
        const fi = d.getFrameInfo();
        const out = d.getDecodedBuffer();
        return { samples: typed(out, fi, signed || fi.isSigned), planar: false, width: fi.width, height: fi.height, spp: fi.componentCount };
      } finally { d.delete(); }
    }
    throw new Error(`Unsupported transfer syntax ${ts}${TS_NAME[ts] ? ` (${TS_NAME[ts]})` : ''}`);
  }

  // PALETTE COLOR: the three lookup tables (descriptor: entries, first value, bits).
  function readPalette(ds) {
    if (!ds.elements.x00281101) return null;
    const n0 = ds.uint16('x00281101', 0), first = ds.uint16('x00281101', 1), bits = ds.uint16('x00281101', 2) || 16;
    const n = n0 === 0 ? 65536 : n0;
    const table = (tag) => {
      const el = ds.elements[tag];
      if (!el) return null;
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (bits === 8 && el.length === n) out[i] = ds.byteArray[el.dataOffset + i];
        else { const v = ds.uint16(tag, i); out[i] = bits > 8 ? v >> (bits - 8) : v; }
      }
      return out;
    };
    const r = table('x00281201'), g = table('x00281202'), b = table('x00281203');
    return r && g && b ? { n, first: first > 32767 ? first - 65536 : first, r, g, b } : null;
  }

  /* ── Tag listing ── */
  function elementValue(ds, el, tagHex, explicit) {
    const vr = el.vr || IMPLICIT_VR[tagHex] || '';
    if (el.items) return { vr: vr || 'SQ', value: `[sequence: ${el.items.length} item${el.items.length === 1 ? '' : 's'}]` };
    if (el.fragments || el.encapsulatedPixelData) return { vr: vr || 'OB', value: `[encapsulated: ${el.fragments ? el.fragments.length : 0} fragments]` };
    if (tagHex === '7FE00010' || tagHex === '7FE00008' || tagHex === '7FE00009') return { vr: vr || 'OW', value: `[pixel data: ${el.length} bytes]` };
    if (el.length === 0) return { vr, value: '' };
    if (el.length > 512 && !STRING_VR.has(vr)) return { vr, value: `[binary ${el.length} bytes]` };
    try {
      if (vr === 'US') { const vals = []; for (let i = 0; i < el.length / 2 && i < 16; i++) vals.push(ds.uint16(el.tag, i)); return { vr, value: vals.join('\\') }; }
      if (vr === 'SS') { const vals = []; for (let i = 0; i < el.length / 2 && i < 16; i++) vals.push(ds.int16(el.tag, i)); return { vr, value: vals.join('\\') }; }
      if (vr === 'UL') { const vals = []; for (let i = 0; i < el.length / 4 && i < 16; i++) vals.push(ds.uint32(el.tag, i)); return { vr, value: vals.join('\\') }; }
      if (vr === 'SL') { const vals = []; for (let i = 0; i < el.length / 4 && i < 16; i++) vals.push(ds.int32(el.tag, i)); return { vr, value: vals.join('\\') }; }
      if (vr === 'FL') { const vals = []; for (let i = 0; i < el.length / 4 && i < 16; i++) vals.push(fmtNum(ds.float(el.tag, i))); return { vr, value: vals.join('\\') }; }
      if (vr === 'FD') { const vals = []; for (let i = 0; i < el.length / 8 && i < 16; i++) vals.push(fmtNum(ds.double(el.tag, i))); return { vr, value: vals.join('\\') }; }
      if (vr === 'AT') { return { vr, value: `(${ds.uint16(el.tag, 0).toString(16).padStart(4, '0')},${ds.uint16(el.tag, 1).toString(16).padStart(4, '0')})`.toUpperCase() }; }
      if (STRING_VR.has(vr) || (!vr && !explicit)) {
        const s = clean(ds.string(el.tag));
        // Implicit files: an unreadable "string" is binary — show bytes instead.
        if (!vr && /[^\x09\x0A\x0D\x20-\x7E-￿]/.test(s)) return { vr: 'UN', value: `[binary ${el.length} bytes]` };
        return { vr: vr || 'UN', value: vr === 'PN' ? person(s) : vr === 'DA' ? fmtDate(s) : vr === 'TM' ? fmtTime(s) : s };
      }
      if (vr === 'OB' || vr === 'OW' || vr === 'UN' || vr === 'OF' || vr === 'OD' || vr === 'OL') {
        const bytes = [];
        for (let i = 0; i < Math.min(el.length, 16); i++) bytes.push(ds.byteArray[el.dataOffset + i].toString(16).padStart(2, '0'));
        return { vr, value: bytes.join(' ').toUpperCase() + (el.length > 16 ? ` … (${el.length} bytes)` : '') };
      }
      return { vr, value: clean(ds.string(el.tag)) };
    } catch {
      return { vr, value: `[${el.length} bytes]` };
    }
  }

  function listTags(ds, explicit) {
    const out = [];
    const keys = Object.keys(ds.elements).sort();
    for (const key of keys) {
      const el = ds.elements[key];
      const hex = key.slice(1).toUpperCase();
      const { vr, value } = elementValue(ds, el, hex, explicit);
      const group = hex.slice(0, 4), element = hex.slice(4);
      const isPrivate = parseInt(group, 16) % 2 === 1;
      const name = DICT[hex] || (isPrivate ? 'Private tag' : `Tag ${group},${element}`);
      out.push({ tag: `(${group},${element})`, name, vr, value: value == null ? '' : String(value) });
    }
    return out;
  }

  /* ── Load ── */
  async function load(input) {
    const raw = toU8(input);
    const { ds, bytes, dicomParser } = await parseDataSet(raw);
    const str = (tag) => clean(ds.string(tag));
    const u16 = (tag, i) => { try { const v = ds.uint16(tag, i); return v == null ? undefined : v; } catch { return undefined; } };

    const rows = u16('x00280010'), cols = u16('x00280011');
    const spp = u16('x00280002') || 1;
    const photometric = (str('x00280004') || 'MONOCHROME2').toUpperCase();
    const bitsAllocated = u16('x00280100') || 8;
    const bitsStored = u16('x00280101') || bitsAllocated;
    const signed = u16('x00280103') === 1;
    const planar = u16('x00280006') === 1;
    const frames = Math.max(1, parseInt(str('x00280008'), 10) || 1);
    const slope = num(str('x00281053')) ?? 1;
    const intercept = num(str('x00281052')) ?? 0;
    const ts = str('x00020010') || TS.IMPLICIT_LE;
    const explicit = ts !== TS.IMPLICIT_LE;
    const px = ds.elements.x7fe00010;
    const modality = str('x00080060');
    const gray = photometric.startsWith('MONOCHROME') || photometric === 'PALETTE COLOR';
    const palette = photometric === 'PALETTE COLOR' ? readPalette(ds) : null;
    const padding = ds.elements.x00280120 ? (signed ? ds.int16('x00280120') : u16('x00280120')) : undefined;

    // Windows the file suggests (several allowed, each may carry a label).
    const wcs = str('x00281050').split('\\').map(num);
    const wws = str('x00281051').split('\\').map(num);
    const labels = str('x00281055').split('\\');
    const fileWindows = wcs
      .map((wc, i) => ({ wc, ww: wws[i], label: (labels[i] || '').trim() }))
      .filter((w) => Number.isFinite(w.wc) && Number.isFinite(w.ww) && w.ww > 0);

    const meta = buildMeta(ds, str, {
      rows, cols, spp, photometric, bitsAllocated, bitsStored, signed, planar, frames, slope, intercept, ts, modality, fileWindows,
    });
    const tags = listTags(ds, explicit);

    if (!rows || !cols || !px) {
      const err = new Error(px ? 'DICOM has no image size' : 'DICOM has no pixel data');
      err.meta = meta;
      err.tags = tags;
      throw err;
    }

    // ── Frame access (decoded once, then cached as typed samples) ──
    const encapsulated = !!(px.encapsulatedPixelData || px.fragments);
    const frameBytes = Math.ceil(rows * cols * spp * bitsAllocated / 8);
    const cache = new Map();
    const frameSamples = async (i) => {
      if (cache.has(i)) return cache.get(i);
      let s;
      if (!encapsulated) {
        const off = px.dataOffset + i * frameBytes;
        const len = Math.min(frameBytes, Math.max(0, px.length - i * frameBytes));
        const rawFrame = new Uint8Array(bytes.buffer, bytes.byteOffset + off, len);
        s = { samples: unpack(rawFrame, { n: rows * cols, spp, bitsAllocated, signed, bigEndian: ts === TS.EXPLICIT_BE }), planar };
      } else {
        const frag = encapsulatedFrame(dicomParser, ds, px, i, frames, ts);
        s = await decodeFragment(frag, ts, { rows, cols, spp, bitsAllocated, signed });
      }
      const need = rows * cols * (s.spp || spp);
      if (s.samples.length < need) throw new Error(`Frame ${i + 1} is short (${s.samples.length} of ${need} samples)`);
      cache.set(i, s);
      return s;
    };

    // ── Rendering ──
    const state = { frame: 0, wc: undefined, ww: undefined, invert: photometric === 'MONOCHROME1' };
    const image = {
      width: cols, height: rows, frames, samplesPerPixel: spp, photometric, bitsAllocated, bitsStored, signed, planar,
      transferSyntax: ts, transferSyntaxName: TS_NAME[ts] || '', modality, gray, isColor: !gray,
      slope, intercept, fileWindows, presets: modality === 'CT' ? CT_PRESETS.slice() : [],
      state, range: null, meta, tags,
    };

    image.render = async (opts = {}) => {
      if (Number.isFinite(opts.frame)) state.frame = Math.max(0, Math.min(frames - 1, Math.round(opts.frame)));
      if (Number.isFinite(opts.wc)) state.wc = opts.wc;
      if (Number.isFinite(opts.ww)) state.ww = Math.max(1e-6, opts.ww);
      if (typeof opts.invert === 'boolean') state.invert = opts.invert;
      const { samples, planar: pl } = await frameSamples(state.frame);
      const n = rows * cols;
      const out = new Uint8ClampedArray(n * 4);

      if (!gray) {
        const ybr = photometric.startsWith('YBR') && !JPEG_FAMILY.has(ts);   // a JPEG codec already gave RGB
        const shift = bitsAllocated > 8 ? Math.max(0, bitsStored - 8) : 0;
        const inv = state.invert && photometric !== 'MONOCHROME1';
        for (let p = 0; p < n; p++) {
          let r = samples[pl ? p : p * spp] >> shift;
          let g = samples[pl ? n + p : p * spp + 1] >> shift;
          let b = samples[pl ? 2 * n + p : p * spp + 2] >> shift;
          if (ybr) { const y = r, cb = g - 128, cr = b - 128; r = y + 1.402 * cr; g = y - 0.344136 * cb - 0.714136 * cr; b = y + 1.772 * cb; }
          if (inv) { r = 255 - r; g = 255 - g; b = 255 - b; }
          const o = p * 4;
          out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
        }
        image.range = null;
        return { rgba: out, width: cols, height: rows, state: { ...state } };
      }

      if (palette) {
        const inv = state.invert;
        for (let p = 0; p < n; p++) {
          const i = Math.max(0, Math.min(palette.n - 1, samples[p] - palette.first));
          const o = p * 4;
          out[o] = inv ? 255 - palette.r[i] : palette.r[i];
          out[o + 1] = inv ? 255 - palette.g[i] : palette.g[i];
          out[o + 2] = inv ? 255 - palette.b[i] : palette.b[i];
          out[o + 3] = 255;
        }
        image.range = null;
        return { rgba: out, width: cols, height: rows, state: { ...state } };
      }

      // Grey: modality rescale → window → 0..255 (inverted for MONOCHROME1 or on request).
      let min = Infinity, max = -Infinity;
      for (let p = 0; p < n; p++) {
        const s = samples[p];
        if (padding !== undefined && s === padding) continue;
        const v = s * slope + intercept;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!Number.isFinite(min)) { min = 0; max = 1; }
      image.range = { min, max };
      if (!Number.isFinite(state.wc) || !Number.isFinite(state.ww)) {
        if (fileWindows.length) { state.wc = fileWindows[0].wc; state.ww = fileWindows[0].ww; }
        else { state.wc = (min + max) / 2; state.ww = Math.max(1, max - min); }
      }
      const lo = state.wc - state.ww / 2, scale = 255 / state.ww;
      const inv = state.invert;
      for (let p = 0; p < n; p++) {
        let g = Math.round((samples[p] * slope + intercept - lo) * scale);
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        if (inv) g = 255 - g;
        const o = p * 4;
        out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = 255;
      }
      return { rgba: out, width: cols, height: rows, state: { ...state } };
    };

    image.toCanvas = async (opts) => {
      if (typeof document === 'undefined') throw new Error('toCanvas needs a DOM');
      const r = await image.render(opts);
      const canvas = document.createElement('canvas');
      canvas.width = r.width;
      canvas.height = r.height;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(r.width, r.height);
      img.data.set(r.rgba);
      ctx.putImageData(img, 0, 0);
      return { canvas, state: r.state };
    };

    image.toDataUrl = async (opts) => {
      const r = await image.toCanvas(opts);
      return { dataUrl: r.canvas.toDataURL('image/png'), state: r.state };
    };

    image.autoWindow = () => (image.range
      ? { wc: (image.range.min + image.range.max) / 2, ww: Math.max(1, image.range.max - image.range.min) }
      : null);

    image.defaultWindow = () => (fileWindows.length ? { wc: fileWindows[0].wc, ww: fileWindows[0].ww } : image.autoWindow());

    image.release = () => cache.clear();

    return image;
  }

  function buildMeta(ds, str, p) {
    const sop = str('x00080016');
    const spacing = str('x00280030');
    const m = {
      patientName: person(str('x00100010')),
      patientId: str('x00100020'),
      patientSex: str('x00100040'),
      patientBirthDate: fmtDate(str('x00100030')),
      patientAge: str('x00101010'),
      modality: p.modality,
      sopClass: SOP_CLASS[sop] || (sop ? sop : ''),
      manufacturer: [str('x00080070'), str('x00081090')].filter(Boolean).join(' '),
      institution: str('x00080080'),
      stationName: str('x00081010'),
      studyDate: fmtDate(str('x00080020')),
      studyTime: fmtTime(str('x00080030')),
      studyDescription: str('x00081030'),
      seriesDescription: str('x0008103e'),
      seriesNumber: str('x00200011'),
      instanceNumber: str('x00200013'),
      accessionNumber: str('x00080050'),
      bodyPart: str('x00180015'),
      protocolName: str('x00181030'),
      patientPosition: str('x00185100'),
      imageSize: `${p.cols} × ${p.rows}`,
      photometric: `${p.photometric} · ${p.spp} ${p.spp > 1 ? 'samples' : 'sample'}${p.planar ? ' · planar' : ''}`,
      bitDepth: `${p.bitsStored} / ${p.bitsAllocated} bit${p.signed ? ' signed' : ' unsigned'}`,
      frames: p.frames > 1 ? String(p.frames) : '',
      transferSyntax: `${TS_NAME[p.ts] || 'Unknown'} (${p.ts})`,
      pixelSpacing: spacing ? `${spacing.split('\\').map((v) => fmtNum(num(v))).join(' × ')} mm` : '',
      sliceThickness: str('x00180050') ? `${fmtNum(num(str('x00180050')))} mm` : '',
      sliceLocation: str('x00201041') ? fmtNum(num(str('x00201041'))) : '',
      window: p.fileWindows.map((w) => `C ${fmtNum(w.wc)} / W ${fmtNum(w.ww)}${w.label ? ` (${w.label})` : ''}`).join(' · '),
      rescale: (str('x00281053') || str('x00281052')) ? `× ${fmtNum(p.slope)} + ${fmtNum(p.intercept)}${str('x00281054') ? ` (${str('x00281054')})` : ''}` : '',
      lossyCompression: str('x00282110') === '01' ? `Yes${str('x00282112') ? ` (${str('x00282112')}:1)` : ''}` : '',
      studyInstanceUid: str('x0020000d'),
      seriesInstanceUid: str('x0020000e'),
      sopInstanceUid: str('x00080018'),
    };
    for (const k of Object.keys(m)) if (m[k] === '' || m[k] == null) delete m[k];
    return m;
  }

  /* ── Compatibility helpers (Node main process, old callers) ── */
  async function decode(input) {
    try {
      const image = await load(input);
      const r = await image.render({});
      return { rgba: r.rgba, width: r.width, height: r.height, meta: image.meta, image };
    } catch (err) {
      return { error: err && err.message ? err.message : String(err), meta: err && err.meta ? err.meta : undefined };
    }
  }

  async function decodeToDisplay(input) {
    try {
      const image = await load(input);
      const { dataUrl } = await image.toDataUrl({});
      return { dataUrl, meta: image.meta, image };
    } catch (err) {
      return { error: err && err.message ? err.message : String(err) };
    }
  }

  return { load, decode, decodeToDisplay, preload, setVendorBase, TS, TS_NAME, CT_PRESETS, DICT };
});
