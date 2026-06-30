using System.Drawing;

namespace IconGenerator;

internal static class IconDrawing
{
    public static Bitmap Draw(string name, int size) =>
        name switch
        {
            "h1" => Heading(size, 1, Color.FromArgb(220, 38, 38)),
            "h2" => Heading(size, 2, Color.FromArgb(234, 88, 12)),
            "h3" => Heading(size, 3, Color.FromArgb(37, 99, 235)),
            "h4" => Heading(size, 4, Color.FromArgb(124, 58, 237)),
            "h5" => Heading(size, 5, Color.FromArgb(20, 184, 166)),
            "h6" => Heading(size, 6, Color.FromArgb(107, 114, 128)),
            "bold" => Bold(size),
            "italic" => Italic(size),
            "strike" => Strike(size),
            "code" => Code(size),
            "codeblock" => CodeBlock(size),
            "link" => Link(size),
            "image" => ImageIcon(size),
            "ul" => List(size, false),
            "ol" => List(size, true),
            "quote" => Quote(size),
            "hr" => HorizontalRule(size),
            "table" => Table(size),
            "outline" => Outline(size),
            "info" => Info(size),
            "save" => Save(size),
            "history" => History(size),
            "refresh" => Refresh(size),
            "login" => Login(size),
            "logout" => Logout(size),
            "exit" => Exit(size),
            "preferences" => Preferences(size),
            "folder_plus_workspace" => FolderPlus(size, Color.FromArgb(255, 196, 120)),
            "folder_plus_sub" => FolderPlus(size, Color.FromArgb(255, 180, 90)),
            "page_plus" => PagePlus(size),
            "rename" => Rename(size),
            "delete" => Delete(size),
            "members" => Members(size),
            "users" => Users(size),
            "database" => Database(size),
            "email" => Email(size),
            "profile" => Profile(size),
            "password" => Password(size),
            "bell" => Bell(size),
            "star" => Star(size),
            "workspace" => Folder(size, Color.FromArgb(255, 196, 120)),
            "workspace_fav" => Folder(size, Color.FromArgb(255, 215, 80)),
            "favorite" => Star(size),
            "page" => Page(size, Color.FromArgb(96, 165, 250)),
            _ => throw new ArgumentException($"Unknown icon: {name}", nameof(name))
        };

