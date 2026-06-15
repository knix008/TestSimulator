using MyProject.Rendering;
using MyProject.Theme;

namespace MyProject.Controls
{
    public sealed class RichNoteEditorControl : UserControl
    {
        private readonly ToolStrip _toolbar;
        private readonly RichTextBox _editor;
        private readonly ToolStripComboBox _fontFamily;
        private readonly ToolStripComboBox _fontSize;
        private readonly ToolStripButton _btnBold;
        private readonly ToolStripButton _btnItalic;
        private readonly ToolStripButton _btnUnderline;
        private readonly ToolStripButton _btnStrikeout;
        private bool _suppressEvents;
        private bool _isContentDirty;

        public bool IsContentDirty => _isContentDirty;

        public event EventHandler? ContentChanged;
        public event EventHandler? EditorEnter;

        public RichNoteEditorControl()
        {
            BackColor = NoteRenderer.NoteEditorBack;
            Font = AppTheme.FontNormal;

            _toolbar = new ToolStrip
            {
                GripStyle = ToolStripGripStyle.Hidden,
                Dock = DockStyle.Top,
                BackColor = Color.FromArgb(248, 249, 251),
                Padding = new Padding(2, 0, 2, 0)
            };

            _fontFamily = new ToolStripComboBox
            {
                Width = 110,
                DropDownStyle = ComboBoxStyle.DropDownList
            };
            foreach (var name in new[] { "Segoe UI", "Arial", "Calibri", "Times New Roman", "Courier New", "Georgia", "Verdana" })
                _fontFamily.Items.Add(name);
            _fontFamily.SelectedIndexChanged += (_, _) => ApplyFontFamily();

            _fontSize = new ToolStripComboBox
            {
                Width = 48,
                DropDownStyle = ComboBoxStyle.DropDownList
            };
            foreach (var size in new[] { 8f, 9f, 10f, 11f, 12f, 14f, 16f, 18f, 20f, 24f })
                _fontSize.Items.Add(size);
            _fontSize.SelectedIndexChanged += (_, _) => ApplyFontSize();

            _btnBold = MakeToggleButton("B", FontStyle.Bold, "Bold (Ctrl+B)");
            _btnItalic = MakeToggleButton("I", FontStyle.Italic, "Italic (Ctrl+I)");
            _btnUnderline = MakeToggleButton("U", FontStyle.Underline, "Underline (Ctrl+U)");
            _btnStrikeout = MakeToggleButton("S", FontStyle.Strikeout, "Strikethrough");

            _toolbar.Items.Add(_fontFamily);
            _toolbar.Items.Add(_fontSize);
            _toolbar.Items.Add(_btnBold);
            _toolbar.Items.Add(_btnItalic);
            _toolbar.Items.Add(_btnUnderline);
            _toolbar.Items.Add(_btnStrikeout);

            _editor = new RichTextBox
            {
                Dock = DockStyle.Fill,
                BorderStyle = BorderStyle.None,
                BackColor = NoteRenderer.NoteEditorBack,
                Font = NoteRenderer.NoteEditorFont,
                ScrollBars = RichTextBoxScrollBars.Vertical,
                DetectUrls = false,
                HideSelection = false
            };
            _editor.SelectionChanged += (_, _) => SyncToolbarFromSelection();
            _editor.Enter += (_, _) => EditorEnter?.Invoke(this, EventArgs.Empty);
            _editor.TextChanged += (_, _) =>
            {
                if (!_suppressEvents)
                {
                    _isContentDirty = true;
                    ContentChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            Controls.Add(_editor);
            Controls.Add(_toolbar);

            SetDefaultToolbarSelection();
        }

        public string PlainText => _editor.Text;

        public string Rtf => NoteRtfHelper.GetRtfFromRichTextBox(_editor);

        public void LoadContent(string? rtf, string? plainFallback)
        {
            _suppressEvents = true;
            try
            {
                NoteRtfHelper.ApplyToRichTextBox(_editor, rtf, plainFallback);
                SyncToolbarFromSelection();
                _isContentDirty = false;
            }
            finally
            {
                _suppressEvents = false;
            }
        }

        public void MarkContentClean() => _isContentDirty = false;

        public void FocusEditor() => _editor.Focus();

        private ToolStripButton MakeToggleButton(string text, FontStyle style, string tooltip)
        {
            var btn = new ToolStripButton(text)
            {
                DisplayStyle = ToolStripItemDisplayStyle.Text,
                Font = new Font("Segoe UI", 9f, style),
                ToolTipText = tooltip,
                AutoSize = true,
                CheckOnClick = true
            };
            btn.Click += (_, _) => ToggleFontStyle(style, btn);
            return btn;
        }

        private void SetDefaultToolbarSelection()
        {
            _fontFamily.SelectedItem = "Segoe UI";
            if (_fontFamily.SelectedIndex < 0 && _fontFamily.Items.Count > 0)
                _fontFamily.SelectedIndex = 0;

            _fontSize.SelectedItem = 8f;
            if (_fontSize.SelectedIndex < 0 && _fontSize.Items.Count > 0)
                _fontSize.SelectedIndex = 2;
        }

        private void SyncToolbarFromSelection()
        {
            if (_editor.SelectionLength == 0 && string.IsNullOrEmpty(_editor.Text))
            {
                SetDefaultToolbarSelection();
                _btnBold.Checked = false;
                _btnItalic.Checked = false;
                _btnUnderline.Checked = false;
                _btnStrikeout.Checked = false;
                return;
            }

            var font = _editor.SelectionFont ?? _editor.Font;
            string family = font.FontFamily.Name;
            int familyIndex = _fontFamily.FindStringExact(family);
            if (familyIndex >= 0)
                _fontFamily.SelectedIndex = familyIndex;

            float size = font.SizeInPoints;
            int sizeIndex = -1;
            for (int i = 0; i < _fontSize.Items.Count; i++)
            {
                if (Math.Abs(Convert.ToSingle(_fontSize.Items[i]!) - size) < 0.1f)
                {
                    sizeIndex = i;
                    break;
                }
            }
            if (sizeIndex >= 0)
                _fontSize.SelectedIndex = sizeIndex;

            _btnBold.Checked = font.Bold;
            _btnItalic.Checked = font.Italic;
            _btnUnderline.Checked = font.Underline;
            _btnStrikeout.Checked = font.Strikeout;
        }

        private void ApplyFontFamily()
        {
            if (_fontFamily.SelectedItem is not string family)
                return;

            ApplySelectionFont(f =>
            {
                try
                {
                    return new Font(family, f.SizeInPoints, f.Style);
                }
                catch
                {
                    return f;
                }
            });
        }

        private void ApplyFontSize()
        {
            if (_fontSize.SelectedItem == null)
                return;

            float size = Convert.ToSingle(_fontSize.SelectedItem);
            ApplySelectionFont(f => new Font(f.FontFamily, size, f.Style));
        }

        private void ToggleFontStyle(FontStyle style, ToolStripButton button)
        {
            ApplySelectionFont(f =>
            {
                FontStyle newStyle = button.Checked
                    ? f.Style | style
                    : f.Style & ~style;
                return new Font(f.FontFamily, f.SizeInPoints, newStyle);
            });
            SyncToolbarFromSelection();
        }

        private void ApplySelectionFont(Func<Font, Font> transform)
        {
            if (_editor.SelectionLength == 0)
            {
                _editor.Font = transform(_editor.Font);
                return;
            }

            _editor.SelectionFont = transform(_editor.SelectionFont ?? _editor.Font);
            if (!_suppressEvents)
                ContentChanged?.Invoke(this, EventArgs.Empty);
        }
    }
}
