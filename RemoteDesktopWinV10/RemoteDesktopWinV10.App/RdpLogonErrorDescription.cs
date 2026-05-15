namespace RemoteDesktopWinV10.App;

/// <summary>IMsTscAxEvents::OnLogonError 의 lError 설명.</summary>
internal static class RdpLogonErrorDescription
{
    public static string Describe(int errorCode)
    {
        return errorCode switch
        {
            0 => "로그온 오류 코드가 0입니다(추가 정보 없음).",
            1 => "로그온에 실패했습니다(일반). 사용자 이름·암호·도메인 형식을 확인하세요.",
            2 => "암호가 올바르지 않습니다.",
            3 => "암호를 변경해야 합니다.",
            4 => "계정이 비활성화되었습니다.",
            5 => "암호가 만료되었습니다.",
            6 => "계정이 잠겼습니다.",
            7 => "로그온이 거부되었습니다(권한·정책). 원격 데스크톱 사용자 그룹·NLA 설정을 확인하세요.",
            _ => "문서에 없는 로그온 오류 코드입니다. 자격 증명·도메인·서버 정책을 확인하세요.",
        };
    }
}
