// Property schemas of every graphics object type. Each entry is
// [Name, kind, default, extra]. Kinds:
//   num int vec vecN mat color enum bool text texts handle cb any ro
// `extra` = keywords (color) / choices (enum) / length (vecN).
import { DEFAULT_COLOR_ORDER, colormapByName } from './colormaps.js';

const BLACKISH = [0.15, 0.15, 0.15];
const ON = true, OFF = false;

export const COMMON = [
  ['Tag', 'text', ''], ['UserData', 'any', null], ['Visible', 'bool', ON], ['HandleVisibility', 'enum', 'on', ['on', 'off', 'callback']],
  ['ButtonDownFcn', 'cb', null], ['CreateFcn', 'cb', null], ['DeleteFcn', 'cb', null], ['HitTest', 'bool', ON],
  ['PickableParts', 'enum', 'visible', ['visible', 'all', 'none']], ['Selected', 'bool', OFF], ['SelectionHighlight', 'bool', ON],
  ['Interruptible', 'bool', ON], ['BusyAction', 'enum', 'queue', ['queue', 'cancel']], ['ContextMenu', 'any', null], ['UIContextMenu', 'any', null],
  ['Clipping', 'bool', ON],
];

const LINEISH = [
  ['Color', 'color', DEFAULT_COLOR_ORDER[0], ['none']], ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['LineWidth', 'num', 0.5],
  ['Marker', 'enum', 'none', ['none', 'o', '+', '*', '.', 'x', '_', '|', 's', 'd', '^', 'v', '>', '<', 'p', 'h']], ['MarkerSize', 'num', 6],
  ['MarkerEdgeColor', 'color', 'auto', ['auto', 'none']], ['MarkerFaceColor', 'color', 'none', ['auto', 'none']], ['MarkerIndices', 'vec', null],
  ['DisplayName', 'text', ''], ['SeriesIndex', 'num', 1], ['AlignVertexCenters', 'bool', OFF],
];
const XYZ = [['XData', 'mat', null], ['YData', 'mat', null], ['ZData', 'mat', null], ['XDataMode', 'enum', 'manual', ['auto', 'manual']]];
const LIGHTING = [
  ['FaceLighting', 'enum', 'flat', ['flat', 'gouraud', 'none']], ['EdgeLighting', 'enum', 'none', ['flat', 'gouraud', 'none']],
  ['AmbientStrength', 'num', 0.3], ['DiffuseStrength', 'num', 0.6], ['SpecularStrength', 'num', 0.9], ['SpecularExponent', 'num', 10],
  ['SpecularColorReflectance', 'num', 1], ['BackFaceLighting', 'enum', 'reverselit', ['unlit', 'lit', 'reverselit']],
];
const FONT = [['FontSize', 'num', 10], ['FontName', 'text', 'Helvetica'], ['FontWeight', 'enum', 'normal', ['normal', 'bold']], ['FontAngle', 'enum', 'normal', ['normal', 'italic']]];

export const TEXT_PROPS = [
  ['String', 'text', ''], ['Position', 'vec', [0, 0, 0]], ['Units', 'enum', 'data', ['data', 'normalized', 'pixels', 'points', 'inches', 'centimeters', 'characters']],
  ['Color', 'color', BLACKISH, ['none']], ...FONT, ['HorizontalAlignment', 'enum', 'left', ['left', 'center', 'right']],
  ['VerticalAlignment', 'enum', 'middle', ['middle', 'top', 'bottom', 'baseline', 'cap']], ['Rotation', 'num', 0],
  ['Interpreter', 'enum', 'tex', ['tex', 'latex', 'none']], ['BackgroundColor', 'color', 'none', ['none']], ['EdgeColor', 'color', 'none', ['none']],
  ['Margin', 'num', 3], ['LineWidth', 'num', 0.5], ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['Editing', 'bool', OFF], ['Extent', 'ro', null],
];

const defaultCmap = () => colormapByName('default', 256);

