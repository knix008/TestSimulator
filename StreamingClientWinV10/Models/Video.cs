using System;
using System.Windows.Media.Imaging;

namespace StreamingClientWinV10.Models
{
    public class Video
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        // Server may return full URL or relative path like "/api/videos/1/thumbnail"
        public string ThumbnailUrl { get; set; } = string.Empty;
        // Stream URL resolved by VideoApiService
        public string StreamUrl { get; set; } = string.Empty;
        // Duration in seconds
        public int Duration { get; set; }
        public DateTime CreatedAt { get; set; }

        // Loaded in background after list fetch
        public BitmapImage? Thumbnail { get; set; }

        public string DurationText
        {
            get
            {
                var ts = TimeSpan.FromSeconds(Duration);
                return ts.TotalHours >= 1
                    ? $"{(int)ts.TotalHours}:{ts.Minutes:D2}:{ts.Seconds:D2}"
                    : $"{ts.Minutes}:{ts.Seconds:D2}";
            }
        }
    }
}
