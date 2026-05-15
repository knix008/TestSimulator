using RemoteViewing.Vnc;

namespace RemoteDesktopWinV10.App;

/// <summary><see cref="VncFailureReason"/>에 대한 사용자 안내(한글).</summary>
internal static class VncFailureReasonUserHints
{
    public static string GetHint(VncFailureReason reason)
    {
        return reason switch
        {
            VncFailureReason.ServerOfferedNoAuthenticationMethods =>
                "서버가 ‘보안(인증) 방식’ 목록을 0으로 보내 연결을 거부한 상태입니다. (RFB 3.8)\r\n"
                + "• 위 ‘메시지’에 서버가 보낸 영문 설명이 있으면 그대로 확인하세요.\r\n"
                + "• 포트가 VNC가 아닌 다른 프로그램(웹·DB 등)이면 잘못된 포트입니다. 디스플레이 :n → 보통 5900+n (예: :1 → 5901).\r\n"
                + "• 원격 PC에서 VNC 서비스가 꺼져 있거나, 접속이 일시적으로 막힌 경우입니다.\r\n"
                + "이 클라이언트는 기본 VNC(None / VNC Password)만 지원합니다.",

            VncFailureReason.NoSupportedAuthenticationMethods =>
                "서버가 제시한 인증 방식을 이 프로그램이 지원하지 않습니다.\r\n"
                + "• RealVNC 등 TLS·VeNCrypt만 허용하는 설정이면, TightVNC/UltraVNC처럼 ‘표준 VNC 인증’을 켜거나 None+Password를 허용하도록 서버를 바꿔야 할 수 있습니다.",

            VncFailureReason.PasswordRequired =>
                "서버가 암호를 요구하는데 암호가 비어 있습니다. 암호를 입력하세요.",

            VncFailureReason.AuthenticationFailed =>
                "인증 단계에서 서버가 거부했습니다. 위 ‘메시지’의 영문이 서버가 보낸 이유입니다.\r\n"
                + "• 암호 오류, 앞 8자만 유효(VNC 표준), 대소문자.\r\n"
                + "• 루프백(localhost) 차단 메시지면 아래 [루프백] 안내를 참고하세요.",

            VncFailureReason.UnsupportedProtocolVersion =>
                "이 클라이언트는 RFB 3.8만 사용합니다. 서버가 3.8 미만이면 연결할 수 없습니다.",

            VncFailureReason.WrongKindOfServer =>
                "해당 주소·포트에서 VNC(RFB) 핸드셰이크가 아닌 응답이 왔습니다. 포트와 서비스 종류를 확인하세요.",

            _ => "",
        };
    }

    /// <summary>서버가 보낸 <paramref name="message"/>에 따른 추가 안내(한글).</summary>
    public static string? GetMessageSpecificHint(string? message)
    {
        if (string.IsNullOrEmpty(message))
        {
            return null;
        }

        if (message.Contains("loopback", StringComparison.OrdinalIgnoreCase))
        {
            return "[루프백(localhost / 127.0.0.1) 접속 거부]\r\n"
                + "이 문구는 VNC 서버 프로그램이 같은 PC에서의 뷰어 접속을 막을 때 흔히 보냅니다. 이 클라이언트 옵션으로는 우회할 수 없습니다.\r\n\r\n"
                + "• TightVNC 서버: 트레이 아이콘 → 제어 위원회(또는 구성) → 서버 → 접근 제어 → Allow loopback connections(루프백 연결 허용)을 켭니다.\r\n"
                + "• UltraVNC 서버: Admin Properties → Allow Loopback Connections.\r\n"
                + "• 임시 우회: 호스트를 이 PC의 컴퓨터 이름 또는 LAN IP(예: 192.168.x.x)로 입력해 접속해 보세요.";
        }

        return null;
    }
}
