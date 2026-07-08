using System.Drawing.Imaging;

namespace DCMViewer;

internal sealed class BatchConvertFormatForm : Form
{
    public ImageFormat SelectedFormat { get; private set; } = ImageFormat.Png;

    public string SelectedExtension { get; private set; } = "png";

    public string SelectedLabel { get; private set; } = "PNG";

    private readonly ListBox _formatList;

    private static readonly (string Label, ImageFormat Format, string Extension)[] Formats =
    [
        ("PNG", ImageFormat.Png, "png"),
        ("JPEG", ImageFormat.Jpeg, "jpg"),
        ("BMP", ImageFormat.Bmp, "bmp"),
        ("TIFF", ImageFormat.Tiff, "tiff"),
        ("GIF", ImageFormat.Gif, "gif"),
    ];

    public BatchConvertFormatForm()
    {
        Text = "일괄 변환 형식 선택";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ShowInTaskbar = false;
        ClientSize = new Size(320, 280);
        Font = new Font("Segoe UI", 9F);

        var description = new Label
        {
            AutoSize = false,
            Dock = DockStyle.Top,
            Height = 40,
            Padding = new Padding(12, 12, 12, 0),
            Text = "변환할 이미지 형식을 선택하세요.",
        };

        _formatList = new ListBox
        {
            Dock = DockStyle.Fill,
            IntegralHeight = false,
            ItemHeight = 22,
        };
        foreach (var format in Formats)
            _formatList.Items.Add(format.Label);
        _formatList.SelectedIndex = 0;
        _formatList.DoubleClick += (_, _) => ConfirmSelection();

        var listPanel = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12, 8, 12, 8),
        };
        listPanel.Controls.Add(_formatList);

        var okButton = new Button
        {
            AutoSize = true,
            Text = "확인",
            TabIndex = 1,
        };
        okButton.Click += (_, _) => ConfirmSelection();

        var cancelButton = new Button
        {
            AutoSize = true,
            DialogResult = DialogResult.Cancel,
            Text = "취소",
            TabIndex = 2,
        };

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.RightToLeft,
            Height = 48,
            Padding = new Padding(12, 8, 12, 12),
            WrapContents = false,
        };
        buttonPanel.Controls.Add(cancelButton);
        buttonPanel.Controls.Add(okButton);

        Controls.Add(listPanel);
        Controls.Add(buttonPanel);
        Controls.Add(description);

        AcceptButton = okButton;
        CancelButton = cancelButton;
    }

    private void ConfirmSelection()
    {
        if (_formatList.SelectedIndex < 0)
            _formatList.SelectedIndex = 0;

        var selected = Formats[_formatList.SelectedIndex];
        SelectedFormat = selected.Format;
        SelectedExtension = selected.Extension;
        SelectedLabel = selected.Label;
        DialogResult = DialogResult.OK;
        Close();
    }
}
