using Microsoft.Web.WebView2.WinForms;

namespace MyWorkspace.Win;

internal sealed class LiveResizeSplitContainer : SplitContainer
{
    private bool _liveDragging;
    private int _dragOffset;
    private Action<LiveResizeSplitContainer>? _duringDrag;
    private Action<LiveResizeSplitContainer>? _dragCompleted;

    public void SetCallbacks(
        Action<LiveResizeSplitContainer>? duringDrag = null,
        Action<LiveResizeSplitContainer>? dragCompleted = null)
    {
        _duringDrag = duringDrag;
        _dragCompleted = dragCompleted;
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left && Enabled && SplitterRectangle.Contains(e.Location))
        {
            _liveDragging = true;
            IsSplitterFixed = true;
            _dragOffset = Orientation == Orientation.Vertical
                ? e.X - SplitterDistance
                : e.Y - SplitterDistance;
            Capture = true;
            return;
        }

        base.OnMouseDown(e);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_liveDragging)
        {
            if (e.Button != MouseButtons.Left)
            {
                EndLiveDrag();
                base.OnMouseMove(e);
                return;
            }

            if (TryApplySplitterDistance(Orientation == Orientation.Vertical ? e.X : e.Y))
            {
                SplitContainerLiveResizeHelper.RefreshDuringDrag(this);
                _duringDrag?.Invoke(this);
            }

            return;
        }

        base.OnMouseMove(e);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        if (_liveDragging && e.Button == MouseButtons.Left)
            TryApplySplitterDistance(Orientation == Orientation.Vertical ? e.X : e.Y);

        if (_liveDragging)
            EndLiveDrag();

        base.OnMouseUp(e);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        if (_liveDragging && Control.MouseButtons != MouseButtons.Left)
            EndLiveDrag();

        base.OnMouseLeave(e);
    }

    private void EndLiveDrag()
    {
        if (!_liveDragging)
            return;

        _liveDragging = false;
        IsSplitterFixed = false;
        Capture = false;
        SplitContainerLiveResizeHelper.RefreshDuringDrag(this);
        _dragCompleted?.Invoke(this);
    }

    private bool TryApplySplitterDistance(int mouseCoord)
    {
        var distance = mouseCoord - _dragOffset;

        try
        {
            if (Orientation == Orientation.Vertical)
            {
                var maxDistance = Width - SplitterWidth - Panel2MinSize;
                if (maxDistance < Panel1MinSize)
                    return false;

                SplitterDistance = Math.Clamp(distance, Panel1MinSize, maxDistance);
            }
            else
            {
                var maxDistance = Height - SplitterWidth - Panel2MinSize;
                if (maxDistance < Panel1MinSize)
                    return false;

                SplitterDistance = Math.Clamp(distance, Panel1MinSize, maxDistance);
            }

            return true;
        }
        catch (ArgumentOutOfRangeException)
        {
            return false;
        }
    }
}

internal static class SplitContainerLiveResizeHelper
{
    public static void Attach(SplitContainer split)
    {
        // Legacy SplitContainer instances are upgraded at runtime when possible.
        if (split is LiveResizeSplitContainer)
            return;
    }

    public static void SetCallbacks(
        SplitContainer split,
        Action<SplitContainer>? duringDrag = null,
        Action<SplitContainer>? dragCompleted = null)
    {
        if (split is not LiveResizeSplitContainer liveSplit)
            return;

        liveSplit.SetCallbacks(
            duringDrag == null ? null : s => duringDrag(s),
            dragCompleted == null ? null : s => dragCompleted(s));
    }

    internal static void RefreshDuringDrag(Control root)
    {
        if (root.IsDisposed)
            return;

        if (root is SplitContainer split)
        {
            RefreshDuringDrag(split.Panel1);
            RefreshDuringDrag(split.Panel2);
        }

        foreach (Control child in root.Controls)
        {
            if (child.IsDisposed)
                continue;

            if (child is WebView2 webView)
                SyncWebViewBounds(webView);
            else
                RefreshDuringDrag(child);
        }

        root.PerformLayout();
        root.Invalidate(true);
        root.Update();
    }

    private static void SyncWebViewBounds(WebView2 webView)
    {
        if (!webView.IsHandleCreated || !webView.Visible || webView.Parent is not Control parent)
            return;

        var width = Math.Max(0, parent.ClientSize.Width);
        var height = Math.Max(0, parent.ClientSize.Height);
        if (width <= 0 || height <= 0)
            return;

        if (webView.Dock == DockStyle.Fill)
        {
            if (webView.Width != width || webView.Height != height)
            {
                webView.SetBounds(0, 0, width, height, BoundsSpecified.Size);
                MoveWindow(webView.Handle, 0, 0, width, height, repaint: true);
            }
        }

        webView.Update();
    }

    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
    private static extern bool MoveWindow(IntPtr hWnd, int x, int y, int nWidth, int nHeight, bool repaint);
}
