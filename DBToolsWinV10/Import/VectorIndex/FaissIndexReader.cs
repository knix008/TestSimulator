using System;
using System.IO;

namespace DBToolsWinV10.Import.VectorIndex;

internal static class FaissIndexReader
{
	public static VectorIndexInfo Read(string filePath)
	{
		try
		{
			FaissParsedIndex root = FaissIndexMetadataReader.Parse(filePath);
			return FaissIndexMetadataReader.ToInfo(filePath, root);
		}
		catch (NotSupportedException)
		{
			throw;
		}
		catch (Exception ex)
		{
			throw new InvalidDataException("Faiss 인덱스를 읽을 수 없습니다.\n" + ex.Message, ex);
		}
	}
}
