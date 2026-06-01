using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace MyMindWin.Models
{
    public class MindMapNode
    {
        [JsonPropertyName("id")]
        public Guid Id { get; set; } = Guid.NewGuid();

        [JsonPropertyName("text")]
        public string Text { get; set; } = "New Node";

        [JsonPropertyName("note")]
        public string Note { get; set; } = string.Empty;

        /// <summary>Base64-encoded image bytes (PNG/JPEG/GIF/BMP/WebP).</summary>
        [JsonPropertyName("image")]
        public string? Image { get; set; }

        [JsonPropertyName("imageMime")]
        public string? ImageMime { get; set; }

        [JsonPropertyName("isExpanded")]
        public bool IsExpanded { get; set; } = true;

        [JsonPropertyName("colorIndex")]
        public int ColorIndex { get; set; } = -1;

        /// <summary>-1 채움색·선택 강조, -2 흰색, 0~7 팔레트.</summary>
        [JsonPropertyName("borderColorIndex")]
        public int BorderColorIndex { get; set; } = NodeBorderPalette.InheritColorIndex;

        /// <summary>null이면 자동(1px, 선택 시 2.5px).</summary>
        [JsonPropertyName("borderThickness")]
        public double? BorderThickness { get; set; }

        [JsonPropertyName("x")]
        public double? X { get; set; }

        [JsonPropertyName("y")]
        public double? Y { get; set; }

        /// <summary>rounded | rectangle | pill | ellipse | diamond</summary>
        [JsonPropertyName("shape")]
        public string Shape { get; set; } = "rounded";

        [JsonPropertyName("children")]
        public List<MindMapNode> Children { get; set; } = [];

        public bool HasStoredPosition => X.HasValue && Y.HasValue;
    }
}
