using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Media.Imaging;
using StreamingClientWinV10.Models;

namespace StreamingClientWinV10.Services
{
    public class VideoApiService : IDisposable
    {
        private HttpClient _http;
        private string _baseUrl;

        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNameCaseInsensitive = true
        };

        public VideoApiService(string baseUrl)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            _http = CreateClient(_baseUrl);
        }

        public string BaseUrl
        {
            get => _baseUrl;
            set
            {
                _baseUrl = value.TrimEnd('/');
                _http.Dispose();
                _http = CreateClient(_baseUrl);
            }
        }

        private static HttpClient CreateClient(string baseUrl)
        {
            return new HttpClient
            {
                BaseAddress = new Uri(baseUrl + "/"),
                Timeout = TimeSpan.FromSeconds(30)
            };
        }

        // GET /api/videos  →  List<Video>
        public async Task<List<Video>> GetVideosAsync()
        {
            var json = await _http.GetStringAsync("api/videos");
            return JsonSerializer.Deserialize<List<Video>>(json, JsonOpts) ?? [];
        }

        // GET /api/videos/{id}/thumbnail  →  image bytes
        public async Task<BitmapImage?> GetThumbnailAsync(string thumbnailUrl)
        {
            try
            {
                // Accept both absolute URLs and relative paths
                var url = thumbnailUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                    ? thumbnailUrl
                    : _baseUrl + (thumbnailUrl.StartsWith('/') ? thumbnailUrl : "/" + thumbnailUrl);

                var bytes = await _http.GetByteArrayAsync(url);
                var bmp = new BitmapImage();
                using var ms = new MemoryStream(bytes);
                bmp.BeginInit();
                bmp.StreamSource = ms;
                bmp.CacheOption = BitmapCacheOption.OnLoad;
                bmp.EndInit();
                bmp.Freeze();
                return bmp;
            }
            catch
            {
                return null;
            }
        }

        // Returns the full stream URL for MediaElement
        public string GetStreamUrl(Video video)
        {
            if (!string.IsNullOrEmpty(video.StreamUrl))
            {
                return video.StreamUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                    ? video.StreamUrl
                    : _baseUrl + (video.StreamUrl.StartsWith('/') ? video.StreamUrl : "/" + video.StreamUrl);
            }
            return $"{_baseUrl}/api/videos/{video.Id}/stream";
        }

        // GET /api/videos/{id}/comments  →  List<Comment>
        public async Task<List<Comment>> GetCommentsAsync(int videoId)
        {
            try
            {
                var json = await _http.GetStringAsync($"api/videos/{videoId}/comments");
                return JsonSerializer.Deserialize<List<Comment>>(json, JsonOpts) ?? [];
            }
            catch
            {
                return [];
            }
        }

        public void Dispose() => _http.Dispose();
    }
}
