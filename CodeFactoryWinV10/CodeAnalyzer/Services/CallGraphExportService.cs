using System.Text.Json;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class CallGraphExportService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public static void SaveToFile(AnalysisResult analysis, string rootDirectory, string filePath)
    {
        File.WriteAllText(filePath, SerializeToJson(analysis, rootDirectory));
    }

    public static string SerializeToJson(AnalysisResult analysis, string rootDirectory)
    {
        var document = BuildDocument(analysis, rootDirectory);
        return JsonSerializer.Serialize(document, JsonOptions);
    }

    private static AnalysisDocument BuildDocument(AnalysisResult analysis, string rootDirectory) =>
        new()
        {
            Version = "5",
            RootDirectory = rootDirectory,
            SavedAtUtc = DateTime.UtcNow,
            CallGraph = new CallGraphSection
            {
                Nodes = analysis.CallGraph.Nodes
                    .Select(n => new CallGraphNodeRecord
                    {
                        Id = n.Id,
                        DisplayName = n.DisplayName,
                        FullName = n.FullName,
                        FilePath = n.FilePath,
                        LineNumber = n.LineNumber
                    }).ToList(),
                Edges = analysis.CallGraph.Edges
                    .Select(e => new CallGraphEdgeRecord
                    {
                        CallerId = e.CallerId,
                        CalleeId = e.CalleeId
                    }).ToList()
            },
            FileRelations = new FileRelationsSection
            {
                Files = analysis.FileRelations.Files
                    .Select(f => new FileRelationNodeRecord
                    {
                        Id = f.Id,
                        FilePath = f.FilePath,
                        DisplayName = f.DisplayName,
                        FullName = f.FullName,
                        FunctionCount = f.FunctionCount
                    }).ToList(),
                Edges = analysis.FileRelations.Edges
                    .Select(e => new FileRelationEdgeRecord
                    {
                        FromFileId = e.FromFileId,
                        ToFileId = e.ToFileId,
                        CallCount = e.CallCount
                    }).ToList()
            },
            DirectoryRelations = new DirectoryRelationsSection
            {
                Directories = analysis.DirectoryRelations.Directories
                    .Select(d => new DirectoryRelationNodeRecord
                    {
                        Id = d.Id,
                        DirectoryPath = d.DirectoryPath,
                        DisplayName = d.DisplayName,
                        FullName = d.FullName,
                        FileCount = d.FileCount,
                        FunctionCount = d.FunctionCount
                    }).ToList(),
                Edges = analysis.DirectoryRelations.Edges
                    .Select(e => new DirectoryRelationEdgeRecord
                    {
                        FromDirectoryId = e.FromDirectoryId,
                        ToDirectoryId = e.ToDirectoryId,
                        CallCount = e.CallCount
                    }).ToList()
            },
            Structure = new StructureSection
            {
                Types = analysis.Structure.Types
                    .Select(t => new StructureTypeRecord
                    {
                        Id = t.Id,
                        DisplayName = t.DisplayName,
                        FullName = t.FullName,
                        FilePath = t.FilePath,
                        LineNumber = t.LineNumber,
                        Kind = t.Kind,
                        Members = t.Members.ToList(),
                        Attributes = t.Attributes.ToList(),
                        Operations = t.Operations.ToList(),
                        IsAbstract = t.IsAbstract
                    }).ToList(),
                Relations = analysis.Structure.Relations
                    .Select(r => new StructureRelationRecord
                    {
                        FromId = r.FromId,
                        ToId = r.ToId,
                        Kind = r.Kind.ToString()
                    }).ToList()
            },
            Metrics = MetricsSectionFrom(analysis.Metrics),
            Duplicates = DuplicatesSectionFrom(analysis.Duplicates),
            GlobalVariables = GlobalVariablesSectionFrom(analysis.GlobalVariables),
            DatabaseSchema = DatabaseSchemaSectionFrom(analysis.DatabaseSchema),
            BugRisk = BugRiskSectionFrom(analysis.BugRisk),
            Security = SecuritySectionFrom(analysis.Security),
            QualityThresholds = QualityThresholdsRecordFrom(analysis.QualityThresholds),
            Issues = IssuesSectionFrom(analysis.Issues)
        };

    public static (AnalysisResult Analysis, string RootDirectory) LoadFromFile(string filePath)
    {
        var json = File.ReadAllText(filePath);

        using var doc = JsonDocument.Parse(json);
        var version = ReadDocumentVersion(doc.RootElement);

        if (version is "3" or "4" or "5")
        {
            var document = JsonSerializer.Deserialize<AnalysisDocument>(json, JsonOptions)
                ?? throw new InvalidDataException("유효하지 않은 분석 결과 파일입니다.");
            return (BuildFromDocument(document), document.RootDirectory);
        }

        if (version == "2")
        {
            var document = JsonSerializer.Deserialize<AnalysisDocument>(json, JsonOptions)
                ?? throw new InvalidDataException("유효하지 않은 분석 결과 파일입니다.");
            return (BuildFromV2(document), document.RootDirectory);
        }

        var legacy = JsonSerializer.Deserialize<LegacyCallGraphDocument>(json, JsonOptions)
            ?? throw new InvalidDataException("유효하지 않은 분석 결과 파일입니다.");
        return (BuildFromV1(legacy), legacy.RootDirectory);
    }

    private static string ReadDocumentVersion(JsonElement root)
    {
        foreach (var propertyName in new[] { "version", "Version" })
        {
            if (!root.TryGetProperty(propertyName, out var versionProperty))
            {
                continue;
            }

            return versionProperty.ValueKind switch
            {
                JsonValueKind.String => string.IsNullOrWhiteSpace(versionProperty.GetString())
                    ? InferDocumentVersion(root)
                    : versionProperty.GetString()!,
                JsonValueKind.Number => versionProperty.GetInt32().ToString(),
                _ => InferDocumentVersion(root)
            };
        }

        return InferDocumentVersion(root);
    }

    private static string InferDocumentVersion(JsonElement root)
    {
        if (HasProperty(root, "callGraph", "CallGraph")
            || HasProperty(root, "metrics", "Metrics")
            || HasProperty(root, "duplicates", "Duplicates"))
        {
            return "3";
        }

        if (HasProperty(root, "fileRelations", "FileRelations")
            || HasProperty(root, "directoryRelations", "DirectoryRelations")
            || HasProperty(root, "structure", "Structure"))
        {
            return "2";
        }

        return "1";
    }

    private static bool HasProperty(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (root.TryGetProperty(name, out _))
            {
                return true;
            }
        }

        return false;
    }

    private static AnalysisResult BuildFromDocument(AnalysisDocument d)
    {
        var callGraph = BuildCallGraph(d.CallGraph);
        var (fileNodes, fileEdges) = BuildFileNodes(d.FileRelations);
        var (dirNodes, dirEdges) = BuildDirNodes(d.DirectoryRelations);
        var (types, relations) = BuildStructure(d.Structure);

        return new AnalysisResult
        {
            CallGraph = callGraph,
            FileRelations = BuildFileRelations(fileNodes, fileEdges),
            DirectoryRelations = BuildDirectoryRelations(dirNodes, dirEdges),
            Structure = new ProjectStructureResult
            {
                Types = types,
                Relations = relations,
                TypeMap = types.ToDictionary(t => t.Id, StringComparer.Ordinal)
            },
            Metrics = BuildMetricsResult(d.Metrics),
            Duplicates = BuildDuplicatesResult(d.Duplicates),
            GlobalVariables = BuildGlobalVariablesResult(d.GlobalVariables),
            DatabaseSchema = BuildDatabaseSchemaResult(d.DatabaseSchema),
            BugRisk = BuildBugRiskResult(d.BugRisk),
            Security = BuildSecurityResult(d.Security),
            QualityThresholds = BuildQualityThresholds(d.QualityThresholds),
            Issues = BuildIssuesResult(d.Issues)
        };
    }

    private static AnalysisResult BuildFromV2(AnalysisDocument d)
    {
        var callGraph = BuildCallGraph(d.CallGraph);
        var (fileNodes, fileEdges) = BuildFileNodes(d.FileRelations);
        var (dirNodes, dirEdges) = BuildDirNodes(d.DirectoryRelations);
        var (types, relations) = BuildStructure(d.Structure);

        return new AnalysisResult
        {
            CallGraph = callGraph,
            FileRelations = BuildFileRelations(fileNodes, fileEdges),
            DirectoryRelations = BuildDirectoryRelations(dirNodes, dirEdges),
            Structure = new ProjectStructureResult
            {
                Types = types,
                Relations = relations,
                TypeMap = types.ToDictionary(t => t.Id, StringComparer.Ordinal)
            },
            Metrics = BuildMetricsResult(d.Metrics),
            Duplicates = BuildDuplicatesResult(d.Duplicates),
            GlobalVariables = BuildGlobalVariablesResult(d.GlobalVariables),
            DatabaseSchema = BuildDatabaseSchemaResult(d.DatabaseSchema),
            BugRisk = BuildBugRiskResult(d.BugRisk),
            Security = BuildSecurityResult(d.Security),
            QualityThresholds = BuildQualityThresholds(d.QualityThresholds),
            Issues = BuildIssuesResult(d.Issues)
        };
    }

    private static AnalysisResult BuildFromV1(LegacyCallGraphDocument d)
    {
        var callGraph = CallGraphBuilder.Build(
            d.Nodes.Select(n => new CallGraphNode
            {
                Id = n.Id,
                DisplayName = n.DisplayName,
                FullName = n.FullName,
                FilePath = n.FilePath,
                LineNumber = n.LineNumber
            }).ToList(),
            d.Edges.Select(e => new CallGraphEdge
            {
                CallerId = e.CallerId,
                CalleeId = e.CalleeId
            }).ToList());

        return new AnalysisResult
        {
            CallGraph = callGraph,
            FileRelations = FileCallGraphBuilder.Build(callGraph),
            DirectoryRelations = DirectoryCallGraphBuilder.Build(callGraph),
            Structure = new ProjectStructureResult()
        };
    }

    // ── Shared build helpers ──────────────────────────────────────────────────

    private static CallGraphResult BuildCallGraph(CallGraphSection s) =>
        CallGraphBuilder.Build(
            s.Nodes.Select(n => new CallGraphNode
            {
                Id = n.Id,
                DisplayName = n.DisplayName,
                FullName = n.FullName,
                FilePath = n.FilePath,
                LineNumber = n.LineNumber
            }).ToList(),
            s.Edges.Select(e => new CallGraphEdge
            {
                CallerId = e.CallerId,
                CalleeId = e.CalleeId
            }).ToList());

    private static (List<FileRelationNode> nodes, List<FileRelationEdge> edges) BuildFileNodes(FileRelationsSection s)
    {
        var nodes = s.Files.Select(f => new FileRelationNode
        {
            Id = f.Id,
            FilePath = f.FilePath,
            DisplayName = f.DisplayName,
            FullName = f.FullName,
            FunctionCount = f.FunctionCount
        }).ToList();
        var edges = s.Edges.Select(e => new FileRelationEdge
        {
            FromFileId = e.FromFileId,
            ToFileId = e.ToFileId,
            CallCount = e.CallCount
        }).ToList();
        return (nodes, edges);
    }

    private static (List<DirectoryRelationNode> nodes, List<DirectoryRelationEdge> edges) BuildDirNodes(DirectoryRelationsSection s)
    {
        var nodes = s.Directories.Select(n => new DirectoryRelationNode
        {
            Id = n.Id,
            DirectoryPath = n.DirectoryPath,
            DisplayName = n.DisplayName,
            FullName = n.FullName,
            FileCount = n.FileCount,
            FunctionCount = n.FunctionCount
        }).ToList();
        var edges = s.Edges.Select(e => new DirectoryRelationEdge
        {
            FromDirectoryId = e.FromDirectoryId,
            ToDirectoryId = e.ToDirectoryId,
            CallCount = e.CallCount
        }).ToList();
        return (nodes, edges);
    }

    private static (List<StructureTypeNode> types, List<StructureRelationEdge> relations) BuildStructure(StructureSection s)
    {
        var types = s.Types.Select(t => new StructureTypeNode
        {
            Id = t.Id,
            DisplayName = t.DisplayName,
            FullName = t.FullName,
            FilePath = t.FilePath,
            LineNumber = t.LineNumber,
            Kind = t.Kind,
            Members = t.Members,
            Attributes = t.Attributes,
            Operations = t.Operations,
            IsAbstract = t.IsAbstract
        }).ToList();
        var relations = s.Relations.Select(r => new StructureRelationEdge
        {
            FromId = r.FromId,
            ToId = r.ToId,
            Kind = Enum.TryParse<StructureRelationKind>(r.Kind, out var k) ? k : StructureRelationKind.Dependency
        }).ToList();
        return (types, relations);
    }

    private static CodeMetricsResult BuildMetricsResult(MetricsSection? s)
    {
        if (s is null)
        {
            return new();
        }

        var summaryRecord = s.Summary ?? new CodeQualitySummaryRecord();

        var files = s.Files.Select(f => new FileLineMetric
        {
            FilePath = f.FilePath,
            LanguageId = f.LanguageId,
            PhysicalLines = f.PhysicalLines,
            CodeLines = f.CodeLines,
            BlankLines = f.BlankLines,
            CommentLines = f.CommentLines,
            CommentPercentPer100Code = f.CommentPercentPer100Code,
            TodoMarkerCount = f.TodoMarkerCount,
            TodoDensityPer100Lines = f.TodoDensityPer100Lines,
            IsTestFile = f.IsTestFile,
            PublicApiCount = f.PublicApiCount,
            SecuritySmellCount = f.SecuritySmellCount,
            SecuritySmellSummary = f.SecuritySmellSummary,
            GitChangeLineCount = f.GitChangeLineCount
        }).ToList();

        var aggregates = s.FileAggregates.Select(f => new FileAggregateMetric
        {
            FilePath = f.FilePath,
            LanguageId = f.LanguageId,
            PhysicalLines = f.PhysicalLines,
            CodeLines = f.CodeLines,
            TodoMarkerCount = f.TodoMarkerCount,
            TodoDensityPer100Lines = f.TodoDensityPer100Lines,
            FunctionCount = f.FunctionCount,
            MaxCyclomaticComplexity = f.MaxCyclomaticComplexity,
            MaxCognitiveComplexity = f.MaxCognitiveComplexity,
            MaxNestingDepth = f.MaxNestingDepth,
            MaxFanIn = f.MaxFanIn,
            MaxFanOut = f.MaxFanOut,
            AvgCyclomaticComplexity = f.AvgCyclomaticComplexity,
            AvgCognitiveComplexity = f.AvgCognitiveComplexity,
            AvgMaintenanceIndex = f.AvgMaintenanceIndex,
            MinMaintenanceIndex = f.MinMaintenanceIndex,
            TotalMagicNumbers = f.TotalMagicNumbers,
            MaxReturnCount = f.MaxReturnCount,
            DuplicateLineCount = f.DuplicateLineCount,
            CommentPercentPer100Code = f.CommentPercentPer100Code,
            WarningFunctionCount = f.WarningFunctionCount,
            IsTestFile = f.IsTestFile,
            PublicApiCount = f.PublicApiCount,
            SecuritySmellCount = f.SecuritySmellCount,
            SecuritySmellSummary = f.SecuritySmellSummary,
            GitChangeLineCount = f.GitChangeLineCount,
            MaxStatementCount = f.MaxStatementCount,
            MaxSwitchCaseCount = f.MaxSwitchCaseCount,
            TotalEmptyCatchCount = f.TotalEmptyCatchCount,
            TotalBroadCatchCount = f.TotalBroadCatchCount,
            AsyncVoidCount = f.AsyncVoidCount
        }).ToList();

        var functions = s.Functions.Select(f => new FunctionMetric
        {
            Id = f.Id,
            LanguageId = f.LanguageId,
            DisplayName = f.DisplayName,
            FullName = f.FullName,
            FilePath = f.FilePath,
            StartLine = f.StartLine,
            EndLine = f.EndLine,
            LineCount = f.LineCount,
            CyclomaticComplexity = f.CyclomaticComplexity,
            CognitiveComplexity = f.CognitiveComplexity,
            MaxNestingDepth = f.MaxNestingDepth,
            ParameterCount = f.ParameterCount,
            ReturnCount = f.ReturnCount,
            FanIn = f.FanIn,
            FanOut = f.FanOut,
            MagicNumberCount = f.MagicNumberCount,
            MaintenanceIndex = f.MaintenanceIndex,
            Precision = Enum.TryParse<MetricsPrecision>(f.Precision, out var p) ? p : MetricsPrecision.Approximate,
            StatementCount = f.StatementCount,
            SwitchCaseCount = f.SwitchCaseCount,
            EmptyCatchCount = f.EmptyCatchCount,
            BroadCatchCount = f.BroadCatchCount,
            IsAsyncVoid = f.IsAsyncVoid,
            IsPublic = f.IsPublic,
            IsPossiblyUnused = f.IsPossiblyUnused,
            HalsteadVolume = f.HalsteadVolume,
            WeightedMethodComplexity = f.WeightedMethodComplexity
        }).ToList();

        var packages = (s.Packages ?? []).Select(p => new PackageMetric
        {
            DirectoryPath = p.DirectoryPath,
            AfferentCoupling = p.AfferentCoupling,
            EfferentCoupling = p.EfferentCoupling,
            Instability = p.Instability,
            Abstractness = p.Abstractness,
            DistanceFromMainSequence = p.DistanceFromMainSequence
        }).ToList();

        var summary = new CodeQualitySummary
        {
            ProjectDuplicateLinePercent = summaryRecord.ProjectDuplicateLinePercent,
            DuplicateLineCount = summaryRecord.DuplicateLineCount,
            TotalCodeLines = summaryRecord.TotalCodeLines,
            CircularCallChainCount = summaryRecord.CircularCallChainCount,
            CircularCallChains = summaryRecord.CircularCallChains.Select(c => new CircularCallChain
            {
                DisplayText = c.DisplayText,
                NodeIds = c.NodeIds
            }).ToList(),
            HighCyclomaticCount = summaryRecord.HighCyclomaticCount,
            HighCognitiveCount = summaryRecord.HighCognitiveCount,
            DeepNestingCount = summaryRecord.DeepNestingCount,
            HighFanOutCount = summaryRecord.HighFanOutCount,
            LowMaintenanceIndexCount = summaryRecord.LowMaintenanceIndexCount,
            HighParameterCount = summaryRecord.HighParameterCount,
            TotalTodoMarkers = summaryRecord.TotalTodoMarkers,
            HighTodoDensityFileCount = summaryRecord.HighTodoDensityFileCount,
            HighReturnCount = summaryRecord.HighReturnCount,
            HighMagicNumberCount = summaryRecord.HighMagicNumberCount,
            GodFileCount = summaryRecord.GodFileCount,
            LowCommentFileCount = summaryRecord.LowCommentFileCount,
            HighStatementCount = summaryRecord.HighStatementCount,
            HighSwitchCaseCount = summaryRecord.HighSwitchCaseCount,
            EmptyCatchFunctionCount = summaryRecord.EmptyCatchFunctionCount,
            BroadCatchFunctionCount = summaryRecord.BroadCatchFunctionCount,
            AsyncVoidCount = summaryRecord.AsyncVoidCount,
            PossiblyUnusedCount = summaryRecord.PossiblyUnusedCount,
            HighPublicApiFileCount = summaryRecord.HighPublicApiFileCount,
            TestCodeLinePercent = summaryRecord.TestCodeLinePercent,
            SecuritySmellFileCount = summaryRecord.SecuritySmellFileCount,
            HighInstabilityPackageCount = summaryRecord.HighInstabilityPackageCount,
            LayerViolationCount = summaryRecord.LayerViolationCount,
            LowCohesionTypeCount = summaryRecord.LowCohesionTypeCount,
            DeepInheritanceTypeCount = summaryRecord.DeepInheritanceTypeCount,
            GitHotspotFileCount = summaryRecord.GitHotspotFileCount
        };

        return new CodeMetricsResult
        {
            Files = files,
            FileAggregates = aggregates,
            Functions = functions,
            Packages = packages,
            Summary = summary,
            FileMap = files.ToDictionary(f => f.FilePath, StringComparer.OrdinalIgnoreCase),
            FunctionMap = functions.ToDictionary(f => f.Id, StringComparer.Ordinal)
        };
    }

    private static DuplicateCodeResult BuildDuplicatesResult(DuplicatesSection? s)
    {
        if (s is null) return new();

        return new DuplicateCodeResult
        {
            MinDuplicateLines = NormalizeMinDuplicateLines(s.MinDuplicateLines),
            Groups = s.Groups.Select(g => new DuplicateCodeGroup
            {
                Id = g.Id,
                LineCount = g.LineCount,
                DuplicateLines = g.DuplicateLines.Count > 0 ? g.DuplicateLines : g.SampleLines,
                SampleLines = g.SampleLines,
                Fragments = g.Fragments.Select(f => new DuplicateCodeFragment
                {
                    FilePath = f.FilePath,
                    LanguageId = f.LanguageId,
                    StartLine = f.StartLine,
                    EndLine = f.EndLine
                }).ToList()
            }).ToList()
        };
    }

    private static GlobalVariableResult BuildGlobalVariablesResult(GlobalVariablesSection? s)
    {
        if (s is null)
        {
            return new GlobalVariableResult();
        }

        return new GlobalVariableResult
        {
            Variables = s.Variables.Select(v => new GlobalVariableItem
            {
                Id = v.Id,
                Name = v.Name,
                LanguageId = v.LanguageId,
                FilePath = v.FilePath,
                LineNumber = v.LineNumber,
                Scope = Enum.TryParse<GlobalVariableScope>(v.Scope, out var scope)
                    ? scope
                    : GlobalVariableScope.Module,
                TypeName = v.TypeName,
                ContainingScope = v.ContainingScope,
                AccessModifier = v.AccessModifier ?? string.Empty,
                IsConst = v.IsConst,
                IsReadOnly = v.IsReadOnly,
                Declaration = v.Declaration
            }).ToList(),
            Accesses = (s.Accesses ?? []).Select(a => new GlobalVariableAccess
            {
                GlobalVariableId = a.GlobalVariableId,
                FunctionId = a.FunctionId,
                FunctionDisplayName = a.FunctionDisplayName,
                FunctionFullName = a.FunctionFullName,
                FunctionFilePath = a.FunctionFilePath,
                FunctionLineNumber = a.FunctionLineNumber,
                Kind = Enum.TryParse<GlobalVariableAccessKind>(a.Kind, out var kind)
                    ? kind
                    : GlobalVariableAccessKind.Read
            }).ToList(),
            AccessesByVariableId = BuildAccessLookup(s)
        };
    }

    private static IReadOnlyDictionary<string, IReadOnlyList<GlobalVariableAccess>> BuildAccessLookup(
        GlobalVariablesSection section)
    {
        var accesses = (section.Accesses ?? []).Select(a => new GlobalVariableAccess
        {
            GlobalVariableId = a.GlobalVariableId,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Kind = Enum.TryParse<GlobalVariableAccessKind>(a.Kind, out var kind)
                ? kind
                : GlobalVariableAccessKind.Read
        }).ToList();

        return accesses
            .GroupBy(access => access.GlobalVariableId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<GlobalVariableAccess>)group.ToList(),
                StringComparer.OrdinalIgnoreCase);
    }

    private static DatabaseSchemaResult BuildDatabaseSchemaResult(DatabaseSchemaSection? s)
    {
        if (s is null)
        {
            return new DatabaseSchemaResult();
        }

        var catalogs = (s.Catalogs ?? []).Select(c => new DatabaseCatalog
        {
            Id = c.Id,
            Name = c.Name,
            Dialect = Enum.TryParse<DatabaseDialect>(c.Dialect, out var catalogDialect)
                ? catalogDialect
                : DatabaseDialect.Unknown,
            SourceKind = c.SourceKind,
            FilePath = string.IsNullOrWhiteSpace(c.FilePath) ? null : c.FilePath,
            LineNumber = c.LineNumber
        }).ToList();

        var tables = s.Tables.Select(t => new DatabaseTable
        {
            Id = t.Id,
            Name = t.Name,
            Schema = string.IsNullOrWhiteSpace(t.Schema) ? null : t.Schema,
            EntityTypeName = t.EntityTypeName ?? string.Empty,
            Dialect = Enum.TryParse<DatabaseDialect>(t.Dialect, out var dialect) ? dialect : DatabaseDialect.Unknown,
            SourceKind = t.SourceKind,
            FilePath = t.FilePath,
            LineNumber = t.LineNumber,
            AccessAliases = (t.AccessAliases ?? []).ToList(),
            Columns = t.Columns.Select(c => new DatabaseColumn
            {
                Name = c.Name,
                DataType = c.DataType,
                IsPrimaryKey = c.IsPrimaryKey,
                IsForeignKey = c.IsForeignKey,
                IsNullable = c.IsNullable,
                ReferencedTable = c.ReferencedTable,
                ReferencedColumn = c.ReferencedColumn
            }).ToList()
        }).ToList();

        var relations = s.Relations.Select(r => new DatabaseRelation
        {
            FromTableId = r.FromTableId,
            ToTableId = r.ToTableId,
            FromColumn = r.FromColumn,
            ToColumn = r.ToColumn,
            Kind = Enum.TryParse<DatabaseRelationKind>(r.Kind, out var kind) ? kind : DatabaseRelationKind.ForeignKey,
            Label = r.Label
        }).ToList();

        var accesses = (s.Accesses ?? []).Select(a => new DatabaseTableAccess
        {
            TableId = a.TableId,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Kind = Enum.TryParse<DatabaseTableAccessKind>(a.Kind, out var kind) ? kind : DatabaseTableAccessKind.Read,
            Pattern = Enum.TryParse<DatabaseTableAccessPattern>(a.Pattern, out var pattern) ? pattern : DatabaseTableAccessPattern.Sql,
            Operations = Enum.TryParse<DatabaseCrudOperation>(a.Operations, out var operations) ? operations : DatabaseCrudOperation.None
        }).ToList();

        var catalogAccesses = (s.CatalogAccesses ?? []).Select(a => new DatabaseCatalogAccess
        {
            CatalogId = a.CatalogId,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Kind = Enum.TryParse<DatabaseCatalogAccessKind>(a.Kind, out var kind)
                ? kind
                : DatabaseCatalogAccessKind.Connect,
            Pattern = Enum.TryParse<DatabaseCatalogAccessPattern>(a.Pattern, out var pattern)
                ? pattern
                : DatabaseCatalogAccessPattern.Sql,
            Operations = Enum.TryParse<DatabaseCrudOperation>(a.Operations, out var operations)
                ? operations
                : DatabaseCrudOperation.None
        }).ToList();

        var columnAccesses = (s.ColumnAccesses ?? []).Select(a => new DatabaseColumnAccess
        {
            TableId = a.TableId,
            ColumnName = a.ColumnName,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Kind = Enum.TryParse<DatabaseTableAccessKind>(a.Kind, out var kind) ? kind : DatabaseTableAccessKind.Read,
            Pattern = Enum.TryParse<DatabaseTableAccessPattern>(a.Pattern, out var pattern) ? pattern : DatabaseTableAccessPattern.Sql,
            Operations = Enum.TryParse<DatabaseCrudOperation>(a.Operations, out var operations) ? operations : DatabaseCrudOperation.None
        }).ToList();

        var entryAccesses = (s.EntryAccesses ?? []).Select(a => new DatabaseEntryAccess
        {
            TableId = a.TableId,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Operation = Enum.TryParse<DatabaseCrudOperation>(a.Operation, out var operation) ? operation : DatabaseCrudOperation.None,
            Pattern = Enum.TryParse<DatabaseTableAccessPattern>(a.Pattern, out var pattern) ? pattern : DatabaseTableAccessPattern.Sql
        }).ToList();

        return new DatabaseSchemaResult
        {
            Catalogs = catalogs,
            Tables = tables,
            Relations = relations,
            CatalogAccesses = catalogAccesses,
            Accesses = accesses,
            ColumnAccesses = columnAccesses,
            EntryAccesses = entryAccesses,
            CatalogMap = catalogs.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase),
            TableMap = tables.ToDictionary(t => t.Id, StringComparer.OrdinalIgnoreCase),
            CatalogAccessesByCatalogId = GroupByKey(catalogAccesses, access => access.CatalogId),
            AccessesByTableId = GroupByKey(accesses, access => access.TableId),
            ColumnAccessesByTableId = GroupByKey(columnAccesses, access => access.TableId),
            EntryAccessesByTableId = GroupByKey(entryAccesses, access => access.TableId)
        };
    }

    private static IReadOnlyDictionary<string, IReadOnlyList<TAccess>> GroupByKey<TAccess>(
        IEnumerable<TAccess> accesses,
        Func<TAccess, string> keySelector) =>
        accesses
            .GroupBy(keySelector, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<TAccess>)group.ToList(),
                StringComparer.OrdinalIgnoreCase);

    private static int NormalizeMinDuplicateLines(int value) =>
        UserAnalysisSettings.NormalizeMinDuplicateLines(value);

    private static UserAnalysisSettings BuildQualityThresholds(QualityThresholdsRecord? r)
    {
        if (r is null)
        {
            return UserAnalysisSettings.CreateDefaults();
        }

        return UserAnalysisSettings.ResolveForAnalysis(new UserAnalysisSettings
        {
            MinDuplicateLines = r.MinDuplicateLines,
            EnabledInspections = r.EnabledInspections == 0
                ? MetricInspectionKind.All
                : (MetricInspectionKind)r.EnabledInspections,
            EnabledAnalysisScope = r.EnabledAnalysisScope == 0
                ? AnalysisScopeKind.All
                : (AnalysisScopeKind)r.EnabledAnalysisScope,
            IncludedDirectoryPaths = r.IncludedDirectoryPaths?.ToList() ?? [],
            ExcludedDirectoryPaths = r.ExcludedDirectoryPaths?.ToList() ?? [],
            WarnCyclomaticComplexity = r.WarnCyclomaticComplexity,
            WarnCognitiveComplexity = r.WarnCognitiveComplexity,
            WarnMaxNestingDepth = r.WarnMaxNestingDepth,
            WarnParameterCount = r.WarnParameterCount,
            WarnFanOut = r.WarnFanOut,
            WarnMaintenanceIndex = r.WarnMaintenanceIndex,
            WarnTodoDensityPer100Lines = r.WarnTodoDensityPer100Lines,
            WarnReturnCount = r.WarnReturnCount,
            WarnMagicNumbers = r.WarnMagicNumbers,
            WarnGodFileCodeLines = r.WarnGodFileCodeLines,
            WarnMinCommentPercent = r.WarnMinCommentPercent,
            WarnGodTypeMemberCount = r.WarnGodTypeMemberCount,
            WarnStatementCount = r.WarnStatementCount,
            WarnSwitchCaseCount = r.WarnSwitchCaseCount,
            WarnPublicApiCount = r.WarnPublicApiCount,
            WarnMinTestCodePercent = r.WarnMinTestCodePercent,
            WarnInstability = r.WarnInstability,
            WarnLackOfCohesion = r.WarnLackOfCohesion,
            WarnInheritanceDepth = r.WarnInheritanceDepth,
            WarnGitChangeLines = r.WarnGitChangeLines,
            WarnSecuritySmellCount = r.WarnSecuritySmellCount
        });
    }

    private static BugRiskResult BuildBugRiskResult(BugRiskSection? s)
    {
        if (s?.Findings is null || s.Findings.Count == 0)
        {
            return BugRiskResult.Empty;
        }

        var findings = s.Findings.Select(f => new BugRiskFinding
        {
            Category = Enum.TryParse<BugRiskCategory>(f.Category, out var category)
                ? category
                : BugRiskCategory.LintViolation,
            Severity = Enum.TryParse<BugRiskSeverity>(f.Severity, out var severity)
                ? severity
                : BugRiskSeverity.Info,
            Message = f.Message,
            FilePath = f.FilePath,
            LineNumber = f.LineNumber,
            FunctionName = f.FunctionName,
            Detail = f.Detail,
            Snippet = f.Snippet,
            LanguageId = f.LanguageId
        });

        return BugRiskResult.FromFindings(findings);
    }

    private static SecurityAnalysisResult BuildSecurityResult(SecuritySection? s)
    {
        if (s?.Findings is null || s.Findings.Count == 0)
        {
            return SecurityAnalysisResult.Empty;
        }

        var findings = s.Findings.Select(f => new SecurityFinding
        {
            RuleId = f.RuleId,
            Label = f.Label,
            Severity = Enum.TryParse<SecuritySeverity>(f.Severity, out var severity)
                ? severity
                : SecuritySeverity.Info,
            FilePath = f.FilePath,
            LanguageId = f.LanguageId,
            LineNumber = f.LineNumber,
            Snippet = f.Snippet,
            Explanation = f.Explanation,
            Remediation = f.Remediation
        });

        return SecurityAnalysisResult.FromFindings(findings);
    }

    private static IReadOnlyList<AnalysisIssue> BuildIssuesResult(IssuesSection? s)
    {
        if (s?.Items is null || s.Items.Count == 0)
        {
            return [];
        }

        return s.Items.Select(i => new AnalysisIssue
        {
            Stage = i.Stage,
            Message = i.Message,
            Detail = i.Detail
        }).ToList();
    }

    // ── Section builders (model → record) ───────────────────────────────────

    private static MetricsSection MetricsSectionFrom(CodeMetricsResult m) => new()
    {
        Files = m.Files.Select(f => new FileLineMetricRecord
        {
            FilePath = f.FilePath,
            LanguageId = f.LanguageId,
            PhysicalLines = f.PhysicalLines,
            CodeLines = f.CodeLines,
            BlankLines = f.BlankLines,
            CommentLines = f.CommentLines,
            CommentPercentPer100Code = f.CommentPercentPer100Code,
            TodoMarkerCount = f.TodoMarkerCount,
            TodoDensityPer100Lines = f.TodoDensityPer100Lines,
            IsTestFile = f.IsTestFile,
            PublicApiCount = f.PublicApiCount,
            SecuritySmellCount = f.SecuritySmellCount,
            SecuritySmellSummary = f.SecuritySmellSummary,
            GitChangeLineCount = f.GitChangeLineCount
        }).ToList(),
        FileAggregates = m.FileAggregates.Select(f => new FileAggregateMetricRecord
        {
            FilePath = f.FilePath,
            LanguageId = f.LanguageId,
            PhysicalLines = f.PhysicalLines,
            CodeLines = f.CodeLines,
            TodoMarkerCount = f.TodoMarkerCount,
            TodoDensityPer100Lines = f.TodoDensityPer100Lines,
            FunctionCount = f.FunctionCount,
            MaxCyclomaticComplexity = f.MaxCyclomaticComplexity,
            MaxCognitiveComplexity = f.MaxCognitiveComplexity,
            MaxNestingDepth = f.MaxNestingDepth,
            MaxFanIn = f.MaxFanIn,
            MaxFanOut = f.MaxFanOut,
            AvgCyclomaticComplexity = f.AvgCyclomaticComplexity,
            AvgCognitiveComplexity = f.AvgCognitiveComplexity,
            AvgMaintenanceIndex = f.AvgMaintenanceIndex,
            MinMaintenanceIndex = f.MinMaintenanceIndex,
            TotalMagicNumbers = f.TotalMagicNumbers,
            MaxReturnCount = f.MaxReturnCount,
            DuplicateLineCount = f.DuplicateLineCount,
            CommentPercentPer100Code = f.CommentPercentPer100Code,
            WarningFunctionCount = f.WarningFunctionCount,
            IsTestFile = f.IsTestFile,
            PublicApiCount = f.PublicApiCount,
            SecuritySmellCount = f.SecuritySmellCount,
            SecuritySmellSummary = f.SecuritySmellSummary,
            GitChangeLineCount = f.GitChangeLineCount,
            MaxStatementCount = f.MaxStatementCount,
            MaxSwitchCaseCount = f.MaxSwitchCaseCount,
            TotalEmptyCatchCount = f.TotalEmptyCatchCount,
            TotalBroadCatchCount = f.TotalBroadCatchCount,
            AsyncVoidCount = f.AsyncVoidCount
        }).ToList(),
        Functions = m.Functions.Select(f => new FunctionMetricRecord
        {
            Id = f.Id,
            LanguageId = f.LanguageId,
            DisplayName = f.DisplayName,
            FullName = f.FullName,
            FilePath = f.FilePath,
            StartLine = f.StartLine,
            EndLine = f.EndLine,
            LineCount = f.LineCount,
            CyclomaticComplexity = f.CyclomaticComplexity,
            CognitiveComplexity = f.CognitiveComplexity,
            MaxNestingDepth = f.MaxNestingDepth,
            ParameterCount = f.ParameterCount,
            ReturnCount = f.ReturnCount,
            FanIn = f.FanIn,
            FanOut = f.FanOut,
            MagicNumberCount = f.MagicNumberCount,
            MaintenanceIndex = f.MaintenanceIndex,
            Precision = f.Precision.ToString(),
            StatementCount = f.StatementCount,
            SwitchCaseCount = f.SwitchCaseCount,
            EmptyCatchCount = f.EmptyCatchCount,
            BroadCatchCount = f.BroadCatchCount,
            IsAsyncVoid = f.IsAsyncVoid,
            IsPublic = f.IsPublic,
            IsPossiblyUnused = f.IsPossiblyUnused,
            HalsteadVolume = f.HalsteadVolume,
            WeightedMethodComplexity = f.WeightedMethodComplexity
        }).ToList(),
        Packages = m.Packages.Select(p => new PackageMetricRecord
        {
            DirectoryPath = p.DirectoryPath,
            AfferentCoupling = p.AfferentCoupling,
            EfferentCoupling = p.EfferentCoupling,
            Instability = p.Instability,
            Abstractness = p.Abstractness,
            DistanceFromMainSequence = p.DistanceFromMainSequence
        }).ToList(),
        Summary = new CodeQualitySummaryRecord
        {
            ProjectDuplicateLinePercent = m.Summary.ProjectDuplicateLinePercent,
            DuplicateLineCount = m.Summary.DuplicateLineCount,
            TotalCodeLines = m.Summary.TotalCodeLines,
            CircularCallChainCount = m.Summary.CircularCallChainCount,
            CircularCallChains = m.Summary.CircularCallChains.Select(c => new CircularCallChainRecord
            {
                DisplayText = c.DisplayText,
                NodeIds = c.NodeIds.ToList()
            }).ToList(),
            HighCyclomaticCount = m.Summary.HighCyclomaticCount,
            HighCognitiveCount = m.Summary.HighCognitiveCount,
            DeepNestingCount = m.Summary.DeepNestingCount,
            HighFanOutCount = m.Summary.HighFanOutCount,
            LowMaintenanceIndexCount = m.Summary.LowMaintenanceIndexCount,
            HighParameterCount = m.Summary.HighParameterCount,
            TotalTodoMarkers = m.Summary.TotalTodoMarkers,
            HighTodoDensityFileCount = m.Summary.HighTodoDensityFileCount,
            HighReturnCount = m.Summary.HighReturnCount,
            HighMagicNumberCount = m.Summary.HighMagicNumberCount,
            GodFileCount = m.Summary.GodFileCount,
            LowCommentFileCount = m.Summary.LowCommentFileCount,
            HighStatementCount = m.Summary.HighStatementCount,
            HighSwitchCaseCount = m.Summary.HighSwitchCaseCount,
            EmptyCatchFunctionCount = m.Summary.EmptyCatchFunctionCount,
            BroadCatchFunctionCount = m.Summary.BroadCatchFunctionCount,
            AsyncVoidCount = m.Summary.AsyncVoidCount,
            PossiblyUnusedCount = m.Summary.PossiblyUnusedCount,
            HighPublicApiFileCount = m.Summary.HighPublicApiFileCount,
            TestCodeLinePercent = m.Summary.TestCodeLinePercent,
            SecuritySmellFileCount = m.Summary.SecuritySmellFileCount,
            HighInstabilityPackageCount = m.Summary.HighInstabilityPackageCount,
            LayerViolationCount = m.Summary.LayerViolationCount,
            LowCohesionTypeCount = m.Summary.LowCohesionTypeCount,
            DeepInheritanceTypeCount = m.Summary.DeepInheritanceTypeCount,
            GitHotspotFileCount = m.Summary.GitHotspotFileCount
        }
    };

    private static BugRiskSection BugRiskSectionFrom(BugRiskResult bugRisk) => new()
    {
        Findings = bugRisk.Findings.Select(f => new BugRiskFindingRecord
        {
            Category = f.Category.ToString(),
            Severity = f.Severity.ToString(),
            Message = f.Message,
            FilePath = f.FilePath,
            LineNumber = f.LineNumber,
            FunctionName = f.FunctionName,
            Detail = f.Detail,
            Snippet = f.Snippet,
            LanguageId = f.LanguageId
        }).ToList()
    };

    private static SecuritySection SecuritySectionFrom(SecurityAnalysisResult security) => new()
    {
        Findings = security.Findings.Select(f => new SecurityFindingRecord
        {
            RuleId = f.RuleId,
            Label = f.Label,
            Severity = f.Severity.ToString(),
            FilePath = f.FilePath,
            LanguageId = f.LanguageId,
            LineNumber = f.LineNumber,
            Snippet = f.Snippet,
            Explanation = f.Explanation,
            Remediation = f.Remediation
        }).ToList()
    };

    private static IssuesSection IssuesSectionFrom(IReadOnlyList<AnalysisIssue> issues) => new()
    {
        Items = issues.Select(i => new AnalysisIssueRecord
        {
            Stage = i.Stage,
            Message = i.Message,
            Detail = i.Detail
        }).ToList()
    };

    private static DuplicatesSection DuplicatesSectionFrom(DuplicateCodeResult d) => new()
    {
        MinDuplicateLines = d.MinDuplicateLines,
        Groups = d.Groups.Select(g => new DuplicateCodeGroupRecord
        {
            Id = g.Id,
            LineCount = g.LineCount,
            DuplicateLines = g.DuplicateLines.ToList(),
            SampleLines = g.SampleLines.ToList(),
            Fragments = g.Fragments.Select(f => new DuplicateCodeFragmentRecord
            {
                FilePath = f.FilePath,
                LanguageId = f.LanguageId,
                StartLine = f.StartLine,
                EndLine = f.EndLine
            }).ToList()
        }).ToList()
    };

    private static GlobalVariablesSection GlobalVariablesSectionFrom(GlobalVariableResult g) => new()
    {
        Variables = g.Variables.Select(v => new GlobalVariableRecord
        {
            Id = v.Id,
            Name = v.Name,
            LanguageId = v.LanguageId,
            FilePath = v.FilePath,
            LineNumber = v.LineNumber,
            Scope = v.Scope.ToString(),
            TypeName = v.TypeName,
            ContainingScope = v.ContainingScope,
            AccessModifier = v.AccessModifier,
            IsConst = v.IsConst,
            IsReadOnly = v.IsReadOnly,
            Declaration = v.Declaration
        }).ToList(),
        Accesses = g.Accesses.Select(a => new GlobalVariableAccessRecord
        {
            GlobalVariableId = a.GlobalVariableId,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Kind = a.Kind.ToString()
        }).ToList()
    };

    private static DatabaseSchemaSection DatabaseSchemaSectionFrom(DatabaseSchemaResult schema) => new()
    {
        Catalogs = schema.Catalogs.Select(c => new DatabaseCatalogRecord
        {
            Id = c.Id,
            Name = c.Name,
            Dialect = c.Dialect.ToString(),
            SourceKind = c.SourceKind,
            FilePath = c.FilePath ?? string.Empty,
            LineNumber = c.LineNumber
        }).ToList(),
        Tables = schema.Tables.Select(t => new DatabaseTableRecord
        {
            Id = t.Id,
            Name = t.Name,
            Schema = t.Schema ?? string.Empty,
            EntityTypeName = t.EntityTypeName,
            Dialect = t.Dialect.ToString(),
            SourceKind = t.SourceKind,
            FilePath = t.FilePath,
            LineNumber = t.LineNumber,
            AccessAliases = t.AccessAliases.ToList(),
            Columns = t.Columns.Select(c => new DatabaseColumnRecord
            {
                Name = c.Name,
                DataType = c.DataType,
                IsPrimaryKey = c.IsPrimaryKey,
                IsForeignKey = c.IsForeignKey,
                IsNullable = c.IsNullable,
                ReferencedTable = c.ReferencedTable ?? string.Empty,
                ReferencedColumn = c.ReferencedColumn ?? string.Empty
            }).ToList()
        }).ToList(),
        Relations = schema.Relations.Select(r => new DatabaseRelationRecord
        {
            FromTableId = r.FromTableId,
            ToTableId = r.ToTableId,
            FromColumn = r.FromColumn ?? string.Empty,
            ToColumn = r.ToColumn ?? string.Empty,
            Kind = r.Kind.ToString(),
            Label = r.Label
        }).ToList(),
        Accesses = schema.Accesses.Select(a => new DatabaseTableAccessRecord
        {
            TableId = a.TableId,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Kind = a.Kind.ToString(),
            Pattern = a.Pattern.ToString(),
            Operations = a.Operations.ToString()
        }).ToList(),
        CatalogAccesses = schema.CatalogAccesses.Select(a => new DatabaseCatalogAccessRecord
        {
            CatalogId = a.CatalogId,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Kind = a.Kind.ToString(),
            Pattern = a.Pattern.ToString(),
            Operations = a.Operations.ToString()
        }).ToList(),
        ColumnAccesses = schema.ColumnAccesses.Select(a => new DatabaseColumnAccessRecord
        {
            TableId = a.TableId,
            ColumnName = a.ColumnName,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Kind = a.Kind.ToString(),
            Pattern = a.Pattern.ToString(),
            Operations = a.Operations.ToString()
        }).ToList(),
        EntryAccesses = schema.EntryAccesses.Select(a => new DatabaseEntryAccessRecord
        {
            TableId = a.TableId,
            FunctionId = a.FunctionId,
            FunctionDisplayName = a.FunctionDisplayName,
            FunctionFullName = a.FunctionFullName,
            FunctionFilePath = a.FunctionFilePath,
            FunctionLineNumber = a.FunctionLineNumber,
            Operation = a.Operation.ToString(),
            Pattern = a.Pattern.ToString()
        }).ToList()
    };

    private static QualityThresholdsRecord QualityThresholdsRecordFrom(UserAnalysisSettings s) => new()
    {
        MinDuplicateLines = s.MinDuplicateLines,
        WarnCyclomaticComplexity = s.WarnCyclomaticComplexity,
        WarnCognitiveComplexity = s.WarnCognitiveComplexity,
        WarnMaxNestingDepth = s.WarnMaxNestingDepth,
        WarnParameterCount = s.WarnParameterCount,
        WarnFanOut = s.WarnFanOut,
        WarnMaintenanceIndex = s.WarnMaintenanceIndex,
        WarnTodoDensityPer100Lines = s.WarnTodoDensityPer100Lines,
        WarnReturnCount = s.WarnReturnCount,
        WarnMagicNumbers = s.WarnMagicNumbers,
        WarnGodFileCodeLines = s.WarnGodFileCodeLines,
        WarnMinCommentPercent = s.WarnMinCommentPercent,
        WarnGodTypeMemberCount = s.WarnGodTypeMemberCount,
        WarnStatementCount = s.WarnStatementCount,
        WarnSwitchCaseCount = s.WarnSwitchCaseCount,
        WarnPublicApiCount = s.WarnPublicApiCount,
        WarnMinTestCodePercent = s.WarnMinTestCodePercent,
        WarnInstability = s.WarnInstability,
        WarnLackOfCohesion = s.WarnLackOfCohesion,
        WarnInheritanceDepth = s.WarnInheritanceDepth,
        WarnGitChangeLines = s.WarnGitChangeLines,
        WarnSecuritySmellCount = s.WarnSecuritySmellCount,
        EnabledInspections = (ulong)s.EnabledInspections,
        EnabledAnalysisScope = (ulong)(s.EnabledAnalysisScope != 0
            ? s.EnabledAnalysisScope
            : AnalysisScopeResolver.Resolve(MetricInspectionScope.Normalize(s.EnabledInspections))),
        IncludedDirectoryPaths = s.IncludedDirectoryPaths.ToList(),
        ExcludedDirectoryPaths = s.ExcludedDirectoryPaths.ToList()
    };

    private static FileRelationGraphResult BuildFileRelations(
        List<FileRelationNode> files, List<FileRelationEdge> edges)
    {
        var outgoing = files.ToDictionary(f => f.Id, _ => new List<string>(), StringComparer.OrdinalIgnoreCase);
        foreach (var e in edges)
        {
            if (outgoing.TryGetValue(e.FromFileId, out var list))
            {
                list.Add(e.ToFileId);
            }
        }

        return new FileRelationGraphResult
        {
            Files = files,
            Edges = edges,
            FileMap = files.ToDictionary(f => f.Id, StringComparer.OrdinalIgnoreCase),
            Outgoing = outgoing
        };
    }

    private static DirectoryRelationGraphResult BuildDirectoryRelations(
        List<DirectoryRelationNode> directories, List<DirectoryRelationEdge> edges)
    {
        var outgoing = directories.ToDictionary(d => d.Id, _ => new List<string>(), StringComparer.OrdinalIgnoreCase);
        foreach (var e in edges)
        {
            if (outgoing.TryGetValue(e.FromDirectoryId, out var list))
            {
                list.Add(e.ToDirectoryId);
            }
        }

        return new DirectoryRelationGraphResult
        {
            Directories = directories,
            Edges = edges,
            DirectoryMap = directories.ToDictionary(d => d.Id, StringComparer.OrdinalIgnoreCase),
            Outgoing = outgoing
        };
    }

    // ── Document models ──────────────────────────────────────────────────────

    private sealed class AnalysisDocument
    {
        public string Version { get; set; } = "5";
        public string RootDirectory { get; set; } = string.Empty;
        public DateTime SavedAtUtc { get; set; }
        public CallGraphSection CallGraph { get; set; } = new();
        public FileRelationsSection FileRelations { get; set; } = new();
        public DirectoryRelationsSection DirectoryRelations { get; set; } = new();
        public StructureSection Structure { get; set; } = new();
        public MetricsSection? Metrics { get; set; }
        public DuplicatesSection? Duplicates { get; set; }
        public GlobalVariablesSection? GlobalVariables { get; set; }
        public DatabaseSchemaSection? DatabaseSchema { get; set; }
        public BugRiskSection? BugRisk { get; set; }
        public SecuritySection? Security { get; set; }
        public QualityThresholdsRecord? QualityThresholds { get; set; }
        public IssuesSection? Issues { get; set; }
    }

    private sealed class LegacyCallGraphDocument
    {
        public string Version { get; set; } = "1";
        public string RootDirectory { get; set; } = string.Empty;
        public DateTime SavedAtUtc { get; set; }
        public List<CallGraphNodeRecord> Nodes { get; set; } = [];
        public List<CallGraphEdgeRecord> Edges { get; set; } = [];
    }

    private sealed class CallGraphSection
    {
        public List<CallGraphNodeRecord> Nodes { get; set; } = [];
        public List<CallGraphEdgeRecord> Edges { get; set; } = [];
    }

    private sealed class FileRelationsSection
    {
        public List<FileRelationNodeRecord> Files { get; set; } = [];
        public List<FileRelationEdgeRecord> Edges { get; set; } = [];
    }

    private sealed class DirectoryRelationsSection
    {
        public List<DirectoryRelationNodeRecord> Directories { get; set; } = [];
        public List<DirectoryRelationEdgeRecord> Edges { get; set; } = [];
    }

    private sealed class StructureSection
    {
        public List<StructureTypeRecord> Types { get; set; } = [];
        public List<StructureRelationRecord> Relations { get; set; } = [];
    }

    private sealed class MetricsSection
    {
        public List<FileLineMetricRecord> Files { get; set; } = [];
        public List<FileAggregateMetricRecord> FileAggregates { get; set; } = [];
        public List<FunctionMetricRecord> Functions { get; set; } = [];
        public List<PackageMetricRecord> Packages { get; set; } = [];
        public CodeQualitySummaryRecord Summary { get; set; } = new();
    }

    private sealed class BugRiskSection
    {
        public List<BugRiskFindingRecord> Findings { get; set; } = [];
    }

    private sealed class SecuritySection
    {
        public List<SecurityFindingRecord> Findings { get; set; } = [];
    }

    private sealed class DuplicatesSection
    {
        public int MinDuplicateLines { get; set; } = UserAnalysisSettings.DefaultMinDuplicateLines;
        public List<DuplicateCodeGroupRecord> Groups { get; set; } = [];
    }

    private sealed class GlobalVariablesSection
    {
        public List<GlobalVariableRecord> Variables { get; set; } = [];
        public List<GlobalVariableAccessRecord> Accesses { get; set; } = [];
    }

    private sealed class DatabaseSchemaSection
    {
        public List<DatabaseCatalogRecord> Catalogs { get; set; } = [];
        public List<DatabaseTableRecord> Tables { get; set; } = [];
        public List<DatabaseRelationRecord> Relations { get; set; } = [];
        public List<DatabaseCatalogAccessRecord> CatalogAccesses { get; set; } = [];
        public List<DatabaseTableAccessRecord> Accesses { get; set; } = [];
        public List<DatabaseColumnAccessRecord> ColumnAccesses { get; set; } = [];
        public List<DatabaseEntryAccessRecord> EntryAccesses { get; set; } = [];
    }

    private sealed class IssuesSection
    {
        public List<AnalysisIssueRecord> Items { get; set; } = [];
    }

    private sealed class QualityThresholdsRecord
    {
        public int MinDuplicateLines { get; set; } = UserAnalysisSettings.DefaultMinDuplicateLines;
        public int WarnCyclomaticComplexity { get; set; } = UserAnalysisSettings.DefaultWarnCyclomaticComplexity;
        public int WarnCognitiveComplexity { get; set; } = UserAnalysisSettings.DefaultWarnCognitiveComplexity;
        public int WarnMaxNestingDepth { get; set; } = UserAnalysisSettings.DefaultWarnMaxNestingDepth;
        public int WarnParameterCount { get; set; } = UserAnalysisSettings.DefaultWarnParameterCount;
        public int WarnFanOut { get; set; } = UserAnalysisSettings.DefaultWarnFanOut;
        public double WarnMaintenanceIndex { get; set; } = UserAnalysisSettings.DefaultWarnMaintenanceIndex;
        public double WarnTodoDensityPer100Lines { get; set; } = UserAnalysisSettings.DefaultWarnTodoDensityPer100Lines;
        public int WarnReturnCount { get; set; }
        public int WarnMagicNumbers { get; set; }
        public int WarnGodFileCodeLines { get; set; }
        public double WarnMinCommentPercent { get; set; }
        public int WarnGodTypeMemberCount { get; set; }
        public int WarnStatementCount { get; set; }
        public int WarnSwitchCaseCount { get; set; }
        public int WarnPublicApiCount { get; set; }
        public double WarnMinTestCodePercent { get; set; }
        public double WarnInstability { get; set; }
        public double WarnLackOfCohesion { get; set; }
        public int WarnInheritanceDepth { get; set; }
        public int WarnGitChangeLines { get; set; }
        public int WarnSecuritySmellCount { get; set; }
        public ulong EnabledInspections { get; set; } = (ulong)MetricInspectionKind.All;
        public ulong EnabledAnalysisScope { get; set; } = (ulong)AnalysisScopeKind.All;
        public List<string> IncludedDirectoryPaths { get; set; } = [];
        public List<string> ExcludedDirectoryPaths { get; set; } = [];
    }

    // ── Record types ─────────────────────────────────────────────────────────

    private sealed class CallGraphNodeRecord
    {
        public string Id { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
    }

    private sealed class CallGraphEdgeRecord
    {
        public string CallerId { get; set; } = string.Empty;
        public string CalleeId { get; set; } = string.Empty;
    }

    private sealed class FileRelationNodeRecord
    {
        public string Id { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public int FunctionCount { get; set; }
    }

    private sealed class FileRelationEdgeRecord
    {
        public string FromFileId { get; set; } = string.Empty;
        public string ToFileId { get; set; } = string.Empty;
        public int CallCount { get; set; }
    }

    private sealed class DirectoryRelationNodeRecord
    {
        public string Id { get; set; } = string.Empty;
        public string DirectoryPath { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public int FileCount { get; set; }
        public int FunctionCount { get; set; }
    }

    private sealed class DirectoryRelationEdgeRecord
    {
        public string FromDirectoryId { get; set; } = string.Empty;
        public string ToDirectoryId { get; set; } = string.Empty;
        public int CallCount { get; set; }
    }

    private sealed class StructureTypeRecord
    {
        public string Id { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public string Kind { get; set; } = "class";
        public List<string> Members { get; set; } = [];
        public List<string> Attributes { get; set; } = [];
        public List<string> Operations { get; set; } = [];
        public bool IsAbstract { get; set; }
    }

    private sealed class StructureRelationRecord
    {
        public string FromId { get; set; } = string.Empty;
        public string ToId { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
    }

    private sealed class FileLineMetricRecord
    {
        public string FilePath { get; set; } = string.Empty;
        public string LanguageId { get; set; } = string.Empty;
        public int PhysicalLines { get; set; }
        public int CodeLines { get; set; }
        public int BlankLines { get; set; }
        public int CommentLines { get; set; }
        public double CommentPercentPer100Code { get; set; }
        public int TodoMarkerCount { get; set; }
        public double TodoDensityPer100Lines { get; set; }
        public bool IsTestFile { get; set; }
        public int PublicApiCount { get; set; }
        public int SecuritySmellCount { get; set; }
        public string? SecuritySmellSummary { get; set; }
        public int GitChangeLineCount { get; set; }
    }

    private sealed class FileAggregateMetricRecord
    {
        public string FilePath { get; set; } = string.Empty;
        public string LanguageId { get; set; } = string.Empty;
        public int PhysicalLines { get; set; }
        public int CodeLines { get; set; }
        public int TodoMarkerCount { get; set; }
        public double TodoDensityPer100Lines { get; set; }
        public int FunctionCount { get; set; }
        public int MaxCyclomaticComplexity { get; set; }
        public int MaxCognitiveComplexity { get; set; }
        public int MaxNestingDepth { get; set; }
        public int MaxFanIn { get; set; }
        public int MaxFanOut { get; set; }
        public double AvgCyclomaticComplexity { get; set; }
        public double AvgCognitiveComplexity { get; set; }
        public double AvgMaintenanceIndex { get; set; }
        public double MinMaintenanceIndex { get; set; }
        public int TotalMagicNumbers { get; set; }
        public int MaxReturnCount { get; set; }
        public int DuplicateLineCount { get; set; }
        public double CommentPercentPer100Code { get; set; }
        public int WarningFunctionCount { get; set; }
        public bool IsTestFile { get; set; }
        public int PublicApiCount { get; set; }
        public int SecuritySmellCount { get; set; }
        public string? SecuritySmellSummary { get; set; }
        public int GitChangeLineCount { get; set; }
        public int MaxStatementCount { get; set; }
        public int MaxSwitchCaseCount { get; set; }
        public int TotalEmptyCatchCount { get; set; }
        public int TotalBroadCatchCount { get; set; }
        public int AsyncVoidCount { get; set; }
    }

    private sealed class FunctionMetricRecord
    {
        public string Id { get; set; } = string.Empty;
        public string LanguageId { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int StartLine { get; set; }
        public int EndLine { get; set; }
        public int LineCount { get; set; }
        public int CyclomaticComplexity { get; set; }
        public int CognitiveComplexity { get; set; }
        public int MaxNestingDepth { get; set; }
        public int ParameterCount { get; set; }
        public int ReturnCount { get; set; }
        public int FanIn { get; set; }
        public int FanOut { get; set; }
        public int MagicNumberCount { get; set; }
        public double MaintenanceIndex { get; set; }
        public string Precision { get; set; } = string.Empty;
        public int StatementCount { get; set; }
        public int SwitchCaseCount { get; set; }
        public int EmptyCatchCount { get; set; }
        public int BroadCatchCount { get; set; }
        public bool IsAsyncVoid { get; set; }
        public bool IsPublic { get; set; }
        public bool IsPossiblyUnused { get; set; }
        public int HalsteadVolume { get; set; }
        public int WeightedMethodComplexity { get; set; }
    }

    private sealed class PackageMetricRecord
    {
        public string DirectoryPath { get; set; } = string.Empty;
        public int AfferentCoupling { get; set; }
        public int EfferentCoupling { get; set; }
        public double Instability { get; set; }
        public double Abstractness { get; set; }
        public double DistanceFromMainSequence { get; set; }
    }

    private sealed class CodeQualitySummaryRecord
    {
        public double ProjectDuplicateLinePercent { get; set; }
        public int DuplicateLineCount { get; set; }
        public int TotalCodeLines { get; set; }
        public int CircularCallChainCount { get; set; }
        public List<CircularCallChainRecord> CircularCallChains { get; set; } = [];
        public int HighCyclomaticCount { get; set; }
        public int HighCognitiveCount { get; set; }
        public int DeepNestingCount { get; set; }
        public int HighFanOutCount { get; set; }
        public int LowMaintenanceIndexCount { get; set; }
        public int HighParameterCount { get; set; }
        public int TotalTodoMarkers { get; set; }
        public int HighTodoDensityFileCount { get; set; }
        public int HighReturnCount { get; set; }
        public int HighMagicNumberCount { get; set; }
        public int GodFileCount { get; set; }
        public int LowCommentFileCount { get; set; }
        public int HighStatementCount { get; set; }
        public int HighSwitchCaseCount { get; set; }
        public int EmptyCatchFunctionCount { get; set; }
        public int BroadCatchFunctionCount { get; set; }
        public int AsyncVoidCount { get; set; }
        public int PossiblyUnusedCount { get; set; }
        public int HighPublicApiFileCount { get; set; }
        public double TestCodeLinePercent { get; set; }
        public int SecuritySmellFileCount { get; set; }
        public int HighInstabilityPackageCount { get; set; }
        public int LayerViolationCount { get; set; }
        public int LowCohesionTypeCount { get; set; }
        public int DeepInheritanceTypeCount { get; set; }
        public int GitHotspotFileCount { get; set; }
    }

    private sealed class BugRiskFindingRecord
    {
        public string Category { get; set; } = string.Empty;
        public string Severity { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public string FunctionName { get; set; } = string.Empty;
        public string Detail { get; set; } = string.Empty;
        public string Snippet { get; set; } = string.Empty;
        public string LanguageId { get; set; } = string.Empty;
    }

    private sealed class SecurityFindingRecord
    {
        public string RuleId { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public string Severity { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public string LanguageId { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public string? Snippet { get; set; }
        public string? Explanation { get; set; }
        public string? Remediation { get; set; }
    }

    private sealed class CircularCallChainRecord
    {
        public string DisplayText { get; set; } = string.Empty;
        public List<string> NodeIds { get; set; } = [];
    }

    private sealed class DuplicateCodeGroupRecord
    {
        public string Id { get; set; } = string.Empty;
        public int LineCount { get; set; }
        public List<string> DuplicateLines { get; set; } = [];
        public List<string> SampleLines { get; set; } = [];
        public List<DuplicateCodeFragmentRecord> Fragments { get; set; } = [];
    }

    private sealed class DuplicateCodeFragmentRecord
    {
        public string FilePath { get; set; } = string.Empty;
        public string LanguageId { get; set; } = string.Empty;
        public int StartLine { get; set; }
        public int EndLine { get; set; }
    }

    private sealed class GlobalVariableRecord
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string LanguageId { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public string Scope { get; set; } = string.Empty;
        public string TypeName { get; set; } = string.Empty;
        public string ContainingScope { get; set; } = string.Empty;
        public string AccessModifier { get; set; } = string.Empty;
        public bool IsConst { get; set; }
        public bool IsReadOnly { get; set; }
        public string Declaration { get; set; } = string.Empty;
    }

    private sealed class GlobalVariableAccessRecord
    {
        public string GlobalVariableId { get; set; } = string.Empty;
        public string FunctionId { get; set; } = string.Empty;
        public string FunctionDisplayName { get; set; } = string.Empty;
        public string FunctionFullName { get; set; } = string.Empty;
        public string FunctionFilePath { get; set; } = string.Empty;
        public int FunctionLineNumber { get; set; }
        public string Kind { get; set; } = string.Empty;
    }

    private sealed class DatabaseTableRecord
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Schema { get; set; } = string.Empty;
        public string EntityTypeName { get; set; } = string.Empty;
        public string Dialect { get; set; } = string.Empty;
        public string SourceKind { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public List<string> AccessAliases { get; set; } = [];
        public List<DatabaseColumnRecord> Columns { get; set; } = [];
    }

    private sealed class DatabaseCatalogRecord
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Dialect { get; set; } = string.Empty;
        public string SourceKind { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
    }

    private sealed class DatabaseTableAccessRecord
    {
        public string TableId { get; set; } = string.Empty;
        public string FunctionId { get; set; } = string.Empty;
        public string FunctionDisplayName { get; set; } = string.Empty;
        public string FunctionFullName { get; set; } = string.Empty;
        public string FunctionFilePath { get; set; } = string.Empty;
        public int FunctionLineNumber { get; set; }
        public string Kind { get; set; } = string.Empty;
        public string Pattern { get; set; } = string.Empty;
        public string Operations { get; set; } = string.Empty;
    }

    private sealed class DatabaseCatalogAccessRecord
    {
        public string CatalogId { get; set; } = string.Empty;
        public string FunctionId { get; set; } = string.Empty;
        public string FunctionDisplayName { get; set; } = string.Empty;
        public string FunctionFullName { get; set; } = string.Empty;
        public string FunctionFilePath { get; set; } = string.Empty;
        public int FunctionLineNumber { get; set; }
        public string Kind { get; set; } = string.Empty;
        public string Pattern { get; set; } = string.Empty;
        public string Operations { get; set; } = string.Empty;
    }

    private sealed class DatabaseColumnAccessRecord
    {
        public string TableId { get; set; } = string.Empty;
        public string ColumnName { get; set; } = string.Empty;
        public string FunctionId { get; set; } = string.Empty;
        public string FunctionDisplayName { get; set; } = string.Empty;
        public string FunctionFullName { get; set; } = string.Empty;
        public string FunctionFilePath { get; set; } = string.Empty;
        public int FunctionLineNumber { get; set; }
        public string Kind { get; set; } = string.Empty;
        public string Pattern { get; set; } = string.Empty;
        public string Operations { get; set; } = string.Empty;
    }

    private sealed class DatabaseEntryAccessRecord
    {
        public string TableId { get; set; } = string.Empty;
        public string FunctionId { get; set; } = string.Empty;
        public string FunctionDisplayName { get; set; } = string.Empty;
        public string FunctionFullName { get; set; } = string.Empty;
        public string FunctionFilePath { get; set; } = string.Empty;
        public int FunctionLineNumber { get; set; }
        public string Operation { get; set; } = string.Empty;
        public string Pattern { get; set; } = string.Empty;
    }

    private sealed class AnalysisIssueRecord
    {
        public string Stage { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? Detail { get; set; }
    }

    private sealed class DatabaseColumnRecord
    {
        public string Name { get; set; } = string.Empty;
        public string DataType { get; set; } = string.Empty;
        public bool IsPrimaryKey { get; set; }
        public bool IsForeignKey { get; set; }
        public bool IsNullable { get; set; } = true;
        public string ReferencedTable { get; set; } = string.Empty;
        public string ReferencedColumn { get; set; } = string.Empty;
    }

    private sealed class DatabaseRelationRecord
    {
        public string FromTableId { get; set; } = string.Empty;
        public string ToTableId { get; set; } = string.Empty;
        public string FromColumn { get; set; } = string.Empty;
        public string ToColumn { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
    }
}
