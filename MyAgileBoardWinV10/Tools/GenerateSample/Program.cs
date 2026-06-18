using MyAgileBoardWinV10.Services;

var repoRoot = FindRepoRoot();
var outputPath = Path.Combine(repoRoot, "Samples", "Sample.mab");

Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);

var project = SampleProjectFactory.Create();
ProjectService.Save(project, outputPath);

var reloaded = ProjectService.Load(outputPath);
if (reloaded == null)
    throw new InvalidOperationException("Failed to reload generated sample.");

var allCards = reloaded.Columns.SelectMany(c => c.Cards).ToList();
bool allFold = allCards.All(c => c.ShowTopRightFold);
bool allFlat = allCards.All(c => Math.Abs(c.Rotation) < 0.01f);

Console.WriteLine($"Sample saved: {outputPath}");
Console.WriteLine($"Columns: {reloaded.Columns.Count}");
Console.WriteLine($"Cards: {allCards.Count} (+ {reloaded.ArchivedCards.Count} archived)");
Console.WriteLine($"All ShowTopRightFold: {allFold}");
Console.WriteLine($"All Rotation=0: {allFlat}");

if (!allFold || !allFlat)
    Environment.Exit(1);

static string FindRepoRoot()
{
    var dir = AppContext.BaseDirectory;
    while (!string.IsNullOrEmpty(dir))
    {
        if (Directory.Exists(Path.Combine(dir, "Samples"))
            && Directory.Exists(Path.Combine(dir, "MyAgileBoardWinV10")))
            return dir;
        dir = Directory.GetParent(dir)?.FullName ?? string.Empty;
    }

    throw new InvalidOperationException("Repository root not found.");
}
