using System.Reflection;
using System.Text.Json;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Persistence;

public sealed record AnalysisDatabaseSaveResult(
    bool Saved,
    long? RunId,
    string Message)
{
    public static AnalysisDatabaseSaveResult Skipped(string message) => new(false, null, message);
    public static AnalysisDatabaseSaveResult Success(long runId, string message) => new(true, runId, message);
}

public static class AnalysisResultDatabaseWriter
{
    private static readonly JsonSerializerOptions SummaryJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static async Task<AnalysisDatabaseSaveResult> SaveAsync(
        AnalysisResult result,
        string rootDirectory,
        DatabaseConnectionSettings settings,
        TimeSpan elapsed,
        int fileCount,
        int directoryCount,
        CancellationToken cancellationToken = default)
    {
        var normalized = DatabaseConnectionSettings.Normalize(settings);
        if (!normalized.Enabled)
        {
            return AnalysisDatabaseSaveResult.Skipped("DB 저장이 비활성화되어 있습니다.");
        }

        normalized.ValidateForUse();

        if (normalized.AutoCreateSchema)
        {
            await DatabaseSchemaInitializer.EnsureSchemaAsync(normalized, cancellationToken)
                .ConfigureAwait(false);
        }

        var documentJson = CallGraphExportService.SerializeToJson(result, rootDirectory);
        var summaryJson = BuildSummaryJson(result, elapsed, fileCount, directoryCount);
        var qualityScore = AnalysisSummaryRadarBuilder.ComputeAverageScore(
            result,
            result.QualityThresholds.EnabledInspections);
        var savedAtUtc = DateTime.UtcNow;
        var appVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unknown";

        await using var connection = DatabaseConnectionFactory.CreateConnection(normalized);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);

        await using var command = connection.CreateCommand();
        AddParameters(
            command,
            normalized,
            rootDirectory,
            savedAtUtc,
            elapsed,
            fileCount,
            directoryCount,
            result,
            qualityScore,
            summaryJson,
            documentJson,
            appVersion);

        long runId;
        if (normalized.Provider == AnalysisDatabaseProvider.PostgreSql)
        {
            command.CommandText = BuildInsertSql(normalized);
            var scalar = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            runId = ConvertRunId(scalar, normalized.Provider);
        }
        else
        {
            command.CommandText = BuildInsertSql(normalized);
            await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            command.Parameters.Clear();
            command.CommandText = "SELECT LAST_INSERT_ID();";
            var scalar = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            runId = ConvertRunId(scalar, normalized.Provider);
        }

        return AnalysisDatabaseSaveResult.Success(
            runId,
            $"DB에 분석 결과를 저장했습니다. (run id: {runId})");
    }

    private static string BuildSummaryJson(
        AnalysisResult result,
        TimeSpan elapsed,
        int fileCount,
        int directoryCount)
    {
        var summary = result.Metrics.Summary;
        var payload = new
        {
            elapsedMs = (long)elapsed.TotalMilliseconds,
            fileCount,
            directoryCount,
            functionCount = result.CallGraph.Nodes.Count,
            callEdgeCount = result.CallGraph.Edges.Count,
            metricFunctionCount = result.Metrics.Functions.Count,
            duplicateGroupCount = result.Duplicates.Groups.Count,
            duplicateLinePercent = summary.ProjectDuplicateLinePercent,
            circularCallChainCount = summary.CircularCallChainCount,
            issueCount = result.Issues.Count,
            globalVariableCount = result.GlobalVariables.Variables.Count,
            typeCount = result.Structure.Types.Count
        };
        return JsonSerializer.Serialize(payload, SummaryJsonOptions);
    }

    private static string BuildInsertSql(DatabaseConnectionSettings settings)
    {
        var tableName = settings.ResolveRunsTableName();
        return settings.Provider switch
        {
            AnalysisDatabaseProvider.PostgreSql =>
                $"""
                 INSERT INTO {tableName} (
                     root_directory, saved_at_utc, elapsed_ms, file_count, directory_count,
                     function_count, call_edge_count, duplicate_group_count, issue_count,
                     quality_score, summary_json, document_json, document_version, app_version)
                 VALUES (
                     @root_directory, @saved_at_utc, @elapsed_ms, @file_count, @directory_count,
                     @function_count, @call_edge_count, @duplicate_group_count, @issue_count,
                     @quality_score, @summary_json, @document_json, @document_version, @app_version)
                 RETURNING id;
                 """,
            _ =>
                $"""
                 INSERT INTO {tableName} (
                     root_directory, saved_at_utc, elapsed_ms, file_count, directory_count,
                     function_count, call_edge_count, duplicate_group_count, issue_count,
                     quality_score, summary_json, document_json, document_version, app_version)
                 VALUES (
                     @root_directory, @saved_at_utc, @elapsed_ms, @file_count, @directory_count,
                     @function_count, @call_edge_count, @duplicate_group_count, @issue_count,
                     @quality_score, @summary_json, @document_json, @document_version, @app_version);
                 """
        };
    }

    private static void AddParameters(
        System.Data.Common.DbCommand command,
        DatabaseConnectionSettings settings,
        string rootDirectory,
        DateTime savedAtUtc,
        TimeSpan elapsed,
        int fileCount,
        int directoryCount,
        AnalysisResult result,
        float qualityScore,
        string summaryJson,
        string documentJson,
        string appVersion)
    {
        AddParameter(command, "@root_directory", rootDirectory);
        AddParameter(command, "@saved_at_utc", settings.Provider switch
        {
            AnalysisDatabaseProvider.PostgreSql => savedAtUtc,
            _ => savedAtUtc
        });
        AddParameter(command, "@elapsed_ms", (long)elapsed.TotalMilliseconds);
        AddParameter(command, "@file_count", fileCount);
        AddParameter(command, "@directory_count", directoryCount);
        AddParameter(command, "@function_count", result.CallGraph.Nodes.Count);
        AddParameter(command, "@call_edge_count", result.CallGraph.Edges.Count);
        AddParameter(command, "@duplicate_group_count", result.Duplicates.Groups.Count);
        AddParameter(command, "@issue_count", result.Issues.Count);
        AddParameter(command, "@quality_score", qualityScore);
        AddParameter(command, "@summary_json", summaryJson);
        AddParameter(command, "@document_json", documentJson);
        AddParameter(command, "@document_version", "3");
        AddParameter(command, "@app_version", appVersion);
    }

    private static void AddParameter(System.Data.Common.DbCommand command, string name, object? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static long ConvertRunId(object? scalar, AnalysisDatabaseProvider provider)
    {
        if (scalar is null or DBNull)
        {
            throw new InvalidOperationException("DB 저장 후 run id를 확인할 수 없습니다.");
        }

        return provider switch
        {
            AnalysisDatabaseProvider.PostgreSql => Convert.ToInt64(scalar),
            _ => Convert.ToInt64(scalar)
        };
    }
}
