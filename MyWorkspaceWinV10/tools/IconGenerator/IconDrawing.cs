using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace IconGenerator;

internal static class IconDrawing
{
    public static Bitmap Draw(string name, int size) =>
        name switch
        {
            "h1" => Heading(size, 1, Color.FromArgb(196, 30, 30)),
            "h2" => Heading(size, 2, Color.FromArgb(16, 130, 58)),
            "h3" => Heading(size, 3, Color.FromArgb(24, 82, 200)),
            "h4" => Heading(size, 4, Color.FromArgb(115, 45, 200)),
            "h5" => Heading(size, 5, Color.FromArgb(200, 95, 10)),
            "h6" => Heading(size, 6, Color.FromArgb(139, 92, 246)),
            "bold" => Bold(size),
            "italic" => Italic(size),
            "strike" => Strike(size),
            "code" => Code(size),
            "codeblock" => CodeBlock(size),
            "link" => Link(size),
            "image" => ImageIcon(size),
            "attach" => Attach(size),
            "ul" => List(size, false),
            "ol" => List(size, true),
            "quote" => Quote(size),
            "hr" => HorizontalRule(size),
            "table" => Table(size),
            "undo" => Undo(size),
            "redo" => Redo(size),
            "outline" => Outline(size),
            "document_structure" => DocumentStructure(size),
            "comments" => Comments(size),
            "info" => Info(size),
            "save" => Save(size),
            "export" => Export(size),
            "history" => History(size),
            "refresh" => Refresh(size),
            "search" => Search(size),
            "login" => Login(size),
            "logout" => Logout(size),
            "exit" => Exit(size),
            "file" => FileDocument(size),
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
            "copy" => Copy(size),
            "cut" => Cut(size),
            "paste" => Paste(size),
            "selectall" => SelectAll(size),
            "lock" => Lock(size),
            "unlock" => Unlock(size),
            "log" => Log(size),
            "star" => Star(size),
            "workspace" => Folder(size, Color.FromArgb(255, 196, 120)),
            "workspace_fav" => Folder(size, Color.FromArgb(255, 215, 80)),
            "workspace_locked" => WorkspaceLocked(size),
            "workspace_fav_locked" => WorkspaceFavLocked(size),
            "page_locked" => PageLocked(size),
            "favorite" => Star(size),
            "page" => Page(size, Color.FromArgb(96, 165, 250)),
            _ => throw new ArgumentException($"Unknown icon: {name}", nameof(name))
        };

    private static Bitmap Heading(int size, int level, Color color) =>
        IconCanvas.Create(size, (g, c) =>
        {
            const float x = 0.75f;
            const float y = 0.75f;
            const float boxSize = 10.5f;

            IconCanvas.FillRectangle(g, c, x, y, boxSize, boxSize, color);
            IconCanvas.DrawRectangle(g, c, x, y, boxSize, boxSize, Color.FromArgb(180, 0, 0, 0), Math.Max(0.6f, size * 0.04f));

            var label = $"H{level}";
            var fontSize = size * level switch
            {
                1 or 2 => 0.30f,
                3 or 4 => 0.27f,
                _ => 0.24f
            };
            IconCanvas.DrawStringCentered(
                g,
                IconCanvas.Box(c, x, y, boxSize, boxSize),
                label,
                fontSize,
                Color.White,
                FontStyle.Bold);
        });

    private static Bitmap Bold(int size) =>
        IconCanvas.Create(size, (g, c) =>
            IconCanvas.DrawStringCentered(g, c, "B", size * 0.62f, Color.FromArgb(220, 38, 38), FontStyle.Bold));

    private static Bitmap Italic(int size) =>
        IconCanvas.Create(size, (g, c) =>
            IconCanvas.DrawStringCentered(g, c, "I", size * 0.62f, Color.FromArgb(124, 58, 237), FontStyle.Italic));

