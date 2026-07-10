using System;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Dialogs;

public class PreferencesDialog : Form
{
	private readonly string _originalLanguage;
	private readonly string _originalTheme;
	private bool _isLoading = true;
	public bool ThemeChanged { get; private set; }
	public bool LanguageChanged { get; private set; }
	public event Action<string> LiveLanguageChanged;
	public event Action<string> LiveThemeChanged;
	private ComboBox cmbLanguage;
	private ComboBox cmbTheme;
	private ComboBox cmbDbType;
	private ComboBox cmbLineStyle;
	private NumericUpDown numRecentMax;
	private CheckBox chkShowGrid;
	private CheckBox chkSnapToGrid;
	private NumericUpDown numSnapInterval;

	public PreferencesDialog()
	{
		_isLoading = true;
		var prefs = AppSettings.GetPreferences();
		_originalLanguage = prefs.Language;
		_originalTheme = prefs.Theme;
		Build();
		LoadValues(prefs);
		_isLoading = false;
		ModernTheme.ApplyThemeToForm(this);
	}

	private void Build()
	{
		Text = L.S("SettingsTitle");
		FormBorderStyle = FormBorderStyle.FixedDialog;
		MaximizeBox = false;
		MinimizeBox = false;
		StartPosition = FormStartPosition.CenterParent;
		Font = new Font("맑은 고딕", 9F);

		int y = 12;

		// --- Appearance (Language + Theme) ---
		var grpLang = MakeGroup(L.S("SettingsGroupAppearance"), ref y, 86);
		MakeLabel(grpLang, L.S("SettingsLabelLanguage"), 10, 24);
		cmbLanguage = MakeCombo(grpLang, new[] { "한국어", "English" }, 150, 21);
		cmbLanguage.SelectedIndexChanged += (_, _) =>
		{
			if (_isLoading) return;
			LiveLanguageChanged?.Invoke(cmbLanguage.SelectedIndex == 1 ? "en" : "ko");
		};
		MakeLabel(grpLang, L.S("SettingsLabelTheme"), 10, 57);
		cmbTheme = MakeCombo(grpLang, new[] { L.S("SettingsThemeLight"), L.S("SettingsThemeDark") }, 150, 54);
		cmbTheme.SelectedIndexChanged += (_, _) =>
		{
			if (_isLoading) return;
			LiveThemeChanged?.Invoke(cmbTheme.SelectedIndex == 1 ? "dark" : "light");
			ModernTheme.ApplyThemeToForm(this);
		};

		// --- Defaults ---
		var grpDef = MakeGroup(L.S("SettingsGroupDefaults"), ref y, 98);
		MakeLabel(grpDef, L.S("SettingsLabelDbType"), 10, 24);
		cmbDbType = MakeCombo(grpDef,
			new[] { "PostgreSQL", "MySQL", "MariaDB", "SQLite", "SQL Server", "Vector DB" }, 150, 21);
		MakeLabel(grpDef, L.S("SettingsLabelLineStyle"), 10, 57);
		cmbLineStyle = MakeCombo(grpDef,
			new[] { L.S("LineStyleStraight"), L.S("LineStyleCurved"), L.S("LineStyleOrthogonal") }, 150, 54);

		// --- Files ---
		var grpFiles = MakeGroup(L.S("SettingsGroupFiles"), ref y, 60);
		MakeLabel(grpFiles, L.S("SettingsLabelRecentMax"), 10, 24, width: 150);
		numRecentMax = new NumericUpDown
		{
			Location = new Point(164, 21),
			Size = new Size(60, 22),
			Minimum = 1,
			Maximum = 50,
		};
		grpFiles.Controls.Add(numRecentMax);

		// --- Canvas ---
		var grpCanvas = MakeGroup(L.S("SettingsGroupCanvas"), ref y, 108);
		chkShowGrid = new CheckBox
		{
			Text = L.S("SettingsShowGrid"),
			Location = new Point(10, 22),
			AutoSize = true,
		};
		grpCanvas.Controls.Add(chkShowGrid);
		chkSnapToGrid = new CheckBox
		{
			Text = L.S("SettingsSnapToGrid"),
			Location = new Point(10, 50),
			AutoSize = true,
		};
		grpCanvas.Controls.Add(chkSnapToGrid);
		MakeLabel(grpCanvas, L.S("SettingsLabelSnapInterval"), 10, 80, width: 150);
		numSnapInterval = new NumericUpDown
		{
			Location = new Point(164, 77),
			Size = new Size(60, 22),
			Minimum = 5,
			Maximum = 100,
		};
		grpCanvas.Controls.Add(numSnapInterval);
		MakeLabel(grpCanvas, "px", 228, 80, width: 30);

		// --- Buttons ---
		int btnY = y + 10;
		var btnOk = new Button
		{
			Text = L.S("SettingsBtnOk"),
			DialogResult = DialogResult.OK,
			Location = new Point(208, btnY),
			Size = new Size(88, 30),
		};
		btnOk.Click += BtnOk_Click;
		ModernTheme.StyleDialogButton(btnOk, "Ok");
		Controls.Add(btnOk);

		var btnCancel = new Button
		{
			Text = L.S("SettingsBtnCancel"),
			DialogResult = DialogResult.Cancel,
			Location = new Point(304, btnY),
			Size = new Size(88, 30),
		};
		ModernTheme.StyleDialogButton(btnCancel, "Cancel");
		Controls.Add(btnCancel);

		ClientSize = new Size(400, btnY + 48);
		AcceptButton = btnOk;
		CancelButton = btnCancel;
	}

