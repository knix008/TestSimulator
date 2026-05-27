namespace TerminalWinV10
{
    public static class ConnectionTypes
    {
        public const string Serial = "Serial";
        public const string TcpIp = "TCP/IP";
        public const string Local = "Local";
    }

    public sealed class TerminalConnectionSettings
    {
        public string ConnectionType { get; set; } = ConnectionTypes.Local;
        public string SerialPort { get; set; } = "COM1";
        public string Baud { get; set; } = "9600";
        public string Ip { get; set; } = "127.0.0.1";
        public string TcpPort { get; set; } = "8443";
        public bool UseSsl { get; set; }
        /// <summary>Local 연결 시 실행 파일. 비어 있으면 COMSPEC/cmd.exe 사용.</summary>
        public string LocalShell { get; set; } = "";

        public TerminalConnectionSettings Clone() => new()
        {
            ConnectionType = ConnectionType,
            SerialPort = SerialPort,
            Baud = Baud,
            Ip = Ip,
            TcpPort = TcpPort,
            UseSsl = UseSsl,
            LocalShell = LocalShell
        };
    }
}
