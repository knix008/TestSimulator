using System;
using System.IO;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Import;

public static class DatabaseFileImporter
{
	public static DbSchema Import(string filePath)
	{
		if (!File.Exists(filePath))
		{
			throw new FileNotFoundException("데이터베이스 파일을 찾을 수 없습니다.", filePath);
		}
		DbFileFormat dbFileFormat = DbFileFormatDetector.Detect(filePath);
		if (1 == 0)
		{
		}
		DbSchema result = dbFileFormat switch
		{
			DbFileFormat.Sqlite => SqliteSchemaImporter.Import(filePath), 
			DbFileFormat.SqlDdl => SqlDdlSchemaImporter.Import(filePath), 
			DbFileFormat.Access => AccessSchemaImporter.Import(filePath), 
			DbFileFormat.SqlServer => SqlServerFileSchemaImporter.Import(filePath), 
			DbFileFormat.VectorIndex => VectorIndex.VectorIndexSchemaImporter.Import(filePath), 
			_ => throw new NotSupportedException("지원하지 않는 파일 형식입니다: " + Path.GetExtension(filePath)), 
		};
		if (1 == 0)
		{
		}
		return result;
	}
}
