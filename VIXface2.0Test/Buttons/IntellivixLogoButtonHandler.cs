using System.Diagnostics;

namespace VIXFaceTest
{
    public partial class Main
    {
        private void IntellivixLogo_Click(object sender, EventArgs e)
        {
            try
            {
                var versionInfo = FileVersionInfo.GetVersionInfo(Application.ExecutablePath);
                var buildDate = File.GetLastWriteTime(Application.ExecutablePath);
                
                string aboutText = $"VIXface Firmware Test Program\n\n" +
                                 $"Version: {versionInfo.FileVersion ?? "2.0.0"}\n" +
                                 $"Product Version: {versionInfo.ProductVersion ?? "2.0.0"}\n" +
                                 $"Build Date: {buildDate:yyyy-MM-dd HH:mm:ss}\n" +
                                 $"Framework: .NET 8.0\n\n" +
                                 $"Target: VIXface2.0Simulator\n" +
                                 $"Protocol: TLS 8443 (AT + JSON)\n" +
                                 $"Database: SQLite\n\n" +
                                 $"Machine: {Environment.MachineName}\n" +
                                 $"OS: {Environment.OSVersion}\n" +
                                 $"User: {Environment.UserName}\n\n" +
                                 $"Copyright © Intellivix Corporation\n" +
                                 $"VIXface2.0Simulator 지원 API만 사용합니다.";

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