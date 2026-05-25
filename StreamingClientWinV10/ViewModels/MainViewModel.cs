using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using StreamingClientWinV10.Helpers;
using StreamingClientWinV10.Models;
using StreamingClientWinV10.Services;

namespace StreamingClientWinV10.ViewModels
{
    public class MainViewModel : BaseViewModel
    {
        private readonly VideoApiService _api;

        private bool _isLoading;
        private string _statusMessage = "서버에서 동영상 목록을 불러오려면 새로고침을 누르세요.";

        public ObservableCollection<Video> Videos { get; } = [];

        public bool IsLoading
        {
            get => _isLoading;
            set { Set(ref _isLoading, value); OnPropertyChanged(nameof(ShowEmptyState)); }
        }

        public string StatusMessage
        {
            get => _statusMessage;
            set => Set(ref _statusMessage, value);
        }

        // True when no videos and not loading — shows "empty" placeholder
        public bool ShowEmptyState => !IsLoading && Videos.Count == 0;

        public string ServerUrl
        {
            get => AppSettings.Instance.ServerUrl;
            set
            {
                if (AppSettings.Instance.ServerUrl == value) return;
                AppSettings.Instance.ServerUrl = value;
                AppSettings.Instance.Save();
                _api.BaseUrl = value;
                OnPropertyChanged();
            }
        }

        public ICommand RefreshCommand { get; }
        public ICommand OpenVideoCommand { get; }

        public MainViewModel()
        {
            _api = new VideoApiService(AppSettings.Instance.ServerUrl);
            Videos.CollectionChanged += (_, _) => OnPropertyChanged(nameof(ShowEmptyState));

            RefreshCommand = new RelayCommand(async () => await LoadVideosAsync(), () => !IsLoading);
            OpenVideoCommand = new RelayCommand<Video>(OpenVideo);
        }

        public async Task LoadVideosAsync()
        {
            IsLoading = true;
            StatusMessage = "동영상 목록 불러오는 중...";
            Videos.Clear();

            try
            {
                var list = await _api.GetVideosAsync();
                foreach (var v in list)
                {
                    // Resolve stream URL once
                    v.StreamUrl = _api.GetStreamUrl(v);
                    Videos.Add(v);

                    // Load thumbnail in background — update UI on completion
                    _ = LoadThumbnailAsync(v);
                }
                StatusMessage = $"동영상 {list.Count}개 로드 완료  •  서버: {ServerUrl}";
            }
            catch (Exception ex)
            {
                StatusMessage = $"오류: {ex.Message}";
                MessageBox.Show($"동영상 목록을 불러올 수 없습니다.\n\n{ex.Message}",
                    "연결 오류", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            finally
            {
                IsLoading = false;
            }
        }

        private async Task LoadThumbnailAsync(Video video)
        {
            if (string.IsNullOrEmpty(video.ThumbnailUrl)) return;
            video.Thumbnail = await _api.GetThumbnailAsync(video.ThumbnailUrl);
            // Notify the UI to refresh the tile binding
            OnPropertyChanged(nameof(Videos));
        }

        private void OpenVideo(Video? video)
        {
            if (video == null) return;
            var win = new Views.VideoPlayerWindow(video, _api);
            win.Show();
        }
    }
}
