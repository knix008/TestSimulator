import type { ComponentType, SVGProps } from 'react'
import {
  Aperture, Atom, Binary, Blend, Blinds, Boxes, Brush, Camera, Circle, CircleDot, Cloud, CloudSun, Columns3,
  Contrast, Crosshair, Cylinder, Diamond, Dices, Droplets, Feather, Film, Flame, Focus, Frame, Gem, Grid3x3,
  Grip, Hexagon, Highlighter, Layers, Moon, Mountain, Orbit, PaintBucket, Paintbrush, Palette, Pencil,
  PenTool, Radar, Radio, Ratio, RotateCw, Rows3, Scan, ScanLine, Scissors, Shuffle, Signal, Slice,
  Snowflake, Sparkles, Spline, Spool, Square, Stamp, Sun, SunMedium, Sunrise, Sunset, Torus, Trees,
  Triangle, Tv, Wallpaper, WandSparkles, Waves, WavesHorizontal, Wind, Zap, ZoomIn,
} from 'lucide-react'
import type { Language } from './lib/types'

/**
 * What each filter looks like in a list, and what it does in one sentence.
 *
 * The Filter Gallery used to be 117 buttons of bare text: you could not tell
 * Fresco from Underpainting without applying both, and the panel beside the
 * grid sat empty until you did. The icon gives each entry a shape to remember,
 * and the sentence goes in that empty panel the moment an entry is selected,
 * so the window teaches the filter instead of only running it.
 *
 * The sentences say what the filter does to the picture, not how it is
 * implemented — "widens the light areas" rather than "a maximum filter".
 */

export type FilterIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

type Entry = { icon: FilterIcon; ko: string; en: string }

