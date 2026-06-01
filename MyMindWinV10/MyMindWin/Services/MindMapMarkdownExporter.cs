using System.IO;
using System.Text;
using MyMindWin.Models;

namespace MyMindWin.Services
{
    public static class MindMapMarkdownExporter
    {
        public static void Export(MindMapNode root, string title, string filePath, MindMapExportOptions options)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"# {EscapeMarkdownInline(title)}");
            sb.AppendLine();
            AppendNode(sb, root, level: 0, options);
            File.WriteAllText(filePath, sb.ToString(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        }

        private static void AppendNode(StringBuilder sb, MindMapNode node, int level, MindMapExportOptions options)
        {
            var indent = new string(' ', level * 2);
            sb.AppendLine($"{indent}- {EscapeMarkdownInline(node.Text)}");

            if (options.IncludeNotes && !string.IsNullOrWhiteSpace(node.Note))
            {
                foreach (var line in node.Note.Replace("\r\n", "\n").Split('\n'))
                    sb.AppendLine($"{indent}  > {line}");
            }

            if (options.IncludeImages && !string.IsNullOrWhiteSpace(node.Image))
            {
                var mime = MindMapExportImageHelper.NormalizeMime(node.ImageMime);
                sb.AppendLine($"{indent}  ![{EscapeMarkdownAlt(node.Text)}](data:{mime};base64,{node.Image.Trim()})");
            }

            foreach (var child in node.Children)
                AppendNode(sb, child, level + 1, options);
        }

        private static string EscapeMarkdownInline(string text) =>
            text.Replace("\\", "\\\\", StringComparison.Ordinal)
                .Replace("*", "\\*", StringComparison.Ordinal)
                .Replace("_", "\\_", StringComparison.Ordinal)
                .Replace("#", "\\#", StringComparison.Ordinal)
                .Replace("[", "\\[", StringComparison.Ordinal)
                .Replace("]", "\\]", StringComparison.Ordinal);

        private static string EscapeMarkdownAlt(string text) =>
            text.Replace("[", "", StringComparison.Ordinal)
                .Replace("]", "", StringComparison.Ordinal)
                .Replace("\r", "", StringComparison.Ordinal)
                .Replace("\n", " ", StringComparison.Ordinal);
    }
}
