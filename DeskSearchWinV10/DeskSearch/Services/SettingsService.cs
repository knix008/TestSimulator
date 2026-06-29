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
                return Current;
            }

            var json = File.ReadAllText(_settingsPath);
            Current = JsonSerializer.Deserialize<AppSettings>(json, JsonOptions) ?? new AppSettings();
            NormalizeSettings(Current, json);

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

        var json = JsonSerializer.Serialize(Current, JsonOptions);
        var tempPath = _settingsPath + ".tmp";
        File.WriteAllText(tempPath, json);
        File.Move(tempPath, _settingsPath, overwrite: true);
    }

    private static void NormalizeSettings(AppSettings settings, string? rawJson = null)
    {
        settings.ExcludedDrives ??= [];
        settings.ExcludedDirectories ??= [];

        if (string.IsNullOrWhiteSpace(settings.Language))
            settings.Language = LocalizationService.Korean;

        settings.WindowOpacity = Math.Clamp(settings.WindowOpacity, 50, 100);
        settings.BackgroundOpacity = Math.Clamp(settings.BackgroundOpacity, 0, 100);
        settings.SearchResultSort = SearchResultSortPolicy.Normalize(settings.SearchResultSort);

        if (rawJson is null)
            return;

        using var document = JsonDocument.Parse(rawJson);
        if (!document.RootElement.TryGetProperty(nameof(AppSettings.RunAtStartup), out _))
            settings.RunAtStartup = true;
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
    }
}
