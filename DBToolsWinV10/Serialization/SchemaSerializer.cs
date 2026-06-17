using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Serialization;

public static class SchemaSerializer
{
	private static readonly JsonSerializerOptions Options = new JsonSerializerOptions
	{
		WriteIndented = true,
		Converters = { (JsonConverter)new JsonStringEnumConverter() },
		DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
	};

	public static void Save(DbSchema schema, string filePath)
	{
		string contents = JsonSerializer.Serialize(schema, Options);
		File.WriteAllText(filePath, contents, Encoding.UTF8);
	}

	public static DbSchema Load(string filePath)
	{
		string json = File.ReadAllText(filePath, Encoding.UTF8);
		DbSchema schema = JsonSerializer.Deserialize<DbSchema>(json, Options) ?? throw new InvalidDataException("스키마 파일을 읽을 수 없습니다.");
		schema.EnsureInitialized();
		return schema;
	}
}
