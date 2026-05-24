namespace MIDIMasterWinV10;

/// <summary>
/// 오류 내용을 선택/복사할 수 있는 대화상자입니다.
/// </summary>
public class ErrorDialog : Form
{
    private TextBox txtMessage = null!;
    private Button btnCopy = null!;
    private Button btnClose = null!;
    private Label lblTitle = null!;
    private PictureBox picIcon = null!;

    public ErrorDialog(string title, string message, Exception? ex = null)
    {
        InitLayout(title, BuildMessage(message, ex));
    }

    private static string BuildMessage(string message, Exception? ex)
    {
        if (ex == null) return message;

        var sb = new System.Text.StringBuilder();
        sb.AppendLine(message);
        sb.AppendLine();
        sb.AppendLine("── 오류 상세 ──────────────────────");
        sb.AppendLine($"종류: {ex.GetType().FullName}");
        sb.AppendLine($"내용: {ex.Message}");

        var inner = ex.InnerException;
        while (inner != null)
        {
            sb.AppendLine($"원인: {inner.GetType().Name}: {inner.Message}");
            inner = inner.InnerException;
        }

        sb.AppendLine();
        sb.AppendLine("── 스택 추적 ──────────────────────");
        sb.AppendLine(ex.StackTrace);

        return sb.ToString();
    }

    private void InitLayout(string title, string message)
    {
        Text = title;
        Size = new Size(600, 400);
        MinimumSize = new Size(400, 300);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.Sizable;
        Font = new Font("Segoe UI", 9);

        picIcon = new PictureBox
        {
            Image = SystemIcons.Error.ToBitmap(),
            Size = new Size(32, 32),
            Location = new Point(12, 12),
            SizeMode = PictureBoxSizeMode.StretchImage
        };

        lblTitle = new Label
        {
            Text = title,
            Font = new Font("Segoe UI", 10, FontStyle.Bold),
            AutoSize = false,
            Location = new Point(52, 16),
            Size = new Size(520, 24),
            ForeColor = Color.DarkRed
        };

        txtMessage = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            Text = message,
            Font = new Font("Consolas", 8.5f),
            BackColor = Color.WhiteSmoke,
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
            Location = new Point(12, 52),
            Size = new Size(560, 270)
        };

        btnCopy = new Button
        {
            Text = "내용 복사",
            Size = new Size(100, 28),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
            Location = new Point(360, 330)
        };
        btnCopy.Click += (_, _) =>
        {
            Clipboard.SetText(txtMessage.Text);
            btnCopy.Text = "복사됨!";
            Task.Delay(1500).ContinueWith(_ => Invoke(() => btnCopy.Text = "내용 복사"));
        };

        btnClose = new Button
        {
            Text = "닫기",
            Size = new Size(80, 28),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
            Location = new Point(472, 330),
            DialogResult = DialogResult.OK
        };

        Controls.AddRange([picIcon, lblTitle, txtMessage, btnCopy, btnClose]);
        AcceptButton = btnClose;
    }

    /// <summary>오류 대화상자를 표시합니다.</summary>
    public static void Show(IWin32Window? owner, string title, string message, Exception? ex = null)
    {
        using var dlg = new ErrorDialog(title, message, ex);
        if (owner != null)
            dlg.ShowDialog(owner);
        else
            dlg.ShowDialog();
    }
}
