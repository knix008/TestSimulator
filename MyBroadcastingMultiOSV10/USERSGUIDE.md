# MyBroadcasting User's Guide

<!-- lang:ko -->
## 한국어

### 무엇을 하는 프로그램인가요

MyBroadcasting 은 개인 방송 스튜디오입니다. 화면·창·게임·웹캠·마이크·동영상·그림·웹 페이지·글자를 **소스**로 모아 **장면**을 꾸미고, 영상·오디오 **필터**를 걸고, **오디오 믹서**로 소리를 맞춘 다음, **전환 효과**나 **스튜디오 모드**로 장면을 바꾸며 **녹화**하거나 **방송**합니다. Windows · macOS · Linux 데스크톱 앱과 웹 브라우저에서 같은 화면으로 씁니다. 다른 방송 프로그램의 장면 파일(.json)도 그대로 가져올 수 있습니다.

### 설치와 실행

- Windows: `MyBroadcasting-Setup-<버전>.exe` 를 실행하고 설치 언어(한국어 / English)를 고릅니다. 이전 판이 있으면 지우고 다시 설치할지, 사용자 데이터를 지울지 묻습니다(녹화 파일은 건드리지 않습니다).
- macOS · Linux: `.dmg`, `.deb`, `.rpm`, `.AppImage` 꾸러미를 설치합니다.
- 웹: 같은 프로그램을 브라우저(Edge · Chrome 권장)에서 엽니다. 웹 판의 RTMP 방송에는 중계 서버(`npm run relay`)가 필요합니다.
- RTMP · RTMPS · SRT · RIST 방송, 녹화 리먹스, 챕터 넣기에는 **FFmpeg** 가 쓰입니다. PATH 에 있으면 저절로 찾고, 없으면 설정 › 고급 › FFmpeg 에서 위치를 정합니다. WHIP(WebRTC) 방송과 녹화·리플레이는 FFmpeg 없이 됩니다.

### 화면 구성

| 부분 | 하는 일 |
| --- | --- |
| 메뉴 막대 | 시작 단추, 파일 · 편집 · 장면 · 소스 · 방송 · 보기 · 도구 · 도움말, 장면 모음 이름, LIVE/REC 표시, 패널 단추, 창 단추 |
| 툴바 | 장면 모음·프로필, 실행 취소, 장면·소스 추가, 방송·녹화·일시정지·리플레이·가상 카메라·스크린샷, 스튜디오 모드·멀티뷰·안전 영역·미리 보기 잠금·맞춤·프로젝터, 통계·로그·자동 구성. 좁으면 뒤쪽이 » 메뉴로 들어갑니다 |
| 왼쪽 패널 | 위: 장면 목록 · 아래: 고른 장면의 소스(그룹은 접고 펼칩니다) · 맨 아래: **빠른 추가**(웹캠 · 화면 · 창 · 이미지 · 텍스트 · 미디어 · 브라우저 · 단색, 머리줄로 접기) |
| 가운데 | 미리 보기 (스튜디오 모드: 미리 보기 · 전환 단추와 T-바 · 프로그램 / 멀티뷰) |
| 오른쪽 패널 | 고른 소스의 속성 · 필터 · 변환 · 오디오. 아무것도 고르지 않으면 **현황판**: 지금 송출 중인 장면과 전환, 방송 · 녹화 · 리플레이 버퍼 · 가상 카메라의 상태와 시작/중지 단추, FPS · 렌더 시간 · 놓친 프레임 · CPU · 메모리 |
| 아래 패널 | 오디오 믹서(소스마다 카드: 이름 · 미터 · 페이더 · 음소거 · 모니터) · 전환 효과 · 방송 제어 · 미디어 · 통계 · 메시지 · 문제 |
| 상태 표시줄 | 방송·녹화 시간, 비트레이트와 드롭 프레임, FPS·렌더 시간, CPU, 문제 수, 테마, 언어, 시계 |

### 시작 화면

