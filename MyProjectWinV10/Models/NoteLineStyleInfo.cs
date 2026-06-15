using System.Drawing.Drawing2D;

namespace MyProject.Models
{
    public static class NoteLineStyleInfo
    {
        public static string GetDisplayName(NoteLineStyle style) => style switch
        {
            NoteLineStyle.Solid => "Solid",
            NoteLineStyle.Dash => "Dashed",
            NoteLineStyle.Dot => "Dotted",
            _ => style.ToString()
        };

        public static IReadOnlyList<NoteLineStyle> AllStyles { get; } =
            Enum.GetValues<NoteLineStyle>().ToArray();

        public static NoteLineStyle Parse(string? value, NoteLineStyle fallback = NoteLineStyle.Dash)
        {
            if (string.IsNullOrWhiteSpace(value))
                return fallback;

            return Enum.TryParse<NoteLineStyle>(value, ignoreCase: true, out var parsed)
                ? parsed
                : fallback;
        }

        public static void ApplyToPen(Pen pen, NoteLineStyle style)
        {
            switch (style)
            {
                case NoteLineStyle.Solid:
                    pen.DashStyle = DashStyle.Solid;
                    break;
                case NoteLineStyle.Dash:
                    pen.DashStyle = DashStyle.Custom;
                    pen.DashPattern = new[] { 4f, 3f };
                    break;
                case NoteLineStyle.Dot:
                    pen.DashStyle = DashStyle.Dot;
                    break;
            }
        }
    }
}