const entries: Record<string, Entry> = {
  /* ------------------------------------------------------------- artistic */
  oil: { icon: Brush, ko: '붓자국이 보이도록 색을 뭉쳐 유화처럼 만듭니다.', en: 'Gathers colours into brush strokes, like an oil painting.' },
  coloredPencil: { icon: Pencil, ko: '윤곽을 색연필 선으로 남기고 바탕은 종이처럼 비웁니다.', en: 'Leaves the edges as coloured-pencil lines over bare paper.' },
  cutout: { icon: Scissors, ko: '색을 몇 단계로 줄여 색종이를 오려 붙인 모양으로 만듭니다.', en: 'Cuts the colours down to a few flat shapes, like torn paper.' },
  dryBrush: { icon: Paintbrush, ko: '물기 없는 붓처럼 색을 단순화하면서 질감은 남깁니다.', en: 'Simplifies colour the way a dry brush does, keeping the grain.' },
  filmGrain: { icon: Film, ko: '고른 입자를 얹어 필름으로 찍은 느낌을 줍니다.', en: 'Lays an even grain over the picture, as film would.' },
  fresco: { icon: Palette, ko: '짧고 둥근 붓질로 거칠게 발라 프레스코처럼 만듭니다.', en: 'Daubs the picture in short round strokes, like a fresco.' },
  neonGlow: { icon: Zap, ko: '윤곽을 네온처럼 빛나게 하고 나머지를 어둡게 눌러 줍니다.', en: 'Lights the edges like neon and sinks everything else into dark.' },
  paintDaubs: { icon: Brush, ko: '붓으로 톡톡 찍은 듯한 얼룩으로 색을 뭉칩니다.', en: 'Blots the colour into dabs, as if applied with a loaded brush.' },
  paletteKnife: { icon: Slice, ko: '팔레트 나이프로 펴 바른 듯 넓고 평평한 면을 만듭니다.', en: 'Spreads the colour into broad flat facets, as a palette knife does.' },
  plasticWrap: { icon: Droplets, ko: '표면에 비닐을 씌운 것처럼 반짝이는 주름을 넣습니다.', en: 'Shrink-wraps the picture in a shiny, creased plastic sheen.' },
  posterEdges: { icon: Contrast, ko: '색 단계를 줄이고 윤곽에 검은 선을 그려 포스터처럼 만듭니다.', en: 'Reduces the colours and inks the edges, like a printed poster.' },
  roughPastels: { icon: Highlighter, ko: '거친 종이에 파스텔로 문지른 질감을 입힙니다.', en: 'Rubs the picture on in pastel over a rough paper texture.' },
  smudgeStick: { icon: Feather, ko: '어두운 부분을 문질러 번지게 해 부드럽게 만듭니다.', en: 'Smears the darker areas as a smudge stick would, softening them.' },
  spongeFilter: { icon: Droplets, ko: '스펀지로 찍어 낸 것처럼 얼룩진 색 덩어리를 만듭니다.', en: 'Mottles the colour into blotches, as if dabbed with a sponge.' },
  underpainting: { icon: Layers, ko: '질감 있는 바탕 위에 흐릿하게 밑칠한 층을 만듭니다.', en: 'Lays the picture down as a soft underpainting on a textured ground.' },
  watercolor: { icon: Droplets, ko: '색을 뭉치고 가장자리를 진하게 해 수채화처럼 만듭니다.', en: 'Pools the colour and darkens the edges, the way watercolour dries.' },

  /* ----------------------------------------------------------------- blur */
  gaussian: { icon: Circle, ko: '전체를 고르게 흐려 초점을 뺍니다. 가장 기본이 되는 흐림입니다.', en: 'Softens everything evenly — the ordinary, all-purpose blur.' },
  motion: { icon: WavesHorizontal, ko: '한 방향으로 늘여 움직이는 중에 찍은 것처럼 만듭니다.', en: 'Streaks the picture one way, as if it moved while being taken.' },
  boxBlur: { icon: Square, ko: '네모난 범위의 평균으로 흐립니다. 가우시안보다 각이 집니다.', en: 'Averages over a square, so the softening keeps its corners.' },
  radialSpin: { icon: RotateCw, ko: '가운데를 축으로 돌린 것처럼 원을 그리며 번집니다.', en: 'Spins the blur around the centre, as if the camera turned.' },
  radialZoom: { icon: ZoomIn, ko: '가운데에서 바깥으로 뻗어 나가듯 번집니다.', en: 'Streaks the blur outwards from the centre, as if zooming.' },
  average: { icon: Blend, ko: '전체 평균색 한 가지로 칠합니다. 색을 고를 때 씁니다.', en: 'Fills with the picture’s average colour — useful for sampling it.' },
  blurMore: { icon: CircleDot, ko: '기본 흐림을 몇 배 세게 겁니다.', en: 'The plain blur, several times stronger.' },
  surfaceBlur: { icon: Scan, ko: '윤곽은 남기고 넓은 면만 흐려 잡티를 지웁니다.', en: 'Smooths the flat areas but keeps the edges, so blemishes go.' },
  lensBlur: { icon: Aperture, ko: '렌즈 조리개 모양의 보케를 만들어 배경을 날립니다.', en: 'Blurs with the shape of a lens aperture, for real-looking bokeh.' },
  shapeBlur: { icon: Hexagon, ko: '고른 도형 모양으로 번져 특이한 보케를 만듭니다.', en: 'Spreads the blur in a chosen shape, for an unusual bokeh.' },
  smartBlur: { icon: WandSparkles, ko: '비슷한 색끼리만 흐려 경계는 또렷하게 둡니다.', en: 'Blurs only where the colours already match, leaving edges crisp.' },

  /* ---------------------------------------------------------- blurGallery */
  fieldBlur: { icon: Focus, ko: '지정한 지점들 사이에서 흐림 정도가 서서히 변합니다.', en: 'Varies the blur smoothly between the points you place.' },
  irisBlur: { icon: Aperture, ko: '타원 안은 또렷하고 바깥으로 갈수록 흐려집니다.', en: 'Keeps an oval sharp and softens everything outside it.' },
  tiltShift: { icon: Rows3, ko: '가로 띠만 또렷하게 남겨 미니어처처럼 보이게 합니다.', en: 'Keeps a band sharp and blurs above and below, so it reads as a model.' },
  pathBlur: { icon: Spline, ko: '그린 경로를 따라 방향을 바꾸며 번집니다.', en: 'Streaks along a path you draw, changing direction as it goes.' },

  /* --------------------------------------------------------- brushStrokes */
  accentedEdges: { icon: PenTool, ko: '윤곽을 밝게 강조해 선이 살아나게 합니다.', en: 'Brightens the edges so the outlines stand out.' },
  angledStrokes: { icon: Spline, ko: '밝은 곳과 어두운 곳을 서로 반대 방향으로 그어 냅니다.', en: 'Strokes the lights one way and the darks the other.' },
  crosshatch: { icon: Grid3x3, ko: '연필을 엇갈려 그은 해칭 무늬를 얹습니다.', en: 'Lays crossed pencil hatching over the picture.' },
  darkStrokes: { icon: Moon, ko: '어두운 곳은 짧고 촘촘하게, 밝은 곳은 길게 칠합니다.', en: 'Paints the darks in short tight strokes and the lights in long ones.' },
  inkOutlines: { icon: PenTool, ko: '펜으로 덧그린 듯한 가는 잉크 윤곽을 넣습니다.', en: 'Draws fine ink outlines over the picture, as a pen would.' },
  spatter: { icon: Droplets, ko: '에어브러시로 튀긴 것처럼 픽셀을 흩뿌립니다.', en: 'Spatters the pixels, like paint flicked from a brush.' },
  sprayedStrokes: { icon: Wind, ko: '한 방향으로 뿌린 물감처럼 색을 늘입니다.', en: 'Drags the colour as if sprayed in one direction.' },
  sumie: { icon: Brush, ko: '젖은 종이에 먹이 번진 듯 검고 부드럽게 만듭니다.', en: 'Bleeds the picture into black ink on wet paper, as sumi-e does.' },

  /* --------------------------------------------------------------- distort */
  liquify: { icon: Waves, ko: '손으로 민 것처럼 픽셀을 밀고 당겨 모양을 바꿉니다.', en: 'Pushes and pulls the pixels as if the picture were wet paint.' },
  twirl: { icon: RotateCw, ko: '가운데를 중심으로 소용돌이처럼 비틉니다.', en: 'Twists the picture into a whirlpool around its centre.' },
  ripple: { icon: Waves, ko: '잔물결이 지나간 것처럼 잔잔하게 일렁이게 합니다.', en: 'Ruffles the picture as small ripples would.' },
  wave: { icon: WavesHorizontal, ko: '파도 모양으로 크게 물결치게 합니다.', en: 'Rolls the picture in waves of the size you choose.' },
  spherize: { icon: Circle, ko: '가운데가 공처럼 부풀어 나오게 합니다.', en: 'Bulges the middle out, as if wrapped over a ball.' },
  pinch: { icon: Focus, ko: '가운데를 꼬집듯 안으로 빨아들입니다.', en: 'Pinches the middle inwards, as if squeezed.' },
  displace: { icon: Shuffle, ko: '다른 그림의 밝기를 따라 픽셀을 밀어 옮깁니다.', en: 'Shifts each pixel by the brightness of another picture.' },
  polar: { icon: Orbit, ko: '가로세로 좌표와 원형 좌표를 서로 바꿔 감아 놓습니다.', en: 'Wraps the picture between square and circular coordinates.' },
  shear: { icon: Triangle, ko: '곡선을 따라 좌우로 밀어 기울입니다.', en: 'Slides the rows sideways along a curve, leaning the picture.' },
  zigzag: { icon: Zap, ko: '연못에 돌을 던진 것처럼 동심원으로 일렁이게 합니다.', en: 'Ripples in rings from the centre, like a stone dropped in water.' },
  oceanRipple: { icon: Waves, ko: '물속에서 올려다본 것처럼 불규칙하게 일렁입니다.', en: 'Ruffles the surface as if seen through moving water.' },
  glass: { icon: Blinds, ko: '유리를 통해 보는 것처럼 잘게 어긋나게 합니다.', en: 'Breaks the picture up as if seen through textured glass.' },
  diffuseGlow: { icon: Sunrise, ko: '밝은 곳에 부드러운 빛 번짐을 더합니다.', en: 'Adds a soft glow that spreads out of the bright areas.' },

  /* ---------------------------------------------------------------- neural */
  skinSmooth: { icon: Sparkles, ko: '피부 톤만 골라 결은 남기고 부드럽게 다듬습니다.', en: 'Finds skin tones and smooths them while keeping the texture.' },

  /* ----------------------------------------------------------------- noise */
  addNoise: { icon: Grip, ko: '무작위 점을 뿌려 거칠게 만듭니다.', en: 'Scatters random speckles to roughen the picture up.' },
  median: { icon: Binary, ko: '주변의 중앙값으로 바꿔 점 잡티를 지웁니다.', en: 'Replaces each pixel with its neighbourhood’s middle value, killing specks.' },
  dust: { icon: Snowflake, ko: '스캔한 사진의 먼지와 스크래치를 찾아 지웁니다.', en: 'Finds the dust and scratches of a scan and paints them out.' },
  despeckle: { icon: Scan, ko: '윤곽은 두고 나머지만 살짝 흐려 잡티를 줄입니다.', en: 'Softens everything but the edges, so light speckling fades.' },
  reduceNoise: { icon: Radar, ko: '디테일은 지키면서 화질 저하로 생긴 노이즈를 줄입니다.', en: 'Cuts the noise a sensor leaves while holding on to detail.' },

  /* ----------------------------------------------------------------- other */
  offset: { icon: Shuffle, ko: '그림을 통째로 밀고 밀려난 만큼 반대쪽에서 채웁니다.', en: 'Slides the picture over and wraps what falls off round the other side.' },
  minimum: { icon: Moon, ko: '어두운 부분을 넓혀 밝은 것을 갉아냅니다.', en: 'Grows the dark areas, eating into the light ones.' },
  maximum: { icon: Sun, ko: '밝은 부분을 넓혀 어두운 것을 갉아냅니다.', en: 'Grows the light areas, eating into the dark ones.' },
  hsbHsa: { icon: Palette, ko: '색상·채도·밝기를 빨강·초록·파랑 자리에 바꿔 넣습니다.', en: 'Swaps hue, saturation and brightness into the red, green and blue channels.' },
  lensCorrection: { icon: Camera, ko: '렌즈가 만든 휘어짐과 기울기를 펴 줍니다.', en: 'Straightens the bow and the tilt a lens put into the picture.' },

  /* -------------------------------------------------------------- pixelate */
  mosaic: { icon: Grid3x3, ko: '네모난 칸으로 뭉뚱그려 모자이크를 만듭니다.', en: 'Blocks the picture into big square tiles.' },
  crystallize: { icon: Gem, ko: '다각형 결정 모양으로 색을 뭉칩니다.', en: 'Clumps the colour into polygonal crystals.' },
  colorHalftone: { icon: CircleDot, ko: '인쇄물처럼 색마다 크기가 다른 망점으로 바꿉니다.', en: 'Redraws each colour as printing dots of varying size.' },
  facet: { icon: Diamond, ko: '비슷한 색을 덩어리로 묶어 손으로 칠한 면처럼 만듭니다.', en: 'Groups like colours into facets, as if hand-painted.' },
  fragment: { icon: Boxes, ko: '같은 그림을 조금씩 어긋나게 네 번 겹칩니다.', en: 'Overlays four offset copies, as if the camera shook.' },
  mezzotint: { icon: Spool, ko: '거친 점과 선으로만 이루어진 판화처럼 만듭니다.', en: 'Redraws the picture in coarse dots and lines, like a mezzotint print.' },
  pointillize: { icon: Dices, ko: '점묘화처럼 작은 점을 찍어 그립니다.', en: 'Rebuilds the picture out of small dots, as pointillism does.' },

  /* ------------------------------------------------------------------- raw */
  cameraRaw: { icon: Camera, ko: '노출·대비·색온도 등 13가지 슬라이더로 사진 전체를 조정합니다.', en: 'Thirteen sliders — exposure, contrast, temperature and the rest — over the whole photo.' },

  /* ---------------------------------------------------------------- render */
  clouds: { icon: Cloud, ko: '전경색과 배경색으로 구름 무늬를 새로 그립니다.', en: 'Draws cloud out of the foreground and background colours.' },
  vignette: { icon: Aperture, ko: '가장자리를 어둡게 눌러 가운데로 시선을 모읍니다.', en: 'Darkens the corners so the eye goes to the middle.' },
  lensFlare: { icon: Sun, ko: '렌즈에 빛이 들어온 것처럼 번쩍임을 더합니다.', en: 'Adds the flare a bright light leaves in a lens.' },
  differenceClouds: { icon: CloudSun, ko: '구름 무늬를 반전 합성해 대리석 같은 결을 만듭니다.', en: 'Folds cloud into the picture inverted, for a marbled grain.' },
  fibers: { icon: Spool, ko: '전경색과 배경색으로 가는 섬유 결을 짭니다.', en: 'Weaves fine fibres from the foreground and background colours.' },
  lightingEffects: { icon: SunMedium, ko: '조명을 비춘 것처럼 밝기와 그림자를 다시 만듭니다.', en: 'Relights the picture as if a lamp were aimed at it.' },
  flame: { icon: Flame, ko: '그려 둔 패스를 따라 타오르는 불꽃을 만들어 얹습니다.', en: 'Grows flame along a path you have drawn and lays it over the picture.' },
  tree: { icon: Trees, ko: '가지와 잎을 가진 나무를 만들어 그림 위에 심습니다.', en: 'Grows a tree, branches and leaves, and plants it in the picture.' },
  pictureFrame: { icon: Frame, ko: '그림 둘레에 고를 수 있는 무늬의 액자를 둘러 줍니다.', en: 'Draws a decorative frame, of a pattern you choose, around the picture.' },

  /* --------------------------------------------------------------- sharpen */
  sharpen: { icon: Focus, ko: '윤곽의 대비를 올려 또렷하게 만듭니다.', en: 'Lifts the contrast at the edges so they read as sharp.' },
  unsharp: { icon: Crosshair, ko: '반경과 양을 정해 정교하게 선명도를 올립니다.', en: 'Sharpens with a radius and an amount you choose.' },
  highPass: { icon: ScanLine, ko: '윤곽 정보만 남기고 나머지를 회색으로 눕힙니다. 합성용입니다.', en: 'Keeps only the edge detail and flattens the rest to grey, for blending.' },
  sharpenMore: { icon: Focus, ko: '기본 선명하게를 몇 배 세게 겁니다.', en: 'The plain sharpen, several times stronger.' },
  sharpenEdges: { icon: PenTool, ko: '윤곽만 골라 선명하게 하고 평평한 면은 그대로 둡니다.', en: 'Sharpens the edges only and leaves the flat areas alone.' },
  smartSharpen: { icon: WandSparkles, ko: '노이즈를 덜 키우면서 선명도를 올립니다.', en: 'Sharpens while holding the noise down.' },
  shakeReduction: { icon: Camera, ko: '손떨림으로 생긴 흔들림을 방향을 찾아 되돌립니다.', en: 'Finds the direction of a camera shake and pulls it back.' },

  /* ---------------------------------------------------------------- sketch */
  basRelief: { icon: Mountain, ko: '돌을 얕게 깎아 낸 부조처럼 도드라지게 만듭니다.', en: 'Raises the picture as a shallow carving in stone.' },
  chalkCharcoal: { icon: Pencil, ko: '분필과 목탄으로 밝은 곳과 어두운 곳을 나눠 그립니다.', en: 'Draws the lights in chalk and the darks in charcoal.' },
  charcoal: { icon: Pencil, ko: '굵은 목탄으로 문질러 그린 것처럼 만듭니다.', en: 'Redraws the picture in broad smudged charcoal.' },
  chrome: { icon: Torus, ko: '녹아내린 금속 표면처럼 반사가 흐르게 만듭니다.', en: 'Turns the picture into a poured, reflective metal surface.' },
  conteCrayon: { icon: Highlighter, ko: '콩테 크레용으로 질감 있는 종이에 그린 것처럼 만듭니다.', en: 'Draws in conté crayon on a textured ground.' },
  graphicPen: { icon: PenTool, ko: '가는 펜 선 한 방향만으로 명암을 표현합니다.', en: 'Renders the tones as fine pen strokes all going one way.' },
  halftonePattern: { icon: CircleDot, ko: '망점 무늬만으로 명암을 표현합니다.', en: 'Renders the tones as a halftone screen.' },
  notePaper: { icon: Wallpaper, ko: '종이를 눌러 찍은 듯 요철만 남은 모양으로 만듭니다.', en: 'Presses the picture into paper, leaving only its relief.' },
  photocopy: { icon: Tv, ko: '복사기로 뽑은 것처럼 중간 톤을 날려 버립니다.', en: 'Throws away the midtones, the way a photocopier does.' },
  plaster: { icon: Cylinder, ko: '석고를 부어 굳힌 것처럼 매끄러운 요철로 만듭니다.', en: 'Casts the picture in smooth plaster.' },
  reticulation: { icon: Grip, ko: '필름 유제가 갈라진 것처럼 오돌토돌한 알갱이를 만듭니다.', en: 'Clumps the picture into grain, as film emulsion does when it cracks.' },
  stamp: { icon: Stamp, ko: '고무도장처럼 검정과 흰색 두 단계로만 찍어 냅니다.', en: 'Reduces the picture to black and white, like a rubber stamp.' },
  tornEdges: { icon: Scissors, ko: '찢은 종이를 붙인 것처럼 거친 가장자리를 만듭니다.', en: 'Rebuilds the picture as ragged, torn paper shapes.' },
  waterPaper: { icon: Droplets, ko: '젖은 종이에 번진 것처럼 결을 따라 흐르게 합니다.', en: 'Lets the colour run along the fibres of wet paper.' },

  /* --------------------------------------------------------------- stylize */
  findEdges: { icon: PenTool, ko: '윤곽만 선으로 남기고 나머지를 하얗게 비웁니다.', en: 'Keeps the outlines and empties the rest to white.' },
  emboss: { icon: Mountain, ko: '회색 바탕에 눌러 찍은 듯 도드라지게 만듭니다.', en: 'Stamps the picture in relief on a flat grey.' },
  solarize: { icon: Sunset, ko: '밝은 절반만 반전시켜 인화 중 빛이 샌 효과를 냅니다.', en: 'Inverts the brighter half, as light leaking onto a print does.' },
  diffuse: { icon: Shuffle, ko: '이웃 픽셀끼리 무작위로 자리를 바꿔 흐트러뜨립니다.', en: 'Shuffles neighbouring pixels so the picture looks unsettled.' },
  extrude: { icon: Boxes, ko: '네모 기둥이 앞으로 튀어나온 것처럼 쌓아 올립니다.', en: 'Pushes the picture out into a field of blocks.' },
  tiles: { icon: Grid3x3, ko: '타일로 쪼개 사이를 벌려 놓습니다.', en: 'Breaks the picture into tiles and nudges them apart.' },
  traceContour: { icon: Spline, ko: '같은 밝기끼리 이은 등고선을 그립니다.', en: 'Draws contour lines through pixels of equal brightness.' },
  wind: { icon: Wind, ko: '바람에 날린 것처럼 한쪽으로 가는 선을 뻗습니다.', en: 'Draws fine streaks one way, as if the picture were blown.' },

  /* --------------------------------------------------------------- texture */
  craquelure: { icon: Radar, ko: '오래된 그림처럼 표면에 갈라진 금을 넣습니다.', en: 'Cracks the surface, the way old paint does.' },
  grain: { icon: Grip, ko: '고른 입자를 얹어 질감을 더합니다.', en: 'Adds an even grain for texture.' },
  mosaicTiles: { icon: Grid3x3, ko: '줄눈이 보이는 모자이크 타일을 붙인 것처럼 만듭니다.', en: 'Sets the picture in mosaic tiles with grouting between them.' },
  patchwork: { icon: Columns3, ko: '높이가 다른 정사각형 조각을 이어 붙인 것처럼 만듭니다.', en: 'Quilts the picture out of squares of differing height.' },
  stainedGlass: { icon: Gem, ko: '납선으로 둘린 스테인드글라스 조각으로 나눕니다.', en: 'Divides the picture into leaded stained-glass panes.' },
  texturizer: { icon: Wallpaper, ko: '벽돌·캔버스 같은 질감을 표면에 입힙니다.', en: 'Lays a surface — brick, canvas and the like — over the picture.' },

  /* ----------------------------------------------------------------- video */
  deInterlace: { icon: Signal, ko: '비디오에서 딴 화면의 줄무늬를 없앱니다.', en: 'Removes the comb lines a frame grabbed from video has.' },
  ntscColors: { icon: Radio, ko: '방송으로 내보낼 수 있는 색 범위로 눌러 줍니다.', en: 'Pulls the colours back into what broadcast can carry.' },
}

/** The icon for a filter, or a neutral one if the catalog gains an entry first. */
export function filterIcon(id: string): FilterIcon {
  return entries[id]?.icon ?? Atom
}

/** One sentence on what the filter does, in the reader's language. */
export function filterDescription(language: Language, id: string): string {
  const entry = entries[id]
  if (!entry) return ''
  return language === 'ko' ? entry.ko : entry.en
}

/** Every id described here, for the test that holds this in step with the catalog. */
export const describedFilters = Object.keys(entries)

/** Icon for a filter group's tab. */
const groupIcons: Record<string, FilterIcon> = {
  artistic: Palette,
  blur: Circle,
  blurGallery: Aperture,
  brushStrokes: Brush,
  distort: Waves,
  neural: Sparkles,
  noise: Grip,
  other: Ratio,
  pixelate: Grid3x3,
  raw: Camera,
  render: Cloud,
  sharpen: Focus,
  sketch: Pencil,
  stylize: Zap,
  texture: Wallpaper,
  video: Film,
}

export function filterGroupIcon(group: string): FilterIcon {
  return groupIcons[group] ?? PaintBucket
}
