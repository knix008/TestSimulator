namespace HWP2DocWinV10;

sealed partial class ErrorDialog : Form
{
    private readonly System.Windows.Forms.Timer _copyResetTimer;

    public ErrorDialog()
    {
        InitializeComponent();
        _copyResetTimer = new System.Windows.Forms.Timer { Interval = 1500 };
        _copyResetTimer.Tick += CopyResetTimer_Tick;
    }

    public static void Show(IWin32Window? owner, string title, string summary, Exception? exception = null)
    {
        using var dialog = new ErrorDialog();
        dialog.Text = title;
        dialog.lblSummary.Text = summary;
        dialog.txtDetails.Text = exception == null
            ? summary
            : ExceptionFormatter.Format(exception);
        dialog.ShowDialog(owner);
    }

    private void ErrorDialog_Load(object? sender, EventArgs e)
    {
        picError.Image = SystemIcons.Error.ToBitmap();
    }

    private void btnCopy_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrEmpty(txtDetails.Text))
            return;

        Clipboard.SetText(txtDetails.Text);
        btnCopy.Text = "복사됨";
        _copyResetTimer.Stop();
        _copyResetTimer.Start();
    }

    private void CopyResetTimer_Tick(object? sender, EventArgs e)
    {
        _copyResetTimer.Stop();
        btnCopy.Text = "복사";
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _copyResetTimer.Stop();
        _copyResetTimer.Dispose();
        picError.Image?.Dispose();
        base.OnFormClosed(e);
    }
}
