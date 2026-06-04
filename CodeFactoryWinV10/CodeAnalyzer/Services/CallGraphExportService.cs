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
        var document = new AnalysisDocument
        {
            Version = "3",
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
            QualityThresholds = QualityThresholdsRecordFrom(analysis.QualityThresholds)
        };

        var json = JsonSerializer.Serialize(document, JsonOptions);
        File.WriteAllText(filePath, json);
    }

    public static (AnalysisResult Analysis, string RootDirectory) LoadFromFile(string filePath)
    {
        var json = File.ReadAllText(filePath);

        using var doc = JsonDocument.Parse(json);
        var version = ReadDocumentVersion(doc.RootElement);

        if (version == "3")
        {
            var document = JsonSerializer.Deserialize<AnalysisDocument>(json, JsonOptions)
                ?? throw new InvalidDataException("유효하지 않은 분석 결과 파일입니다.");
            return (BuildFromV3(document), document.RootDirectory);
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

    private static AnalysisResult BuildFromV3(AnalysisDocument d)
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
            QualityThresholds = BuildQualityThresholds(d.QualityThresholds)
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
            QualityThresholds = BuildQualityThresholds(d.QualityThresholds)
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
            TodoDensityPer100Lines = f.TodoDensityPer100Lines
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
            WarningFunctionCount = f.WarningFunctionCount
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
            Precision = Enum.TryParse<MetricsPrecision>(f.Precision, out var p) ? p : MetricsPrecision.Approximate
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
            LowCommentFileCount = summaryRecord.LowCommentFileCount
        };

        return new CodeMetricsResult
        {
            Files = files,
            FileAggregates = aggregates,
            Functions = functions,
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
            }).ToList()
        };
    }

    private static DatabaseSchemaResult BuildDatabaseSchemaResult(DatabaseSchemaSection? s)
    {
        if (s is null)
        {
            return new DatabaseSchemaResult();
        }

        var tables = s.Tables.Select(t => new DatabaseTable
        {
            Id = t.Id,
            Name = t.Name,
            Schema = string.IsNullOrWhiteSpace(t.Schema) ? null : t.Schema,
            Dialect = Enum.TryParse<DatabaseDialect>(t.Dialect, out var dialect) ? dialect : DatabaseDialect.Unknown,
            SourceKind = t.SourceKind,
            FilePath = t.FilePath,
            LineNumber = t.LineNumber,
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

        return new DatabaseSchemaResult
        {
            Tables = tables,
            Relations = relations,
            TableMap = tables.ToDictionary(t => t.Id, StringComparer.OrdinalIgnoreCase)
        };
    }

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
            WarnGodTypeMemberCount = r.WarnGodTypeMemberCount
        });
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
            TodoDensityPer100Lines = f.TodoDensityPer100Lines
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
            WarningFunctionCount = f.WarningFunctionCount
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
            Precision = f.Precision.ToString()
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
            LowCommentFileCount = m.Summary.LowCommentFileCount
        }
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
        }).ToList()
    };

    private static DatabaseSchemaSection DatabaseSchemaSectionFrom(DatabaseSchemaResult schema) => new()
    {
        Tables = schema.Tables.Select(t => new DatabaseTableRecord
        {
            Id = t.Id,
            Name = t.Name,
            Schema = t.Schema ?? string.Empty,
            Dialect = t.Dialect.ToString(),
            SourceKind = t.SourceKind,
            FilePath = t.FilePath,
            LineNumber = t.LineNumber,
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
        EnabledInspections = (ulong)s.EnabledInspections,
        EnabledAnalysisScope = (ulong)AnalysisScopeResolver.Resolve(
            MetricInspectionScope.Normalize(s.EnabledInspections)),
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
        public string Version { get; set; } = "3";
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
        public QualityThresholdsRecord? QualityThresholds { get; set; }
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
        public CodeQualitySummaryRecord Summary { get; set; } = new();
    }

    private sealed class DuplicatesSection
    {
        public int MinDuplicateLines { get; set; } = UserAnalysisSettings.DefaultMinDuplicateLines;
        public List<DuplicateCodeGroupRecord> Groups { get; set; } = [];
    }

    private sealed class GlobalVariablesSection
    {
        public List<GlobalVariableRecord> Variables { get; set; } = [];
    }

    private sealed class DatabaseSchemaSection
    {
        public List<DatabaseTableRecord> Tables { get; set; } = [];
        public List<DatabaseRelationRecord> Relations { get; set; } = [];
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

    private sealed class DatabaseTableRecord
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Schema { get; set; } = string.Empty;
        public string Dialect { get; set; } = string.Empty;
        public string SourceKind { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public List<DatabaseColumnRecord> Columns { get; set; } = [];
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
