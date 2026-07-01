using System.IO;
using System.Text.Json;
using DeskSearch.Models;

namespace DeskSearch.Services;

public sealed class SettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string _settingsPath;

    public AppSettings Current { get; private set; }

    public SettingsService()
    {
        var folder = AppStoragePaths.DataFolder;
        Directory.CreateDirectory(folder);
        _settingsPath = Path.Combine(folder, "settings.json");
        Current = Load();
    }

    public AppSettings Load()
    {
        try
        {
            if (!File.Exists(_settingsPath))
            {
                Current = new AppSettings();
                NormalizeSettings(Current);
                ApplyDefaultIndexScopeIfEmpty(Current);
                return Current;
            }

            var json = File.ReadAllText(_settingsPath);
            Current = JsonSerializer.Deserialize<AppSettings>(json, JsonOptions) ?? new AppSettings();
            var migrated = NormalizeSettings(Current, json);

            if (migrated)
                PersistWithoutNormalization(Current);

            return Current;
        }
        catch (Exception ex)
        {
            Current = new AppSettings();
            ErrorDialogService.Show(LocalizationService.T("Error_SettingsLoad"), ex);
            return Current;
        }
    }

    public void Save(AppSettings settings)
    {
        Current = settings.Clone();
        NormalizeSettings(Current);
        PersistWithoutNormalization(Current);
    }

    private void PersistWithoutNormalization(AppSettings settings)
    {
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        var tempPath = _settingsPath + ".tmp";
        File.WriteAllText(tempPath, json);
        File.Move(tempPath, _settingsPath, overwrite: true);
    }

    private static bool NormalizeSettings(AppSettings settings, string? rawJson = null)
    {
        settings.IncludedDrives ??= [];
        settings.IncludedDirectories ??= [];
        settings.ExcludedDirectories ??= [];

        if (string.IsNullOrWhiteSpace(settings.Language))
            settings.Language = LocalizationService.Korean;

        settings.WindowOpacity = Math.Clamp(settings.WindowOpacity, 50, 100);
        settings.BackgroundOpacity = Math.Clamp(settings.BackgroundOpacity, 0, 100);
        settings.SearchResultSort = SearchResultSortPolicy.Normalize(settings.SearchResultSort);

        if (rawJson is null)
            return false;

        using var document = JsonDocument.Parse(rawJson);
        if (!document.RootElement.TryGetProperty(nameof(AppSettings.RunAtStartup), out _))
            settings.RunAtStartup = true;

        return MigrateIndexScope(settings, document.RootElement);
    }

    private static bool MigrateIndexScope(AppSettings settings, JsonElement root)
    {
        if (root.TryGetProperty(nameof(AppSettings.IncludedDrives), out _))
            return false;

        var migrated = false;

        if (root.TryGetProperty("ExcludedDrives", out var excludedDrivesElement)
            && excludedDrivesElement.ValueKind == JsonValueKind.Array)
        {
            var excluded = ReadStringArray(excludedDrivesElement)
                .Select(IndexInclusionPolicy.NormalizeDriveRoot)
                .Where(static drive => drive is not null)
                .Cast<string>()
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            settings.IncludedDrives = IndexInclusionPolicy.GetAllReadyDriveRoots()
                .Where(drive => !excluded.Contains(drive))
                .ToList();
            migrated = true;
        }

        if (root.TryGetProperty("ExcludedDirectories", out var excludedDirectoriesElement)
            && excludedDirectoriesElement.ValueKind == JsonValueKind.Array)
        {
            settings.ExcludedDirectories = ReadStringArray(excludedDirectoriesElement)
                .Select(IndexInclusionPolicy.NormalizeDirectoryDisplay)
                .Where(static path => !string.IsNullOrWhiteSpace(path))
                .Cast<string>()
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            migrated = true;
        }

        if (root.TryGetProperty("LastExcludedDirectoryBrowsePath", out var browsePathElement)
            && browsePathElement.ValueKind == JsonValueKind.String)
        {
            settings.LastIncludedDirectoryBrowsePath = browsePathElement.GetString();
            migrated = true;
        }

        if (!migrated)
            ApplyDefaultIndexScopeIfEmpty(settings);
        else if (settings.IncludedDrives.Count == 0 && settings.IncludedDirectories.Count == 0)
            ApplyDefaultIndexScopeIfEmpty(settings);

        return migrated;
    }

    private static void ApplyDefaultIndexScopeIfEmpty(AppSettings settings)
    {
        if (settings.IncludedDrives.Count == 0 && settings.IncludedDirectories.Count == 0)
            settings.IncludedDrives = IndexInclusionPolicy.GetAllReadyDriveRoots().ToList();
    }

    private static IEnumerable<string> ReadStringArray(JsonElement arrayElement)
    {
        foreach (var item in arrayElement.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
            {
                var value = item.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                    yield return value;
            }
        }
    }

    public void ResetToDefaults()
    {
        try
        {
            if (File.Exists(_settingsPath))
                File.Delete(_settingsPath);
        }
        catch
        {
            // best effort; in-memory defaults still apply
        }

        Current = new AppSettings();
        NormalizeSettings(Current);
        ApplyDefaultIndexScopeIfEmpty(Current);
    }
}
