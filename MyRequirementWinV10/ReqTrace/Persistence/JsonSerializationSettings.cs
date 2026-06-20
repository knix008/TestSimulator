using System.Text.Json;
using System.Text.Json.Serialization;

namespace ReqTrace.Persistence;

public static class JsonSerializationSettings
{
    public static readonly JsonSerializerOptions Default = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };
}
