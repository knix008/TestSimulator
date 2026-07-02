namespace MyWorkspace.Win.Forms;

internal static class ThemedMessageBox
{
    public static DialogResult Show(string text) =>
        Show(null, text, string.Empty);

    public static DialogResult Show(string text, string caption) =>
        Show(null, text, caption);

    public static DialogResult Show(string text, string caption, MessageBoxButtons buttons) =>
        Show(null, text, caption, buttons);

    public static DialogResult Show(string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon) =>
        Show(null, text, caption, buttons, icon);

    public static DialogResult Show(
        IWin32Window? owner,
        string text,
        string caption) =>
        Show(owner, text, caption, MessageBoxButtons.OK);

    public static DialogResult Show(
        IWin32Window? owner,
        string text,
        string caption,
        MessageBoxButtons buttons) =>
        Show(owner, text, caption, buttons, MessageBoxIcon.None);

    public static DialogResult Show(
        IWin32Window? owner,
        string text,
        string caption,
        MessageBoxButtons buttons,
        MessageBoxIcon icon) =>
        Show(owner, text, caption, buttons, icon, MessageBoxDefaultButton.Button1);

    public static DialogResult Show(
        IWin32Window? owner,
        string text,
        string caption,
        MessageBoxButtons buttons,
        MessageBoxIcon icon,
        MessageBoxDefaultButton defaultButton)
    {
        using var form = new MessageBoxForm(text, caption, buttons, icon, defaultButton);
        return form.ShowDialog(owner);
    }

    private sealed class MessageBoxForm : Form
    {
        private readonly PictureBox _iconBox;
        private readonly Label _messageLabel;

        public MessageBoxForm(
            string text,
            string caption,
            MessageBoxButtons buttons,
            MessageBoxIcon icon,
            MessageBoxDefaultButton defaultButton)
        {
            const int padding = 20;
            const int iconGap = 14;
            const int maxTextWidth = 380;
            const int buttonGap = 8;
            const int buttonBottom = 16;

            AppTheme.ApplyStandardDialog(this);
            Text = caption;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;

            _iconBox = new PictureBox
            {
                Location = new Point(padding, padding),
                Size = new Size(32, 32),
                SizeMode = PictureBoxSizeMode.CenterImage,
                Image = GetIconImage(icon),
                Visible = icon != MessageBoxIcon.None
            };

            var messageLeft = icon == MessageBoxIcon.None ? padding : padding + 32 + iconGap;
            _messageLabel = new Label
            {
                AutoSize = true,
                MaximumSize = new Size(maxTextWidth, 0),
                Location = new Point(messageLeft, padding),
                Text = text,
                UseMnemonic = true
            };

            var buttonPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 56,
                Padding = new Padding(0, 8, padding, buttonBottom)
            };

            var buttonRow = CreateButtons(buttons, defaultButton);
            foreach (var button in buttonRow)
                buttonPanel.Controls.Add(button);

            Controls.Add(_messageLabel);
            Controls.Add(_iconBox);
            Controls.Add(buttonPanel);

            AppTheme.FinalizeDialogLayout(this);

            var contentHeight = Math.Max(
                _iconBox.Visible ? _iconBox.Bottom : 0,
                _messageLabel.Bottom);
            var clientHeight = contentHeight + buttonPanel.Height + padding;
            var clientWidth = Math.Max(
                _messageLabel.Right + padding,
                messageLeft + maxTextWidth + padding);
            ClientSize = new Size(Math.Max(320, clientWidth), clientHeight);

            AlignButtons(buttonPanel, buttonRow, buttonGap);
            AcceptButton = buttonRow.FirstOrDefault(button => button.DialogResult == DialogResult.OK)
                ?? buttonRow.FirstOrDefault(button => button.DialogResult == DialogResult.Yes);
            CancelButton = buttonRow.FirstOrDefault(button =>
                button.DialogResult is DialogResult.Cancel or DialogResult.No);
        }

        private static void AlignButtons(Panel footer, IReadOnlyList<Button> buttons, int gap)
        {
            if (buttons.Count == 0)
                return;

            var x = footer.ClientSize.Width - footer.Padding.Right;
            for (var index = buttons.Count - 1; index >= 0; index--)
            {
                var button = buttons[index];
                x -= button.Width;
                button.Location = new Point(x, footer.Padding.Top);
                x -= gap;
            }
        }

        private static List<Button> CreateButtons(MessageBoxButtons buttons, MessageBoxDefaultButton defaultButton)
        {
            List<Button> created = buttons switch
            {
                MessageBoxButtons.OK => new List<Button>
                {
                    CreateButton(Localization.Get(K.ButtonOk), DialogResult.OK, primary: true)
                },
                MessageBoxButtons.OKCancel => new List<Button>
                {
                    CreateButton(Localization.Get(K.ButtonOk), DialogResult.OK, primary: true),
                    CreateButton(Localization.Get(K.ButtonCancel), DialogResult.Cancel, primary: false)
                },
                MessageBoxButtons.YesNo => new List<Button>
                {
                    CreateButton(Localization.Get(K.ButtonYes), DialogResult.Yes, primary: true),
                    CreateButton(Localization.Get(K.ButtonNo), DialogResult.No, primary: false)
                },
                MessageBoxButtons.YesNoCancel => new List<Button>
                {
                    CreateButton(Localization.Get(K.ButtonYes), DialogResult.Yes, primary: true),
                    CreateButton(Localization.Get(K.ButtonNo), DialogResult.No, primary: false),
                    CreateButton(Localization.Get(K.ButtonCancel), DialogResult.Cancel, primary: false)
                },
                MessageBoxButtons.RetryCancel => new List<Button>
                {
                    CreateButton(Localization.Get(K.ButtonRetry), DialogResult.Retry, primary: true),
                    CreateButton(Localization.Get(K.ButtonCancel), DialogResult.Cancel, primary: false)
                },
                _ => new List<Button>
                {
                    CreateButton(Localization.Get(K.ButtonOk), DialogResult.OK, primary: true)
                }
            };

            if (defaultButton != MessageBoxDefaultButton.Button1 && created.Count > 1)
            {
                var index = defaultButton switch
                {
                    MessageBoxDefaultButton.Button2 => 1,
                    MessageBoxDefaultButton.Button3 => 2,
                    _ => 0
                };

                if (index >= 0 && index < created.Count)
                {
                    var selected = created[index];
                    created.RemoveAt(index);
                    created.Insert(0, selected);
                }
            }

            return created;
        }

        private static Button CreateButton(string text, DialogResult result, bool primary)
        {
            var button = new Button
            {
                Text = text,
                DialogResult = result,
                AutoSize = false
            };

            if (primary)
                AppTheme.StylePrimaryButton(button);
            else
                AppTheme.StyleSecondaryButton(button);

            AppTheme.FitButtonSize(button);
            return button;
        }

        private static Image? GetIconImage(MessageBoxIcon icon) =>
            icon switch
            {
                MessageBoxIcon.Information => SystemIcons.Information.ToBitmap(),
                MessageBoxIcon.Warning => SystemIcons.Warning.ToBitmap(),
                MessageBoxIcon.Error => SystemIcons.Error.ToBitmap(),
                MessageBoxIcon.Question => SystemIcons.Question.ToBitmap(),
                _ => null
            };
    }
}
