using ImageRembgWinV10.Localization;
using ImageRembgWinV10.Services;

namespace ImageRembgWinV10;

internal sealed class PreferencesForm : Form
{
    private readonly RadioButton _rbKorean;
    private readonly RadioButton _rbEnglish;

    private PreferencesForm(AppLanguage currentLanguage)
    {
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(320, 168);
        Padding = new Padding(12);

        var lblLanguage = new Label
        {
            AutoSize = false,
            Location = new Point(16, 16),
            Size = new Size(280, 20),
        };

        _rbKorean = new RadioButton
        {
            Location = new Point(28, 44),
            Size = new Size(260, 24),
            Checked = currentLanguage == AppLanguage.Korean,
        };

        _rbEnglish = new RadioButton
        {
            Location = new Point(28, 70),
            Size = new Size(260, 24),
            Checked = currentLanguage == AppLanguage.English,
        };

        var btnOk = new Button
        {
            DialogResult = DialogResult.OK,
            Size = new Size(84, 28),
            Location = new Point(124, 124),
        };

        var btnCancel = new Button
        {
            DialogResult = DialogResult.Cancel,
            Size = new Size(84, 28),
            Location = new Point(216, 124),
        };

        AcceptButton = btnOk;
        CancelButton = btnCancel;

        Controls.AddRange([lblLanguage, _rbKorean, _rbEnglish, btnOk, btnCancel]);

        Text = L.Get("Preferences.Title");
        lblLanguage.Text = L.Get("Preferences.Language");
        _rbKorean.Text = L.Get("Menu.LanguageKorean");
        _rbEnglish.Text = L.Get("Menu.LanguageEnglish");
        btnOk.Text = L.Get("ErrorDialog.Ok");
        btnCancel.Text = L.Get("Common.Cancel");
    }

    private AppLanguage SelectedLanguage => _rbKorean.Checked ? AppLanguage.Korean : AppLanguage.English;

    public static AppLanguage? ShowPreferences(IWin32Window? owner, AppLanguage currentLanguage)
    {
        using var dialog = new PreferencesForm(currentLanguage);
        return dialog.ShowDialog(owner) == DialogResult.OK ? dialog.SelectedLanguage : null;
    }
}