새 장면 모음, 가져오기, 이어서 하기, 자동 구성 마법사, 튜토리얼이 있습니다. **장면 모음과 최근 파일** 카드에서 저장된 장면 모음을 바로 엽니다. **예제 장면 모음**(토크쇼 · 게임 · 강의 · 음악 · 뉴스 · 카운트다운)은 눌러서 열어 보세요. 배경은 16가지 움직이는 그림이나 직접 고른 그림을 씁니다. 카드는 끌어서 옮기고 모서리로 크기를 바꿉니다.

### 장면과 소스

- **장면 추가**: 장면 목록의 + 단추. 장면을 누르면 그 장면으로 전환합니다(스튜디오 모드에서는 미리 보기로 갑니다). 끌어서 순서를 바꾸고, 오른쪽 클릭으로 복제 · 이름 바꾸기 · 삭제 · 필터 · 스크린샷 · 프로젝터를 씁니다.
- **소스 추가**: 소스 목록의 + 단추에서 종류를 고릅니다. 같은 소스를 여러 장면에서 쓰려면 **기존 소스 추가**를 고릅니다. 다른 장면을 소스로 넣을 수도 있습니다(중첩 장면). 그림·동영상·소리·HTML 파일을 창에 끌어다 놓아도 소스가 됩니다.
- 목록에서 위에 있는 소스가 앞에 그려집니다. 눈 단추는 보이기, 자물쇠는 잠금입니다. 여러 개를 고르고 Ctrl+G 로 **그룹**으로 묶습니다.
- 복사(Ctrl+C)한 소스를 **붙여넣기(참조)** 하면 같은 소스를, **붙여넣기(복제)** 하면 새 소스를 만듭니다.

| 소스 | 설명 |
| --- | --- |
| 디스플레이 · 창 · 게임 캡처 | 시스템 화면 공유 창에서 고릅니다. 다시 고르려면 속성의 “캡처할 대상 고르기” |
| 비디오 캡처 장치 | 웹캠·캡처 카드. 해상도·FPS·장치 소리 |
| 오디오 입력 / 출력 캡처, 응용 프로그램 오디오 | 마이크, 데스크톱 소리, 공유한 창·탭의 소리 |
| 이미지 · 이미지 슬라이드 쇼 | 움직이는 GIF/WebP 도 됩니다. 슬라이드 쇼는 시간·전환·반복·무작위 |
| 미디어 소스 · VLC 비디오 소스 | 파일·URL(HLS 포함)·재생 목록. 반복, 처음부터 재생, 속도, 미디어 제어 |
| 브라우저 | HTML·CSS 를 직접 쓰거나 로컬 HTML 파일, URL. 크기·FPS·사용자 CSS. Windows 데스크톱 앱에서는 페이지가 실제로 실행되어(자바스크립트 포함) 채팅창·후원 알림 위젯이 그대로 움직이고, 배경은 투명합니다. **상호작용**(소스 메뉴)을 켜면 미리 보기에서 그 페이지를 누르고 입력할 수 있습니다(Esc 로 끝). 웹판·macOS·Linux 는 스크립트 없이 그림으로 그립니다. |
| 텍스트 | 글꼴, 색, 그라디언트, 외곽선, 그림자, 배경, 정렬, 세로쓰기, 파일에서 읽기, 채팅 로그, 시계·날짜·카운트다운·스톱워치 |
| 색 소스 | 단색 사각형 |

### 미리 보기에서 다루기

- 소스를 끌어서 옮기면 화면 가장자리·가운데·다른 소스에 맞춰 붙습니다(Ctrl 을 누르고 끌면 맞추지 않음).
- 모서리·변의 사각 손잡이로 크기를 바꿉니다(모서리는 비율 유지, Shift: 자유롭게). **Alt** 를 누르고 끌면 자릅니다.
- 위쪽 둥근 손잡이로 돌립니다(Shift: 15° 단위). 화살표 키로 1픽셀, Shift+화살표로 10픽셀 옮깁니다.
- 두 번 누르면 속성, 오른쪽 클릭하면 소스 메뉴. 빈 곳에서 끌면 여러 개를 고릅니다.
- 편집 › 변환에 화면 맞춤(Ctrl+F) · 늘이기 · 가운데(Ctrl+D) · 뒤집기 · 90° 회전 · 초기화가 있습니다. 오른쪽 패널의 **변환** 탭에서 위치·회전·크기·기준점·경계 상자·자르기·혼합 모드·크기 조정 필터·보이기/숨기기 전환을 숫자로 정합니다.

