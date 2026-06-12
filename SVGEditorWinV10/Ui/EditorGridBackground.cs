namespace SVGEditorWinV10.Ui;

public static class EditorGridBackground
{
    public static readonly Color PaperColor = Color.FromArgb(248, 250, 252);

    public static Bitmap CreateTile()
    {
        var tile = new Bitmap(EditorCanvasGrid.MajorGrid, EditorCanvasGrid.MajorGrid);
        using var g = Graphics.FromImage(tile);
        g.Clear(PaperColor);

        using var minorPen = new Pen(Color.FromArgb(28, 0, 0, 0));
        using var majorPen = new Pen(Color.FromArgb(52, 0, 0, 0));

        for (var x = 0; x <= EditorCanvasGrid.MajorGrid; x += EditorCanvasGrid.MinorGrid)
        {
            var pen = x == 0 ? majorPen : minorPen;
            g.DrawLine(pen, x, 0, x, EditorCanvasGrid.MajorGrid);
        }

        for (var y = 0; y <= EditorCanvasGrid.MajorGrid; y += EditorCanvasGrid.MinorGrid)
        {
            var pen = y == 0 ? majorPen : minorPen;
            g.DrawLine(pen, 0, y, EditorCanvasGrid.MajorGrid, y);
        }

        return tile;
    }

    public static void Apply(RichTextBox editor)
    {
        editor.BackColor = PaperColor;
        editor.BackgroundImage = CreateTile();
        editor.BackgroundImageLayout = ImageLayout.Tile;
    }
}