export const TYPES = {
  root: [
    ['CurrentFigure', 'handle', null], ['ScreenSize', 'vec', [1, 1, 1920, 1080]], ['MonitorPositions', 'vec', [1, 1, 1920, 1080]], ['ScreenPixelsPerInch', 'num', 96],
    ['Units', 'enum', 'pixels', ['pixels', 'normalized', 'inches', 'centimeters', 'points', 'characters']], ['ShowHiddenHandles', 'bool', OFF], ['PointerLocation', 'vec', [0, 0]],
    ['FixedWidthFontName', 'text', 'Courier'], ['CallbackObject', 'handle', null],
    ['DefaultFigureColor', 'color', [0.94, 0.94, 0.94]], ['DefaultAxesFontSize', 'num', 10], ['DefaultLineLineWidth', 'num', 0.5], ['DefaultAxesColorOrder', 'mat', null],
  ],
  figure: [
    ['Number', 'ro', null], ['Name', 'text', ''], ['NumberTitle', 'bool', ON], ['Color', 'color', [0.94, 0.94, 0.94], ['none']],
    ['Position', 'vec4', [680, 458, 560, 420]], ['OuterPosition', 'ro', null], ['InnerPosition', 'ro', null], ['Units', 'enum', 'pixels', ['pixels', 'normalized', 'inches', 'centimeters', 'points', 'characters']],
    ['Colormap', 'mat', null], ['Alphamap', 'vec', null], ['NextPlot', 'enum', 'add', ['add', 'new', 'replace', 'replacechildren']],
    ['CurrentAxes', 'handle', null], ['CurrentObject', 'handle', null], ['CurrentPoint', 'vec', [0, 0]], ['CurrentCharacter', 'text', ''], ['SelectionType', 'text', 'normal'],
    ['MenuBar', 'enum', 'figure', ['figure', 'none']], ['ToolBar', 'enum', 'auto', ['auto', 'figure', 'none']], ['Resize', 'bool', ON], ['WindowStyle', 'enum', 'docked', ['normal', 'modal', 'docked', 'alwaysontop']],
    ['WindowState', 'enum', 'normal', ['normal', 'minimized', 'maximized', 'fullscreen']],
    ['CloseRequestFcn', 'cb', null], ['SizeChangedFcn', 'cb', null], ['ResizeFcn', 'cb', null], ['WindowButtonDownFcn', 'cb', null], ['WindowButtonUpFcn', 'cb', null],
    ['WindowButtonMotionFcn', 'cb', null], ['WindowScrollWheelFcn', 'cb', null], ['WindowKeyPressFcn', 'cb', null], ['WindowKeyReleaseFcn', 'cb', null], ['KeyPressFcn', 'cb', null], ['KeyReleaseFcn', 'cb', null],
    ['Pointer', 'text', 'arrow'], ['IntegerHandle', 'bool', ON], ['InvertHardcopy', 'bool', ON], ['PaperPositionMode', 'enum', 'auto', ['auto', 'manual']], ['PaperOrientation', 'enum', 'portrait', ['portrait', 'landscape']],
    ['PaperUnits', 'text', 'inches'], ['PaperPosition', 'vec4', [0.25, 2.5, 8, 6]], ['PaperSize', 'vec', [8.5, 11]], ['PaperType', 'text', 'usletter'],
    ['Renderer', 'enum', 'opengl', ['opengl', 'painters']], ['RendererMode', 'enum', 'auto', ['auto', 'manual']], ['GraphicsSmoothing', 'bool', ON], ['FileName', 'text', ''],
    ['IsUIFigure', 'ro', null], ['AutoResizeChildren', 'bool', ON], ['Scrollable', 'bool', OFF], ['Icon', 'text', ''], ['DockControls', 'bool', ON], ['Theme', 'any', null],
  ],
  axes: [
    ['OuterPosition', 'vec4', [0, 0, 1, 1]], ['Position', 'vec4', [0.13, 0.11, 0.775, 0.815]], ['InnerPosition', 'ro', null], ['TightInset', 'ro', null],
    ['PositionConstraint', 'enum', 'outerposition', ['outerposition', 'innerposition']], ['ActivePositionProperty', 'enum', 'outerposition', ['outerposition', 'position']],
    ['Units', 'enum', 'normalized', ['normalized', 'pixels', 'inches', 'centimeters', 'points', 'characters']],
    ['XLim', 'vec2', [0, 1]], ['YLim', 'vec2', [0, 1]], ['ZLim', 'vec2', [0, 1]], ['CLim', 'vec2', [0, 1]], ['ALim', 'vec2', [0, 1]],
    ['XLimMode', 'enum', 'auto', ['auto', 'manual']], ['YLimMode', 'enum', 'auto', ['auto', 'manual']], ['ZLimMode', 'enum', 'auto', ['auto', 'manual']],
    ['CLimMode', 'enum', 'auto', ['auto', 'manual']], ['ALimMode', 'enum', 'auto', ['auto', 'manual']],
    ['XLimitMethod', 'enum', 'tickaligned', ['tickaligned', 'tight', 'padded']], ['YLimitMethod', 'enum', 'tickaligned', ['tickaligned', 'tight', 'padded']], ['ZLimitMethod', 'enum', 'tickaligned', ['tickaligned', 'tight', 'padded']],
    ['XScale', 'enum', 'linear', ['linear', 'log']], ['YScale', 'enum', 'linear', ['linear', 'log']], ['ZScale', 'enum', 'linear', ['linear', 'log']], ['ColorScale', 'enum', 'linear', ['linear', 'log']],
    ['XDir', 'enum', 'normal', ['normal', 'reverse']], ['YDir', 'enum', 'normal', ['normal', 'reverse']], ['ZDir', 'enum', 'normal', ['normal', 'reverse']],
    ['XGrid', 'bool', OFF], ['YGrid', 'bool', OFF], ['ZGrid', 'bool', OFF], ['XMinorGrid', 'bool', OFF], ['YMinorGrid', 'bool', OFF], ['ZMinorGrid', 'bool', OFF],
    ['XMinorTick', 'bool', OFF], ['YMinorTick', 'bool', OFF], ['ZMinorTick', 'bool', OFF],
    ['GridLineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['MinorGridLineStyle', 'enum', ':', ['-', '--', ':', '-.', 'none']],
    ['GridColor', 'color', BLACKISH, ['none']], ['MinorGridColor', 'color', [0.1, 0.1, 0.1], ['none']], ['GridAlpha', 'num', 0.15], ['MinorGridAlpha', 'num', 0.25],
    ['Box', 'bool', OFF], ['BoxStyle', 'enum', 'back', ['back', 'full']], ['Color', 'color', [1, 1, 1], ['none']],
    ['XColor', 'color', BLACKISH, ['none']], ['YColor', 'color', BLACKISH, ['none']], ['ZColor', 'color', BLACKISH, ['none']], ['LineWidth', 'num', 0.5],
    ...FONT, ['TitleFontSizeMultiplier', 'num', 1.1], ['LabelFontSizeMultiplier', 'num', 1.1], ['TitleFontWeight', 'enum', 'bold', ['normal', 'bold']], ['FontSizeMode', 'enum', 'auto', ['auto', 'manual']],
    ['NextPlot', 'enum', 'replace', ['replace', 'add', 'replacechildren', 'replaceall']], ['ColorOrder', 'mat', null], ['ColorOrderIndex', 'int', 1],
    ['LineStyleOrder', 'texts', ['-']], ['LineStyleOrderIndex', 'int', 1],
    ['View', 'vec2', [0, 90]], ['DataAspectRatio', 'vec3', [1, 1, 1]], ['DataAspectRatioMode', 'enum', 'auto', ['auto', 'manual']],
    ['PlotBoxAspectRatio', 'vec3', [1, 1, 1]], ['PlotBoxAspectRatioMode', 'enum', 'auto', ['auto', 'manual']], ['Projection', 'enum', 'orthographic', ['orthographic', 'perspective']],
    ['CameraPosition', 'vec3', [0, 0, 1]], ['CameraTarget', 'vec3', [0, 0, 0]], ['CameraUpVector', 'vec3', [0, 1, 0]], ['CameraViewAngle', 'num', 6.6086],
    ['XTick', 'vec', []], ['YTick', 'vec', []], ['ZTick', 'vec', []], ['XTickMode', 'enum', 'auto', ['auto', 'manual']], ['YTickMode', 'enum', 'auto', ['auto', 'manual']], ['ZTickMode', 'enum', 'auto', ['auto', 'manual']],
    ['XTickLabel', 'texts', []], ['YTickLabel', 'texts', []], ['ZTickLabel', 'texts', []],
    ['XTickLabelMode', 'enum', 'auto', ['auto', 'manual']], ['YTickLabelMode', 'enum', 'auto', ['auto', 'manual']], ['ZTickLabelMode', 'enum', 'auto', ['auto', 'manual']],
    ['XTickLabelRotation', 'num', 0], ['YTickLabelRotation', 'num', 0], ['ZTickLabelRotation', 'num', 0],
    ['TickDir', 'enum', 'in', ['in', 'out', 'both', 'none']], ['TickLength', 'vec2', [0.01, 0.025]], ['Layer', 'enum', 'bottom', ['bottom', 'top']],
    ['XAxisLocation', 'enum', 'bottom', ['bottom', 'top', 'origin']], ['YAxisLocation', 'enum', 'left', ['left', 'right', 'origin']],
    ['Colormap', 'mat', null], ['Alphamap', 'vec', null], ['AmbientLightColor', 'color', [1, 1, 1]],
    ['Title', 'handle', null], ['Subtitle', 'handle', null], ['XLabel', 'handle', null], ['YLabel', 'handle', null], ['ZLabel', 'handle', null],
    ['Legend', 'handle', null], ['Colorbar', 'handle', null], ['Toolbar', 'any', null], ['Interactions', 'any', null], ['Layout', 'any', null],
    ['CurrentPoint', 'mat', null], ['SortMethod', 'enum', 'depth', ['depth', 'childorder']], ['TitleHorizontalAlignment', 'enum', 'center', ['left', 'center', 'right']],
    ['XAxisType', 'ro', null], ['YAxisType', 'ro', null], ['Kind', 'ro', null],
    // polar
    ['ThetaLim', 'vec2', [0, 360]], ['RLim', 'vec2', [0, 1]], ['ThetaLimMode', 'enum', 'auto', ['auto', 'manual']], ['RLimMode', 'enum', 'auto', ['auto', 'manual']],
    ['ThetaDir', 'enum', 'counterclockwise', ['counterclockwise', 'clockwise']], ['ThetaZeroLocation', 'enum', 'right', ['right', 'top', 'left', 'bottom']],
    ['RTick', 'vec', []], ['ThetaTick', 'vec', []], ['RTickMode', 'enum', 'auto', ['auto', 'manual']], ['ThetaTickMode', 'enum', 'auto', ['auto', 'manual']],
    ['RTickLabel', 'texts', []], ['ThetaTickLabel', 'texts', []], ['ThetaAxisUnits', 'enum', 'degrees', ['degrees', 'radians']], ['RAxisLocation', 'num', 80],
    ['RDir', 'enum', 'normal', ['normal', 'reverse']], ['ThetaGrid', 'bool', ON], ['RGrid', 'bool', ON], ['RColor', 'color', BLACKISH], ['ThetaColor', 'color', BLACKISH],
  ],
  line: [...XYZ, ...LINEISH],
  animatedline: [...XYZ, ...LINEISH, ['MaximumNumPoints', 'num', 1000000]],
  scatter: [...XYZ, ['SizeData', 'mat', null], ['CData', 'mat', null], ['Marker', 'enum', 'o', ['none', 'o', '+', '*', '.', 'x', '_', '|', 's', 'd', '^', 'v', '>', '<', 'p', 'h']],
    ['MarkerEdgeColor', 'color', 'flat', ['flat', 'none', 'auto']], ['MarkerFaceColor', 'color', 'none', ['flat', 'none', 'auto']], ['MarkerFaceAlpha', 'num', 1], ['MarkerEdgeAlpha', 'num', 1],
    ['LineWidth', 'num', 0.5], ['DisplayName', 'text', ''], ['SeriesIndex', 'num', 1], ['Jitter', 'enum', 'off', ['off', 'on', 'density', 'rand', 'randn']]],
  surface: [...XYZ, ['CData', 'mat', null], ['CDataMode', 'enum', 'auto', ['auto', 'manual']], ['CDataMapping', 'enum', 'scaled', ['scaled', 'direct']], ['AlphaData', 'mat', null],
    ['FaceColor', 'color', 'flat', ['flat', 'interp', 'none', 'texturemap']], ['EdgeColor', 'color', [0, 0, 0], ['flat', 'interp', 'none']], ['FaceAlpha', 'num', 1], ['EdgeAlpha', 'num', 1],
    ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['LineWidth', 'num', 0.5], ['MeshStyle', 'enum', 'both', ['both', 'row', 'column']],
    ['Marker', 'enum', 'none', ['none', 'o', '+', '*', '.', 'x', 's', 'd', '^', 'v', '>', '<', 'p', 'h']], ['MarkerSize', 'num', 6], ['MarkerEdgeColor', 'color', 'auto', ['auto', 'none', 'flat']], ['MarkerFaceColor', 'color', 'none', ['auto', 'none', 'flat']],
    ['VertexNormals', 'mat', null], ['DisplayName', 'text', ''], ...LIGHTING],
  patch: [['Faces', 'mat', null], ['Vertices', 'mat', null], ['XData', 'mat', null], ['YData', 'mat', null], ['ZData', 'mat', null], ['CData', 'mat', null], ['FaceVertexCData', 'mat', null],
    ['FaceVertexAlphaData', 'mat', null], ['CDataMapping', 'enum', 'scaled', ['scaled', 'direct']],
    ['FaceColor', 'color', [0, 0, 0], ['flat', 'interp', 'none']], ['EdgeColor', 'color', [0, 0, 0], ['flat', 'interp', 'none']], ['FaceAlpha', 'num', 1], ['EdgeAlpha', 'num', 1],
    ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['LineWidth', 'num', 0.5], ['Marker', 'enum', 'none', ['none', 'o', '+', '*', '.', 'x', 's', 'd', '^', 'v', '>', '<', 'p', 'h']],
    ['MarkerSize', 'num', 6], ['MarkerEdgeColor', 'color', 'auto', ['auto', 'none', 'flat']], ['MarkerFaceColor', 'color', 'none', ['auto', 'none', 'flat']],
    ['VertexNormals', 'mat', null], ['DisplayName', 'text', ''], ...LIGHTING],
  text: TEXT_PROPS,
  image: [['CData', 'mat', null], ['XData', 'vec', [1, 1]], ['YData', 'vec', [1, 1]], ['CDataMapping', 'enum', 'direct', ['direct', 'scaled']], ['AlphaData', 'mat', null],
    ['AlphaDataMapping', 'enum', 'none', ['none', 'scaled', 'direct']], ['Interpolation', 'enum', 'nearest', ['nearest', 'bilinear']], ['DisplayName', 'text', '']],
  rectangle: [['Position', 'vec4', [0, 0, 1, 1]], ['Curvature', 'vec', [0, 0]], ['FaceColor', 'color', 'none', ['none']], ['EdgeColor', 'color', [0, 0, 0], ['none']],
    ['LineWidth', 'num', 0.5], ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['FaceAlpha', 'num', 1]],
  light: [['Position', 'vec3', [1, 0, 1]], ['Style', 'enum', 'infinite', ['infinite', 'local']], ['Color', 'color', [1, 1, 1]], ['Headlight', 'bool', OFF]],
  quiver: [...XYZ, ['UData', 'mat', null], ['VData', 'mat', null], ['WData', 'mat', null], ['Color', 'color', DEFAULT_COLOR_ORDER[0], ['none']], ['LineWidth', 'num', 0.5],
    ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['AutoScale', 'bool', ON], ['AutoScaleFactor', 'num', 0.9], ['MaxHeadSize', 'num', 0.2], ['ShowArrowHead', 'bool', ON],
    ['Marker', 'enum', 'none', ['none', 'o', '+', '*', '.', 'x', 's', 'd', '^', 'v', '>', '<', 'p', 'h']], ['MarkerSize', 'num', 6], ['Alignment', 'enum', 'tail', ['tail', 'center', 'head']], ['DisplayName', 'text', ''], ['SeriesIndex', 'num', 1]],
  contour: [...XYZ, ['LevelList', 'vec', []], ['LevelListMode', 'enum', 'auto', ['auto', 'manual']], ['LevelStep', 'num', 0], ['LevelStepMode', 'enum', 'auto', ['auto', 'manual']],
    ['Fill', 'bool', OFF], ['LineColor', 'color', 'flat', ['flat', 'none']], ['LineWidth', 'num', 0.5], ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']],
    ['ShowText', 'bool', OFF], ['LabelSpacing', 'num', 144], ['TextList', 'vec', []], ['ContourMatrix', 'ro', null], ['FaceAlpha', 'num', 1], ['EdgeAlpha', 'num', 1], ['DisplayName', 'text', ''], ['Is3D', 'ro', null], ['FaceColor', 'color', 'flat', ['flat', 'none']]],
  bar: [['XData', 'mat', null], ['YData', 'mat', null], ['BarWidth', 'num', 0.8], ['FaceColor', 'color', DEFAULT_COLOR_ORDER[0], ['flat', 'none']], ['EdgeColor', 'color', [0, 0, 0], ['flat', 'none']],
    ['FaceAlpha', 'num', 1], ['EdgeAlpha', 'num', 1], ['LineWidth', 'num', 0.5], ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['Horizontal', 'bool', OFF], ['BaseValue', 'num', 0],
    ['BarLayout', 'enum', 'grouped', ['grouped', 'stacked']], ['ShowBaseLine', 'bool', ON], ['CData', 'mat', null], ['DisplayName', 'text', ''], ['SeriesIndex', 'num', 1],
    ['Labels', 'any', null], ['XEndPoints', 'ro', null], ['YEndPoints', 'ro', null]],
  histogram: [['Data', 'mat', null], ['BinEdges', 'vec', []], ['BinCounts', 'ro', null], ['Values', 'ro', null], ['NumBins', 'int', 10], ['BinWidth', 'num', 1], ['BinLimits', 'vec2', [0, 1]],
    ['BinMethod', 'enum', 'auto', ['auto', 'scott', 'fd', 'integers', 'sturges', 'sqrt', 'manual']], ['Normalization', 'enum', 'count', ['count', 'probability', 'percentage', 'countdensity', 'pdf', 'cumcount', 'cdf']],
    ['DisplayStyle', 'enum', 'bar', ['bar', 'stairs']], ['Orientation', 'enum', 'vertical', ['vertical', 'horizontal']], ['FaceColor', 'color', 'auto', ['auto', 'none']],
    ['EdgeColor', 'color', [0.15, 0.15, 0.15], ['auto', 'none']], ['FaceAlpha', 'num', 0.6], ['EdgeAlpha', 'num', 1], ['LineWidth', 'num', 0.5], ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']],
    ['DisplayName', 'text', ''], ['SeriesIndex', 'num', 1]],
  histogram2: [['Data', 'mat', null], ['XBinEdges', 'vec', []], ['YBinEdges', 'vec', []], ['Values', 'ro', null], ['NumBins', 'vec', [10, 10]],
    ['Normalization', 'enum', 'count', ['count', 'probability', 'percentage', 'countdensity', 'pdf', 'cumcount', 'cdf']], ['DisplayStyle', 'enum', 'bar3', ['bar3', 'tile']],
    ['FaceColor', 'color', 'auto', ['auto', 'flat', 'none']], ['EdgeColor', 'color', [0.15, 0.15, 0.15], ['auto', 'none']], ['FaceAlpha', 'num', 1], ['ShowEmptyBins', 'bool', OFF], ['DisplayName', 'text', '']],
  area: [['XData', 'mat', null], ['YData', 'mat', null], ['BaseValue', 'num', 0], ['FaceColor', 'color', DEFAULT_COLOR_ORDER[0], ['flat', 'none']], ['EdgeColor', 'color', [0, 0, 0], ['none']],
    ['FaceAlpha', 'num', 1], ['EdgeAlpha', 'num', 1], ['LineWidth', 'num', 0.5], ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['DisplayName', 'text', ''], ['SeriesIndex', 'num', 1]],
  stair: [['XData', 'mat', null], ['YData', 'mat', null], ...LINEISH],
  stem: [['XData', 'mat', null], ['YData', 'mat', null], ['ZData', 'mat', null], ['BaseValue', 'num', 0], ['ShowBaseLine', 'bool', ON], ...LINEISH.map((p) => (p[0] === 'Marker' ? ['Marker', 'enum', 'o', p[3]] : p))],
  errorbar: [['XData', 'mat', null], ['YData', 'mat', null], ['YNegativeDelta', 'mat', null], ['YPositiveDelta', 'mat', null], ['XNegativeDelta', 'mat', null], ['XPositiveDelta', 'mat', null],
    ['LData', 'ro', null], ['UData', 'ro', null], ['CapSize', 'num', 6], ...LINEISH],
  legend: [['String', 'texts', []], ['Location', 'enum', 'northeast', ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'northoutside', 'southoutside', 'eastoutside', 'westoutside',
    'northeastoutside', 'northwestoutside', 'southeastoutside', 'southwestoutside', 'best', 'bestoutside', 'layout', 'none']], ['Orientation', 'enum', 'vertical', ['vertical', 'horizontal']],
    ['NumColumns', 'int', 1], ['Box', 'bool', ON], ['FontSize', 'num', 9], ['FontName', 'text', 'Helvetica'], ['FontWeight', 'enum', 'normal', ['normal', 'bold']], ['TextColor', 'color', [0, 0, 0]], ['Color', 'color', [1, 1, 1], ['none']],
    ['EdgeColor', 'color', [0.15, 0.15, 0.15], ['none']], ['LineWidth', 'num', 0.5], ['Interpreter', 'enum', 'tex', ['tex', 'latex', 'none']], ['Title', 'any', null], ['AutoUpdate', 'bool', ON],
    ['PlotChildren', 'any', null], ['Position', 'vec4', [0, 0, 0.1, 0.1]], ['Units', 'text', 'normalized'], ['ItemHitFcn', 'cb', null], ['Axes', 'ro', null], ['Direction', 'enum', 'normal', ['normal', 'reverse']]],
  colorbar: [['Location', 'enum', 'eastoutside', ['north', 'south', 'east', 'west', 'northoutside', 'southoutside', 'eastoutside', 'westoutside']], ['Limits', 'vec2', [0, 1]], ['LimitsMode', 'enum', 'auto', ['auto', 'manual']],
    ['Ticks', 'vec', []], ['TickLabels', 'texts', []], ['TicksMode', 'enum', 'auto', ['auto', 'manual']], ['TickLabelsMode', 'enum', 'auto', ['auto', 'manual']], ['Label', 'handle', null],
    ['Direction', 'enum', 'normal', ['normal', 'reverse']], ['FontSize', 'num', 9], ['Color', 'color', BLACKISH], ['TickDirection', 'enum', 'in', ['in', 'out', 'both', 'none']], ['Box', 'bool', ON],
    ['Position', 'vec4', [0, 0, 0.03, 0.8]], ['Units', 'text', 'normalized'], ['Axes', 'ro', null], ['LineWidth', 'num', 0.5], ['AxisLocation', 'enum', 'out', ['in', 'out']]],
  tiledlayout: [['GridSize', 'vec2', [1, 1]], ['TileSpacing', 'enum', 'loose', ['loose', 'compact', 'tight', 'none']], ['Padding', 'enum', 'loose', ['loose', 'compact', 'tight']],
    ['TileIndexing', 'enum', 'rowmajor', ['rowmajor', 'columnmajor']], ['Title', 'handle', null], ['Subtitle', 'handle', null], ['XLabel', 'handle', null], ['YLabel', 'handle', null],
    ['OuterPosition', 'vec4', [0, 0, 1, 1]], ['Position', 'vec4', [0, 0, 1, 1]], ['Units', 'text', 'normalized'], ['Flow', 'ro', null]],
  heatmap: [['ColorData', 'mat', null], ['XData', 'texts', []], ['YData', 'texts', []], ['XDisplayLabels', 'texts', []], ['YDisplayLabels', 'texts', []], ['Title', 'text', ''], ['XLabel', 'text', ''], ['YLabel', 'text', ''],
    ['Colormap', 'mat', null], ['ColorLimits', 'vec2', [0, 1]], ['ColorLimitsMode', 'enum', 'auto', ['auto', 'manual']], ['ColorbarVisible', 'bool', ON], ['CellLabelFormat', 'text', '%.3g'], ['CellLabelColor', 'color', 'auto', ['auto', 'none']],
    ['MissingDataColor', 'color', [0.15, 0.15, 0.15]], ['MissingDataLabel', 'text', 'NaN'], ['GridVisible', 'bool', ON], ['FontSize', 'num', 10], ['FontName', 'text', 'Helvetica'], ['ColorScaling', 'enum', 'scaled', ['scaled', 'scaledrows', 'scaledcolumns', 'log']],
    ['OuterPosition', 'vec4', [0, 0, 1, 1]], ['Position', 'vec4', [0.13, 0.11, 0.775, 0.815]], ['Units', 'text', 'normalized'], ['Layout', 'any', null]],
  annotation: [['Shape', 'ro', null], ['X', 'vec2', [0.3, 0.4]], ['Y', 'vec2', [0.3, 0.4]], ['Position', 'vec4', [0.3, 0.3, 0.1, 0.1]], ['Units', 'text', 'normalized'], ['Color', 'color', [0, 0, 0], ['none']],
    ['LineWidth', 'num', 0.5], ['LineStyle', 'enum', '-', ['-', '--', ':', '-.', 'none']], ['FaceColor', 'color', 'none', ['none']], ['FaceAlpha', 'num', 1], ['String', 'text', ''], ['FontSize', 'num', 10],
    ['FontName', 'text', 'Helvetica'], ['FontWeight', 'enum', 'normal', ['normal', 'bold']], ['HorizontalAlignment', 'enum', 'left', ['left', 'center', 'right']], ['VerticalAlignment', 'enum', 'top', ['top', 'middle', 'bottom']],
    ['HeadStyle', 'text', 'vback2'], ['HeadLength', 'num', 10], ['HeadWidth', 'num', 10], ['TextColor', 'color', [0, 0, 0]], ['BackgroundColor', 'color', 'none', ['none']], ['EdgeColor', 'color', [0, 0, 0], ['none']],
    ['FitBoxToText', 'bool', OFF], ['Interpreter', 'enum', 'tex', ['tex', 'latex', 'none']]],
  hggroup: [['DisplayName', 'text', '']],
  uicontrol: [['Style', 'enum', 'pushbutton', ['pushbutton', 'togglebutton', 'radiobutton', 'checkbox', 'edit', 'text', 'slider', 'listbox', 'popupmenu', 'frame']],
    ['String', 'text', ''], ['Value', 'any', null], ['Min', 'num', 0], ['Max', 'num', 1], ['SliderStep', 'vec2', [0.01, 0.1]], ['Position', 'vec4', [20, 20, 60, 20]], ['Units', 'text', 'pixels'],
    ['Enable', 'enum', 'on', ['on', 'off', 'inactive']], ['BackgroundColor', 'color', [0.94, 0.94, 0.94]], ['ForegroundColor', 'color', [0, 0, 0]], ['Callback', 'cb', null],
    ['KeyPressFcn', 'cb', null], ['TooltipString', 'text', ''], ['Tooltip', 'text', ''], ...FONT, ['HorizontalAlignment', 'enum', 'center', ['left', 'center', 'right']]],
  uipanel: [['Title', 'text', ''], ['Position', 'vec4', [20, 20, 200, 150]], ['Units', 'text', 'pixels'], ['BackgroundColor', 'color', [0.94, 0.94, 0.94]], ['ForegroundColor', 'color', [0, 0, 0]],
    ['BorderType', 'text', 'line'], ...FONT, ['Scrollable', 'bool', OFF]],
  uibutton: [['Text', 'text', 'Button'], ['Position', 'vec4', [100, 100, 100, 22]], ['ButtonPushedFcn', 'cb', null], ['Enable', 'bool', ON], ['Icon', 'text', ''], ...FONT,
    ['BackgroundColor', 'color', [0.96, 0.96, 0.96]], ['FontColor', 'color', [0, 0, 0]], ['Tooltip', 'text', ''], ['Value', 'any', null], ['ButtonStyle', 'ro', null]],
  uislider: [['Value', 'num', 0], ['Limits', 'vec2', [0, 100]], ['Position', 'vec4', [100, 100, 150, 3]], ['ValueChangedFcn', 'cb', null], ['ValueChangingFcn', 'cb', null], ['Enable', 'bool', ON],
    ['MajorTicks', 'vec', []], ['Orientation', 'enum', 'horizontal', ['horizontal', 'vertical']], ...FONT, ['FontColor', 'color', [0, 0, 0]], ['Tooltip', 'text', ''], ['Step', 'num', 0]],
  uieditfield: [['Value', 'any', null], ['EditStyle', 'ro', null], ['Position', 'vec4', [100, 100, 100, 22]], ['ValueChangedFcn', 'cb', null], ['ValueChangingFcn', 'cb', null], ['Enable', 'bool', ON],
    ['Limits', 'vec2', [-Infinity, Infinity]], ['Placeholder', 'text', ''], ['Editable', 'bool', ON], ['HorizontalAlignment', 'enum', 'left', ['left', 'center', 'right']], ...FONT, ['FontColor', 'color', [0, 0, 0]],
    ['BackgroundColor', 'color', [1, 1, 1]], ['Tooltip', 'text', ''], ['ValueDisplayFormat', 'text', '%11.4g']],
  uilabel: [['Text', 'text', 'Label'], ['Position', 'vec4', [100, 100, 31, 22]], ['HorizontalAlignment', 'enum', 'left', ['left', 'center', 'right']], ['VerticalAlignment', 'enum', 'center', ['top', 'center', 'bottom']],
    ...FONT, ['FontColor', 'color', [0, 0, 0]], ['BackgroundColor', 'color', 'none', ['none']], ['WordWrap', 'bool', OFF], ['Enable', 'bool', ON], ['Interpreter', 'enum', 'none', ['none', 'tex', 'latex', 'html']]],
  uidropdown: [['Items', 'texts', ['Option 1', 'Option 2', 'Option 3', 'Option 4']], ['ItemsData', 'any', null], ['Value', 'any', null], ['Position', 'vec4', [100, 100, 100, 22]], ['ValueChangedFcn', 'cb', null],
    ['Editable', 'bool', OFF], ['Enable', 'bool', ON], ...FONT, ['FontColor', 'color', [0, 0, 0]], ['BackgroundColor', 'color', [0.96, 0.96, 0.96]], ['Placeholder', 'text', ''], ['Tooltip', 'text', '']],
  uicheckbox: [['Text', 'text', 'Check Box'], ['Value', 'bool', OFF], ['Position', 'vec4', [100, 100, 84, 22]], ['ValueChangedFcn', 'cb', null], ['Enable', 'bool', ON], ...FONT, ['FontColor', 'color', [0, 0, 0]], ['Tooltip', 'text', '']],
  waitbar: [['Value', 'num', 0], ['Message', 'text', '']],
};
TYPES.polaraxes = TYPES.axes;
TYPES.uiaxes = TYPES.axes;

