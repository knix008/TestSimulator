namespace VIXFaceTest.Utils
{
    public static class Logger
    {
        private const string DateTimeFormat = "yyyy-MM-dd HH:mm:ss";

        public static void LogMessage(TextBox logTextBox, string message)
        {
            if (logTextBox == null) return;

            var logEntry = $"[{DateTime.Now.ToString(DateTimeFormat)}] {message}\r\n";

            if (logTextBox.InvokeRequired)
            {
                logTextBox.Invoke(() => logTextBox.AppendText(logEntry));
            }
            else
            {
                logTextBox.AppendText(logEntry);
            }
        }

        public static string GetCurrentTimeStamp()
        {
            return DateTime.Now.ToString(DateTimeFormat);
        }

        public static string WithTimeStamp(string message)
        {
            return $"[{GetCurrentTimeStamp()}] {message}";
        }
    }
}
