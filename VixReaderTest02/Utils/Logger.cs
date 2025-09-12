namespace VixReaderTest01.Utils
{
    public static class Logger
    {
        private const string DateTimeFormat = "yyyy-MM-dd HH:mm:ss";

        /// <summary>
        /// TextBox에 일관된 날짜/시간 형식으로 로그 메시지를 추가합니다.
        /// </summary>
        /// <param name="logTextBox">로그를 표시할 TextBox</param>
        /// <param name="message">로그 메시지</param>
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

        /// <summary>
        /// 현재 시간을 표준 형식으로 반환합니다.
        /// </summary>
        /// <returns>yyyy-MM-dd HH:mm:ss 형식의 시간 문자열</returns>
        public static string GetCurrentTimeStamp()
        {
            return DateTime.Now.ToString(DateTimeFormat);
        }

        /// <summary>
        /// 메시지에 타임스탬프를 추가한 문자열을 반환합니다.
        /// </summary>
        /// <param name="message">메시지</param>
        /// <returns>타임스탬프가 추가된 메시지</returns>
        public static string WithTimeStamp(string message)
        {
            return $"[{GetCurrentTimeStamp()}] {message}";
        }
    }
}