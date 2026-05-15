namespace RemoteDesktopWinV10.App;

/// <summary>IMsTscAxEvents::OnFatalError 의 errorCode 설명 (Microsoft Learn 기준).</summary>
internal static class RdpFatalErrorDescription
{
    public static string Describe(long errorCode)
    {
        var detail = errorCode switch
        {
            0 => "알 수 없는 오류가 발생했습니다.",
            1 => "내부 오류 코드 1입니다.",
            2 => "메모리가 부족합니다.",
            3 => "창을 만들 수 없습니다.",
            4 => "내부 오류 코드 2입니다.",
            5 => "내부 오류 코드 3입니다. (유효하지 않은 상태)",
            6 => "내부 오류 코드 4입니다.",
            7 => "클라이언트 연결 중 복구할 수 없는 오류가 발생했습니다.",
            100 => "Winsock 초기화 오류입니다.",
            _ => "문서에 정의되지 않은 코드입니다. 네트워크·방화벽·서버·자격 증명·NLA 설정을 확인하세요.",
        };

        return "설명: " + detail;
    }
}
