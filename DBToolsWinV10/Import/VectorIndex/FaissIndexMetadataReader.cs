using System;
using System.Collections.Generic;
using System.IO;

namespace DBToolsWinV10.Import.VectorIndex;

internal sealed class FaissParsedIndex
{
	public uint FourCc { get; set; }

	public string IndexType { get; set; }

	public int Dimension { get; set; }

	public long VectorCount { get; set; }

	public string Metric { get; set; }

	public List<FaissParsedIndex> Children { get; } = new List<FaissParsedIndex>();
}

internal static class FaissIndexMetadataReader
{
	private const int SizeOfInt = 4;
	private const int SizeOfLong = 8;
	private const int SizeOfFloat = 4;
	private const int SizeOfChar = 1;

	public static FaissParsedIndex Parse(string filePath)
	{
		using FileStream stream = File.OpenRead(filePath);
		using FaissBinaryReader reader = new FaissBinaryReader(stream);
		FaissParsedIndex root = ParseIndex(reader, "root");
		if (reader.Position != reader.Length)
		{
			// Wrapper indexes may leave negligible padding; allow small remainder only for robustness.
		}

		return root;
	}

	public static VectorIndexInfo ToInfo(string filePath, FaissParsedIndex root)
	{
		long fileSize = new FileInfo(filePath).Length;
		var components = new List<VectorIndexComponent>();
		foreach (FaissParsedIndex child in root.Children)
			CollectComponents(child, components);

		return new VectorIndexInfo
		{
			Engine = "Faiss",
			IndexType = root.IndexType,
			Metric = root.Metric ?? "Unknown",
			Dimension = root.Dimension,
			VectorCount = root.VectorCount,
			FileSizeBytes = fileSize,
			Components = components,
			Properties = new Dictionary<string, string>
			{
				["fourcc"] = FaissFourCc.Decode(root.FourCc),
				["file_size"] = FormatBytes(fileSize)
			}
		};
	}

	private static void CollectComponents(FaissParsedIndex node, List<VectorIndexComponent> components)
	{
		components.Add(new VectorIndexComponent
		{
			Name = node.IndexType,
			IndexType = node.IndexType,
			Dimension = node.Dimension,
			VectorCount = node.VectorCount,
			Metric = node.Metric
		});

		foreach (FaissParsedIndex child in node.Children)
			CollectComponents(child, components);
	}

	private static FaissParsedIndex ParseIndex(FaissBinaryReader reader, string role)
	{
		uint fourCc = reader.ReadUInt32();
		if (fourCc == FaissFourCc.Encode("null"))
			throw new InvalidDataException("Faiss 인덱스가 비어 있습니다.");

		string indexType = FaissFourCc.GetName(fourCc);
		var node = new FaissParsedIndex
		{
			FourCc = fourCc,
			IndexType = indexType
		};

		switch (fourCc)
		{
			case var _ when fourCc == FaissFourCc.Encode("IxFI"):
			case var _ when fourCc == FaissFourCc.Encode("IxF2"):
			case var _ when fourCc == FaissFourCc.Encode("IxFl"):
				ReadFlat(reader, node);
				break;

			case var _ when fourCc == FaissFourCc.Encode("IxMp"):
			case var _ when fourCc == FaissFourCc.Encode("IxM2"):
				ReadIdMap(reader, node);
				break;

			case var _ when fourCc == FaissFourCc.Encode("IHNf"):
			case var _ when fourCc == FaissFourCc.Encode("IHNp"):
			case var _ when fourCc == FaissFourCc.Encode("IHNs"):
			case var _ when fourCc == FaissFourCc.Encode("IHN2"):
			case var _ when fourCc == FaissFourCc.Encode("IHNc"):
			case var _ when fourCc == FaissFourCc.Encode("IHc2"):
			case var _ when fourCc == FaissFourCc.Encode("IHfP"):
				ReadHnsw(reader, node, fourCc);
				break;

			case var _ when fourCc == FaissFourCc.Encode("IwFl"):
			case var _ when fourCc == FaissFourCc.Encode("IvFl"):
			case var _ when fourCc == FaissFourCc.Encode("IvFL"):
				ReadIvfFlat(reader, node, fourCc);
				break;

			case var _ when fourCc == FaissFourCc.Encode("IxPQ"):
			case var _ when fourCc == FaissFourCc.Encode("IxPo"):
			case var _ when fourCc == FaissFourCc.Encode("IxPq"):
				ReadProductQuantizerIndex(reader, node, fourCc);
				break;

			case var _ when fourCc == FaissFourCc.Encode("IxPT"):
				ReadPreTransform(reader, node);
				break;

			case var _ when fourCc == FaissFourCc.Encode("IxRF"):
			case var _ when fourCc == FaissFourCc.Encode("IxRP"):
				ReadRefine(reader, node);
				break;

			case var _ when fourCc == FaissFourCc.Encode("IvPQ"):
			case var _ when fourCc == FaissFourCc.Encode("IvQR"):
			case var _ when fourCc == FaissFourCc.Encode("IwPQ"):
			case var _ when fourCc == FaissFourCc.Encode("IwQR"):
				ReadIvfPq(reader, node, fourCc);
				break;

			default:
				throw new NotSupportedException(
					$"아직 지원하지 않는 Faiss 인덱스 형식입니다: {indexType} ({FaissFourCc.Decode(fourCc)})");
		}

		return node;
	}

