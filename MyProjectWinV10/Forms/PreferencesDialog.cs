using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public sealed class PreferencesDialog : Form
    {
        private readonly ComboBox _language = new()
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Dock = DockStyle.Fill
        };

        public PreferencesDialog()
        {
            Build();
            LoadValues();
            ApplyLocalization();
            AppLocalizer.LanguageChanged += OnLanguageChanged;
            FormClosed += (_, _) => AppLocalizer.LanguageChanged -= OnLanguageChanged;
        }

        private void OnLanguageChanged(object? sender, EventArgs e) => ApplyLocalization();

        private void Build()
        {
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(420, 160);
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(16),
                ColumnCount = 2,
                RowCount = 2
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            var lblLanguage = new Label
            {
                TextAlign = ContentAlignment.MiddleRight,
                Dock = DockStyle.Fill,
                ForeColor = AppTheme.TextSecondary
            };
            lblLanguage.Name = "lblLanguage";

            _language.Items.Add(AppLanguage.Korean);
            _language.Items.Add(AppLanguage.English);
            _language.Format += (_, e) =>
            {
                if (e.ListItem is AppLanguage lang)
                    e.Value = lang.GetDisplayName(AppLocalizer.CurrentLanguage);
            };

            var hint = new Label
            {
                Dock = DockStyle.Fill,
                ForeColor = AppTheme.TextSecondary,
                AutoSize = false,
                Padding = new Padding(0, 8, 0, 0)
            };
            hint.Name = "lblHint";

            layout.Controls.Add(lblLanguage, 0, 0);
            layout.Controls.Add(_language, 1, 0);
            layout.SetColumnSpan(hint, 2);
            layout.Controls.Add(hint, 0, 1);

            var btnOk = new Button
            {
                DialogResult = DialogResult.None,
                Size = new Size(80, 28),
                FlatStyle = FlatStyle.Flat,
                BackColor = AppTheme.Accent,
                ForeColor = Color.White
            };
            btnOk.Name = "btnOk";
            btnOk.FlatAppearance.BorderColor = AppTheme.AccentDark;
            btnOk.Click += (_, _) =>
            {
                if (TryApply())
                    DialogResult = DialogResult.OK;
            };

            var btnCancel = new Button
            {
                DialogResult = DialogResult.Cancel,
                Size = new Size(80, 28)
            };
            btnCancel.Name = "btnCancel";

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 44,
                FlowDirection = FlowDirection.RightToLeft,
                Padding = new Padding(8)
            };
            buttons.Controls.AddRange(new Control[] { btnCancel, btnOk });

            Controls.Add(layout);
            Controls.Add(buttons);
            AcceptButton = btnOk;
            CancelButton = btnCancel;
        }

        private void LoadValues()
        {
            _language.SelectedItem = AppSettings.UiLanguage;
        }

        private void ApplyLocalization()
        {
            Text = AppLocalizer.Get("Prefs.Title");
            Controls.Find("lblLanguage", true)[0].Text = AppLocalizer.Get("Prefs.Language");
            Controls.Find("lblHint", true)[0].Text = AppLocalizer.Get("Prefs.LanguageHint");
            Controls.Find("btnOk", true)[0].Text = AppLocalizer.Get("Common.OK");
            Controls.Find("btnCancel", true)[0].Text = AppLocalizer.Get("Common.Cancel");
            _language.Refresh();
        }

        private bool TryApply()
        {
            if (_language.SelectedItem is not AppLanguage selected)
                selected = AppLanguage.Korean;

            AppSettings.SetUiLanguage(selected);
            return true;
        }
    }
}
