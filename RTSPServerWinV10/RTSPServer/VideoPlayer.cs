using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading;

namespace RTSPServer
{
    /// <summary>
    /// 비디오 플레이어 상태
    /// </summary>
    public enum PlayerState
    {
        Stopped,
        Playing,
        Paused
    }

    /// <summary>
    /// 비디오 플레이어 클래스
    /// </summary>
    public class VideoPlayer
    {
        private string? _videoFilePath;
        private PlayerState _state;
        private CancellationTokenSource? _cancellationTokenSource;
        private readonly DispatcherTimer _timer;
        private TimeSpan _position;
        private TimeSpan _duration;

        public event EventHandler<PlayerState>? StateChanged;
        public event EventHandler<TimeSpan>? PositionChanged;
        public event EventHandler<string>? LogMessage;

        public PlayerState State => _state;
        public TimeSpan Position => _position;
        public TimeSpan Duration => _duration;
        public string? VideoFilePath => _videoFilePath;

        public VideoPlayer()
        {
            _state = PlayerState.Stopped;
            _timer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(100)
            };
            _timer.Tick += Timer_Tick;
        }

        public void LoadVideo(string filePath)
        {
            if (!File.Exists(filePath))
            {
                Log($"비디오 파일을 찾을 수 없습니다: {filePath}");
                return;
            }

            Stop();
            _videoFilePath = filePath;
            
            // 파일 크기 기반으로 대략적인 재생 시간 추정 (실제로는 MediaFoundation 등을 사용해야 함)
            var fileInfo = new FileInfo(filePath);
            _duration = TimeSpan.FromSeconds(fileInfo.Length / (1024 * 1024)); // 대략적 추정
            
            _position = TimeSpan.Zero;
            
            Log($"비디오 로드됨: {Path.GetFileName(filePath)}");
            OnPositionChanged(_position);
        }

        public async Task PlayAsync()
        {
            if (string.IsNullOrEmpty(_videoFilePath))
            {
                Log("재생할 비디오가 없습니다.");
                return;
            }

            if (_state == PlayerState.Playing) return;

            _state = PlayerState.Playing;
            OnStateChanged(_state);
            _timer.Start();

            _cancellationTokenSource = new CancellationTokenSource();
            
            Log("재생 시작");

            await Task.Run(() => SimulatePlayback(_cancellationTokenSource.Token));
        }

        public void Pause()
        {
            if (_state != PlayerState.Playing) return;

            _state = PlayerState.Paused;
            OnStateChanged(_state);
            _timer.Stop();
            _cancellationTokenSource?.Cancel();

            Log("일시 정지");
        }

        public void Stop()
        {
            _state = PlayerState.Stopped;
            OnStateChanged(_state);
            _timer.Stop();
            _cancellationTokenSource?.Cancel();
            _position = TimeSpan.Zero;
            OnPositionChanged(_position);

            Log("정지");
        }

        public void Seek(TimeSpan position)
        {
            if (position < TimeSpan.Zero)
                position = TimeSpan.Zero;
            if (position > _duration)
                position = _duration;

            _position = position;
            OnPositionChanged(_position);

            Log($"위치 이동: {position:hh\\:mm\\:ss}");
        }

        private async Task SimulatePlayback(CancellationToken cancellationToken)
        {
            // 실제 비디오 재생 시뮬레이션
            // 실제 구현에서는 MediaElement 또는 MediaFoundation을 사용해야 함
            while (!cancellationToken.IsCancellationRequested && _position < _duration)
            {
                await Task.Delay(100, cancellationToken);
            }

            if (_position >= _duration && !cancellationToken.IsCancellationRequested)
            {
                Stop();
            }
        }

        private void Timer_Tick(object? sender, EventArgs e)
        {
            if (_state == PlayerState.Playing)
            {
                _position = _position.Add(TimeSpan.FromMilliseconds(100));
                if (_position > _duration)
                    _position = _duration;
                
                OnPositionChanged(_position);
            }
        }

        private void OnStateChanged(PlayerState state)
        {
            StateChanged?.Invoke(this, state);
        }

        private void OnPositionChanged(TimeSpan position)
        {
            PositionChanged?.Invoke(this, position);
        }

        private void Log(string message)
        {
            LogMessage?.Invoke(this, $"[{DateTime.Now:HH:mm:ss}] {message}");
        }
    }
}
