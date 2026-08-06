namespace FileMasterWinV10.Helpers;

/// <summary>
/// 다크/라이트 테마와 현재 언어(버튼 텍스트 포함)를 따르는 메시지 상자.
/// 표준 MessageBox는 OS 언어로 버튼이 표시되므로 이를 대체한다.
/// </summary>
public static class ThemedMessageBox
{
    public static DialogResult Show(string text, string caption,
        MessageBoxButtons buttons = MessageBoxButtons.OK, MessageBoxIcon icon = MessageBoxIcon.None)
        => Show(null, text, caption, buttons, icon, null);

    public static DialogResult Show(IWin32Window? owner, string text, string caption,
        MessageBoxButtons buttons = MessageBoxButtons.OK, MessageBoxIcon icon = MessageBoxIcon.None)
        => Show(owner, text, caption, buttons, icon, null);

    public static DialogResult Show(IWin32Window? owner, string text, string caption,
        MessageBoxButtons buttons, MessageBoxIcon icon, Image? customIcon)
    {
        using var form = new Form
        {
            Text = caption,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = owner != null ? FormStartPosition.CenterParent : FormStartPosition.CenterScreen,
            MinimizeBox = false,
            MaximizeBox = false,
            ShowInTaskbar = false,
            BackColor = UiTheme.Surface,
            ForeColor = UiTheme.TextPrimary,
            Font = UiTheme.UiFont,
            AutoScaleMode = AutoScaleMode.Dpi,
        };
        AppIconHelper.TryApplyFormIcon(form);

        const int pad = 20, gap = 16, iconSize = 40;
        var iconImg = customIcon ?? SystemIconFor(icon);
        int textLeft = pad + (iconImg != null ? iconSize + gap : 0);
        const int maxTextWidth = 460;

        var textSize = TextRenderer.MeasureText(text, UiTheme.UiFont,
            new Size(maxTextWidth, int.MaxValue),
            TextFormatFlags.WordBreak | TextFormatFlags.TextBoxControl);
        int textW = Math.Max(textSize.Width, 200);
        int textH = Math.Max(textSize.Height, iconImg != null ? iconSize : 0);

        if (iconImg != null)
        {
            form.Controls.Add(new PictureBox
            {
                Image = new Bitmap(iconImg, new Size(iconSize, iconSize)),
                SizeMode = PictureBoxSizeMode.Zoom,
                Location = new Point(pad, pad),
                Size = new Size(iconSize, iconSize),
                BackColor = Color.Transparent,
            });
        }

        form.Controls.Add(new Label
        {
            Text = text,
            Location = new Point(textLeft, pad),
            Size = new Size(textW, textH),
            ForeColor = UiTheme.TextPrimary,
            Font = UiTheme.UiFont,
            TextAlign = ContentAlignment.TopLeft,
        });

        var (specs, defResult, cancelResult) = ButtonsFor(buttons);
        const int btnW = 92, btnH = 30, btnGap = 8;
        int groupW = specs.Count * btnW + (specs.Count - 1) * btnGap;
        int contentW = textLeft + textW + pad;
        int formW = Math.Max(Math.Max(contentW, groupW + 2 * pad), 320);
        int btnTop = pad + textH + gap;

        var result = cancelResult;
        Button? defaultBtn = null, cancelBtn = null;
        int x = formW - pad - groupW;
        foreach (var (dr, key, primary) in specs)
        {
            var b = new Button { Text = LocalizationService.T(key), Size = new Size(btnW, btnH), Location = new Point(x, btnTop) };
            if (primary) UiTheme.StylePrimaryButton(b); else UiTheme.StyleSecondaryButton(b);
            var captured = dr;
            b.Click += (_, _) => { result = captured; form.DialogResult = captured; form.Close(); };
            form.Controls.Add(b);
            if (dr == defResult) defaultBtn = b;
            if (dr == cancelResult) cancelBtn = b;
            x += btnW + btnGap;
        }

        form.ClientSize = new Size(formW, btnTop + btnH + pad);
        if (defaultBtn != null) form.AcceptButton = defaultBtn;
        if (cancelBtn != null) form.CancelButton = cancelBtn;

        form.ShowDialog(owner);
        return result;
    }

    private static Image? SystemIconFor(MessageBoxIcon icon) => icon switch
    {
        MessageBoxIcon.Error => SystemIcons.Error.ToBitmap(),          // = Hand/Stop
        MessageBoxIcon.Warning => SystemIcons.Warning.ToBitmap(),      // = Exclamation
        MessageBoxIcon.Information => SystemIcons.Information.ToBitmap(), // = Asterisk
        MessageBoxIcon.Question => SystemIcons.Question.ToBitmap(),
        _ => null,
    };

    private static (List<(DialogResult dr, string key, bool primary)> specs, DialogResult def, DialogResult cancel)
        ButtonsFor(MessageBoxButtons buttons) => buttons switch
    {
        MessageBoxButtons.OKCancel => (new()
        {
            (DialogResult.OK, "Btn_OK", true),
            (DialogResult.Cancel, "Btn_Cancel", false),
        }, DialogResult.OK, DialogResult.Cancel),

        MessageBoxButtons.YesNo => (new()
        {
            (DialogResult.Yes, "Btn_Yes", true),
            (DialogResult.No, "Btn_No", false),
        }, DialogResult.Yes, DialogResult.No),

        MessageBoxButtons.YesNoCancel => (new()
        {
            (DialogResult.Yes, "Btn_Yes", true),
            (DialogResult.No, "Btn_No", false),
            (DialogResult.Cancel, "Btn_Cancel", false),
        }, DialogResult.Yes, DialogResult.Cancel),

        MessageBoxButtons.RetryCancel => (new()
        {
            (DialogResult.Retry, "Btn_Retry", true),
            (DialogResult.Cancel, "Btn_Cancel", false),
        }, DialogResult.Retry, DialogResult.Cancel),

        _ => (new() { (DialogResult.OK, "Btn_OK", true) }, DialogResult.OK, DialogResult.OK),
    };
}
