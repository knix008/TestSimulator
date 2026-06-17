using System.IO;

namespace DBToolsWinV10.Import.VectorIndex;

public enum VectorIndexEngine
{
	Unknown,
	Faiss,
	HnswLib
}

public static class VectorIndexFileDetector
{
	public static bool TryDetect(string filePath, out VectorIndexEngine engine)
	{
		engine = VectorIndexEngine.Unknown;
		if (!File.Exists(filePath))
			return false;

		string extension = Path.GetExtension(filePath).ToLowerInvariant();
		if (extension is ".hnsw")
		{
			engine = VectorIndexEngine.HnswLib;
			return true;
		}

		if (extension is ".faiss" or ".findex")
		{
			engine = VectorIndexEngine.Faiss;
			return true;
		}

		if (extension is ".index" && TryReadFaissMagic(filePath, out _))
		{
			engine = VectorIndexEngine.Faiss;
			return true;
		}

		if (TryReadFaissMagic(filePath, out _))
		{
			engine = VectorIndexEngine.Faiss;
			return true;
		}

		return false;
	}

	public static bool TryReadFaissMagic(string filePath, out uint magic)
	{
		magic = 0;
		try
		{
			using FileStream stream = File.OpenRead(filePath);
			if (stream.Length < 4)
				return false;

			Span<byte> buffer = stackalloc byte[4];
			if (stream.Read(buffer) != 4)
				return false;

			magic = (uint)buffer[0]
				| ((uint)buffer[1] << 8)
				| ((uint)buffer[2] << 16)
				| ((uint)buffer[3] << 24);
			return FaissFourCc.IsFaissMagic(magic);
		}
		catch
		{
			return false;
		}
	}
}
