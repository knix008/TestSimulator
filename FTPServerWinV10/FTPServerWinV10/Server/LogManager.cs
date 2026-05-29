using System.Collections.Concurrent;

namespace FTPServerWinV10.Server
{
    public sealed class LogManager : IDisposable
    {
        private readonly string _logFilePath;
        private readonly BlockingCollection<string> _logQueue = new();
        private readonly Task _writerTask;
        private bool _disposed;

        public string LogFilePath => _logFilePath;

        public LogManager(string logFile)
        {
            _logFilePath = logFile;
            var dir = Path.GetDirectoryName(logFile);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
            _writerTask = Task.Run(ProcessQueue);
        }

        public void WriteLog(string message)
        {
            if (_disposed) return;
            try
            {
                _logQueue.Add($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}");
            }
            catch (InvalidOperationException)
            {
                // Queue completed during shutdown.
            }
        }

        private void ProcessQueue()
        {
            try
            {
                foreach (var log in _logQueue.GetConsumingEnumerable())
                    AppendLineToFile(log);
            }
            catch
            {
                // Writer thread must not crash the app.
            }
        }

        private void AppendLineToFile(string line)
        {
            File.AppendAllText(_logFilePath, line + Environment.NewLine);
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _logQueue.CompleteAdding();
            try { _writerTask.Wait(TimeSpan.FromSeconds(5)); } catch { }
        }
    }
}
