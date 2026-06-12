namespace SVGEditorWinV10.Ui;

public static class DocumentSizeDialog
{
    public sealed class Result
    {
        public required float Width { get; init; }
        public required float Height { get; init; }
    }

    public static bool TryShow(IWin32Window? owner, float currentWidth, float currentHeight, out Result? result)
    {
        result = null;
        using var form = CreateForm(currentWidth, currentHeight);
        if (form.ShowDialog(owner) != DialogResult.OK)
            return false;

        result = new Result
        {
            Width = (float)form.WidthValue,
            Height = (float)form.HeightValue
        };
        return true;
    }

    private sealed class DocumentSizeForm : Form
    {
        public decimal WidthValue { get; private set; }
        public decimal HeightValue { get; private set; }

        private readonly NumericUpDown _widthInput;
        private readonly NumericUpDown _heightInput;

        public DocumentSizeForm(float currentWidth, float currentHeight)
        {
            Text = "캔버스 크기";
            ClientSize = new Size(320, 168);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            Font = ModernTheme.UiFont;
            BackColor = ModernTheme.PanelBackground;

            var infoLabel = new Label
            {
                Location = new Point(16, 16),
                Size = new Size(288, 32),
                Text = "SVG 문서 영역의 가로·세로 크기를 설정합니다.\n기존 도형·텍스트·이미지는 원래 위치에 유지됩니다.",
                ForeColor = ModernTheme.TextSecondary,
                BackColor = ModernTheme.PanelBackground
            };

            var widthLabel = new Label
            {
                Location = new Point(16, 56),
                Size = new Size(72, 23),
                Text = "너비 (px)",
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = ModernTheme.TextPrimary,
                BackColor = ModernTheme.PanelBackground
            };

            _widthInput = new NumericUpDown
            {
                Location = new Point(96, 54),
                Size = new Size(120, 23),
                Minimum = 1,
                Maximum = 100000,
                DecimalPlaces = 0,
                Value = Clamp(currentWidth)
            };
            ModernTheme.StyleInput(_widthInput);

            var heightLabel = new Label
            {
                Location = new Point(16, 88),
                Size = new Size(72, 23),
                Text = "높이 (px)",
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = ModernTheme.TextPrimary,
                BackColor = ModernTheme.PanelBackground
            };

            _heightInput = new NumericUpDown
            {
                Location = new Point(96, 86),
                Size = new Size(120, 23),
                Minimum = 1,
                Maximum = 100000,
                DecimalPlaces = 0,
                Value = Clamp(currentHeight)
            };
            ModernTheme.StyleInput(_heightInput);

            var okButton = new Button
            {
                Location = new Point(136, 124),
                Size = new Size(80, 28),
                Text = "확인",
                DialogResult = DialogResult.OK
            };
            ModernTheme.StylePrimaryButton(okButton);

            var cancelButton = new Button
            {
                Location = new Point(224, 124),
                Size = new Size(80, 28),
                Text = "취소",
                DialogResult = DialogResult.Cancel
            };
            ModernTheme.StyleSecondaryButton(cancelButton);

            AcceptButton = okButton;
            CancelButton = cancelButton;
            Controls.AddRange([infoLabel, widthLabel, _widthInput, heightLabel, _heightInput, okButton, cancelButton]);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (DialogResult == DialogResult.OK)
            {
                WidthValue = _widthInput.Value;
                HeightValue = _heightInput.Value;
            }

            base.OnFormClosing(e);
        }

        private static decimal Clamp(float value) =>
            Math.Clamp((decimal)Math.Round(value), 1, 100000);
    }

    private static DocumentSizeForm CreateForm(float currentWidth, float currentHeight) =>
        new(currentWidth, currentHeight);
}
