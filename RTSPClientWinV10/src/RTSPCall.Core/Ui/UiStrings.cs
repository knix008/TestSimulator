using RTSPCall.Core.Models;

namespace RTSPCall.Core.Ui;

public sealed class UiStrings
{
    public required UiLanguage Language { get; init; }

    public static UiStrings For(UiLanguage language) => language == UiLanguage.Korean ? Ko : En;

    public static readonly UiStrings En = new()
    {
        Language = UiLanguage.English,
        Theme = "Theme",
        LanguageLabel = "Language",
        ThemeDark = "Dark",
        ThemeLight = "Light",
        LangEnglish = "English",
        LangKorean = "한국어",
        Copy = "Copy",
        Close = "Close",
        Copied = "Copied to clipboard.",
        ErrorDetails = "Error details",
        DeviceUrl = "Device URL",
        LocalSim = "Local sim",
        RtspPort = "RTSP port",
        Loopback = "Loopback",
        Host = "Host",
        RefreshDevices = "Refresh devices",
        StartCall = "Start call",
        HangUp = "Hang up",
        Camera = "Camera",
        Mic = "Mic",
        State = "State",
        Idle = "Idle",
        HintClient = "Local sim: start RTSPDeviceSimWinV10 first, then Local sim + Start call. Use (test pattern) if only one webcam.",
        VideoRemoteDevice = "Remote (device / simulator)",
        Session = "Session",
        PortsHelp = "Ports (same PC)\r\nPC RTSP: 8554/pc\r\nDevice sim RTSP: 8555/device\r\nSignaling: 8080",
        Log = "Log",
        ClientTitle = "RTSP Client Win V10 — LAN Video Call",
        ConfiguredLocalSim = "Configured for local device simulator.",
        StartingCall = "Starting call...",
        Playing = "Playing",
        CallFailed = "Call failed",
        CallEnded = "Call ended.",
        HangupError = "Hangup error",
        EnumeratingDevices = "Enumerating capture devices via ffmpeg...",
        FoundDevices = "Found {0} video, {1} audio source(s).",
        DeviceEnumFailed = "Device enumeration failed",
        DevicesTitle = "Devices",
        DeviceRtsp = "Device RTSP",
        PcRtsp = "PC RTSP",
        SessionId = "Session",
        SignalingPort = "Signaling port",
        LoopbackLocal = "Loopback (127.0.0.1)",
        StartSimulator = "Start simulator",
        Stop = "Stop",
        Source = "Source",
        Status = "Status",
        StatusStopped = "stopped",
        StatusListening = "listening",
        HowTo = "How to test (same PC)",
        HowToBody = "1) Start simulator — local test pattern/camera preview appears.\r\n2) Run RTSPClientWinV10.\r\n3) Device URL = http://127.0.0.1:8080\r\n4) Enable Loopback, Start call (panel switches to PC remote).\r\n\r\nDefault source is (test pattern).",
        VideoLocalPreview = "Local preview (device source)",
        VideoRemotePc = "Remote (PC client)",
        SimTitle = "RTSP Device Simulator — local peer",
        SimStartFailed = "Simulator start failed",
        DesignMode = "Design mode",
        Call = "call",
        Video = "video"
    };

