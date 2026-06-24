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
        var folder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "DeskSearch");
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
            Current.ExcludedDrives ??= [];
            Current.ExcludedDirectories ??= [];

            using (var document = JsonDocument.Parse(json))
            {
                if (!document.RootElement.TryGetProperty(nameof(AppSettings.RunAtStartup), out _))
                    Current.RunAtStartup = true;
            }

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
        var json = JsonSerializer.Serialize(Current, JsonOptions);
        File.WriteAllText(_settingsPath, json);
    }
}