    private static Bitmap Heading(int size, int level, Color color) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 0.5f, 0.5f, 11f, 11f, color);
            var fontSize = level switch
            {
                1 => size * 0.55f,
                2 or 3 => size * 0.5f,
                _ => size * 0.45f
            };
            IconCanvas.DrawStringCentered(g, c, level.ToString(), fontSize, Color.White, FontStyle.Bold);
        });

    private static Bitmap Bold(int size) =>
        IconCanvas.Create(size, (g, c) =>
            IconCanvas.DrawStringCentered(g, c, "B", size * 0.62f, Color.Black, FontStyle.Bold));

    private static Bitmap Italic(int size) =>
        IconCanvas.Create(size, (g, c) =>
            IconCanvas.DrawStringCentered(g, c, "I", size * 0.62f, Color.FromArgb(72, 61, 139), FontStyle.Italic));

    private static Bitmap Strike(int size) =>
        IconCanvas.Create(size, (g, c) =>
            IconCanvas.DrawStringCentered(g, c, "S", size * 0.58f, Color.Gray, FontStyle.Strikeout));

    private static Bitmap Code(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 1f, 2f, 10f, 8f, Color.FromArgb(88, 166, 255));
            IconCanvas.DrawLine(g, c, 3f, 4.5f, 9f, 4.5f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 3f, 7.5f, 7.5f, 7.5f, Color.White, 1f);
        });

    private static Bitmap CodeBlock(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 0.5f, 1f, 11f, 10f, Color.FromArgb(45, 55, 72));
            IconCanvas.DrawLine(g, c, 2.5f, 3.5f, 9.5f, 3.5f, Color.FromArgb(104, 211, 145), 1f);
            IconCanvas.DrawLine(g, c, 2.5f, 6f, 8.5f, 6f, Color.FromArgb(104, 211, 145), 1f);
            IconCanvas.DrawLine(g, c, 2.5f, 8.5f, 7f, 8.5f, Color.FromArgb(104, 211, 145), 1f);
        });

    private static Bitmap Link(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.DrawArc(g, c, 0.5f, 3f, 5f, 5f, 45f, 200f, Color.FromArgb(9, 105, 218), size * 0.12f);
            IconCanvas.DrawArc(g, c, 6.5f, 3f, 5f, 5f, 225f, 200f, Color.FromArgb(9, 105, 218), size * 0.12f);
        });

    private static Bitmap ImageIcon(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 0.5f, 2f, 11f, 8f, Color.FromArgb(168, 85, 247));
            IconCanvas.FillEllipse(g, c, 2f, 4f, 3f, 3f, Color.Gold);
            IconCanvas.DrawLine(g, c, 1f, 9.5f, 4.5f, 6.5f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 4.5f, 6.5f, 7.5f, 9f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 7.5f, 9f, 11f, 4.5f, Color.White, 1f);
        });

    private static Bitmap List(int size, bool ordered) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var markerColor = ordered ? Color.FromArgb(234, 88, 12) : Color.FromArgb(22, 163, 74);
            var lineColor = Color.FromArgb(100, 116, 139);
            for (var i = 0; i < 3; i++)
            {
                var y = 2.5f + i * 3.5f;
                if (ordered)
                    IconCanvas.DrawStringCentered(g, IconCanvas.Box(c, 0.2f, y - 0.8f, 2.8f, 2.8f), (i + 1).ToString(), size * 0.38f, markerColor, FontStyle.Bold);
                else
                    IconCanvas.FillEllipse(g, c, 1f, y, 1.8f, 1.8f, markerColor);

                IconCanvas.DrawLine(g, c, 4.5f, y + 0.9f, 11f, y + 0.9f, lineColor, 1f);
            }
        });

    private static Bitmap Quote(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 1f, 1f, 2.2f, 10f, Color.FromArgb(9, 105, 218));
            IconCanvas.DrawLine(g, c, 4.5f, 3.5f, 11f, 3.5f, Color.FromArgb(87, 96, 106), 1f);
            IconCanvas.DrawLine(g, c, 4.5f, 6f, 10.5f, 6f, Color.FromArgb(87, 96, 106), 1f);
            IconCanvas.DrawLine(g, c, 4.5f, 8.5f, 9.5f, 8.5f, Color.FromArgb(87, 96, 106), 1f);
        });

    private static Bitmap HorizontalRule(int size) =>
        IconCanvas.Create(size, (g, c) =>
            IconCanvas.DrawLine(g, c, 0.5f, 6f, 11.5f, 6f, Color.FromArgb(148, 163, 184), size * 0.12f));

    private static Bitmap Table(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var color = Color.FromArgb(14, 165, 233);
            IconCanvas.DrawRectangle(g, c, 0.5f, 1.5f, 11f, 9f, color, 1f);
            IconCanvas.DrawLine(g, c, 0.5f, 4.5f, 11.5f, 4.5f, color, 1f);
            IconCanvas.DrawLine(g, c, 4.5f, 1.5f, 4.5f, 10.5f, color, 1f);
            IconCanvas.DrawLine(g, c, 8f, 1.5f, 8f, 10.5f, color, 1f);
        });

    private static Bitmap Outline(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var color = Color.FromArgb(99, 102, 241);
            IconCanvas.FillEllipse(g, c, 0.5f, 1.5f, 2.5f, 2.5f, color);
            IconCanvas.DrawLine(g, c, 4f, 2.75f, 11f, 2.75f, color, size * 0.08f);
            IconCanvas.FillEllipse(g, c, 2.5f, 5f, 2f, 2f, color);
            IconCanvas.DrawLine(g, c, 5.5f, 6f, 11f, 6f, color, size * 0.08f);
            IconCanvas.FillEllipse(g, c, 4.5f, 8.5f, 2f, 2f, color);
            IconCanvas.DrawLine(g, c, 7.5f, 9.5f, 11f, 9.5f, color, size * 0.08f);
        });

    private static Bitmap Info(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 0.5f, 0.5f, 11f, 11f, Color.FromArgb(59, 130, 246));
            IconCanvas.DrawStringCentered(g, c, "i", size * 0.62f, Color.White, FontStyle.Bold);
        });

    private static Bitmap Save(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 2f, 0.5f, 8f, 11f, Color.FromArgb(34, 197, 94));
            IconCanvas.FillRectangle(g, c, 4f, 0.5f, 4f, 3.5f, Color.White);
            IconCanvas.FillRectangle(g, c, 3.5f, 7f, 5f, 4f, Color.FromArgb(21, 128, 61));
        });

    private static Bitmap History(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.DrawArc(g, c, 1f, 1f, 10f, 10f, 0f, 360f, Color.FromArgb(59, 130, 246), size * 0.12f);
            IconCanvas.DrawLine(g, c, 6f, 6f, 6f, 3.5f, Color.FromArgb(59, 130, 246), size * 0.12f);
            IconCanvas.DrawLine(g, c, 6f, 6f, 8.5f, 7.5f, Color.FromArgb(59, 130, 246), size * 0.12f);
        });

    private static Bitmap Refresh(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.DrawArc(g, c, 1f, 1f, 10f, 10f, 45f, 270f, Color.FromArgb(14, 165, 233), size * 0.12f);
            IconCanvas.DrawLine(g, c, 9f, 2f, 11f, 0.5f, Color.FromArgb(14, 165, 233), size * 0.12f);
            IconCanvas.DrawLine(g, c, 9f, 2f, 7.5f, 3.5f, Color.FromArgb(14, 165, 233), size * 0.12f);
        });

    private static Bitmap Login(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 1f, 1f, 10f, 10f, Color.FromArgb(34, 197, 94));
            IconCanvas.DrawLine(g, c, 6f, 3.5f, 6f, 8.5f, Color.White, size * 0.12f);
            IconCanvas.DrawLine(g, c, 3.5f, 6f, 8.5f, 6f, Color.White, size * 0.12f);
        });

    private static Bitmap Logout(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.DrawRectangle(g, c, 1f, 2.5f, 5f, 7f, Color.FromArgb(249, 115, 22), size * 0.12f);
            IconCanvas.DrawLine(g, c, 7f, 6f, 11f, 6f, Color.FromArgb(249, 115, 22), size * 0.12f);
            IconCanvas.DrawLine(g, c, 9.5f, 4.5f, 11f, 6f, Color.FromArgb(249, 115, 22), size * 0.12f);
            IconCanvas.DrawLine(g, c, 9.5f, 7.5f, 11f, 6f, Color.FromArgb(249, 115, 22), size * 0.12f);
        });

    private static Bitmap Exit(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.DrawLine(g, c, 2.5f, 2.5f, 9.5f, 9.5f, Color.FromArgb(239, 68, 68), size * 0.12f);
            IconCanvas.DrawLine(g, c, 9.5f, 2.5f, 2.5f, 9.5f, Color.FromArgb(239, 68, 68), size * 0.12f);
        });

    private static Bitmap Preferences(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 2f, 2f, 8f, 8f, Color.FromArgb(100, 116, 139));
            IconCanvas.DrawLine(g, c, 6f, 0.5f, 6f, 2.5f, Color.White, size * 0.08f);
            IconCanvas.DrawArc(g, c, 4.5f, 0.2f, 3f, 2.2f, 0f, 180f, Color.White, size * 0.08f);
        });

    private static Bitmap FolderPlus(int size, Color color) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 0.5f, 4.5f, 11f, 6.5f, color);
            IconCanvas.FillRectangle(g, c, 0.5f, 2.5f, 5.5f, 2.5f, color);
            IconCanvas.DrawLine(g, c, 6f, 6.5f, 6f, 9.5f, Color.White, size * 0.12f);
            IconCanvas.DrawLine(g, c, 4.5f, 8f, 7.5f, 8f, Color.White, size * 0.12f);
        });

    private static Bitmap PagePlus(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 2.5f, 0.5f, 7f, 11f, Color.FromArgb(96, 165, 250));
            IconCanvas.DrawLine(g, c, 6f, 3.5f, 6f, 8.5f, Color.White, size * 0.12f);
            IconCanvas.DrawLine(g, c, 3.5f, 6f, 8.5f, 6f, Color.White, size * 0.12f);
        });

    private static Bitmap Rename(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.DrawLine(g, c, 1f, 10.5f, 8f, 3.5f, Color.FromArgb(234, 179, 8), size * 0.12f);
            IconCanvas.DrawLine(g, c, 8f, 3.5f, 10.5f, 1f, Color.FromArgb(234, 179, 8), size * 0.12f);
            IconCanvas.DrawLine(g, c, 10.5f, 1f, 11.5f, 2f, Color.FromArgb(234, 179, 8), size * 0.12f);
            IconCanvas.DrawLine(g, c, 11.5f, 2f, 9f, 4.5f, Color.FromArgb(234, 179, 8), size * 0.12f);
        });

    private static Bitmap Delete(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 3.5f, 4f, 5f, 7f, Color.FromArgb(239, 68, 68));
            IconCanvas.DrawLine(g, c, 2.5f, 3.5f, 9.5f, 3.5f, Color.FromArgb(185, 28, 28), 1f);
            IconCanvas.DrawLine(g, c, 4.5f, 2f, 7.5f, 2f, Color.FromArgb(185, 28, 28), 1f);
        });

    private static Bitmap Members(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 0.5f, 4f, 4f, 4f, Color.FromArgb(99, 102, 241));
            IconCanvas.FillEllipse(g, c, 7.5f, 4f, 4f, 4f, Color.FromArgb(99, 102, 241));
            IconCanvas.FillEllipse(g, c, 4f, 1.5f, 4f, 4f, Color.FromArgb(99, 102, 241));
        });

    private static Bitmap Users(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 3f, 1f, 6f, 5.5f, Color.FromArgb(168, 85, 247));
            IconCanvas.FillEllipse(g, c, 1f, 7f, 10f, 4.5f, Color.FromArgb(168, 85, 247));
        });

    private static Bitmap Database(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 1.5f, 1f, 9f, 3f, Color.FromArgb(20, 184, 166));
            IconCanvas.FillRectangle(g, c, 1.5f, 2.5f, 9f, 6.5f, Color.FromArgb(20, 184, 166));
            IconCanvas.FillEllipse(g, c, 1.5f, 7.5f, 9f, 3f, Color.FromArgb(20, 184, 166));
        });

    private static Bitmap Email(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 0.5f, 3f, 11f, 6.5f, Color.FromArgb(236, 72, 153));
            IconCanvas.DrawLine(g, c, 0.5f, 3f, 6f, 8f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 11.5f, 3f, 6f, 8f, Color.White, 1f);
        });

    private static Bitmap Profile(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 3f, 1f, 6f, 5.5f, Color.FromArgb(59, 130, 246));
            IconCanvas.FillEllipse(g, c, 1.5f, 7f, 9f, 4.5f, Color.FromArgb(59, 130, 246));
        });

    private static Bitmap Password(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 2.5f, 6f, 7f, 5f, Color.FromArgb(245, 158, 11));
            IconCanvas.DrawArc(g, c, 4f, 1.5f, 4f, 4.5f, 180f, 180f, Color.FromArgb(180, 83, 9), size * 0.12f);
        });

    private static Bitmap Bell(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 4.5f, 0.5f, 3f, 2.2f, Color.FromArgb(251, 191, 36));
            IconCanvas.FillPolygon(g, c, Color.FromArgb(251, 191, 36), (2f, 4f), (10f, 4f), (8.5f, 9.5f), (3.5f, 9.5f));
            IconCanvas.FillEllipse(g, c, 5.2f, 9.8f, 1.6f, 1.6f, Color.FromArgb(251, 191, 36));
        });

    private static Bitmap Star(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 1f, 1f, 10f, 10f, Color.Gold);
            IconCanvas.DrawLine(g, c, 6f, 3f, 6f, 9f, Color.White, size * 0.08f);
            IconCanvas.DrawLine(g, c, 3f, 6f, 9f, 6f, Color.White, size * 0.08f);
        });

    private static Bitmap Folder(int size, Color color) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 0.5f, 4f, 11f, 6.5f, color);
            IconCanvas.FillRectangle(g, c, 0.5f, 2.5f, 5.5f, 2.2f, color);
        });

    private static Bitmap Page(int size, Color color) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 2.5f, 0.5f, 7f, 11f, color);
            IconCanvas.FillPolygon(g, c, Color.White, (7f, 0.5f), (9.5f, 0.5f), (9.5f, 3f));
            IconCanvas.DrawLine(g, c, 4f, 5f, 8f, 5f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 4f, 7.5f, 8f, 7.5f, Color.White, 1f);
        });

    public static Bitmap AppIcon(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillEllipse(g, c, 0.5f, 0.5f, 11f, 11f, Color.FromArgb(9, 105, 218));
            IconCanvas.FillRectangle(g, c, 3.5f, 2.5f, 5f, 7.5f, Color.White);
            IconCanvas.FillPolygon(g, c, Color.FromArgb(218, 232, 252), (6.5f, 2.5f), (8.5f, 2.5f), (8.5f, 4.5f));
            IconCanvas.DrawLine(g, c, 4.5f, 5.5f, 7.5f, 5.5f, Color.FromArgb(9, 105, 218), Math.Max(1f, size * 0.08f));
            IconCanvas.DrawLine(g, c, 4.5f, 7.5f, 7f, 7.5f, Color.FromArgb(9, 105, 218), Math.Max(1f, size * 0.08f));
        });
}