### 필터

오른쪽 패널 **필터** 탭에서 추가하고, 체크로 켜고 끄고, 화살표로 순서를 바꿉니다. 필터 복사/붙여넣기도 됩니다.

- 영상: LUT 적용(.cube / .png), 크로마 키, 색 보정, 색 키, 자르기/여백, 이미지 마스크/혼합, 루마 키, 렌더 지연, 비디오 지연, 크기 조정/종횡비, 스크롤, 선명하게, HDR 톤 매핑, 흐림·모자이크
- 오디오: 게인, 노이즈 게이트, 소음 억제, 압축기(사이드체인 더킹), 리미터, 익스팬더, 상향 압축기, 3밴드 이퀄라이저, 극성 반전
- VST 2.x 플러그인은 웹 엔진 안에서 돌릴 수 없어 소리를 그대로 통과시키고, 문제 목록에 알립니다.

### 오디오 믹서

소리가 있는 소스마다 미터(피크와 유지 표시), 음량 막대, 음소거, 모니터링(끄기 → 모니터만 → 모니터와 출력) 단추가 있습니다. 프로그램에 나오는 소스만 출력으로 갑니다. 톱니 단추로 **고급 오디오 속성**(음량 dB, 모노, 밸런스, 싱크 오프셋, 모니터링, 트랙 1–6, 눌러서 말하기/음소거)과 필터를 엽니다. 설정 › 오디오에서 전역 장치(데스크톱 오디오 1·2, 마이크/보조 1–4)를 정하면 장면과 상관없이 늘 믹서에 있습니다.

### 전환과 스튜디오 모드

- 아래 패널 **전환 효과**에서 컷 · 페이드 · 스와이프 · 슬라이드 · 스팅어(트랙 매트) · 색으로 페이드 · 루마 와이프(16가지 패턴)를 고르고 길이를 정합니다. 장면마다 자기 전환을 정할 수도 있습니다(장면 속성).
- **스튜디오 모드**: 왼쪽 미리 보기에서 다음 장면을 고치고, 가운데 **전환** 단추나 **T-바**로 오른쪽 프로그램에 보냅니다. 빠른 전환 단추를 더할 수 있고, 설정 › 일반에서 “전환할 때 장면 복제”, “전환 후 바꾸기”를 정합니다.
- **멀티뷰**: 미리 보기·프로그램과 장면 8개를 한 화면에. 장면을 누르면 고르고, 두 번 누르면 전환합니다.
- **프로젝터**: 미리 보기·프로그램·멀티뷰·장면·소스를 새 창이나 다른 모니터 전체 화면으로 띄웁니다(방송 › 프로젝터, 오른쪽 클릭 메뉴).

### 방송과 녹화

