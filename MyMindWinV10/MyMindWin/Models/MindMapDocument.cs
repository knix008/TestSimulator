using System.Text.Json.Serialization;

namespace MyMindWin.Models
{
    /// <summary>.mmap 파일 루트 — 마인드맵 트리, 레이아웃, 노드 좌표를 포함합니다.</summary>
    public class MindMapDocument
    {
        [JsonPropertyName("version")]
        public int Version { get; set; } = 1;

        /// <summary>문서 제목 (이미지 Heading 등). 미지정 시 루트 노드 텍스트를 사용합니다.</summary>
        [JsonPropertyName("title")]
        public string? Title { get; set; }

        /// <summary>"tree", "radial", "fishbone"</summary>
        [JsonPropertyName("layout")]
        public string Layout { get; set; } = "tree";

        /// <summary>FreeMind: "linear", "bezier", "sharp_linear", "sharp_bezier"</summary>
        [JsonPropertyName("connectionLine")]
        public string ConnectionLine { get; set; } = "bezier";

        /// <summary>연결선 두께(px). 미지정 시 1.8</summary>
        [JsonPropertyName("connectionLineThickness")]
        public double? ConnectionLineThickness { get; set; }

        /// <summary>부모→자식 연결선이 뿌리처럼 가늘어지는지 (중심에서 굵고 세부로 가늘게).</summary>
        [JsonPropertyName("connectionLineTaper")]
        public bool ConnectionLineTaper { get; set; } = true;

        /// <summary>새 노드에 적용할 기본 도형 (rounded, cloud, …).</summary>
        [JsonPropertyName("defaultNodeShape")]
        public string? DefaultNodeShape { get; set; }

        [JsonPropertyName("layoutFlipHorizontal")]
        public bool LayoutFlipHorizontal { get; set; }

        [JsonPropertyName("layoutFlipVertical")]
        public bool LayoutFlipVertical { get; set; }

        [JsonPropertyName("root")]
        public MindMapNode Root { get; set; } = new();
    }
}
