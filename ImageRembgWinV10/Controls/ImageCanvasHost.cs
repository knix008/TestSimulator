namespace ImageRembgWinV10.Controls;

public sealed class ImageCanvasHost : Panel
{
    private ImageCanvas? _canvas;

    public ImageCanvasHost()
    {
        BackColor = Color.FromArgb(45, 45, 48);
        AutoScroll = false;
    }

    public void AttachCanvas(ImageCanvas canvas)
    {
        _canvas = canvas;
        canvas.Dock = DockStyle.None;

        if (!Controls.Contains(canvas))
        {
            Controls.Add(canvas);
        }

        canvas.ImageChanged -= Canvas_ImageChanged;
        canvas.ImageChanged += Canvas_ImageChanged;
        Resize -= Host_Resize;
        Resize += Host_Resize;

        UpdateCanvasLayout();
    }

    internal void UpdateCanvasLayout()
    {
        if (_canvas == null)
        {
            return;
        }

        _canvas.Dock = DockStyle.None;
        _canvas.Location = Point.Empty;
        _canvas.Size = ClientSize;
        AutoScrollMinSize = Size.Empty;

        if (!_canvas.HasImage)
        {
            return;
        }

        _canvas.SyncViewAfterLayout();
    }

    private void Canvas_ImageChanged(object? sender, EventArgs e)
    {
        UpdateCanvasLayout();
    }

    private void Host_Resize(object? sender, EventArgs e)
    {
        UpdateCanvasLayout();
    }
}
