namespace MyAgileBoardWinV10.Forms;

public partial class ErrorDialogForm : Form
{
    public ErrorDialogForm(string title, string summary, string details)
    {
        InitializeComponent();
        Text = title;
        lblSummary.Text = summary;
        txtDetails.Text = details;
        picIcon.Image = SystemIcons.Error.ToBitmap();
    }

    private void btnOk_Click(object? sender, EventArgs e) => Close();

    private void btnCopy_Click(object? sender, EventArgs e) => CopyDetailsToClipboard();

    private void txtDetails_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Control && e.KeyCode == Keys.C)
        {
            CopyDetailsToClipboard();
            e.Handled = true;
        }
    }

    private void CopyDetailsToClipboard()
    {
        if (string.IsNullOrEmpty(txtDetails.Text)) return;

        try
        {
            Clipboard.SetText(txtDetails.Text);
            btnCopy.Text = "복사됨";
            var timer = new System.Windows.Forms.Timer { Interval = 1500 };
            timer.Tick += (_, _) =>
            {
                btnCopy.Text = "복사";
                timer.Stop();
                timer.Dispose();
            };
            timer.Start();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this,
                $"클립보드 복사에 실패했습니다.\n{ex.Message}",
                "복사 오류",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }
}