	private static void ReadFlat(FaissBinaryReader reader, FaissParsedIndex node)
	{
		ReadIndexHeader(reader, node);
		reader.SkipXbVector();
	}

	private static void ReadIdMap(FaissBinaryReader reader, FaissParsedIndex node)
	{
		ReadIndexHeader(reader, node);
		node.Children.Add(ParseIndex(reader, "subindex"));
		reader.SkipVector(SizeOfLong);
	}

	private static void ReadHnsw(FaissBinaryReader reader, FaissParsedIndex node, uint fourCc)
	{
		ReadIndexHeader(reader, node);

		if (fourCc == FaissFourCc.Encode("IHfP"))
		{
			reader.ReadUInt64(); // nlevels
			reader.SkipVector(SizeOfFloat); // cum_sums
		}

		if (fourCc == FaissFourCc.Encode("IHNc") || fourCc == FaissFourCc.Encode("IHc2"))
		{
			reader.ReadBool(); // keep_max_size_level0
			reader.ReadBool(); // base_level_only
			reader.ReadInt32(); // num_base_level_search_entrypoints
			if (fourCc == FaissFourCc.Encode("IHc2"))
				reader.ReadInt32(); // numeric_type
		}

		SkipHnsw(reader);

		try
		{
			node.Children.Add(ParseIndex(reader, "storage"));
		}
		catch (EndOfStreamException)
		{
		}
	}

	private static void ReadIvfFlat(FaissBinaryReader reader, FaissParsedIndex node, uint fourCc)
	{
		bool legacy = fourCc == FaissFourCc.Encode("IvFl") || fourCc == FaissFourCc.Encode("IvFL");
		ReadIvfHeader(reader, node, legacy, out int nlist);
		int codeSize = node.Dimension * SizeOfFloat;

		if (legacy)
		{
			for (int i = 0; i < nlist; i++)
			{
				if (fourCc == FaissFourCc.Encode("IvFL"))
				{
					reader.SkipVector(SizeOfChar);
				}
				else
				{
					reader.SkipVector(SizeOfFloat);
					// converted to bytes in reader - old format stores float vector then copies
				}
			}
		}
		else
		{
			SkipInvertedLists(reader);
		}
	}

	private static void ReadIvfPq(FaissBinaryReader reader, FaissParsedIndex node, uint fourCc)
	{
		bool legacy = fourCc == FaissFourCc.Encode("IvPQ") || fourCc == FaissFourCc.Encode("IvQR");
		ReadIvfHeader(reader, node, legacy, out _);
		reader.ReadBool(); // by_residual
		reader.ReadInt32(); // code_size
		SkipProductQuantizer(reader);
		SkipInvertedLists(reader);
	}

	private static void ReadProductQuantizerIndex(FaissBinaryReader reader, FaissParsedIndex node, uint fourCc)
	{
		ReadIndexHeader(reader, node);
		int codeSize = SkipProductQuantizer(reader);
		reader.SkipVector(SizeOfChar); // codes stored as bytes

		if (fourCc == FaissFourCc.Encode("IxPo") || fourCc == FaissFourCc.Encode("IxPq"))
		{
			reader.ReadInt32(); // search_type
			reader.ReadBool(); // encode_signs
			reader.ReadInt32(); // polysemous_ht
		}
	}

	private static void ReadPreTransform(FaissBinaryReader reader, FaissParsedIndex node)
	{
		ReadIndexHeader(reader, node);
		int transformCount = reader.ReadInt32();
		for (int i = 0; i < transformCount; i++)
			SkipVectorTransform(reader);

		node.Children.Add(ParseIndex(reader, "subindex"));
	}

	private static void ReadRefine(FaissBinaryReader reader, FaissParsedIndex node)
	{
		ReadIndexHeader(reader, node);
		node.Children.Add(ParseIndex(reader, "base"));
		node.Children.Add(ParseIndex(reader, "refine"));
		reader.ReadSingle(); // k_factor
	}

	private static void ReadIvfHeader(FaissBinaryReader reader, FaissParsedIndex node, bool readLegacyIds, out int nlist)
	{
		ReadIndexHeader(reader, node);
		nlist = reader.ReadInt32();
		reader.ReadInt32(); // nprobe
		node.Children.Add(ParseIndex(reader, "quantizer"));
		if (readLegacyIds)
		{
			for (int i = 0; i < nlist; i++)
				reader.SkipVector(SizeOfLong);
		}

		SkipDirectMap(reader);
	}

