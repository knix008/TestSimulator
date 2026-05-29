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

        [JsonPropertyName("children")]
        public List<MindMapNode> Children { get; set; } = [];
    }
}
