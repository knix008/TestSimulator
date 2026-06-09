using System.Text.Json;
using System.Text.Json.Serialization;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Serialization;

public sealed class UmlEdgeRoutingKindJsonConverter : JsonConverter<UmlEdgeRoutingKind>
{
    public override UmlEdgeRoutingKind Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var value = reader.GetString();
            return value?.ToLowerInvariant() switch
            {
                "straight" => UmlEdgeRoutingKind.Straight,
                "bent" or "orthogonal" or "curved" => UmlEdgeRoutingKind.Bent,
                _ => Enum.TryParse<UmlEdgeRoutingKind>(value, ignoreCase: true, out var parsed)
                    ? parsed
                    : UmlEdgeRoutingKind.Straight,
            };
        }

        if (reader.TokenType == JsonTokenType.Number && reader.TryGetInt32(out var number))
            return number == 0 ? UmlEdgeRoutingKind.Straight : UmlEdgeRoutingKind.Bent;

        return UmlEdgeRoutingKind.Straight;
    }

    public override void Write(Utf8JsonWriter writer, UmlEdgeRoutingKind value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value == UmlEdgeRoutingKind.Bent ? "bent" : "straight");
}
