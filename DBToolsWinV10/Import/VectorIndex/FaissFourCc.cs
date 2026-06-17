using System.Collections.Generic;

namespace DBToolsWinV10.Import.VectorIndex;

internal static class FaissFourCc
{
	public static uint Encode(string text)
	{
		if (text.Length != 4)
			throw new System.ArgumentException("fourcc must be 4 characters.", nameof(text));

		return (uint)text[0]
			| ((uint)text[1] << 8)
			| ((uint)text[2] << 16)
			| ((uint)text[3] << 24);
	}

	public static string Decode(uint value)
	{
		char[] chars = new char[4];
		chars[0] = (char)(value & 0xFF);
		chars[1] = (char)((value >> 8) & 0xFF);
		chars[2] = (char)((value >> 16) & 0xFF);
		chars[3] = (char)((value >> 24) & 0xFF);
		return new string(chars);
	}

	private static readonly Dictionary<uint, string> KnownNames = new Dictionary<uint, string>
	{
		[Encode("IxFI")] = "IndexFlat",
		[Encode("IxF2")] = "IndexFlat",
		[Encode("IxFl")] = "IndexFlatL2",
		[Encode("IxPQ")] = "IndexPQ",
		[Encode("IxPo")] = "IndexPQ",
		[Encode("IxPq")] = "IndexPQ",
		[Encode("IxHE")] = "IndexLSH",
		[Encode("IxHe")] = "IndexLSH",
		[Encode("IxMp")] = "IndexIDMap",
		[Encode("IxM2")] = "IndexIDMap2",
		[Encode("IxPT")] = "IndexPreTransform",
		[Encode("IxRF")] = "IndexRefine",
		[Encode("IxRP")] = "IndexRefine",
		[Encode("IHNf")] = "IndexHNSWFlat",
		[Encode("IHNp")] = "IndexHNSWPQ",
		[Encode("IHNs")] = "IndexHNSWSQ",
		[Encode("IHN2")] = "IndexHNSW2Level",
		[Encode("IHNc")] = "IndexHNSWCagra",
		[Encode("IHc2")] = "IndexHNSWCagra2",
		[Encode("IHfP")] = "IndexHNSWFlatPanorama",
		[Encode("IvFl")] = "IndexIVFFlat",
		[Encode("IvFL")] = "IndexIVFFlat",
		[Encode("IwFl")] = "IndexIVFFlat",
		[Encode("IvPQ")] = "IndexIVFPQ",
		[Encode("IvQR")] = "IndexIVFPQR",
		[Encode("IwPQ")] = "IndexIVFPQ",
		[Encode("IwQR")] = "IndexIVFPQR",
		[Encode("IxSQ")] = "IndexScalarQuantizer",
		[Encode("IxLa")] = "IndexLattice",
		[Encode("IxLS")] = "IndexLocalSearchQuantizer",
		[Encode("IxRQ")] = "IndexResidualQuantizer",
		[Encode("IxRq")] = "IndexResidualQuantizer",
		[Encode("IxPR")] = "IndexProductResidualQuantizer",
		[Encode("IxPL")] = "IndexProductLocalSearchQuantizer",
		[Encode("Ix2L")] = "Index2Layer",
		[Encode("INSf")] = "IndexNSGFlat",
		[Encode("INSp")] = "IndexNSGPQ",
		[Encode("INSs")] = "IndexNSGSQ",
		[Encode("null")] = "NullIndex",
	};

	public static bool IsFaissMagic(uint value)
	{
		return KnownNames.ContainsKey(value);
	}

	public static string GetName(uint value)
	{
		if (KnownNames.TryGetValue(value, out string name))
			return name;

		return "Faiss:" + Decode(value);
	}
}
