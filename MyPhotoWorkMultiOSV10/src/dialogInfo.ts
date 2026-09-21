import type { Language } from './lib/types'

/**
 * One line under each window's title saying what the window is for.
 *
 * Seventy-five windows carried a name and nothing else: "Apply Image",
 * "Calculations", "Fade" and "Statistics" are all accurate titles and none of
 * them tells you what pressing Apply would do. Only Adaptive Wide Angle
 * explained itself, and the space under the title was empty everywhere else.
 *
 * The sentences say what happens to the picture, not how it is done, and they
 * are short enough to read before the eye moves on to the controls.
 */

type Entry = { ko: string; en: string }

const entries: Record<string, Entry> = {
  /* ------------------------------------------------------------- the file */
  new: { ko: '크기·배경·해상도를 정해 빈 문서를 만듭니다.', en: 'Starts an empty document at the size, background and resolution you set.' },
  export: { ko: '보이는 그대로를 그림 파일 한 장으로 내보냅니다.', en: 'Writes what you see as one picture file.' },
  exportAs: { ko: '형식·품질·배율·투명도를 정해 내보냅니다.', en: 'Writes the picture with the format, quality, scale and transparency you choose.' },
  imageProcessor: { ko: '폴더 하나의 사진을 모두 같은 설정으로 변환해 저장합니다.', en: 'Converts a whole folder of photographs with one set of settings.' },
  contactSheet: { ko: '여러 사진을 격자로 늘어놓은 한 장을 만듭니다.', en: 'Lays a set of pictures out as one sheet of thumbnails.' },
  print: { ko: '용지 방향과 여백을 정하고 미리 보고 인쇄합니다.', en: 'Sets the paper up, shows the page and prints it.' },
  openRecent: { ko: '최근에 연 파일을 다시 엽니다.', en: 'Reopens a file you had open recently.' },
  imageInfo: { ko: '파일·문서·픽셀·촬영 정보를 한자리에 모아 보여줍니다.', en: 'Gathers what the file, the document, the pixels and the camera have to say.' },
  about: { ko: '판번호와 빌드 정보를 보여주고 한 번에 복사합니다.', en: 'The version and build details, copied in one click.' },
  helpGuide: { ko: '도구와 명령의 사용법을 설명합니다.', en: 'Explains the tools and what the commands do.' },
  unsaved: { ko: '저장하지 않은 변경이 있습니다. 저장할지 버릴지 고릅니다.', en: 'There are unsaved changes: keep them or let them go.' },
  error: { ko: '무엇이 잘못됐는지와 보고에 쓸 세부 정보를 보여줍니다.', en: 'What went wrong, with the details a bug report needs.' },
  namePrompt: { ko: '저장할 항목에 붙일 이름을 입력합니다.', en: 'Asks what to call the thing you are about to save.' },
  statistics: { ko: '밝기·색·분포 등 그림의 수치를 알려줍니다.', en: 'What the picture measures: brightness, colour and how they are spread.' },

  /* --------------------------------------------------------- size and shape */
  imageSize: { ko: '그림 자체의 픽셀 수를 바꿉니다. 내용이 함께 늘거나 줄어듭니다.', en: 'Changes how many pixels the picture has; the content grows or shrinks with it.' },
  canvasSize: { ko: '그림은 그대로 두고 주변 여백만 넓히거나 잘라냅니다.', en: 'Adds or trims room around the picture without resizing what is in it.' },
  fitImage: { ko: '비율을 지키면서 정한 크기 안에 들어가도록 줄입니다.', en: 'Shrinks the picture to fit inside a size you give, keeping its proportions.' },
  rotateArbitrary: { ko: '원하는 각도만큼 문서 전체를 돌립니다.', en: 'Turns the whole document by the angle you type.' },
  contentScale: { ko: '사람과 중요한 부분은 지키면서 나머지만 늘이거나 줄입니다.', en: 'Stretches the picture but spares the people and the parts that matter.' },
  transformSelection: { ko: '픽셀은 두고 선택 영역의 모양만 옮기고 키웁니다.', en: 'Moves and resizes the selection itself, leaving the pixels alone.' },
  skew: { ko: '가로세로로 밀어 평행사변형처럼 기울입니다.', en: 'Leans the picture over, sliding one side against the other.' },
  perspective: { ko: '멀어지는 쪽을 좁혀 원근이 있는 것처럼 만듭니다.', en: 'Narrows one end so the picture reads as receding.' },
  perspectiveWarp: { ko: '격자를 씌워 건물의 원근을 다시 세웁니다.', en: 'Lays a grid over the picture so a building’s perspective can be rebuilt.' },
  warp: { ko: '휘어짐·아치·물결 같은 모양으로 구부립니다.', en: 'Bends the picture into an arc, a wave or one of the other warps.' },
  distort: { ko: '네 모서리를 따로 끌어 자유롭게 일그러뜨립니다.', en: 'Drags each of the four corners on its own.' },
  vanishingPoint: { ko: '면의 원근을 정해 두고 그 면을 따라 복제하거나 붙여 넣습니다.', en: 'Marks out a plane so cloning and pasting follow its perspective.' },
  adaptiveWideAngle: { ko: '어안·광각 왜곡을 펴고 수직·수평을 바로잡습니다.', en: 'Straightens fisheye and wide-angle distortion and squares up verticals.' },
  lensCorrection: { ko: '렌즈가 만든 휘어짐·비네팅·색수차를 바로잡습니다.', en: 'Corrects the bow, the dark corners and the colour fringing a lens leaves.' },
  threeD: { ko: '평면 레이어를 두께가 있는 입체로 밀어냅니다.', en: 'Pushes a flat layer out into something with depth.' },

  /* ------------------------------------------------------------ the colours */
  brightness: { ko: '전체를 밝게·어둡게 하고 대비를 올리거나 내립니다.', en: 'Lifts or drops the brightness and the contrast of the whole picture.' },
  levels: { ko: '검정·감마·흰색 지점을 옮겨 명암 범위를 다시 잡습니다.', en: 'Resets where black, mid grey and white fall in the picture.' },
  curves: { ko: '곡선을 구부려 밝기 구간마다 다르게 조정합니다.', en: 'Bends a curve so each range of brightness moves by a different amount.' },
  hue: { ko: '색상을 돌리고 채도와 밝기를 조절합니다.', en: 'Turns the colours around the wheel and adjusts how strong and light they are.' },
  channelMixer: { ko: '빨강·초록·파랑 채널을 서로 섞습니다.', en: 'Mixes the red, green and blue channels into one another.' },
  selectiveColor: { ko: '고른 색 계열만 골라 잉크 양을 조절합니다.', en: 'Adjusts the ink in one family of colours and leaves the rest.' },
  replaceColor: { ko: '고른 색과 비슷한 부분만 찾아 다른 색으로 바꿉니다.', en: 'Finds everything like one colour and makes it another.' },
  colorRange: { ko: '색을 기준으로 선택 영역을 만듭니다.', en: 'Builds a selection out of the colours you pick.' },
  gradientMap: { ko: '어두운 곳부터 밝은 곳까지를 그레이디언트 색으로 바꿉니다.', en: 'Maps dark to light onto the colours of a gradient.' },
  duotone: { ko: '한두 가지 잉크만으로 인쇄한 것처럼 만듭니다.', en: 'Prints the picture in one or two inks.' },
  indexed: { ko: '쓰는 색의 개수를 정해진 수로 줄입니다.', en: 'Cuts the picture down to a fixed number of colours.' },
  colorProfile: { ko: '색이 어떻게 해석될지 정하는 프로파일을 지정하거나 변환합니다.', en: 'Assigns or converts the profile that says how the colours are read.' },
  lut: { ko: '미리 만들어진 색 표를 씌워 분위기를 바꿉니다.', en: 'Puts a ready-made colour table over the picture.' },
  hdrToning: { ko: '넓은 밝기 범위를 화면에서 볼 수 있는 범위로 눌러 담습니다.', en: 'Squeezes a wide range of brightness into what a screen can show.' },
  matchColor: { ko: '다른 사진의 색감을 이 사진에 옮겨 옵니다.', en: 'Brings the colour of another photograph over to this one.' },
  cameraRaw: { ko: '노출·대비·색온도 등 13가지 슬라이더로 사진 전체를 조정합니다.', en: 'Thirteen sliders over the whole photograph: exposure, contrast, temperature and the rest.' },
  adjustment: { ko: '픽셀을 건드리지 않고 위에 얹어 조정하는 레이어를 만듭니다.', en: 'Makes a layer that adjusts what is below it without touching those pixels.' },

  /* ------------------------------------------------------------ the filters */
  blur: { ko: '정한 반경만큼 고르게 흐립니다.', en: 'Softens the picture evenly, by the radius you set.' },
  sharpen: { ko: '윤곽의 대비를 올려 또렷하게 만듭니다.', en: 'Lifts the contrast at the edges so they read as sharp.' },
  filterGallery: { ko: '회화·스케치·질감 등 117가지 필터를 미리 보며 고릅니다.', en: 'Browse and preview all 117 filters, from painterly to sketch to texture.' },
  filterParams: { ko: '고른 필터의 세기와 반경을 정합니다.', en: 'Sets the strength and radius of the filter you chose.' },
  blurGallery: { ko: '초점이 남는 자리를 정해 나머지를 흐립니다.', en: 'Chooses what stays in focus and blurs the rest.' },
  customFilter: { ko: '숫자를 직접 넣어 나만의 컨볼루션 필터를 만듭니다.', en: 'Builds a filter of your own out of the numbers you type.' },
  neural: { ko: '피부·색상화·확대 등 이 기기에서 도는 알고리즘을 적용합니다.', en: 'Skin, colourising, enlarging and the rest, all running on this machine.' },
  neuralModels: { ko: '뉴럴 기능이 쓸 모델을 내려받거나 지웁니다.', en: 'Downloads and removes the models the neural commands use.' },
  fade: { ko: '방금 한 작업의 세기와 혼합 방식을 되돌아가 조절합니다.', en: 'Goes back and eases off what you just did, or blends it differently.' },
  applyImage: { ko: '다른 레이어나 채널을 골라 이 레이어에 합성합니다.', en: 'Blends another layer or channel into this one.' },
  calculations: { ko: '두 채널을 계산해 새 채널이나 선택 영역을 만듭니다.', en: 'Combines two channels into a new channel or a selection.' },
  photomerge: { ko: '여러 장을 이어 붙여 파노라마를 만듭니다.', en: 'Stitches several frames into one panorama.' },
  skyReplace: { ko: '하늘을 찾아 다른 하늘로 바꾸고 색을 맞춥니다.', en: 'Finds the sky, puts another one in and matches the colour to it.' },

  /* --------------------------------------------------------- the selections */
  feather: { ko: '선택 영역의 가장자리를 부드럽게 만듭니다.', en: 'Softens the edge of the selection.' },
  selectModify: { ko: '선택 영역을 넓히거나 좁히고, 테두리만 남기거나 다듬습니다.', en: 'Grows, shrinks, smooths the selection or keeps just its border.' },
  saveSelection: { ko: '지금 선택 영역을 이름 붙여 저장합니다.', en: 'Keeps the current selection under a name.' },
  loadSelection: { ko: '저장해 둔 선택 영역을 불러옵니다.', en: 'Brings back a selection you saved.' },
  selectAndMask: { ko: '머리카락 같은 가장자리를 다듬어 선택을 정교하게 만듭니다.', en: 'Refines an edge — hair and fur especially — into a usable selection.' },

  /* ------------------------------------------------------- layers and paint */
  fill: { ko: '선택 영역을 색이나 패턴으로 채웁니다.', en: 'Fills the selection with a colour or a pattern.' },
  stroke: { ko: '선택 영역의 테두리를 따라 선을 그립니다.', en: 'Draws a line along the edge of the selection.' },
  layerStyle: { ko: '그림자·광선·테두리 같은 효과를 레이어에 입힙니다.', en: 'Puts shadows, glows and outlines on the layer.' },
  gradientEditor: { ko: '그레이디언트의 색 지점과 투명도를 직접 만듭니다.', en: 'Builds a gradient: its colour stops and where it fades.' },

  /* ---------------------------------------------------------------- the text */
  text: { ko: '글자 내용과 글꼴·크기·정렬을 정합니다.', en: 'The words, and the typeface, size and alignment they are set in.' },
  findReplace: { ko: '텍스트 레이어에서 글자를 찾아 바꿉니다.', en: 'Finds words in the text layers and replaces them.' },
  checkSpelling: { ko: '텍스트 레이어의 철자를 훑어봅니다.', en: 'Looks over the spelling in the text layers.' },

  /* ------------------------------------------------------- the view and setup */
  newGuide: { ko: '정한 위치에 안내선을 하나 놓습니다.', en: 'Puts one guide at a position you give.' },
  guideLayout: { ko: '여러 안내선을 한 번에 균등하게 배치합니다.', en: 'Lays a whole set of evenly spaced guides down at once.' },
  note: { ko: '그림 위에 메모를 남깁니다.', en: 'Leaves a note on the picture.' },
  keyboardShortcuts: { ko: '도구를 고르는 한 글자 단축키를 바꿉니다.', en: 'Rebinds the single-letter keys that pick the tools.' },
  removeBg: { ko: '피사체를 남기고 배경을 지웁니다. 어떤 방식으로 찾을지 고를 수 있고, 없는 모델은 여기서 바로 내려받습니다.', en: 'Cuts the subject out and clears the background; choose how it is found, and fetch the model here if it is missing.' },
  modelSetup: { ko: '더 정확한 결과를 위해 내려받아 둘 모델을 안내합니다. 받지 않아도 내장 알고리즘으로 동작합니다.', en: 'The models worth having for better results. Everything still works without them, on the built-in algorithms.' },
  settings: { ko: '언어·테마·도구 기본값·내보내기·엔진 값을 정합니다.', en: 'Language, theme, tool defaults, export and the engine’s own numbers.' },
}

/** One sentence on what the window is for, in the reader's language. */
export function dialogDescription(language: Language, name: string): string {
  const entry = entries[name]
  if (!entry) return ''
  return language === 'ko' ? entry.ko : entry.en
}

/** Every window described here, for the test that keeps this in step. */
export const describedDialogs = Object.keys(entries)