	private GroupBox MakeGroup(string title, ref int y, int height)
	{
		var grp = new GroupBox
		{
			Text = title,
			Location = new Point(12, y),
			Size = new Size(376, height),
		};
		Controls.Add(grp);
		y += height + 8;
		return grp;
	}

	private static void MakeLabel(Control parent, string text, int x, int y, int width = 136)
	{
		parent.Controls.Add(new Label
		{
			Text = text,
			Location = new Point(x, y + 3),
			Size = new Size(width, 18),
			AutoSize = false,
		});
	}

	private static ComboBox MakeCombo(Control parent, string[] items, int x, int y)
	{
		var cmb = new ComboBox
		{
			DropDownStyle = ComboBoxStyle.DropDownList,
			Location = new Point(x, y),
			Size = new Size(210, 22),
		};
		cmb.Items.AddRange(items);
		parent.Controls.Add(cmb);
		return cmb;
	}

	private void LoadValues(AppSettings.UserPreferences prefs)
	{
		cmbLanguage.SelectedIndex = prefs.Language == "en" ? 1 : 0;
		cmbTheme.SelectedIndex = prefs.Theme == "dark" ? 1 : 0;
		cmbDbType.SelectedIndex = prefs.DefaultDbType switch
		{
			DbTargetType.PostgreSQL => 0,
			DbTargetType.MySQL => 1,
			DbTargetType.MariaDB => 2,
			DbTargetType.SQLite => 3,
			DbTargetType.SqlServer => 4,
			DbTargetType.VectorDb => 5,
			_ => 3,
		};
		cmbLineStyle.SelectedIndex = prefs.DefaultLineStyle switch
		{
			RelationshipLineStyle.Curved => 1,
			RelationshipLineStyle.Orthogonal => 2,
			_ => 0,
		};
		numRecentMax.Value = Math.Clamp(prefs.RecentFilesMaxCount, 1, 50);
		chkShowGrid.Checked = prefs.ShowGrid;
		chkSnapToGrid.Checked = prefs.SnapToGrid;
		numSnapInterval.Value = Math.Clamp(prefs.SnapInterval, 5, 100);
	}

	private void BtnOk_Click(object sender, EventArgs e)
	{
		var prefs = new AppSettings.UserPreferences
		{
			Language = cmbLanguage.SelectedIndex == 1 ? "en" : "ko",
			Theme = cmbTheme.SelectedIndex == 1 ? "dark" : "light",
			DefaultDbType = cmbDbType.SelectedIndex switch
			{
				0 => DbTargetType.PostgreSQL,
				1 => DbTargetType.MySQL,
				2 => DbTargetType.MariaDB,
				3 => DbTargetType.SQLite,
				4 => DbTargetType.SqlServer,
				5 => DbTargetType.VectorDb,
				_ => DbTargetType.SQLite,
			},
			DefaultLineStyle = cmbLineStyle.SelectedIndex switch
			{
				1 => RelationshipLineStyle.Curved,
				2 => RelationshipLineStyle.Orthogonal,
				_ => RelationshipLineStyle.Straight,
			},
			RecentFilesMaxCount = (int)numRecentMax.Value,
			ShowGrid = chkShowGrid.Checked,
			SnapToGrid = chkSnapToGrid.Checked,
			SnapInterval = (int)numSnapInterval.Value,
		};
		AppSettings.SavePreferences(prefs);

		ThemeChanged = prefs.Theme != _originalTheme;
		LanguageChanged = prefs.Language != _originalLanguage;
	}
}
