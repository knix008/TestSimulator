using GenerateKoSample;
using ReqTrace.Importing;
using ReqTrace.Localization;
using ReqTrace.Models;
using ReqTrace.Persistence;

var sampleDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "Sample"));
Directory.CreateDirectory(sampleDir);

WriteReqtproj(Path.Combine(sampleDir, "SampleKo.reqtproj"), "샘플 프로젝트 (한글)", SampleDefinitions.Korean, LocalizationService.DefaultLanguage);
WriteReqtproj(Path.Combine(sampleDir, "Sample.reqtproj"), "Sample Project", SampleDefinitions.English, LocalizationService.EnglishLanguage);

SampleExcelWriter.Write(Path.Combine(sampleDir, "SampleKo.xlsx"), korean: true);
SampleExcelWriter.Write(Path.Combine(sampleDir, "Sample.xlsx"), korean: false);

VerifyExcelImport(Path.Combine(sampleDir, "SampleKo.xlsx"), "요구사항", 12);
VerifyExcelImport(Path.Combine(sampleDir, "Sample.xlsx"), "Requirements", 12);

Console.WriteLine($"Wrote samples to {sampleDir}");

static void WriteReqtproj(string outputPath, string projectName, SampleDefinitions.Row[] definitions, string languageCode)
{
    LocalizationService.Initialize(languageCode);

    var project = ProjectRepository.CreateNew(projectName);
    var requirements = new List<Requirement>();
    var (testCaseUsedCodes, testCaseNextSequence) = TestCaseCodeAllocator.CreateState(null);

    foreach (var def in definitions)
    {
        var requirement = new Requirement
        {
            Code = def.Code,
            Title = def.Title,
            Description = def.Description,
            Category = def.Category,
            Priority = def.Priority,
            Status = def.Status,
            Source = def.Source
        };

        foreach (var testCase in TestCaseGenerator.Generate(requirement, testCaseUsedCodes, ref testCaseNextSequence))
        {
            testCase.RequirementId = requirement.Id;
            requirement.TestCases.Add(testCase);
        }

        requirements.Add(requirement);
    }

    foreach (var requirement in requirements)
    {
        var def = definitions.First(d => d.Code == requirement.Code);
        if (def.ParentCode is not null)
        {
            var parent = requirements.First(r => r.Code == def.ParentCode);
            requirement.ParentId = parent.Id;
        }

        project.Requirements.Add(requirement);
    }

    ProjectRepository.Save(project, outputPath);
    Console.WriteLine($"  {Path.GetFileName(outputPath)}");
}

static void VerifyExcelImport(string filePath, string sheetName, int expectedCount)
{
    var headers = ExcelRequirementImporter.ReadHeaderRow(filePath, sheetName, 1);
    var mapping = ColumnMappingHeuristics.Infer(headers);
    mapping.GenerateTestCases = false;

    var result = ExcelRequirementImporter.Import(filePath, sheetName, 1, mapping);
    if (result.Requirements.Count != expectedCount)
        throw new InvalidOperationException($"Expected {expectedCount} requirements in {Path.GetFileName(filePath)}, got {result.Requirements.Count}.");

    Console.WriteLine($"  verified {Path.GetFileName(filePath)} ({expectedCount} rows)");
}
