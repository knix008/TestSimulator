using System.Text.Json;

namespace VNCServer.Settings;

public class ServerSettings
{
    public int Port { get; set; } = 5900;
    public string Password { get; set; } = string.Empty;
    public bool RequirePassword { get; set; } = true;
    
    // 네트워크 설정
    public bool EnableIPv6 { get; set; } = false;  // IPv6 지원
    public string BindAddress { get; set; } = "0.0.0.0";  // 바인드 주소 (IPv4: 0.0.0.0, IPv6: ::)
    
    public bool AllowMouseControl { get; set; } = true;  // 마우스는 기본 공유
    public bool AllowKeyboardControl { get; set; } = false;  // 키보드는 선택적 공유
    public bool AllowMultipleConnections { get; set; } = false;
    
    // 원격 제어 권한
    public bool ViewOnlyMode { get; set; } = false;  // 보기 전용 모드 (입력 차단)
    public bool AllowControlRequest { get; set; } = true;  // 클라이언트가 제어 요청 가능
    
    public int CompressionLevel { get; set; } = 6;
    public int FrameRate { get; set; } = 30;
    public bool AutoStart { get; set; } = false;
    public bool MinimizeToTray { get; set; } = true;
    
    // TLS/SSL 설정
    public bool EnableTLS { get; set; } = false;
    public string CertificatePath { get; set; } = string.Empty;
    public string CertificatePassword { get; set; } = string.Empty;
    
    // 화면 품질 설정
    public int ImageQuality { get; set; } = 75; // 1-100, JPEG 품질
    public bool UseRawEncoding { get; set; } = false;
    
    // 클립보드 동기화
    public bool EnableClipboardSync { get; set; } = true;
    
    // 선택 영역 공유
    public bool UseSelectedArea { get; set; } = false;
    public int SelectedAreaX { get; set; } = 0;
    public int SelectedAreaY { get; set; } = 0;
    public int SelectedAreaWidth { get; set; } = 0;
    public int SelectedAreaHeight { get; set; } = 0;
    
    // 로깅
    public bool EnableLogging { get; set; } = true;
    public string LogFilePath { get; set; } = string.Empty;
    
    // 웹 관리 인터페이스
    public bool EnableWebManagement { get; set; } = false;
    public int WebManagementPort { get; set; } = 8080;
    
    // 오디오 스트리밍
    public bool EnableAudioStreaming { get; set; } = false;
    public int AudioSampleRate { get; set; } = 44100;  // 44.1kHz
    public int AudioChannels { get; set; } = 2;  // 스테레오
    public int AudioBitsPerSample { get; set; } = 16;  // 16-bit
    public bool AudioCaptureSystemSound { get; set; } = true;  // 시스템 사운드 캡처
    public bool AudioCaptureMicrophone { get; set; } = false;  // 마이크 캡처
    
    // 비디오 코덱
    public bool EnableVideoCodec { get; set; } = false;  // H.264/H.265 사용
    public string VideoCodecType { get; set; } = "H264";  // H264, H265, VP8, VP9
    public string VideoQuality { get; set; } = "Medium";  // Low, Medium, High, VeryHigh, Lossless
    public bool UseHardwareEncoder { get; set; } = true;  // 하드웨어 가속
    
    // 터치 입력
    public bool EnableTouchInput { get; set; } = false;  // 터치 입력 지원
    public int MaxTouchPoints { get; set; } = 10;  // 최대 터치 포인트
    
    // 세션 재연결
    public bool EnableSessionReconnect { get; set; } = true;  // 자동 재연결
    public int SessionTimeoutMinutes { get; set; } = 5;  // 세션 타임아웃 (분)
    public int MaxReconnectAttempts { get; set; } = 3;  // 최대 재연결 시도 횟수
    
    // 다중 모니터
    public string MonitorCaptureMode { get; set; } = "AllMonitors";  // AllMonitors, PrimaryMonitor, SpecificMonitor
    public int SelectedMonitorIndex { get; set; } = 0;  // 선택된 모니터 인덱스
    
