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

        [JsonPropertyName("isExpanded")]
        public bool IsExpanded { get; set; } = true;

        [JsonPropertyName("colorIndex")]
        public int ColorIndex { get; set; } = -1;

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
