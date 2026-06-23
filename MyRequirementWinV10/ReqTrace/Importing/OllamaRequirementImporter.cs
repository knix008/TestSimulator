using ReqTrace.Localization;
using ReqTrace.Models;

namespace ReqTrace.Importing;

public static class OllamaRequirementImporter
{
    private const int DescriptionMaxTokens = 768;
    private const int RowProcessingStartPercent = 10;
    private const int RowProcessingEndPercent = 85;

    public static async Task<ImportResult> ImportAsync(
        string filePath,
        string sheetName,
        string ollamaBaseUrl,
        string? ollamaModel,
        bool generateCodeIfMissing,
        bool generateTestCases,
        int headerRow,
        ColumnMapping mapping,
        IProgress<ImportProgressReport>? progress = null,
        Action<Requirement>? onRequirementAdded = null,
        IEnumerable<string>? reservedCodes = null,
        IEnumerable<string>? reservedTestCaseCodes = null,
        CancellationToken cancellationToken = default)
    {
        var result = new ImportResult();
        var wasCancelled = false;
        var sourceName = Path.GetFileName(filePath);

        Report(progress, 0, "Progress_Ai_CheckingOllama", detailKey: "Progress_Ai_Detail_CheckingOllama", detailArgs: [ollamaBaseUrl]);

        using var client = new OllamaClient(ollamaBaseUrl);
        if (!await client.IsAvailableAsync(cancellationToken).ConfigureAwait(false))
            throw new InvalidOperationException(Loc.T("Msg_AiImportOllamaUnavailable", ollamaBaseUrl));

        var model = await client.ResolveModelAsync(ollamaModel, cancellationToken).ConfigureAwait(false);
        Report(progress, 5, "Progress_Ai_ResolvingModel", detailKey: "Progress_Ai_Detail_ResolvingModel", detailArgs: [model]);

        Report(progress, 8, "Progress_Ai_ReadingSheet", detailKey: "Progress_Ai_Detail_ReadingSheet", detailArgs: [sheetName]);
        var headers = ExcelRequirementImporter.ReadHeaderRow(filePath, sheetName, headerRow);

        Report(progress, 10, "Progress_Ai_BuildingCsv", detailKey: "Progress_Ai_Detail_BuildingCsv");
        var csvPayload = await Task.Run(
            () => LlmSheetCsvBuilder.Build(filePath, sheetName, headerRow, mapping, headers),
            cancellationToken).ConfigureAwait(false);

        if (csvPayload.DataLines.Count == 0 || string.IsNullOrWhiteSpace(csvPayload.HeaderLine))
            throw new InvalidOperationException(Loc.T("Msg_AiImportLlmEmpty"));

        if (csvPayload.SkippedRows > 0)
            result.Warnings.Add(Loc.T("Msg_AiImportCsvSkippedRows", csvPayload.SkippedRows));

        var rows = LlmCsvParser.ParseRows(csvPayload.HeaderLine, csvPayload.DataLines);
        var dataRows = rows
            .Where(r => !r.IsSection && !SpreadsheetForwardFill.IsBlankLlmSheetRow(r))
            .ToList();
        if (dataRows.Count == 0)
            throw new InvalidOperationException(Loc.T("Msg_AiImportLlmEmpty"));

        var mappingHint = MappedSheetContextBuilder.BuildMappingHint(mapping, headers);
        var descriptionSystemPrompt = OllamaRequirementPrompts.BuildDescriptionSystemPrompt();

        var (usedCodes, sequence) = RequirementCodeAllocator.CreateState(reservedCodes);
        var (testCaseUsedCodes, testCaseNextSequence) = TestCaseCodeAllocator.CreateState(reservedTestCaseCodes);
        var parentCodeByRequirementCode = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var processedDataRows = 0;
        var fileName = Path.GetFileName(filePath);

        var excelOnlyRows = 0;
        var llmDescriptionRows = 0;

        try
        {
            foreach (var row in rows)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (row.IsSection)
                    continue;

                if (SpreadsheetForwardFill.IsBlankLlmSheetRow(row))
                    continue;

                processedDataRows++;
                var rowPercent = RowProcessingStartPercent
                    + (int)(processedDataRows / (double)dataRows.Count * (RowProcessingEndPercent - RowProcessingStartPercent));

                Report(progress, rowPercent, "Progress_Ai_AnalyzingRow", [processedDataRows, dataRows.Count]);

                if (!LlmRowLocalConverter.TryConvertFromExcelRow(row, mapping, out var dto))
                {
                    result.RowsSkipped++;
                    result.Warnings.Add(Loc.T("Msg_AiImportRowNoTitle", processedDataRows, dataRows.Count));
                    continue;
                }

                if (LlmRowLocalConverter.NeedsLlmDescription(dto))
                {
                    Report(
                        progress,
                        rowPercent,
                        "Progress_Ai_AnalyzingRow",
                        [processedDataRows, dataRows.Count],
                        "Progress_Ai_Detail_LlmRowCalling",
                        [model, processedDataRows, dataRows.Count]);

                    try
                    {
                        var csvBlock = LlmCsvParser.FormatRow(csvPayload.HeaderLine, row);
                        var userPrompt = OllamaRequirementPrompts.BuildDescriptionUserPrompt(
                            fileName,
                            sheetName,
                            processedDataRows - 1,
                            dataRows.Count,
                            dto,
                            row.CategoryContext,
                            mappingHint,
                            csvBlock);

                        var generatedDescription = await GenerateDescriptionAsync(
                            client,
                            model,
                            descriptionSystemPrompt,
                            userPrompt,
                            cancellationToken).ConfigureAwait(false);

                        if (!string.IsNullOrWhiteSpace(generatedDescription))
                        {
                            dto.Description = generatedDescription.Trim();
                            llmDescriptionRows++;
                        }
                        else
                        {
                            result.Warnings.Add(Loc.T("Msg_AiImportRowEmpty", processedDataRows, dataRows.Count));
                            LlmRowLocalConverter.EnsureMeaningfulDescription(dto, row, mapping);
                        }

                        Report(
                            progress,
                            rowPercent,
                            "Progress_Ai_AnalyzingRow",
                            [processedDataRows, dataRows.Count],
                            "Progress_Ai_Detail_LlmRowDone",
                            [processedDataRows, dataRows.Count]);
                    }
                    catch (OperationCanceledException)
                    {
                        throw;
                    }
                    catch (Exception ex)
                    {
                        result.Warnings.Add(Loc.T("Msg_AiImportDescriptionFailed", processedDataRows, dataRows.Count, ex.Message));
                        LlmRowLocalConverter.EnsureMeaningfulDescription(dto, row, mapping);
                    }
                }
                else
                {
                    excelOnlyRows++;
                }

                AppendExtractedItems(
                    result,
                    [dto],
                    sourceName,
                    generateCodeIfMissing,
                    generateTestCases,
                    parentCodeByRequirementCode,
                    usedCodes,
                    ref sequence,
                    testCaseUsedCodes,
                    ref testCaseNextSequence,
                    onRequirementAdded);
            }
        }
        catch (OperationCanceledException)
        {
            wasCancelled = true;
            if (result.Requirements.Count > 0)
                result.Warnings.Add(Loc.T("Msg_AiImportCancelledPartial", result.Requirements.Count));
            else
                throw;
        }