    public static readonly UiStrings Ko = new()
    {
        Language = UiLanguage.Korean,
        Theme = "테마",
        LanguageLabel = "언어",
        ThemeDark = "다크",
        ThemeLight = "라이트",
        LangEnglish = "English",
        LangKorean = "한국어",
        Copy = "복사",
        Close = "닫기",
        Copied = "클립보드에 복사되었습니다.",
        ErrorDetails = "오류 상세",
        DeviceUrl = "장치 URL",
        LocalSim = "로컬 시뮬",
        RtspPort = "RTSP 포트",
        Loopback = "루프백",
        Host = "호스트",
        RefreshDevices = "장치 새로고침",
        StartCall = "통화 시작",
        HangUp = "종료",
        Camera = "카메라",
        Mic = "마이크",
        State = "상태",
        Idle = "대기",
        HintClient = "로컬 시뮬: RTSPDeviceSimWinV10을 먼저 실행한 뒤 Local sim + 통화 시작. 웹캠이 하나면 (test pattern)을 사용하세요.",
        VideoRemoteDevice = "원격 (장치 / 시뮬레이터)",
        Session = "세션",
        PortsHelp = "포트 (같은 PC)\r\nPC RTSP: 8554/pc\r\n장치 시뮬 RTSP: 8555/device\r\n시그널링: 8080",
        Log = "로그",
        ClientTitle = "RTSP Client Win V10 — LAN 영상 통화",
        ConfiguredLocalSim = "로컬 장치 시뮬레이터용으로 설정했습니다.",
        StartingCall = "통화 시작 중...",
        Playing = "재생",
        CallFailed = "통화 실패",
        CallEnded = "통화가 종료되었습니다.",
        HangupError = "종료 오류",
        EnumeratingDevices = "ffmpeg로 캡처 장치를 나열하는 중...",
        FoundDevices = "비디오 {0}개, 오디오 {1}개 발견.",
        DeviceEnumFailed = "장치 나열 실패",
        DevicesTitle = "장치",
        DeviceRtsp = "장치 RTSP",
        PcRtsp = "PC RTSP",
        SessionId = "세션",
        SignalingPort = "시그널링 포트",
        LoopbackLocal = "루프백 (127.0.0.1)",
        StartSimulator = "시뮬레이터 시작",
        Stop = "중지",
        Source = "소스",
        Status = "상태",
        StatusStopped = "중지됨",
        StatusListening = "수신 중",
        HowTo = "테스트 방법 (같은 PC)",
        HowToBody = "1) 시뮬레이터 시작 — 로컬 테스트 패턴/카메라 미리보기가 표시됩니다.\r\n2) RTSPClientWinV10 실행.\r\n3) 장치 URL = http://127.0.0.1:8080\r\n4) 루프백 사용 후 통화 시작 (패널이 PC 원격으로 전환).\r\n\r\n기본 소스는 (test pattern)입니다.",
        VideoLocalPreview = "로컬 미리보기 (장치 소스)",
        VideoRemotePc = "원격 (PC 클라이언트)",
        SimTitle = "RTSP 장치 시뮬레이터 — 로컬 피어",
        SimStartFailed = "시뮬레이터 시작 실패",
        DesignMode = "디자인 모드",
        Call = "통화",
        Video = "비디오"
    };

    public string Theme { get; init; } = "";
    public string LanguageLabel { get; init; } = "";
    public string ThemeDark { get; init; } = "";
    public string ThemeLight { get; init; } = "";
    public string LangEnglish { get; init; } = "";
    public string LangKorean { get; init; } = "";
    public string Copy { get; init; } = "";
    public string Close { get; init; } = "";
    public string Copied { get; init; } = "";
    public string ErrorDetails { get; init; } = "";
    public string DeviceUrl { get; init; } = "";
    public string LocalSim { get; init; } = "";
    public string RtspPort { get; init; } = "";
    public string Loopback { get; init; } = "";
    public string Host { get; init; } = "";
    public string RefreshDevices { get; init; } = "";
    public string StartCall { get; init; } = "";
    public string HangUp { get; init; } = "";
    public string Camera { get; init; } = "";
    public string Mic { get; init; } = "";
    public string State { get; init; } = "";
    public string Idle { get; init; } = "";
    public string HintClient { get; init; } = "";
    public string VideoRemoteDevice { get; init; } = "";
    public string Session { get; init; } = "";
    public string PortsHelp { get; init; } = "";
    public string Log { get; init; } = "";
    public string ClientTitle { get; init; } = "";
    public string ConfiguredLocalSim { get; init; } = "";
    public string StartingCall { get; init; } = "";
    public string Playing { get; init; } = "";
    public string CallFailed { get; init; } = "";
    public string CallEnded { get; init; } = "";
    public string HangupError { get; init; } = "";
    public string EnumeratingDevices { get; init; } = "";
    public string FoundDevices { get; init; } = "";
    public string DeviceEnumFailed { get; init; } = "";
    public string DevicesTitle { get; init; } = "";
    public string DeviceRtsp { get; init; } = "";
    public string PcRtsp { get; init; } = "";
    public string SessionId { get; init; } = "";
    public string SignalingPort { get; init; } = "";
    public string LoopbackLocal { get; init; } = "";
    public string StartSimulator { get; init; } = "";
    public string Stop { get; init; } = "";
    public string Source { get; init; } = "";
    public string Status { get; init; } = "";
    public string StatusStopped { get; init; } = "";
    public string StatusListening { get; init; } = "";
    public string HowTo { get; init; } = "";
    public string HowToBody { get; init; } = "";
    public string VideoLocalPreview { get; init; } = "";
    public string VideoRemotePc { get; init; } = "";
    public string SimTitle { get; init; } = "";
    public string SimStartFailed { get; init; } = "";
    public string DesignMode { get; init; } = "";
    public string Call { get; init; } = "";
    public string Video { get; init; } = "";
}
