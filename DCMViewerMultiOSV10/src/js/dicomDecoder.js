/* DICOM decoder — works in Electron main (CommonJS) and in the renderer / browser.
 *
 *   DicomDecoder.load(bytes) → Promise<image>
 *     image.width / height / frames / gray / photometric / modality …
 *     image.fileWindows          [{ wc, ww, label }] from the file (may be empty)
 *     image.windowsFor(frame)    the windows that apply to one frame (enhanced multi-frame: per-frame)
 *     image.voiLuts              [{ label, n, first, bits }] VOI LUT Sequence entries (non-linear windows)
 *     image.presets              window presets for the modality (CT: brain, lung, bone …)
 *     image.colormaps            pseudo-colour maps ('gray', 'hotiron', 'pet', 'hotmetalblue', 'pet20', 'jet', 'rainbow', 'bone')
 *     image.overlays             overlay planes (60xx): [{ group, rows, cols, origin, type, label, frames }]
 *     image.geometry             { pixelSpacing: [row, col] mm, spacingSource, sliceThickness, markers: { left, right, top, bottom } … }
 *     image.frameInfo(frame)     per-frame values: windows, slope / intercept, position, orientation, spacing, slice location
 *     image.frameTimes / frameRate  cine timing from Frame Time (Vector), Cine Rate or Recommended Display Frame Rate
 *     image.units                units of the rescaled values ('HU' for CT, Rescale Type / PET Units otherwise)
 *     image.state                { frame, wc, ww, invert, voiLut, voiFunction, colormap, overlays } currently rendered
 *     image.range                { min, max } of the rendered frame (rescaled units)
 *     image.meta                 summary for the info panel (patient, study, series, pixel format …)
 *     image.tags                 every element (sequences nested): [{ tag, name, vr, value, depth }]
 *     image.render(opts)         → Promise<{ rgba, width, height, state }>
 *       opts: { frame, wc, ww, invert, voiLut (index | -1), voiFunction ('LINEAR' | 'LINEAR_EXACT' | 'SIGMOID'),
 *               colormap, overlays (bool), overlayColor, resetWindow (bool) }
 *     image.toCanvas(opts)       browser only → Promise<{ canvas, state }>
 *     image.toDataUrl(opts)      browser only → Promise<{ dataUrl, state }>
 *     image.valueAt(x, y)        pixel probe on the rendered frame: { raw, value, units } or { r, g, b } (null while undecoded)
 *     image.stats(region)        ROI statistics: { n, mean, std, min, max, areaPx, areaMm2 } — region { x, y, w, h, shape: 'rect' | 'ellipse' }
 *     image.histogram(bins)      { counts, min, max, binWidth } of the rendered frame's values
 *     image.dirLabel(sx, sy)     anatomical label ('R', 'L', 'A', 'P', 'H', 'F', or two letters) of a direction in image space
 *
 * Tags are read with dicom-parser. Pixel data is decoded with the codec the transfer
 * syntax asks for: implicit / explicit little endian, explicit big endian, deflated,
 * RLE lossless (here), JPEG baseline / extended 12-bit (libjpeg-turbo), JPEG lossless
 * (jpeg-lossless-decoder-js), JPEG-LS (CharLS), JPEG 2000 / HTJ2K (OpenJPEG).
 * Photometric interpretations: MONOCHROME1 / 2, RGB, YBR_FULL / YBR_FULL_422, PALETTE COLOR.
 * 8 / 16 / 32-bit integer and 32 / 64-bit float samples, signed or unsigned, multi-frame,
 * modality rescale or Modality LUT, VOI windows / VOI LUTs (LINEAR, LINEAR_EXACT, SIGMOID),
 * Presentation LUT Shape, enhanced multi-frame functional groups, overlay planes.
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
    '00283002': 'LUT Descriptor', '00283003': 'LUT Explanation', '00283004': 'Modality LUT Type', '00283006': 'LUT Data',
    '00289110': 'Pixel Measures Sequence', '00289132': 'Frame VOI LUT Sequence', '00289145': 'Pixel Value Transformation Sequence',
    '00180040': 'Cine Rate', '00082144': 'Recommended Display Frame Rate',
    '00180072': 'Effective Duration', '00181242': 'Actual Frame Duration', '00181244': 'Preferred Playback Sequencing', '00189004': 'Content Qualification',
    '00209111': 'Frame Content Sequence', '00209113': 'Plane Position Sequence', '00209116': 'Plane Orientation Sequence', '00209156': 'Frame Acquisition Number',
    '00209157': 'Dimension Index Values', '00209128': 'Temporal Position Index', '00209221': 'Dimension Organization Sequence', '00209222': 'Dimension Index Sequence',
    '00209071': 'Frame Anatomy Sequence', '00189226': 'MR Image Frame Type Sequence', '00189329': 'MR Metabolite Map Sequence', '00189477': 'Irradiation Event Identification Sequence',
    '00082143': 'Stop Trim', '00082142': 'Start Trim', '00182010': 'Nominal Scanned Pixel Spacing',
    '00281300': 'Breast Implant Present', '00281350': 'Partial View', '00281351': 'Partial View Description',
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
    '00283002': 'US', '00283003': 'LO', '00283004': 'LO', '00281056': 'CS', '20500020': 'CS', '00180040': 'IS', '00181065': 'DS', '00082144': 'IS',
    '00209156': 'US', '00209157': 'UL', '00209128': 'UL', '00541001': 'CS', '00182010': 'DS', '00280121': 'US',
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
  function unpack(raw, { n, spp, bitsAllocated, signed, bigEndian, float }) {
    const count = n * spp;
    if (float) {   // Float Pixel Data (7FE0,0008) / Double Float Pixel Data (7FE0,0009)
      const bytes = bitsAllocated === 64 ? 8 : 4;
      const out = bytes === 8 ? new Float64Array(count) : new Float32Array(count);
      const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const m = Math.min(count, Math.floor(raw.length / bytes));
      for (let i = 0; i < m; i++) out[i] = bytes === 8 ? dv.getFloat64(i * 8, !bigEndian) : dv.getFloat32(i * 4, !bigEndian);
      return out;
    }
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

  /* ── Tag listing ── */
  function elementValue(ds, el, tagHex, explicit) {
    const vr = el.vr || IMPLICIT_VR[tagHex] || '';
    if (el.items) return { vr: vr || 'SQ', value: `[sequence: ${el.items.length} item${el.items.length === 1 ? '' : 's'}]` };
    if (el.fragments || el.encapsulatedPixelData) return { vr: vr || 'OB', value: `[encapsulated: ${el.fragments ? el.fragments.length : 0} fragments]` };
    if (tagHex === '7FE00010' || tagHex === '7FE00008' || tagHex === '7FE00009') return { vr: vr || 'OW', value: `[pixel data: ${el.length} bytes]` };
    if (/^60[0-9A-F]{2}3000$/.test(tagHex)) return { vr: vr || 'OW', value: `[overlay data: ${el.length} bytes]` };
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
        if (!vr && /[^\x09\x0A\x0D\x20-\x7E-￿]/.test(s)) return { vr: 'UN', value: `[binary ${el.length} bytes]` };
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

  // Overlay groups (6000–601E) share one dictionary — the element half names them.
  const OVERLAY_DICT = {
    '0010': 'Overlay Rows', '0011': 'Overlay Columns', '0012': 'Overlay Planes', '0015': 'Number of Frames in Overlay', '0022': 'Overlay Description',
    '0040': 'Overlay Type', '0045': 'Overlay Subtype', '0050': 'Overlay Origin', '0051': 'Image Frame Origin', '0052': 'Overlay Plane Origin',
    '0100': 'Overlay Bits Allocated', '0102': 'Overlay Bit Position', '1500': 'Overlay Label', '3000': 'Overlay Data',
    '1301': 'ROI Area', '1302': 'ROI Mean', '1303': 'ROI Standard Deviation',
  };

  function tagName(hex) {
    if (DICT[hex]) return DICT[hex];
    const group = hex.slice(0, 4), element = hex.slice(4);
    if (/^60[0-9A-F][02468ACE]$/.test(group) && OVERLAY_DICT[element]) return OVERLAY_DICT[element];
    if (parseInt(group, 16) % 2 === 1) return 'Private tag';
    if (hex === 'FFFEE000') return 'Item';
    return `Tag ${group},${element}`;
  }

  const TAG_LIST_MAX = 6000;
  const TAG_DEPTH_MAX = 4;

  // Every element of a data set, with sequence items nested below their sequence (depth ≥ 1).
  function listTags(ds, explicit, depth = 0, out = []) {
    const keys = Object.keys(ds.elements).sort();
    for (const key of keys) {
      if (out.length >= TAG_LIST_MAX) break;
      const el = ds.elements[key];
      const hex = key.slice(1).toUpperCase();
      const { vr, value } = elementValue(ds, el, hex, explicit);
      const group = hex.slice(0, 4), element = hex.slice(4);
      out.push({ tag: `(${group},${element})`, name: tagName(hex), vr, value: value == null ? '' : String(value), depth });
      if (el.items && depth < TAG_DEPTH_MAX) {
        el.items.forEach((item, i) => {
          if (!item.dataSet || out.length >= TAG_LIST_MAX) return;
          out.push({ tag: '', name: `Item ${i + 1}`, vr: '', value: '', depth: depth + 1, item: true });
          listTags(item.dataSet, explicit, depth + 1, out);
        });
      }
    }
    return out;
  }

  /* ── Lookup tables ── */
  // LUT Descriptor (entries, first mapped value, bits) + LUT Data → { n, first, bits, max, data }
  function readLut(item, descTag, dataTag, signed) {
    if (!item || !item.elements[descTag] || !item.elements[dataTag]) return null;
    try {
      const n0 = item.uint16(descTag, 0);
      let first = item.uint16(descTag, 1);
      if (signed && first > 32767) first -= 65536;
      const bits = item.uint16(descTag, 2) || 16;
      const n = n0 === 0 ? 65536 : n0;
      const el = item.elements[dataTag];
      const data = new Float64Array(n);
      let max = 0;
      if (bits <= 8 && el.length === n) {
        for (let i = 0; i < n; i++) { data[i] = item.byteArray[el.dataOffset + i]; if (data[i] > max) max = data[i]; }
      } else {
        const m = Math.min(n, el.length >> 1);
        for (let i = 0; i < m; i++) { data[i] = item.uint16(dataTag, i); if (data[i] > max) max = data[i]; }
        for (let i = m; i < n; i++) data[i] = m ? data[m - 1] : 0;
      }
      return { n, first, bits, max: Math.max(max, 1), data };
    } catch { return null; }
  }

  function readModalityLut(ds, signed) {
    const item = ds.elements.x00283000 && ds.elements.x00283000.items && ds.elements.x00283000.items[0];
    if (!item || !item.dataSet) return null;
    const lut = readLut(item.dataSet, 'x00283002', 'x00283006', signed);
    if (lut) lut.type = clean(item.dataSet.string('x00283004'));
    return lut;
  }

  function readVoiLuts(ds, signed) {
    const seq = ds.elements.x00283010;
    if (!seq || !seq.items) return [];
    const out = [];
    seq.items.forEach((item, i) => {
      if (!item.dataSet) return;
      const lut = readLut(item.dataSet, 'x00283002', 'x00283006', signed);
      if (!lut) return;
      lut.label = clean(item.dataSet.string('x00283003')) || `LUT ${i + 1}`;
      out.push(lut);
    });
    return out;
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

  /* ── Pseudo-colour maps (256 × RGB) ── */
  const CM_POINTS = {
    hotiron:      [[0, 0, 0, 0], [0.5, 255, 0, 0], [0.8, 255, 255, 0], [1, 255, 255, 255]],
    pet:          [[0, 0, 0, 0], [0.18, 0, 0, 220], [0.38, 190, 0, 220], [0.55, 255, 0, 0], [0.75, 255, 160, 0], [0.9, 255, 255, 0], [1, 255, 255, 255]],
    hotmetalblue: [[0, 0, 0, 0], [0.35, 0, 0, 255], [0.6, 255, 0, 255], [1, 255, 255, 255]],
    jet:          [[0, 0, 0, 131], [0.125, 0, 0, 255], [0.375, 0, 255, 255], [0.625, 255, 255, 0], [0.875, 255, 0, 0], [1, 128, 0, 0]],
    bone:         [[0, 0, 0, 0], [0.375, 81, 81, 113], [0.75, 166, 198, 198], [1, 255, 255, 255]],
  };
  const COLORMAP_IDS = ['gray', 'hotiron', 'pet', 'hotmetalblue', 'pet20', 'jet', 'rainbow', 'bone'];
  const cmCache = {};

  function hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const c = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return c.map((x) => Math.round(x * 255));
  }

  function interpPoints(points, t) {
    let a = points[0], b = points[points.length - 1];
    for (let i = 1; i < points.length; i++) if (t <= points[i][0]) { a = points[i - 1]; b = points[i]; break; }
    const k = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    return [1, 2, 3].map((c) => Math.round(a[c] + (b[c] - a[c]) * k));
  }

  function colormap(id) {
    if (!id || id === 'gray') return null;
    if (cmCache[id]) return cmCache[id];
    const table = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      let rgb;
      if (id === 'rainbow') rgb = hsvToRgb(0.75 * (1 - i / 255), 1, i === 0 ? 0 : 1);
      else if (id === 'pet20') rgb = interpPoints(CM_POINTS.pet, Math.floor(i / 256 * 20) / 19);
      else if (CM_POINTS[id]) rgb = interpPoints(CM_POINTS[id], i / 255);
      else return null;
      table[i * 3] = rgb[0]; table[i * 3 + 1] = rgb[1]; table[i * 3 + 2] = rgb[2];
    }
    cmCache[id] = table;
    return table;
  }

  /* ── Overlay planes (6000–601E) ── */
  function readOverlays(ds, { rows, cols, frames, bitsAllocated }) {
    const out = [];
    for (let g = 0x6000; g <= 0x601E; g += 2) {
      const gh = g.toString(16).padStart(4, '0');
      const tag = (e) => `x${gh}${e}`;
      const u16 = (t) => { try { return ds.elements[t] ? ds.uint16(t) : undefined; } catch { return undefined; } };
      const s16 = (t, i) => { try { return ds.elements[t] ? ds.int16(t, i) : undefined; } catch { return undefined; } };
      const str = (t) => { try { return clean(ds.string(t)); } catch { return ''; } };
      const orows = u16(tag('0010')), ocols = u16(tag('0011'));
      if (!orows || !ocols) continue;
      const dataEl = ds.elements[tag('3000')];
      const bitPos = u16(tag('0102'));
      const obits = u16(tag('0100')) || 1;
      const oframes = Math.max(1, parseInt(str(tag('0015')), 10) || 1);
      const frameOriginEl = ds.elements[tag('0051')];
      const frameOrigin = Math.max(1, u16(tag('0051')) || 1);
      const origin = [s16(tag('0050'), 0) ?? 1, s16(tag('0050'), 1) ?? 1];
      const ov = {
        group: `(${gh.toUpperCase()},xxxx)`, rows: orows, cols: ocols, origin, frames: oframes, frameOrigin,
        allFrames: !frameOriginEl && oframes === 1 && frames > 1,
        type: str(tag('0040')), label: str(tag('1500')), description: str(tag('0022')),
        bits: null, embedded: false, bitPos: undefined,
      };
      if (dataEl && dataEl.length) {
        const n = orows * ocols * oframes;
        const bits = new Uint8Array(n);
        const raw = ds.byteArray;
        const off = dataEl.dataOffset, len = dataEl.length;
        for (let i = 0; i < n && (i >> 3) < len; i++) bits[i] = (raw[off + (i >> 3)] >> (i & 7)) & 1;
        ov.bits = bits;
      } else if (bitPos !== undefined && obits === bitsAllocated && orows === rows && ocols === cols) {
        ov.embedded = true;   // stored in an unused high bit of the pixel samples
        ov.bitPos = bitPos;
      } else {
        continue;
      }
      out.push(ov);
    }
    return out;
  }

  /* ── Enhanced multi-frame: Shared / Per-frame Functional Groups ── */
  function readGroupItem(item) {
    if (!item) return {};
    const o = {};
    const str = (ds, t) => { try { return clean(ds.string(t)); } catch { return ''; } };
    const nums = (ds, t) => str(ds, t).split('\\').map(num).filter((v) => v !== undefined);
    const first = (t) => (item.elements[t] && item.elements[t].items && item.elements[t].items[0] && item.elements[t].items[0].dataSet) || null;
    const voi = first('x00289132');
    if (voi) {
      const wcs = nums(voi, 'x00281050'), wws = nums(voi, 'x00281051'), labels = str(voi, 'x00281055').split('\\');
      o.windows = wcs.map((wc, i) => ({ wc, ww: wws[i], label: (labels[i] || '').trim() })).filter((w) => Number.isFinite(w.wc) && Number.isFinite(w.ww) && w.ww > 0);
      const fn = str(voi, 'x00281056').toUpperCase();
      if (fn) o.voiFunction = fn;
    }
    const pvt = first('x00289145');
    if (pvt) {
      const s = num(str(pvt, 'x00281053')), b = num(str(pvt, 'x00281052'));
      if (s !== undefined) o.slope = s;
      if (b !== undefined) o.intercept = b;
      const type = str(pvt, 'x00281054');
      if (type) o.rescaleType = type;
    }
    const pos = first('x00209113');
    if (pos) { const p = nums(pos, 'x00200032'); if (p.length === 3) o.position = p; }
    const ori = first('x00209116');
    if (ori) { const c = nums(ori, 'x00200037'); if (c.length === 6) o.orientation = c; }
    const pm = first('x00289110');
    if (pm) {
      const sp = nums(pm, 'x00280030'); if (sp.length === 2) o.pixelSpacing = sp;
      const th = num(str(pm, 'x00180050')); if (th !== undefined) o.sliceThickness = th;
      const sb = num(str(pm, 'x00180088')); if (sb !== undefined) o.spacingBetweenSlices = sb;
    }
    const fc = first('x00209111');
    if (fc) {
      const stack = str(fc, 'x00209056'); if (stack) o.stackId = stack;
      try { if (fc.elements.x00209057) o.inStackPosition = fc.uint32('x00209057'); } catch { /* ignore */ }
      try { if (fc.elements.x00209128) o.temporalPosition = fc.uint32('x00209128'); } catch { /* ignore */ }
      try {
        const el = fc.elements.x00209157;
        if (el) { const vals = []; for (let i = 0; i < el.length / 4; i++) vals.push(fc.uint32('x00209157', i)); o.dimensionIndex = vals; }
      } catch { /* ignore */ }
    }
    return o;
  }

  function readFunctionalGroups(ds) {
    const sharedSeq = ds.elements.x52009229, perSeq = ds.elements.x52009230;
    const shared = sharedSeq && sharedSeq.items && sharedSeq.items[0] && sharedSeq.items[0].dataSet;
    const per = (perSeq && perSeq.items) || [];
    if (!shared && !per.length) return null;
    return { shared: readGroupItem(shared || null), perFrame: per.map((it) => readGroupItem(it.dataSet || null)) };
  }

  /* ── Geometry ── */
  // Anatomical label of a patient-space direction: R/L (x), A/P (y), F/H (z); two letters when oblique.
  function dirLabelOf(v) {
    if (!v || v.length < 3) return '';
    const axes = [
      { a: Math.abs(v[0]), l: v[0] < 0 ? 'R' : 'L' },
      { a: Math.abs(v[1]), l: v[1] < 0 ? 'A' : 'P' },
      { a: Math.abs(v[2]), l: v[2] < 0 ? 'F' : 'H' },
    ].sort((p, q) => q.a - p.a);
    if (axes[0].a < 1e-4) return '';
    let s = axes[0].l;
    if (axes[1].a >= 0.25 * axes[0].a && axes[1].a > 1e-4) s += axes[1].l;
    return s;
  }

  function markersFrom(orientation, patientOrientation) {
    if (orientation && orientation.length === 6) {
      const row = orientation.slice(0, 3), col = orientation.slice(3, 6);
      const neg = (a) => a.map((x) => -x);
      return { right: dirLabelOf(row), left: dirLabelOf(neg(row)), bottom: dirLabelOf(col), top: dirLabelOf(neg(col)) };
    }
    if (patientOrientation) {
      const [r, b] = patientOrientation.split('\\').map((s) => s.trim());
      const opp = { R: 'L', L: 'R', A: 'P', P: 'A', H: 'F', F: 'H' };
      const flip = (s) => (s || '').split('').map((c) => opp[c] || '').join('');
      if (r || b) return { right: r || '', left: flip(r), bottom: b || '', top: flip(b) };
    }
    return null;
  }

  /* ── VOI (window) transfer functions → 0..255 ── */
  function voiMapper(state, voiLuts) {
    const lut = state.voiLut >= 0 ? voiLuts[state.voiLut] : null;
    if (lut) {
      const { first, n, data, max } = lut;
      const k = 255 / max;
      return (v) => {
        let i = Math.round(v) - first;
        i = i < 0 ? 0 : i >= n ? n - 1 : i;
        return data[i] * k;
      };
    }
    const c = state.wc, w = Math.max(1e-6, state.ww);
    if (state.voiFunction === 'SIGMOID') return (v) => 255 / (1 + Math.exp(-4 * (v - c) / w));
    if (state.voiFunction === 'LINEAR_EXACT') {
      const lo = c - w / 2, k = 255 / w;
      return (v) => (v - lo) * k;
    }
    // LINEAR (DICOM C.11.2.1.2.1): y = ((x - (c - 0.5)) / (w - 1) + 0.5) * 255
    const c2 = c - 0.5, w2 = Math.max(1e-6, w - 1);
    return (v) => ((v - c2) / w2 + 0.5) * 255;
  }

  /* ── Load ── */
  async function load(input) {
    const raw = toU8(input);
    const { ds, bytes, dicomParser } = await parseDataSet(raw);
    const str = (tag) => { try { return clean(ds.string(tag)); } catch { return ''; } };
    const u16 = (tag, i) => { try { const v = ds.uint16(tag, i); return v == null ? undefined : v; } catch { return undefined; } };
    const nums = (tag) => str(tag).split('\\').map(num).filter((v) => v !== undefined);

    const rows = u16('x00280010'), cols = u16('x00280011');
    const spp = u16('x00280002') || 1;
    const photometric = (str('x00280004') || 'MONOCHROME2').toUpperCase();
    const pxFloat = !ds.elements.x7fe00010 && (ds.elements.x7fe00008 || ds.elements.x7fe00009);
    const isFloat = !!pxFloat;
    const bitsAllocated = isFloat ? (ds.elements.x7fe00009 ? 64 : 32) : (u16('x00280100') || 8);
    const bitsStored = isFloat ? bitsAllocated : (u16('x00280101') || bitsAllocated);
    const signed = isFloat ? true : u16('x00280103') === 1;
    const planar = u16('x00280006') === 1;
    const frames = Math.max(1, parseInt(str('x00280008'), 10) || 1);
    const slopeTop = num(str('x00281053'));
    const interceptTop = num(str('x00281052'));
    const slope = slopeTop ?? 1;
    const intercept = interceptTop ?? 0;
    const rescaleType = str('x00281054');
    const ts = str('x00020010') || TS.IMPLICIT_LE;
    const explicit = ts !== TS.IMPLICIT_LE;
    const px = ds.elements.x7fe00010 || pxFloat;
    const modality = str('x00080060');
    const gray = photometric.startsWith('MONOCHROME') || photometric === 'PALETTE COLOR';
    const palette = photometric === 'PALETTE COLOR' ? readPalette(ds) : null;
    const padding = ds.elements.x00280120 && !isFloat ? (signed ? ds.int16('x00280120') : u16('x00280120')) : undefined;
    const paddingLimit = ds.elements.x00280121 && !isFloat ? (signed ? ds.int16('x00280121') : u16('x00280121')) : undefined;
    const modalityLut = (slopeTop === undefined && interceptTop === undefined) ? readModalityLut(ds, signed) : null;
    const voiLuts = gray ? readVoiLuts(ds, signed) : [];
    const voiFunctionTop = (str('x00281056') || 'LINEAR').toUpperCase();
    const presentationLut = str('x20500020').toUpperCase();
    const groups = readFunctionalGroups(ds);
    const overlays = rows && cols ? readOverlays(ds, { rows, cols, frames, bitsAllocated }) : [];

    // Windows the file suggests (several allowed, each may carry a label).
    const wcs = nums('x00281050');
    const wws = nums('x00281051');
    const labels = str('x00281055').split('\\');
    const fileWindows = wcs
      .map((wc, i) => ({ wc, ww: wws[i], label: (labels[i] || '').trim() }))
      .filter((w) => Number.isFinite(w.wc) && Number.isFinite(w.ww) && w.ww > 0);

    // ── Per-frame information (enhanced multi-frame groups over the top-level values) ──
    const top = {
      windows: fileWindows, voiFunction: voiFunctionTop, slope, intercept, rescaleType,
      position: (() => { const p = nums('x00200032'); return p.length === 3 ? p : null; })(),
      orientation: (() => { const c = nums('x00200037'); return c.length === 6 ? c : null; })(),
      pixelSpacing: null, spacingSource: '',
      sliceThickness: num(str('x00180050')), spacingBetweenSlices: num(str('x00180088')), sliceLocation: num(str('x00201041')),
    };
    {
      const cand = [['x00280030', 'PixelSpacing'], ['x00181164', 'ImagerPixelSpacing'], ['x00182010', 'NominalScannedPixelSpacing']];
      for (const [tag, name] of cand) {
        const sp = nums(tag);
        if (sp.length === 2 && sp[0] > 0 && sp[1] > 0) { top.pixelSpacing = sp; top.spacingSource = name; break; }
      }
    }
    const frameInfoCache = new Map();
    const frameInfo = (i) => {
      i = Math.max(0, Math.min(frames - 1, i | 0));
      if (frameInfoCache.has(i)) return frameInfoCache.get(i);
      const shared = groups ? groups.shared : {};
      const per = groups ? (groups.perFrame[i] || {}) : {};
      const fi = { ...top, ...shared, ...per };
      if (!fi.windows || !fi.windows.length) fi.windows = fileWindows;
      if (per.pixelSpacing || shared.pixelSpacing) fi.spacingSource = 'PixelMeasures';
      if (fi.sliceLocation === undefined && fi.position && fi.orientation) {
        // Distance along the slice normal
        const r = fi.orientation.slice(0, 3), c = fi.orientation.slice(3, 6);
        const n = [r[1] * c[2] - r[2] * c[1], r[2] * c[0] - r[0] * c[2], r[0] * c[1] - r[1] * c[0]];
        fi.sliceLocation = fi.position[0] * n[0] + fi.position[1] * n[1] + fi.position[2] * n[2];
      }
      fi.frame = i;
      frameInfoCache.set(i, fi);
      return fi;
    };

    // Cine timing
    const frameTimeVector = nums('x00181065');
    const frameTime = num(str('x00181063'));
    const cineRate = num(str('x00180040'));
    const recommendedRate = num(str('x00082144'));
    const frameTimes = frames > 1 && frameTimeVector.length >= frames ? frameTimeVector.slice(0, frames) : null;
    let frameRate = null;
    if (Number.isFinite(recommendedRate) && recommendedRate > 0) frameRate = recommendedRate;
    else if (Number.isFinite(cineRate) && cineRate > 0) frameRate = cineRate;
    else if (Number.isFinite(frameTime) && frameTime > 0) frameRate = 1000 / frameTime;
    else if (frameTimes) { const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length; if (avg > 0) frameRate = 1000 / avg; }

    // Units of the rescaled values
    let units = '';
    if (modality === 'CT' && (slopeTop !== undefined || interceptTop !== undefined || (groups && groups.shared.slope !== undefined))) units = 'HU';
    if (rescaleType && rescaleType !== 'US') units = rescaleType;
    if (modality === 'PT' && str('x00541001')) units = str('x00541001');

    const geometry = {
      pixelSpacing: frameInfo(0).pixelSpacing, spacingSource: frameInfo(0).spacingSource,
      sliceThickness: frameInfo(0).sliceThickness, spacingBetweenSlices: top.spacingBetweenSlices,
      orientation: frameInfo(0).orientation, position: frameInfo(0).position,
      markers: markersFrom(frameInfo(0).orientation, str('x00200020')),
      aspect: (() => { const a = nums('x00280034'); return a.length === 2 && a[0] > 0 && a[1] > 0 ? a[0] / a[1] : 1; })(),
    };

    const meta = buildMeta(ds, str, {
      rows, cols, spp, photometric, bitsAllocated, bitsStored, signed, planar, frames, slope, intercept, ts, modality, fileWindows,
      isFloat, modalityLut, voiLuts, voiFunction: voiFunctionTop, presentationLut, overlays, groups, geometry, frameRate, units, frameInfo0: frameInfo(0),
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
    const rangeCache = new Map();
    const frameSamples = async (i) => {
      if (cache.has(i)) return cache.get(i);
      let s;
      if (!encapsulated) {
        const off = px.dataOffset + i * frameBytes;
        const len = Math.min(frameBytes, Math.max(0, px.length - i * frameBytes));
        const rawFrame = new Uint8Array(bytes.buffer, bytes.byteOffset + off, len);
        s = { samples: unpack(rawFrame, { n: rows * cols, spp, bitsAllocated, signed, bigEndian: ts === TS.EXPLICIT_BE, float: isFloat }), planar };
      } else {
        const frag = encapsulatedFrame(dicomParser, ds, px, i, frames, ts);
        s = await decodeFragment(frag, ts, { rows, cols, spp, bitsAllocated, signed });
      }
      const need = rows * cols * (s.spp || spp);
      if (s.samples.length < need) throw new Error(`Frame ${i + 1} is short (${s.samples.length} of ${need} samples)`);
      cache.set(i, s);
      return s;
    };

    // Bits above High Bit are not pixel data (they may hold embedded overlays): keep the stored
    // bits only — masked for unsigned samples, sign-extended from bit (Bits Stored − 1) for signed.
    const maskRaw = (!isFloat && bitsStored < bitsAllocated && bitsAllocated <= 32)
      ? (signed
        ? ((sh) => (r) => (r << sh) >> sh)(32 - bitsStored)
        : ((m) => (r) => r & m)(bitsStored >= 31 ? 0x7FFFFFFF : (1 << bitsStored) - 1))
      : (r) => r;
    // Stored value → rescaled value for one frame (rescale slope / intercept or Modality LUT)
    const valueFnFor = (i) => {
      const fi = frameInfo(i);
      if (modalityLut && fi.slope === slope && fi.intercept === intercept && slopeTop === undefined) {
        const { first, n, data } = modalityLut;
        return (r) => { let k = Math.round(maskRaw(r)) - first; k = k < 0 ? 0 : k >= n ? n - 1 : k; return data[k]; };
      }
      const s = fi.slope, b = fi.intercept;
      return (r) => maskRaw(r) * s + b;
    };
    const isPad = (r0) => {
      if (padding === undefined) return false;
      const r = maskRaw(r0);
      return paddingLimit === undefined ? r === padding : (r >= Math.min(padding, paddingLimit) && r <= Math.max(padding, paddingLimit));
    };
    const rangeOf = (i, samples) => {
      if (rangeCache.has(i)) return rangeCache.get(i);
      const f = valueFnFor(i);
      const n = rows * cols;
      let min = Infinity, max = -Infinity;
      for (let p = 0; p < n; p++) {
        const s = samples[p];
        if (isPad(s) || s !== s) continue;
        const v = f(s);
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!Number.isFinite(min)) { min = 0; max = 1; }
      const r = { min, max };
      rangeCache.set(i, r);
      return r;
    };

    // ── Rendering ──
    const invertDefault = (photometric === 'MONOCHROME1') !== (presentationLut === 'INVERSE');
    const state = {
      frame: 0, wc: undefined, ww: undefined, invert: invertDefault,
      voiLut: -1, voiFunction: voiFunctionTop, colormap: 'gray', overlays: true, overlayColor: [0, 255, 128],
    };
    let windowCustom = false;   // false: the window follows each frame's own values
    const image = {
      width: cols, height: rows, frames, samplesPerPixel: spp, photometric, bitsAllocated, bitsStored, signed, planar, isFloat,
      transferSyntax: ts, transferSyntaxName: TS_NAME[ts] || '', modality, gray, isColor: !gray,
      slope, intercept, rescaleType, units, modalityLut: modalityLut ? { n: modalityLut.n, first: modalityLut.first, type: modalityLut.type } : null,
      fileWindows, voiLuts: voiLuts.map((l) => ({ label: l.label, n: l.n, first: l.first, bits: l.bits })),
      presets: modality === 'CT' ? CT_PRESETS.slice() : [],
      colormaps: COLORMAP_IDS.slice(), overlays: overlays.map((o) => ({ ...o, bits: undefined })),
      presentationLut, geometry, frameTimes, frameRate, enhanced: !!groups,
      state, range: null, meta, tags,
    };

    image.frameInfo = frameInfo;
    image.windowsFor = (i) => frameInfo(i).windows;
    image.dirLabel = (sx, sy, frame) => {
      const o = frameInfo(Number.isFinite(frame) ? frame : state.frame).orientation;
      if (!o) {
        const m = geometry.markers;
        if (!m) return '';
        const ax = Math.abs(sx) >= Math.abs(sy);
        return ax ? (sx >= 0 ? m.right : m.left) : (sy >= 0 ? m.bottom : m.top);
      }
      return dirLabelOf([0, 1, 2].map((k) => sx * o[k] + sy * o[3 + k]));
    };

    function parseOpts(opts) {
      if (Number.isFinite(opts.frame)) state.frame = Math.max(0, Math.min(frames - 1, Math.round(opts.frame)));
      if (opts.resetWindow) { windowCustom = false; state.voiLut = -1; state.wc = undefined; state.ww = undefined; state.voiFunction = frameInfo(state.frame).voiFunction || voiFunctionTop; }
      if (Number.isFinite(opts.wc) || Number.isFinite(opts.ww)) {
        if (Number.isFinite(opts.wc)) state.wc = opts.wc;
        if (Number.isFinite(opts.ww)) state.ww = Math.max(1e-6, opts.ww);
        state.voiLut = -1;
        windowCustom = true;
      }
      if (Number.isInteger(opts.voiLut)) {
        state.voiLut = opts.voiLut >= 0 && opts.voiLut < voiLuts.length ? opts.voiLut : -1;
        windowCustom = state.voiLut >= 0 ? true : windowCustom;
      }
      if (typeof opts.voiFunction === 'string' && /^(LINEAR|LINEAR_EXACT|SIGMOID)$/.test(opts.voiFunction)) state.voiFunction = opts.voiFunction;
      if (typeof opts.invert === 'boolean') state.invert = opts.invert;
      if (typeof opts.colormap === 'string' && COLORMAP_IDS.includes(opts.colormap)) state.colormap = opts.colormap;
      if (typeof opts.overlays === 'boolean') state.overlays = opts.overlays;
      if (Array.isArray(opts.overlayColor) && opts.overlayColor.length === 3) state.overlayColor = opts.overlayColor.map((c) => Math.max(0, Math.min(255, c | 0)));
    }

    // Blend the overlay planes that apply to the frame into the RGBA buffer.
    const drawOverlays = (out, frame, samples) => {
      if (!state.overlays || !overlays.length) return;
      const [cr, cg, cb] = state.overlayColor;
      for (const ov of overlays) {
        let plane = null;
        if (ov.embedded) {
          const bit = ov.bitPos;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const p = r * cols + c;
              if ((samples[p] >> bit) & 1) { const o = p * 4; out[o] = cr; out[o + 1] = cg; out[o + 2] = cb; }
            }
          }
          continue;
        }
        if (!ov.bits) continue;
        if (ov.allFrames) plane = 0;
        else { const k = frame - (ov.frameOrigin - 1); if (k < 0 || k >= ov.frames) continue; plane = k; }
        const base = plane * ov.rows * ov.cols;
        const r0 = ov.origin[0] - 1, c0 = ov.origin[1] - 1;
        for (let r = 0; r < ov.rows; r++) {
          const y = r0 + r;
          if (y < 0 || y >= rows) continue;
          for (let c = 0; c < ov.cols; c++) {
            const x = c0 + c;
            if (x < 0 || x >= cols) continue;
            if (ov.bits[base + r * ov.cols + c]) { const o = (y * cols + x) * 4; out[o] = cr; out[o + 1] = cg; out[o + 2] = cb; }
          }
        }
      }
    };

    image.render = async (opts = {}) => {
      parseOpts(opts);
      const { samples, planar: pl } = await frameSamples(state.frame);
      const n = rows * cols;
      const out = new Uint8ClampedArray(n * 4);
      const fi = frameInfo(state.frame);

      if (!gray) {
        const ybr = photometric.startsWith('YBR') && !JPEG_FAMILY.has(ts);   // a JPEG codec already gave RGB
        const shift = bitsAllocated > 8 ? Math.max(0, bitsStored - 8) : 0;
        const inv = state.invert;
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
        drawOverlays(out, state.frame, samples);
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
        drawOverlays(out, state.frame, samples);
        return { rgba: out, width: cols, height: rows, state: { ...state } };
      }

      // Grey: modality rescale / LUT → VOI (window or LUT) → 0..255 → optional colour map (inverted for MONOCHROME1 or on request).
      image.range = rangeOf(state.frame, samples);
      const { min, max } = image.range;
      if (!windowCustom || !Number.isFinite(state.wc) || !Number.isFinite(state.ww)) {
        const wins = fi.windows || [];
        if (wins.length) { state.wc = wins[0].wc; state.ww = wins[0].ww; }
        else { state.wc = (min + max) / 2; state.ww = Math.max(1, max - min); }
        if (!windowCustom) state.voiFunction = fi.voiFunction || voiFunctionTop;
      }
      const valueFn = valueFnFor(state.frame);
      const voi = voiMapper(state, voiLuts);
      const inv = state.invert;
      const cm = colormap(state.colormap);
      const toGray = (raw) => {
        let g = Math.round(voi(valueFn(raw)));
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        return inv ? 255 - g : g;
      };
      // Integer samples up to 16 bits: one lookup table for the whole frame.
      let lut = null, lutOffset = 0;
      if (!isFloat && bitsAllocated <= 16) {
        const size = bitsAllocated <= 8 ? 256 : 65536;
        lutOffset = signed ? size >> 1 : 0;
        lut = new Uint8Array(size);
        for (let i = 0; i < size; i++) lut[i] = toGray(i - lutOffset);
      }
      for (let p = 0; p < n; p++) {
        const s = samples[p];
        const g = lut ? lut[(s + lutOffset) & (lut.length - 1)] : toGray(s);
        const o = p * 4;
        if (cm) { const k = g * 3; out[o] = cm[k]; out[o + 1] = cm[k + 1]; out[o + 2] = cm[k + 2]; }
        else { out[o] = out[o + 1] = out[o + 2] = g; }
        out[o + 3] = 255;
      }
      drawOverlays(out, state.frame, samples);
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

    image.defaultWindow = (frame) => {
      const wins = frameInfo(Number.isFinite(frame) ? frame : state.frame).windows;
      return wins.length ? { wc: wins[0].wc, ww: wins[0].ww } : image.autoWindow();
    };
    image.defaultInvert = () => invertDefault;
    image.isWindowCustom = () => windowCustom;

    // ── Pixel probe / ROI statistics / histogram (rendered frame; sync, from the sample cache) ──
    const currentSamples = () => cache.get(state.frame) || null;

    image.valueAt = (x, y, frame) => {
      const f = Number.isFinite(frame) ? frame : state.frame;
      const s = cache.get(f);
      if (!s) return null;
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
      const p = y * cols + x;
      if (!gray) {
        const n = rows * cols, pl = s.planar, k = s.spp || spp;
        return { r: s.samples[pl ? p : p * k], g: s.samples[pl ? n + p : p * k + 1], b: s.samples[pl ? 2 * n + p : p * k + 2] };
      }
      const raw0 = s.samples[p];
      const raw = maskRaw(raw0);
      const out = { raw, value: valueFnFor(f)(raw0), units, padding: isPad(raw0) };
      if (palette) {
        const i = Math.max(0, Math.min(palette.n - 1, raw - palette.first));
        out.r = palette.r[i]; out.g = palette.g[i]; out.b = palette.b[i];
      }
      return out;
    };

    image.stats = (region, frame) => {
      const f = Number.isFinite(frame) ? frame : state.frame;
      const s = cache.get(f);
      if (!s || !gray || !region) return null;
      const valueFn = valueFnFor(f);
      const x0 = Math.max(0, Math.floor(Math.min(region.x, region.x + region.w)));
      const y0 = Math.max(0, Math.floor(Math.min(region.y, region.y + region.h)));
      const x1 = Math.min(cols, Math.ceil(Math.max(region.x, region.x + region.w)));
      const y1 = Math.min(rows, Math.ceil(Math.max(region.y, region.y + region.h)));
      const ellipse = region.shape === 'ellipse';
      const cx = region.x + region.w / 2, cy = region.y + region.h / 2;
      const rx = Math.abs(region.w) / 2, ry = Math.abs(region.h) / 2;
      let n = 0, sum = 0, sum2 = 0, min = Infinity, max = -Infinity;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (ellipse) {
            const dx = (x + 0.5 - cx) / (rx || 1e-6), dy = (y + 0.5 - cy) / (ry || 1e-6);
            if (dx * dx + dy * dy > 1) continue;
          }
          const raw = s.samples[y * cols + x];
          if (isPad(raw) || raw !== raw) continue;
          const v = valueFn(raw);
          n++; sum += v; sum2 += v * v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (!n) return { n: 0, mean: NaN, std: NaN, min: NaN, max: NaN, areaPx: 0, areaMm2: null, units };
      const mean = sum / n;
      const variance = Math.max(0, sum2 / n - mean * mean);
      const sp = frameInfo(f).pixelSpacing;
      const areaPx = ellipse ? Math.PI * rx * ry : Math.abs(region.w * region.h);
      return { n, mean, std: Math.sqrt(variance), min, max, areaPx, areaMm2: sp ? areaPx * sp[0] * sp[1] : null, units };
    };

    image.histogram = (bins, frame) => {
      const f = Number.isFinite(frame) ? frame : state.frame;
      const s = cache.get(f);
      if (!s || !gray) return null;
      const nb = Math.max(2, Math.min(4096, bins | 0 || 256));
      const { min, max } = rangeOf(f, s.samples);
      const valueFn = valueFnFor(f);
      const counts = new Uint32Array(nb);
      const span = max - min || 1;
      const n = rows * cols;
      for (let p = 0; p < n; p++) {
        const raw = s.samples[p];
        if (isPad(raw) || raw !== raw) continue;
        let k = Math.floor((valueFn(raw) - min) / span * nb);
        if (k >= nb) k = nb - 1;
        if (k < 0) k = 0;
        counts[k]++;
      }
      return { counts, min, max, binWidth: span / nb, units };
    };

    image.hasFrame = (i) => cache.has(Number.isFinite(i) ? i : state.frame);
    // Decoded samples of a frame (stored values, before masking / rescale) — null until rendered once.
    image.samplesOf = (i) => { const s = cache.get(Number.isFinite(i) ? i : state.frame); return s ? s.samples : null; };
    // Rescaled values (HU etc.) of a grey frame as Float32Array — decodes the frame if needed (volume building / MPR).
    image.valuesOf = async (i) => {
      const f = Math.max(0, Math.min(frames - 1, Number.isFinite(i) ? i | 0 : state.frame));
      if (!gray || palette) return null;
      const { samples } = await frameSamples(f);
      const fn = valueFnFor(f);
      const n = rows * cols;
      const out = new Float32Array(n);
      for (let p = 0; p < n; p++) { const s = samples[p]; out[p] = isPad(s) ? NaN : fn(s); }
      return out;
    };
    image.release = () => { cache.clear(); rangeCache.clear(); };
    void currentSamples;

    return image;
  }

  function buildMeta(ds, str, p) {
    const sop = str('x00080016');
    const fi = p.frameInfo0 || {};
    const spacing = fi.pixelSpacing;
    const g = p.geometry || {};
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
      bitDepth: p.isFloat ? `${p.bitsAllocated}-bit float` : `${p.bitsStored} / ${p.bitsAllocated} bit${p.signed ? ' signed' : ' unsigned'}`,
      frames: p.frames > 1 ? `${p.frames}${p.groups ? ' (enhanced multi-frame)' : ''}` : (p.groups ? '1 (enhanced)' : ''),
      frameRate: p.frames > 1 && p.frameRate ? `${fmtNum(+p.frameRate.toFixed(2))} fps` : '',
      transferSyntax: `${TS_NAME[p.ts] || 'Unknown'} (${p.ts})`,
      pixelSpacing: spacing ? `${spacing.map((v) => fmtNum(v)).join(' × ')} mm${fi.spacingSource && fi.spacingSource !== 'PixelSpacing' ? ` (${fi.spacingSource.replace(/([a-z])([A-Z])/g, '$1 $2')})` : ''}` : '',
      sliceThickness: Number.isFinite(fi.sliceThickness) ? `${fmtNum(fi.sliceThickness)} mm` : '',
      sliceLocation: Number.isFinite(fi.sliceLocation) ? fmtNum(fi.sliceLocation) : '',
      imagePosition: fi.position ? fi.position.map((v) => fmtNum(+v.toFixed(3))).join(' \\ ') : '',
      imageOrientation: g.markers ? `${g.markers.left || '?'} → ${g.markers.right || '?'} · ${g.markers.top || '?'} → ${g.markers.bottom || '?'}` : '',
      window: (fi.windows || p.fileWindows).map((w) => `C ${fmtNum(w.wc)} / W ${fmtNum(w.ww)}${w.label ? ` (${w.label})` : ''}`).join(' · ')
        + (p.voiFunction && p.voiFunction !== 'LINEAR' ? ` · ${p.voiFunction}` : ''),
      voiLut: (p.voiLuts || []).map((l) => `${l.label} (${l.n} × ${l.bits} bit)`).join(' · '),
      rescale: p.modalityLut
        ? `Modality LUT (${p.modalityLut.n} entries${p.modalityLut.type ? `, ${p.modalityLut.type}` : ''})`
        : ((str('x00281053') || str('x00281052') || Number.isFinite(fi.slope) && (fi.slope !== 1 || fi.intercept !== 0))
          ? `× ${fmtNum(fi.slope ?? p.slope)} + ${fmtNum(fi.intercept ?? p.intercept)}${(fi.rescaleType || str('x00281054')) ? ` (${fi.rescaleType || str('x00281054')})` : ''}` : ''),
      units: p.units || '',
      presentationLut: p.presentationLut || '',
      overlays: (p.overlays || []).length ? p.overlays.map((o) => `${o.group.slice(1, 5)}: ${o.cols} × ${o.rows}${o.label || o.description ? ` — ${o.label || o.description}` : ''}${o.embedded ? ' (embedded)' : ''}`).join(' · ') : '',
      lossyCompression: str('x00282110') === '01' ? `Yes${str('x00282112') ? ` (${str('x00282112')}:1)` : ''}` : '',
      studyInstanceUid: str('x0020000d'),
      seriesInstanceUid: str('x0020000e'),
      sopInstanceUid: str('x00080018'),
    };
    for (const k of Object.keys(m)) if (m[k] === '' || m[k] == null) delete m[k];
    return m;
  }

  /* ── Sniffing / header scan (series stacks) ── */
  // Does this look like a DICOM file? Part 10 preamble, or a bare data set starting with a group 0002/0008 element.
  function isDicom(input) {
    const b = toU8(input);
    if (b.length > 132 && b[128] === 0x44 && b[129] === 0x49 && b[130] === 0x43 && b[131] === 0x4D) return true;
    if (b.length < 8) return false;
    const group = b[0] | (b[1] << 8);
    if (group !== 0x0002 && group !== 0x0008 && group !== 0x0010) return false;
    const vr = String.fromCharCode(b[4], b[5]);
    return /^[A-Z]{2}$/.test(vr) || (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) < 0x10000;
  }

  /** Cheap header read (stops before the pixel data) for sorting files into series. */
  async function scanHeader(input) {
    const dicomParser = await vendor('parser');
    const bytes = toU8(input);
    let ds;
    try { ds = dicomParser.parseDicom(bytes, { untilTag: 'x7fe00010' }); }
    catch (err) { ds = err && err.dataSet; if (!ds) throw new Error(errorMessage(err)); }
    const str = (t) => { try { return clean(ds.string(t)); } catch { return ''; } };
    const nums = (t) => str(t).split('\\').map(num).filter((v) => v !== undefined);
    const orientation = nums('x00200037');
    const position = nums('x00200032');
    let normalPos;
    if (orientation.length === 6 && position.length === 3) {
      const r = orientation.slice(0, 3), c = orientation.slice(3, 6);
      const n = [r[1] * c[2] - r[2] * c[1], r[2] * c[0] - r[0] * c[2], r[0] * c[1] - r[1] * c[0]];
      normalPos = position[0] * n[0] + position[1] * n[1] + position[2] * n[2];
    }
    const u16 = (t) => { try { return ds.uint16(t); } catch { return undefined; } };
    return {
      patientName: person(str('x00100010')), patientId: str('x00100020'),
      studyUid: str('x0020000d'), studyDescription: str('x00081030'), studyDate: fmtDate(str('x00080020')),
      seriesUid: str('x0020000e'), seriesNumber: num(str('x00200011')), seriesDescription: str('x0008103e'),
      sopInstanceUid: str('x00080018'), sopClass: str('x00080016'), modality: str('x00080060'),
      instanceNumber: num(str('x00200013')), acquisitionNumber: num(str('x00200012')),
      sliceLocation: num(str('x00201041')), normalPos, position: position.length === 3 ? position : null,
      frames: Math.max(1, parseInt(str('x00280008'), 10) || 1), rows: u16('x00280010'), cols: u16('x00280011'),
      transferSyntax: str('x00020010'),
    };
  }

  /** Parse without decoding, keeping element offsets into the given bytes (in-place editing, e.g. anonymisation). */
  async function parseRaw(input) {
    const bytes = toU8(input);
    const dicomParser = await vendor('parser');
    let header = null;
    try { header = dicomParser.readPart10Header(bytes); } catch { header = null; }
    if (header && clean(header.string('x00020010')) === TS.DEFLATED_LE) throw new Error('Deflated DICOM files cannot be edited in place');
    try { return dicomParser.parseDicom(bytes); }
    catch (err) { if (err && err.dataSet) return err.dataSet; throw new Error(errorMessage(err)); }
  }

  /** Sort a list of scanned headers the way a stack is read: instance number, then position along the normal. */
  function sortSeries(items, key = (x) => x) {
    return items.slice().sort((a, b) => {
      const A = key(a), B = key(b);
      if (Number.isFinite(A.instanceNumber) && Number.isFinite(B.instanceNumber) && A.instanceNumber !== B.instanceNumber) return A.instanceNumber - B.instanceNumber;
      if (Number.isFinite(A.normalPos) && Number.isFinite(B.normalPos) && A.normalPos !== B.normalPos) return A.normalPos - B.normalPos;
      if (Number.isFinite(A.sliceLocation) && Number.isFinite(B.sliceLocation) && A.sliceLocation !== B.sliceLocation) return A.sliceLocation - B.sliceLocation;
      return 0;
    });
  }

  /* ── Tag export ── */
  function tagsToText(tags, format) {
    if (format === 'json') {
      return JSON.stringify(tags.map((t) => ({ tag: t.tag, name: t.name, vr: t.vr, value: t.value, depth: t.depth })), null, 2);
    }
    if (format === 'csv') {
      const q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
      return ['tag,name,vr,depth,value', ...tags.map((t) => [q(t.tag), q(t.name), q(t.vr), t.depth, q(t.value)].join(','))].join('\n');
    }
    return tags.map((t) => `${'  '.repeat(t.depth)}${t.tag ? t.tag + ' ' : ''}${t.name}${t.vr ? ` [${t.vr}]` : ''}${t.value !== '' ? ` = ${t.value}` : ''}`).join('\n');
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

  return { load, decode, decodeToDisplay, preload, setVendorBase, isDicom, scanHeader, parseRaw, sortSeries, tagsToText, colormap, TS, TS_NAME, CT_PRESETS, COLORMAP_IDS, DICT };
});
