namespace MemoPadV10;

/// <summary>
/// 폰트·색·서식 설정 대화상자. UI는 EditorSettingsForm.Designer.cs에서 편집합니다.
/// </summary>
public partial class EditorSettingsForm : Form
{
    private RichTextBox _editor = null!;
    private Form _mainForm = null!;

    /// <summary>
    /// 색을 고를 때마다(팔레트·색 대화상자·기본값) 선택한 배경색을 전달합니다.
    /// 설정창을 연 창이 이를 구독해 모든 창(및 다른 프로세스)에 실시간 반영합니다.
    /// </summary>
    public event Action<Color>? PreviewColorChanged;
    private string _snapshotRtf = string.Empty;
    private Color _snapshotFormBack;
    private Color _snapshotEditorBack;
    private Color _snapshotToolbarBack;
    private AppLanguage _snapshotLanguage;

    /// <summary>Visual Studio 디자이너에서 사용합니다.</summary>
    public EditorSettingsForm()
    {
        InitializeComponent();
        ApplyStyleButtonFonts();
    }

    /// <summary>
    /// 간단한 텍스트 기반 아이콘 비트맵을 생성합니다. 재사용 용도로 public으로 노출합니다.
    /// </summary>
    public static Bitmap MakeGlyphIcon(string text, Color foreColor, Color backColor, int size = 16, string fontFamily = "Segoe UI")
    {
        Bitmap bmp = new(size, size, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using Graphics g = Graphics.FromImage(bmp);
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        g.Clear(backColor);
        float fontSize = Math.Max(8f, size * 0.6f);
        // "Segoe UI"는 폴더·문서 같은 보충문자(이모지) 글리프가 없어 두부 박스로 나옵니다.
        // 흑백 글리프를 가진 "Segoe UI Symbol"을 넘기면 foreColor 색으로 그려집니다.
        using Font f = new(fontFamily, fontSize, FontStyle.Bold, GraphicsUnit.Pixel);
        SizeF measured = g.MeasureString(text, f);
        using SolidBrush b = new SolidBrush(foreColor);
        g.DrawString(text, f, b, (size - measured.Width) / 2f, (size - measured.Height) / 2f);
        return bmp;
    }

    public EditorSettingsForm(RichTextBox editor, Form mainForm) : this()
    {
        _editor = editor;
        _mainForm = mainForm;
        _snapshotRtf = editor.Rtf ?? string.Empty;
        _snapshotFormBack = mainForm.BackColor;
        _snapshotEditorBack = editor.BackColor;
        Control[] bars = mainForm.Controls.Find("topBarPanel", true);
        _snapshotToolbarBack = bars.Length > 0 ? bars[0].BackColor : mainForm.BackColor;
        _snapshotLanguage = Loc.Language;

        if (_editor.SelectionLength > 0)
        {
            _radioSelection.Checked = true;
        }
        else
        {
            _radioWhole.Checked = true;
        }

        UpdatePreviews();
        WireEvents();
        PopulateEditorBackPalette();
        InitLanguageUi();
        _autoStartCheck.Checked = AutoStart.IsEnabled();
    }

    private void InitLanguageUi()
    {
        _languageCombo.Items.Clear();
        _languageCombo.Items.Add("한국어");
        _languageCombo.Items.Add("English");
        _languageCombo.SelectedIndex = Loc.Language == AppLanguage.English ? 1 : 0;
        _languageCombo.SelectedIndexChanged += (_, _) =>
        {
            Loc.Language = _languageCombo.SelectedIndex == 1 ? AppLanguage.English : AppLanguage.Korean;
            ApplyLanguage();
        };

        ApplyLanguage();
    }

    /// <summary>현재 언어(Loc.Language)에 맞게 설정 창의 모든 텍스트를 갱신합니다.</summary>
    private void ApplyLanguage()
    {
        Text = Loc.T("settings.title");
        hintLabel.Text = Loc.T("settings.hint");
        scopeGroupBox.Text = Loc.T("settings.scope");
        _radioSelection.Text = Loc.T("settings.scope.selection");
        _radioWhole.Text = Loc.T("settings.scope.whole");
        _btnFont.Text = Loc.T("settings.font");
        styleGroupBox.Text = Loc.T("settings.style");
        btnStyleBold.Text = Loc.T("settings.style.bold");
        btnStyleItalic.Text = Loc.T("settings.style.italic");
        btnStyleUnderline.Text = Loc.T("settings.style.underline");
        btnStyleStrike.Text = Loc.T("settings.style.strike");
        editorBackGroupBox.Text = Loc.T("settings.back");
        _btnEditorBack.Text = Loc.T("settings.back.custom");
        languageGroupBox.Text = Loc.T("settings.language");
        generalGroupBox.Text = Loc.T("settings.general");
        _autoStartCheck.Text = Loc.T("settings.autostart");
        aboutGroupBox.Text = Loc.T("settings.about");
        _aboutAuthorLabel.Text = $"{Loc.T("settings.author")}: SHKWON (knix008@naver.com)";
        _btnDefault.Text = Loc.T("settings.default");
        _btnOk.Text = Loc.T("common.ok");
        _btnCancel.Text = Loc.T("common.cancel");
    }

    /// <summary>
    /// 편집기 배경색으로 선택할 수 있는 파스텔 톤 20색 팔레트를 채웁니다.
    /// 여기서 고를 수 없는 색은 "사용자 지정 색…" 버튼으로 지정합니다.
    /// </summary>
    private void PopulateEditorBackPalette()
    {
        if (this._editorBackPalettePanel == null)
            return;

        string[] hexColors = new[]
        {
            "#FFB3BA","#FFDFBA","#FFFFBA","#BAFFC9","#BAE1FF",
            "#E6B3FF","#B3FFD9","#FFD1DC","#F0E68C","#D8BFD8",
            "#C1E1C1","#F5DEB3","#E0FFFF","#FFE4E1","#E6E6FA",
            "#F0FFF0","#FFF0F5","#FAFAD2","#F5F5DC","#DFFFD6"
        };

        _editorBackPalettePanel.Controls.Clear();
        foreach (string hx in hexColors)
        {
            Color c = ColorTranslator.FromHtml(hx);
            Panel sw = new Panel()
            {
                BackColor = c,
                Size = new Size(24, 24),
                Margin = new Padding(4),
                BorderStyle = BorderStyle.FixedSingle,
                Tag = c,
                Cursor = Cursors.Hand
            };

            sw.Click += (s, e) =>
            {
                Color chosen = (Color)((Control)s!).Tag!;
                ApplyBackColor(chosen);
                UpdatePreviews();
            };

            _editorBackPalettePanel.Controls.Add(sw);
        }
    }

    private void ApplyStyleButtonFonts()
    {
        btnStyleBold.Font = new Font(btnStyleBold.Font, FontStyle.Bold);
        btnStyleItalic.Font = new Font(btnStyleItalic.Font, FontStyle.Italic);
    }

    private void WireEvents()
    {
        _btnDefault.Click += (_, _) => ResetToDefaults();
        _btnFont.Click += (_, _) => ShowFontDialog();
        _btnEditorBack.Click += (_, _) => PickEditorBackColor();
        btnStyleBold.Click += (_, _) => ToggleStyle(FontStyle.Bold);
        btnStyleItalic.Click += (_, _) => ToggleStyle(FontStyle.Italic);
        btnStyleUnderline.Click += (_, _) => ToggleStyle(FontStyle.Underline);
        btnStyleStrike.Click += (_, _) => ToggleStyle(FontStyle.Strikeout);
        _btnOk.Click += (_, _) =>
        {
            EditorSettings.Save(EditorSettings.CaptureFromUi(_editor, _mainForm));
            AutoStart.SetEnabled(_autoStartCheck.Checked);
        };

        FormClosing += EditorSettingsForm_FormClosing;
    }

    private void ResetToDefaults()
    {
        EditorSettings.Data defaults = EditorSettings.LoadDefaults();
        EditorSettings.ApplyToUi(_editor, _mainForm, defaults);
        PreviewColorChanged?.Invoke(Color.FromArgb(defaults.EditorBackColorArgb));
        UpdatePreviews();
    }

    private void ToggleStyle(FontStyle style)
    {
        bool whole = _radioWhole.Checked;
        RichTextFormatting.ToggleFontStyle(_editor, style, whole);
        UpdatePreviews();
    }

    private void EditorSettingsForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (DialogResult != DialogResult.OK)
        {
            try
            {
                _editor.Rtf = _snapshotRtf;
            }
            catch (ArgumentException)
            {
                _editor.Text = string.Empty;
            }

            _mainForm.BackColor = _snapshotFormBack;
            _editor.BackColor = _snapshotEditorBack;
            foreach (Control bar in _mainForm.Controls.Find("topBarPanel", true))
            {
                bar.BackColor = _snapshotToolbarBack;
            }

            Loc.Language = _snapshotLanguage;
        }
    }

