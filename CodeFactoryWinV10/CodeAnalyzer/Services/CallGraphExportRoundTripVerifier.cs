using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary>분석 결과 JSON 저장·불러오기가 모든 주요 섹션을 보존하는지 검증합니다.</summary>
internal static class CallGraphExportRoundTripVerifier
{
    public static bool Run()
    {
        var original = CreateSampleAnalysis();
        var json = CallGraphExportService.SerializeToJson(original, @"C:\SampleProject");
        var tempPath = Path.Combine(Path.GetTempPath(), $"CodeAnalyzer-export-verify-{Guid.NewGuid():N}.json");

        try
        {
            File.WriteAllText(tempPath, json);
            var (loaded, rootDirectory) = CallGraphExportService.LoadFromFile(tempPath);
            return rootDirectory == @"C:\SampleProject" && AreEquivalent(original, loaded);
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    private static AnalysisResult CreateSampleAnalysis()
    {
        var callGraph = CallGraphBuilder.Build(
        [
            new CallGraphNode
            {
                Id = "fn1",
                DisplayName = "Save",
                FullName = "App.Save",
                FilePath = @"C:\SampleProject\App.cs",
                LineNumber = 10
            }
        ], []);

        var tableId = "tbl_users";
        var catalogId = "cat_main";

        return new AnalysisResult
        {
            CallGraph = callGraph,
            FileRelations = FileCallGraphBuilder.Build(callGraph),
            DirectoryRelations = DirectoryCallGraphBuilder.Build(callGraph),
            Structure = new ProjectStructureResult
            {
                Types =
                [
                    new StructureTypeNode
                    {
                        Id = "type1",
                        DisplayName = "UserService",
                        FullName = "App.UserService",
                        FilePath = @"C:\SampleProject\UserService.cs",
                        LineNumber = 1,
                        Kind = "class"
                    }
                ],
                Relations = [],
                TypeMap = new Dictionary<string, StructureTypeNode>(StringComparer.Ordinal)
            },
            Metrics = new CodeMetricsResult
            {
                Functions =
                [
                    new FunctionMetric
                    {
                        Id = "fn1",
                        LanguageId = "csharp",
                        DisplayName = "Save",
                        FullName = "App.Save",
                        FilePath = @"C:\SampleProject\App.cs",
                        StartLine = 10,
                        EndLine = 20,
                        LineCount = 11,
                        CyclomaticComplexity = 2,
                        CognitiveComplexity = 2,
                        MaxNestingDepth = 1,
                        ParameterCount = 1,
                        ReturnCount = 1,
                        FanIn = 0,
                        FanOut = 1,
                        MagicNumberCount = 0,
                        MaintenanceIndex = 80,
                        Precision = MetricsPrecision.Semantic
                    }
                ],
                Summary = new CodeQualitySummary { TotalCodeLines = 100 }
            },
            Duplicates = new DuplicateCodeResult
            {
                MinDuplicateLines = 6,
                Groups =
                [
                    new DuplicateCodeGroup
                    {
                        Id = "dup1",
                        LineCount = 6,
                        DuplicateLines = ["line1", "line2"],
                        SampleLines = ["line1"],
                        Fragments =
                        [
                            new DuplicateCodeFragment
                            {
                                FilePath = @"C:\SampleProject\A.cs",
                                LanguageId = "csharp",
                                StartLine = 1,
                                EndLine = 6
                            }
                        ]
                    }
                ]
            },
            GlobalVariables = new GlobalVariableResult
            {
                Variables =
                [
                    new GlobalVariableItem
                    {
                        Id = "gv1",
                        Name = "Counter",
                        LanguageId = "csharp",
                        FilePath = @"C:\SampleProject\Globals.cs",
                        LineNumber = 3,
                        Scope = GlobalVariableScope.File,
                        TypeName = "int",
                        ContainingScope = "App",
                        Declaration = "static int Counter;"
                    }
                ],
                Accesses =
                [
                    new GlobalVariableAccess
                    {
                        GlobalVariableId = "gv1",
                        FunctionId = "fn1",
                        FunctionDisplayName = "Save",
                        FunctionFullName = "App.Save",
                        FunctionFilePath = @"C:\SampleProject\App.cs",
                        FunctionLineNumber = 10,
                        Kind = GlobalVariableAccessKind.Read
                    }
                ],
                AccessesByVariableId = new Dictionary<string, IReadOnlyList<GlobalVariableAccess>>(StringComparer.OrdinalIgnoreCase)
            },
            DatabaseSchema = new DatabaseSchemaResult
            {
                Catalogs =
                [
                    new DatabaseCatalog
                    {
                        Id = catalogId,
                        Name = "main_db",
                        Dialect = DatabaseDialect.PostgreSql,
                        SourceKind = "connection-string",
                        FilePath = @"C:\SampleProject\appsettings.json",
                        LineNumber = 4
                    }
                ],
                Tables =
                [
                    new DatabaseTable
                    {
                        Id = tableId,
                        Name = "users",
                        Schema = "public",
                        EntityTypeName = "User",
                        Dialect = DatabaseDialect.PostgreSql,
                        SourceKind = "ef-core",
                        FilePath = @"C:\SampleProject\User.cs",
                        LineNumber = 8,
                        AccessAliases = ["Users", "UserSet"],
                        Columns =
                        [
                            new DatabaseColumn
                            {
                                Name = "id",
                                DataType = "int",
                                IsPrimaryKey = true
                            }
                        ]
                    }
                ],
                CatalogAccesses =
                [
                    new DatabaseCatalogAccess
                    {
                        CatalogId = catalogId,
                        FunctionId = "fn1",
                        FunctionDisplayName = "Save",
                        FunctionFullName = "App.Save",
                        FunctionFilePath = @"C:\SampleProject\App.cs",
                        FunctionLineNumber = 10,
                        Kind = DatabaseCatalogAccessKind.Connect,
                        Pattern = DatabaseCatalogAccessPattern.ConnectionString,
                        Operations = DatabaseCrudOperation.Read
                    }
                ],
                Accesses =
                [
                    new DatabaseTableAccess
                    {
                        TableId = tableId,
                        FunctionId = "fn1",
                        FunctionDisplayName = "Save",
                        FunctionFullName = "App.Save",
                        FunctionFilePath = @"C:\SampleProject\App.cs",
                        FunctionLineNumber = 10,
                        Kind = DatabaseTableAccessKind.Write,
                        Pattern = DatabaseTableAccessPattern.EntityFramework,
                        Operations = DatabaseCrudOperation.Create | DatabaseCrudOperation.Update
                    }
                ],
                ColumnAccesses =
                [
                    new DatabaseColumnAccess
                    {
                        TableId = tableId,
                        ColumnName = "id",
                        FunctionId = "fn1",
                        FunctionDisplayName = "Save",
                        FunctionFullName = "App.Save",
                        FunctionFilePath = @"C:\SampleProject\App.cs",
                        FunctionLineNumber = 10,
                        Kind = DatabaseTableAccessKind.Read,
                        Pattern = DatabaseTableAccessPattern.EntityFramework,
                        Operations = DatabaseCrudOperation.Read
                    }
                ],
                EntryAccesses =
                [
                    new DatabaseEntryAccess
                    {
                        TableId = tableId,
                        FunctionId = "fn1",
                        FunctionDisplayName = "Save",
                        FunctionFullName = "App.Save",
                        FunctionFilePath = @"C:\SampleProject\App.cs",
                        FunctionLineNumber = 10,
                        Operation = DatabaseCrudOperation.Create,
                        Pattern = DatabaseTableAccessPattern.EntityFramework
                    }
                ]
            },
            BugRisk = BugRiskResult.FromFindings(
            [
                new BugRiskFinding
                {
                    Category = BugRiskCategory.LintViolation,
                    Severity = BugRiskSeverity.Warning,
                    Message = "sample bug",
                    FilePath = @"C:\SampleProject\App.cs",
                    LineNumber = 10,
                    FunctionName = "Save",
                    Detail = "detail",
                    Snippet = "code",
                    LanguageId = "csharp"
                }
            ]),
            Security = SecurityAnalysisResult.FromFindings(
            [
                new SecurityFinding
                {
                    RuleId = "SEC001",
                    Label = "Hardcoded secret",
                    Severity = SecuritySeverity.Critical,
                    FilePath = @"C:\SampleProject\App.cs",
                    LanguageId = "csharp",
                    LineNumber = 10,
                    Snippet = "password = \"x\"",
                    Explanation = "explanation",
                    Remediation = "remediation"
                }
            ]),
            QualityThresholds = UserAnalysisSettings.CreateDefaults(),
            Issues =
            [
                new AnalysisIssue
                {
                    Stage = "DatabaseSchema",
                    Message = "partial failure",
                    Detail = "stack trace"
                }
            ]
        };
    }

    private static bool AreEquivalent(AnalysisResult original, AnalysisResult loaded)
    {
        if (original.CallGraph.Nodes.Count != loaded.CallGraph.Nodes.Count
            || original.Metrics.Functions.Count != loaded.Metrics.Functions.Count
            || original.Duplicates.Groups.Count != loaded.Duplicates.Groups.Count
            || original.GlobalVariables.Variables.Count != loaded.GlobalVariables.Variables.Count
            || original.GlobalVariables.Accesses.Count != loaded.GlobalVariables.Accesses.Count
            || original.BugRisk.Findings.Count != loaded.BugRisk.Findings.Count
            || original.Security.Findings.Count != loaded.Security.Findings.Count
            || original.Issues.Count != loaded.Issues.Count)
        {
            return false;
        }

        var originalDb = original.DatabaseSchema;
        var loadedDb = loaded.DatabaseSchema;

        return originalDb.Catalogs.Count == loadedDb.Catalogs.Count
            && originalDb.Tables.Count == loadedDb.Tables.Count
            && originalDb.Accesses.Count == loadedDb.Accesses.Count
            && originalDb.CatalogAccesses.Count == loadedDb.CatalogAccesses.Count
            && originalDb.ColumnAccesses.Count == loadedDb.ColumnAccesses.Count
            && originalDb.EntryAccesses.Count == loadedDb.EntryAccesses.Count
            && originalDb.Tables[0].AccessAliases.SequenceEqual(loadedDb.Tables[0].AccessAliases)
            && loadedDb.GetCatalogAccessesFor(loadedDb.Catalogs[0].Id).Count == loadedDb.CatalogAccesses.Count
            && loadedDb.GetColumnAccessesFor(loadedDb.Tables[0].Id).Count == loadedDb.ColumnAccesses.Count
            && loadedDb.GetEntryAccessesFor(loadedDb.Tables[0].Id).Count == loadedDb.EntryAccesses.Count
            && loaded.Issues[0].Stage == original.Issues[0].Stage;
    }
}
