using System.Diagnostics;

namespace VixReaderTest01
{
    public partial class Main
    {
        private void IntellivixLogo_Click(object sender, EventArgs e)
        {
            try
            {
                var versionInfo = FileVersionInfo.GetVersionInfo(Application.ExecutablePath);
                var buildDate = File.GetLastWriteTime(Application.ExecutablePath);
                
                string aboutText = $"Intellivix Firmware Test Program\n\n" +
                                 $"Version: {versionInfo.FileVersion ?? "0.0.1"}\n" +
                                 $"Product Version: {versionInfo.ProductVersion ?? "1.0.0"}\n" +
                                 $"Build Date: {buildDate:yyyy-MM-dd HH:mm:ss}\n" +
                                 $"Framework: .NET 8.0\n" +
                                 $"C# Version: 12.0\n\n" +
                                 $"Target Device: VixReader\n" +
                                 $"Communication: TLS 1.3 (HTTPS)\n" +
                                 $"Database: SQLite\n\n" +
                                 $"Machine: {Environment.MachineName}\n" +
                                 $"OS: {Environment.OSVersion}\n" +
                                 $"User: {Environment.UserName}\n\n" +
                                 $"Copyright © 2024 Intellivix Corporation\n" +
                                 $"All rights reserved.\n\n" +
                                 $"이 소프트웨어는 VixReader 펌웨어 테스트 전용입니다.";

                MessageBox.Show(aboutText, "Intellivix 프로그램 정보", 
                              MessageBoxButtons.OK, MessageBoxIcon.Information);

                // 로그에도 클릭 이벤트 기록
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Intellivix 로고 클릭 - 프로그램 정보 표시\r\n");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 프로그램 정보 표시 오류: {ex.Message}\r\n");
                }

                // 오류 발생 시 간단한 정보 표시
                MessageBox.Show("Intellivix Firmware Test Program\nVersion 0.0.1\n\nAll rights reserved.",
                              "About", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
    }
}