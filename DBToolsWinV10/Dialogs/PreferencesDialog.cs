using System;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;
using DBToolsWinV10.Controls;
using DBToolsWinV10.Analysis;
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
	public event Action<bool, bool, int> LiveGridSettingsChanged;
	private ComboBox cmbLanguage;
	private ComboBox cmbTheme;
	private ComboBox cmbDbType;
	private ComboBox cmbLineStyle;
	private ThemedCheckBox chkNormNf1;
	private ThemedCheckBox chkNormNf2;
	private ThemedCheckBox chkNormNf3;
	private ThemedCheckBox chkNormBcnf;
	private ThemedCheckBox chkNormNf4;
	private ThemedCheckBox chkNormNf5;
	private NumericUpDown numRecentMax;
	private ThemedCheckBox chkShowGrid;
	private ThemedCheckBox chkSnapToGrid;
	private NumericUpDown numSnapInterval;
	private ThemedDialogButton _btnOk;
	private ThemedDialogButton _btnCancel;
	private ThemedGroupBox _grpAppearance;
	private ThemedGroupBox _grpDefaults;
	private ThemedGroupBox _grpNorm;
	private ThemedGroupBox _grpFiles;
	private ThemedGroupBox _grpCanvas;
	private Label _lblLanguage;
	private Label _lblTheme;
	private Label _lblDbType;
	private Label _lblLineStyle;
	private Label _lblNormLevel;
	private Label _lblRecentMax;
	private Label _lblSnapInterval;

	public PreferencesDialog()
	{
		_isLoading = true;
		var prefs = AppSettings.GetPreferences();
		_originalLanguage = prefs.Language;
		_originalTheme = prefs.Theme;
		Build();
		LoadValues(prefs);
		_isLoading = false;
		ApplyDialogTheme();
	}

	private void Build()
	{
		Text = L.S("SettingsTitle");
		FormBorderStyle = FormBorderStyle.FixedDialog;
		MaximizeBox = false;
		MinimizeBox = false;
		StartPosition = FormStartPosition.CenterParent;
		Font = ModernTheme.UiFont;

		int y = 12;

		// --- Appearance (Language + Theme) ---
		_grpAppearance = MakeGroup(L.S("SettingsGroupAppearance"), ref y, 86);
		_lblLanguage = MakeLabel(_grpAppearance, L.S("SettingsLabelLanguage"), 10, 24);
		cmbLanguage = MakeCombo(_grpAppearance, new[] { "한국어", "English" }, 150, 21);
		cmbLanguage.SelectedIndexChanged += (_, _) =>
		{
			if (_isLoading) return;
			LiveLanguageChanged?.Invoke(cmbLanguage.SelectedIndex == 1 ? "en" : "ko");
			ApplyDialogLocalization();
		};
		_lblTheme = MakeLabel(_grpAppearance, L.S("SettingsLabelTheme"), 10, 57);
		cmbTheme = MakeCombo(_grpAppearance, new[] { L.S("SettingsThemeLight"), L.S("SettingsThemeDark") }, 150, 54);
		cmbTheme.SelectedIndexChanged += (_, _) =>
		{
			if (_isLoading) return;
			string theme = cmbTheme.SelectedIndex == 1 ? "dark" : "light";
			ModernTheme.SetTheme(theme == "dark" ? ModernTheme.ThemeKind.Dark : ModernTheme.ThemeKind.Light);
			LiveThemeChanged?.Invoke(theme);
			ApplyDialogTheme();
		};

		// --- Defaults ---
		_grpDefaults = MakeGroup(L.S("SettingsGroupDefaults"), ref y, 98);
		_lblDbType = MakeLabel(_grpDefaults, L.S("SettingsLabelDbType"), 10, 24);
		cmbDbType = MakeCombo(_grpDefaults,
			new[] { "PostgreSQL", "MySQL", "MariaDB", "SQLite", "SQL Server", "Vector DB" }, 150, 21);
		_lblLineStyle = MakeLabel(_grpDefaults, L.S("SettingsLabelLineStyle"), 10, 57);
		cmbLineStyle = MakeCombo(_grpDefaults,
			new[] { L.S("LineStyleStraight"), L.S("LineStyleCurved"), L.S("LineStyleOrthogonal") }, 150, 54);

		// --- Normalization ---
		_grpNorm = MakeGroup(L.S("SettingsGroupNormalization"), ref y, 86);
		_lblNormLevel = MakeLabel(_grpNorm, L.S("SettingsLabelNormLevel"), 10, 22);
		chkNormNf1 = MakeNormCheck(_grpNorm, "1NF", 10, 44);
		chkNormNf2 = MakeNormCheck(_grpNorm, "2NF", 72, 44);
		chkNormNf3 = MakeNormCheck(_grpNorm, "3NF", 134, 44);
		chkNormBcnf = MakeNormCheck(_grpNorm, "BCNF", 196, 44);
		chkNormNf4 = MakeNormCheck(_grpNorm, "4NF", 268, 44);
		chkNormNf5 = MakeNormCheck(_grpNorm, "5NF", 330, 44);

		// --- Files ---
		_grpFiles = MakeGroup(L.S("SettingsGroupFiles"), ref y, 60);
		_lblRecentMax = MakeLabel(_grpFiles, L.S("SettingsLabelRecentMax"), 10, 24, width: 150);
		numRecentMax = new NumericUpDown
		{
			Location = new Point(164, 21),
			Size = new Size(60, 22),
			Minimum = 1,
			Maximum = 50,
		};
		_grpFiles.Controls.Add(numRecentMax);

		// --- Canvas ---
		_grpCanvas = MakeGroup(L.S("SettingsGroupCanvas"), ref y, 108);
		chkShowGrid = new ThemedCheckBox
		{
			Text = L.S("SettingsShowGrid"),
			Location = new Point(10, 22),
			AutoSize = true,
		};
		chkShowGrid.CheckedChanged += (_, _) => NotifyGridSettingsChanged();
		_grpCanvas.Controls.Add(chkShowGrid);
		chkSnapToGrid = new ThemedCheckBox
		{
			Text = L.S("SettingsSnapToGrid"),
			Location = new Point(10, 50),
			AutoSize = true,
		};
		chkSnapToGrid.CheckedChanged += (_, _) => NotifyGridSettingsChanged();
		_grpCanvas.Controls.Add(chkSnapToGrid);
		_lblSnapInterval = MakeLabel(_grpCanvas, L.S("SettingsLabelSnapInterval"), 10, 80, width: 150);
		numSnapInterval = new NumericUpDown
		{
			Location = new Point(164, 77),
			Size = new Size(60, 22),
			Minimum = 5,
			Maximum = 100,
		};
		numSnapInterval.ValueChanged += (_, _) => NotifyGridSettingsChanged();
		_grpCanvas.Controls.Add(numSnapInterval);
		MakeLabel(_grpCanvas, "px", 228, 80, width: 30);

		// --- Buttons ---
		int btnY = y + 10;
		_btnOk = new ThemedDialogButton
		{
			Text = L.S("SettingsBtnOk"),
			DialogResult = DialogResult.OK,
			Location = new Point(208, btnY),
			Size = new Size(88, 30),
		};
		_btnOk.Click += BtnOk_Click;
		Controls.Add(_btnOk);

		_btnCancel = new ThemedDialogButton
		{
			Text = L.S("SettingsBtnCancel"),
			DialogResult = DialogResult.Cancel,
			Location = new Point(304, btnY),
			Size = new Size(88, 30),
		};
		Controls.Add(_btnCancel);

		ClientSize = new Size(400, btnY + 48);
		AcceptButton = _btnOk;
		CancelButton = _btnCancel;
	}

	private void NotifyGridSettingsChanged()
	{
		if (_isLoading)
			return;

		LiveGridSettingsChanged?.Invoke(
			chkShowGrid.Checked,
			chkSnapToGrid.Checked,
			(int)numSnapInterval.Value);
	}

	private void ApplyDialogLocalization()
	{
		Text = L.S("SettingsTitle");
		_grpAppearance.Text = L.S("SettingsGroupAppearance");
		_lblLanguage.Text = L.S("SettingsLabelLanguage");
		_lblTheme.Text = L.S("SettingsLabelTheme");
		RefreshTranslatableCombo(cmbTheme,
			new[] { L.S("SettingsThemeLight"), L.S("SettingsThemeDark") },
			cmbTheme.SelectedIndex);

		_grpDefaults.Text = L.S("SettingsGroupDefaults");
		_lblDbType.Text = L.S("SettingsLabelDbType");
		_lblLineStyle.Text = L.S("SettingsLabelLineStyle");
		RefreshTranslatableCombo(cmbLineStyle,
			new[] { L.S("LineStyleStraight"), L.S("LineStyleCurved"), L.S("LineStyleOrthogonal") },
			cmbLineStyle.SelectedIndex);

		_grpNorm.Text = L.S("SettingsGroupNormalization");
		_lblNormLevel.Text = L.S("SettingsLabelNormLevel");

		_grpFiles.Text = L.S("SettingsGroupFiles");
		_lblRecentMax.Text = L.S("SettingsLabelRecentMax");

		_grpCanvas.Text = L.S("SettingsGroupCanvas");
		chkShowGrid.Text = L.S("SettingsShowGrid");
		chkSnapToGrid.Text = L.S("SettingsSnapToGrid");
		_lblSnapInterval.Text = L.S("SettingsLabelSnapInterval");

		_btnOk.Text = L.S("SettingsBtnOk");
		_btnCancel.Text = L.S("SettingsBtnCancel");
		RefreshDialogButtons();
		Invalidate(true);
	}

	private void RefreshTranslatableCombo(ComboBox cmb, string[] items, int preserveIndex)
	{
		_isLoading = true;
		try
		{
			cmb.Items.Clear();
			cmb.Items.AddRange(items);
			if (items.Length > 0)
				cmb.SelectedIndex = Math.Clamp(preserveIndex, 0, items.Length - 1);
		}
		finally
		{
			_isLoading = false;
		}
	}

	private void ApplyDialogTheme()
	{
		ModernTheme.ApplyThemeToForm(this);
		RefreshDialogButtons();
	}

	private void RefreshDialogButtons()
	{
		if (IsDisposed)
			return;

		if (_btnOk != null)
			ModernTheme.StyleDialogButton(_btnOk, "Ok");
		if (_btnCancel != null)
			ModernTheme.StyleDialogButton(_btnCancel, "Cancel");
	}

	private ThemedCheckBox MakeNormCheck(Control parent, string text, int x, int y)
	{
		var chk = new ThemedCheckBox
		{
			Text = text,
			Location = new Point(x, y),
			AutoSize = true,
		};
		chk.CheckedChanged += NormCheck_CheckedChanged;
		parent.Controls.Add(chk);
		return chk;
	}

	private void NormCheck_CheckedChanged(object sender, EventArgs e)
	{
		if (_isLoading)
			return;

		if (GetSelectedNormalizationLevels() != NormalizationLevels.None)
			return;

		_isLoading = true;
		try
		{
			((ThemedCheckBox)sender).Checked = true;
		}
		finally
		{
			_isLoading = false;
		}
	}

	private NormalizationLevels GetSelectedNormalizationLevels()
	{
		var levels = NormalizationLevels.None;
		if (chkNormNf1.Checked) levels |= NormalizationLevels.NF1;
		if (chkNormNf2.Checked) levels |= NormalizationLevels.NF2;
		if (chkNormNf3.Checked) levels |= NormalizationLevels.NF3;
		if (chkNormBcnf.Checked) levels |= NormalizationLevels.BCNF;
		if (chkNormNf4.Checked) levels |= NormalizationLevels.NF4;
		if (chkNormNf5.Checked) levels |= NormalizationLevels.NF5;
		return levels;
	}

	private void SetNormalizationLevels(NormalizationLevels levels)
	{
		_isLoading = true;
		try
		{
			chkNormNf1.Checked = levels.HasFlag(NormalizationLevels.NF1);
			chkNormNf2.Checked = levels.HasFlag(NormalizationLevels.NF2);
			chkNormNf3.Checked = levels.HasFlag(NormalizationLevels.NF3);
			chkNormBcnf.Checked = levels.HasFlag(NormalizationLevels.BCNF);
			chkNormNf4.Checked = levels.HasFlag(NormalizationLevels.NF4);
			chkNormNf5.Checked = levels.HasFlag(NormalizationLevels.NF5);
		}
		finally
		{
			_isLoading = false;
		}
	}

	private ThemedGroupBox MakeGroup(string title, ref int y, int height)
	{
		var grp = new ThemedGroupBox
		{
			Text = title,
			Location = new Point(12, y),
			Size = new Size(376, height),
		};
		Controls.Add(grp);
		y += height + 8;
		return grp;
	}

	private static Label MakeLabel(Control parent, string text, int x, int y, int width = 136)
	{
		var lbl = new Label
		{
			Text = text,
			Location = new Point(x, y + 3),
			Size = new Size(width, 18),
			AutoSize = false,
		};
		parent.Controls.Add(lbl);
		return lbl;
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
		SetNormalizationLevels(prefs.NormalizationLevels);
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
			NormalizationLevels = GetSelectedNormalizationLevels(),
		};
		AppSettings.SavePreferences(prefs);

		ThemeChanged = prefs.Theme != _originalTheme;
		LanguageChanged = prefs.Language != _originalLanguage;
	}
}