/** Types whose colour props follow the app theme while they keep their default. */
export const THEMED = {
  figure: ['Color'], axes: ['Color', 'XColor', 'YColor', 'ZColor', 'GridColor', 'MinorGridColor', 'RColor', 'ThetaColor'],
  text: ['Color'], legend: ['TextColor', 'Color', 'EdgeColor'], colorbar: ['Color'], heatmap: ['MissingDataColor'],
  annotation: ['Color', 'TextColor', 'EdgeColor'], uicontrol: ['BackgroundColor', 'ForegroundColor'], uipanel: ['BackgroundColor', 'ForegroundColor'],
  uibutton: ['BackgroundColor', 'FontColor'], uislider: ['FontColor'], uieditfield: ['FontColor', 'BackgroundColor'], uilabel: ['FontColor'],
  uidropdown: ['FontColor', 'BackgroundColor'], uicheckbox: ['FontColor'], rectangle: [], line: [], errorbar: [], stem: [], stair: [],
};

/** Display names of types (class names: 'graphics.<Name>'). */
export const TYPE_CLASS = {
  root: 'Root', figure: 'Figure', axes: 'Axes', polaraxes: 'PolarAxes', uiaxes: 'UIAxes', line: 'Line', animatedline: 'AnimatedLine', scatter: 'Scatter',
  surface: 'Surface', patch: 'Patch', text: 'Text', image: 'Image', rectangle: 'Rectangle', light: 'Light', quiver: 'Quiver', contour: 'Contour',
  bar: 'Bar', histogram: 'Histogram', histogram2: 'Histogram2', area: 'Area', stair: 'Stair', stem: 'Stem', errorbar: 'ErrorBar', legend: 'Legend', colorbar: 'ColorBar',
  tiledlayout: 'TiledChartLayout', heatmap: 'HeatmapChart', annotation: 'Annotation', hggroup: 'Group', uicontrol: 'UIControl', uipanel: 'Panel', uibutton: 'Button',
  uislider: 'Slider', uieditfield: 'EditField', uilabel: 'Label', uidropdown: 'DropDown', uicheckbox: 'CheckBox', waitbar: 'Waitbar',
};

