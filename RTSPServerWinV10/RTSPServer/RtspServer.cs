using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace RTSPServer
{
    /// <summary>
    /// RTSP 서버 구현
    /// </summary>
    public class RtspServer
    {
        private TcpListener? _listener;
        private CancellationTokenSource? _cancellationTokenSource;
        private bool _isRunning;
        private readonly int _port;
        private readonly ConcurrentBag<RtspClientSession> _clients;
        private MediaStreamer? _mediaStreamer;

        public event EventHandler<string>? LogMessage;
        public bool IsRunning => _isRunning;
        public int Port => _port;

        public RtspServer(int port = 554)
        {
            _port = port;
            _clients = new ConcurrentBag<RtspClientSession>();
        }

        public void SetVideoSource(string videoFilePath)
        {
            _mediaStreamer = new MediaStreamer(videoFilePath);
            _mediaStreamer.LogMessage += (s, msg) => Log(msg);
        }

        public async Task StartAsync()
        {
            if (_isRunning) return;

            try
            {
                _listener = new TcpListener(IPAddress.Any, _port);
                _listener.Start();
                _isRunning = true;
                _cancellationTokenSource = new CancellationTokenSource();

                Log($"RTSP 서버가 포트 {_port}에서 시작되었습니다.");

                await AcceptClientsAsync(_cancellationTokenSource.Token);
            }
            catch (Exception ex)
            {
                Log($"서버 시작 오류: {ex.Message}");
                _isRunning = false;
            }
        }

        public void Stop()
        {
            if (!_isRunning) return;

            _cancellationTokenSource?.Cancel();
            _listener?.Stop();
            _isRunning = false;

            foreach (var client in _clients)
            {
                client.Dispose();
            }

            Log("RTSP 서버가 중지되었습니다.");
        }

        private async Task AcceptClientsAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested && _listener != null)
            {
                try
                {
                    var tcpClient = await _listener.AcceptTcpClientAsync(cancellationToken);
                    var clientSession = new RtspClientSession(tcpClient, _mediaStreamer);
                    _clients.Add(clientSession);

                    Log($"클라이언트 연결됨: {tcpClient.Client.RemoteEndPoint}");

                    _ = Task.Run(() => HandleClientAsync(clientSession, cancellationToken), cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Log($"클라이언트 수락 오류: {ex.Message}");
                }
            }
        }

        private async Task HandleClientAsync(RtspClientSession session, CancellationToken cancellationToken)
        {
            try
            {
                await session.HandleSessionAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                Log($"클라이언트 처리 오류: {ex.Message}");
            }
            finally
            {
                session.Dispose();
                Log($"클라이언트 연결 종료");
            }
        }

        private void Log(string message)
        {
            LogMessage?.Invoke(this, $"[{DateTime.Now:HH:mm:ss}] {message}");
        }
    }

    /// <summary>
    /// RTSP 클라이언트 세션
    /// </summary>
    internal class RtspClientSession : IDisposable
    {
        private readonly TcpClient _tcpClient;
        private readonly NetworkStream _stream;
        private readonly MediaStreamer? _mediaStreamer;
        private string _sessionId;
        private UdpClient? _videoRtpSocket;
        private UdpClient? _audioRtpSocket;
        private IPEndPoint? _clientVideoRtpEndPoint;
        private IPEndPoint? _clientAudioRtpEndPoint;

        public RtspClientSession(TcpClient tcpClient, MediaStreamer? mediaStreamer)
        {
            _tcpClient = tcpClient;
            _stream = tcpClient.GetStream();
            _mediaStreamer = mediaStreamer;
            _sessionId = Guid.NewGuid().ToString("N").Substring(0, 8);
        }

        public async Task HandleSessionAsync(CancellationToken cancellationToken)
        {
            var buffer = new byte[4096];
            
            while (!cancellationToken.IsCancellationRequested && _tcpClient.Connected)
            {
                try
                {
                    var bytesRead = await _stream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
                    if (bytesRead == 0) break;

                    var request = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                    await ProcessRequestAsync(request, cancellationToken);
                }
                catch (Exception)
                {
                    break;
                }
            }
        }

        private async Task ProcessRequestAsync(string request, CancellationToken cancellationToken)
        {
            var lines = request.Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
            if (lines.Length == 0) return;

            var requestLine = lines[0];
            var parts = requestLine.Split(' ');
            if (parts.Length < 2) return;

            var method = parts[0];
            var cseqLine = Array.Find(lines, l => l.StartsWith("CSeq:", StringComparison.OrdinalIgnoreCase));
            var cseq = cseqLine?.Split(':')[1].Trim() ?? "0";

            string response = method switch
            {
                "OPTIONS" => BuildOptionsResponse(cseq),
                "DESCRIBE" => BuildDescribeResponse(cseq),
                "SETUP" => BuildSetupResponse(cseq, request),
                "PLAY" => BuildPlayResponse(cseq),
                "TEARDOWN" => BuildTeardownResponse(cseq),
                _ => BuildNotImplementedResponse(cseq)
            };

            var responseBytes = Encoding.UTF8.GetBytes(response);
            await _stream.WriteAsync(responseBytes, 0, responseBytes.Length, cancellationToken);
        }

        private string BuildOptionsResponse(string cseq)
        {
            return $"RTSP/1.0 200 OK\r\n" +
                   $"CSeq: {cseq}\r\n" +
                   $"Public: OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN\r\n" +
                   $"\r\n";
        }

        private string BuildDescribeResponse(string cseq)
        {
            var sdp = "v=0\r\n" +
                     "o=- 0 0 IN IP4 127.0.0.1\r\n" +
                     "s=RTSP Server Stream\r\n" +
                     "c=IN IP4 0.0.0.0\r\n" +
                     "t=0 0\r\n" +
                     "m=video 0 RTP/AVP 96\r\n" +
                     "a=rtpmap:96 H264/90000\r\n" +
                     "a=control:track1\r\n" +
                     "m=audio 0 RTP/AVP 97\r\n" +
                     "a=rtpmap:97 mpeg4-generic/44100/2\r\n" +
                     "a=fmtp:97 streamtype=5;profile-level-id=1;mode=AAC-hbr;sizelength=13;indexlength=3;indexdeltalength=3;config=1210\r\n" +
                     "a=control:track2\r\n";

            return $"RTSP/1.0 200 OK\r\n" +
                   $"CSeq: {cseq}\r\n" +
                   $"Content-Type: application/sdp\r\n" +
                   $"Content-Length: {sdp.Length}\r\n" +
                   $"\r\n" +
                   $"{sdp}";
        }

        private string BuildSetupResponse(string cseq, string request)
        {
            // 요청 URL에서 track 확인
            var requestLine = request.Split(new[] { "\r\n" }, StringSplitOptions.None)[0];
            bool isAudioTrack = requestLine.Contains("track2");

            // 클라이언트의 RTP 포트 파싱
            var transportLine = request.Split(new[] { "\r\n" }, StringSplitOptions.None)
                .FirstOrDefault(l => l.StartsWith("Transport:", StringComparison.OrdinalIgnoreCase));
            
            int clientRtpPort = isAudioTrack ? 8002 : 8000;
            if (transportLine != null && transportLine.Contains("client_port="))
            {
                var portPart = transportLine.Split(new[] { "client_port=" }, StringSplitOptions.None)[1];
                var ports = portPart.Split('-', ';')[0];
                int.TryParse(ports, out clientRtpPort);
            }

            // 클라이언트 IP 주소 가져오기
            var clientIp = ((IPEndPoint)_tcpClient.Client.RemoteEndPoint!).Address;

            if (isAudioTrack)
            {
                // 오디오 UDP 소켓 생성
                _audioRtpSocket = new UdpClient(0);
                var serverRtpPort = ((IPEndPoint)_audioRtpSocket.Client.LocalEndPoint!).Port;
                _clientAudioRtpEndPoint = new IPEndPoint(clientIp, clientRtpPort);

                return $"RTSP/1.0 200 OK\r\n" +
                       $"CSeq: {cseq}\r\n" +
                       $"Session: {_sessionId}\r\n" +
                       $"Transport: RTP/AVP;unicast;client_port={clientRtpPort}-{clientRtpPort + 1};server_port={serverRtpPort}-{serverRtpPort + 1}\r\n" +
                       $"\r\n";
            }
            else
            {
                // 비디오 UDP 소켓 생성
                _videoRtpSocket = new UdpClient(0);
                var serverRtpPort = ((IPEndPoint)_videoRtpSocket.Client.LocalEndPoint!).Port;
                _clientVideoRtpEndPoint = new IPEndPoint(clientIp, clientRtpPort);

                return $"RTSP/1.0 200 OK\r\n" +
                       $"CSeq: {cseq}\r\n" +
                       $"Session: {_sessionId}\r\n" +
                       $"Transport: RTP/AVP;unicast;client_port={clientRtpPort}-{clientRtpPort + 1};server_port={serverRtpPort}-{serverRtpPort + 1}\r\n" +
                       $"\r\n";
            }
        }

        private string BuildPlayResponse(string cseq)
        {
            // PLAY 명령을 받으면 비디오/오디오 스트리밍 시작
            if (_mediaStreamer != null && _videoRtpSocket != null && _clientVideoRtpEndPoint != null)
            {
                // 비디오 RTP 패킷 핸들러 등록
                _mediaStreamer.AddVideoRtpHandler(rtpPacket =>
                {
                    try
                    {
                        if (_videoRtpSocket != null && _clientVideoRtpEndPoint != null)
                        {
                            _videoRtpSocket.Send(rtpPacket, rtpPacket.Length, _clientVideoRtpEndPoint);
                        }
                    }
                    catch
                    {
                        // 전송 실패 무시
                    }
                });

                // 오디오 RTP 패킷 핸들러 등록
                if (_audioRtpSocket != null && _clientAudioRtpEndPoint != null)
                {
                    _mediaStreamer.AddAudioRtpHandler(rtpPacket =>
                    {
                        try
                        {
                            if (_audioRtpSocket != null && _clientAudioRtpEndPoint != null)
                            {
                                _audioRtpSocket.Send(rtpPacket, rtpPacket.Length, _clientAudioRtpEndPoint);
                            }
                        }
                        catch
                        {
                            // 전송 실패 무시
                        }
                    });
                }

                _ = _mediaStreamer.StartStreamingAsync();
            }

            return $"RTSP/1.0 200 OK\r\n" +
                   $"CSeq: {cseq}\r\n" +
                   $"Session: {_sessionId}\r\n" +
                   $"Range: npt=0.000-\r\n" +
                   $"RTP-Info: url=rtsp://localhost/stream/track1;seq=0;rtptime=0,url=rtsp://localhost/stream/track2;seq=0;rtptime=0\r\n" +
                   $"\r\n";
        }

        private string BuildTeardownResponse(string cseq)
        {
            return $"RTSP/1.0 200 OK\r\n" +
                   $"CSeq: {cseq}\r\n" +
                   $"Session: {_sessionId}\r\n" +
                   $"\r\n";
        }

        private string BuildNotImplementedResponse(string cseq)
        {
            return $"RTSP/1.0 501 Not Implemented\r\n" +
                   $"CSeq: {cseq}\r\n" +
                   $"\r\n";
        }

        public void Dispose()
        {
            if (_mediaStreamer != null)
            {
                _mediaStreamer.StopStreaming();
            }
            _videoRtpSocket?.Dispose();
            _audioRtpSocket?.Dispose();
            _stream?.Dispose();
            _tcpClient?.Dispose();
        }
    }
}
