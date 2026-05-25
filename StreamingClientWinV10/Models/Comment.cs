using System;

namespace StreamingClientWinV10.Models
{
    public class Comment
    {
        public int Id { get; set; }
        public int VideoId { get; set; }
        public string Author { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }

        public string TimeAgo
        {
            get
            {
                var diff = DateTime.UtcNow - CreatedAt.ToUniversalTime();
                if (diff.TotalMinutes < 1) return "방금 전";
                if (diff.TotalHours < 1) return $"{(int)diff.TotalMinutes}분 전";
                if (diff.TotalDays < 1) return $"{(int)diff.TotalHours}시간 전";
                if (diff.TotalDays < 30) return $"{(int)diff.TotalDays}일 전";
                return CreatedAt.ToString("yyyy-MM-dd");
            }
        }
    }
}
