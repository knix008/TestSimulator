namespace MemoPadV10;

/// <summary>
/// 폰트·색·서식 설정 대화상자. UI는 EditorSettingsForm.Designer.cs에서 편집합니다.
/// </summary>
public partial class EditorSettingsForm : Form
{
    private RichTextBox _editor = null!;
    private Form _mainForm = null!;
    private string _snapshotRtf = string.Empty;
    private Color _snapshotFormBack;
    private Color _snapshotEditorBack;

    /// <summary>Visual Studio 디자이너에서 사용합니다.</summary>
    public EditorSettingsForm()
    {
        InitializeComponent();
        ApplyStyleButtonFonts();
    }

    public EditorSettingsForm(RichTextBox editor, Form mainForm) : this()
    {
        _editor = editor;
        _mainForm = mainForm;
        _snapshotRtf = editor.Rtf ?? string.Empty;
        _snapshotFormBack = mainForm.BackColor;
        _snapshotEditorBack = editor.BackColor;

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
        _btnSelectionBack.Click += (_, _) => PickSelectionBackColor();
        btnStyleBold.Click += (_, _) => ToggleStyle(FontStyle.Bold);
        btnStyleItalic.Click += (_, _) => ToggleStyle(FontStyle.Italic);
        btnStyleUnderline.Click += (_, _) => ToggleStyle(FontStyle.Underline);
        btnStyleStrike.Click += (_, _) => ToggleStyle(FontStyle.Strikeout);
        _btnOk.Click += (_, _) =>
        {
            EditorSettings.Save(EditorSettings.CaptureFromUi(_editor, _mainForm));
        };

        FormClosing += EditorSettingsForm_FormClosing;
    }

    private void ResetToDefaults()
    {
        EditorSettings.Data defaults = EditorSettings.LoadDefaults();
        EditorSettings.ApplyToUi(_editor, _mainForm, defaults);
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
        }
    }

    private void UpdatePreviews()
    {
        _previewEditorBack.BackColor = _editor.BackColor;
        _previewSelBack.BackColor = _editor.SelectionBackColor;
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

        _editor.BackColor = dlg.Color;
        UpdatePreviews();
    }

    private void PickSelectionBackColor()
    {
        using ColorDialog dlg = new() { Color = _editor.SelectionBackColor, FullOpen = true };
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        if (_radioWhole.Checked)
        {
            int start = _editor.SelectionStart;
            int len = _editor.SelectionLength;
            _editor.SelectAll();
            _editor.SelectionBackColor = dlg.Color;
            _editor.Select(start, len);
        }
        else
        {
            if (_editor.SelectionLength == 0)
            {
                MessageBox.Show(this, "글자 배경을 바꾸려면 먼저 텍스트를 선택해 주세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            _editor.SelectionBackColor = dlg.Color;
        }

        UpdatePreviews();
    }
}
