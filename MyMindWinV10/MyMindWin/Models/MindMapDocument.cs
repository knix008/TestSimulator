using System.Text.Json.Serialization;

namespace MyMindWin.Models
{
    /// <summary>.mmap 파일 루트 — 마인드맵 트리, 레이아웃, 노드 좌표를 포함합니다.</summary>
    public class MindMapDocument
    {
        [JsonPropertyName("version")]
        public int Version { get; set; } = 1;

        /// <summary>"tree" 또는 "radial"</summary>
        [JsonPropertyName("layout")]
        public string Layout { get; set; } = "tree";

        [JsonPropertyName("root")]
        public MindMapNode Root { get; set; } = new();
    }
}
