using System.Text.Json.Serialization;

namespace RTSPCall.Core.Models;

public enum CallState
{
    Idle,
    Connecting,
    Publishing,
    InCall,
    Ending,
    Error
}

public static class CaptureSources
{
    public const string TestPattern = "(test pattern)";
}

public sealed class CallOfferRequest
{
    [JsonPropertyName("caller_id")]
    public string CallerId { get; set; } = "pc";

    [JsonPropertyName("pc_host")]
    public string PcHost { get; set; } = "";

    [JsonPropertyName("pc_rtsp_url")]
    public string PcRtspUrl { get; set; } = "";

    [JsonPropertyName("pc_rtsp_port")]
    public int PcRtspPort { get; set; } = 8554;

    [JsonPropertyName("video_device")]
    public string? VideoDevice { get; set; }

    [JsonPropertyName("audio_device")]
    public string? AudioDevice { get; set; }
}

public sealed class CallSessionResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("state")]
    public string State { get; set; } = "idle";

    [JsonPropertyName("session_id")]
    public string? SessionId { get; set; }

    [JsonPropertyName("device_rtsp_url")]
    public string? DeviceRtspUrl { get; set; }

    [JsonPropertyName("device_host")]
    public string? DeviceHost { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

public sealed class CallStatusResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("state")]
    public string State { get; set; } = "idle";

    [JsonPropertyName("session_id")]
    public string? SessionId { get; set; }

    [JsonPropertyName("device_rtsp_url")]
    public string? DeviceRtspUrl { get; set; }

    [JsonPropertyName("pc_rtsp_url")]
    public string? PcRtspUrl { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

public enum UiThemeMode
{
    Dark,
    Light
}

public enum UiLanguage
{
    English,
    Korean
}

public sealed class AppSettings
{
    public string DeviceBaseUrl { get; set; } = "http://127.0.0.1:8080";
    public int LocalRtspPort { get; set; } = 8554;
    public string LocalMountPath { get; set; } = "pc";
    public string? VideoDevice { get; set; } = CaptureSources.TestPattern;
    public string? AudioDevice { get; set; }
    public string FfmpegPath { get; set; } = "ffmpeg";
    public int VideoWidth { get; set; } = 1280;
    public int VideoHeight { get; set; } = 720;
    public int VideoBitrateKbps { get; set; } = 1500;
    public int AudioBitrateKbps { get; set; } = 64;

    /// <summary>
    /// When true, advertise rtsp://127.0.0.1/... (same-PC simulator).
    /// </summary>
    public bool PreferLoopback { get; set; } = true;

    public UiThemeMode Theme { get; set; } = UiThemeMode.Dark;
    public UiLanguage Language { get; set; } = UiLanguage.English;
}

public sealed class DeviceSimSettings
{
    public int SignalingPort { get; set; } = 8080;
    public int RtspPort { get; set; } = 8555;
    public string RtspMount { get; set; } = "device";
    public string? VideoDevice { get; set; } = CaptureSources.TestPattern;
    public string? AudioDevice { get; set; }
    public string FfmpegPath { get; set; } = "ffmpeg";
    public int VideoWidth { get; set; } = 1280;
    public int VideoHeight { get; set; } = 720;
    public int VideoBitrateKbps { get; set; } = 1500;
    public int AudioBitrateKbps { get; set; } = 64;
    public bool PreferLoopback { get; set; } = true;

    public UiThemeMode Theme { get; set; } = UiThemeMode.Dark;
    public UiLanguage Language { get; set; } = UiLanguage.English;
}
