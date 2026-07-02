using MyWorkspace.Win;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    protected override void WndProc(ref Message m)
    {
        if (FramelessWindowHelper.TryHandleWndProc(this, ref m))
            return;

        base.WndProc(ref m);
    }
}
