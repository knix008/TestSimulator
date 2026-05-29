namespace FTPServerWinV10.Server
{
    public class ProtocolSettings
    {
        public const int DefaultFtpPort = 21;
        public const int DefaultFtpsPort = 990;
        public const int DefaultSftpPort = 22;

        public bool EnableFtp { get; set; } = true;
        public bool EnableFtps { get; set; }
        public bool EnableSftp { get; set; }
        public int FtpPort { get; set; } = DefaultFtpPort;
        public int FtpsPort { get; set; } = DefaultFtpsPort;
        public int SftpPort { get; set; } = DefaultSftpPort;

        public static int NormalizePort(int port, int defaultPort) =>
            port > 0 ? port : defaultPort;
    }
}
