using System;

namespace FTPServerWinV10.Server
{
    public class SftpServerManager
    {
        public event Action<string>? OnLog;
        public string RootPath { get; set; } = "";
        public bool AllowAnonymous { get; set; } = true;
        public string UserId { get; set; } = "";
        public string UserPassword { get; set; } = "";

        public void Start()
        {
            OnLog?.Invoke($"SFTP 서버 시작 (폴더: {RootPath}, 계정: {(AllowAnonymous ? "익명" : UserId)})");
        }

        public void Stop()
        {
            OnLog?.Invoke("SFTP 서버 중지");
        }
    }
}
