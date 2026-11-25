// Icons for segmented choice buttons that were given none (user rule: every button under a tab shows an icon).
// The value decides first (planes, axes, directions, shapes …), then the setting's key, then a neutral pointer.
const BY_VALUE = {
  front: 'planeFront', top: 'planeTop', right: 'planeRight', back: 'viewBack', left: 'viewLeft', bottom: 'viewBottom',
  x: 'refAxis', y: 'refAxis', z: 'refAxis', '-x': 'refAxis', '-y': 'refAxis', '-z': 'refAxis', '+x': 'refAxis', '+y': 'refAxis', '+z': 'refAxis',
  edge: 'lineTool', axis: 'refAxis', model: 'refAxis', twoPoints: 'pointTool', points: 'pointTool', cylinder: 'surfaceExtrude', planes: 'refPlane',
  coords: 'coordSys', xyz: 'coordSys', faceCenter: 'centerMark', center: 'orbitCenter', centre: 'orbitCenter', arcCenter: 'centerMark', onEdge: 'pointTool', massCenter: 'massProps', origin: 'origin',
  iso: 'stdLibrary', ansiInch: 'stdLibrary', din: 'stdLibrary', jis: 'stdLibrary',
  spherical: 'featDome', elliptical: 'mkEllipse', continuous: 'featDome',
  auto: 'autoArrange', external: 'featThread', internal: 'cavity',
  above: 'valignTop', below: 'arrowDown', both: 'split',
  bend: 'sketchedBend', twist: 'helix', taper: 'featDraft', stretch: 'stretchTool',
  square: 'grid', staggered: 'grid',
  tangent: 'relTangent', normal: 'normalTo', direction: 'mkArrow', parallel: 'relParallel',
  core: 'cavity', cavity: 'cavity',
  static: 'simulation', frequency: 'simulation', modal: 'simulation', buckling: 'buckling', fatigue: 'fatigue', thermal: 'simulation',
  first: 'flipV', second: 'flipV', none: 'close', linear: 'lineTool',
  deg: 'dimAngle', turns: 'helix', radius: 'dimRadius', chord: 'smartDim',
  close: 'dimDiameter', normalFit: 'dimDiameter', loose: 'dimDiameter',
  oneDir: 'flipV', mid: 'plMidplane', twoDir: 'flipH',
  helix: 'helix', spiral: 'helix',
  parting: 'partingLine', true: 'check', false: 'close',
};
const BY_KEY = {
  stdPlane: 'refPlane', stdPlane2: 'refPlane', neutralStd: 'refPlane', drawPlane: 'refPlane', plane: 'refPlane',
  dir: 'mkArrow', dir1: 'mkArrow', dir2axis: 'mkArrow', axisKind: 'refAxis', axisKind2: 'refAxis', pullAxis: 'mkArrow', axis: 'refAxis',
  standard: 'stdLibrary', fit: 'dimDiameter', shape: 'featDome', internal: 'featThread', about: 'origin', keep: 'split', show: 'cavity',
  mode: 'pointer', kind: 'pointer', layout: 'grid', type: 'pointer', at: 'pointTool', study: 'simulation', side: 'flipV',
  extension: 'lineTool', direction: 'mkArrow', twistUnit: 'dimAngle', thinKind: 'featShell',
};

/** The icon of a segmented button without one: by its value, then its setting's key. */
export function segGlyph(key, value) {
  const v = String(value);
  return BY_VALUE[v] ?? BY_VALUE[v.toLowerCase()] ?? BY_KEY[key] ?? BY_KEY[String(key).split(':')[0]] ?? 'pointer';
}
