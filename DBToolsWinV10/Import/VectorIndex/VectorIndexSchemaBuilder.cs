using System;
using System.Collections.Generic;
using System.IO;
using DBToolsWinV10.Import;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Import.VectorIndex;

internal static class VectorIndexSchemaBuilder
{
	public static DbSchema Build(string filePath, VectorIndexInfo info)
	{
		string baseName = Path.GetFileNameWithoutExtension(filePath);
		var schema = new DbSchema
		{
			Name = baseName,
			TargetDb = DbTargetType.VectorDb
		};

		var infoTable = new DbTable
		{
			Name = "index_info",
			Comment = $"{info.Engine} / {info.IndexType}"
		};
		AddInfoColumn(infoTable, "engine", info.Engine);
		AddInfoColumn(infoTable, "index_type", info.IndexType);
		AddInfoColumn(infoTable, "metric", info.Metric);
		AddInfoColumn(infoTable, "dimension", info.Dimension.ToString());
		AddInfoColumn(infoTable, "vector_count", info.VectorCount.ToString());
		AddInfoColumn(infoTable, "file_size", FormatBytes(info.FileSizeBytes));
		foreach (KeyValuePair<string, string> pair in info.Properties)
			AddInfoColumn(infoTable, pair.Key, pair.Value);

		var vectorsTable = new DbTable
		{
			Name = "vectors",
			Comment = $"벡터 저장소 ({info.VectorCount:N0}개)"
		};
		vectorsTable.Columns.Add(new DbColumn
		{
			Name = "id",
			DataType = "BIGINT",
			IsPrimaryKey = true,
			IsNullable = false,
			Comment = "벡터 ID"
		});
		vectorsTable.Columns.Add(new DbColumn
		{
			Name = "embedding",
			DataType = "VECTOR",
			Length = info.Dimension > 0 ? info.Dimension : null,
			IsNullable = false,
			Comment = info.Dimension > 0
				? $"{info.Dimension}차원 임베딩"
				: "임베딩 벡터"
		});

		schema.Tables.Add(infoTable);
		schema.Tables.Add(vectorsTable);

		foreach (VectorIndexComponent component in info.Components)
		{
			if (string.Equals(component.Name, "root", StringComparison.OrdinalIgnoreCase)
				|| string.Equals(component.Name, "graph", StringComparison.OrdinalIgnoreCase))
			{
				continue;
			}

			var componentTable = new DbTable
			{
				Name = SanitizeTableName(component.Name),
				Comment = $"{component.IndexType} 구성 요소"
			};
			AddInfoColumn(componentTable, "index_type", component.IndexType);
			AddInfoColumn(componentTable, "metric", component.Metric ?? info.Metric);
			AddInfoColumn(componentTable, "dimension", component.Dimension.ToString());
			AddInfoColumn(componentTable, "vector_count", component.VectorCount.ToString());
			schema.Tables.Add(componentTable);
		}

		SchemaLayout.AutoArrange(schema);
		return schema;
	}

	private static void AddInfoColumn(DbTable table, string name, string value)
	{
		table.Columns.Add(new DbColumn
		{
			Name = name,
			DataType = "TEXT",
			DefaultValue = Quote(value),
			IsNullable = true,
			Comment = "인덱스 메타데이터"
		});
	}

	private static string SanitizeTableName(string name)
	{
		if (string.IsNullOrWhiteSpace(name))
			return "component";

		char[] chars = name.ToCharArray();
		for (int i = 0; i < chars.Length; i++)
		{
			if (!char.IsLetterOrDigit(chars[i]) && chars[i] != '_')
				chars[i] = '_';
		}

		return new string(chars);
	}

	private static string Quote(string value)
	{
		if (value == null)
			return null;

		return "'" + value.Replace("'", "''", StringComparison.Ordinal) + "'";
	}

	private static string FormatBytes(long bytes)
	{
		string[] units = { "B", "KB", "MB", "GB", "TB" };
		double size = bytes;
		int unit = 0;
		while (size >= 1024 && unit < units.Length - 1)
		{
			size /= 1024;
			unit++;
		}

		return unit == 0
			? $"{bytes} {units[unit]}"
			: $"{size:0.##} {units[unit]}";
	}
}
