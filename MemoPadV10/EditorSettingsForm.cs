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
    private int _snapshotTransparency;
    private bool _syncingOpacityUi;
    private GroupBox _opacityGroupBox = null!;
    private TrackBar _opacityTrack = null!;
    private Label _opacityMinLabel = null!;
    private Label _opacityMaxLabel = null!;
    private Label _opacityValueLabel = null!;

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

    /// <summary>정사각형 색 미리보기 아이콘을 만듭니다.</summary>
    public static Bitmap MakeSquareSwatchIcon(Color fillColor, int size = 16, Color? borderColor = null)
    {
        Bitmap bmp = new(size, size, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using Graphics g = Graphics.FromImage(bmp);
        g.Clear(Color.Transparent);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
        int inset = 1;
        Rectangle rect = new(inset, inset, size - inset * 2 - 1, size - inset * 2 - 1);
        using (SolidBrush fill = new(fillColor))
        {
            g.FillRectangle(fill, rect);
        }

        using Pen border = new(borderColor ?? Color.FromArgb(120, 80, 80, 80));
        g.DrawRectangle(border, rect);
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
        _snapshotTransparency = _mainForm is MemoPadForm padSnap
            ? padSnap.TransparencyPercent
            : 0;

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
        SetupOpacityUi();
        try
        {
            _autoStartCheck.Checked = AutoStart.IsEnabled();
        }
        catch (Exception)
        {
            _autoStartCheck.Checked = false;
        }
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
        if (_opacityGroupBox != null)
        {
            _opacityGroupBox.Text = Loc.T("settings.opacity");
            _opacityValueLabel.Text = string.Format(Loc.T("settings.opacity.value"), _opacityTrack.Value);
        }

        languageGroupBox.Text = Loc.T("settings.language");
        generalGroupBox.Text = Loc.T("settings.general");
        _autoStartCheck.Text = Loc.T("settings.autostart");
        aboutGroupBox.Text = Loc.T("settings.about");
        _aboutAuthorLabel.Text = $"{Loc.T("settings.author")}: SHKWON (knix008@naver.com)";
        _btnDefault.Text = Loc.T("settings.default");
        _btnOk.Text = Loc.T("common.ok");
        _btnCancel.Text = Loc.T("common.cancel");
    }

    private void SetupOpacityUi()
    {
        _opacityGroupBox = new GroupBox
        {
            Name = "opacityGroupBox",
            Location = new Point(3, 430),
            Size = new Size(434, 72),
            TabIndex = 5,
            Text = Loc.T("settings.opacity")
        };
        _opacityMinLabel = new Label
        {
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleRight,
            Size = new Size(32, 22),
            Location = new Point(12, 30),
            Text = "0%"
        };
        _opacityTrack = new TrackBar
        {
            Minimum = 0,
            Maximum = 100,
            TickStyle = TickStyle.None,
            AutoSize = false,
            Size = new Size(280, 28),
            Location = new Point(48, 26),
            SmallChange = 1,
            LargeChange = 10
        };
        _opacityMaxLabel = new Label
        {
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleLeft,
            Size = new Size(40, 22),
            Location = new Point(334, 30),
            Text = "100%"
        };
        _opacityValueLabel = new Label
        {
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleLeft,
            Size = new Size(48, 22),
            Location = new Point(378, 30),
            Font = new Font(Font, FontStyle.Bold)
        };

        _opacityGroupBox.Controls.Add(_opacityMinLabel);
        _opacityGroupBox.Controls.Add(_opacityTrack);
        _opacityGroupBox.Controls.Add(_opacityMaxLabel);
        _opacityGroupBox.Controls.Add(_opacityValueLabel);
        clientPanel.Controls.Add(_opacityGroupBox);

        languageGroupBox.Top = 508;
        generalGroupBox.Top = 568;
        aboutGroupBox.Top = 626;
        ClientSize = new Size(ClientSize.Width, Math.Max(ClientSize.Height, 780));

        bool forMemoPad = _mainForm is MemoPadForm;
        _opacityGroupBox.Visible = forMemoPad;
        if (!forMemoPad)
        {
            languageGroupBox.Top = 430;
            generalGroupBox.Top = 490;
            aboutGroupBox.Top = 548;
            return;
        }

        MemoPadForm pad = (MemoPadForm)_mainForm;
        _syncingOpacityUi = true;
        try
        {
            _opacityTrack.Value = EditorSettings.ClampTransparencyPercent(pad.TransparencyPercent);
            _opacityValueLabel.Text = string.Format(Loc.T("settings.opacity.value"), _opacityTrack.Value);
        }
        finally
        {
            _syncingOpacityUi = false;
        }

        _opacityTrack.ValueChanged += (_, _) =>
        {
            if (_syncingOpacityUi)
            {
                return;
            }

            int percent = _opacityTrack.Value;
            _opacityValueLabel.Text = string.Format(Loc.T("settings.opacity.value"), percent);
            pad.TransparencyPercent = percent;
        };
    }

    /// <summary>
    /// 편집기 배경색으로 선택할 수 있는 파스텔 톤 24색 팔레트를 채웁니다.
    /// 여기서 고를 수 없는 색은 "사용자 지정 색…" 버튼으로 지정합니다.
    /// </summary>
    private void PopulateEditorBackPalette()
    {
        if (_editorBackPalettePanel == null)
        {
            return;
        }

        _editorBackPalettePanel.Controls.Clear();
        foreach (string hx in PresetEditorBackHexColors)
        {
            Color c = ColorTranslator.FromHtml(hx);
            Panel sw = new()
            {
                BackColor = c,
                Size = new Size(24, 24),
                Margin = new Padding(4),
                BorderStyle = BorderStyle.FixedSingle,
                Tag = c,
                Cursor = Cursors.Hand
            };

            sw.Click += (s, _) =>
            {
                Color chosen = (Color)((Control)s!).Tag!;
                ApplyBackColor(chosen);
                UpdatePreviews();
            };

            _editorBackPalettePanel.Controls.Add(sw);
        }
    }

    /// <summary>설정 창 배경색 팔레트(서로 다른 파스텔 24색).</summary>
    internal static readonly string[] PresetEditorBackHexColors =
    [
        "#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9", "#BAE1FF",
        "#E6B3FF", "#B3FFD9", "#FFD1DC", "#F0E68C", "#D8BFD8",
        "#C1E1C1", "#F5DEB3", "#E0FFFF", "#FFE4E1", "#E6E6FA",
        "#F0FFF0", "#FFF0F5", "#FAFAD2", "#F5F5DC", "#DFFFD6",
        "#FFCCE5", "#C9E4DE", "#D4E6F1", "#FDEBD0"
    ];

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
            AutoStart.SetEnabled(_autoStartCheck.Checked);
            if (_mainForm is MemoPadForm pad)
            {
                pad.SaveSettingsFromDialog();
            }
            else
            {
                EditorSettings.Save(EditorSettings.CaptureFromUi(_editor, _mainForm));
            }
        };

        FormClosing += EditorSettingsForm_FormClosing;
    }

    private void ResetToDefaults()
    {
        EditorSettings.Data defaults = EditorSettings.LoadDefaults();
        EditorSettings.ApplyToUi(_editor, _mainForm, defaults, applyLanguage: false);
        if (_mainForm is MemoPadForm pad)
        {
            pad.TransparencyPercent = 0;
            _syncingOpacityUi = true;
            try
            {
                _opacityTrack.Value = 0;
                _opacityValueLabel.Text = string.Format(Loc.T("settings.opacity.value"), 0);
            }
            finally
            {
                _syncingOpacityUi = false;
            }
        }

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
            if (_mainForm is MemoPadForm pad)
            {
                pad.TransparencyPercent = _snapshotTransparency;
            }
        }
    }

    private void UpdatePreviews()
    {
        _previewEditorBack.BackColor = _editor.BackColor;
        _btnEditorBack.Image?.Dispose();
        _btnEditorBack.Image = new Bitmap(MakeSquareSwatchIcon(_editor.BackColor, 18), new Size(18, 18));
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
