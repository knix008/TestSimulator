using System;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace DBToolsWinV10.App;

internal static class AppSettings
{
	private sealed class SettingsData
	{
		public string LastOpenDirectory { get; set; }

		public string LastSqliteOpenDirectory { get; set; }

		public string LastDatabaseFileOpenDirectory { get; set; }

		public int? RightPanelWidth { get; set; }
	}

	private static readonly string SettingsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DBToolsWinV10");

	private static readonly string SettingsFile = Path.Combine(SettingsDir, "settings.json");

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
		int? width = ReadSettings()?.RightPanelWidth;
		if (width.HasValue && width.Value >= 280)
		{
			return width.Value;
		}

		return defaultWidth;
	}

	public static void SetRightPanelWidth(int width)
	{
		if (width < 280)
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
