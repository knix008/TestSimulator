/* DICOM networking — DIMSE over the DICOM Upper Layer (PS3.7 / PS3.8): verify, query, retrieve, send, receive.
 * Pure protocol logic, no sockets of its own; works in Node (CommonJS) and in the browser (window.DicomNet).
 *
 * A transport is { write(Uint8Array) → Promise, onData(cb(Uint8Array)), close() → Promise, onClose(cb) }
 * (desktop app: NetTransport.connect / listen in net-transport.js; Node: a net.Socket adapter, see the tests).
 *
 * SCU
 *   associate(transport, { callingAE, calledAE, contexts: [{ abstractSyntax, transferSyntaxes, scpRole? }],
 *             maxPdu, timeout, dimseTimeout }) → Promise<Association>
 *     assoc.contexts [{ id, abstractSyntax, transferSyntax, accepted, result, resultText }], assoc.peerMaxPdu,
 *     assoc.peer { implementationClassUID, implementationVersionName }, assoc.contextFor(abstractSyntax, ts?),
 *     assoc.release(), assoc.abort(), assoc.closed (Promise)
 *   echo(assoc)                                   → status
 *   find(assoc, { level, root, query, onResult, limit, signal }) → [result] (+ .status)
 *       result: { Keyword: value …, tags: { GGGGEEEE: { vr, value } } } — strings stay DICOM strings ('CT\MR')
 *   get(assoc, { level, root, query }, { onInstance(part10, info) → status?, onProgress(p), signal })
 *   move(assoc, { level, root, query }, destinationAE, { onProgress, signal })
 *       → { status, text, category, ok, completed, failed, warning, remaining, received, failedSOPInstanceUIDs }
 *   store(assoc, part10, { moveOriginatorAE, moveOriginatorMessageId, transcode }) → status (+ sopInstanceUid)
 *       transcode(part10) → Promise<Part-10 in Explicit VR LE>: used when the peer accepted no context for the
 *       file's own transfer syntax but one for uncompressed data (e.g. DicomWriter.decompress)
 *   status: { status, hex, text, category ('success'|'pending'|'warning'|'cancel'|'failure'), ok, errorComment }
 *   new Client({ connect: () → Promise<transport>, callingAE, calledAE, maxPdu, timeout, dimseTimeout })
 *     .echo() .find(opts) .get(q, opts) .move(q, dest, opts) .store([part10], { onProgress }) — one association per call
 *   Contexts: verificationContexts(), findContexts(root), getContexts(root, opts), moveContexts(root), storeContexts(files)
 * SCP
 *   serve(transport, { aeTitle, acceptAll, anyCalledAE, maxPdu, timeout, onAssociate(info) → bool | reject,
 *         onEcho(info), onStore(part10, info) → status, onFind(query, level, info) → [match],
 *         onGet(query, level, info) → [part10], onMove(query, level, destinationAE, info) → [part10],
 *         moveDestination(aeTitle) → { connect, aeTitle?, maxPdu? } | null, preferredTransferSyntaxes(abstractSyntax), transcode })
 *     → Association (assoc.ready resolves once accepted, assoc.closed when it ends)
 *   new MemoryArchive() — .add(part10) .find(query, level) .retrieve(query, level) .handlers() → serve options
 * Data
 *   encodeDataset(obj, { explicit }) / decodeDataset(bytes, { explicit, littleEndian, until })
 *   toPart10(dataset, { transferSyntax, sopClassUid, sopInstanceUid, sourceAE }) / parsePart10(bytes)
 *   explicitToImplicit(dataset), matchValue(query, value, vr), statusText(code), statusCategory(code)
 *   DICT, SOP, TS, STORAGE_SOP_CLASSES, DEFAULT_KEYS, DicomNetError (code: REJECTED | ABORTED | TIMEOUT | CLOSED |
 *   NO_CONTEXT | STATUS | PROTOCOL | INVALID)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DicomNet = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Constants ── */
  const TS = {
    IMPLICIT_LE: '1.2.840.10008.1.2',
    EXPLICIT_LE: '1.2.840.10008.1.2.1',
    DEFLATED_LE: '1.2.840.10008.1.2.1.99',
    EXPLICIT_BE: '1.2.840.10008.1.2.2',
    JPEG_BASELINE: '1.2.840.10008.1.2.4.50',
    JPEG_EXTENDED: '1.2.840.10008.1.2.4.51',
    JPEG_LOSSLESS: '1.2.840.10008.1.2.4.57',
    JPEG_LOSSLESS_SV1: '1.2.840.10008.1.2.4.70',
    JPEG_LS_LOSSLESS: '1.2.840.10008.1.2.4.80',
    JPEG_LS_NEAR: '1.2.840.10008.1.2.4.81',
    J2K_LOSSLESS: '1.2.840.10008.1.2.4.90',
    J2K: '1.2.840.10008.1.2.4.91',
    HTJ2K_LOSSLESS: '1.2.840.10008.1.2.4.201',
    HTJ2K_LOSSLESS_RPCL: '1.2.840.10008.1.2.4.202',
    HTJ2K: '1.2.840.10008.1.2.4.203',
    RLE: '1.2.840.10008.1.2.5',
    MPEG2: '1.2.840.10008.1.2.4.100',
    MPEG4: '1.2.840.10008.1.2.4.102',
  };
  const TS_NAMES = {
    [TS.IMPLICIT_LE]: 'Implicit VR Little Endian', [TS.EXPLICIT_LE]: 'Explicit VR Little Endian',
    [TS.DEFLATED_LE]: 'Deflated Explicit VR Little Endian', [TS.EXPLICIT_BE]: 'Explicit VR Big Endian',
    [TS.JPEG_BASELINE]: 'JPEG Baseline', [TS.JPEG_EXTENDED]: 'JPEG Extended', [TS.JPEG_LOSSLESS]: 'JPEG Lossless',
    [TS.JPEG_LOSSLESS_SV1]: 'JPEG Lossless SV1', [TS.JPEG_LS_LOSSLESS]: 'JPEG-LS Lossless', [TS.JPEG_LS_NEAR]: 'JPEG-LS Near-Lossless',
    [TS.J2K_LOSSLESS]: 'JPEG 2000 Lossless', [TS.J2K]: 'JPEG 2000', [TS.HTJ2K_LOSSLESS]: 'HTJ2K Lossless',
    [TS.HTJ2K_LOSSLESS_RPCL]: 'HTJ2K Lossless RPCL', [TS.HTJ2K]: 'HTJ2K', [TS.RLE]: 'RLE Lossless',
    [TS.MPEG2]: 'MPEG2', [TS.MPEG4]: 'MPEG-4 AVC/H.264',
  };
  const UNCOMPRESSED_TS = [TS.EXPLICIT_LE, TS.IMPLICIT_LE];
  const COMPRESSED_TS = [TS.JPEG_LOSSLESS_SV1, TS.JPEG_BASELINE, TS.JPEG_EXTENDED, TS.JPEG_LOSSLESS, TS.JPEG_LS_LOSSLESS,
    TS.JPEG_LS_NEAR, TS.J2K_LOSSLESS, TS.J2K, TS.HTJ2K_LOSSLESS, TS.HTJ2K_LOSSLESS_RPCL, TS.HTJ2K, TS.RLE, TS.MPEG2, TS.MPEG4];
  const ALL_TS = Object.values(TS);

  const SOP = {
    VERIFICATION: '1.2.840.10008.1.1',
    PATIENT_ROOT_FIND: '1.2.840.10008.5.1.4.1.2.1.1',
    PATIENT_ROOT_MOVE: '1.2.840.10008.5.1.4.1.2.1.2',
    PATIENT_ROOT_GET: '1.2.840.10008.5.1.4.1.2.1.3',
    STUDY_ROOT_FIND: '1.2.840.10008.5.1.4.1.2.2.1',
    STUDY_ROOT_MOVE: '1.2.840.10008.5.1.4.1.2.2.2',
    STUDY_ROOT_GET: '1.2.840.10008.5.1.4.1.2.2.3',
  };
  const QR = {
    patient: { find: SOP.PATIENT_ROOT_FIND, move: SOP.PATIENT_ROOT_MOVE, get: SOP.PATIENT_ROOT_GET },
    study: { find: SOP.STUDY_ROOT_FIND, move: SOP.STUDY_ROOT_MOVE, get: SOP.STUDY_ROOT_GET },
  };
  const QR_ROLE = {};   // abstract syntax → { root, op }
  for (const r of Object.keys(QR)) for (const op of Object.keys(QR[r])) QR_ROLE[QR[r][op]] = { root: r, op };

  // Storage SOP classes [suffix of 1.2.840.10008.5.1.4.1.1., name, common?] — common ones get extra C-GET contexts
  const STORAGE_SOP_CLASSES = [
    ['1', 'Computed Radiography Image Storage', 1],
    ['1.1', 'Digital X-Ray Image Storage – For Presentation', 1],
    ['1.1.1', 'Digital X-Ray Image Storage – For Processing', 1],
    ['1.2', 'Digital Mammography X-Ray Image Storage – For Presentation', 1],
    ['1.2.1', 'Digital Mammography X-Ray Image Storage – For Processing', 1],
    ['1.3', 'Digital Intra-Oral X-Ray Image Storage – For Presentation'],
    ['2', 'CT Image Storage', 1],
    ['2.1', 'Enhanced CT Image Storage', 1],
    ['2.2', 'Legacy Converted Enhanced CT Image Storage'],
    ['3', 'Ultrasound Multi-frame Image Storage (Retired)'],
    ['3.1', 'Ultrasound Multi-frame Image Storage', 1],
    ['4', 'MR Image Storage', 1],
    ['4.1', 'Enhanced MR Image Storage', 1],
    ['4.2', 'MR Spectroscopy Storage'],
    ['4.3', 'Enhanced MR Color Image Storage'],
    ['4.4', 'Legacy Converted Enhanced MR Image Storage'],
    ['5', 'Nuclear Medicine Image Storage (Retired)'],
    ['6', 'Ultrasound Image Storage (Retired)'],
    ['6.1', 'Ultrasound Image Storage', 1],
    ['6.2', 'Enhanced US Volume Storage'],
    ['7', 'Secondary Capture Image Storage', 1],
    ['7.1', 'Multi-frame Single Bit Secondary Capture Image Storage'],
    ['7.2', 'Multi-frame Grayscale Byte Secondary Capture Image Storage', 1],
    ['7.3', 'Multi-frame Grayscale Word Secondary Capture Image Storage', 1],
    ['7.4', 'Multi-frame True Color Secondary Capture Image Storage', 1],
    ['9.1.1', '12-lead ECG Waveform Storage', 2],
    ['9.1.2', 'General ECG Waveform Storage', 2],
    ['9.1.3', 'Ambulatory ECG Waveform Storage'],
    ['9.2.1', 'Hemodynamic Waveform Storage'],
    ['9.4.1', 'Basic Voice Audio Waveform Storage'],
    ['11.1', 'Grayscale Softcopy Presentation State Storage'],
    ['12.1', 'X-Ray Angiographic Image Storage', 1],
    ['12.1.1', 'Enhanced XA Image Storage'],
    ['12.2', 'X-Ray Radiofluoroscopic Image Storage', 1],
    ['12.2.1', 'Enhanced XRF Image Storage'],
    ['13.1.1', 'X-Ray 3D Angiographic Image Storage'],
    ['13.1.3', 'Breast Tomosynthesis Image Storage'],
    ['20', 'Nuclear Medicine Image Storage', 1],
    ['30', 'Parametric Map Storage'],
    ['66', 'Raw Data Storage'],
    ['66.1', 'Spatial Registration Storage'],
    ['66.4', 'Segmentation Storage', 1],
    ['77.1.1', 'VL Endoscopic Image Storage'],
    ['77.1.2', 'VL Microscopic Image Storage'],
    ['77.1.4', 'VL Photographic Image Storage'],
    ['77.1.5.1', 'Ophthalmic Photography 8 Bit Image Storage'],
    ['77.1.6', 'VL Whole Slide Microscopy Image Storage'],
    ['88.11', 'Basic Text SR Storage', 2],
    ['88.22', 'Enhanced SR Storage', 2],
    ['88.33', 'Comprehensive SR Storage', 2],
    ['88.34', 'Comprehensive 3D SR Storage'],
    ['88.50', 'Mammography CAD SR Storage'],
    ['88.59', 'Key Object Selection Document Storage'],
    ['88.67', 'X-Ray Radiation Dose SR Storage'],
    ['104.1', 'Encapsulated PDF Storage', 2],
    ['104.2', 'Encapsulated CDA Storage'],
    ['104.3', 'Encapsulated STL Storage'],
    ['128', 'Positron Emission Tomography Image Storage', 1],
    ['128.1', 'Legacy Converted Enhanced PET Image Storage'],
    ['130', 'Enhanced PET Image Storage'],
    ['481.1', 'RT Image Storage', 1],
    ['481.2', 'RT Dose Storage', 2],
    ['481.3', 'RT Structure Set Storage', 2],
    ['481.4', 'RT Beams Treatment Record Storage'],
    ['481.5', 'RT Plan Storage', 2],
    ['481.8', 'RT Ion Plan Storage'],
  ].map(([s, name, common]) => ({ uid: '1.2.840.10008.5.1.4.1.1.' + s, name, common: common || 0 }));
  const STORAGE_UIDS = new Set(STORAGE_SOP_CLASSES.map((s) => s.uid));
  const SOP_NAMES = Object.fromEntries(STORAGE_SOP_CLASSES.map((s) => [s.uid, s.name]));
  Object.assign(SOP_NAMES, {
    [SOP.VERIFICATION]: 'Verification',
    [SOP.PATIENT_ROOT_FIND]: 'Patient Root Q/R – FIND', [SOP.PATIENT_ROOT_MOVE]: 'Patient Root Q/R – MOVE', [SOP.PATIENT_ROOT_GET]: 'Patient Root Q/R – GET',
    [SOP.STUDY_ROOT_FIND]: 'Study Root Q/R – FIND', [SOP.STUDY_ROOT_MOVE]: 'Study Root Q/R – MOVE', [SOP.STUDY_ROOT_GET]: 'Study Root Q/R – GET',
  });
  const sopName = (uid) => SOP_NAMES[uid] || uid;
  const tsName = (uid) => TS_NAMES[uid] || uid;

  const APP_CONTEXT = '1.2.840.10008.3.1.1.1';
  const IMPLEMENTATION_CLASS_UID = '2.25.302049521218591513298742012993571236427';
  const IMPLEMENTATION_VERSION = 'MYDCMVIEWER_10';
  const DEFAULT_MAX_PDU = 65536;
  const MAX_SEND_FRAGMENT = 1 << 20;   // when the peer says "unlimited"

  // DIMSE command fields
  const CMD = {
    C_STORE_RQ: 0x0001, C_STORE_RSP: 0x8001, C_GET_RQ: 0x0010, C_GET_RSP: 0x8010, C_FIND_RQ: 0x0020, C_FIND_RSP: 0x8020,
    C_MOVE_RQ: 0x0021, C_MOVE_RSP: 0x8021, C_ECHO_RQ: 0x0030, C_ECHO_RSP: 0x8030, C_CANCEL_RQ: 0x0FFF,
  };
  const NO_DATASET = 0x0101;
  const LEVELS = ['PATIENT', 'STUDY', 'SERIES', 'IMAGE'];
  const LEVEL_KEY = { PATIENT: 'PatientID', STUDY: 'StudyInstanceUID', SERIES: 'SeriesInstanceUID', IMAGE: 'SOPInstanceUID' };

  /* ── Dictionary: command set + the keys a PACS UI queries / shows ── */
  const DICT_LIST = [
    ['00000000', 'UL', 'CommandGroupLength'], ['00000002', 'UI', 'AffectedSOPClassUID'], ['00000003', 'UI', 'RequestedSOPClassUID'],
    ['00000100', 'US', 'CommandField'], ['00000110', 'US', 'MessageID'], ['00000120', 'US', 'MessageIDBeingRespondedTo'],
    ['00000600', 'AE', 'MoveDestination'], ['00000700', 'US', 'Priority'], ['00000800', 'US', 'CommandDataSetType'],
    ['00000900', 'US', 'Status'], ['00000901', 'AT', 'OffendingElement'], ['00000902', 'LO', 'ErrorComment'], ['00000903', 'US', 'ErrorID'],
    ['00001000', 'UI', 'AffectedSOPInstanceUID'], ['00001001', 'UI', 'RequestedSOPInstanceUID'],
    ['00001020', 'US', 'NumberOfRemainingSuboperations'], ['00001021', 'US', 'NumberOfCompletedSuboperations'],
    ['00001022', 'US', 'NumberOfFailedSuboperations'], ['00001023', 'US', 'NumberOfWarningSuboperations'],
    ['00001030', 'AE', 'MoveOriginatorApplicationEntityTitle'], ['00001031', 'US', 'MoveOriginatorMessageID'],
    ['00020000', 'UL', 'FileMetaInformationGroupLength'], ['00020001', 'OB', 'FileMetaInformationVersion'],
    ['00020002', 'UI', 'MediaStorageSOPClassUID'], ['00020003', 'UI', 'MediaStorageSOPInstanceUID'], ['00020010', 'UI', 'TransferSyntaxUID'],
    ['00020012', 'UI', 'ImplementationClassUID'], ['00020013', 'SH', 'ImplementationVersionName'], ['00020016', 'AE', 'SourceApplicationEntityTitle'],
    ['00080005', 'CS', 'SpecificCharacterSet'], ['00080008', 'CS', 'ImageType'], ['00080012', 'DA', 'InstanceCreationDate'], ['00080013', 'TM', 'InstanceCreationTime'],
    ['00080016', 'UI', 'SOPClassUID'], ['00080018', 'UI', 'SOPInstanceUID'],
    ['00080020', 'DA', 'StudyDate'], ['00080021', 'DA', 'SeriesDate'], ['00080022', 'DA', 'AcquisitionDate'], ['00080023', 'DA', 'ContentDate'],
    ['00080030', 'TM', 'StudyTime'], ['00080031', 'TM', 'SeriesTime'], ['00080032', 'TM', 'AcquisitionTime'], ['00080033', 'TM', 'ContentTime'],
    ['00080050', 'SH', 'AccessionNumber'], ['00080052', 'CS', 'QueryRetrieveLevel'], ['00080054', 'AE', 'RetrieveAETitle'],
    ['00080056', 'CS', 'InstanceAvailability'], ['00080058', 'UI', 'FailedSOPInstanceUIDList'],
    ['00080060', 'CS', 'Modality'], ['00080061', 'CS', 'ModalitiesInStudy'], ['00080062', 'UI', 'SOPClassesInStudy'],
    ['00080070', 'LO', 'Manufacturer'], ['00080080', 'LO', 'InstitutionName'], ['00080090', 'PN', 'ReferringPhysicianName'],
    ['00080201', 'SH', 'TimezoneOffsetFromUTC'], ['00081010', 'SH', 'StationName'], ['00081030', 'LO', 'StudyDescription'],
    ['0008103E', 'LO', 'SeriesDescription'], ['00081040', 'LO', 'InstitutionalDepartmentName'], ['00081050', 'PN', 'PerformingPhysicianName'],
    ['00081060', 'PN', 'NameOfPhysiciansReadingStudy'], ['00081090', 'LO', 'ManufacturerModelName'],
    ['00081110', 'SQ', 'ReferencedStudySequence'], ['00081115', 'SQ', 'ReferencedSeriesSequence'], ['00081150', 'UI', 'ReferencedSOPClassUID'],
    ['00081155', 'UI', 'ReferencedSOPInstanceUID'], ['00081199', 'SQ', 'ReferencedSOPSequence'],
    ['00100010', 'PN', 'PatientName'], ['00100020', 'LO', 'PatientID'], ['00100021', 'LO', 'IssuerOfPatientID'],
    ['00100030', 'DA', 'PatientBirthDate'], ['00100032', 'TM', 'PatientBirthTime'], ['00100040', 'CS', 'PatientSex'],
    ['00101010', 'AS', 'PatientAge'], ['00101020', 'DS', 'PatientSize'], ['00101030', 'DS', 'PatientWeight'], ['00104000', 'LT', 'PatientComments'],
    ['00180015', 'CS', 'BodyPartExamined'], ['00180050', 'DS', 'SliceThickness'], ['00181030', 'LO', 'ProtocolName'],
    ['0020000D', 'UI', 'StudyInstanceUID'], ['0020000E', 'UI', 'SeriesInstanceUID'], ['00200010', 'SH', 'StudyID'],
    ['00200011', 'IS', 'SeriesNumber'], ['00200012', 'IS', 'AcquisitionNumber'], ['00200013', 'IS', 'InstanceNumber'],
    ['00200032', 'DS', 'ImagePositionPatient'], ['00200037', 'DS', 'ImageOrientationPatient'], ['00201041', 'DS', 'SliceLocation'],
    ['00201200', 'IS', 'NumberOfPatientRelatedStudies'], ['00201202', 'IS', 'NumberOfPatientRelatedSeries'],
    ['00201204', 'IS', 'NumberOfPatientRelatedInstances'], ['00201206', 'IS', 'NumberOfStudyRelatedSeries'],
    ['00201208', 'IS', 'NumberOfStudyRelatedInstances'], ['00201209', 'IS', 'NumberOfSeriesRelatedInstances'],
    ['00280002', 'US', 'SamplesPerPixel'], ['00280004', 'CS', 'PhotometricInterpretation'], ['00280008', 'IS', 'NumberOfFrames'],
    ['00280010', 'US', 'Rows'], ['00280011', 'US', 'Columns'], ['00280030', 'DS', 'PixelSpacing'], ['00280100', 'US', 'BitsAllocated'],
    ['00321060', 'LO', 'RequestedProcedureDescription'], ['00400244', 'DA', 'PerformedProcedureStepStartDate'],
    ['00400245', 'TM', 'PerformedProcedureStepStartTime'], ['7FE00010', 'OW', 'PixelData'],
  ];
  const DICT = {};          // keyword → { tag, hex, vr, keyword }
  const DICT_BY_TAG = {};   // tag number → entry
  for (const [hex, vr, keyword] of DICT_LIST) {
    const e = { tag: parseInt(hex, 16) >>> 0, hex, vr, keyword };
    DICT[keyword] = e; DICT_BY_TAG[e.tag] = e;
  }

  // Return keys find() asks for by default (the caller's query overrides / adds)
  const DEFAULT_KEYS = {
    PATIENT: ['PatientName', 'PatientID', 'PatientBirthDate', 'PatientSex', 'NumberOfPatientRelatedStudies'],
    STUDY: ['PatientName', 'PatientID', 'PatientBirthDate', 'PatientSex', 'StudyDate', 'StudyTime', 'AccessionNumber', 'StudyID',
      'StudyDescription', 'ModalitiesInStudy', 'ReferringPhysicianName', 'StudyInstanceUID', 'NumberOfStudyRelatedSeries',
      'NumberOfStudyRelatedInstances'],
    SERIES: ['StudyInstanceUID', 'SeriesInstanceUID', 'Modality', 'SeriesNumber', 'SeriesDescription', 'SeriesDate', 'SeriesTime',
      'BodyPartExamined', 'NumberOfSeriesRelatedInstances'],
    IMAGE: ['StudyInstanceUID', 'SeriesInstanceUID', 'SOPInstanceUID', 'SOPClassUID', 'InstanceNumber', 'ContentDate', 'ContentTime'],
  };

  /* ── Status codes ── */
  const STATUS_TEXT = {
    0x0000: 'Success', 0xFF00: 'Pending', 0xFF01: 'Pending (optional keys not supported)', 0xFE00: 'Cancelled',
    0x0001: 'Warning: requested optional attributes are not supported', 0x0107: 'Warning: attribute list error',
    0x0116: 'Warning: attribute value out of range', 0xB000: 'Warning: coercion of data elements / sub-operations completed with failures',
    0xB006: 'Warning: elements discarded', 0xB007: 'Warning: data set does not match SOP class',
    0x0110: 'Processing failure', 0x0111: 'Duplicate SOP instance', 0x0112: 'No such SOP instance', 0x0117: 'Invalid object instance',
    0x0118: 'No such SOP class', 0x0119: 'Class / instance conflict', 0x0122: 'Refused: SOP class not supported',
    0x0124: 'Refused: not authorized', 0x0210: 'Duplicate invocation', 0x0211: 'Unrecognized operation', 0x0212: 'Mistyped argument',
    0x0213: 'Resource limitation', 0xA700: 'Refused: out of resources',
    0xA701: 'Refused: out of resources – unable to calculate number of matches',
    0xA702: 'Refused: out of resources – unable to perform sub-operations', 0xA801: 'Refused: move destination unknown',
    0xA900: 'Error: data set does not match SOP class / identifier does not match SOP class',
    0xC000: 'Error: cannot understand / unable to process',
  };
  function statusCategory(code) {
    if (code === 0) return 'success';
    if (code === 0xFF00 || code === 0xFF01) return 'pending';
    if (code === 0xFE00) return 'cancel';
    if (code === 0x0001 || code === 0x0107 || code === 0x0116 || (code >= 0xB000 && code <= 0xBFFF)) return 'warning';
    return 'failure';
  }
  function statusText(code) {
    if (STATUS_TEXT[code]) return STATUS_TEXT[code];
    if (code >= 0xA700 && code <= 0xA7FF) return 'Refused: out of resources';
    if (code >= 0xA900 && code <= 0xA9FF) return 'Error: data set does not match SOP class';
    if (code >= 0xC000 && code <= 0xCFFF) return 'Error: cannot understand';
    if (code >= 0xB000 && code <= 0xBFFF) return 'Warning';
    return 'Status 0x' + hex4(code);
  }
  function statusResult(code, extra) {
    code = code == null ? 0xC000 : code;
    const category = statusCategory(code);
    return Object.assign({ status: code, hex: '0x' + hex4(code), text: statusText(code), category, ok: category === 'success' || category === 'warning' }, extra || {});
  }

  /* ── Errors ── */
  class DicomNetError extends Error {
    constructor(code, message, extra) {
      super(message);
      this.name = 'DicomNetError';
      this.code = code;
      if (extra) Object.assign(this, extra);
    }
  }
  const REJECT_RESULT = { 1: 'permanently', 2: 'transiently' };
  const REJECT_REASON = {
    1: { 1: 'no reason given', 2: 'application context name not supported', 3: 'calling AE title not recognised', 7: 'called AE title not recognised' },
    2: { 1: 'no reason given', 2: 'protocol version not supported' },
    3: { 1: 'temporary congestion', 2: 'local limit exceeded' },
  };
  const REJECT_SOURCE = { 1: 'the called AE', 2: 'the peer (ACSE)', 3: 'the peer (presentation layer)' };
  const ABORT_REASON = { 0: 'reason not specified', 1: 'unrecognised PDU', 2: 'unexpected PDU', 4: 'unrecognised PDU parameter',
    5: 'unexpected PDU parameter', 6: 'invalid PDU parameter value' };
  const PC_RESULT = { 0: 'accepted', 1: 'user rejection', 2: 'no reason (provider rejection)', 3: 'abstract syntax not supported',
    4: 'transfer syntaxes not supported' };

  /* ── Bytes ── */
  const EMPTY = new Uint8Array(0);
  const hex4 = (v) => (v >>> 0).toString(16).toUpperCase().padStart(4, '0');
  const tagHex = (tag) => (tag >>> 0).toString(16).toUpperCase().padStart(8, '0');
  function toU8(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (Array.isArray(data)) return Uint8Array.from(data);
    throw new DicomNetError('INVALID', 'Expected bytes');
  }
  function concat(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }
  const ascii = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; };
  const latin1 = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
  const utf8Enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const utf8 = (s) => (utf8Enc ? utf8Enc.encode(s) : ascii(unescape(encodeURIComponent(s))));
  const u16be = (v) => new Uint8Array([(v >> 8) & 255, v & 255]);
  const u32be = (v) => new Uint8Array([(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  const rd16be = (b, p) => (b[p] << 8) | b[p + 1];
  const rd32be = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  const trimAE = (s) => String(s == null ? '' : s).replace(/[\0 ]+$/, '').replace(/^ +/, '');
  function padAE(s) {
    const v = trimAE(s);
    if (!v || v.length > 16 || /[\\\x00-\x1f]/.test(v)) throw new DicomNetError('INVALID', `Invalid AE title "${s}" (1–16 characters, no backslash)`);
    return ascii(v.padEnd(16, ' '));
  }
  const cleanUid = (s) => String(s || '').replace(/[\0 ]+$/, '').trim();

  /* ── Text (Specific Character Set) ── */
  const decoders = {};
  function textDecoder(label) {
    if (!(label in decoders)) { try { decoders[label] = new TextDecoder(label); } catch { decoders[label] = null; } }
    return decoders[label];
  }
  function decodeText(bytes, charset) {
    if (!bytes.length) return '';
    let ascii7 = true;
    for (let i = 0; i < bytes.length; i++) if (bytes[i] > 0x7f || bytes[i] === 0x1b) { ascii7 = false; break; }
    if (ascii7) return latin1(bytes);
    const cs = String(charset || '').toUpperCase();
    const pick = (label, b) => { const d = textDecoder(label); return d ? d.decode(b) : latin1(b); };
    const stripEsc = (b) => { const o = []; for (let i = 0; i < b.length; i++) { if (b[i] === 0x1b) { i += (b[i + 1] === 0x24 && (b[i + 2] === 0x28 || b[i + 2] === 0x29)) ? 3 : 2; continue; } o.push(b[i]); } return Uint8Array.from(o); };
    if (cs.includes('192')) return pick('utf-8', bytes);
    if (cs.includes('149')) return pick('euc-kr', stripEsc(bytes));
    if (cs.includes('IR 87') || cs.includes('IR 159')) return pick('iso-2022-jp', bytes);
    if (cs.includes('IR 13')) return pick('shift_jis', bytes);
    if (cs.includes('GB18030')) return pick('gb18030', bytes);
    if (cs.includes('GBK') || cs.includes('IR 58')) return pick('gbk', stripEsc(bytes));
    const iso = { 100: 'iso-8859-1', 101: 'iso-8859-2', 109: 'iso-8859-3', 110: 'iso-8859-4', 144: 'iso-8859-5', 127: 'iso-8859-6',
      126: 'iso-8859-7', 138: 'iso-8859-8', 148: 'iso-8859-9', 203: 'iso-8859-15', 166: 'windows-874' };
    const m = /IR (\d+)/.exec(cs);
    if (m && iso[m[1]]) return pick(iso[m[1]], stripEsc(bytes));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return latin1(bytes); }
  }

  /* ── Data elements ── */
  const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV']);
  const STRING_VR = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UI', 'UR', 'UT']);
  const TEXT_VR = new Set(['LT', 'ST', 'UT']);   // leading spaces are significant
  const UNDEF = 0xFFFFFFFF;

  function parseTagKey(k) {
    if (typeof k === 'number') return k >>> 0;
    if (DICT[k]) return DICT[k].tag;
    const m = /^\(?x?([0-9a-f]{4}),?([0-9a-f]{4})\)?$/i.exec(String(k));
    return m ? parseInt(m[1] + m[2], 16) >>> 0 : null;
  }
  function vrOf(tag) {
    const d = DICT_BY_TAG[tag];
    if (d) return d.vr;
    if ((tag & 0xffff) === 0) return 'UL';   // group length
    return 'UN';
  }

  function elementHeader(tag, vr, len, explicit) {
    const g = tag >>> 16, e = tag & 0xffff;
    if (!explicit || g === 0xFFFE) {
      const b = new Uint8Array(8), v = new DataView(b.buffer);
      v.setUint16(0, g, true); v.setUint16(2, e, true); v.setUint32(4, len >>> 0, true);
      return b;
    }
    if (LONG_VR.has(vr)) {
      const b = new Uint8Array(12), v = new DataView(b.buffer);
      v.setUint16(0, g, true); v.setUint16(2, e, true); b[4] = vr.charCodeAt(0); b[5] = vr.charCodeAt(1); v.setUint32(8, len >>> 0, true);
      return b;
    }
    if (len > 0xffff) throw new DicomNetError('INVALID', `Value of ${tagHex(tag)} (${vr}) is too long for its VR`);
    const b = new Uint8Array(8), v = new DataView(b.buffer);
    v.setUint16(0, g, true); v.setUint16(2, e, true); b[4] = vr.charCodeAt(0); b[5] = vr.charCodeAt(1); v.setUint16(6, len, true);
    return b;
  }

  function padEven(b, pad) {
    if (!(b.length & 1)) return b;
    const o = new Uint8Array(b.length + 1); o.set(b); o[b.length] = pad;
    return o;
  }
  function numberBytes(vr, v) {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? (v === '' ? [] : v.split('\\')) : [v];
    const size = { US: 2, SS: 2, UL: 4, SL: 4, FL: 4, FD: 8, AT: 4 }[vr];
    const b = new Uint8Array(list.length * size), d = new DataView(b.buffer);
    list.forEach((x, i) => {
      const n = typeof x === 'string' && vr === 'AT' ? parseTagKey(x) : Number(x);
      const at = i * size;
      if (vr === 'US') d.setUint16(at, n, true); else if (vr === 'SS') d.setInt16(at, n, true);
      else if (vr === 'UL') d.setUint32(at, n >>> 0, true); else if (vr === 'SL') d.setInt32(at, n, true);
      else if (vr === 'FL') d.setFloat32(at, n, true); else if (vr === 'FD') d.setFloat64(at, n, true);
      else { d.setUint16(at, n >>> 16, true); d.setUint16(at + 2, n & 0xffff, true); }
    });
    return b;
  }
  function valueBytes(vr, v, useUtf8) {
    if (v == null) return EMPTY;
    if (v instanceof Uint8Array || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return padEven(toU8(v), 0);
    if (['US', 'SS', 'UL', 'SL', 'FL', 'FD', 'AT'].includes(vr)) return numberBytes(vr, v);
    const s = Array.isArray(v) ? v.join('\\') : String(v);
    const b = useUtf8 ? utf8(s) : ascii(s);
    return padEven(b, vr === 'UI' || vr === 'OB' || vr === 'UN' ? 0 : 0x20);
  }

  // obj → [{ tag, vr, value | items }] sorted by tag
  function toElements(obj) {
    const out = [];
    for (const [k, raw] of Object.entries(obj || {})) {
      if (k === 'tags' && raw && typeof raw === 'object' && !Array.isArray(raw)) continue;
      const tag = parseTagKey(k);
      if (tag == null) throw new DicomNetError('INVALID', `Unknown DICOM keyword or tag "${k}"`);
      let vr = vrOf(tag), value = raw;
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && !ArrayBuffer.isView(raw) && !(raw instanceof ArrayBuffer) && 'vr' in raw) {
        vr = raw.vr || vr; value = raw.value;
      }
      if (vr === 'SQ' || (Array.isArray(value) && value.length && typeof value[0] === 'object' && !ArrayBuffer.isView(value[0]))) {
        vr = 'SQ';
        out.push({ tag, vr, items: (value || []).map(toElements) });
      } else {
        out.push({ tag, vr, value });
      }
    }
    return out.sort((a, b) => a.tag - b.tag);
  }
  function hasNonAscii(els) {
    for (const e of els) {
      if (e.items) { if (e.items.some(hasNonAscii)) return true; continue; }
      if (STRING_VR.has(e.vr) && e.value != null && /[^\x00-\x7f]/.test(Array.isArray(e.value) ? e.value.join('\\') : String(e.value))) return true;
    }
    return false;
  }
  function writeElements(els, explicit, useUtf8, parts) {
    for (const e of els) {
      if (e.items) {
        const items = e.items.map((it) => { const p = []; writeElements(it, explicit, useUtf8, p); return concat(p); });
        const body = concat(items.map((b) => concat([elementHeader(0xFFFEE000, '', b.length, explicit), b])));
        parts.push(elementHeader(e.tag, 'SQ', body.length, explicit), body);
        continue;
      }
      const v = valueBytes(e.vr, e.value, useUtf8);
      parts.push(elementHeader(e.tag, e.vr, v.length, explicit), v);
    }
  }
  /** Encode an identifier / data set: { Keyword | 'GGGGEEEE' | '(GGGG,EEEE)': value | { vr, value } }. */
  function encodeDataset(obj, opts) {
    const explicit = !opts || opts.explicit !== false;
    const els = toElements(obj);
    const cs = els.find((e) => e.tag === 0x00080005);
    let useUtf8 = !!(cs && /192/.test(String(cs.value)));
    if (!cs && hasNonAscii(els)) { els.unshift({ tag: 0x00080005, vr: 'CS', value: 'ISO_IR 192' }); useUtf8 = true; els.sort((a, b) => a.tag - b.tag); }
    const parts = [];
    writeElements(els, explicit, useUtf8, parts);
    return concat(parts);
  }

  function readValue(vr, b, le, charset) {
    if (STRING_VR.has(vr)) {
      let s = vr === 'UI' || vr === 'AE' || vr === 'CS' || vr === 'DA' || vr === 'TM' || vr === 'DT' || vr === 'DS' || vr === 'IS' || vr === 'AS' ? latin1(b) : decodeText(b, charset);
      s = s.replace(/[\0 ]+$/, '');
      return TEXT_VR.has(vr) ? s : s.replace(/^ +/, '');
    }
    const size = { US: 2, SS: 2, UL: 4, SL: 4, FL: 4, FD: 8, AT: 4 }[vr];
    if (!size) return b;
    const d = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
    for (let i = 0; i + size <= b.length; i += size) {
      if (vr === 'US') out.push(d.getUint16(i, le)); else if (vr === 'SS') out.push(d.getInt16(i, le));
      else if (vr === 'UL') out.push(d.getUint32(i, le)); else if (vr === 'SL') out.push(d.getInt32(i, le));
      else if (vr === 'FL') out.push(d.getFloat32(i, le)); else if (vr === 'FD') out.push(d.getFloat64(i, le));
      else out.push(((d.getUint16(i, le) << 16) | d.getUint16(i + 2, le)) >>> 0);
    }
    return out.length === 1 ? out[0] : out;
  }
  // Walks elements in [pos, end); stops at an item delimiter when nested. Returns the next position.
  function readElements(c, pos, end, out, top) {
    const { b, d, le } = c;
    while (pos + 8 <= end) {
      const g = d.getUint16(pos, le), e = d.getUint16(pos + 2, le), tag = ((g << 16) | e) >>> 0;
      if (tag === 0xFFFEE00D) return pos + 8;
      if (tag === 0xFFFEE0DD) return pos + 8;
      if (top && tag >= c.until) return pos;
      let vr, len, hdr;
      const vr0 = String.fromCharCode(b[pos + 4], b[pos + 5]);
      if (c.explicit && g !== 0xFFFE && /^[A-Z]{2}$/.test(vr0)) {
        vr = vr0;
        if (LONG_VR.has(vr)) { len = d.getUint32(pos + 8, le); hdr = 12; } else { len = d.getUint16(pos + 6, le); hdr = 8; }
      } else {
        vr = vrOf(tag); len = d.getUint32(pos + 4, le); hdr = 8;
      }
      const start = pos + hdr;
      let value, next;
      if (vr === 'SQ' || (len === UNDEF && tag !== 0x7FE00010)) {
        const nested = vr === 'UN' && len === UNDEF ? { ...c, explicit: false } : c;   // UN with undefined length = implicit SQ
        const items = [];
        const seqEnd = len === UNDEF ? end : start + len;
        let p = start;
        while (p + 8 <= seqEnd) {
          const ig = d.getUint16(p, le), ie = d.getUint16(p + 2, le);
          if (ig === 0xFFFE && ie === 0xE0DD) { p += 8; break; }
          if (ig !== 0xFFFE || ie !== 0xE000) throw new DicomNetError('PROTOCOL', `Malformed sequence ${tagHex(tag)} at byte ${p}`);
          const ilen = d.getUint32(p + 4, le);
          const item = newObj();
          if (ilen === UNDEF) p = readElements(nested, p + 8, seqEnd, item, false);
          else { readElements(nested, p + 8, p + 8 + ilen, item, false); p = p + 8 + ilen; }
          items.push(item);
        }
        value = items; vr = 'SQ';
        next = len === UNDEF ? p : start + len;
      } else if (len === UNDEF) {
        // encapsulated pixel data: skip fragments up to the sequence delimiter
        let p = start;
        while (p + 8 <= end) {
          const ig = d.getUint16(p, le), ie = d.getUint16(p + 2, le), il = d.getUint32(p + 4, le);
          p += 8;
          if (ig === 0xFFFE && ie === 0xE0DD) break;
          p += il;
        }
        value = b.subarray(start, p); next = p;
      } else {
        if (start + len > b.length) throw new DicomNetError('PROTOCOL', `Element ${tagHex(tag)} runs past the end of the data set`);
        value = readValue(vr, b.subarray(start, start + len), le, c.charset);
        next = start + len;
      }
      if (tag === 0x00080005) c.charset = Array.isArray(value) ? value.join('\\') : String(value || '');
      const entry = DICT_BY_TAG[tag];
      out.tags[tagHex(tag)] = { vr, value };
      if (entry) out[entry.keyword] = value;
      pos = next;
    }
    return pos;
  }
  const newObj = () => Object.defineProperty({}, 'tags', { value: {}, enumerable: false, writable: true });
  /** Decode a data set → { Keyword: value, tags: { GGGGEEEE: { vr, value } } } ('tags' is non-enumerable). */
  function decodeDataset(bytes, opts) {
    opts = opts || {};
    const b = toU8(bytes);
    const c = { b, d: new DataView(b.buffer, b.byteOffset, b.byteLength), explicit: opts.explicit !== false, le: opts.littleEndian !== false,
      until: opts.until == null ? 0x100000000 : opts.until, charset: opts.charset || '' };
    const out = newObj();
    readElements(c, 0, b.length, out, true);
    return out;
  }
  const decodeCommand = (bytes) => decodeDataset(bytes, { explicit: false });
  function encodeCommand(cmd) {
    const els = [];
    for (const [k, v] of Object.entries(cmd)) {
      if (v == null || k === 'CommandGroupLength') continue;
      const d = DICT[k];
      if (!d || (d.tag >>> 16) !== 0) throw new DicomNetError('INVALID', `Unknown command element ${k}`);
      els.push({ tag: d.tag, vr: d.vr, value: v });
    }
    els.sort((a, b) => a.tag - b.tag);
    const parts = [];
    writeElements(els, false, false, parts);
    const body = concat(parts);
    return concat([elementHeader(0, 'UL', 4, false), numberBytes('UL', body.length), body]);
  }

  /** Explicit VR LE data set → Implicit VR LE (sequences rewritten with undefined lengths). */
  function explicitToImplicit(dataset) {
    const b = toU8(dataset), d = new DataView(b.buffer, b.byteOffset, b.byteLength), parts = [];
    const hdr = (tag, len) => elementHeader(tag, '', len, false);
    function walk(pos, end, nested) {
      while (pos + 8 <= end) {
        const g = d.getUint16(pos, true), e = d.getUint16(pos + 2, true), tag = ((g << 16) | e) >>> 0;
        if (tag === 0xFFFEE00D && nested) return pos + 8;
        const vr = String.fromCharCode(b[pos + 4], b[pos + 5]);
        let len, start;
        if (LONG_VR.has(vr)) { len = d.getUint32(pos + 8, true); start = pos + 12; } else { len = d.getUint16(pos + 6, true); start = pos + 8; }
        if (vr === 'SQ') {
          parts.push(hdr(tag, UNDEF));
          const seqEnd = len === UNDEF ? end : start + len;
          let p = start;
          while (p + 8 <= seqEnd) {
            const ig = d.getUint16(p, true), ie = d.getUint16(p + 2, true);
            if (ig === 0xFFFE && ie === 0xE0DD) { p += 8; break; }
            const ilen = d.getUint32(p + 4, true);
            parts.push(hdr(0xFFFEE000, UNDEF));
            if (ilen === UNDEF) p = walk(p + 8, seqEnd, true);
            else { walk(p + 8, p + 8 + ilen, false); p += 8 + ilen; }
            parts.push(hdr(0xFFFEE00D, 0));
          }
          parts.push(hdr(0xFFFEE0DD, 0));
          pos = len === UNDEF ? p : start + len;
        } else if (len === UNDEF) {
          throw new DicomNetError('INVALID', `Cannot convert ${tagHex(tag)} (${vr}, undefined length) to Implicit VR`);
        } else {
          parts.push(hdr(tag, len), b.subarray(start, start + len));
          pos = start + len;
        }
      }
      return pos;
    }
    walk(0, b.length, false);
    return concat(parts);
  }

  /* ── Part 10 ── */
  function getDicomParser() {
    if (typeof dicomParser !== 'undefined') return dicomParser;   // eslint-disable-line no-undef
    if (typeof module === 'object' && module.exports && typeof require === 'function') { try { return require('dicom-parser'); } catch { /* optional */ } }
    return null;
  }
  function getInflate() {
    if (typeof pako !== 'undefined') return (b) => pako.inflateRaw(b);   // eslint-disable-line no-undef
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      try { const z = require('zlib'); return (b) => new Uint8Array(z.inflateRawSync(b)); } catch { /* optional */ }
    }
    return null;
  }
  /** Data set as received on the wire → Part 10 file (preamble, DICM, file meta group). */
  function toPart10(dataset, info) {
    info = info || {};
    const ts = cleanUid(info.transferSyntax) || TS.IMPLICIT_LE;
    const els = [
      { tag: 0x00020001, vr: 'OB', value: new Uint8Array([0, 1]) },
      { tag: 0x00020002, vr: 'UI', value: cleanUid(info.sopClassUid) },
      { tag: 0x00020003, vr: 'UI', value: cleanUid(info.sopInstanceUid) },
      { tag: 0x00020010, vr: 'UI', value: ts },
      { tag: 0x00020012, vr: 'UI', value: IMPLEMENTATION_CLASS_UID },
      { tag: 0x00020013, vr: 'SH', value: IMPLEMENTATION_VERSION },
    ];
    if (info.sourceAE && trimAE(info.sourceAE)) els.push({ tag: 0x00020016, vr: 'AE', value: trimAE(info.sourceAE) });
    const parts = [];
    writeElements(els, true, false, parts);
    const meta = concat(parts);
    const gl = concat([elementHeader(0x00020000, 'UL', 4, true), numberBytes('UL', meta.length)]);
    const pre = new Uint8Array(132);
    pre.set(ascii('DICM'), 128);
    return concat([pre, gl, meta, toU8(dataset)]);
  }
  /** Part 10 file → { dataset, transferSyntax, sopClassUid, sopInstanceUid, meta }. Raw data sets (no meta) work too. */
  function parsePart10(bytes) {
    const b = toU8(bytes);
    const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let pos = 0;
    if (b.length >= 132 && b[128] === 0x44 && b[129] === 0x49 && b[130] === 0x43 && b[131] === 0x4d) pos = 132;
    const metaStart = pos;
    while (pos + 8 <= b.length && d.getUint16(pos, true) === 0x0002) {
      const vr = String.fromCharCode(b[pos + 4], b[pos + 5]);
      if (/^[A-Z]{2}$/.test(vr)) {
        if (LONG_VR.has(vr)) pos += 12 + d.getUint32(pos + 8, true); else pos += 8 + d.getUint16(pos + 6, true);
      } else pos += 8 + d.getUint32(pos + 4, true);   // implicit meta (non-conformant files)
    }
    const meta = decodeDataset(b.subarray(metaStart, pos), { explicit: true });
    const dataset = b.subarray(pos);
    let ts = cleanUid(meta.TransferSyntaxUID);
    if (!ts) {   // no meta: sniff explicit vs implicit
      const vr = dataset.length > 6 ? String.fromCharCode(dataset[4], dataset[5]) : '';
      ts = /^[A-Z]{2}$/.test(vr) ? TS.EXPLICIT_LE : TS.IMPLICIT_LE;
    }
    let sopClassUid = cleanUid(meta.MediaStorageSOPClassUID), sopInstanceUid = cleanUid(meta.MediaStorageSOPInstanceUID);
    if (!sopClassUid || !sopInstanceUid) {
      const ids = datasetIds(dataset, ts);
      sopClassUid = sopClassUid || ids.sopClassUid; sopInstanceUid = sopInstanceUid || ids.sopInstanceUid;
    }
    return { dataset, transferSyntax: ts, sopClassUid, sopInstanceUid, meta, metaLength: pos };
  }
  function datasetIds(dataset, ts) {
    const dp = getDicomParser();
    if (dp && ts !== TS.DEFLATED_LE) {
      try {
        const ds = dp.parseDicom(dataset, { TransferSyntaxUID: ts, untilTag: 'x00080019' });
        return { sopClassUid: cleanUid(ds.string('x00080016')), sopInstanceUid: cleanUid(ds.string('x00080018')) };
      } catch { /* fall through to our own reader */ }
    }
    try {
      const o = readAttributes(dataset, ts, 0x00080019);
      return { sopClassUid: cleanUid(o.SOPClassUID), sopInstanceUid: cleanUid(o.SOPInstanceUID) };
    } catch { return { sopClassUid: '', sopInstanceUid: '' }; }
  }
  function readAttributes(dataset, ts, until) {
    let b = dataset;
    if (ts === TS.DEFLATED_LE) {
      const inflate = getInflate();
      if (!inflate) throw new DicomNetError('INVALID', 'Deflated data sets need pako or zlib');
      b = inflate(dataset);
    }
    return decodeDataset(b, { explicit: ts !== TS.IMPLICIT_LE, littleEndian: ts !== TS.EXPLICIT_BE, until });
  }

  /* ── Upper layer PDUs ── */
  function item(type, content) {
    const c = Array.isArray(content) ? concat(content) : content;
    return concat([new Uint8Array([type, 0]), u16be(c.length), c]);
  }
  function pdu(type, body) {
    return concat([new Uint8Array([type, 0]), u32be(body.length), body]);
  }
  function userInfo(maxPdu, roles) {
    const subs = [item(0x51, u32be(maxPdu >>> 0)), item(0x52, ascii(IMPLEMENTATION_CLASS_UID))];
    for (const r of roles || []) subs.push(item(0x54, [u16be(r.uid.length), ascii(r.uid), new Uint8Array([r.scu ? 1 : 0, r.scp ? 1 : 0])]));
    subs.push(item(0x55, ascii(IMPLEMENTATION_VERSION)));
    return item(0x50, subs);
  }
  function associateHeader(type, calledAE, callingAE, items) {
    return pdu(type, concat([u16be(1), new Uint8Array(2), padAE(calledAE), padAE(callingAE), new Uint8Array(32), ...items]));
  }
  function* subItems(b, pos, end) {
    while (pos + 4 <= end) {
      const type = b[pos], len = rd16be(b, pos + 2);
      yield { type, body: b.subarray(pos + 4, pos + 4 + len) };
      pos += 4 + len;
    }
  }
  const str = (b) => latin1(b).replace(/[\0 ]+$/, '');
  function parseUserInfo(body, out) {
    for (const s of subItems(body, 0, body.length)) {
      if (s.type === 0x51) out.maxPdu = rd32be(s.body, 0);
      else if (s.type === 0x52) out.implementationClassUID = str(s.body);
      else if (s.type === 0x55) out.implementationVersionName = str(s.body);
      else if (s.type === 0x54) {
        const n = rd16be(s.body, 0);
        out.roles.push({ uid: str(s.body.subarray(2, 2 + n)), scu: !!s.body[2 + n], scp: !!s.body[3 + n] });
      }
    }
  }
  // A-ASSOCIATE-RQ / -AC body (after the 6-byte PDU header)
  function parseAssociate(body) {
    const out = { calledAE: trimAE(latin1(body.subarray(4, 20))), callingAE: trimAE(latin1(body.subarray(20, 36))),
      contexts: [], roles: [], maxPdu: 0, implementationClassUID: '', implementationVersionName: '', appContext: '' };
    for (const it of subItems(body, 68, body.length)) {
      if (it.type === 0x10) out.appContext = str(it.body);
      else if (it.type === 0x20 || it.type === 0x21) {
        const pc = { id: it.body[0], result: it.body[2], abstractSyntax: '', transferSyntaxes: [] };
        for (const s of subItems(it.body, 4, it.body.length)) {
          if (s.type === 0x30) pc.abstractSyntax = str(s.body);
          else if (s.type === 0x40) pc.transferSyntaxes.push(str(s.body));
        }
        out.contexts.push(pc);
      } else if (it.type === 0x50) parseUserInfo(it.body, out);
    }
    return out;
  }

  // Splits incoming bytes into PDUs without quadratic copying
  function pduReader(onPdu) {
    const chunks = [];
    let total = 0;
    function take(n) {
      if (chunks[0].length >= n) {
        const out = chunks[0].subarray(0, n);
        if (chunks[0].length === n) chunks.shift(); else chunks[0] = chunks[0].subarray(n);
        total -= n;
        return out;
      }
      const out = new Uint8Array(n);
      let at = 0;
      while (at < n) {
        const c = chunks[0], k = Math.min(c.length, n - at);
        out.set(c.subarray(0, k), at); at += k;
        if (k === c.length) chunks.shift(); else chunks[0] = c.subarray(k);
      }
      total -= n;
      return out;
    }
    function peek6() {
      if (chunks[0].length >= 6) return chunks[0];
      const out = new Uint8Array(6);
      let at = 0;
      for (const c of chunks) { const k = Math.min(c.length, 6 - at); out.set(c.subarray(0, k), at); at += k; if (at === 6) break; }
      return out;
    }
    return function push(chunk) {
      if (chunk.length) { chunks.push(chunk); total += chunk.length; }
      while (total >= 6) {
        const h = peek6();
        const len = rd32be(h, 2);
        if (len > 0x7fffffff) throw new DicomNetError('PROTOCOL', 'PDU length out of range');
        if (total < 6 + len) break;
        const all = take(6 + len);
        onPdu(all[0], all.subarray(6));
      }
    };
  }

  /* ── Association ── */
  class Association {
    constructor(transport, opts, role) {
      this.transport = transport;
      this.opts = opts || {};
      this.role = role;   // 'requestor' | 'acceptor'
      this.maxPdu = this.opts.maxPdu == null ? DEFAULT_MAX_PDU : this.opts.maxPdu;
      this.timeout = this.opts.timeout == null ? 10000 : this.opts.timeout;
      this.dimseTimeout = this.opts.dimseTimeout == null ? 30000 : this.opts.dimseTimeout;
      this.peerMaxPdu = 0;
      this.contexts = [];
      this.roles = [];
      this.callingAE = ''; this.calledAE = '';
      this.peer = {};
      this.state = 'idle';
      this.error = null;
      this.onRequest = null;
      this.onCancel = null;
      this._pending = new Map();
      this._nextId = 1;
      this._incoming = null;
      this._phase = null;   // handler for association-phase PDUs
      this._early = [];     // PDUs that arrived before anyone waited for them
      this._releaseWaiter = null;
      this._writeChain = Promise.resolve();
      this.closed = new Promise((res) => { this._resolveClosed = res; });
      this._reader = pduReader((type, body) => this._onPdu(type, body));
      transport.onData((chunk) => {
        if (this.state === 'closed') return;
        try { this._reader(toU8(chunk)); } catch (e) { this._fail(e instanceof DicomNetError ? e : new DicomNetError('PROTOCOL', e.message)); this.abort(2, 6); }
      });
      transport.onClose(() => this._transportClosed());
    }
    get peerName() { return this.role === 'requestor' ? this.calledAE || 'the peer' : this.callingAE || 'the peer'; }

    contextFor(abstractSyntax, ts) {
      return this.contexts.find((c) => c.accepted && c.abstractSyntax === abstractSyntax && (!ts || c.transferSyntax === ts)) || null;
    }
    contextById(id) { return this.contexts.find((c) => c.id === id) || null; }

    _write(bytes) {
      const p = this._writeChain.then(() => this.transport.write(bytes));
      this._writeChain = p.catch(() => {});
      return p;
    }
    _onPdu(type, body) {
      this._touch();
      if (this._phase) { this._phase(type, body); return; }
      if (this.state === 'idle' || this.state === 'requesting') { this._early.push({ type, body }); return; }
      if (type === 0x04) this._onPData(body);
      else if (type === 0x05) this._onReleaseRq();
      else if (type === 0x06) { if (this._releaseWaiter) this._releaseWaiter(); }
      else if (type === 0x07) {
        const src = body[2], reason = body[3];
        this._fail(new DicomNetError('ABORTED', `Association aborted by ${src === 2 ? 'the peer\'s DICOM service provider' : this.peerName}` +
          (src === 2 ? ` (${ABORT_REASON[reason] || 'reason ' + reason})` : ''), { source: src, reason }));
        this._closeTransport();
      } else {
        this._fail(new DicomNetError('PROTOCOL', `Unexpected PDU type 0x${type.toString(16)} on an established association`));
        this.abort(2, 2);
      }
    }
    _onPData(body) {
      let p = 0;
      while (p + 6 <= body.length) {
        const len = rd32be(body, p), pcid = body[p + 4], mch = body[p + 5];
        const data = body.subarray(p + 6, p + 4 + len);
        p += 4 + len;
        let m = this._incoming;
        if (!m) m = this._incoming = { pcid, cmd: [], data: [], command: null, dataset: null };
        if (mch & 1) {
          m.cmd.push(data);
          if (mch & 2) {
            m.command = decodeCommand(concat(m.cmd));
            if (m.command.CommandDataSetType === NO_DATASET) { this._incoming = null; this._dispatch(m); }
          }
        } else {
          m.data.push(data);
          if (mch & 2) { this._incoming = null; m.dataset = m.data.length === 1 ? m.data[0] : concat(m.data); this._dispatch(m); }
        }
      }
    }
    _dispatch(m) {
      m.context = this.contextById(m.pcid);
      const cmd = m.command, field = cmd.CommandField;
      if (field & 0x8000) {
        const p = this._pending.get(cmd.MessageIDBeingRespondedTo);
        if (p) p.onResponse(m);
      } else if (field === CMD.C_CANCEL_RQ) {
        if (this.onCancel) this.onCancel(cmd.MessageIDBeingRespondedTo);
      } else if (this.onRequest) {
        Promise.resolve().then(() => this.onRequest(m)).catch((e) => { this._fail(e); this.abort(); });
      } else {
        // nobody handles requests here: answer "unrecognized operation"
        this.send(m.pcid, { CommandField: field | 0x8000, MessageIDBeingRespondedTo: cmd.MessageID, AffectedSOPClassUID: cmd.AffectedSOPClassUID, Status: 0x0211 }).catch(() => {});
      }
    }
    _touch() { for (const p of this._pending.values()) p.arm(); }

    /** Sends one DIMSE message (command + optional data set) fragmented to the peer's max PDU. */
    send(pcid, command, dataset) {
      if (this.state !== 'established') return Promise.reject(this.error || new DicomNetError('CLOSED', 'The association is not open'));
      const cmd = Object.assign({}, command, { CommandDataSetType: dataset ? 0x0000 : NO_DATASET });
      const cmdBytes = encodeCommand(cmd);
      const max = Math.max(1, Math.min(this.peerMaxPdu ? this.peerMaxPdu - 6 : MAX_SEND_FRAGMENT, MAX_SEND_FRAGMENT));
      const pdus = [];
      const frag = (bytes, isCmd) => {
        if (!bytes.length) { pdus.push(this._pdv(pcid, bytes, isCmd, true)); return; }
        for (let at = 0; at < bytes.length; at += max) {
          const part = bytes.subarray(at, Math.min(bytes.length, at + max));
          pdus.push(this._pdv(pcid, part, isCmd, at + max >= bytes.length));
        }
      };
      frag(cmdBytes, true);
      if (dataset) frag(toU8(dataset), false);
      // one write chain entry for the whole message so nothing interleaves
      const p = this._writeChain.then(async () => { for (const x of pdus) { await this.transport.write(x); this._touch(); } });
      this._writeChain = p.catch(() => {});
      return p;
    }
    _pdv(pcid, data, isCmd, last) {
      const head = new Uint8Array(12);
      head[0] = 0x04;
      head.set(u32be(6 + data.length), 2);
      head.set(u32be(2 + data.length), 6);
      head[10] = pcid; head[11] = (isCmd ? 1 : 0) | (last ? 2 : 0);
      return concat([head, data]);
    }
    /** Sends a request; onResponse(msg, messageId) returns true on the final response. Resolves with that response. */
    request(pcid, command, dataset, onResponse) {
      const id = this._nextId;
      this._nextId = (this._nextId % 0xffff) + 1;
      return new Promise((resolve, reject) => {
        const p = {
          timer: null,
          arm: () => {
            clearTimeout(p.timer);
            if (this.dimseTimeout > 0) p.timer = setTimeout(() => {
              this._pending.delete(id);
              reject(new DicomNetError('TIMEOUT', `No DIMSE response from ${this.peerName} within ${this.dimseTimeout / 1000} s`));
            }, this.dimseTimeout);
          },
          onResponse: (msg) => {
            let done = true;
            try { done = onResponse ? onResponse(msg, id) : true; } catch (e) { done = true; p.finish(); reject(e); return; }
            if (done) { p.finish(); resolve(msg); }
          },
          reject: (e) => { p.finish(); reject(e); },
          finish: () => { clearTimeout(p.timer); this._pending.delete(id); },
        };
        this._pending.set(id, p);
        p.arm();
        this.send(pcid, Object.assign({}, command, { MessageID: id }), dataset).catch((e) => p.reject(e));
      });
    }
    cancel(pcid, messageId) {
      return this.send(pcid, { CommandField: CMD.C_CANCEL_RQ, MessageIDBeingRespondedTo: messageId }).catch(() => {});
    }

    async release() {
      if (this.state !== 'established') return;
      this.state = 'releasing';
      let timer;
      const got = new Promise((res) => {
        this._releaseWaiter = res;
        timer = setTimeout(res, this.timeout || 10000);
        this.closed.then(res);
      });
      try { await this._write(pdu(0x05, new Uint8Array(4))); await got; } catch { /* closing anyway */ }
      clearTimeout(timer);
      await this._closeTransport();
    }
    async abort(source, reason) {
      if (this.state === 'closed') return;
      this._fail(new DicomNetError('ABORTED', 'Association aborted (local)'));
      try { await this._write(pdu(0x07, new Uint8Array([0, 0, source || 0, reason || 0]))); } catch { /* ignore */ }
      await this._closeTransport();
    }
    async _onReleaseRq() {
      try { await this._idle(); this.state = 'releasing'; await this._write(pdu(0x06, new Uint8Array(4))); } catch { /* ignore */ }
      await this._closeTransport();
    }
    async _idle() { if (this._busy) await this._busy; }
    async _closeTransport() {
      try { await this.transport.close(); } catch { /* ignore */ }
      this._transportClosed();
    }
    _fail(err) {
      if (!this.error) this.error = err;
      for (const p of [...this._pending.values()]) p.reject(this.error);
    }
    _transportClosed() {
      if (this.state === 'closed') return;
      const was = this.state;
      this.state = 'closed';
      const err = this.error || new DicomNetError('CLOSED', `Connection to ${this.peerName} closed` + (was === 'requesting' ? ' before the association was accepted' : ''));
      if (this._phase) this._phase(-1, err);
      this._fail(err);
      this._resolveClosed();
    }
  }

  // ARTIM-style wait for the next association-phase PDU
  function nextPdu(a, ms, what) {
    if (a._early.length) return Promise.resolve(a._early.shift());
    if (a.state === 'closed') return Promise.reject(a.error || new DicomNetError('CLOSED', 'Connection closed'));
    return new Promise((resolve, reject) => {
      const timer = ms > 0 ? setTimeout(() => { a._phase = null; reject(new DicomNetError('TIMEOUT', `No ${what} within ${ms / 1000} s`)); }, ms) : null;
      a._phase = (type, body) => {
        clearTimeout(timer); a._phase = null;
        if (type === -1) reject(body); else resolve({ type, body });
      };
    });
  }

  /** Requests an association. contexts: [{ abstractSyntax, transferSyntaxes, scpRole?, scuRole? }]. */
  async function associate(transport, opts) {
    opts = opts || {};
    const a = new Association(transport, opts, 'requestor');
    a.callingAE = trimAE(opts.callingAE || 'MYDCMVIEWER');
    a.calledAE = trimAE(opts.calledAE || 'ANY-SCP');
    const proposed = (opts.contexts || []).map((c, i) => ({ id: i * 2 + 1, abstractSyntax: c.abstractSyntax,
      transferSyntaxes: c.transferSyntaxes && c.transferSyntaxes.length ? c.transferSyntaxes : UNCOMPRESSED_TS, scpRole: !!c.scpRole }));
    if (!proposed.length) throw new DicomNetError('INVALID', 'No presentation contexts to propose');
    if (proposed.length > 128) throw new DicomNetError('INVALID', `Too many presentation contexts (${proposed.length}, max 128)`);
    const roles = [];
    for (const c of proposed) if (c.scpRole && !roles.some((r) => r.uid === c.abstractSyntax)) roles.push({ uid: c.abstractSyntax, scu: false, scp: true });
    const items = [item(0x10, ascii(APP_CONTEXT))];
    for (const c of proposed) {
      items.push(item(0x20, [new Uint8Array([c.id, 0, 0, 0]), item(0x30, ascii(c.abstractSyntax)), ...c.transferSyntaxes.map((t) => item(0x40, ascii(t)))]));
    }
    items.push(userInfo(a.maxPdu, roles));
    const rq = associateHeader(0x01, a.calledAE, a.callingAE, items);
    a.state = 'requesting';
    const answer = nextPdu(a, a.timeout, `A-ASSOCIATE response from ${a.calledAE}`);
    let res;
    try {
      await a._write(rq);
      res = await answer;
    } catch (e) {
      a._fail(e); await a._closeTransport();
      throw e;
    }
    const { type, body } = res;
    if (type === 0x03) {
      const result = body[1], source = body[2], reason = body[3];
      const why = (REJECT_REASON[source] || {})[reason] || `reason ${reason}`;
      const err = new DicomNetError('REJECTED', `Association rejected ${REJECT_RESULT[result] || ''} by ${REJECT_SOURCE[source] || 'the peer'} ` +
        `(${a.calledAE}): ${why}`.replace(/  +/g, ' '), { result, source, reason, transient: result === 2 });
      a._fail(err); await a._closeTransport();
      throw err;
    }
    if (type === 0x07) {
      const err = new DicomNetError('ABORTED', `Association aborted by ${a.calledAE} during negotiation (${ABORT_REASON[body[3]] || 'reason ' + body[3]})`, { source: body[2], reason: body[3] });
      a._fail(err); await a._closeTransport();
      throw err;
    }
    if (type !== 0x02) {
      const err = new DicomNetError('PROTOCOL', `Unexpected PDU type 0x${type.toString(16)} while waiting for A-ASSOCIATE-AC`);
      a._fail(err); await a.abort(2, 2);
      throw err;
    }
    const ac = parseAssociate(body);
    a.peerMaxPdu = ac.maxPdu;
    a.peer = { implementationClassUID: ac.implementationClassUID, implementationVersionName: ac.implementationVersionName, maxPdu: ac.maxPdu };
    a.roles = ac.roles;
    a.contexts = proposed.map((c) => {
      const r = ac.contexts.find((x) => x.id === c.id);
      const result = r ? r.result : 2;
      return { id: c.id, abstractSyntax: c.abstractSyntax, transferSyntax: r && r.result === 0 ? r.transferSyntaxes[0] : '',
        accepted: !!r && r.result === 0, result, resultText: PC_RESULT[result] || 'unknown', proposed: c.transferSyntaxes };
    });
    a.state = 'established';
    if (!a.contexts.some((c) => c.accepted)) {
      await a.release();
      const err = new DicomNetError('NO_CONTEXT', `${a.calledAE} accepted none of the proposed presentation contexts (` +
        [...new Set(a.contexts.map((c) => `${sopName(c.abstractSyntax)}: ${c.resultText}`))].slice(0, 4).join('; ') + ')', { contexts: a.contexts });
      throw err;
    }
    return a;
  }

  /* ── SCU operations ── */
  function normLevel(level) {
    const l = String(level || 'STUDY').toUpperCase();
    const v = l === 'INSTANCE' ? 'IMAGE' : l;
    if (!LEVELS.includes(v)) throw new DicomNetError('INVALID', `Unknown query level "${level}"`);
    return v;
  }
  const normRoot = (r) => (String(r || 'study').toLowerCase().startsWith('p') ? 'patient' : 'study');
  function needContext(a, sop, what) {
    const c = a.contextFor(sop);
    if (!c) {
      const pc = a.contexts.find((x) => x.abstractSyntax === sop);
      throw new DicomNetError('NO_CONTEXT', `${a.peerName} does not support ${what} (${sopName(sop)}` + (pc ? `: ${pc.resultText})` : ' was not proposed)'));
    }
    return c;
  }
  // { level, root, query } | identifier with QueryRetrieveLevel → { level, root, identifier }
  function normQuery(q, extraRoot) {
    q = q || {};
    const wrapped = q.query && typeof q.query === 'object';
    const identifier = Object.assign({}, wrapped ? q.query : q);
    delete identifier.level; delete identifier.root;
    const level = normLevel((wrapped || q.level ? q.level : null) || identifier.QueryRetrieveLevel);
    const root = normRoot(q.root || extraRoot);
    if (root === 'study' && level === 'PATIENT') throw new DicomNetError('INVALID', 'Study Root does not have a PATIENT level — use root: "patient"');
    identifier.QueryRetrieveLevel = level;
    return { level, root, identifier };
  }
  const explicitCtx = (ctx) => ctx.transferSyntax !== TS.IMPLICIT_LE;

  async function echo(a) {
    const ctx = needContext(a, SOP.VERIFICATION, 'C-ECHO');
    const rsp = await a.request(ctx.id, { CommandField: CMD.C_ECHO_RQ, AffectedSOPClassUID: SOP.VERIFICATION });
    return statusResult(rsp.command.Status, { errorComment: rsp.command.ErrorComment || '' });
  }

  function withSignal(a, ctx, signal, getId) {
    if (!signal) return () => {};
    const onAbort = () => { const id = getId(); if (id) a.cancel(ctx.id, id); };
    if (signal.aborted) queueMicrotask(onAbort); else signal.addEventListener('abort', onAbort, { once: true });
    return () => signal.removeEventListener('abort', onAbort);
  }

  async function find(a, opts) {
    opts = opts || {};
    const { level, root, identifier } = normQuery(opts);
    const sop = QR[root].find;
    const ctx = needContext(a, sop, 'C-FIND');
    const query = {};
    if (opts.defaults !== false) for (const k of DEFAULT_KEYS[level]) if (!(root === 'patient' && level === 'PATIENT' && k === 'StudyInstanceUID')) query[k] = '';
    if (!(LEVEL_KEY[level] in identifier)) query[LEVEL_KEY[level]] = '';
    Object.assign(query, identifier);
    const explicit = explicitCtx(ctx);
    const ds = encodeDataset(query, { explicit });
    const results = [];
    let msgId = 0, cancelled = false;
    const unhook = withSignal(a, ctx, opts.signal, () => msgId);
    try {
      const final = await a.request(ctx.id, { CommandField: CMD.C_FIND_RQ, AffectedSOPClassUID: sop, Priority: 0 }, ds, (msg, id) => {
        msgId = id;
        const st = msg.command.Status;
        if (statusCategory(st) !== 'pending') return true;
        if (msg.dataset && !(opts.limit && results.length >= opts.limit)) {
          const r = decodeDataset(msg.dataset, { explicit });
          results.push(r);
          if (opts.onResult) opts.onResult(r);
          if (opts.limit && results.length >= opts.limit && !cancelled) { cancelled = true; a.cancel(ctx.id, id); }
        }
        return false;
      });
      const status = statusResult(final.command.Status, { errorComment: final.command.ErrorComment || '' });
      Object.defineProperty(results, 'status', { value: status, enumerable: false });
      if (status.category === 'failure') {
        throw new DicomNetError('STATUS', `C-FIND failed: ${status.text} (${status.hex})${status.errorComment ? ' — ' + status.errorComment : ''}`, { status, results });
      }
      return results;
    } finally { unhook(); }
  }

  function retrieveResult(final, received, failedUids) {
    const c = final.command;
    let failed = [];
    if (final.dataset) {
      try {
        const v = decodeDataset(final.dataset, { explicit: explicitCtx(final.context || { transferSyntax: TS.EXPLICIT_LE }) }).FailedSOPInstanceUIDList;
        if (v) failed = String(v).split('\\').filter(Boolean);
      } catch { /* optional */ }
    }
    return statusResult(c.Status, {
      errorComment: c.ErrorComment || '',
      completed: c.NumberOfCompletedSuboperations || 0, failed: c.NumberOfFailedSuboperations || 0,
      warning: c.NumberOfWarningSuboperations || 0, remaining: c.NumberOfRemainingSuboperations || 0,
      received, failedSOPInstanceUIDs: failed.concat(failedUids || []),
    });
  }
  function progressOf(msg) {
    const c = msg.command;
    return { remaining: c.NumberOfRemainingSuboperations || 0, completed: c.NumberOfCompletedSuboperations || 0,
      failed: c.NumberOfFailedSuboperations || 0, warning: c.NumberOfWarningSuboperations || 0, status: c.Status };
  }

  async function get(a, q, opts) {
    opts = opts || {};
    const { level, root, identifier } = normQuery(q, opts.root);
    const sop = QR[root].get;
    const ctx = needContext(a, sop, 'C-GET');
    const inflight = [];
    let received = 0;
    const prev = a.onRequest;
    a.onRequest = (m) => {
      const job = (async () => {
        const cmd = m.command;
        if (cmd.CommandField !== CMD.C_STORE_RQ) {
          await a.send(m.pcid, { CommandField: cmd.CommandField | 0x8000, MessageIDBeingRespondedTo: cmd.MessageID, Status: 0x0211 });
          return;
        }
        let status = 0, comment;
        const info = { sopClassUid: cleanUid(cmd.AffectedSOPClassUID), sopInstanceUid: cleanUid(cmd.AffectedSOPInstanceUID),
          transferSyntax: m.context ? m.context.transferSyntax : '', callingAE: a.calledAE, association: a };
        try {
          const part10 = toPart10(m.dataset || EMPTY, { transferSyntax: info.transferSyntax, sopClassUid: info.sopClassUid, sopInstanceUid: info.sopInstanceUid, sourceAE: a.calledAE });
          received++;
          const r = storeStatus(opts.onInstance ? await opts.onInstance(part10, info) : undefined);
          status = r.status; comment = r.errorComment;
        } catch (e) { status = 0xA700; comment = String(e && e.message || e).slice(0, 64); }
        await a.send(m.pcid, { CommandField: CMD.C_STORE_RSP, MessageIDBeingRespondedTo: cmd.MessageID, AffectedSOPClassUID: info.sopClassUid,
          AffectedSOPInstanceUID: info.sopInstanceUid, Status: status, ErrorComment: comment });
      })();
      inflight.push(job);
      return job;
    };
    let msgId = 0;
    const unhook = withSignal(a, ctx, opts.signal, () => msgId);
    try {
      const final = await a.request(ctx.id, { CommandField: CMD.C_GET_RQ, AffectedSOPClassUID: sop, Priority: 0 },
        encodeDataset(identifier, { explicit: explicitCtx(ctx) }), (msg, id) => {
          msgId = id;
          if (statusCategory(msg.command.Status) === 'pending') { if (opts.onProgress) opts.onProgress(progressOf(msg)); return false; }
          return true;
        });
      await Promise.allSettled(inflight);
      const res = retrieveResult(final, received);
      if (res.category === 'failure') throw new DicomNetError('STATUS', `C-GET failed: ${res.text} (${res.hex})${res.errorComment ? ' — ' + res.errorComment : ''}`, { status: res });
      return res;
    } finally { unhook(); a.onRequest = prev; }
  }

  async function move(a, q, destinationAE, opts) {
    opts = opts || {};
    const { root, identifier } = normQuery(q, opts.root);
    const sop = QR[root].move;
    const ctx = needContext(a, sop, 'C-MOVE');
    let msgId = 0;
    const unhook = withSignal(a, ctx, opts.signal, () => msgId);
    try {
      const final = await a.request(ctx.id, { CommandField: CMD.C_MOVE_RQ, AffectedSOPClassUID: sop, Priority: 0, MoveDestination: trimAE(destinationAE) },
        encodeDataset(identifier, { explicit: explicitCtx(ctx) }), (msg, id) => {
          msgId = id;
          if (statusCategory(msg.command.Status) === 'pending') { if (opts.onProgress) opts.onProgress(progressOf(msg)); return false; }
          return true;
        });
      const res = retrieveResult(final, 0);
      if (res.category === 'failure') throw new DicomNetError('STATUS', `C-MOVE failed: ${res.text} (${res.hex})${res.errorComment ? ' — ' + res.errorComment : ''}`, { status: res });
      return res;
    } finally { unhook(); }
  }

  /** C-STORE one Part 10 file (or a parsePart10 result). */
  async function store(a, file, opts) {
    opts = opts || {};
    const f = file && file.dataset && file.transferSyntax ? file : parsePart10(file);
    if (!f.sopClassUid || !f.sopInstanceUid) throw new DicomNetError('INVALID', 'The file has no SOP Class / SOP Instance UID');
    let ctx = a.contextFor(f.sopClassUid, f.transferSyntax), data = f.dataset;
    if (!ctx && f.transferSyntax === TS.EXPLICIT_LE && (ctx = a.contextFor(f.sopClassUid, TS.IMPLICIT_LE))) data = explicitToImplicit(data);
    // Compressed / big endian / deflated file, but the peer only takes uncompressed data: transcode it.
    if (!ctx && opts.transcode && f.transferSyntax !== TS.EXPLICIT_LE && f.transferSyntax !== TS.IMPLICIT_LE) {
      const ex = a.contextFor(f.sopClassUid, TS.EXPLICIT_LE), im = !ex && a.contextFor(f.sopClassUid, TS.IMPLICIT_LE);
      if (ex || im) {
        const src = file && file.dataset && file.transferSyntax ? toPart10(f.dataset, { transferSyntax: f.transferSyntax, sopClassUid: f.sopClassUid, sopInstanceUid: f.sopInstanceUid }) : toU8(file);
        const g = parsePart10(await opts.transcode(src));
        if (g.transferSyntax === TS.EXPLICIT_LE) { ctx = ex || im; data = ex ? g.dataset : explicitToImplicit(g.dataset); }
      }
    }
    if (!ctx) {
      throw new DicomNetError('NO_CONTEXT', `${a.peerName} accepted no presentation context for ${sopName(f.sopClassUid)} in ${tsName(f.transferSyntax)}`,
        { sopInstanceUid: f.sopInstanceUid });
    }
    const rsp = await a.request(ctx.id, { CommandField: CMD.C_STORE_RQ, AffectedSOPClassUID: f.sopClassUid, AffectedSOPInstanceUID: f.sopInstanceUid,
      Priority: 0, MoveOriginatorApplicationEntityTitle: opts.moveOriginatorAE ? trimAE(opts.moveOriginatorAE) : undefined,
      MoveOriginatorMessageID: opts.moveOriginatorMessageId }, data);
    return statusResult(rsp.command.Status, { errorComment: rsp.command.ErrorComment || '', sopInstanceUid: f.sopInstanceUid, sopClassUid: f.sopClassUid });
  }

  /* ── Presentation context sets ── */
  const verificationContexts = () => [{ abstractSyntax: SOP.VERIFICATION, transferSyntaxes: UNCOMPRESSED_TS }];
  const findContexts = (root) => [{ abstractSyntax: QR[normRoot(root)].find, transferSyntaxes: UNCOMPRESSED_TS }];
  const moveContexts = (root) => [{ abstractSyntax: QR[normRoot(root)].move, transferSyntaxes: UNCOMPRESSED_TS }];
  /** C-GET: the Q/R GET class + storage classes with the SCP role. Every class gets [Explicit, Implicit]; common ones also
   *  get an Implicit-only and a compressed context so the PACS can send files as stored (max 128 contexts in all). */
  function getContexts(root, opts) {
    opts = opts || {};
    const classes = opts.sopClasses ? opts.sopClasses.map((uid) => ({ uid, common: true })) : STORAGE_SOP_CLASSES;
    const out = [{ abstractSyntax: QR[normRoot(root)].get, transferSyntaxes: UNCOMPRESSED_TS }];
    for (const s of classes) out.push({ abstractSyntax: s.uid, transferSyntaxes: opts.transferSyntaxes || UNCOMPRESSED_TS, scpRole: true });
    if (!opts.transferSyntaxes) {
      for (const s of classes) {
        if (!s.common) continue;
        const image = s.common !== 2 && opts.compressed !== false;
        if (out.length + (image ? 2 : 1) > 128) break;
        out.push({ abstractSyntax: s.uid, transferSyntaxes: [TS.IMPLICIT_LE], scpRole: true });
        if (image) out.push({ abstractSyntax: s.uid, transferSyntaxes: COMPRESSED_TS, scpRole: true });
      }
    }
    return out.slice(0, 128);
  }
  /** C-STORE: one context per (SOP class, transfer syntax) found in the files; Explicit LE also offers Implicit LE. */
  function storeContexts(files, opts) {
    const seen = new Set(), out = [];
    const plain = opts && opts.uncompressedFallback ? new Set() : null;   // SOP classes that also get an uncompressed context
    for (const file of files) {
      const f = file && file.dataset && file.transferSyntax ? file : parsePart10(file);
      const key = f.sopClassUid + '|' + f.transferSyntax;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ abstractSyntax: f.sopClassUid, transferSyntaxes: f.transferSyntax === TS.EXPLICIT_LE ? [TS.EXPLICIT_LE, TS.IMPLICIT_LE] : [f.transferSyntax] });
      if (plain && f.transferSyntax !== TS.EXPLICIT_LE && f.transferSyntax !== TS.IMPLICIT_LE) plain.add(f.sopClassUid);
    }
    if (plain) for (const uid of plain) if (!seen.has(uid + '|' + TS.EXPLICIT_LE)) out.push({ abstractSyntax: uid, transferSyntaxes: [TS.EXPLICIT_LE, TS.IMPLICIT_LE] });
    return out.slice(0, 128);
  }

  /** One association per call; connect() opens a fresh transport. */
  class Client {
    constructor(opts) { this.opts = Object.assign({ callingAE: 'MYDCMVIEWER', calledAE: 'ANY-SCP' }, opts || {}); }
    async _with(contexts, fn) {
      const transport = await this.opts.connect();
      const a = await associate(transport, Object.assign({}, this.opts, { contexts }));
      try {
        const r = await fn(a);
        await a.release();
        return r;
      } catch (e) {
        if (e && (e.code === 'STATUS' || e.code === 'NO_CONTEXT') && a.state === 'established') await a.release(); else await a.abort();
        throw e;
      }
    }
    echo() { return this._with(verificationContexts(), echo); }
    find(opts) { return this._with(findContexts(opts && opts.root), (a) => find(a, opts)); }
    get(q, opts) { return this._with(getContexts((q && q.root) || (opts && opts.root), opts), (a) => get(a, q, opts)); }
    move(q, dest, opts) { return this._with(moveContexts((q && q.root) || (opts && opts.root)), (a) => move(a, q, dest, opts)); }
    async store(files, opts) {
      opts = opts || {};
      const parsed = files.map((f) => (f && f.dataset && f.transferSyntax ? f : parsePart10(f)));
      return this._with(storeContexts(parsed, { uncompressedFallback: !!opts.transcode }), async (a) => {
        const out = [];
        for (let i = 0; i < parsed.length; i++) {
          let r;
          try { r = await store(a, parsed[i], { transcode: opts.transcode }); } catch (e) {
            if (e.code !== 'NO_CONTEXT') throw e;
            r = statusResult(0x0122, { errorComment: e.message, sopInstanceUid: parsed[i].sopInstanceUid });
          }
          out.push(r);
          if (opts.onProgress) opts.onProgress({ done: i + 1, total: parsed.length, result: r });
        }
        return out;
      });
    }
  }

  /* ── SCP ── */
  const QR_TS = UNCOMPRESSED_TS;
  // C-STORE handler result → status. Numbers 1..0xFF are no C-STORE status (e.g. what Array#push returns): success.
  function storeStatus(r) {
    if (typeof r === 'number') return { status: r > 0 && r < 0x100 ? 0 : r };
    if (r && typeof r.status === 'number') return r;
    return { status: 0 };
  }
  function handlerStatus(r, fallback) {
    if (typeof r === 'number') return { status: r };
    if (r && typeof r.status === 'number') return r;
    return { status: fallback };
  }
  // request identifier → query object (keywords, or GGGGEEEE for unknown tags) + requested keys
  function queryFromIdentifier(id) {
    const query = {}, keys = [];
    for (const [hex, el] of Object.entries(id.tags)) {
      const d = DICT_BY_TAG[parseInt(hex, 16) >>> 0];
      const key = d ? d.keyword : hex;
      query[key] = el.value == null ? '' : el.value;
      keys.push({ key, hex, vr: el.vr });
    }
    return { query, keys };
  }
  function shapeResponse(match, keys, level, aeTitle) {
    const out = {};
    const pick = (k, hex) => (match[k] != null ? match[k] : match[hex] != null ? match[hex] : match.tags && match.tags[hex] ? match.tags[hex].value : undefined);
    for (const { key, hex, vr } of keys) {
      if (key === 'SpecificCharacterSet') continue;
      let v = pick(key, hex);
      if (key === 'QueryRetrieveLevel') v = level;
      if (key === 'RetrieveAETitle' && (v == null || v === '')) v = aeTitle;
      if (vr === 'SQ') v = Array.isArray(v) ? v : [];
      out[DICT[key] ? key : hex] = DICT[key] ? (v == null ? '' : v) : { vr: vr === 'UN' ? 'LO' : vr, value: v == null ? '' : v };
    }
    if (!('QueryRetrieveLevel' in out)) out.QueryRetrieveLevel = level;
    if (match.SpecificCharacterSet) out.SpecificCharacterSet = match.SpecificCharacterSet;
    return out;
  }

  /** Serves one incoming association (Verification, Storage, Query/Retrieve SCP). Returns the Association at once. */
  function serve(transport, opts) {
    opts = Object.assign({ aeTitle: 'MYDCMVIEWER', acceptAll: true }, opts || {});
    const a = new Association(transport, opts, 'acceptor');
    const aeTitle = trimAE(opts.aeTitle);
    const cancelled = new Set();
    a.onCancel = (id) => cancelled.add(id);
    let queue = Promise.resolve();
    a.onRequest = (m) => {
      const job = queue.then(() => handle(m)).catch((e) => { if (opts.onError) opts.onError(e); });
      queue = job;
      a._busy = job;
      return job;
    };
    a.ready = (async () => {
      a.state = 'requesting';
      const { type, body } = await nextPdu(a, a.timeout, 'A-ASSOCIATE-RQ');
      if (type !== 0x01) { await a.abort(2, 2); throw new DicomNetError('PROTOCOL', `Expected A-ASSOCIATE-RQ, got PDU type 0x${type.toString(16)}`); }
      const rq = parseAssociate(body);
      a.callingAE = rq.callingAE; a.calledAE = rq.calledAE;
      a.peerMaxPdu = rq.maxPdu;
      a.peer = { implementationClassUID: rq.implementationClassUID, implementationVersionName: rq.implementationVersionName, maxPdu: rq.maxPdu };
      a.roles = rq.roles;
      const reject = async (result, source, reason) => {
        await a._write(pdu(0x03, new Uint8Array([0, result, source, reason]))).catch(() => {});
        a.error = new DicomNetError('REJECTED', `Rejected association from ${rq.callingAE} (${(REJECT_REASON[source] || {})[reason] || 'reason ' + reason})`);
        await a._closeTransport();
        throw a.error;
      };
      if (rq.appContext && rq.appContext !== APP_CONTEXT) await reject(1, 1, 2);
      if (!opts.anyCalledAE && aeTitle && rq.calledAE !== aeTitle) await reject(1, 1, 7);
      if (opts.onAssociate) {
        const ok = await opts.onAssociate({ callingAE: rq.callingAE, calledAE: rq.calledAE, peer: a.peer, contexts: rq.contexts, association: a });
        if (ok === false) await reject(1, 1, 3);
        if (ok && typeof ok === 'object' && ok.reject) await reject(ok.result || 1, ok.source || 1, ok.reason || 1);
      }
      // presentation contexts
      const taken = {};
      a.contexts = rq.contexts.map((pc) => {
        const abs = pc.abstractSyntax, qr = QR_ROLE[abs];
        let supported = null;
        if (abs === SOP.VERIFICATION) supported = QR_TS;
        else if (qr) supported = (qr.op === 'find' ? opts.onFind : qr.op === 'get' ? opts.onGet : (opts.onMove || opts.onGet)) ? QR_TS : null;
        else if ((opts.onStore || opts.onGet) && (STORAGE_UIDS.has(abs) || opts.acceptAll)) supported = 'any';
        let result = 0, ts = '';
        if (!supported) result = 3;
        else {
          const cands = pc.transferSyntaxes.filter((t) => (supported === 'any' ? !!t : supported.includes(t)));
          if (!cands.length) result = 4;
          else {
            const prefer = (opts.preferredTransferSyntaxes && opts.preferredTransferSyntaxes(abs)) || [];
            const used = taken[abs] || (taken[abs] = new Set());
            ts = cands.find((t) => prefer.includes(t) && !used.has(t)) || cands.find((t) => !used.has(t)) || cands[0];
            used.add(ts);
          }
        }
        return { id: pc.id, abstractSyntax: abs, transferSyntax: ts, accepted: result === 0, result, resultText: PC_RESULT[result], proposed: pc.transferSyntaxes };
      });
      const items = [item(0x10, ascii(APP_CONTEXT))];
      for (const c of a.contexts) {
        items.push(item(0x21, [new Uint8Array([c.id, 0, c.result, 0]), item(0x40, ascii(c.transferSyntax || c.proposed[0] || TS.IMPLICIT_LE))]));
      }
      items.push(userInfo(a.maxPdu, rq.roles.map((r) => ({ uid: r.uid, scu: r.scu, scp: r.scp }))));
      await a._write(associateHeader(0x02, rq.calledAE || aeTitle, rq.callingAE, items));
      a.state = 'established';
      return a;
    })();
    a.ready.catch((e) => { if (opts.onError) opts.onError(e); a._closeTransport(); });

    const respond = (m, field, extra, dataset) => a.send(m.pcid, Object.assign({ CommandField: field, MessageIDBeingRespondedTo: m.command.MessageID,
      AffectedSOPClassUID: m.command.AffectedSOPClassUID }, extra), dataset);
    const infoOf = (m, extra) => Object.assign({ association: a, callingAE: a.callingAE, calledAE: a.calledAE, context: m.context,
      messageId: m.command.MessageID, command: m.command, isCancelled: () => cancelled.has(m.command.MessageID) }, extra);

    async function handle(m) {
      const cmd = m.command, ctx = m.context;
      switch (cmd.CommandField) {
        case CMD.C_ECHO_RQ: {
          const r = handlerStatus(opts.onEcho ? await opts.onEcho(infoOf(m)) : 0, 0);
          return respond(m, CMD.C_ECHO_RSP, { Status: r.status, ErrorComment: r.errorComment });
        }
        case CMD.C_STORE_RQ: {
          const info = infoOf(m, { sopClassUid: cleanUid(cmd.AffectedSOPClassUID), sopInstanceUid: cleanUid(cmd.AffectedSOPInstanceUID),
            transferSyntax: ctx ? ctx.transferSyntax : '', moveOriginatorAE: trimAE(cmd.MoveOriginatorApplicationEntityTitle), moveOriginatorMessageId: cmd.MoveOriginatorMessageID });
          let r;
          if (!opts.onStore) r = { status: 0x0122 };
          else {
            try {
              const part10 = toPart10(m.dataset || EMPTY, { transferSyntax: info.transferSyntax, sopClassUid: info.sopClassUid, sopInstanceUid: info.sopInstanceUid, sourceAE: a.callingAE });
              r = storeStatus(await opts.onStore(part10, info));
            } catch (e) { r = { status: 0xA700, errorComment: String(e && e.message || e).slice(0, 64) }; }
          }
          return respond(m, CMD.C_STORE_RSP, { AffectedSOPInstanceUID: cmd.AffectedSOPInstanceUID, Status: r.status, ErrorComment: r.errorComment });
        }
        case CMD.C_FIND_RQ: return handleFind(m);
        case CMD.C_GET_RQ: case CMD.C_MOVE_RQ: return handleRetrieve(m);
        default:
          return respond(m, cmd.CommandField | 0x8000, { Status: 0x0211 });
      }
    }
    function readIdentifier(m) {
      const id = decodeDataset(m.dataset || EMPTY, { explicit: explicitCtx(m.context) });
      const { query, keys } = queryFromIdentifier(id);
      const level = normLevel(id.QueryRetrieveLevel || 'STUDY');
      return { query, keys, level, root: (QR_ROLE[m.context.abstractSyntax] || {}).root || 'study' };
    }
    async function handleFind(m) {
      let q;
      try { q = readIdentifier(m); } catch (e) { return respond(m, CMD.C_FIND_RSP, { Status: 0xA900, ErrorComment: String(e.message).slice(0, 64) }); }
      const explicit = explicitCtx(m.context);
      try {
        const matches = await opts.onFind(q.query, q.level, infoOf(m, { root: q.root, keys: q.keys }));
        for await (const match of matches || []) {
          if (cancelled.has(m.command.MessageID)) break;
          const ds = encodeDataset(shapeResponse(match, q.keys, q.level, aeTitle), { explicit });
          await respond(m, CMD.C_FIND_RSP, { Status: 0xFF00 }, ds);
        }
      } catch (e) {
        return respond(m, CMD.C_FIND_RSP, { Status: 0xC000, ErrorComment: String(e && e.message || e).slice(0, 64) });
      }
      const was = cancelled.delete(m.command.MessageID);
      return respond(m, CMD.C_FIND_RSP, { Status: was ? 0xFE00 : 0 });
    }
    async function handleRetrieve(m) {
      const isMove = m.command.CommandField === CMD.C_MOVE_RQ;
      const RSP = isMove ? CMD.C_MOVE_RSP : CMD.C_GET_RSP;
      const id = m.command.MessageID;
      let q;
      try { q = readIdentifier(m); } catch (e) { return respond(m, RSP, { Status: 0xA900, ErrorComment: String(e.message).slice(0, 64) }); }
      const dest = trimAE(m.command.MoveDestination);
      let target = null, sub = null;
      let instances;
      try {
        if (isMove) {
          target = opts.moveDestination ? await opts.moveDestination(dest) : null;
          if (!target) return respond(m, RSP, { Status: 0xA801, ErrorComment: `Unknown destination ${dest}`.slice(0, 64) });
        }
        const info = infoOf(m, { root: q.root, keys: q.keys, destinationAE: dest });
        instances = isMove && opts.onMove ? await opts.onMove(q.query, q.level, dest, info) : await opts.onGet(q.query, q.level, info);
        instances = (instances || []).map((x) => (x && x.dataset && x.transferSyntax ? x : parsePart10(x && x.bytes ? x.bytes : x)));
      } catch (e) {
        return respond(m, RSP, { Status: 0xC000, ErrorComment: String(e && e.message || e).slice(0, 64) });
      }
      const counts = { completed: 0, failed: 0, warning: 0 };
      const failedUids = [];
      try {
        if (isMove && instances.length) {
          const transport = await target.connect();
          sub = await associate(transport, { callingAE: aeTitle, calledAE: target.aeTitle || dest, maxPdu: target.maxPdu || opts.maxPdu,
            timeout: opts.timeout, dimseTimeout: opts.dimseTimeout, contexts: storeContexts(instances, { uncompressedFallback: !!opts.transcode }) });
        }
      } catch (e) {
        return respond(m, RSP, { Status: 0xA702, ErrorComment: `Cannot reach ${dest}: ${e.message}`.slice(0, 64), NumberOfFailedSuboperations: instances.length });
      }
      let stopped = false;
      for (let i = 0; i < instances.length; i++) {
        if (cancelled.has(id) || a.state !== 'established') { stopped = true; break; }
        const f = instances[i];
        let r;
        try {
          r = await store(isMove ? sub : a, f, isMove ? { moveOriginatorAE: a.callingAE, moveOriginatorMessageId: id, transcode: opts.transcode } : { transcode: opts.transcode });
        } catch (e) {
          if (e.code !== 'NO_CONTEXT') { if (a.state !== 'established') { stopped = true; break; } }
          r = { category: 'failure' };
        }
        if (r.category === 'success') counts.completed++;
        else if (r.category === 'warning') counts.warning++;
        else { counts.failed++; failedUids.push(f.sopInstanceUid); }
        if (i < instances.length - 1) {
          await respond(m, RSP, { Status: 0xFF00, NumberOfRemainingSuboperations: instances.length - i - 1, NumberOfCompletedSuboperations: counts.completed,
            NumberOfFailedSuboperations: counts.failed, NumberOfWarningSuboperations: counts.warning }).catch(() => {});
        }
      }
      if (sub) await sub.release().catch(() => {});
      cancelled.delete(id);
      if (a.state !== 'established') return;
      let status = 0;
      if (stopped) status = 0xFE00;
      else if (counts.failed && !counts.completed && !counts.warning) status = 0xA702;
      else if (counts.failed || counts.warning) status = 0xB000;
      const remaining = stopped ? instances.length - counts.completed - counts.failed - counts.warning : undefined;
      const ds = failedUids.length ? encodeDataset({ FailedSOPInstanceUIDList: failedUids }, { explicit: explicitCtx(m.context) }) : undefined;
      return respond(m, RSP, { Status: status, NumberOfRemainingSuboperations: remaining, NumberOfCompletedSuboperations: counts.completed,
        NumberOfFailedSuboperations: counts.failed, NumberOfWarningSuboperations: counts.warning }, ds);
    }
    return a;
  }

  /* ── Matching (PS3.4 C.2.2.2) ── */
  const isUniversal = (q) => q == null || (typeof q === 'string' && (q.trim() === '' || q.trim() === '*')) || (Array.isArray(q) && !q.length);
  function matchOne(alt, v, vr) {
    if ((vr === 'DA' || vr === 'TM' || vr === 'DT') && alt.includes('-')) {
      const norm = (s) => s.replace(/[.:]/g, '').trim();
      const [lo, hi] = alt.split('-').map(norm);
      const x = norm(v);
      if (!x) return false;
      if (lo && x < lo) return false;
      if (hi && x > (vr === 'DA' ? hi : hi.padEnd(x.length, '9'))) return false;
      return true;
    }
    if (/[*?]/.test(alt) && vr !== 'UI') {
      const re = new RegExp('^' + alt.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', vr === 'PN' ? 'i' : '');
      return re.test(v);
    }
    if (vr === 'PN') return alt.toLowerCase().replace(/\^+$/, '') === v.toLowerCase().replace(/\^+$/, '');
    if (vr === 'DA' || vr === 'TM') return alt.replace(/[.:]/g, '') === v.replace(/[.:]/g, '');
    return alt === v;
  }
  /** Query value vs stored value: universal, single value, wildcard (* ?), range (DA/TM/DT a-b), list (a\b, UID lists). */
  function matchValue(q, value, vr) {
    if (isUniversal(q)) return true;
    const alts = (Array.isArray(q) ? q.map(String) : String(q).split('\\')).map((s) => s.trim()).filter((s) => s !== '');
    if (!alts.length) return true;
    const values = (Array.isArray(value) ? value.map(String) : String(value == null ? '' : value).split('\\')).map((s) => s.trim());
    return alts.some((alt) => values.some((v) => matchOne(alt, v, vr)));
  }

  /* ── In-memory archive (a tiny PACS: Q/R + storage) ── */
  const COMPUTED = {
    NumberOfPatientRelatedStudies: ['PatientID', 'StudyInstanceUID'], NumberOfPatientRelatedSeries: ['PatientID', 'SeriesInstanceUID'],
    NumberOfPatientRelatedInstances: ['PatientID', null], NumberOfStudyRelatedSeries: ['StudyInstanceUID', 'SeriesInstanceUID'],
    NumberOfStudyRelatedInstances: ['StudyInstanceUID', null], NumberOfSeriesRelatedInstances: ['SeriesInstanceUID', null],
    ModalitiesInStudy: ['StudyInstanceUID', 'Modality', true], SOPClassesInStudy: ['StudyInstanceUID', 'SOPClassUID', true],
  };
  class MemoryArchive {
    constructor() { this.instances = new Map(); }
    get size() { return this.instances.size; }
    /** Adds (or replaces) a Part 10 file. Returns { sopInstanceUid, sopClassUid, transferSyntax, attrs }. */
    add(bytes) {
      const b = toU8(bytes);
      const f = parsePart10(b);
      const attrs = readAttributes(f.dataset, f.transferSyntax, 0x7FE00010);
      if (!attrs.SOPInstanceUID) attrs.SOPInstanceUID = f.sopInstanceUid;
      if (!attrs.SOPClassUID) attrs.SOPClassUID = f.sopClassUid;
      if (!f.sopInstanceUid) throw new DicomNetError('INVALID', 'The file has no SOP Instance UID');
      const rec = { bytes: b, sopInstanceUid: f.sopInstanceUid, sopClassUid: f.sopClassUid, transferSyntax: f.transferSyntax, attrs };
      this.instances.set(f.sopInstanceUid, rec);
      return rec;
    }
    remove(sopInstanceUid) { return this.instances.delete(sopInstanceUid); }
    list() { return [...this.instances.values()]; }
    _computed(key, rep) {
      const [by, distinct, values] = COMPUTED[key];
      const same = this.list().filter((r) => String(r.attrs[by] || '') === String(rep.attrs[by] || ''));
      if (!distinct) return String(same.length);
      const set = [...new Set(same.map((r) => String(r.attrs[distinct] || '')).filter(Boolean))];
      return values ? set.join('\\') : String(set.length);
    }
    _groups(query, level) {
      level = normLevel(level);
      const keyOf = LEVEL_KEY[level];
      const groups = new Map();
      for (const r of this.instances.values()) {
        const k = String(r.attrs[keyOf] || '');
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }
      const conds = Object.entries(query || {}).filter(([k, v]) => k !== 'QueryRetrieveLevel' && k !== 'SpecificCharacterSet' && !isUniversal(v));
      const out = [];
      for (const members of groups.values()) {
        const rep0 = members[0];
        const computedOk = conds.filter(([k]) => COMPUTED[k]).every(([k, v]) => matchValue(v, this._computed(k, rep0), DICT[k] ? DICT[k].vr : 'LO'));
        if (!computedOk) continue;
        const plain = conds.filter(([k]) => !COMPUTED[k]);
        const hit = members.find((r) => plain.every(([k, v]) => {
          const d = DICT[k], tag = d ? d.hex : String(k).toUpperCase();
          const val = d ? r.attrs[k] : r.attrs.tags[tag] && r.attrs.tags[tag].value;
          return matchValue(v, val, d ? d.vr : (r.attrs.tags[tag] && r.attrs.tags[tag].vr) || 'LO');
        }));
        if (hit) out.push({ rep: hit, members });
      }
      return out;
    }
    /** C-FIND: matching entities at a level → [{ Keyword: value }] with the requested keys (and the computed counts). */
    find(query, level) {
      const lvl = normLevel(level || (query && query.QueryRetrieveLevel));
      return this._groups(query, lvl).map(({ rep }) => {
        const o = {};
        for (const k of Object.keys(query || {})) {
          if (COMPUTED[k]) o[k] = this._computed(k, rep);
          else if (DICT[k]) o[k] = rep.attrs[k] == null ? '' : rep.attrs[k];
          else { const t = rep.attrs.tags[String(k).toUpperCase()]; o[k] = t ? t.value : ''; }
        }
        o[LEVEL_KEY[lvl]] = rep.attrs[LEVEL_KEY[lvl]] || '';
        if (rep.attrs.SpecificCharacterSet) o.SpecificCharacterSet = rep.attrs.SpecificCharacterSet;
        o.QueryRetrieveLevel = lvl;
        return o;
      });
    }
    /** C-GET / C-MOVE: every instance under the matching entities → [Part 10 bytes]. */
    retrieve(query, level) {
      const seen = new Set(), out = [];
      for (const g of this._groups(query, level || (query && query.QueryRetrieveLevel))) {
        for (const r of g.members) if (!seen.has(r.sopInstanceUid)) { seen.add(r.sopInstanceUid); out.push(r.bytes); }
      }
      return out;
    }
    transferSyntaxesFor(sopClassUid) {
      return [...new Set(this.list().filter((r) => r.sopClassUid === sopClassUid).map((r) => r.transferSyntax))];
    }
    /** serve() options for Q/R + storage into this archive. extra: { moveDestination, readOnly } */
    handlers(extra) {
      extra = extra || {};
      const h = {
        onFind: (q, level) => this.find(q, level),
        onGet: (q, level) => this.retrieve(q, level),
        onMove: (q, level) => this.retrieve(q, level),
        preferredTransferSyntaxes: (abs) => this.transferSyntaxesFor(abs),
        moveDestination: extra.moveDestination,
      };
      if (!extra.readOnly) h.onStore = (bytes) => { this.add(bytes); return 0; };
      return h;
    }
  }

  return {
    TS, TS_NAMES, SOP, QR, STORAGE_SOP_CLASSES, DICT, DICT_BY_TAG, DEFAULT_KEYS, CMD, LEVELS, UNCOMPRESSED_TS, COMPRESSED_TS, ALL_TS,
    IMPLEMENTATION_CLASS_UID, IMPLEMENTATION_VERSION, DEFAULT_MAX_PDU,
    DicomNetError, Association, Client, MemoryArchive,
    associate, serve, echo, find, get, move, store,
    verificationContexts, findContexts, getContexts, moveContexts, storeContexts,
    encodeDataset, decodeDataset, encodeCommand, decodeCommand, explicitToImplicit, toPart10, parsePart10,
    matchValue, statusText, statusCategory, statusResult, sopName, tsName, tagHex, parseTagKey,
  };
});
