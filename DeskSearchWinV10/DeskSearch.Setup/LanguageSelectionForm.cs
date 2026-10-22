namespace DeskSearch.Setup;

internal sealed class LanguageSelectionForm : Form
{
    private readonly RadioButton _koreanRadio;
    private readonly RadioButton _englishRadio;

    public InstallLanguage SelectedLanguage { get; private set; }

    public LanguageSelectionForm()
    {
        Text = "DeskSearch Setup";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(420, 220);
        Font = new Font("Segoe UI", 9F);
        ShowInTaskbar = true;

        var title = new Label
        {
            AutoSize = false,
            Location = new Point(24, 20),
            Size = new Size(370, 44),
            Text = "Select installation language\n설치 언어를 선택하세요",
            Font = new Font("Segoe UI", 11F, FontStyle.Bold)
        };

        _koreanRadio = new RadioButton
        {
            AutoSize = true,
            Location = new Point(36, 78),
            Text = "한국어 (Korean)",
            TabIndex = 0
        };

        _englishRadio = new RadioButton
        {
            AutoSize = true,
            Location = new Point(36, 110),
            Text = "English (영어)",
            TabIndex = 1
        };

        var ok = new Button
        {
            Text = "OK / 확인",
            DialogResult = DialogResult.OK,
            Location = new Point(214, 170),
            Size = new Size(90, 28),
            TabIndex = 2
        };
        ok.Click += (_, _) =>
        {
            SelectedLanguage = _englishRadio.Checked
                ? InstallLanguage.English
                : InstallLanguage.Korean;
        };

        var cancel = new Button
        {
            Text = "Cancel / 취소",
            DialogResult = DialogResult.Cancel,
            Location = new Point(314, 170),
            Size = new Size(90, 28),
            TabIndex = 3
        };

        AcceptButton = ok;
        CancelButton = cancel;

        Controls.Add(title);
        Controls.Add(_koreanRadio);
        Controls.Add(_englishRadio);
        Controls.Add(ok);
        Controls.Add(cancel);

        SelectDefaultLanguage();
    }

    private void SelectDefaultLanguage()
    {
        var ui = System.Globalization.CultureInfo.CurrentUICulture;
        var preferKorean = ui.TwoLetterISOLanguageName.Equals("ko", StringComparison.OrdinalIgnoreCase)
            || ui.Name.StartsWith("ko", StringComparison.OrdinalIgnoreCase);

        _koreanRadio.Checked = preferKorean;
        _englishRadio.Checked = !preferKorean;
        SelectedLanguage = preferKorean ? InstallLanguage.Korean : InstallLanguage.English;
    }
}
