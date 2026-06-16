namespace MyAgileBoardWinV10.Forms;

public partial class ExportImageFormatDialog : Form
{
    public Services.ImageExportFormat SelectedFormat =>
        (Services.ImageExportFormat)(cmbFormat.SelectedItem ?? Services.ImageExportFormat.Png);

    public ExportImageFormatDialog()
    {
        InitializeComponent();
        cmbFormat.Items.AddRange(
        [
            Services.ImageExportFormat.Png,
            Services.ImageExportFormat.Jpeg,
            Services.ImageExportFormat.Bmp,
            Services.ImageExportFormat.Gif,
            Services.ImageExportFormat.Tiff
        ]);
        cmbFormat.SelectedIndex = 0;
    }
}
