using System.Drawing;

namespace RemoteDesktopWinV10.App;

/// <summary>오류 메시지를 선택·복사할 수 있는 다이얼로그.</summary>
internal static class ErrorDialog
{
    public static void Show(
        IWin32Window? owner,
        string message,
        string title,
        MessageBoxIcon icon = MessageBoxIcon.Error)
    {
        using var form = new ErrorDialogForm(message, title, icon);
        form.ShowDialog(owner);
    }

    /// <summary>확인/취소(또는 사용자 지정) 버튼. 확인이면 true.</summary>
    public static bool ShowConfirm(
        IWin32Window? owner,
        string message,
        string title,
        string confirmText = "그래도 연결 시도",
        string cancelText = "취소",
        MessageBoxIcon icon = MessageBoxIcon.Warning)
    {
        using var form = new ErrorDialogForm(message, title, icon, confirmText, cancelText);
        return form.ShowDialog(owner) == DialogResult.OK;
    }
}

internal sealed class ErrorDialogForm : Form
{
    public ErrorDialogForm(
        string message,
        string title,
        MessageBoxIcon icon,
        string? confirmText = null,
        string? cancelText = null)
    {
        var isConfirm = confirmText != null;
        Text = title;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MinimizeBox = false;
        MaximizeBox = false;
        ShowInTaskbar = false;
        Font = UiTheme.UiFont;
        BackColor = UiTheme.BgApp;
        ForeColor = UiTheme.TextPrimary;
        ClientSize = new Size(560, isConfirm ? 300 : 260);

        // 시스템 아이콘
        var sysIcon = icon switch
        {
            MessageBoxIcon.Warning     => SystemIcons.Warning,
            MessageBoxIcon.Information => SystemIcons.Information,
            _                          => SystemIcons.Error,
        };
        var iconBox = new PictureBox
        {
            Location = new Point(12, 12),
            Size = new Size(24, 24),
            SizeMode = PictureBoxSizeMode.StretchImage,
            Image = sysIcon.ToBitmap(),
        };
        var titleLabel = new Label
        {
            Text = title,
            Location = new Point(44, 15),
            AutoSize = true,
            Font = new Font(UiTheme.UiFont, FontStyle.Bold),
            ForeColor = UiTheme.TextPrimary,
        };

        // 선택·복사 가능한 메시지 영역
        var rtb = new RichTextBox
        {
            ReadOnly = true,
            Text = message,
            Location = new Point(12, 48),
            Size = new Size(536, isConfirm ? 206 : 166),
            BackColor = UiTheme.BgPanel,
            ForeColor = UiTheme.TextPrimary,
            Font = UiTheme.UiFont,
            BorderStyle = BorderStyle.FixedSingle,
            ScrollBars = RichTextBoxScrollBars.Vertical,
            WordWrap = true,
        };

        var buttonY = isConfirm ? 262 : 222;
        var copyBtn = new Button { Text = "메시지 복사", Location = new Point(12, buttonY), Width = 104, Height = 28 };
        UiTheme.StyleSecondaryButton(copyBtn);
        copyBtn.Click += (_, _) =>
        {
            try { Clipboard.SetText(message); } catch { }
            copyBtn.Text = "복사됨 ✓";
        };

        if (isConfirm)
        {
            var cancelBtn = new Button
            {
                Text = cancelText ?? "취소",
                DialogResult = DialogResult.Cancel,
                Location = new Point(336, buttonY),
                Width = 98,
                Height = 28,
            };
            var okBtn = new Button
            {
                Text = confirmText ?? "확인",
                DialogResult = DialogResult.OK,
                Location = new Point(442, buttonY),
                Width = 106,
                Height = 28,
            };
            UiTheme.StyleSecondaryButton(cancelBtn);
            UiTheme.StylePrimaryButton(okBtn);
            AcceptButton = okBtn;
            CancelButton = cancelBtn;
            Controls.AddRange(new Control[] { iconBox, titleLabel, rtb, copyBtn, cancelBtn, okBtn });
        }
        else
        {
            var okBtn = new Button
            {
                Text = "확인",
                DialogResult = DialogResult.OK,
                Location = new Point(450, buttonY),
                Width = 98,
                Height = 28,
            };
            UiTheme.StylePrimaryButton(okBtn);
            AcceptButton = okBtn;
            CancelButton = okBtn;
            Controls.AddRange(new Control[] { iconBox, titleLabel, rtb, copyBtn, okBtn });
        }
    }
}
