using System;
using System.Collections.Concurrent;
using System.IO;
using System.Threading.Tasks;

namespace FTPServerWinV10.Server
{
    public class LogManager
    {
        private readonly string logFilePath;
        private readonly BlockingCollection<string> logQueue = new BlockingCollection<string>();
        private bool running = true;

        public LogManager(string logFile)
        {
            logFilePath = logFile;
            Task.Run(() => ProcessQueue());
        }

        public void WriteLog(string message)
        {
            logQueue.Add($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}");
        }

        private void ProcessQueue()
        {
            using (var writer = new StreamWriter(logFilePath, true))
            {
                while (running || logQueue.Count > 0)
                {
                    if (logQueue.TryTake(out var log, TimeSpan.FromSeconds(1)))
                    {
                        writer.WriteLine(log);
                        writer.Flush();
                    }
                }
            }
        }

        public void Stop()
        {
            running = false;
        }
    }
}