- **방송 시작**: 설정 › 방송에서 서비스(Twitch · YouTube · 치지직 · SOOP · Kick · Facebook · X · TikTok · 사용자 지정 · WHIP)와 서버, 스트림 키를 넣고 툴바의 방송 단추를 누릅니다. 사용자 지정은 `rtmp://`, `rtmps://`, `srt://`, `rist://`, WHIP 은 `https://` 주소를 씁니다. 방송 지연, 자동 다시 연결, Twitch 대역폭 시험 모드가 있습니다.
- **직접 시청(스트림 키 없이)**: 방송 서비스 없이 시청자가 이 프로그램에 직접 접속해서 봅니다. 설정 › 방송의 서비스에서 **직접 시청**을 고르고 방송 단추를 누르면 시청 주소(`http://<이 컴퓨터 주소>:8790/`)가 나옵니다. 시청자는 이 주소를 브라우저로 열기만 하면 됩니다(설치 필요 없음). 방송 › 시청 주소 보기로 언제든 다시 보고 복사합니다.
  - **입장 코드**를 정하면 아는 사람만 봅니다(주소에 `?code=…` 가 붙어 나옵니다). **최대 시청자 수**, **방송 제목**, 포트도 고릅니다.
  - 같은 네트워크(집·사무실·같은 와이파이)는 그대로 됩니다. 인터넷의 시청자는 공유기에서 이 포트를 열고(포트 포워딩) 공인 주소로 접속합니다. 회사 방화벽 뒤라면 **STUN · TURN 서버** 칸에 TURN 서버를 넣습니다.
  - 시청자마다 영상을 따로 보내므로 업로드 속도가 시청자 수 × 영상 비트레이트만큼 필요합니다. 많은 사람에게 보낼 때는 방송 서비스가 낫습니다.
  - 스트림 키 없이 방송 단추를 누르면 나오는 창에서도 **직접 시청으로 시작**을 고를 수 있습니다. 웹판은 터미널에서 `npm run viewers` 로 직접 시청 서버를 함께 켭니다.
- **녹화**: 녹화 단추. 형식은 MP4 · 조각 MP4(끊겨도 안전) · MOV · MKV · WebM. 일시정지, 파일 나누기(수동·시간·크기), 챕터 표시, 오디오 트랙 여러 개를 씁니다. 파일 이름 형식은 설정 › 고급. 녹화가 끝나면 자동 리먹스(FFmpeg)도 됩니다.
- **리플레이 버퍼**: 켜 두면 마지막 몇 초(시간·메모리 한도)를 기억하고, **리플레이 저장**으로 파일을 만듭니다.
- **가상 카메라**: Windows 에서는 Zoom · Teams · Discord · 브라우저의 카메라 목록에 **MyBroadcasting Virtual Camera** 로 나오는 장치입니다. 처음 켤 때 장치를 설치할지 묻습니다. 설치에는 관리자 권한이 필요하고 Windows 가 한 번 더 확인합니다(설정 › 고급 › 가상 카메라 장치에서 설치 · 제거). 설치하지 않거나 macOS · Linux · 웹에서는 깨끗한 프로그램 화면을 창으로 띄우니, 화상 회의 프로그램에서 그 창을 화면 공유하세요.
- **계정 연결(Twitch · YouTube)**: 설정 › 방송에서 서비스를 고르면 "계정 연결"이 나옵니다. 각 서비스의 개발자 콘솔에서 직접 앱을 등록해 받은 Client ID(YouTube 는 Secret 도)를 넣고 **연결**을 누르면, 브라우저에서 로그인한 뒤 스트림 키를 자동으로 받아 옵니다. 로그인 토큰은 키를 받는 데만 쓰고 저장하지 않습니다.
- **스크린샷**: 출력·장면·소스를 PNG 로 저장합니다.
- 인코더는 엔진의 WebCodecs(Windows: 하드웨어 H.264 · HEVC · AV1)를 씁니다. 출력 모드 **단순**은 비트레이트·인코더·녹화 품질만, **고급**은 방송·녹화 인코더, CBR/VBR/CQP, 키프레임 간격, 트랙을 따로 정합니다.

### 도구

- **자동 구성 마법사**: 용도와 해상도를 고르면 이 컴퓨터에 맞는 FPS·출력 해상도·비트레이트를 정합니다.
- **출력 타이머**: 정한 시간 뒤에 방송·녹화를 멈춥니다.
- **자동 장면 전환기**: 앞에 있는 창 제목에 따라(“게임 => 게임 장면”, /정규식/), 또는 시간 순환으로 장면을 바꿉니다.
- **스크립트**: JavaScript 로 장면 전환, 소스 보이기, 글 바꾸기, 음량 등을 자동으로 합니다.
- **자막**: 마이크 소리를 글로 바꿔 텍스트 소스에 씁니다(음성 인식이 있는 엔진에서).
- **원격 제어(WebSocket)**: 널리 쓰이는 원격 제어 규약 5판. Stream Deck · Touch Portal 등이 연결합니다(데스크톱 앱).
- **통계 · 로그 창**, **없는 파일 찾기**, **녹화 리먹스**.