    private void UpdatePreviews()
    {
        _previewEditorBack.BackColor = _editor.BackColor;
    }

    private void ShowFontDialog()
    {
        using FontDialog dlg = new();
        dlg.Font = _editor.SelectionFont ?? _editor.Font;
        dlg.Color = _editor.SelectionColor;
        dlg.ShowColor = true;
        dlg.AllowScriptChange = true;
        dlg.ShowEffects = true;
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        bool whole = _radioWhole.Checked;
        int savedStart = _editor.SelectionStart;
        int savedLen = _editor.SelectionLength;

        using (Font chosen = dlg.Font)
        {
            Font copy = new(chosen.FontFamily, chosen.SizeInPoints, chosen.Style, GraphicsUnit.Point);
            if (whole)
            {
                _editor.SelectAll();
            }

            _editor.SelectionFont = copy;
            _editor.SelectionColor = dlg.Color;

            if (whole)
            {
                _editor.Select(savedStart, savedLen);
            }

            if (!whole && savedLen == 0)
            {
                _editor.Font = new Font(copy.FontFamily, copy.SizeInPoints, copy.Style, GraphicsUnit.Point);
                _editor.ForeColor = dlg.Color;
            }

            copy.Dispose();
        }

        UpdatePreviews();
    }

    private void PickEditorBackColor()
    {
        using ColorDialog dlg = new() { Color = _editor.BackColor, FullOpen = true };
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        ApplyBackColor(dlg.Color);
        UpdatePreviews();
    }

    /// <summary>
    /// 배경색을 편집기와 메인 폼(=어플리케이션 전체 바탕)에 함께 적용합니다.
    /// 상단 툴바는 반투명 틴트라 폼 배경색을 따라 자동으로 바뀝니다.
    /// </summary>
    private void ApplyBackColor(Color color)
    {
        _editor.BackColor = color;
        _mainForm.BackColor = color;
        EditorSettings.ApplyToolbarColor(_mainForm, color);
        PreviewColorChanged?.Invoke(color);
    }
}
