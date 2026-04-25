using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace RTSPServer
{
    /// <summary>
    /// FFmpeg를 사용하여 비디오와 오디오를 동시에 H.264/AAC로 인코딩하고 RTP로 스트리밍
    /// </summary>
    public class MediaStreamer : IDisposable
    {
        private readonly string _videoFilePath;
        private Process? _videoProcess;
        private Process? _audioProcess;
        private bool _isStreaming;
        private CancellationTokenSource? _cancellationTokenSource;
        private readonly H264RtpPacketizer _videoPacketizer;
        private readonly AacRtpPacketizer _audioPacketizer;
        private readonly List<Action<byte[]>> _videoRtpHandlers = new();
        private readonly List<Action<byte[]>> _audioRtpHandlers = new();

        public event EventHandler<string>? LogMessage;
        public bool IsStreaming => _isStreaming;
        public string VideoFilePath => _videoFilePath;

        public MediaStreamer(string videoFilePath)
        {
            _videoFilePath = videoFilePath;
            _videoPacketizer = new H264RtpPacketizer();
            _audioPacketizer = new AacRtpPacketizer();
        }

        /// <summary>
        /// 비디오 RTP 패킷 핸들러 등록
        /// </summary>
        public void AddVideoRtpHandler(Action<byte[]> handler)
        {
            _videoRtpHandlers.Add(handler);
        }

        /// <summary>
        /// 오디오 RTP 패킷 핸들러 등록
        /// </summary>
        public void AddAudioRtpHandler(Action<byte[]> handler)
        {
            _audioRtpHandlers.Add(handler);
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

                Log($"비디오/오디오 스트리밍 시작: {Path.GetFileName(_videoFilePath)}");

                // 비디오와 오디오 스트림 동시 시작
                var videoTask = StartVideoStreamAsync(_cancellationTokenSource.Token);
                var audioTask = StartAudioStreamAsync(_cancellationTokenSource.Token);

                await Task.WhenAll(videoTask, audioTask);
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
            
            try { _videoProcess?.Kill(); } catch { }
            try { _audioProcess?.Kill(); } catch { }
            
            _videoProcess?.Dispose();
            _audioProcess?.Dispose();
            _videoProcess = null;
            _audioProcess = null;
            _isStreaming = false;

            Log("스트리밍 중지");
        }

        private async Task StartVideoStreamAsync(CancellationToken cancellationToken)
        {
            // FFmpeg 명령: 비디오만 H.264로 출력
            var ffmpegArgs = $"-re -stream_loop -1 -i \"{_videoFilePath}\" " +
                           $"-c:v libx264 -preset ultrafast -tune zerolatency " +
                           $"-profile:v baseline -level 3.0 " +
                           $"-b:v 1000k -maxrate 1000k -bufsize 2000k " +
                           $"-g 30 -keyint_min 30 -sc_threshold 0 " +
                           $"-an " + // 오디오 제거
                           $"-f h264 " +
                           $"-bsf:v h264_mp4toannexb " +
                           $"pipe:1";

            _videoProcess = new Process
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
                _videoProcess.Start();
                Log("비디오 스트림 시작");

                // 비디오 스트림 읽기
                await ReadH264StreamAsync(_videoProcess.StandardOutput.BaseStream, cancellationToken);
            }
            catch (Exception ex)
            {
                if (!cancellationToken.IsCancellationRequested)
                {
                    Log($"비디오 스트림 오류: {ex.Message}");
                }
            }
        }

        private async Task StartAudioStreamAsync(CancellationToken cancellationToken)
        {
            // FFmpeg 명령: 오디오만 AAC로 출력
            var ffmpegArgs = $"-re -stream_loop -1 -i \"{_videoFilePath}\" " +
                           $"-vn " + // 비디오 제거
                           $"-c:a aac -b:a 128k -ar 44100 -ac 2 " +
                           $"-f adts " + // ADTS 형식 (AAC with headers)
                           $"pipe:1";

            _audioProcess = new Process
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
                _audioProcess.Start();
                Log("오디오 스트림 시작");

                // 오디오 스트림 읽기
                await ReadAacStreamAsync(_audioProcess.StandardOutput.BaseStream, cancellationToken);
            }
            catch (Exception ex)
            {
                if (!cancellationToken.IsCancellationRequested)
                {
                    Log($"오디오 스트림 오류: {ex.Message}");
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

                    for (int i = 0; i < bytesRead; i++)
                    {
                        buffer.Add(readBuffer[i]);

                        // NAL unit 시작 코드 감지
                        if (buffer.Count >= 4)
                        {
                            var lastFour = buffer.GetRange(buffer.Count - 4, 4);
                            
                            if (lastFour[0] == 0 && lastFour[1] == 0 && lastFour[2] == 0 && lastFour[3] == 1)
                            {
                                if (buffer.Count > 4)
                                {
                                    var nalUnit = buffer.GetRange(0, buffer.Count - 4).ToArray();
                                    if (nalUnit.Length > 0)
                                    {
                                        await ProcessVideoNalUnitAsync(nalUnit);
                                    }
                                }
                                buffer.Clear();
                                buffer.AddRange(new byte[] { 0, 0, 0, 1 });
                            }
                        }

                        if (buffer.Count >= 3 && buffer.Count < 4)
                        {
                            var lastThree = buffer.GetRange(buffer.Count - 3, 3);
                            
                            if (lastThree[0] == 0 && lastThree[1] == 0 && lastThree[2] == 1)
                            {
                                if (buffer.Count > 3)
                                {
                                    var nalUnit = buffer.GetRange(0, buffer.Count - 3).ToArray();
                                    if (nalUnit.Length > 0)
                                    {
                                        await ProcessVideoNalUnitAsync(nalUnit);
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

        private async Task ReadAacStreamAsync(Stream stream, CancellationToken cancellationToken)
        {
            var buffer = new byte[8192];

            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
                    if (bytesRead == 0) break;

                    // ADTS 프레임 파싱
                    int offset = 0;
                    while (offset < bytesRead)
                    {
                        // ADTS 싱크워드 찾기 (0xFFF)
                        if (offset + 7 > bytesRead) break;
                        
                        if (buffer[offset] == 0xFF && (buffer[offset + 1] & 0xF0) == 0xF0)
                        {
                            // ADTS 헤더에서 프레임 길이 추출
                            int frameLength = ((buffer[offset + 3] & 0x03) << 11) |
                                            (buffer[offset + 4] << 3) |
                                            ((buffer[offset + 5] & 0xE0) >> 5);

                            if (offset + frameLength <= bytesRead)
                            {
                                // ADTS 헤더 제거 (7 or 9 bytes)
                                int headerSize = (buffer[offset + 1] & 0x01) == 0 ? 9 : 7;
                                int payloadSize = frameLength - headerSize;

                                if (payloadSize > 0 && offset + headerSize + payloadSize <= bytesRead)
                                {
                                    var aacFrame = new byte[payloadSize];
                                    Array.Copy(buffer, offset + headerSize, aacFrame, 0, payloadSize);
                                    
                                    await ProcessAudioFrameAsync(aacFrame);
                                }

                                offset += frameLength;
                            }
                            else
                            {
                                break; // 불완전한 프레임, 다음 읽기에서 처리
                            }
                        }
                        else
                        {
                            offset++;
                        }
                    }

                    await Task.Delay(10, cancellationToken); // 속도 제어
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Log($"AAC 스트림 읽기 오류: {ex.Message}");
                    break;
                }
            }
        }

        private async Task ProcessVideoNalUnitAsync(byte[] nalUnit)
        {
            if (nalUnit.Length == 0) return;

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

            var rtpPackets = _videoPacketizer.PacketizeNalUnit(nalUnitWithoutStartCode);

            foreach (var packet in rtpPackets)
            {
                foreach (var handler in _videoRtpHandlers)
                {
                    handler(packet);
                }
            }

            await Task.Delay(1, CancellationToken.None);
        }

        private async Task ProcessAudioFrameAsync(byte[] aacFrame)
        {
            if (aacFrame.Length == 0) return;

            var rtpPackets = _audioPacketizer.PacketizeAacFrame(aacFrame);

            foreach (var packet in rtpPackets)
            {
                foreach (var handler in _audioRtpHandlers)
                {
                    handler(packet);
                }
            }

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
