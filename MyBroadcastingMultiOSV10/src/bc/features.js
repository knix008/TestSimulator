// Every feature of the program (what a complete broadcasting studio offers). The test runner
// (scripts/test.mjs, stage "features") reads the names of the tests that PASSED: a test covers a feature by
// carrying `[F:<id>]` in its name (several allowed). A feature without a passing test fails the run.
//
// status: 'full'      — works as a desktop broadcasting program does;
//         'adapted'   — works, through the platform's own means (browser capture pickers, Web Audio…);
//         'external'  — needs a helper program (FFmpeg) that the app finds or the user points to;
//         'unsupported' — cannot exist on this platform (VST 2 plug-ins in a web view); the test checks that the
//                       program says so plainly instead of failing silently.
// Pure data (node and browser).

const F = (id, area, ko, en, status = 'full') => ({ id, area, ko, en, status });

export const AREAS = ['shell', 'scenes', 'sources', 'transform', 'filters', 'audio', 'transitions', 'studio', 'output', 'stream', 'record', 'replay', 'tools', 'settings', 'hotkeys', 'collections', 'print', 'help'];

export const FEATURES = [
  // ── shell (the MySketchBook look)
  F('shell.start', 'shell', '시작 화면(움직이는 배경·카드)', 'Start page (moving background, cards)'),
  F('shell.menus', 'shell', '메뉴 막대·팝업 메뉴', 'Menu bar and popup menus'),
  F('shell.toolbar', 'shell', '도구 모음(접힘 » 메뉴)', 'Toolbar (folds into »)'),
  F('shell.panels', 'shell', '왼쪽·오른쪽·아래 패널 크기 조절·숨기기', 'Left, right, bottom panels (resize, hide)'),
  F('shell.themes', 'shell', '테마 40종+사용자 정의', '40 themes + custom'),
  F('shell.language', 'shell', '한국어/영어 전환', 'Korean / English'),
  F('shell.statusbar', 'shell', '상태 표시줄(LIVE·REC·CPU·FPS·드롭)', 'Status bar (LIVE, REC, CPU, FPS, drops)'),
  F('shell.undo', 'shell', '실행 취소/다시 실행', 'Undo / Redo'),
  F('shell.messages', 'shell', '메시지·문제 목록', 'Messages and problems'),
  // ── scenes
  F('scene.add', 'scenes', '장면 추가', 'Add scene'),
  F('scene.remove', 'scenes', '장면 삭제', 'Remove scene'),
  F('scene.rename', 'scenes', '장면 이름 바꾸기', 'Rename scene'),
  F('scene.duplicate', 'scenes', '장면 복제', 'Duplicate scene'),
  F('scene.order', 'scenes', '장면 순서 바꾸기', 'Reorder scenes'),
  F('scene.switch', 'scenes', '장면 전환', 'Switch scene'),
  F('scene.nested', 'scenes', '장면을 소스로(중첩 장면)', 'Nested scenes (scene as source)'),
  F('scene.override', 'scenes', '장면별 전환 효과 재정의', 'Per-scene transition override'),
  F('scene.filters', 'scenes', '장면 필터', 'Scene filters'),
  F('scene.screenshot', 'scenes', '장면/소스 스크린샷', 'Screenshot of scene / source'),
  // ── sources
  F('src.display', 'sources', '디스플레이 캡처', 'Display capture', 'adapted'),
  F('src.window', 'sources', '창 캡처', 'Window capture', 'adapted'),
  F('src.game', 'sources', '게임 캡처', 'Game capture', 'adapted'),
  F('src.camera', 'sources', '비디오 캡처 장치(웹캠)', 'Video capture device'),
  F('src.micInput', 'sources', '오디오 입력 캡처(마이크)', 'Audio input capture'),
  F('src.audioOutput', 'sources', '오디오 출력 캡처(데스크톱 소리)', 'Audio output capture', 'adapted'),
  F('src.appAudio', 'sources', '응용 프로그램 오디오 캡처', 'Application audio capture', 'adapted'),
  F('src.image', 'sources', '이미지', 'Image'),
  F('src.slideshow', 'sources', '이미지 슬라이드 쇼', 'Image slide show'),
  F('src.media', 'sources', '미디어 소스(파일·URL·HLS)', 'Media source (file, URL, HLS)'),
  F('src.playlist', 'sources', 'VLC 비디오 소스(재생 목록)', 'VLC video source (playlist)'),
  F('src.browser', 'sources', '브라우저 소스(HTML/CSS)', 'Browser source (HTML/CSS)', 'adapted'),
  F('src.text', 'sources', '텍스트(외곽선·그림자·그라디언트·파일·채팅 로그·시계·카운트다운)', 'Text (outline, shadow, gradient, file, chat log, clock, countdown)'),
  F('src.color', 'sources', '색 소스', 'Color source'),
  F('src.group', 'sources', '그룹 / 그룹 해제', 'Group / ungroup'),
  F('src.properties', 'sources', '소스 속성 편집', 'Source properties'),
  F('src.rename', 'sources', '소스 이름 바꾸기', 'Rename source'),
  F('src.visibility', 'sources', '보이기/숨기기·잠금', 'Show / hide, lock'),
  F('src.order', 'sources', '순서(위·아래·맨 위·맨 아래)', 'Order (up, down, top, bottom)'),
  F('src.copyPaste', 'sources', '복사/붙여넣기(참조·복제)', 'Copy / paste (reference, duplicate)'),
  F('src.existing', 'sources', '기존 소스 추가', 'Add existing source'),
  F('src.showHideTransition', 'sources', '보이기/숨기기 전환 효과', 'Show / hide transitions'),
  F('src.mediaControls', 'sources', '미디어 제어(재생·일시정지·정지·탐색·다음·이전)', 'Media controls (play, pause, stop, seek, next, previous)'),
  F('src.interact', 'sources', '상호작용(브라우저 소스)', 'Interact (browser source)', 'adapted'),
  F('src.missingFiles', 'sources', '없는 파일 찾기', 'Missing files'),
  // ── transform
  F('tr.move', 'transform', '끌어서 이동·크기·회전', 'Drag to move, resize, rotate'),
  F('tr.crop', 'transform', 'Alt+끌기 자르기', 'Alt+drag crop'),
  F('tr.edit', 'transform', '변환 편집 창(위치·회전·크기·정렬·경계 상자·자르기)', 'Edit transform (position, rotation, size, alignment, bounds, crop)'),
  F('tr.fit', 'transform', '화면 맞춤·늘이기·가운데', 'Fit, stretch, center to screen'),
  F('tr.flipRotate', 'transform', '좌우/상하 뒤집기·90° 회전', 'Flip and rotate 90°'),
  F('tr.copyPaste', 'transform', '변환 복사/붙여넣기', 'Copy / paste transform'),
  F('tr.snap', 'transform', '맞춤(가장자리·가운데·다른 소스)', 'Snapping (edges, center, sources)'),
  F('tr.blend', 'transform', '혼합 모드·크기 조정 필터', 'Blend mode, scale filtering'),
  F('tr.nudge', 'transform', '화살표 키 미세 이동', 'Arrow-key nudge'),
  // ── filters
  F('flt.lut', 'filters', 'LUT 적용(.cube/.png)', 'Apply LUT'),
  F('flt.chroma', 'filters', '크로마 키', 'Chroma key'),
  F('flt.color', 'filters', '색 보정', 'Color correction'),
  F('flt.colorKey', 'filters', '색 키', 'Color key'),
  F('flt.crop', 'filters', '자르기/여백', 'Crop / pad'),
  F('flt.mask', 'filters', '이미지 마스크/혼합', 'Image mask / blend'),
  F('flt.luma', 'filters', '루마 키', 'Luma key'),
  F('flt.delay', 'filters', '렌더 지연·비디오 지연', 'Render delay, video delay'),
  F('flt.scale', 'filters', '크기 조정/종횡비', 'Scaling / aspect ratio'),
  F('flt.scroll', 'filters', '스크롤', 'Scroll'),
  F('flt.sharpen', 'filters', '선명하게', 'Sharpen'),
  F('flt.tonemap', 'filters', 'HDR 톤 매핑', 'HDR tone mapping'),
  F('flt.blur', 'filters', '흐림·모자이크', 'Blur, pixelate'),
  F('flt.gain', 'filters', '게인', 'Gain'),
  F('flt.gate', 'filters', '노이즈 게이트', 'Noise gate'),
  F('flt.noise', 'filters', '소음 억제', 'Noise suppression'),
  F('flt.compressor', 'filters', '압축기(사이드체인 더킹)', 'Compressor (side-chain ducking)'),
  F('flt.limiter', 'filters', '리미터', 'Limiter'),
  F('flt.expander', 'filters', '익스팬더', 'Expander'),
  F('flt.upward', 'filters', '상향 압축기', 'Upward compressor'),
  F('flt.eq', 'filters', '3밴드 이퀄라이저', '3-band equalizer'),
  F('flt.invert', 'filters', '극성 반전', 'Invert polarity'),
  F('flt.vst', 'filters', 'VST 2.x 플러그인', 'VST 2.x plug-in', 'unsupported'),
  F('flt.manage', 'filters', '필터 추가·삭제·순서·켜고 끄기·복사/붙여넣기', 'Add, remove, order, toggle, copy / paste filters'),
  // ── audio
  F('aud.mixer', 'audio', '오디오 믹서(음량 막대·dB 미터)', 'Audio mixer (faders, dB meters)'),
  F('aud.mute', 'audio', '음소거', 'Mute'),
  F('aud.monitor', 'audio', '모니터링(끄기·모니터만·모니터와 출력)', 'Monitoring (off, monitor only, monitor and output)'),
  F('aud.advanced', 'audio', '고급 오디오 속성(밸런스·싱크 오프셋·모노·트랙)', 'Advanced audio properties (balance, sync offset, mono, tracks)'),
  F('aud.tracks', 'audio', '오디오 트랙 1–6', 'Audio tracks 1–6'),
  F('aud.ptt', 'audio', '눌러서 말하기/눌러서 음소거', 'Push-to-talk / push-to-mute'),
  F('aud.global', 'audio', '전역 오디오 장치(데스크톱·마이크)', 'Global audio devices'),
  F('aud.layout', 'audio', '믹서 가로/세로 배치·숨기기', 'Mixer horizontal / vertical, hide'),
  F('aud.meterTypes', 'audio', '미터 감쇠·피크 표시', 'Meter decay and peak'),
  // ── transitions
  F('trn.cut', 'transitions', '컷', 'Cut'),
  F('trn.fade', 'transitions', '페이드', 'Fade'),
  F('trn.swipe', 'transitions', '스와이프', 'Swipe'),
  F('trn.slide', 'transitions', '슬라이드', 'Slide'),
  F('trn.stinger', 'transitions', '스팅어(트랙 매트)', 'Stinger (track matte)'),
  F('trn.fadeColor', 'transitions', '색으로 페이드', 'Fade to color'),
  F('trn.luma', 'transitions', '루마 와이프(16 패턴)', 'Luma wipe (16 patterns)'),
  F('trn.manage', 'transitions', '전환 추가·삭제·이름·길이', 'Add, remove, rename, duration'),
  // ── studio
  F('std.mode', 'studio', '스튜디오 모드(미리 보기/프로그램)', 'Studio mode (preview / program)'),
  F('std.tbar', 'studio', 'T-바', 'T-bar'),
  F('std.quick', 'studio', '빠른 전환 버튼', 'Quick transitions'),
  F('std.swap', 'studio', '전환 후 장면 바꾸기·장면 복제 옵션', 'Swap scenes, duplicate scene option'),
  F('std.multiview', 'studio', '멀티뷰', 'Multiview'),
  F('std.projector', 'studio', '프로젝터(창·전체 화면: 미리 보기·프로그램·장면·소스·멀티뷰)', 'Projectors (window / full screen)'),
  // ── outputs
  F('out.encoders', 'output', '인코더(H.264·HEVC·AV1·VP9 / AAC·Opus, CBR·VBR·CQP)', 'Encoders (H.264, HEVC, AV1, VP9 / AAC, Opus; CBR, VBR, CQP)'),
  F('out.simpleAdvanced', 'output', '출력 모드 단순/고급', 'Output mode simple / advanced'),
  F('out.scaling', 'output', '출력 해상도·축소 필터·FPS', 'Output resolution, downscale filter, FPS'),
  F('rec.start', 'record', '녹화 시작/중지', 'Start / stop recording'),
  F('rec.pause', 'record', '녹화 일시정지', 'Pause recording'),
  F('rec.formats', 'record', '형식(MP4·MOV·MKV·WebM·조각 MP4)', 'Formats (MP4, MOV, MKV, WebM, fragmented MP4)'),
  F('rec.filename', 'record', '파일 이름 형식·덮어쓰기', 'File name format, overwrite'),
  F('rec.split', 'record', '자동 분할(시간·크기)·수동 분할', 'Automatic split (time, size), manual split'),
  F('rec.chapter', 'record', '챕터 표시 추가', 'Add chapter marker'),
  F('rec.multitrack', 'record', '다중 오디오 트랙 녹화', 'Multi-track audio recording'),
  F('rec.remux', 'record', '녹화 리먹스(MP4·MOV·FLV·TS)', 'Remux recordings', 'external'),
  F('str.start', 'stream', '방송 시작/중지', 'Start / stop streaming', 'external'),
  F('str.services', 'stream', '서비스(Twitch·YouTube·치지직·SOOP·Kick·Facebook·사용자 지정)', 'Services (Twitch, YouTube, Chzzk, SOOP, Kick, Facebook, custom)'),
  F('str.protocols', 'stream', '프로토콜(RTMP·RTMPS·SRT·RIST·WHIP)', 'Protocols (RTMP, RTMPS, SRT, RIST, WHIP)'),
  F('str.direct', 'stream', '직접 시청(스트림 키 없이 시청자가 이 프로그램에 접속해서 봄)', 'Direct viewing (viewers connect to this program, no stream key)', 'adapted'),
  F('str.account', 'stream', '방송 서비스 계정 연결(Twitch·YouTube, 사용자 Client ID 로 스트림 키 받기)', 'Connect a streaming account (Twitch, YouTube: the stream key with your own Client ID)'),
  F('str.delay', 'stream', '방송 지연', 'Stream delay'),
  F('str.reconnect', 'stream', '자동 다시 연결', 'Automatic reconnect'),
  F('str.bandwidth', 'stream', '대역폭 시험 모드', 'Bandwidth test mode'),
  F('rpl.buffer', 'replay', '리플레이 버퍼(시간·크기 한도)', 'Replay buffer (time, size limits)'),
  F('rpl.save', 'replay', '리플레이 저장', 'Save replay'),
  F('out.virtualcam', 'output', '가상 카메라(로컬 출력 스트림)', 'Virtual camera (local output stream)', 'adapted'),
  // ── tools
  F('tool.stats', 'tools', '통계(FPS·렌더 시간·드롭·비트레이트·디스크)', 'Stats (FPS, render time, drops, bitrate, disk)'),
  F('tool.log', 'tools', '로그 보기·저장', 'Log viewer, save log'),
  F('tool.autoconfig', 'tools', '자동 구성 마법사', 'Auto-configuration wizard'),
  F('tool.outputTimer', 'tools', '출력 타이머', 'Output timer'),
  F('tool.sceneSwitcher', 'tools', '자동 장면 전환기(시간·순환)', 'Automatic scene switcher (time, rotation)'),
  F('tool.scripts', 'tools', '스크립트(JavaScript)', 'Scripts (JavaScript)', 'adapted'),
  F('tool.captions', 'tools', '자막(음성 인식)', 'Captions (speech recognition)', 'adapted'),
  F('tool.websocket', 'tools', '원격 제어(WebSocket, 원격 제어 규약 5판)', 'Remote control (WebSocket, remote-control protocol 5)'),
  // ── settings, hotkeys, collections
  F('set.general', 'settings', '일반 설정(확인 창·스냅·프로젝터)', 'General settings'),
  F('set.stream', 'settings', '방송 설정', 'Stream settings'),
  F('set.output', 'settings', '출력 설정', 'Output settings'),
  F('set.audio', 'settings', '오디오 설정(샘플레이트·채널)', 'Audio settings (sample rate, channels)'),
  F('set.video', 'settings', '비디오 설정(기본/출력 해상도·FPS)', 'Video settings (base / output resolution, FPS)'),
  F('set.advanced', 'settings', '고급 설정', 'Advanced settings'),
  F('set.accessibility', 'settings', '접근성(선택 색·미터 색)', 'Accessibility (selection and meter colours)'),
  F('hk.bind', 'hotkeys', '단축키 지정(모든 동작)', 'Bind hotkeys (all actions)'),
  F('hk.global', 'hotkeys', '전역 단축키(창이 뒤에 있어도)', 'Global hotkeys (window in background)'),
  F('col.manage', 'collections', '장면 모음 새로 만들기·복제·이름·삭제·전환', 'Scene collections: new, duplicate, rename, remove, switch'),
  F('col.importExport', 'collections', '장면 모음 가져오기/내보내기(공용 장면 파일 .json 포함)', 'Import / export scene collections (common scene files, .json, too)'),
  F('col.profiles', 'collections', '프로필 새로 만들기·복제·이름·삭제·전환·가져오기/내보내기', 'Profiles: new, duplicate, rename, remove, switch, import / export'),
  // ── print, help
  F('print.reports', 'print', '보고서 인쇄(장면 구성·소스 목록·오디오·단축키·세션 기록·출력 설정)', 'Printed reports (scenes, sources, audio, hotkeys, session log, output settings)'),
  F('print.pdf', 'print', 'PDF로 저장·미리 보기', 'Save as PDF, preview'),
  F('help.tutorial', 'help', '튜토리얼', 'Tutorial'),
  F('help.guide', 'help', '사용 설명서·튜토리얼 문서', "User's guide and tutorial documents"),
  F('help.samples', 'help', '예제 장면 모음', 'Sample scene collections'),
  F('help.about', 'help', '프로그램 정보', 'About'),
];

export const FEATURE_IDS = FEATURES.map((f) => f.id);

/** Feature ids a test name claims: "[F:scene.add] [F:scene.remove] …". */
export function featuresIn(name) {
  return [...String(name).matchAll(/\[F:([\w.]+)\]/g)].map((m) => m[1]);
}

/** Which features passing tests cover, which have none, and tags that name no feature. */
export function coverage(passedNames, failedNames = []) {
  const covered = new Map();
  for (const name of passedNames) for (const id of featuresIn(name)) covered.set(id, (covered.get(id) ?? 0) + 1);
  const failed = new Set(failedNames.flatMap(featuresIn));
  const known = new Set(FEATURE_IDS);
  return {
    total: FEATURES.length,
    covered: FEATURES.filter((f) => covered.has(f.id) && !failed.has(f.id)),
    missing: FEATURES.filter((f) => !covered.has(f.id)),
    failing: FEATURES.filter((f) => failed.has(f.id)),
    unknown: [...new Set([...passedNames, ...failedNames].flatMap(featuresIn))].filter((id) => !known.has(id)),
    counts: covered,
  };
}
