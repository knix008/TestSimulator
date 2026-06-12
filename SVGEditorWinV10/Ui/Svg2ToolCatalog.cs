using SVGEditorWinV10.Models;

namespace SVGEditorWinV10.Ui;

/// <summary>
/// SVG 2 표준 geometry/content 요소에 대응하는 편집 도구 정의.
/// </summary>
public static class Svg2ToolCatalog
{
    public sealed record ToolDefinition(EditorTool Tool, string Label, string SvgElement, string Description);

    public static IReadOnlyList<ToolDefinition> StandardTools { get; } =
    [
        new(EditorTool.Select, "선택", "—", "도형·선·경로를 선택하고 이동합니다."),
        new(EditorTool.Rectangle, "사각형", "rect", "SVG <rect> 요소를 그립니다."),
        new(EditorTool.Circle, "원", "circle", "SVG <circle> 요소를 그립니다."),
        new(EditorTool.Ellipse, "타원", "ellipse", "SVG <ellipse> 요소를 그립니다."),
        new(EditorTool.Line, "선", "line", "SVG <line> 요소를 그립니다."),
        new(EditorTool.Polyline, "폴리라인", "polyline", "SVG <polyline> — 열린 직선 연결 경로를 그립니다."),
        new(EditorTool.Polygon, "폴리곤", "polygon", "SVG <polygon> — 닫힌 직선 연결 경로를 그립니다."),
        new(EditorTool.Curve, "곡선 도형", "path", "SVG <path> — 클릭·드래그로 곡선·직선이 섞인 도형을 그립니다."),
        new(EditorTool.Path, "곡률 경로", "path", "SVG <path> — 직선으로 꼭짓점을 연결하고 중간 조절점으로 곡률을 줍니다."),
        new(EditorTool.Text, "텍스트", "text", "SVG <text> 요소를 배치합니다."),
        new(EditorTool.Image, "이미지", "image", "SVG <image> 요소를 배치합니다. (href)")
    ];

    public static Bitmap GetIcon(EditorTool tool) => tool switch
    {
        EditorTool.Select => EditorToolIcons.Select,
        EditorTool.Rectangle => EditorToolIcons.Rectangle,
        EditorTool.Circle => EditorToolIcons.Circle,
        EditorTool.Ellipse => EditorToolIcons.Ellipse,
        EditorTool.Line => EditorToolIcons.Line,
        EditorTool.Polyline => EditorToolIcons.Polyline,
        EditorTool.Polygon => EditorToolIcons.Polygon,
        EditorTool.Curve => EditorToolIcons.Curve,
        EditorTool.Path => EditorToolIcons.Path,
        EditorTool.Text => EditorToolIcons.Text,
        EditorTool.Image => EditorToolIcons.Image,
        _ => EditorToolIcons.Select
    };

    public static string GetTooltip(ToolDefinition definition) =>
        definition.Tool switch
        {
            EditorTool.Select => "선택 — 도형·선·경로를 선택하고 이동합니다. (Esc)",
            EditorTool.Polygon => "폴리곤 (<polygon>) — 클릭으로 꼭짓점을 추가해 직선으로 연결합니다. 첫 점을 다시 클릭하면 닫고, Enter/더블클릭으로 완료합니다.",
            EditorTool.Polyline => "폴리라인 (<polyline>) — 클릭으로 꼭짓점을 추가해 열린 직선 경로를 그립니다. Enter/더블클릭으로 완료합니다.",
            EditorTool.Curve => "곡선 도형 (<path>) — 클릭 후 드래그하면 곡선, 짧게 클릭하면 직선입니다. 시작점을 클릭하면 닫힙니다. Enter/더블클릭으로 완료합니다.",
            EditorTool.Path => "곡률 경로 (<path>) — 클릭으로 직선 꼭짓점을 추가합니다. 세그먼트 중간의 주황 조절점을 드래그해 곡률을 줍니다. Enter/더블클릭으로 완료합니다.",
            EditorTool.Text => "텍스트 (<text>) — 배치할 영역을 드래그하거나 클릭하여 넣습니다.",
            EditorTool.Image => "이미지 (<image>) — PNG, GIF, JPEG, WebP, AVIF, SVG 파일을 불러와 배치합니다.",
            EditorTool.Line => "선 (<line>) — 시작점에서 끝점까지 드래그하여 그립니다.",
            EditorTool.Rectangle => "사각형 (<rect>) — 캔버스에서 드래그하여 그립니다.",
            EditorTool.Circle => "원 (<circle>) — 캔버스에서 드래그하여 그립니다.",
            EditorTool.Ellipse => "타원 (<ellipse>) — 캔버스에서 드래그하여 그립니다.",
            _ => $"{definition.Label} (<{definition.SvgElement}>) — {definition.Description}"
        };
}
