using System;
using System.Collections.Generic;
using System.IO;

namespace DBToolsWinV10.Import.VectorIndex;

internal static class HnswIndexReader
{
	public static VectorIndexInfo Read(string filePath)
	{
		using FileStream stream = File.OpenRead(filePath);
		using BinaryReader reader = new BinaryReader(stream);

		if (stream.Length < 96)
			throw new InvalidDataException("HNSW 인덱스 파일이 너무 작습니다.");

		ulong offsetLevel0 = reader.ReadUInt64();
		ulong maxElements = reader.ReadUInt64();
		ulong curElementCount = reader.ReadUInt64();
		ulong sizeDataPerElement = reader.ReadUInt64();
		ulong labelOffset = reader.ReadUInt64();
		ulong offsetData = reader.ReadUInt64();
		int maxLevel = reader.ReadInt32();
		ulong enterpointNode = reader.ReadUInt64();
		ulong maxM = reader.ReadUInt64();
		ulong maxM0 = reader.ReadUInt64();
		ulong m = reader.ReadUInt64();
		ulong mult = reader.ReadUInt64();
		ulong efConstruction = reader.ReadUInt64();

		if (curElementCount > maxElements || maxElements > 1_000_000_000UL)
			throw new InvalidDataException("HNSW 인덱스 헤더가 유효하지 않습니다.");

		int vectorBytes = (int)Math.Max(0, (long)sizeDataPerElement - (long)labelOffset);
		int dimension = 0;
		string metric = "Unknown";
		if (vectorBytes > 0 && vectorBytes % 4 == 0)
		{
			dimension = vectorBytes / 4;
			metric = "L2 or InnerProduct";
		}

		var properties = new Dictionary<string, string>
		{
			["max_elements"] = maxElements.ToString(),
			["M"] = m.ToString(),
			["max_M"] = maxM.ToString(),
			["max_M0"] = maxM0.ToString(),
			["ef_construction"] = efConstruction.ToString(),
			["max_level"] = maxLevel.ToString(),
			["enterpoint"] = enterpointNode.ToString(),
			["offset_level0"] = offsetLevel0.ToString(),
			["file_size"] = FormatBytes(stream.Length)
		};

		return new VectorIndexInfo
		{
			Engine = "hnswlib",
			IndexType = "HierarchicalNSW",
			Metric = metric,
			Dimension = dimension,
			VectorCount = (long)curElementCount,
			FileSizeBytes = stream.Length,
			Components = new List<VectorIndexComponent>
			{
				new VectorIndexComponent
				{
					Name = "graph",
					IndexType = "HierarchicalNSW",
					Dimension = dimension,
					VectorCount = (long)curElementCount,
					Metric = metric
				}
			},
			Properties = properties
		};
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
