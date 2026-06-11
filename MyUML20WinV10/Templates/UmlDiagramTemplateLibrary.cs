using System.Text.Json;
using System.Text.Json.Serialization;
using MyUML20WinV10.Models;
using MyUML20WinV10.Serialization;

namespace MyUML20WinV10.Templates;

public static class UmlDiagramTemplateLibrary
{
    public const string FullSampleId = "full-sample";
    public const string ProjectsSubfolder = "Projects";
    public const string ManifestFileName = "templates.json";

    private static readonly JsonSerializerOptions ManifestOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private static IReadOnlyList<UmlTemplateInfo>? _all;

    public static IReadOnlyList<UmlTemplateInfo> All => _all ??= LoadManifest();

    public static IReadOnlyList<UmlTemplateInfo> DiagramTemplates { get; } =
        All.Where(t => t.Id != FullSampleId).ToArray();

    public static UmlTemplateInfo FullSampleInfo =>
        All.First(t => t.Id == FullSampleId);

    public static string GetTemplatesDirectory()
    {
        var outputDir = Path.Combine(AppContext.BaseDirectory, "Templates");
        if (File.Exists(Path.Combine(outputDir, ManifestFileName)))
            return outputDir;

        var devDir = Path.GetFullPath(
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "Templates"));
        if (File.Exists(Path.Combine(devDir, ManifestFileName)))
            return devDir;

        return outputDir;
    }

    public static string GetTemplatesProjectsDirectory() =>
        Path.Combine(GetTemplatesDirectory(), ProjectsSubfolder);

    public static string GetProjectFilePath(UmlTemplateInfo template) =>
        Path.Combine(GetTemplatesProjectsDirectory(), template.ProjectFileName);

    public static string GetProjectFilePath(string templateId)
    {
        var template = FindTemplate(templateId)
            ?? throw new ArgumentException($"알 수 없는 템플릿: {templateId}", nameof(templateId));
        return GetProjectFilePath(template);
    }

    /// <summary>
    /// Loads a copy of the template .uml project into memory for editing.
    /// The returned project is not bound to the template file path.
    /// </summary>
    public static UmlProject LoadTemplateProject(string templateId)
    {
        var template = FindTemplate(templateId)
            ?? throw new ArgumentException($"알 수 없는 템플릿: {templateId}", nameof(templateId));

        var path = GetProjectFilePath(template);
        if (!File.Exists(path))
            throw new FileNotFoundException($"템플릿 프로젝트 파일을 찾을 수 없습니다: {path}", path);

        return UmlProjectSerializer.Load(path);
    }

    public static UmlProject CreateFullSample() => LoadTemplateProject(FullSampleId);

    /// <summary>
    /// Regenerates .uml files under Templates/Projects from the built-in diagram builders.
    /// Run: dotnet run -- --generate-templates
    /// </summary>
    public static void ExportProjectFiles(string? directory = null)
    {
        directory ??= GetTemplatesProjectsDirectory();
        Directory.CreateDirectory(directory);

        foreach (var template in All)
        {
            var project = BuildFromCode(template.Id);
            var path = Path.Combine(directory, template.ProjectFileName);
            UmlProjectSerializer.Save(project, path);
        }
    }

    public static UmlTemplateInfo? FindTemplate(string templateId) =>
        All.FirstOrDefault(t => string.Equals(t.Id, templateId, StringComparison.OrdinalIgnoreCase));

    private static IReadOnlyList<UmlTemplateInfo> LoadManifest()
    {
        var manifestPath = Path.Combine(GetTemplatesDirectory(), ManifestFileName);
        if (!File.Exists(manifestPath))
            throw new FileNotFoundException($"템플릿 매니페스트를 찾을 수 없습니다: {manifestPath}", manifestPath);

        var json = File.ReadAllText(manifestPath);
        var manifest = JsonSerializer.Deserialize<UmlTemplateManifest>(json, ManifestOptions)
            ?? throw new InvalidOperationException($"템플릿 매니페스트를 읽을 수 없습니다: {manifestPath}");

        return manifest.Templates
            .Select(entry => new UmlTemplateInfo(
                entry.Id,
                entry.Name,
                entry.Description,
                entry.DiagramKind,
                entry.ProjectFile))
            .ToArray();
    }

    private static UmlProject BuildFromCode(string templateId)
    {
        if (templateId == FullSampleId)
            return BuildFullSampleFromCode();

        return templateId switch
        {
            ClassDiagramTemplate.Id => ClassDiagramTemplate.BuildProject(),
            UseCaseDiagramTemplate.Id => UseCaseDiagramTemplate.BuildProject(),
            SequenceDiagramTemplate.Id => SequenceDiagramTemplate.BuildProject(),
            StateMachineDiagramTemplate.Id => StateMachineDiagramTemplate.BuildProject(),
            ActivityDiagramTemplate.Id => ActivityDiagramTemplate.BuildProject(),
            ComponentDiagramTemplate.Id => ComponentDiagramTemplate.BuildProject(),
            PackageDiagramTemplate.Id => PackageDiagramTemplate.BuildProject(),
            ObjectDiagramTemplate.Id => ObjectDiagramTemplate.BuildProject(),
            CommunicationDiagramTemplate.Id => CommunicationDiagramTemplate.BuildProject(),
            DeploymentDiagramTemplate.Id => DeploymentDiagramTemplate.BuildProject(),
            ProfileDiagramTemplate.Id => ProfileDiagramTemplate.BuildProject(),
            TimingDiagramTemplate.Id => TimingDiagramTemplate.BuildProject(),
            CompositeStructureDiagramTemplate.Id => CompositeStructureDiagramTemplate.BuildProject(),
            InteractionOverviewDiagramTemplate.Id => InteractionOverviewDiagramTemplate.BuildProject(),
            _ => throw new ArgumentException($"알 수 없는 템플릿: {templateId}", nameof(templateId)),
        };
    }

    private static UmlProject BuildFullSampleFromCode()
    {
        var project = new UmlProject { Name = "Sample UML" };
        project.Diagrams.Clear();

        project.Diagrams.AddRange(
        [
            ClassDiagramTemplate.Build(project),
            UseCaseDiagramTemplate.Build(project),
            SequenceDiagramTemplate.Build(project),
            StateMachineDiagramTemplate.Build(project),
            ActivityDiagramTemplate.Build(project),
            ComponentDiagramTemplate.Build(project),
            PackageDiagramTemplate.Build(project),
            ObjectDiagramTemplate.Build(project),
            CommunicationDiagramTemplate.Build(project),
            DeploymentDiagramTemplate.Build(project),
            ProfileDiagramTemplate.Build(project),
            TimingDiagramTemplate.Build(project),
            CompositeStructureDiagramTemplate.Build(project),
            InteractionOverviewDiagramTemplate.Build(project),
        ]);

        return project;
    }

    private sealed class UmlTemplateManifest
    {
        public List<UmlTemplateManifestEntry> Templates { get; set; } = [];
    }

    private sealed class UmlTemplateManifestEntry
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public UmlDiagramKind DiagramKind { get; set; }
        public string ProjectFile { get; set; } = string.Empty;
    }
}
