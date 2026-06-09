using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public sealed record UmlTemplateInfo(
    string Id,
    string Name,
    string Description,
    UmlDiagramKind DiagramKind,
    string ProjectFileName);
