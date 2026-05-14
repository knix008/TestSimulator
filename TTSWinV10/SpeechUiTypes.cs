namespace TTSWinV10;

/// <summary>사용자가 선택할 수 있는 음성 합성 백엔드.</summary>
internal enum SpeechSynthesisMethod
{
    /// <summary>SAPI 5 — .NET System.Speech, 설치형 데스크톱 음성.</summary>
    SystemSpeechSapi = 0,

    /// <summary>Windows 10 이상 WinRT — Windows.Media.SpeechSynthesis, 시스템 음성.</summary>
    WindowsMediaWinRt = 1,

    /// <summary>Sherpa-ONNX 오프라인 — Mimic3 한국어 KSS low (모델 파일 필요).</summary>
    SherpaOnnxKoreanMimic3KssLow = 2,
}

internal sealed class SynthMethodItem
{
    public SynthMethodItem(SpeechSynthesisMethod method, string caption)
    {
        Method = method;
        Caption = caption;
    }

    public SpeechSynthesisMethod Method { get; }
    public string Caption { get; }

    public override string ToString() => Caption;
}

internal enum SynthEmphasis
{
    None,
    Moderate,
    Strong,
}