    private static Bitmap Strike(int size) =>
        IconCanvas.Create(size, (g, c) =>
            IconCanvas.DrawStringCentered(g, c, "S", size * 0.58f, Color.FromArgb(234, 88, 12), FontStyle.Strikeout));

    private static Bitmap Code(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var frame = Color.FromArgb(37, 99, 235);
            var fill = Color.FromArgb(219, 234, 254);
            var accent = Color.FromArgb(59, 130, 246);
            var stroke = Math.Max(0.85f, size * 0.07f);

            IconCanvas.DrawStringCentered(g, IconCanvas.Box(c, 0.4f, 3.8f, 2.2f, 4.4f), "`", size * 0.34f, frame, FontStyle.Bold);
            IconCanvas.DrawStringCentered(g, IconCanvas.Box(c, 9.4f, 3.8f, 2.2f, 4.4f), "`", size * 0.34f, frame, FontStyle.Bold);

            IconCanvas.FillRoundedRectangle(g, c, 3.1f, 4.4f, 5.8f, 3.2f, 0.75f, fill);
            IconCanvas.DrawRoundedRectangle(g, c, 3.1f, 4.4f, 5.8f, 3.2f, 0.75f, frame, stroke);
            IconCanvas.DrawLine(g, c, 4.1f, 6f, 7.9f, 6f, accent, stroke * 0.9f);
        });

    private static Bitmap CodeBlock(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var frame = Color.FromArgb(22, 163, 74);
            var panel = Color.FromArgb(220, 252, 231);
            var fence = Color.FromArgb(34, 197, 94);
            var code = Color.FromArgb(21, 128, 61);
            var stroke = Math.Max(0.8f, size * 0.06f);

            IconCanvas.FillRoundedRectangle(g, c, 1.8f, 2.2f, 8.4f, 7.6f, 0.55f, panel);
            IconCanvas.DrawRoundedRectangle(g, c, 1.8f, 2.2f, 8.4f, 7.6f, 0.55f, frame, stroke);

            IconCanvas.DrawLine(g, c, 2.6f, 1.1f, 2.6f, 2.2f, fence, stroke * 0.95f);
            IconCanvas.DrawLine(g, c, 3.5f, 1.1f, 3.5f, 2.2f, fence, stroke * 0.95f);
            IconCanvas.DrawLine(g, c, 4.4f, 1.1f, 4.4f, 2.2f, fence, stroke * 0.95f);
            IconCanvas.DrawLine(g, c, 2.6f, 9.7f, 2.6f, 10.8f, fence, stroke * 0.95f);
            IconCanvas.DrawLine(g, c, 3.5f, 9.7f, 3.5f, 10.8f, fence, stroke * 0.95f);
            IconCanvas.DrawLine(g, c, 4.4f, 9.7f, 4.4f, 10.8f, fence, stroke * 0.95f);

            IconCanvas.DrawLine(g, c, 3.1f, 4.6f, 9.1f, 4.6f, code, stroke * 0.95f);
            IconCanvas.DrawLine(g, c, 3.1f, 6.2f, 8.3f, 6.2f, code, stroke * 0.95f);
            IconCanvas.DrawLine(g, c, 3.1f, 7.8f, 7.2f, 7.8f, code, stroke * 0.95f);
        });

    private static Bitmap Link(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var primary = Color.FromArgb(37, 99, 235);
            var accent = Color.FromArgb(234, 88, 12);
            var stroke = Math.Max(1.35f, size * 0.135f);

            IconCanvas.DrawArc(g, c, 0.2f, 2.6f, 5.6f, 5.6f, 50f, 225f, primary, stroke);
            IconCanvas.DrawArc(g, c, 6f, 3.2f, 5.6f, 5.6f, 230f, 225f, accent, stroke);
            IconCanvas.DrawLine(g, c, 4.6f, 5.6f, 7.4f, 5.6f, primary, stroke * 0.75f);
        });

    private static Bitmap ImageIcon(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var frame = Color.FromArgb(14, 165, 233);
            var sky = Color.FromArgb(186, 230, 253);
            var sun = Color.FromArgb(251, 191, 36);
            var hillBack = Color.FromArgb(74, 222, 128);
            var hillFront = Color.FromArgb(22, 163, 74);
            var stroke = Math.Max(0.85f, size * 0.07f);

            IconCanvas.FillRoundedRectangle(g, c, 1.1f, 1.8f, 9.8f, 8.4f, 0.75f, sky);
            IconCanvas.DrawRoundedRectangle(g, c, 1.1f, 1.8f, 9.8f, 8.4f, 0.75f, frame, stroke);

            IconCanvas.FillEllipse(g, c, 2.3f, 2.8f, 2.5f, 2.5f, sun);

            IconCanvas.FillPolygon(g, c, hillBack, (1.2f, 10.1f), (4.8f, 6.4f), (7.4f, 10.1f));
            IconCanvas.FillPolygon(g, c, hillFront, (5.8f, 10.1f), (8.4f, 5.9f), (10.8f, 10.1f));
        });

    private static Bitmap Attach(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var stroke = Math.Max(1.1f, size * 0.11f);
            var doc = Color.FromArgb(14, 116, 144);
            var arrow = Color.FromArgb(234, 88, 12);

            IconCanvas.FillRectangle(g, c, 4f, 2f, 7.5f, 9f, doc);
            IconCanvas.DrawLine(g, c, 5.2f, 5f, 9.8f, 5f, Color.White, 0.9f);
            IconCanvas.DrawLine(g, c, 5.2f, 7.5f, 8.5f, 7.5f, Color.White, 0.9f);

            IconCanvas.DrawLine(g, c, 1f, 6f, 5.5f, 6f, arrow, stroke);
            IconCanvas.DrawLine(g, c, 1.5f, 4.5f, 1f, 6f, arrow, stroke);
            IconCanvas.DrawLine(g, c, 1.5f, 7.5f, 1f, 6f, arrow, stroke);
        });

    private static Bitmap List(int size, bool ordered) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var markerColor = ordered ? Color.FromArgb(234, 88, 12) : Color.FromArgb(22, 163, 74);
            var lineColor = Color.FromArgb(59, 130, 246);
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
            IconCanvas.DrawLine(g, c, 4.5f, 3.5f, 11f, 3.5f, Color.FromArgb(59, 130, 246), 1f);
            IconCanvas.DrawLine(g, c, 4.5f, 6f, 10.5f, 6f, Color.FromArgb(59, 130, 246), 1f);
            IconCanvas.DrawLine(g, c, 4.5f, 8.5f, 9.5f, 8.5f, Color.FromArgb(59, 130, 246), 1f);
        });

    private static Bitmap HorizontalRule(int size) =>
        IconCanvas.Create(size, (g, c) =>
            IconCanvas.DrawLine(g, c, 0.5f, 6f, 11.5f, 6f, Color.FromArgb(236, 72, 153), size * 0.12f));

    private static Bitmap Table(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var color = Color.FromArgb(14, 165, 233);
            IconCanvas.DrawRectangle(g, c, 0.5f, 1.5f, 11f, 9f, color, 1f);
            IconCanvas.DrawLine(g, c, 0.5f, 4.5f, 11.5f, 4.5f, color, 1f);
            IconCanvas.DrawLine(g, c, 4.5f, 1.5f, 4.5f, 10.5f, color, 1f);
            IconCanvas.DrawLine(g, c, 8f, 1.5f, 8f, 10.5f, color, 1f);
        });

    private static Bitmap Undo(int size) =>
        DrawStraightArrow(size, left: true, Color.FromArgb(37, 99, 235));

    private static Bitmap Redo(int size) =>
        DrawStraightArrow(size, left: false, Color.FromArgb(22, 163, 74));

    private static Bitmap DrawStraightArrow(int size, bool left, Color color)
    {
        var stroke = Math.Max(1.25f, size * 0.105f);

        return IconCanvas.Create(size, (g, c) =>
        {
            if (left)
            {
                IconCanvas.DrawLine(g, c, 10.2f, 6f, 4.4f, 6f, color, stroke);
                IconCanvas.FillPolygon(g, c, color, (1.8f, 6f), (4.8f, 3.9f), (4.8f, 8.1f));
            }
            else
            {
                IconCanvas.DrawLine(g, c, 1.8f, 6f, 7.6f, 6f, color, stroke);
                IconCanvas.FillPolygon(g, c, color, (10.2f, 6f), (7.2f, 3.9f), (7.2f, 8.1f));
            }
        });
    }

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

    private static Bitmap DocumentStructure(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var panel = Color.FromArgb(99, 102, 241);
            var frame = Color.FromArgb(79, 70, 229);
            var content = Color.FromArgb(165, 180, 252);
            var stroke = Math.Max(0.85f, size * 0.075f);

            IconCanvas.FillRoundedRectangle(g, c, 0.6f, 1f, 4.2f, 10f, 0.55f, panel);
            IconCanvas.DrawLine(g, c, 1.3f, 3.2f, 3.8f, 3.2f, Color.White, stroke * 0.85f);
            IconCanvas.DrawLine(g, c, 1.9f, 5.8f, 3.9f, 5.8f, Color.White, stroke * 0.75f);
            IconCanvas.DrawLine(g, c, 1.9f, 8.4f, 3.5f, 8.4f, Color.White, stroke * 0.75f);

            IconCanvas.DrawRoundedRectangle(g, c, 5.2f, 1f, 6.2f, 10f, 0.55f, frame, stroke);
            IconCanvas.DrawLine(g, c, 6f, 3.5f, 10.8f, 3.5f, content, stroke * 0.85f);
            IconCanvas.DrawLine(g, c, 6f, 6f, 10.8f, 6f, content, stroke * 0.85f);
            IconCanvas.DrawLine(g, c, 6f, 8.5f, 9.4f, 8.5f, content, stroke * 0.85f);
        });

    private static Bitmap Comments(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var fill = Color.FromArgb(245, 158, 11);
            var accent = Color.FromArgb(217, 119, 6);
            var stroke = Math.Max(0.85f, size * 0.075f);

            IconCanvas.FillRoundedRectangle(g, c, 0.8f, 0.8f, 10.4f, 7.2f, 1.1f, fill);
            IconCanvas.DrawRoundedRectangle(g, c, 0.8f, 0.8f, 10.4f, 7.2f, 1.1f, accent, stroke * 0.65f);
            IconCanvas.FillPolygon(g, c, accent, (2.4f, 7.8f), (4.8f, 7.8f), (3.2f, 10.4f));
            IconCanvas.DrawLine(g, c, 2.6f, 3.2f, 9.4f, 3.2f, Color.White, stroke * 0.9f);
            IconCanvas.DrawLine(g, c, 2.6f, 5.5f, 8.2f, 5.5f, Color.White, stroke * 0.8f);
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

    private static Bitmap Export(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 0.5f, 2f, 7.5f, 9f, Color.FromArgb(99, 102, 241));
            IconCanvas.DrawLine(g, c, 5.5f, 6f, 11f, 6f, Color.FromArgb(234, 88, 12), size * 0.12f);
            IconCanvas.DrawLine(g, c, 9.5f, 4.5f, 11f, 6f, Color.FromArgb(234, 88, 12), size * 0.12f);
            IconCanvas.DrawLine(g, c, 9.5f, 7.5f, 11f, 6f, Color.FromArgb(234, 88, 12), size * 0.12f);
            IconCanvas.DrawLine(g, c, 2.5f, 5f, 5.5f, 5f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 2.5f, 7.5f, 5.5f, 7.5f, Color.White, 1f);
        });

    private static Bitmap Refresh(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.DrawArc(g, c, 1f, 1f, 10f, 10f, 45f, 270f, Color.FromArgb(14, 165, 233), size * 0.12f);
            IconCanvas.DrawLine(g, c, 9f, 2f, 11f, 0.5f, Color.FromArgb(14, 165, 233), size * 0.12f);
            IconCanvas.DrawLine(g, c, 9f, 2f, 7.5f, 3.5f, Color.FromArgb(14, 165, 233), size * 0.12f);
        });

    private static Bitmap Search(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var color = Color.FromArgb(71, 85, 105);
            var stroke = Math.Max(1f, size * 0.1f);
            IconCanvas.DrawArc(g, c, 1.6f, 1.6f, 7.2f, 7.2f, 0f, 360f, color, stroke);
            IconCanvas.DrawLine(g, c, 6.8f, 6.8f, 10.4f, 10.4f, color, stroke);
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

    private static Bitmap FileDocument(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var color = Color.FromArgb(37, 99, 235);
            var fold = Color.FromArgb(147, 197, 253);
            var stroke = Math.Max(0.85f, size * 0.075f);

            using var path = new GraphicsPath(FillMode.Winding);
            path.AddPolygon(
            [
                IconCanvas.Point(c, 2.6f, 0.8f),
                IconCanvas.Point(c, 7.1f, 0.8f),
                IconCanvas.Point(c, 10.6f, 3.4f),
                IconCanvas.Point(c, 10.6f, 11.2f),
                IconCanvas.Point(c, 2.6f, 11.2f)
            ]);
            using (var brush = new SolidBrush(color))
                g.FillPath(brush, path);

            IconCanvas.DrawLine(g, c, 7.1f, 0.8f, 7.1f, 3.4f, fold, stroke);
            IconCanvas.DrawLine(g, c, 7.1f, 3.4f, 10.6f, 3.4f, fold, stroke);
            IconCanvas.DrawLine(g, c, 3.8f, 5.4f, 9.2f, 5.4f, fold, stroke * 0.85f);
            IconCanvas.DrawLine(g, c, 3.8f, 7.4f, 9.2f, 7.4f, fold, stroke * 0.85f);
            IconCanvas.DrawLine(g, c, 3.8f, 9.4f, 7.4f, 9.4f, fold, stroke * 0.85f);
        });

    private static Bitmap Preferences(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            const float centerX = 6f;
            const float centerY = 6f;
            const int teeth = 8;
            const float outerRadius = 4.9f;
            const float innerRadius = 3.35f;
            const float holeRadius = 1.35f;
            var color = Color.FromArgb(99, 102, 241);

            var gearPoints = new PointF[teeth * 2];
            for (var i = 0; i < teeth * 2; i++)
            {
                var angle = Math.PI * 2 * i / (teeth * 2) - Math.PI / 2;
                var radius = i % 2 == 0 ? outerRadius : innerRadius;
                gearPoints[i] = IconCanvas.Point(
                    c,
                    centerX + (float)(Math.Cos(angle) * radius),
                    centerY + (float)(Math.Sin(angle) * radius));
            }

            using var path = new GraphicsPath(FillMode.Alternate);
            path.AddPolygon(gearPoints);
            path.AddEllipse(IconCanvas.Box(c, centerX - holeRadius, centerY - holeRadius, holeRadius * 2, holeRadius * 2));
            using var brush = new SolidBrush(color);
            g.FillPath(brush, path);
        });

    private static Bitmap FolderPlus(int size, Color color) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 0.5f, 4.5f, 11f, 6.5f, color);
            IconCanvas.FillRectangle(g, c, 0.5f, 2.5f, 5.5f, 2.5f, color);
            DrawWorkspaceLetter(g, c, size, 0.5f, 5f, 9f, 5f, 0.34f);
            var accent = Color.White;
            var stroke = Math.Max(0.9f, size * 0.09f);
            IconCanvas.DrawLine(g, c, 9.1f, 2.7f, 9.1f, 4.3f, accent, stroke);
            IconCanvas.DrawLine(g, c, 8.3f, 3.5f, 9.9f, 3.5f, accent, stroke);
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
            var primary = Color.FromArgb(37, 99, 235);
            var secondary = Color.FromArgb(20, 184, 166);

            IconCanvas.FillEllipse(g, c, 0.5f, 2.4f, 4f, 4f, secondary);
            IconCanvas.FillEllipse(g, c, 0.1f, 6.7f, 5.2f, 3.8f, secondary);

            IconCanvas.FillEllipse(g, c, 5.6f, 1.6f, 5f, 4.8f, primary);
            IconCanvas.FillEllipse(g, c, 4.6f, 6.4f, 7f, 4.4f, primary);
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
            var color = Color.FromArgb(236, 72, 153);
            var stroke = Math.Max(1.0f, size * 0.085f);

            IconCanvas.DrawArc(g, c, 1.1f, 0.7f, 9.8f, 9.8f, 0f, 360f, color, stroke);
            IconCanvas.FillEllipse(g, c, 3.9f, 2.7f, 4.2f, 4f, color);
            IconCanvas.FillEllipse(g, c, 3.1f, 7f, 5.8f, 3.4f, color);
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

    private static Bitmap Copy(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var color = Color.FromArgb(59, 130, 246);
            IconCanvas.DrawRectangle(g, c, 2f, 2.5f, 6.5f, 7.5f, color, 1f);
            IconCanvas.DrawRectangle(g, c, 4.5f, 4.5f, 6.5f, 7.5f, color, 1f);
        });

    private static Bitmap Cut(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var color = Color.FromArgb(239, 68, 68);
            var stroke = Math.Max(1f, size * 0.09f);
            IconCanvas.DrawLine(g, c, 2f, 9.5f, 10f, 3f, color, stroke);
            IconCanvas.DrawLine(g, c, 2f, 3f, 10f, 9.5f, color, stroke);
            IconCanvas.FillEllipse(g, c, 1.2f, 7.8f, 2.4f, 2.4f, color);
            IconCanvas.FillEllipse(g, c, 8.4f, 1.8f, 2.4f, 2.4f, color);
        });

    private static Bitmap Paste(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var board = Color.FromArgb(59, 130, 246);
            var clip = Color.FromArgb(251, 191, 36);
            IconCanvas.FillRectangle(g, c, 3.5f, 2.5f, 5f, 1.8f, clip);
            IconCanvas.FillRectangle(g, c, 2.5f, 4f, 7f, 7.5f, board);
            IconCanvas.DrawLine(g, c, 4f, 6.5f, 8f, 6.5f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 4f, 8.5f, 7.5f, 8.5f, Color.White, 1f);
        });

    private static Bitmap SelectAll(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var color = Color.FromArgb(59, 130, 246);
            IconCanvas.DrawRectangle(g, c, 3f, 3f, 6f, 6f, color, 1.1f);
            IconCanvas.FillRectangle(g, c, 1.5f, 1.5f, 1.5f, 1.5f, color);
            IconCanvas.FillRectangle(g, c, 9f, 1.5f, 1.5f, 1.5f, color);
            IconCanvas.FillRectangle(g, c, 1.5f, 9f, 1.5f, 1.5f, color);
            IconCanvas.FillRectangle(g, c, 9f, 9f, 1.5f, 1.5f, color);
        });

    private static Bitmap Lock(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var body = Color.FromArgb(245, 158, 11);
            var shackle = Color.FromArgb(234, 88, 12);
            var stroke = Math.Max(0.85f, size * 0.08f);
            IconCanvas.DrawArc(g, c, 4f, 2.5f, 4f, 4f, 180f, 180f, shackle, stroke);
            IconCanvas.FillRectangle(g, c, 3.6f, 5.8f, 4.8f, 5.2f, body);
        });

    private static Bitmap Unlock(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var body = Color.FromArgb(34, 197, 94);
            var shackle = Color.FromArgb(22, 163, 74);
            var stroke = Math.Max(0.85f, size * 0.08f);
            IconCanvas.DrawArc(g, c, 5.5f, 2.2f, 4f, 4f, 180f, 180f, shackle, stroke);
            IconCanvas.FillRectangle(g, c, 3.6f, 5.8f, 4.8f, 5.2f, body);
        });

    private static Bitmap Log(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 2f, 0.5f, 8f, 11f, Color.FromArgb(99, 102, 241));
            IconCanvas.DrawLine(g, c, 4f, 3.5f, 8f, 3.5f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 4f, 6f, 8f, 6f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 4f, 8.5f, 7f, 8.5f, Color.White, 1f);
            IconCanvas.FillEllipse(g, c, 8.5f, 8.5f, 3f, 3f, Color.FromArgb(59, 130, 246));
            IconCanvas.DrawLine(g, c, 9.2f, 10f, 10.8f, 11.6f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 10.8f, 10f, 9.2f, 11.6f, Color.White, 1f);
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
            DrawWorkspaceLetter(g, c, size, 0.5f, 4.5f, 11f, 5.5f, 0.38f);
        });

    private static void DrawWorkspaceLetter(
        Graphics graphics,
        RectangleF content,
        int size,
        float x,
        float y,
        float width,
        float height,
        float fontScale)
    {
        IconCanvas.DrawStringCentered(
            graphics,
            IconCanvas.Box(content, x, y, width, height),
            "W",
            size * fontScale,
            Color.White,
            FontStyle.Bold);
    }

    private static Bitmap WorkspaceLocked(int size) =>
        WithLockBadge(size, s => Folder(s, Color.FromArgb(255, 196, 120)));

    private static Bitmap WorkspaceFavLocked(int size) =>
        WithLockBadge(size, s => Folder(s, Color.FromArgb(255, 215, 80)));

    private static Bitmap PageLocked(int size) =>
        WithLockBadge(size, s => Page(s, Color.FromArgb(96, 165, 250)));

    private static Bitmap WithLockBadge(int size, Func<int, Bitmap> drawBase)
    {
        using var baseIcon = drawBase(size);
        var composite = new Bitmap(baseIcon.Width, baseIcon.Height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(composite))
        {
            graphics.DrawImage(baseIcon, 0, 0);
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

            var inset = size * 0.1f;
            var content = new RectangleF(inset, inset, size - inset * 2, size - inset * 2);
            DrawLockBadge(graphics, content, size);
        }

        return composite;
    }

    private static void DrawLockBadge(Graphics graphics, RectangleF content, int size)
    {
        var body = Color.FromArgb(245, 158, 11);
        var shackle = Color.FromArgb(234, 88, 12);
        var stroke = Math.Max(0.75f, size * 0.07f);

        IconCanvas.FillEllipse(graphics, content, 7.2f, 7f, 4.6f, 4.6f, Color.FromArgb(248, 250, 252));
        IconCanvas.DrawArc(graphics, content, 8.2f, 7.4f, 2.9f, 2.7f, 180f, 180f, shackle, stroke);
        IconCanvas.FillRectangle(graphics, content, 8f, 9.1f, 3.3f, 2.6f, body);
    }

    private static Bitmap Page(int size, Color color) =>
        IconCanvas.Create(size, (g, c) =>
        {
            IconCanvas.FillRectangle(g, c, 2.5f, 0.5f, 7f, 11f, color);
            IconCanvas.FillPolygon(g, c, Color.White, (7f, 0.5f), (9.5f, 0.5f), (9.5f, 3f));
            IconCanvas.DrawLine(g, c, 4f, 5f, 8f, 5f, Color.White, 1f);
            IconCanvas.DrawLine(g, c, 4f, 7.5f, 8f, 7.5f, Color.White, 1f);
        });

    public static Bitmap WspFile(int size) =>
        IconCanvas.Create(size, (g, c) =>
        {
            var folderColor = Color.FromArgb(255, 196, 120);
            IconCanvas.FillRectangle(g, c, 0.5f, 4.2f, 11f, 6.8f, folderColor);
            IconCanvas.FillRectangle(g, c, 0.5f, 2.8f, 5.5f, 2.2f, folderColor);

            IconCanvas.FillRoundedRectangle(g, c, 3f, 4.8f, 8.6f, 7.2f, 0.6f, Color.White);
            IconCanvas.DrawRoundedRectangle(
                g, c, 3f, 4.8f, 8.6f, 7.2f, 0.6f,
                Color.FromArgb(37, 99, 235), Math.Max(0.6f, size * 0.045f));

            IconCanvas.DrawStringCentered(
                g,
                IconCanvas.Box(c, 3f, 4.8f, 8.6f, 7.2f),
                "WSP",
                size * 0.22f,
                Color.FromArgb(37, 99, 235),
                FontStyle.Bold);
        });

    public static Bitmap AppIcon(int size) =>
        IconCanvas.Create(size, 0.02f, (g, c) =>
        {
            const float x = 0.5f;
            const float y = 0.5f;
            const float tile = 11.0f;
            const float radius = 1.35f;
            var bevel = Math.Max(0.75f, size * 0.038f);

            IconCanvas.FillRoundedRectangle(
                g, c, x + 0.38f, y + 0.48f, tile, tile, radius, Color.FromArgb(75, 100, 116, 139));

            IconCanvas.FillRoundedRectangleGradient(
                g, c, x, y, tile, tile, radius,
                Color.FromArgb(255, 255, 255),
                Color.FromArgb(186, 198, 214),
                90f);

            IconCanvas.FillRoundedRectangleGloss(
                g, c, x, y, tile, tile, radius,
                Color.FromArgb(130, 255, 255, 255),
                Color.FromArgb(0, 255, 255, 255));

            IconCanvas.FillEllipseGradient(
                g, c, x + 0.9f, y + 7.2f, tile - 1.8f, 4.0f,
                Color.FromArgb(0, 0, 0, 0),
                Color.FromArgb(55, 148, 163, 184));

            IconCanvas.FillEllipseGradient(
                g, c, x + 2.2f, y + 0.9f, 4.2f, 2.4f,
                Color.FromArgb(100, 255, 255, 255),
                Color.FromArgb(0, 255, 255, 255));

            IconCanvas.DrawLine(g, c, x + 0.4f, y + 0.35f, x + tile - 0.4f, y + 0.35f, Color.FromArgb(255, 255, 255), bevel);
            IconCanvas.DrawLine(g, c, x + 0.35f, y + 0.4f, x + 0.35f, y + tile - 0.45f, Color.FromArgb(220, 255, 255, 255), bevel * 0.75f);
            IconCanvas.DrawLine(g, c, x + tile - 0.35f, y + tile - 0.35f, x + 0.4f, y + tile - 0.35f, Color.FromArgb(120, 100, 116, 139), bevel * 0.7f);
            IconCanvas.DrawLine(g, c, x + tile - 0.35f, y + 0.45f, x + tile - 0.35f, y + tile - 0.35f, Color.FromArgb(120, 100, 116, 139), bevel * 0.7f);

            IconCanvas.DrawRoundedRectangle(
                g, c, x, y, tile, tile, radius,
                Color.FromArgb(203, 213, 225), Math.Max(0.7f, size * 0.032f));

            var letterBox = IconCanvas.Box(c, x, y, tile, tile);
            var shadowBox = IconCanvas.Box(c, x + 0.18f, y + 0.22f, tile, tile);
            IconCanvas.DrawStringCentered(
                g, shadowBox, "M", "Times New Roman", size * 0.54f, Color.FromArgb(90, 148, 163, 184), FontStyle.Bold);
            IconCanvas.DrawStringCentered(
                g, letterBox, "M", "Times New Roman", size * 0.54f, Color.FromArgb(37, 99, 235), FontStyle.Bold);
        });
}