        if (result.Requirements.Count == 0 && !wasCancelled)
            throw new InvalidOperationException(Loc.T("Msg_AiImportLlmEmpty"));

        if (excelOnlyRows > 0)
            result.Warnings.Add(Loc.T("Msg_AiImportExcelRowsWithDescription", excelOnlyRows));
        if (llmDescriptionRows > 0)
            result.Warnings.Add(Loc.T("Msg_AiImportLlmDescriptionsGenerated", llmDescriptionRows, dataRows.Count));

        Report(progress, 90, "Progress_Ai_LinkingParents", detailKey: "Progress_Ai_Detail_LinkingParents");
        LinkParentsByCode(result.Requirements, parentCodeByRequirementCode, result.Warnings);

        Report(progress, 100, "Progress_Ai_Complete", detailKey: "Progress_Ai_Detail_Complete");
        result.WasCancelled = wasCancelled;
        return result;
    }

    private static async Task<string?> GenerateDescriptionAsync(
        OllamaClient client,
        string model,
        string systemPrompt,
        string userPrompt,
        CancellationToken cancellationToken)
    {
        var content = await client.ChatJsonAsync(
            model,
            systemPrompt,
            userPrompt,
            cancellationToken,
            DescriptionMaxTokens).ConfigureAwait(false);

        var description = OllamaJsonResponseParser.ParseDescription(content);
        if (!string.IsNullOrWhiteSpace(description))
            return description;

        var retryPrompt = userPrompt + Environment.NewLine + Environment.NewLine + OllamaRequirementPrompts.BuildDescriptionRetryPrompt();
        content = await client.ChatJsonAsync(
            model,
            systemPrompt,
            retryPrompt,
            cancellationToken,
            DescriptionMaxTokens).ConfigureAwait(false);

        return OllamaJsonResponseParser.ParseDescription(content);
    }

    private static void AppendExtractedItems(
        ImportResult result,
        IReadOnlyList<ExtractedRequirementDto> items,
        string sourceName,
        bool generateCodeIfMissing,
        bool generateTestCases,
        IDictionary<string, string> parentCodeByRequirementCode,
        ISet<string> usedCodes,
        ref int sequence,
        ISet<string> testCaseUsedCodes,
        ref int testCaseNextSequence,
        Action<Requirement>? onRequirementAdded)
    {
        foreach (var item in items)
        {
            if (!RequirementListAssembler.TryAppendSingle(
                    result,
                    item,
                    sourceName,
                    generateCodeIfMissing,
                    generateTestCases,
                    parentCodeByRequirementCode,
                    usedCodes,
                    ref sequence,
                    testCaseUsedCodes,
                    ref testCaseNextSequence,
                    out var requirement))
            {
                continue;
            }

            onRequirementAdded?.Invoke(requirement);
        }
    }

    private static void LinkParentsByCode(
        List<Requirement> requirements,
        IReadOnlyDictionary<string, string> parentCodeByRequirementCode,
        List<string> warnings)
    {
        if (parentCodeByRequirementCode.Count == 0)
            return;

        var byCode = requirements
            .GroupBy(r => r.Code, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        foreach (var requirement in requirements)
        {
            if (!parentCodeByRequirementCode.TryGetValue(requirement.Code, out var parentCode))
                continue;

            if (!byCode.TryGetValue(parentCode, out var parent))
            {
                warnings.Add(Loc.T("Msg_AiImportParentNotFound", requirement.Code, parentCode));
                continue;
            }

            if (parent.Id == requirement.Id)
                continue;

            requirement.ParentId = parent.Id;
        }
    }

    private static void Report(
        IProgress<ImportProgressReport>? progress,
        int percent,
        string stepKey,
        object[]? stepArgs = null,
        string? detailKey = null,
        object[]? detailArgs = null)
    {
        if (progress is null)
            return;

        var step = stepArgs is { Length: > 0 } ? Loc.T(stepKey, stepArgs) : Loc.T(stepKey);
        string? detail = null;
        if (detailKey is not null)
            detail = detailArgs is { Length: > 0 } ? Loc.T(detailKey, detailArgs) : Loc.T(detailKey);

        progress.Report(new ImportProgressReport(percent, step, detail));
    }
}
