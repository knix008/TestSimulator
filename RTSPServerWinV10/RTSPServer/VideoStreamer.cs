using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace RTSPServer
{
    /// <summary>
    /// 비디오 스트리밍 처리 클래스
    /// </summary>
    public class VideoStreamer
    {
        private readonly string _videoFilePath;
        private FileStream? _fileStream;
        private bool _isStreaming;
        private CancellationTokenSource? _cancellationTokenSource;

        public event EventHandler<byte[]>? DataAvailable;
        public event EventHandler<string>? LogMessage;

        public bool IsStreaming => _isStreaming;
        public string VideoFilePath => _videoFilePath;

        public VideoStreamer(string videoFilePath)
        {
            _videoFilePath = videoFilePath;
        }

        public async Task StartStreamingAsync()
        {
            if (_isStreaming) return;

            if (!File.Exists(_videoFilePath))
            {
                Log($"비디오 파일을 찾을 수 없습니다: {_videoFilePath}");
                return;
            }

            try
            {
                _fileStream = new FileStream(_videoFilePath, FileMode.Open, FileAccess.Read, FileShare.Read);
                _isStreaming = true;
                _cancellationTokenSource = new CancellationTokenSource();

                Log($"스트리밍 시작: {Path.GetFileName(_videoFilePath)}");

                await StreamDataAsync(_cancellationTokenSource.Token);
            }
            catch (Exception ex)
            {
                Log($"스트리밍 시작 오류: {ex.Message}");
                _isStreaming = false;
            }
        }

        public void StopStreaming()
        {
            if (!_isStreaming) return;

            _cancellationTokenSource?.Cancel();
            _fileStream?.Dispose();
            _fileStream = null;
            _isStreaming = false;

            Log("스트리밍 중지");
        }

        private async Task StreamDataAsync(CancellationToken cancellationToken)
        {
            const int bufferSize = 1316; // RTP 페이로드 크기
            var buffer = new byte[bufferSize];

            while (!cancellationToken.IsCancellationRequested && _fileStream != null)
            {
                try
                {
                    var bytesRead = await _fileStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
                    
                    if (bytesRead == 0)
                    {
                        // 파일 끝에 도달하면 처음으로 되돌아감 (루프)
                        _fileStream.Seek(0, SeekOrigin.Begin);
                        continue;
                    }

                    var data = new byte[bytesRead];
                    Array.Copy(buffer, data, bytesRead);
                    
                    DataAvailable?.Invoke(this, data);

                    // 스트리밍 속도 조절 (대략 30fps 기준)
                    await Task.Delay(33, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Log($"스트리밍 오류: {ex.Message}");
                    break;
                }
            }
        }

        private void Log(string message)
        {
            LogMessage?.Invoke(this, $"[{DateTime.Now:HH:mm:ss}] {message}");
        }
    }
}
