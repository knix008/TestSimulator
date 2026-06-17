using System.IO;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Export;

public static class SchemaExportHelper
{
	public static DbSchema CloneForTarget(DbSchema schema, DbTargetType targetDb)
	{
		DbSchema clone = schema.Clone();
		clone.TargetDb = targetDb;
		return clone;
	}

	public static string GetBaseFileName(DbSchema schema)
	{
		string name = schema?.Name;
		if (string.IsNullOrWhiteSpace(name))
		{
			return "schema";
		}
		foreach (char invalid in Path.GetInvalidFileNameChars())
		{
			name = name.Replace(invalid, '_');
		}
		return name;
	}
}
