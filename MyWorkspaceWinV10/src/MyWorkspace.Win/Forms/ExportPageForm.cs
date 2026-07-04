namespace MyWorkspace.Win.Forms;

internal enum PageExportFormat
{
    Markdown,
    Word,
    Pdf
}

internal sealed class ExportPageForm : Form
{
    private readonly string _titleKey;
    private readonly string _promptKey;
    private readonly RadioButton _rbMarkdown = new() { AutoSize = true };
    private readonly RadioButton _rbWord = new() { AutoSize = true };
    private readonly RadioButton _rbPdf = new() { AutoSize = true };
    private readonly Button _btnOk = new ThemedDialogButton() { Name = "btnOk", DialogResult = DialogResult.OK };
    private readonly Button _btnCancel = new ThemedDialogButton() { Name = "btnCancel", DialogResult = DialogResult.Cancel };

    public ExportPageForm() : this(K.ExportPageTitle, K.ExportPagePrompt)
    {
    }

    public ExportPageForm(string titleKey, string promptKey)
    {
        _titleKey = titleKey;
        _promptKey = promptKey;

        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(320, 196);
        AcceptButton = _btnOk;
        CancelButton = _btnCancel;

        _rbMarkdown.Checked = true;

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            Padding = new Padding(16, 12, 16, 12)
        };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));

        layout.Controls.Add(new Label
        {
            Text = Localization.Get(_promptKey),
            AutoSize = true,
            Margin = new Padding(0, 0, 0, 8)
        }, 0, 0);
        layout.Controls.Add(_rbMarkdown, 0, 1);
        layout.Controls.Add(_rbWord, 0, 2);
        layout.Controls.Add(_rbPdf, 0, 3);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(0, 8, 0, 0)
        };
        buttons.Controls.Add(_btnCancel);
        buttons.Controls.Add(_btnOk);
        _btnOk.Margin = new Padding(6, 0, 0, 0);
        _btnCancel.Margin = new Padding(6, 0, 0, 0);
        layout.Controls.Add(buttons, 0, 4);

        Controls.Add(layout);
        ApplyLocalization();
        AppTheme.ApplyStandardDialog(this);
    }

    public PageExportFormat SelectedFormat =>
        _rbWord.Checked ? PageExportFormat.Word :
        _rbPdf.Checked ? PageExportFormat.Pdf :
        PageExportFormat.Markdown;

    private void ApplyLocalization()
    {
        Text = Localization.Get(_titleKey);
        _rbMarkdown.Text = Localization.Get(K.ExportFormatMarkdown);
        _rbWord.Text = Localization.Get(K.ExportFormatWord);
        _rbPdf.Text = Localization.Get(K.ExportFormatPdf);
        _btnOk.Text = Localization.Get(K.ButtonOk);
        _btnCancel.Text = Localization.Get(K.ButtonCancel);
    }
}