### 설정

일반(확인 창, 함께 시작·멈춤, 맞춤, 스튜디오 모드, 프로젝터, 전역 단축키) · 시작 화면 · 테마(40가지 + 사용자 정의) · 글꼴 · 배경 · 방송 · 출력 · 오디오 · 비디오(기본/출력 해상도, FPS, 축소 필터) · 단축키 · 접근성(선택 색, 믹서 배치) · 고급(파일 이름, 덮어쓰기, 리먹스, 리플레이 이름, 방송 지연, 다시 연결, FFmpeg) · 최근 파일 · 단축키 목록.

**단축키** 탭에서 모든 동작(방송·녹화, 장면, 소스 보이기/숨기기, 음소거, 눌러서 말하기, 미디어 제어, 빠른 전환)에 키를 줍니다. 상자를 누르고 키를 누르면 정해집니다. 데스크톱 앱은 단축키를 전역으로 등록해 다른 프로그램이 앞에 있어도 동작합니다.

### 장면 모음과 프로필

- **장면 모음**: 장면·소스·전환 묶음. 파일 › 장면 모음(또는 작업 화면 위의 이름)에서 새로 만들기 · 복제 · 이름 바꾸기 · 삭제 · 전환 · 가져오기 · 내보내기(.mybc, 공용 장면 파일 .json)를 합니다. 다른 프로그램의 장면 파일을 가져오면 이 앱에 없는 플러그인 소스만 빠지고 나머지는 위치·필터·오디오 설정까지 그대로 옵니다.
- **프로필**: 방송·출력·오디오·비디오·단축키 설정 묶음. 같은 메뉴에서 관리합니다.
- 모든 변경은 바로 저장됩니다. 실행 취소(Ctrl+Z) / 다시 실행(Ctrl+Y)으로 되돌립니다.

### 보고서 인쇄

파일 › 보고서 인쇄(Ctrl+P)에서 **장면 구성표**(장면마다 그림과 소스 배치), **소스 목록**, **오디오 구성**, **단축키 표**, **출력 설정서**, **세션 기록**, **기능 목록**을 고릅니다. 용지·방향·여백·범위·흑백을 정하고, 프린터로 바로 인쇄하거나 PDF 로 저장합니다.

### 자주 묻는 것

- 화면 캡처를 열 때마다 고르는 창이 나옵니다: 운영체제와 엔진이 개인 정보 보호를 위해 요구합니다. 한 번 고르면 소스를 지울 때까지 계속 씁니다.
- 트위치 같은 서비스의 스트림 키가 꼭 있어야 하나요: 아닙니다. 서비스로 보낼 때만 그 서비스의 키가 필요합니다. 키 없이 보여 주려면 **직접 시청**을 쓰고, 녹화만 하거나, WHIP·SRT·RIST 서버로 보낼 수도 있습니다.
- RTMP 방송이 시작되지 않습니다: FFmpeg 가 있는지 설정 › 고급 › FFmpeg 의 “찾기”로 확인하세요. 메시지 탭에 FFmpeg 가 남긴 이유가 나옵니다.
- 문서와 튜토리얼: 도움말 › 튜토리얼(F11), 튜토리얼 문서, 사용 설명서.

<!-- lang:en -->
## English

### What it does

MyBroadcasting is a personal broadcasting studio. Gather screens, windows, games, webcams, microphones, videos, pictures, web pages and text as **sources**, arrange them into **scenes**, add video and audio **filters**, balance the sound in the **audio mixer**, switch scenes with **transitions** or in **studio mode**, and **record** or **stream**. It runs as a desktop app on Windows, macOS and Linux and in the web browser, with the same window. Scene files of other broadcasting programs (.json) import as they are.