/** Main properties shown when a handle is displayed. */
export const DISPLAY_PROPS = {
  figure: ['Number', 'Name', 'Color', 'Position', 'Units'],
  axes: ['XLim', 'YLim', 'XScale', 'YScale', 'GridLineStyle', 'Position', 'Units'],
  line: ['Color', 'LineStyle', 'LineWidth', 'Marker', 'MarkerSize', 'MarkerFaceColor', 'XData', 'YData', 'ZData'],
  animatedline: ['Color', 'LineStyle', 'LineWidth', 'Marker', 'MaximumNumPoints'],
  scatter: ['Marker', 'MarkerEdgeColor', 'MarkerFaceColor', 'SizeData', 'LineWidth', 'XData', 'YData', 'ZData', 'CData'],
  surface: ['EdgeColor', 'LineStyle', 'FaceColor', 'FaceLighting', 'FaceAlpha', 'XData', 'YData', 'ZData', 'CData'],
  patch: ['FaceColor', 'FaceVertexAlphaData', 'EdgeColor', 'LineStyle', 'Faces', 'Vertices'],
  text: ['String', 'FontSize', 'FontWeight', 'FontName', 'Color', 'HorizontalAlignment', 'Position', 'Units'],
  image: ['CData', 'CDataMapping'],
  light: ['Color', 'Style', 'Position', 'Visible'],
  legend: ['String', 'Location', 'Orientation', 'FontSize', 'Position', 'Units'],
  colorbar: ['Location', 'Limits', 'FontSize', 'Position', 'Units'],
  bar: ['BarLayout', 'BarWidth', 'FaceColor', 'EdgeColor', 'BaseValue', 'XData', 'YData'],
  histogram: ['Data', 'Values', 'NumBins', 'BinEdges', 'BinWidth', 'BinLimits', 'Normalization', 'FaceColor', 'EdgeColor'],
  contour: ['LineColor', 'LineStyle', 'LineWidth', 'Fill', 'LevelList', 'XData', 'YData', 'ZData'],
};

export { defaultCmap };