    // UPnP 포트 포워딩
    public bool EnableUPnP { get; set; } = false;  // UPnP 자동 포트 포워딩
    public bool AutoMapPortOnStart { get; set; } = true;  // 서버 시작 시 자동 매핑

    private static string SettingsPath => 
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), 
                     "VNCServer", "settings.json");

    public static ServerSettings Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var json = File.ReadAllText(SettingsPath);
                return JsonSerializer.Deserialize<ServerSettings>(json) ?? new ServerSettings();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to load settings: {ex.Message}");
        }
        return new ServerSettings();
    }

    public void Save()
    {
        try
        {
            var directory = Path.GetDirectoryName(SettingsPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions 
            { 
                WriteIndented = true 
            });
            File.WriteAllText(SettingsPath, json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to save settings: {ex.Message}");
        }
    }

    public void ResetToDefaults()
    {
        var defaults = new ServerSettings();
        
        // 모든 속성을 기본값으로 복사
        Port = defaults.Port;
        Password = defaults.Password;
        RequirePassword = defaults.RequirePassword;
        EnableIPv6 = defaults.EnableIPv6;
        BindAddress = defaults.BindAddress;
        AllowMouseControl = defaults.AllowMouseControl;
        AllowKeyboardControl = defaults.AllowKeyboardControl;
        AllowMultipleConnections = defaults.AllowMultipleConnections;
        ViewOnlyMode = defaults.ViewOnlyMode;
        AllowControlRequest = defaults.AllowControlRequest;
        CompressionLevel = defaults.CompressionLevel;
        FrameRate = defaults.FrameRate;
        AutoStart = defaults.AutoStart;
        MinimizeToTray = defaults.MinimizeToTray;
        EnableTLS = defaults.EnableTLS;
        CertificatePath = defaults.CertificatePath;
        CertificatePassword = defaults.CertificatePassword;
        ImageQuality = defaults.ImageQuality;
        UseRawEncoding = defaults.UseRawEncoding;
        EnableClipboardSync = defaults.EnableClipboardSync;
        UseSelectedArea = defaults.UseSelectedArea;
        SelectedAreaX = defaults.SelectedAreaX;
        SelectedAreaY = defaults.SelectedAreaY;
        SelectedAreaWidth = defaults.SelectedAreaWidth;
        SelectedAreaHeight = defaults.SelectedAreaHeight;
        EnableLogging = defaults.EnableLogging;
        LogFilePath = defaults.LogFilePath;
        EnableWebManagement = defaults.EnableWebManagement;
        WebManagementPort = defaults.WebManagementPort;
        EnableAudioStreaming = defaults.EnableAudioStreaming;
        AudioSampleRate = defaults.AudioSampleRate;
        AudioChannels = defaults.AudioChannels;
        AudioBitsPerSample = defaults.AudioBitsPerSample;
        AudioCaptureSystemSound = defaults.AudioCaptureSystemSound;
        AudioCaptureMicrophone = defaults.AudioCaptureMicrophone;
        EnableVideoCodec = defaults.EnableVideoCodec;
        VideoCodecType = defaults.VideoCodecType;
        VideoQuality = defaults.VideoQuality;
        UseHardwareEncoder = defaults.UseHardwareEncoder;
        EnableTouchInput = defaults.EnableTouchInput;
        MaxTouchPoints = defaults.MaxTouchPoints;
        EnableSessionReconnect = defaults.EnableSessionReconnect;
        SessionTimeoutMinutes = defaults.SessionTimeoutMinutes;
        MaxReconnectAttempts = defaults.MaxReconnectAttempts;
        MonitorCaptureMode = defaults.MonitorCaptureMode;
        SelectedMonitorIndex = defaults.SelectedMonitorIndex;
        EnableUPnP = defaults.EnableUPnP;
        AutoMapPortOnStart = defaults.AutoMapPortOnStart;
    }
}