### Installing and running

- Windows: run `MyBroadcasting-Setup-<version>.exe` and pick the installer language. An earlier version can be removed first; you choose whether to delete user data (recordings are never touched).
- macOS and Linux: install the `.dmg`, `.deb`, `.rpm` or `.AppImage` package.
- Web: open the same program in a browser (Edge or Chrome recommended). RTMP streaming from the web needs the relay server (`npm run relay`).
- **FFmpeg** is used for RTMP / RTMPS / SRT / RIST streaming, remuxing and chapters. It is found on the PATH, or set its location in Settings › Advanced › FFmpeg. WHIP (WebRTC) streaming, recording and the replay buffer need no FFmpeg.

### The window

| Part | What it does |
| --- | --- |
| Menu bar | Start button, File · Edit · Scene · Source · Controls · View · Tools · Help, the collection name, LIVE / REC badges, panel buttons, window buttons |
| Toolbar | Collections and profiles, Undo, add scene / source, stream, record, pause, replay, virtual camera, screenshot, studio mode, multiview, safe areas, preview lock, snapping, projectors, stats, log, auto configuration. When narrow, the last groups fold into » |
| Left panel | Scenes on top, the sources of the selected scene below (groups open and close), and **Quick add** at the bottom (webcam, screen, window, image, text, media, browser, colour; the header folds it) |
| Centre | The preview (studio mode: preview · transition button and T-bar · program / the multiview) |
| Right panel | The selected source: Properties · Filters · Transform · Audio. With nothing selected, an **overview**: the scene on air and the transition, stream / recording / replay buffer / virtual camera with their start and stop buttons, FPS, render time, dropped frames, CPU and memory |
| Bottom panel | Audio mixer (a card per source: name, meter, fader, mute, monitor) · Transitions · Controls · Media · Stats · Messages · Problems |
| Status bar | Stream and recording time, bitrate and dropped frames, FPS and render time, CPU, problems, theme, language, clock |

### Start page

New collection, import, continue, the auto-configuration wizard and the tutorial. The **Collections and recent files** card opens a saved collection. Open a **sample collection** (talk show, gaming, lecture, music, news, countdown) with one click. The background is one of 16 moving pictures or your own picture; cards move by dragging and resize from the corner.

### Scenes and sources

- **Add a scene** with + in the scene list. Clicking a scene switches to it (in studio mode it goes to the preview). Drag to reorder; right-click to duplicate, rename, remove, filter, screenshot or project it.
- **Add a source** with + in the source list. To show the same source in several scenes choose **Add existing source**. Another scene can be a source too (nested scenes). Dropping picture, video, sound or HTML files on the window adds them as sources.
- Higher sources are drawn on top. The eye shows / hides, the lock locks. Select several and press Ctrl+G to **group** them.
- After Copy (Ctrl+C), **Paste (reference)** adds the same source, **Paste (duplicate)** a new copy.

| Source | Notes |
| --- | --- |
| Display · Window · Game capture | Chosen in the system share picker; choose again with "Choose what to capture" in Properties |
| Video capture device | Webcams and capture cards: resolution, FPS, the device's sound |
| Audio input / output capture, application audio | Microphones, desktop sound, the sound of a shared window or tab |
| Image · Image slide show | Animated GIF / WebP work; slide shows have timing, transitions, loop and shuffle |
| Media source · VLC video source | Files, URLs (HLS too), playlists: loop, restart, speed, media controls |
| Browser | HTML and CSS typed in, a local HTML file or a URL; size, FPS, custom CSS. In the Windows desktop app the page really runs (scripts too), so chat boxes and alert widgets move, with a transparent background. **Interact** (Source menu) lets you click and type into the page on the preview (Esc ends it). The web version, macOS and Linux draw the page without scripts. |
| Text | Font, colour, gradient, outline, shadow, background, alignment, vertical, from a file, chat log, clock, date, countdown, stopwatch |
| Color source | A solid rectangle |

