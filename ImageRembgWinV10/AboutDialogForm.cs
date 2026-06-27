using ImageRembgWinV10.Localization;

namespace ImageRembgWinV10;

internal sealed class AboutDialogForm : Form
{
    public AboutDialogForm()
    {
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(420, 220);
        Padding = new Padding(12);

        var iconPicture = new PictureBox
        {
            Location = new Point(16, 16),
            Size = new Size(48, 48),
            SizeMode = PictureBoxSizeMode.Zoom
        };

        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico");
        if (File.Exists(iconPath))
        {
            iconPicture.Image = new Icon(iconPath, 48, 48).ToBitmap();
        }

        var lblProduct = new Label
        {
            AutoSize = false,
            Location = new Point(80, 16),
            Size = new Size(320, 24),
            Font = new Font(Font.FontFamily, 11f, FontStyle.Bold)
        };

        var lblVersion = new Label
        {
            AutoSize = false,
            Location = new Point(80, 42),
            Size = new Size(320, 20),
            ForeColor = SystemColors.GrayText
        };

        var lblCopyright = new Label
        {
            AutoSize = false,
            Location = new Point(16, 88),
            Size = new Size(388, 48),
            TextAlign = ContentAlignment.TopLeft
        };

        var lblAuthor = new Label
        {
            AutoSize = false,
            Location = new Point(16, 140),
            Size = new Size(388, 20),
            Text = AboutInfo.AuthorContact
        };

        var btnOk = new Button
        {
            DialogResult = DialogResult.OK,
            Size = new Size(80, 28),
            Location = new Point(324, 176)
        };
        btnOk.Click += (_, _) => Close();

        AcceptButton = btnOk;
        Controls.AddRange([iconPicture, lblProduct, lblVersion, lblCopyright, lblAuthor, btnOk]);

        Text = L.Get("About.Title");
        lblProduct.Text = AboutInfo.ProductName;
        lblVersion.Text = L.F("About.Version", AboutInfo.Version);
        lblCopyright.Text = AboutInfo.Copyright;
        btnOk.Text = L.Get("ErrorDialog.Ok");
    }

    public static void ShowAbout(IWin32Window? owner)
    {
        using var dialog = new AboutDialogForm();
        dialog.ShowDialog(owner);
    }
}