	private static void ReadIndexHeader(FaissBinaryReader reader, FaissParsedIndex node)
	{
		node.Dimension = reader.ReadInt32();
		node.VectorCount = reader.ReadInt64();
		reader.ReadInt64();
		reader.ReadInt64();
		reader.ReadBool();
		int metricType = reader.ReadInt32();
		node.Metric = FaissMetricNames.FromInt(metricType);
		if (metricType > 1)
			reader.ReadSingle();
	}

	private static void SkipHnsw(FaissBinaryReader reader)
	{
		reader.SkipVector(SizeOfFloat);
		reader.SkipVector(SizeOfInt);
		reader.SkipVector(SizeOfInt);
		reader.SkipVector(SizeOfLong);
		reader.SkipVector(SizeOfLong);
		reader.ReadInt64(); // entry_point
		reader.ReadInt32(); // max_level
		reader.ReadInt32(); // efConstruction
		reader.ReadInt32(); // efSearch
		reader.ReadInt32(); // deprecated
	}

	private static void SkipDirectMap(FaissBinaryReader reader)
	{
		byte mapType = reader.ReadByte();
		reader.SkipVector(SizeOfLong);
		if (mapType == 2)
			reader.SkipVector(SizeOfLong * 2);
	}

	private static int SkipProductQuantizer(FaissBinaryReader reader)
	{
		int d = reader.ReadInt32();
		int m = reader.ReadInt32();
		int nbits = reader.ReadInt32();
		long centroidCount = (long)d * (1L << nbits);
		reader.Skip(centroidCount * SizeOfFloat);
		return (m * nbits + 7) / 8;
	}

	private static void SkipInvertedLists(FaissBinaryReader reader)
	{
		uint marker = reader.ReadUInt32();
		if (marker == FaissFourCc.Encode("il00"))
			return;

		if (marker == FaissFourCc.Encode("ilar"))
		{
			int nlist = reader.ReadInt32();
			int codeSize = reader.ReadInt32();
			ulong[] sizes = ReadInvertedListSizes(reader, nlist);
			for (int i = 0; i < nlist; i++)
			{
				long n = (long)sizes[i];
				if (n <= 0)
					continue;

				reader.Skip(n * codeSize);
				reader.Skip(n * SizeOfLong);
			}

			return;
		}

		throw new NotSupportedException(
			$"지원하지 않는 Faiss inverted list 형식입니다: {FaissFourCc.Decode(marker)}");
	}

	private static ulong[] ReadInvertedListSizes(FaissBinaryReader reader, int nlist)
	{
		var sizes = new ulong[nlist];
		uint listType = reader.ReadUInt32();
		if (listType == FaissFourCc.Encode("full"))
		{
			ulong count = reader.ReadSize();
			for (ulong i = 0; i < count; i++)
				sizes[i] = reader.ReadSize();
		}
		else if (listType == FaissFourCc.Encode("sprs"))
		{
			ulong pairCount = reader.ReadSize();
			for (ulong i = 0; i < pairCount; i++)
			{
				ulong index = reader.ReadSize();
				ulong size = reader.ReadSize();
				sizes[index] = size;
			}
		}
		else
		{
			throw new NotSupportedException(
				$"지원하지 않는 inverted list size 형식입니다: {FaissFourCc.Decode(listType)}");
		}

		return sizes;
	}

	private static void SkipVectorTransform(FaissBinaryReader reader)
	{
		uint marker = reader.ReadUInt32();
		switch (marker)
		{
			case var _ when marker == FaissFourCc.Encode("rrot"):
				reader.ReadInt32();
				reader.ReadInt32();
				reader.SkipVector(SizeOfFloat);
				reader.SkipVector(SizeOfFloat);
				break;

			case var _ when marker == FaissFourCc.Encode("PCAm"):
			case var _ when marker == FaissFourCc.Encode("PcAm"):
			case var _ when marker == FaissFourCc.Encode("Pcam"):
				reader.ReadInt32(); // eigen_power
				if (marker == FaissFourCc.Encode("Pcam"))
					reader.ReadSingle(); // epsilon
				reader.ReadBool();
				reader.SkipVector(SizeOfFloat);
				reader.SkipVector(SizeOfFloat);
				reader.SkipVector(SizeOfFloat);
				break;

			case var _ when marker == FaissFourCc.Encode("LTra"):
				reader.ReadInt32();
				reader.ReadInt32();
				reader.SkipVector(SizeOfFloat);
				reader.SkipVector(SizeOfFloat);
				break;

			default:
				throw new NotSupportedException(
					$"지원하지 않는 VectorTransform 형식입니다: {FaissFourCc.Decode(marker)}");
		}
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
