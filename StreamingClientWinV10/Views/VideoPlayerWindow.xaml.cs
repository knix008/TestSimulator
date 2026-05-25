using System;
using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Threading;
using StreamingClientWinV10.Models;
using StreamingClientWinV10.Services;

namespace StreamingClientWinV10.Views
{
    public partial class VideoPlayerWindow : Window
    {
        private readonly Video _video;
        private readonly VideoApiService _api;
        private readonly ObservableCollection<Comment> _comments = [];

        private readonly DispatcherTimer _timer;
        private bool _isDraggingSeek;
        private bool _isMuted;
        private double _volumeBeforeMute = 0.7;
        private bool _isPlaying;

        public VideoPlayerWindow(Video video, VideoApiService api)
        {
            InitializeComponent();
            _video = video;
            _api = api;

            Title = $"{video.Title} — StreamTV";
            TitleBlock.Text = video.Title;
            CommentList.ItemsSource = _comments;

            // Seek timer: updates every 500 ms
            _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
            _timer.Tick += OnTimerTick;

            // Key bindings: Space = play/pause
            KeyDown += (_, e) =>
            {
                if (e.Key == System.Windows.Input.Key.Space) TogglePlayPause();
            };

            Loaded += OnWindowLoaded;
        }

        private async void OnWindowLoaded(object sender, RoutedEventArgs e)
        {
            // Start playback
            MediaPlayer.Source = new Uri(_video.StreamUrl);
            MediaPlayer.Volume = VolumeBar.Value;
            MediaPlayer.Play();
            _isPlaying = true;
            PlayPauseBtn.Content = "⏸";
            _timer.Start();

            // Load comments
            CommentProgress.Visibility = Visibility.Visible;
            var list = await _api.GetCommentsAsync(_video.Id);
            foreach (var c in list) _comments.Add(c);
            CommentCountBlock.Text = $"댓글 {list.Count}개";
            CommentProgress.Visibility = Visibility.Collapsed;
        }

        // ── Playback Controls ──

        private void OnPlayPauseClick(object sender, RoutedEventArgs e) => TogglePlayPause();

        private void TogglePlayPause()
        {
            if (_isPlaying)
            {
                MediaPlayer.Pause();
                _isPlaying = false;
                PlayPauseBtn.Content = "▶";
                _timer.Stop();
            }
            else
            {
                MediaPlayer.Play();
                _isPlaying = true;
                PlayPauseBtn.Content = "⏸";
                _timer.Start();
            }
        }

        private void OnStopClick(object sender, RoutedEventArgs e)
        {
            MediaPlayer.Stop();
            _isPlaying = false;
            PlayPauseBtn.Content = "▶";
            _timer.Stop();
            SeekBar.Value = 0;
            TimeBlock.Text = "0:00 / 0:00";
        }

        // ── Media Events ──

        private void OnMediaOpened(object sender, RoutedEventArgs e)
        {
            if (MediaPlayer.NaturalDuration.HasTimeSpan)
                SeekBar.Maximum = MediaPlayer.NaturalDuration.TimeSpan.TotalSeconds;
        }

        private void OnMediaEnded(object sender, RoutedEventArgs e)
        {
            _isPlaying = false;
            PlayPauseBtn.Content = "▶";
            _timer.Stop();
            SeekBar.Value = SeekBar.Maximum;
        }

        private void OnMediaFailed(object sender, ExceptionRoutedEventArgs e)
        {
            _timer.Stop();
            MessageBox.Show($"동영상을 재생할 수 없습니다.\n\n{e.ErrorException?.Message}",
                "재생 오류", MessageBoxButton.OK, MessageBoxImage.Error);
        }

        // ── Seek Bar ──

        private void OnTimerTick(object? sender, EventArgs e)
        {
            if (_isDraggingSeek || !MediaPlayer.NaturalDuration.HasTimeSpan) return;

            var pos = MediaPlayer.Position.TotalSeconds;
            var dur = MediaPlayer.NaturalDuration.TimeSpan.TotalSeconds;
            SeekBar.Value = pos;
            TimeBlock.Text = $"{Format(pos)} / {Format(dur)}";
        }

        private void OnSeekDragStarted(object sender, DragStartedEventArgs e)
            => _isDraggingSeek = true;

        private void OnSeekDragCompleted(object sender, DragCompletedEventArgs e)
        {
            _isDraggingSeek = false;
            MediaPlayer.Position = TimeSpan.FromSeconds(SeekBar.Value);
        }

        private void OnSeekBarClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            // Allow clicking on the track (not just dragging thumb)
            var slider = (Slider)sender;
            var point = e.GetPosition(slider);
            var ratio = point.X / slider.ActualWidth;
            var newValue = slider.Minimum + ratio * (slider.Maximum - slider.Minimum);
            slider.Value = newValue;
            MediaPlayer.Position = TimeSpan.FromSeconds(newValue);
        }

        // ── Volume ──

        private void OnVolumeChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (MediaPlayer == null) return;
            MediaPlayer.Volume = e.NewValue;
            MuteBtn.Content = e.NewValue == 0 ? "🔇" : "🔊";
        }

        private void OnMuteClick(object sender, RoutedEventArgs e)
        {
            if (_isMuted)
            {
                VolumeBar.Value = _volumeBeforeMute;
                MuteBtn.Content = "🔊";
                _isMuted = false;
            }
            else
            {
                _volumeBeforeMute = VolumeBar.Value;
                VolumeBar.Value = 0;
                MuteBtn.Content = "🔇";
                _isMuted = true;
            }
        }

        // ── Cleanup ──

        private void OnWindowClosing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            _timer.Stop();
            MediaPlayer.Stop();
            MediaPlayer.Source = null;
        }

        private static string Format(double totalSeconds)
        {
            var ts = TimeSpan.FromSeconds(totalSeconds);
            return ts.TotalHours >= 1
                ? $"{(int)ts.TotalHours}:{ts.Minutes:D2}:{ts.Seconds:D2}"
                : $"{ts.Minutes}:{ts.Seconds:D2}";
        }
    }
}