### Working in the preview

- Drag sources to move them; they snap to the edges, the centre and other sources (hold Ctrl to drag freely).
- Square handles resize (corners keep the ratio; Shift: free). Hold **Alt** while dragging a handle to crop.
- The round handle rotates (Shift: 15° steps). Arrow keys nudge by 1 px, Shift+arrows by 10 px.
- Double-click opens Properties, right-click the source menu; drag on empty space to select several.
- Edit › Transform has Fit (Ctrl+F), Stretch, Center (Ctrl+D), flips, 90° turns and Reset. The **Transform** tab sets position, rotation, size, alignment, bounding box, crop, blending, scale filtering and show / hide transitions exactly.

### Filters

In the **Filters** tab add filters, switch them on and off, and order them; filters can be copied and pasted.

- Video: Apply LUT (.cube / .png), Chroma Key, Color Correction, Color Key, Crop/Pad, Image Mask/Blend, Luma Key, Render Delay, Video Delay, Scaling/Aspect Ratio, Scroll, Sharpen, HDR Tone Mapping, Blur / Pixelate
- Audio: Gain, Noise Gate, Noise Suppression, Compressor (side-chain ducking), Limiter, Expander, Upward Compressor, 3-Band Equalizer, Invert Polarity
- VST 2.x plug-ins cannot run inside a web engine: that filter passes the sound unchanged and is listed under Problems.

### Audio mixer

Every source with sound has a meter (with peak hold), a fader, mute and monitoring (off → monitor only → monitor and output). Only sources in the program reach the output. The gear opens **Advanced audio properties** (volume in dB, mono, balance, sync offset, monitoring, tracks 1–6, push-to-talk / push-to-mute) and the filters. Global devices (Desktop Audio 1–2, Mic/Aux 1–4) in Settings › Audio stay in the mixer whatever the scene.

### Transitions and studio mode

- In **Transitions** choose Cut, Fade, Swipe, Slide, Stinger (track matte), Fade to Color or Luma Wipe (16 patterns) and the duration. A scene can have its own transition (scene properties).
- **Studio mode**: edit the next scene in the preview on the left, then send it to the program on the right with **Transition** or the **T-bar**. Add quick transition buttons; Settings › General has "Duplicate scene" and "Swap preview and program".
- **Multiview**: the preview, the program and eight scenes at once. Click a scene to pick it, double-click to transition.
- **Projectors**: show the preview, program, multiview, a scene or a source in a window or full screen on another monitor (Controls › Projector, right-click menus).

### Streaming and recording

- **Start streaming**: in Settings › Stream pick the service (Twitch, YouTube, CHZZK, SOOP, Kick, Facebook, X, TikTok, custom, WHIP), the server and the stream key, then press the stream button. Custom takes `rtmp://`, `rtmps://`, `srt://`, `rist://`; WHIP takes `https://`. Stream delay, automatic reconnect and Twitch's bandwidth test are there.
- **Direct viewing (no stream key)**: viewers connect to this program and watch, with no streaming service. Pick **Direct viewing** as the service in Settings › Stream and press the stream button: the viewer address appears (`http://<this computer>:8790/`). Viewers just open it in a browser; nothing to install. Broadcast › Viewer addresses shows and copies it again.
  - An **access code** keeps it to people who know it (the address carries `?code=…`). **Most viewers**, the **show title** and the port can be set too.
  - On the same network (home, office, the same Wi-Fi) it just works. Viewers on the internet need the port opened on your router (port forwarding) and your public address. Behind strict firewalls, add a TURN server under **STUN / TURN servers**.
  - Each viewer gets their own copy, so your upload must carry viewers × video bitrate. For large audiences a streaming service is the better road.
  - Pressing the stream button without a stream key also offers **Start direct viewing**. The web version needs the direct viewing server running: `npm run viewers`.
