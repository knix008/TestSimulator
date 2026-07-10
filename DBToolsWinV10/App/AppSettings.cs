using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.App;

internal static class AppSettings
{
	public sealed class UserPreferences
	{
		public string Language { get; set; } = "ko";
		public string Theme { get; set; } = "light";
		public DbTargetType DefaultDbType { get; set; } = DbTargetType.SQLite;
		public RelationshipLineStyle DefaultLineStyle { get; set; } = RelationshipLineStyle.Straight;
		public int RecentFilesMaxCount { get; set; } = 10;
		public bool ShowGrid { get; set; }
		public bool SnapToGrid { get; set; }
		public int SnapInterval { get; set; } = 20;
	}

	private sealed class SettingsData
	{
		public string LastOpenDirectory { get; set; }

		public string LastSqliteOpenDirectory { get; set; }

		public string LastDatabaseFileOpenDirectory { get; set; }

		public int? RightPanelWidth { get; set; }

		public string Language { get; set; }

		public string DefaultDbType { get; set; }

		public string DefaultLineStyle { get; set; }

		public int? RecentFilesMaxCount { get; set; }

		public string Theme { get; set; }

		public bool ShowGrid { get; set; }

		public bool SnapToGrid { get; set; }

		public int SnapInterval { get; set; }
	}

	private static readonly string SettingsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DBToolsWinV10");

	private static readonly string SettingsFile = Path.Combine(SettingsDir, "settings.json");

	public static string GetLanguage() => ReadSettings()?.Language ?? "ko";

	public static string GetTheme() => ReadSettings()?.Theme ?? "light";

	public static UserPreferences GetPreferences()
	{
		var d = ReadSettings() ?? new SettingsData();
		return new UserPreferences
		{
			Language = d.Language ?? "ko",
			Theme = d.Theme ?? "light",
			DefaultDbType = Enum.TryParse<DbTargetType>(d.DefaultDbType, out var dbType) ? dbType : DbTargetType.SQLite,
			DefaultLineStyle = Enum.TryParse<RelationshipLineStyle>(d.DefaultLineStyle, out var lineStyle) ? lineStyle : RelationshipLineStyle.Straight,
			RecentFilesMaxCount = Math.Clamp(d.RecentFilesMaxCount ?? 10, 1, 50),
			ShowGrid = d.ShowGrid,
			SnapToGrid = d.SnapToGrid,
			SnapInterval = d.SnapInterval == 0 ? 20 : Math.Clamp(d.SnapInterval, 5, 100),
		};
	}

	public static void SavePreferences(UserPreferences prefs)
	{
		UpdateSettings(d =>
		{
			d.Language = prefs.Language;
			d.Theme = prefs.Theme;
			d.DefaultDbType = prefs.DefaultDbType.ToString();
			d.DefaultLineStyle = prefs.DefaultLineStyle.ToString();
			d.RecentFilesMaxCount = prefs.RecentFilesMaxCount;
			d.ShowGrid = prefs.ShowGrid;
			d.SnapToGrid = prefs.SnapToGrid;
			d.SnapInterval = prefs.SnapInterval;
		});
	}

	public static void SetLastOpenDirectory(string directory)
	{
		SetDirectory(delegate(SettingsData d)
		{
			d.LastOpenDirectory = directory;
		}, directory);
	}

	public static void SetLastDatabaseFileOpenDirectory(string directory)
	{
		SetDirectory(delegate(SettingsData d)
		{
			d.LastDatabaseFileOpenDirectory = directory;
		}, directory);
	}

	public static int GetRightPanelWidth(int defaultWidth)
	{
		if (TryGetRightPanelWidth(out int width))
		{
			return width;
		}

		return defaultWidth;
	}

	public static bool TryGetRightPanelWidth(out int width)
	{
		int? stored = ReadSettings()?.RightPanelWidth;
		if (stored.HasValue && stored.Value >= 240)
		{
			width = Math.Clamp(stored.Value, 240, 360);
			return true;
		}

		width = 0;
		return false;
	}

	public static void SetRightPanelWidth(int width)
	{
		if (width < 240)
		{
			return;
		}

		UpdateSettings(delegate(SettingsData d)
		{
			d.RightPanelWidth = width;
		});
	}

	public static string ResolveInitialOpenDirectory()
	{
		return ResolveDirectory(GetLastOpenDirectory);
	}

	public static string ResolveInitialDatabaseFileOpenDirectory()
	{
		return ResolveDirectory(GetLastDatabaseFileOpenDirectory);
	}

	private static string GetLastOpenDirectory()
	{
		return ReadSettings()?.LastOpenDirectory;
	}

	private static string GetLastDatabaseFileOpenDirectory()
	{
		SettingsData settingsData = ReadSettings();
		return settingsData.LastDatabaseFileOpenDirectory ?? settingsData.LastSqliteOpenDirectory;
	}

	private static string ResolveDirectory(Func<string> getStored)
	{
		string text = getStored();
		if (!string.IsNullOrWhiteSpace(text) && Directory.Exists(text))
		{
			return text;
		}
		string text2 = RecentFilesManager.Load().FirstOrDefault();
		if (text2 == null)
		{
			return null;
		}
		text = Path.GetDirectoryName(text2);
		return (!string.IsNullOrWhiteSpace(text) && Directory.Exists(text)) ? text : null;
	}

	private static void SetDirectory(Action<SettingsData> assign, string directory)
	{
		if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
		{
			return;
		}

		UpdateSettings(delegate(SettingsData settingsData)
		{
			assign(settingsData);
		});
	}

	private static void UpdateSettings(Action<SettingsData> assign)
	{
		try
		{
			Directory.CreateDirectory(SettingsDir);
			SettingsData settingsData = ReadSettings() ?? new SettingsData();
			assign(settingsData);
			string contents = JsonSerializer.Serialize(settingsData, new JsonSerializerOptions
			{
				WriteIndented = true
			});
			File.WriteAllText(SettingsFile, contents);
		}
		catch
		{
		}
	}

	private static SettingsData ReadSettings()
	{
		try
		{
			if (!File.Exists(SettingsFile))
			{
				return null;
			}
			return JsonSerializer.Deserialize<SettingsData>(File.ReadAllText(SettingsFile));
		}
		catch
		{
			return null;
		}
	}
}
