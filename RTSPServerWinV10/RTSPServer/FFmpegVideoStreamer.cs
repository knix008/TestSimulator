using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace RTSPServer
{
    /// <summary>
    /// FFmpeg를 사용하여 비디오를 H.264로 인코딩하고 RTP로 스트리밍
    /// </summary>
    public class FFmpegVideoStreamer : IDisposable
    {
        private readonly string _videoFilePath;
        private Process? _ffmpegProcess;
        private bool _isStreaming;
        private CancellationTokenSource? _cancellationTokenSource;
        private readonly H264RtpPacketizer _packetizer;
        private readonly List<Action<byte[]>> _rtpDataHandlers = new();

        public event EventHandler<string>? LogMessage;
        public bool IsStreaming => _isStreaming;
        public string VideoFilePath => _videoFilePath;

        public FFmpegVideoStreamer(string videoFilePath)
        {
            _videoFilePath = videoFilePath;
            _packetizer = new H264RtpPacketizer();
        }

        /// <summary>
        /// RTP 패킷 핸들러 등록
        /// </summary>
        public void AddRtpPacketHandler(Action<byte[]> handler)
        {
            _rtpDataHandlers.Add(handler);
        }

        /// <summary>
        /// 스트리밍 시작
        /// </summary>
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
                _isStreaming = true;
                _cancellationTokenSource = new CancellationTokenSource();

                Log($"FFmpeg 스트리밍 시작: {Path.GetFileName(_videoFilePath)}");

                await RunFFmpegStreamAsync(_cancellationTokenSource.Token);
            }
            catch (Exception ex)
            {
                Log($"스트리밍 시작 오류: {ex.Message}");
                _isStreaming = false;
            }
        }

        /// <summary>
        /// 스트리밍 중지
        /// </summary>
        public void StopStreaming()
        {
            if (!_isStreaming) return;

            _cancellationTokenSource?.Cancel();
            _ffmpegProcess?.Kill();
            _ffmpegProcess?.Dispose();
            _ffmpegProcess = null;
            _isStreaming = false;

            Log("FFmpeg 스트리밍 중지");
        }

        private async Task RunFFmpegStreamAsync(CancellationToken cancellationToken)
        {
            // FFmpeg 명령: 비디오를 H.264 Annex-B 형식으로 출력
            var ffmpegArgs = $"-re -stream_loop -1 -i \"{_videoFilePath}\" " +
                           $"-c:v libx264 -preset ultrafast -tune zerolatency " +
                           $"-profile:v baseline -level 3.0 " +
                           $"-b:v 1000k -maxrate 1000k -bufsize 2000k " +
                           $"-g 30 -keyint_min 30 -sc_threshold 0 " +
                           $"-an " + // 오디오 제거
                           $"-f h264 " +
                           $"-bsf:v h264_mp4toannexb " + // Annex-B 형식
                           $"pipe:1"; // stdout으로 출력

            _ffmpegProcess = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "ffmpeg",
                    Arguments = ffmpegArgs,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                }
            };

            try
            {
                _ffmpegProcess.Start();

                // 에러 출력 로깅
                _ = Task.Run(() =>
                {
                    while (!_ffmpegProcess.StandardError.EndOfStream)
                    {
                        var line = _ffmpegProcess.StandardError.ReadLine();
                        if (!string.IsNullOrEmpty(line) && line.Contains("frame="))
                        {
                            // 진행 상황만 로깅 (너무 많은 로그 방지)
                            Log($"FFmpeg: {line.Trim()}");
                        }
                    }
                }, cancellationToken);

                // H.264 스트림 읽기 및 NAL units 추출
                await ReadH264StreamAsync(_ffmpegProcess.StandardOutput.BaseStream, cancellationToken);
            }
            catch (Exception ex)
            {
                if (!cancellationToken.IsCancellationRequested)
                {
                    Log($"FFmpeg 실행 오류: {ex.Message}");
                    Log("FFmpeg가 설치되지 않았거나 PATH에 없습니다. https://ffmpeg.org/download.html에서 다운로드하세요.");
                }
            }
        }

        private async Task ReadH264StreamAsync(Stream stream, CancellationToken cancellationToken)
        {
            var buffer = new List<byte>();
            var readBuffer = new byte[8192];

            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    var bytesRead = await stream.ReadAsync(readBuffer, 0, readBuffer.Length, cancellationToken);
                    if (bytesRead == 0) break;

                    // NAL unit 시작 코드 찾기 (0x00 0x00 0x00 0x01 또는 0x00 0x00 0x01)
                    for (int i = 0; i < bytesRead; i++)
                    {
                        buffer.Add(readBuffer[i]);

                        // NAL unit 시작 코드 감지
                        if (buffer.Count >= 4)
                        {
                            var lastFour = buffer.GetRange(buffer.Count - 4, 4);
                            
                            // 0x00 0x00 0x00 0x01 시작 코드
                            if (lastFour[0] == 0 && lastFour[1] == 0 && lastFour[2] == 0 && lastFour[3] == 1)
                            {
                                if (buffer.Count > 4)
                                {
                                    // 이전 NAL unit 처리
                                    var nalUnit = buffer.GetRange(0, buffer.Count - 4).ToArray();
                                    if (nalUnit.Length > 0)
                                    {
                                        await ProcessNalUnitAsync(nalUnit);
                                    }
                                }
                                buffer.Clear();
                                buffer.AddRange(new byte[] { 0, 0, 0, 1 });
                            }
                        }

                        if (buffer.Count >= 3 && buffer.Count < 4)
                        {
                            var lastThree = buffer.GetRange(buffer.Count - 3, 3);
                            
                            // 0x00 0x00 0x01 시작 코드
                            if (lastThree[0] == 0 && lastThree[1] == 0 && lastThree[2] == 1)
                            {
                                if (buffer.Count > 3)
                                {
                                    // 이전 NAL unit 처리
                                    var nalUnit = buffer.GetRange(0, buffer.Count - 3).ToArray();
                                    if (nalUnit.Length > 0)
                                    {
                                        await ProcessNalUnitAsync(nalUnit);
                                    }
                                }
                                buffer.Clear();
                                buffer.AddRange(new byte[] { 0, 0, 1 });
                            }
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Log($"H.264 스트림 읽기 오류: {ex.Message}");
                    break;
                }
            }
        }

        private async Task ProcessNalUnitAsync(byte[] nalUnit)
        {
            if (nalUnit.Length == 0) return;

            // NAL unit 시작 코드 제거
            int startIndex = 0;
            if (nalUnit.Length >= 4 && nalUnit[0] == 0 && nalUnit[1] == 0 && nalUnit[2] == 0 && nalUnit[3] == 1)
            {
                startIndex = 4;
            }
            else if (nalUnit.Length >= 3 && nalUnit[0] == 0 && nalUnit[1] == 0 && nalUnit[2] == 1)
            {
                startIndex = 3;
            }

            if (startIndex >= nalUnit.Length) return;

            var nalUnitWithoutStartCode = new byte[nalUnit.Length - startIndex];
            Array.Copy(nalUnit, startIndex, nalUnitWithoutStartCode, 0, nalUnitWithoutStartCode.Length);

            // RTP 패킷으로 변환
            var rtpPackets = _packetizer.PacketizeNalUnit(nalUnitWithoutStartCode);

            // 모든 등록된 핸들러에 RTP 패킷 전달
            foreach (var packet in rtpPackets)
            {
                foreach (var handler in _rtpDataHandlers)
                {
                    handler(packet);
                }
            }

            // 패킷 전송 속도 제어 (네트워크 혼잡 방지)
            await Task.Delay(1, CancellationToken.None);
        }

        private void Log(string message)
        {
            LogMessage?.Invoke(this, $"[{DateTime.Now:HH:mm:ss}] {message}");
        }

        public void Dispose()
        {
            StopStreaming();
        }
    }
}