- **Recording**: MP4, fragmented MP4 (crash-safe), MOV, MKV or WebM; pause, split files (by hand, by time, by size), chapter markers, several audio tracks. The file name format is in Settings › Advanced; recordings can be remuxed automatically (FFmpeg).
- **Replay buffer**: keeps the last seconds (time and memory limits); **Save replay** writes them to a file.
- **Virtual camera**: on Windows a device that Zoom, Teams, Discord and browsers list as **MyBroadcasting Virtual Camera**. The first time it asks whether to install the device; that needs administrator rights and Windows asks once more (Settings › Advanced › Virtual camera device installs and removes it). Without it, and on macOS, Linux and the web, the clean program opens in a window — share that window in your video call app.
- **Account (Twitch, YouTube)**: choosing the service in Settings › Stream shows "Account". Register an app in the service's developer console yourself, enter its Client ID (and the secret for YouTube) and press **Connect**: after signing in in the browser the stream key is fetched. The sign-in token is used for that only and not kept.
- **Screenshots** of the output, a scene or a source are saved as PNG.
- Encoding uses the engine's WebCodecs (Windows: hardware H.264, HEVC, AV1). **Simple** output mode sets bitrate, encoder and recording quality; **Advanced** sets stream and recording encoders, CBR / VBR / CQP, keyframe interval and tracks separately.

### Tools

- **Auto-configuration wizard**: picks FPS, output resolution and bitrate for this computer and the usage.
- **Output timer**: stops streaming or recording after a set time.
- **Automatic scene switcher**: by the title of the window in front ("Game => Game scene", /regex/) or by a timed rotation.
- **Scripts**: JavaScript that switches scenes, shows sources, changes text or volume automatically.
- **Captions**: turns the microphone into text in a text source (engines with speech recognition).
- **Remote control (WebSocket)**: the widely used remote-control protocol (version 5) for Stream Deck, Touch Portal and the like (desktop app).
- **Stats and log windows**, **missing files**, **remux recordings**.

### Settings

General (confirmations, start / stop together, snapping, studio mode, projectors, global hotkeys) · Start page · Theme (40 + custom) · Font · Background · Stream · Output · Audio · Video (base / output resolution, FPS, downscale filter) · Hotkeys · Accessibility (selection colour, mixer layout) · Advanced (file names, overwrite, remux, replay names, stream delay, reconnect, FFmpeg) · Recent files · Shortcuts.

In **Hotkeys** every action (outputs, scenes, showing / hiding sources, mute, push-to-talk, media controls, quick transitions) can get keys: click the box and press the keys. The desktop app registers them globally, so they work while another program is in front.

### Scene collections and profiles

- A **scene collection** holds scenes, sources and transitions. File › Scene collections (or the name above the preview) creates, duplicates, renames, removes, switches, imports and exports them (.mybc, common scene files .json). Importing another program's scene file keeps positions, filters and audio settings; only plug-in sources this app does not have are left out.
- A **profile** holds the stream, output, audio, video and hotkey settings; it is managed in the same way.
- Every change is saved at once; Undo (Ctrl+Z) and Redo (Ctrl+Y) take it back.

### Printed reports

File › Print reports (Ctrl+P) offers the **scene rundown** (each scene with its picture and layout), **source list**, **audio setup**, **hotkey sheet**, **output settings**, **session log** and **feature list**. Choose paper, orientation, margins, range and black & white, then print straight to the printer or save a PDF.

### Questions

- Screen capture asks what to share each time a capture source is made: the operating system and the engine require it for privacy. The choice stays until the source is removed.
- Do I need a stream key from Twitch or another service? No. A service's key is needed only to send to that service. To show the stream without one, use **Direct viewing**, just record, or send to a WHIP / SRT / RIST server.
- RTMP streaming does not start: check FFmpeg with "Find" in Settings › Advanced › FFmpeg. The Messages tab shows FFmpeg's reason.
- Help: Help › Tutorial (F11), the tutorial document and this guide.
