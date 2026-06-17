using System;
using System.IO;

namespace DBToolsWinV10.Import.VectorIndex;

public static class VectorIndexSchemaImporter
{
	public static Models.DbSchema Import(string filePath)
	{
		if (!File.Exists(filePath))
			throw new FileNotFoundException("벡터 인덱스 파일을 찾을 수 없습니다.", filePath);

		if (!VectorIndexFileDetector.TryDetect(filePath, out VectorIndexEngine engine))
			throw new NotSupportedException("지원하지 않는 벡터 인덱스 형식입니다: " + Path.GetExtension(filePath));

		VectorIndexInfo info = engine switch
		{
			VectorIndexEngine.Faiss => FaissIndexReader.Read(filePath),
			VectorIndexEngine.HnswLib => HnswIndexReader.Read(filePath),
			_ => throw new NotSupportedException("지원하지 않는 벡터 인덱스 엔진입니다.")
		};

		return VectorIndexSchemaBuilder.Build(filePath, info);
	}
}
