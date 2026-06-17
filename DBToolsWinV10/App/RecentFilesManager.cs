using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace DBToolsWinV10.App;

internal static class RecentFilesManager
{
	private const int MaxCount = 10;

	private static readonly string _settingsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DBToolsWinV10");

	private static readonly string _settingsFile = Path.Combine(_settingsDir, "recent.json");

	public static List<string> Load()
	{
		try
		{
			if (!File.Exists(_settingsFile))
			{
				return new List<string>();
			}
			string json = File.ReadAllText(_settingsFile);
			List<string> list = JsonSerializer.Deserialize<List<string>>(json);
			if (list == null)
			{
				return new List<string>();
			}
			list.RemoveAll((string f) => !File.Exists(f));
			return list;
		}
		catch
		{
			return new List<string>();
		}
	}

	public static void Push(string filePath)
	{
		List<string> list = Load();
		list.RemoveAll((string f) => string.Equals(f, filePath, StringComparison.OrdinalIgnoreCase));
		list.Insert(0, filePath);
		if (list.Count > 10)
		{
			list.RemoveRange(10, list.Count - 10);
		}
		Save(list);
	}

	public static void Remove(string filePath)
	{
		List<string> list = Load();
		list.RemoveAll((string f) => string.Equals(f, filePath, StringComparison.OrdinalIgnoreCase));
		Save(list);
	}

	private static void Save(List<string> list)
	{
		try
		{
			Directory.CreateDirectory(_settingsDir);
			File.WriteAllText(_settingsFile, JsonSerializer.Serialize(list, new JsonSerializerOptions
			{
				WriteIndented = true
			}));
		}
		catch
		{
		}
	}
}
