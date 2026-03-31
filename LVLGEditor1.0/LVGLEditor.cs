using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using System.Xml.Serialization;

namespace LVLGEditor1._0
{
    public partial class LVGLEditor : Form
    {
        private const int RowCount     = 10;
        private const int FixedRowCount = 1;
        private const int RowHeight    = 80;
        private const int RowGap       = 5;
        private const int IconSize     = 60;
        private const int IconZoneWidth = 80;   // 아이콘 전용 영역 너비

        // Row controls (RichTextBox for full alignment support)
        private Panel[]        _rowPanels;
        private RichTextBox[]  _rowTextBoxes;
        private Color[]        _rowBorderColors;
        private int[]          _rowBorderWidths;
        private Panel          _scrollRowsViewport;
        private Panel          _rowContainer;

        // Scroll state
        private bool _scrollDragging;
        private int  _scrollStartScreenY;
        private int  _scrollStartContainerTop;

        // Active text control (TextBox = title, RichTextBox = row)
        private Control _activeTextControl;

        // Popup state
        private int   _popupColumns        = 3;
        private int   _popupRows           = 5;
        private int   _popupOverlayOpacity = 55;   // 0-100 percent
        private int   _popupTextFontSize   = 24;
        private int   _popupTextRows       = 1;
        private Color _popupBgColor        = Color.FromArgb(240, 240, 240);
        private Color _popupBorderColor    = Color.FromArgb(51, 51, 51);
        private int   _popupBorderWidth    = 2;
        private Panel   _popupWindow;
        private Panel   _popupButtonGrid;
        private Panel   _popupTitleLeftIconZone;
        private Panel   _popupTitleRightIconZone;
        private TextBox _popupTitleDisplay;
        private TextBox _popupTextDisplay;

        // ── Constructor ───────────────────────────────────────────────────

        public LVGLEditor()
        {
            InitializeComponent();
            SetupDropTargets();
            TrackFocusOn(titleTextBox);
            LoadIconsFromFolder(GetPreferredIconsFolder());
            InitializeButtonPalette();
            InitializePopupTab();
            UpdateSettingsMenuBySelectedTab();
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            // Select font size 24 as default (index 7 in the combo list)
            int idx24 = fontSizeCombo.Items.IndexOf(24);
            if (idx24 >= 0) fontSizeCombo.SelectedIndex = idx24;
            InitializeRows();
            // Title starts with Center alignment by default
            titleTextBox.TextAlign = HorizontalAlignment.Center;
            UpdateAlignmentButtons(HorizontalAlignment.Center);
        }

        // ── Row initialisation ────────────────────────────────────────────

        private static Color LightenColor(Color c, int amount) =>
            Color.FromArgb(
                Math.Min(255, c.R + amount),
                Math.Min(255, c.G + amount),
                Math.Min(255, c.B + amount));

        private void InitializeRows()
        {
            _rowPanels       = new Panel[RowCount];
            _rowTextBoxes    = new RichTextBox[RowCount];
            _rowBorderColors = new Color[RowCount];
            _rowBorderWidths = new int[RowCount];

            int fixedAreaHeight = RowGap + FixedRowCount * (RowHeight + RowGap);
            _scrollRowsViewport = new Panel();
            _scrollRowsViewport.SetBounds(0, fixedAreaHeight, contentArea.ClientSize.Width,
                Math.Max(0, contentArea.ClientSize.Height - fixedAreaHeight));
            _scrollRowsViewport.BackColor = contentArea.BackColor;
            _scrollRowsViewport.BorderStyle = BorderStyle.None;
            AttachScrollHandlers(_scrollRowsViewport);
            contentArea.Controls.Add(_scrollRowsViewport);

            _rowContainer = new Panel();
            _rowContainer.Width    = _scrollRowsViewport.ClientSize.Width;
            _rowContainer.Height   = RowGap + (RowCount - FixedRowCount) * (RowHeight + RowGap);
            _rowContainer.Location = Point.Empty;
            _rowContainer.BackColor = contentArea.BackColor;
            AttachScrollHandlers(_rowContainer);
            _scrollRowsViewport.Controls.Add(_rowContainer);
            contentArea.MouseWheel += WheelScroll;

            Color rowBg        = LightenColor(contentArea.BackColor, 20);
            Color defaultBorder = Color.FromArgb(80, 0, 0, 0);

            for (int i = 0; i < RowCount; i++)
            {
                int idx  = i;   // capture for closures
                int rowX = 4;
                bool fixedRow = i < FixedRowCount;
                int rowY = fixedRow
                    ? RowGap + i * (RowHeight + RowGap)
                    : RowGap + (i - FixedRowCount) * (RowHeight + RowGap);
                int rowW = (fixedRow ? contentArea.ClientSize.Width : _rowContainer.Width) - 8;

                _rowBorderColors[i] = defaultBorder;
                _rowBorderWidths[i] = 1;

                var row = new Panel();
                row.SetBounds(rowX, rowY, rowW, RowHeight);
                row.BackColor = rowBg;
                row.AllowDrop = true;
                row.DragEnter += DropTarget_DragEnter;
                row.DragDrop  += RowPanel_DragDrop;
                AttachScrollHandlers(row);
                row.Paint += (s, pe) =>
                {
                    var rc = ((Panel)s).ClientRectangle;
                    int w  = _rowBorderWidths[idx];
                    using (var pen = new Pen(_rowBorderColors[idx], w))
                    {
                        int half = w / 2;
                        pe.Graphics.DrawRectangle(pen, half, half, rc.Width - w, rc.Height - w);
                    }
                };

                var font = CurrentFont();
                int rtbH = font.Height + 8;
                int rtbY = (RowHeight - rtbH) / 2;
                var rtb = new RichTextBox();
                int textWidth = idx == 0
                    ? rowW - (IconZoneWidth * 2) - 8
                    : rowW - IconZoneWidth - 8;
                rtb.SetBounds(IconZoneWidth + 4, rtbY, textWidth, rtbH);
                rtb.BorderStyle  = BorderStyle.None;
                rtb.BackColor    = rowBg;
                rtb.ForeColor    = Color.Black;
                rtb.Font         = font;
                rtb.ScrollBars   = RichTextBoxScrollBars.None;
                rtb.Multiline    = true;
                rtb.DetectUrls   = false;
                rtb.SelectionAlignment = HorizontalAlignment.Left;
                rtb.MouseWheel  += WheelScroll;
                rtb.AllowDrop    = true;
                rtb.DragEnter   += DropTarget_DragEnter;
                rtb.DragDrop    += RowPanel_DragDrop;
                TrackFocusOn(rtb);

                // Per-row context menu
                var menu       = new ContextMenuStrip();
                var bgItem     = new ToolStripMenuItem("배경색 변경");
                var borderItem = new ToolStripMenuItem("테두리색 변경");
                var widthItem  = new ToolStripMenuItem("테두리 굵기");
                foreach (int w in new[] { 1, 2, 3, 4, 5 })
                {
                    int wv = w;
                    var sub = new ToolStripMenuItem($"{wv}px");
                    sub.Click += (s, e) => { _rowBorderWidths[idx] = wv; row.Invalidate(); };
                    widthItem.DropDownItems.Add(sub);
                }
                bgItem.Click += (s, e) =>
                {
                    if (!PickColor(row.BackColor, out Color c)) return;
                    row.BackColor = c;
                    rtb.BackColor = c;
                };
                borderItem.Click += (s, e) =>
                {
                    if (!PickColor(_rowBorderColors[idx], out Color c)) return;
                    _rowBorderColors[idx] = c;
                    row.Invalidate();
                };
                menu.Items.Add(bgItem);
                menu.Items.Add(borderItem);
                menu.Items.Add(widthItem);
                row.ContextMenuStrip = menu;
                rtb.ContextMenuStrip = menu;

                row.Controls.Add(rtb);
                if (fixedRow)
                    contentArea.Controls.Add(row);
                else
                    _rowContainer.Controls.Add(row);

                _rowPanels[i]    = row;
                _rowTextBoxes[i] = rtb;
            }
        }

        // ── Scroll ────────────────────────────────────────────────────────

        private void AttachScrollHandlers(Control ctrl)
        {
            ctrl.MouseDown += Scroll_MouseDown;
            ctrl.MouseMove += Scroll_MouseMove;
            ctrl.MouseUp   += Scroll_MouseUp;
        }

        private void Scroll_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left || _rowContainer == null) return;
            _scrollStartScreenY      = Cursor.Position.Y;
            _scrollStartContainerTop = _rowContainer.Top;
            _scrollDragging          = false;
            ((Control)sender).Capture = true;
        }

        private void Scroll_MouseMove(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left || _rowContainer == null) return;
            int delta = Cursor.Position.Y - _scrollStartScreenY;
            if (!_scrollDragging && Math.Abs(delta) > 4) _scrollDragging = true;
            if (!_scrollDragging) return;
            int viewportH = _scrollRowsViewport != null ? _scrollRowsViewport.ClientSize.Height : contentArea.ClientSize.Height;
            int minTop = Math.Min(0, viewportH - _rowContainer.Height);
            _rowContainer.Top = Math.Max(minTop, Math.Min(0, _scrollStartContainerTop + delta));
        }

        private void Scroll_MouseUp(object sender, MouseEventArgs e)
        {
            _scrollDragging = false;
            ((Control)sender).Capture = false;
        }

        private void WheelScroll(object sender, MouseEventArgs e)
        {
            if (_rowContainer == null) return;
            int step   = (e.Delta / 120) * RowHeight;
            int viewportH = _scrollRowsViewport != null ? _scrollRowsViewport.ClientSize.Height : contentArea.ClientSize.Height;
            int minTop = Math.Min(0, viewportH - _rowContainer.Height);
            _rowContainer.Top = Math.Max(minTop, Math.Min(0, _rowContainer.Top + step));
        }

        // ── Font size ─────────────────────────────────────────────────────

        private Font CurrentFont()
        {
            int size = fontSizeCombo.SelectedItem != null ? (int)fontSizeCombo.SelectedItem : 24;
            return new Font("Segoe UI", size);
        }

        private void FontSizeCombo_Changed(object sender, EventArgs e)
        {
            int size = fontSizeCombo.SelectedItem != null ? (int)fontSizeCombo.SelectedItem : 24;
            if (mainTabControl.SelectedTab == popupTabPage)
            {
                _popupTextFontSize = size;
                if (_popupTextDisplay != null)
                    _popupTextDisplay.Font = new Font("Segoe UI", size, _popupTextDisplay.Font.Style);
                UpdatePopupWindow();
            }
            else if (_activeTextControl is RichTextBox rtb)
            {
                // Preserve bold/italic when changing size
                var style = (rtb.SelectionFont ?? rtb.Font).Style;
                var font  = new Font("Segoe UI", size, style);
                rtb.SelectAll();
                rtb.SelectionFont = font;
                rtb.Select(0, 0);
                rtb.Font = font;
                // Re-center vertically in the row
                int newH = font.Height + 8;
                int newY = (RowHeight - newH) / 2;
                rtb.SetBounds(rtb.Left, newY, rtb.Width, newH);
            }
            else if (_activeTextControl is TextBox tb)
            {
                var font = new Font("Segoe UI", size, tb.Font.Style);
                tb.Font = font;
                // Re-center vertically in titleBar
                int newH = font.Height + 8;
                int newY = (titleBar.Height - newH) / 2;
                tb.SetBounds(tb.Left, newY, tb.Width, newH);
            }
        }

        // ── Alignment ─────────────────────────────────────────────────────

        private void AlignBtn_Click(object sender, EventArgs e)
        {
            if (sender is Button btn && btn.Tag is HorizontalAlignment align)
                ApplyAlignment(align);
        }

        private void ApplyAlignment(HorizontalAlignment align)
        {
            UpdateAlignmentButtons(align);

            if (mainTabControl.SelectedTab == popupTabPage && _popupTextDisplay != null)
            {
                _popupTextDisplay.TextAlign = align;
            }
            else if (_activeTextControl is RichTextBox rtb)
            {
                rtb.SelectAll();
                rtb.SelectionAlignment = align;
                rtb.Select(0, 0);
            }
            else if (_activeTextControl is TextBox tb)
            {
                tb.TextAlign = align;
            }
        }

        // ── Bold ──────────────────────────────────────────────────────────

        private void BoldBtn_Click(object sender, EventArgs e)
        {
            if (mainTabControl.SelectedTab == popupTabPage && _popupTextDisplay != null)
            {
                var style = _popupTextDisplay.Font.Bold ? FontStyle.Regular : FontStyle.Bold;
                _popupTextDisplay.Font = new Font(_popupTextDisplay.Font.FontFamily, _popupTextDisplay.Font.SizeInPoints, style);
                UpdateBoldButton(style == FontStyle.Bold);
            }
            else if (_activeTextControl is RichTextBox rtb)
            {
                var cur   = rtb.SelectionFont ?? rtb.Font;
                var style = cur.Bold ? FontStyle.Regular : FontStyle.Bold;
                var font  = new Font(cur.FontFamily, cur.SizeInPoints, style);
                rtb.SelectAll();
                rtb.SelectionFont = font;
                rtb.Select(0, 0);
                rtb.Font = font;
                UpdateBoldButton(style == FontStyle.Bold);
            }
            else if (_activeTextControl is TextBox tb)
            {
                var style = tb.Font.Bold ? FontStyle.Regular : FontStyle.Bold;
                tb.Font   = new Font(tb.Font.FontFamily, tb.Font.SizeInPoints, style);
                UpdateBoldButton(style == FontStyle.Bold);
            }
        }

        private void UpdateBoldButton(bool isBold)
        {
            boldBtn.BackColor = isBold
                ? Color.FromArgb(0, 122, 204)
                : Color.FromArgb(80, 80, 80);
        }

        private void UpdateAlignmentButtons(HorizontalAlignment align)
        {
            var active   = Color.FromArgb(0, 122, 204);
            var inactive = Color.FromArgb(80, 80, 80);
            alignLeftBtn.BackColor   = align == HorizontalAlignment.Left   ? active : inactive;
            alignCenterBtn.BackColor = align == HorizontalAlignment.Center ? active : inactive;
            alignRightBtn.BackColor  = align == HorizontalAlignment.Right  ? active : inactive;
        }

        private HorizontalAlignment ReadAlignment(Control ctrl)
        {
            if (ctrl is RichTextBox rtb) return rtb.SelectionAlignment;
            if (ctrl is TextBox tb)     return tb.TextAlign;
            return HorizontalAlignment.Left;
        }

        // ── Focus tracking ────────────────────────────────────────────────

        private void TrackFocusOn(Control ctrl)
        {
            ctrl.GotFocus += (s, e) =>
            {
                _activeTextControl = ctrl;

                Font f = ctrl is RichTextBox rtb
                    ? (rtb.SelectionFont ?? rtb.Font)
                    : ((TextBox)ctrl).Font;

                // Sync font size combo
                int pt  = (int)Math.Round(f.SizeInPoints);
                int idx = fontSizeCombo.Items.IndexOf(pt);
                if (idx >= 0) fontSizeCombo.SelectedIndex = idx;

                // Sync bold button
                UpdateBoldButton(f.Bold);

                // Sync alignment buttons
                UpdateAlignmentButtons(ReadAlignment(ctrl));
            };
        }

        // ── Button palette ────────────────────────────────────────────────

        private void InitializeButtonPalette()
        {
            var groups = new (string header, string[] items)[]
            {
                ("숫자", new[] { "0","1","2","3","4","5","6","7","8","9" }),
                ("천지인", new[] { "l", ".", "ㅡ", "ㄱㅋ", "ㄴㄹ", "ㄷㅌ", "ㅂㅍ", "ㅅㅎ", "ㅇㅁ", "ㅈㅊ", "␣", "←", "⇄", "↵", "Aa", "ABC", "DEF", "GHI", "JKL", "MNO", "PQR", "STU", "VWX", "YZ.", "abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwx", "yz." }),
            };

            foreach (var (header, items) in groups)
            {
                var groupLabel = new Label
                {
                    Text      = header,
                    Font      = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                    ForeColor = Color.FromArgb(200, 200, 200),
                    AutoSize  = false,
                    Size      = new Size(272, 22),
                    Margin    = new Padding(0, 6, 0, 2),
                    TextAlign = ContentAlignment.MiddleLeft,
                };
                buttonPalette.Controls.Add(groupLabel);

                foreach (var text in items)
                    buttonPalette.Controls.Add(CreatePaletteButton(NormalizeCheonjiinLabel(text)));
            }
        }

        private static string NormalizeCheonjiinLabel(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            switch (text.Trim().ToLowerInvariant())
            {
                case "ab": return "ABC";
                case "space": return "␣";
                case "backspace": return "←";
                case "mode": return "⇄";
                case "enter": return "↵";
                default: return text;
            }
        }

        private Button CreatePaletteButton(string text)
        {
            var btn = new Button
            {
                Text      = text,
                Size      = new Size(80, 60),
                Font      = new Font("Segoe UI", 12f, FontStyle.Bold),
                BackColor = Color.FromArgb(65, 65, 80),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor    = Cursors.Hand,
                Margin    = new Padding(4),
            };
            btn.FlatAppearance.BorderColor = Color.FromArgb(100, 100, 120);
            btn.MouseEnter += (s, e) => ((Button)s).BackColor = Color.FromArgb(90, 90, 115);
            btn.MouseLeave += (s, e) => ((Button)s).BackColor = Color.FromArgb(65, 65, 80);
            btn.MouseDown  += PaletteButton_MouseDown;
            return btn;
        }

        private void PaletteButton_MouseDown(object sender, MouseEventArgs e)
        {
            if (sender is Button btn)
            {
                var data = new DataObject();
                data.SetData("ButtonText", btn.Text);
                DoDragDrop(data, DragDropEffects.Copy);
            }
        }

        private Button CreateDroppedButton(string text, Panel row,
            Color? bgColor = null, Color? fgColor = null,
            Color? borderColor = null, int borderWidth = 1)
        {
            var btn = new Button
            {
                Text      = text,
                Size      = new Size(80, 60),
                Font      = new Font("Segoe UI", 16, FontStyle.Bold),
                BackColor = bgColor     ?? Color.FromArgb(220, 220, 230),
                ForeColor = fgColor     ?? Color.Black,
                FlatStyle = FlatStyle.Flat,
                Cursor    = Cursors.SizeAll,
            };
            btn.FlatAppearance.BorderColor = borderColor ?? Color.FromArgb(160, 160, 180);
            btn.FlatAppearance.BorderSize  = borderWidth;

            var removeMenu = BuildRemoveMenu(btn, row);

            // Color / border context menu items added to remove menu
            removeMenu.Items.Add(new ToolStripSeparator());
            var bgItem     = new ToolStripMenuItem("배경색 변경");
            var fgItem     = new ToolStripMenuItem("글자색 변경");
            var borderClr  = new ToolStripMenuItem("테두리색 변경");
            var borderWide = new ToolStripMenuItem("테두리 굵기");
            foreach (int w in new[] { 0, 1, 2, 3, 4, 5 })
            {
                int wv = w;
                var sub = new ToolStripMenuItem($"{wv}px");
                sub.Click += (s, e) => btn.FlatAppearance.BorderSize = wv;
                borderWide.DropDownItems.Add(sub);
            }
            bgItem.Click    += (s, e) => { if (PickColor(btn.BackColor, out Color c)) btn.BackColor = c; };
            fgItem.Click    += (s, e) => { if (PickColor(btn.ForeColor, out Color c)) btn.ForeColor = c; };
            borderClr.Click += (s, e) => { if (PickColor(btn.FlatAppearance.BorderColor, out Color c)) btn.FlatAppearance.BorderColor = c; };
            removeMenu.Items.Add(bgItem);
            removeMenu.Items.Add(fgItem);
            removeMenu.Items.Add(borderClr);
            removeMenu.Items.Add(borderWide);
            btn.ContextMenuStrip = removeMenu;

            Point drag = Point.Empty;
            btn.MouseDown += (s, ev) => { if (ev.Button == MouseButtons.Left) drag = ev.Location; };
            btn.MouseMove += (s, ev) =>
            {
                if (ev.Button != MouseButtons.Left) return;
                var loc = btn.Location;
                loc.Offset(ev.X - drag.X, ev.Y - drag.Y);
                loc.X = Math.Max(0, Math.Min(loc.X, row.Width  - btn.Width));
                loc.Y = Math.Max(0, Math.Min(loc.Y, row.Height - btn.Height));
                btn.Location = loc;
            };
            return btn;
        }

        // ── Drop targets setup ────────────────────────────────────────────

        private void SetupDropTargets()
        {
            shortcutBar.AllowDrop = true;
            shortcutBar.DragEnter += DropTarget_DragEnter;
            shortcutBar.DragDrop  += ShortcutBar_DragDrop;
            shortcutBar.Paint += (s, pe) =>
            {
                using (var pen = new Pen(Color.FromArgb(160, 160, 160)))
                    pe.Graphics.DrawLine(pen, 0, 0, ((Panel)s).Width - 1, 0);
            };

            SetupTitleIconZone(titleLeftIconZone);
            SetupTitleIconZone(titleRightIconZone);
        }

        private void SetupTitleIconZone(Panel zone)
        {
            zone.AllowDrop = true;
            zone.DragEnter += DropTarget_DragEnter;
            zone.DragDrop  += TitleIconZone_DragDrop;
        }

        private void TitleIconZone_DragDrop(object sender, DragEventArgs e)
        {
            var zone = (Panel)sender;
            if (!e.Data.GetDataPresent("IconFilePath")) return;
            string filePath = (string)e.Data.GetData("IconFilePath");
            if (!File.Exists(filePath)) { ShowMissingFileWarning(filePath); return; }

            // Remove existing icon
            foreach (Control c in zone.Controls.OfType<PictureBox>().ToList())
            { zone.Controls.Remove(c); c.Dispose(); }

            var pb = new PictureBox();
            pb.Image    = Image.FromFile(filePath);
            pb.SizeMode = PictureBoxSizeMode.Zoom;
            pb.Width    = pb.Height = IconSize;
            pb.Tag      = filePath;
            pb.Cursor   = Cursors.Default;
            pb.BackColor = Color.Transparent;
            pb.Location = new Point(
                (zone.Width  - IconSize) / 2,
                (zone.Height - IconSize) / 2);
            pb.ContextMenuStrip = BuildRemoveMenu(pb, zone);
            zone.Controls.Add(pb);
        }

        // ── Icon palette ──────────────────────────────────────────────────

        private void LoadIconsButton_Click(object sender, EventArgs e)
        {
            using (var dlg = new FolderBrowserDialog())
            {
                dlg.Description = "아이콘 PNG 파일이 있는 폴더를 선택하세요";
                string preferred = GetPreferredIconsFolder();
                if (Directory.Exists(preferred))
                    dlg.SelectedPath = preferred;
                if (dlg.ShowDialog() == DialogResult.OK)
                {
                    LoadIconsFromFolder(dlg.SelectedPath);
                    Properties.Settings.Default.LastIconFolder = dlg.SelectedPath;
                    Properties.Settings.Default.Save();
                }
            }
        }

        private string GetPreferredIconsFolder()
        {
            string saved = Properties.Settings.Default.LastIconFolder;
            if (!string.IsNullOrWhiteSpace(saved) && Directory.Exists(saved))
                return saved;
            return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "icons");
        }

        private void LoadIconsFromFolder(string folderPath)
        {
            if (!Directory.Exists(folderPath)) return;
            iconPalette.Controls.Clear();
            foreach (var file in Directory.GetFiles(folderPath, "*.png"))
            {
                try   { iconPalette.Controls.Add(CreatePaletteIcon(file)); }
                catch { }
            }
        }

        private PictureBox CreatePaletteIcon(string filePath)
        {
            var pb = new PictureBox();
            pb.Image     = Image.FromFile(filePath);
            pb.SizeMode  = PictureBoxSizeMode.Zoom;
            pb.Width     = pb.Height = IconSize;
            pb.Margin    = new Padding(6);
            pb.Tag       = filePath;
            pb.Cursor    = Cursors.Hand;
            pb.BorderStyle = BorderStyle.FixedSingle;
            pb.BackColor = Color.FromArgb(70, 70, 70);
            pb.MouseEnter += (s, e) => ((PictureBox)s).BackColor = Color.FromArgb(100, 100, 150);
            pb.MouseLeave += (s, e) => ((PictureBox)s).BackColor = Color.FromArgb(70, 70, 70);
            pb.MouseDown  += PaletteIcon_MouseDown;
            new ToolTip().SetToolTip(pb, Path.GetFileNameWithoutExtension(filePath));
            return pb;
        }

        // ── Drag & Drop ───────────────────────────────────────────────────

        private void PaletteIcon_MouseDown(object sender, MouseEventArgs e)
        {
            if (sender is PictureBox pb && pb.Tag is string filePath)
            {
                var data = new DataObject();
                data.SetData("IconFilePath", filePath);
                DoDragDrop(data, DragDropEffects.Copy);
            }
        }

        private void DropTarget_DragEnter(object sender, DragEventArgs e)
        {
            e.Effect = (e.Data.GetDataPresent("IconFilePath") || e.Data.GetDataPresent("ButtonText"))
                ? DragDropEffects.Copy : DragDropEffects.None;
        }

        private void RowPanel_DragDrop(object sender, DragEventArgs e)
        {
            var dropCtrl = (Control)sender;
            Panel row = dropCtrl as Panel;
            if (row == null || (_rowPanels != null && !_rowPanels.Contains(row)))
                row = dropCtrl.Parent as Panel;
            if (row == null) return;
            var pt  = row.PointToClient(new Point(e.X, e.Y));

            if (e.Data.GetDataPresent("IconFilePath"))
            {
                string filePath = (string)e.Data.GetData("IconFilePath");
                var pb = CreateDroppedIcon(filePath, row);

                if (_rowPanels != null && _rowPanels.Length > 0 && row == _rowPanels[0])
                {
                    // Row 1 supports both left and right icon zones.
                    bool rightZone = pt.X >= (row.Width - IconZoneWidth);
                    int targetCenterX = rightZone
                        ? row.Width - (IconZoneWidth / 2)
                        : (IconZoneWidth / 2);

                    // Keep one icon per side.
                    var existing = row.Controls.OfType<PictureBox>()
                        .FirstOrDefault(x => rightZone
                            ? x.Left + (x.Width / 2) >= row.Width / 2
                            : x.Left + (x.Width / 2) < row.Width / 2);
                    if (existing != null)
                    {
                        row.Controls.Remove(existing);
                        existing.Dispose();
                    }

                    pb.Location = new Point(
                        targetCenterX - (IconSize / 2),
                        (row.Height - IconSize) / 2);
                }
                else
                {
                    // Default rows: left icon zone.
                    pb.Location = new Point(
                        (IconZoneWidth - IconSize) / 2,
                        (row.Height - IconSize) / 2);
                }
                row.Controls.Add(pb);
                pb.BringToFront();
            }
            else if (e.Data.GetDataPresent("ButtonText"))
            {
                string text = (string)e.Data.GetData("ButtonText");
                var btn = CreateDroppedButton(text, row);
                // 텍스트 영역(아이콘 영역 오른쪽)에 배치, 수직 중앙
                int minX = IconZoneWidth + 4;
                btn.Location = new Point(
                    Math.Max(minX, Math.Min(pt.X - btn.Width / 2, row.Width - btn.Width)),
                    (row.Height - btn.Height) / 2);
                row.Controls.Add(btn);
                btn.BringToFront();
            }
        }

        private void ShortcutBar_DragDrop(object sender, DragEventArgs e)
        {
            if (!e.Data.GetDataPresent("IconFilePath")) return;
            if (shortcutBar.Controls.Count >= 4)
            {
                MessageBox.Show("바로가기는 최대 4개까지 추가할 수 있습니다.",
                    "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            AddShortcutIcon((string)e.Data.GetData("IconFilePath"));
        }

        private void AddShortcutIcon(string filePath)
        {
            var pb = new PictureBox();
            pb.Image     = Image.FromFile(filePath);
            pb.SizeMode  = PictureBoxSizeMode.Zoom;
            pb.Width     = pb.Height = IconSize;
            pb.Tag       = filePath;
            pb.BackColor = Color.Transparent;
            pb.ContextMenuStrip = BuildRemoveMenu(pb, shortcutBar, RepositionShortcuts);
            shortcutBar.Controls.Add(pb);
            RepositionShortcuts();
        }

        private void RepositionShortcuts()
        {
            int count = shortcutBar.Controls.Count;
            if (count == 0) return;
            int slotW   = shortcutBar.Width / 4;
            int iconTop = (shortcutBar.Height - IconSize) / 2;
            for (int i = 0; i < count; i++)
                shortcutBar.Controls[i].Location =
                    new Point(slotW * i + (slotW - IconSize) / 2, iconTop);
        }

        private PictureBox CreateDroppedIcon(string filePath, Panel row)
        {
            var pb = new PictureBox();
            pb.Image     = Image.FromFile(filePath);
            pb.SizeMode  = PictureBoxSizeMode.Zoom;
            pb.Width     = pb.Height = IconSize;
            pb.Tag       = filePath;
            pb.Cursor    = Cursors.Default;
            pb.BackColor = Color.Transparent;
            pb.ContextMenuStrip = BuildRemoveMenu(pb, row);
            return pb;
        }

        private ContextMenuStrip BuildRemoveMenu(Control icon, Panel parent, Action onRemove = null)
        {
            var menu   = new ContextMenuStrip();
            var remove = new ToolStripMenuItem("제거");
            remove.Click += (s, e) =>
            {
                parent.Controls.Remove(icon);
                icon.Dispose();
                onRemove?.Invoke();
            };
            menu.Items.Add(remove);
            return menu;
        }

        // ── Color pickers ─────────────────────────────────────────────────

        private void TitleBgColorBtn_Click(object sender, EventArgs e)
        {
            if (mainTabControl.SelectedTab == popupTabPage)
            {
                if (!PickColor(_popupBgColor, out Color popupColor)) return;
                _popupBgColor = popupColor;
                titleBgColorBtn.BackColor = popupColor;
                if (_popupWindow != null)
                {
                    _popupWindow.BackColor = popupColor;
                    _popupWindow.Invalidate();
                }
                return;
            }
            if (!PickColor(titleBgColorBtn.BackColor, out Color screenColor)) return;
            titleBgColorBtn.BackColor  = screenColor;
            titleBar.BackColor         = screenColor;
            titleTextBox.BackColor     = screenColor;
        }

        private void ContentBgColorBtn_Click(object sender, EventArgs e)
        {
            if (mainTabControl.SelectedTab == popupTabPage)
            {
                Color baseColor = _popupTextDisplay != null ? _popupTextDisplay.BackColor : Color.FromArgb(245, 245, 245);
                if (!PickColor(baseColor, out Color popupColor)) return;
                contentBgColorBtn.BackColor = popupColor;
                if (_popupTextDisplay != null) _popupTextDisplay.BackColor = popupColor;
                return;
            }
            if (!PickColor(contentBgColorBtn.BackColor, out Color screenColor)) return;
            contentBgColorBtn.BackColor = screenColor;
            contentArea.BackColor       = screenColor;
            Color rowBg = LightenColor(screenColor, 20);
            if (_rowContainer != null) _rowContainer.BackColor = screenColor;
            if (_rowPanels != null)
                foreach (var row in _rowPanels) row.BackColor = rowBg;
            if (_rowTextBoxes != null)
                foreach (var rtb in _rowTextBoxes) rtb.BackColor = rowBg;
        }

        private void ShortcutBgColorBtn_Click(object sender, EventArgs e)
        {
            if (mainTabControl.SelectedTab == popupTabPage)
            {
                Color baseColor = Color.FromArgb(200, 200, 215);
                var firstSlot = _popupButtonGrid?.Controls.OfType<Panel>().FirstOrDefault();
                if (firstSlot != null) baseColor = firstSlot.BackColor;
                if (!PickColor(baseColor, out Color popupColor)) return;
                shortcutBgColorBtn.BackColor = popupColor;
                if (_popupButtonGrid != null)
                {
                    foreach (var slot in _popupButtonGrid.Controls.OfType<Panel>())
                        if (slot.Controls.Count == 0) slot.BackColor = popupColor;
                }
                return;
            }
            if (!PickColor(shortcutBgColorBtn.BackColor, out Color screenColor)) return;
            shortcutBgColorBtn.BackColor = screenColor;
            shortcutBar.BackColor        = screenColor;
        }

        private void TitleFgColorBtn_Click(object sender, EventArgs e)
        {
            if (mainTabControl.SelectedTab == popupTabPage)
            {
                Color baseColor = _popupTextDisplay != null ? _popupTextDisplay.ForeColor : Color.Black;
                if (!PickColor(baseColor, out Color popupColor)) return;
                titleFgColorBtn.BackColor = popupColor;
                if (_popupTextDisplay != null) _popupTextDisplay.ForeColor = popupColor;
                return;
            }
            if (!PickColor(titleFgColorBtn.BackColor, out Color screenColor)) return;
            titleFgColorBtn.BackColor = screenColor;
            titleTextBox.ForeColor    = screenColor;
        }

        private void ContentFgColorBtn_Click(object sender, EventArgs e)
        {
            if (mainTabControl.SelectedTab == popupTabPage)
            {
                Color baseColor = Color.Black;
                var firstButton = _popupButtonGrid?.Controls.OfType<Panel>()
                    .SelectMany(p => p.Controls.OfType<Button>())
                    .FirstOrDefault();
                if (firstButton != null) baseColor = firstButton.ForeColor;
                if (!PickColor(baseColor, out Color popupColor)) return;
                contentFgColorBtn.BackColor = popupColor;
                if (_popupButtonGrid != null)
                {
                    foreach (var btn in _popupButtonGrid.Controls.OfType<Panel>().SelectMany(p => p.Controls.OfType<Button>()))
                        btn.ForeColor = popupColor;
                }
                return;
            }
            if (!PickColor(contentFgColorBtn.BackColor, out Color screenColor)) return;
            contentFgColorBtn.BackColor = screenColor;
            if (_rowTextBoxes != null)
                foreach (var rtb in _rowTextBoxes) rtb.ForeColor = screenColor;
        }

        /// <summary>Opens ColorDialog and returns the chosen color.</summary>
        private static bool PickColor(Color initial, out Color result)
        {
            using (var dlg = new ColorDialog())
            {
                dlg.Color            = initial;
                dlg.FullOpen         = true;
                dlg.AllowFullOpen    = true;
                if (dlg.ShowDialog() == DialogResult.OK)
                {
                    result = dlg.Color;
                    return true;
                }
            }
            result = initial;
            return false;
        }

        // ── Save as Image ─────────────────────────────────────────────────

        private void SaveImageButton_Click(object sender, EventArgs e)
        {
            using (var dlg = new SaveFileDialog())
            {
                dlg.Title      = "이미지로 저장";
                dlg.Filter     = "PNG 이미지 (*.png)|*.png|JPEG 이미지 (*.jpg)|*.jpg";
                dlg.DefaultExt = "png";
                if (dlg.ShowDialog() != DialogResult.OK) return;

                Control target = mainTabControl.SelectedTab == popupTabPage
                    ? (Control)popupPreviewOuter
                    : lvglPreview;

                using (var bmp = new Bitmap(target.Width, target.Height))
                {
                    target.DrawToBitmap(bmp, new Rectangle(0, 0, target.Width, target.Height));
                    var fmt = dlg.FilterIndex == 2
                        ? System.Drawing.Imaging.ImageFormat.Jpeg
                        : System.Drawing.Imaging.ImageFormat.Png;
                    bmp.Save(dlg.FileName, fmt);
                }

                MessageBox.Show($"이미지 저장 완료:\n{dlg.FileName}", "저장",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        // ── Save / Load ───────────────────────────────────────────────────

        private void MenuFileSave_Click(object sender, EventArgs e)
        {
            using (var dlg = new SaveFileDialog())
            {
                dlg.Title      = "레이아웃 저장";
                dlg.Filter     = "LVGL 레이아웃 파일 (*.lvgl)|*.lvgl|모든 파일 (*.*)|*.*";
                dlg.DefaultExt = "lvgl";
                if (dlg.ShowDialog() != DialogResult.OK) return;
                SaveLayout(dlg.FileName);
            }
        }

        private void MenuFileLoad_Click(object sender, EventArgs e)
        {
            using (var dlg = new OpenFileDialog())
            {
                dlg.Title  = "레이아웃 불러오기";
                dlg.Filter = "LVGL 레이아웃 파일 (*.lvgl)|*.lvgl|모든 파일 (*.*)|*.*";
                if (dlg.ShowDialog() != DialogResult.OK) return;
                LoadLayout(dlg.FileName);
            }
        }

        private void MenuFileExit_Click(object sender, EventArgs e) => Close();

        // ── Serialisation helpers ─────────────────────────────────────────

        private static string AlignToString(HorizontalAlignment a) =>
            a == HorizontalAlignment.Center ? "Center" :
            a == HorizontalAlignment.Right  ? "Right"  : "Left";

        private static HorizontalAlignment StringToAlign(string s) =>
            s == "Center" ? HorizontalAlignment.Center :
            s == "Right"  ? HorizontalAlignment.Right  :
            HorizontalAlignment.Left;

        private static string ColorToHex(Color c) => $"#{c.R:X2}{c.G:X2}{c.B:X2}";

        private static Color HexToColor(string hex, Color fallback)
        {
            try { if (!string.IsNullOrEmpty(hex)) return ColorTranslator.FromHtml(hex); }
            catch { }
            return fallback;
        }

        private void SaveLayout(string filePath)
        {
            var data = new ScreenData
            {
                TitleText        = titleTextBox.Text,
                TitleFontSize    = (int)Math.Round(titleTextBox.Font.SizeInPoints),
                TitleAlignment   = AlignToString(titleTextBox.TextAlign),
                TitleLeftIconPath  = GetZoneIconPath(titleLeftIconZone),
                TitleRightIconPath = GetZoneIconPath(titleRightIconZone),
                TitleBarBgColor  = ColorToHex(titleBar.BackColor),
                TitleBarFgColor  = ColorToHex(titleTextBox.ForeColor),
                ContentBgColor   = ColorToHex(contentArea.BackColor),
                ContentFgColor   = ColorToHex(_rowTextBoxes != null && _rowTextBoxes.Length > 0
                                       ? _rowTextBoxes[0].ForeColor : Color.White),
                ShortcutBarBgColor = ColorToHex(shortcutBar.BackColor),
                Rows             = BuildRowData(),
                ShortcutIcons    = BuildShortcutData(),
                Popup            = BuildPopupData()
            };

            var xs = new XmlSerializer(typeof(ScreenData));
            using (var w = new StreamWriter(filePath))
                xs.Serialize(w, data);

            MessageBox.Show($"저장 완료:\n{filePath}", "저장",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private RowData[] BuildRowData()
        {
            var rows = new RowData[RowCount];
            for (int i = 0; i < RowCount; i++)
            {
                var rtb = _rowTextBoxes[i];
                rows[i] = new RowData
                {
                    Text        = rtb.Text,
                    FontSize    = (int)Math.Round((rtb.SelectionFont ?? rtb.Font).SizeInPoints),
                    Alignment   = AlignToString(rtb.SelectionAlignment),
                    BgColor     = ColorToHex(_rowPanels[i].BackColor),
                    BorderColor = ColorToHex(_rowBorderColors[i]),
                    BorderWidth = _rowBorderWidths[i],
                    Icons       = _rowPanels[i].Controls
                        .OfType<PictureBox>()
                        .Select(pb => new IconData
                        {
                            FilePath = pb.Tag as string,
                            X        = pb.Left,
                            Y        = pb.Top
                        })
                        .ToArray(),
                    Buttons     = _rowPanels[i].Controls
                        .OfType<Button>()
                        .Select(b => new ButtonData
                        {
                            Text        = b.Text,
                            X           = b.Left,
                            Y           = b.Top,
                            BgColor     = ColorToHex(b.BackColor),
                            FgColor     = ColorToHex(b.ForeColor),
                            BorderColor = ColorToHex(b.FlatAppearance.BorderColor),
                            BorderWidth = b.FlatAppearance.BorderSize
                        })
                        .ToArray()
                };
            }
            return rows;
        }

        private IconData[] BuildShortcutData()
        {
            return shortcutBar.Controls
                .OfType<PictureBox>()
                .Select(pb => new IconData { FilePath = pb.Tag as string })
                .ToArray();
        }

        private PopupData BuildPopupData()
        {
            return new PopupData
            {
                PopupTitleText = _popupTitleDisplay?.Text ?? string.Empty,
                PopupTitleLeftIconPath  = GetZoneIconPath(_popupTitleLeftIconZone),
                PopupTitleRightIconPath = GetZoneIconPath(_popupTitleRightIconZone),
                Columns        = _popupColumns,
                Rows           = _popupRows,
                OverlayOpacity = _popupOverlayOpacity,
                PopupBgColor   = ColorToHex(_popupBgColor),
                BorderColor    = ColorToHex(_popupBorderColor),
                BorderWidth    = _popupBorderWidth,
                TextFontSize   = _popupTextFontSize,
                TextRows       = _popupTextRows,
                TextBgColor    = ColorToHex(_popupTextDisplay?.BackColor ?? Color.FromArgb(245, 245, 245)),
                TextFgColor    = ColorToHex(_popupTextDisplay?.ForeColor ?? Color.Black),
                GridBgColor    = ColorToHex(_popupButtonGrid?.Controls.OfType<Panel>().FirstOrDefault()?.BackColor ?? Color.FromArgb(200, 200, 215)),
                Buttons        = BuildPopupButtonData()
            };
        }

        private ButtonData[] BuildPopupButtonData()
        {
            if (_popupButtonGrid == null) return new ButtonData[0];
            return _popupButtonGrid.Controls.OfType<Panel>()
                .Select((slot, idx) => new { slot, idx })
                .Where(x => x.slot.Controls.Count > 0 && x.slot.Controls[0] is Button)
                .Select(x =>
                {
                    var btn = (Button)x.slot.Controls[0];
                    return new ButtonData
                    {
                        Text        = btn.Text,
                        X           = x.idx % _popupColumns,
                        Y           = x.idx / _popupColumns,
                        BgColor     = ColorToHex(btn.BackColor),
                        FgColor     = ColorToHex(btn.ForeColor),
                        BorderColor = ColorToHex(btn.FlatAppearance.BorderColor),
                        BorderWidth = btn.FlatAppearance.BorderSize
                    };
                })
                .ToArray();
        }

        private static string GetZoneIconPath(Panel zone) =>
            zone?.Controls.OfType<PictureBox>().FirstOrDefault()?.Tag as string;

        private void RestoreZoneIcon(Panel zone, string filePath)
        {
            if (zone == null) return;
            foreach (Control c in zone.Controls.OfType<PictureBox>().ToList())
            { zone.Controls.Remove(c); c.Dispose(); }

            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return;

            var pb = new PictureBox();
            pb.Image    = Image.FromFile(filePath);
            pb.SizeMode = PictureBoxSizeMode.Zoom;
            pb.Width    = pb.Height = IconSize;
            pb.Tag      = filePath;
            pb.Cursor   = Cursors.Default;
            pb.BackColor = Color.Transparent;
            pb.Location = new Point(
                (zone.Width  - IconSize) / 2,
                (zone.Height - IconSize) / 2);
            pb.ContextMenuStrip = BuildRemoveMenu(pb, zone);
            zone.Controls.Add(pb);
        }

        private void LoadLayout(string filePath)
        {
            ScreenData data;
            var xs = new XmlSerializer(typeof(ScreenData));
            using (var r = new StreamReader(filePath))
                data = (ScreenData)xs.Deserialize(r);

            if (_rowContainer != null) _rowContainer.Top = 0;

            // Colors
            Color titleBg = HexToColor(data.TitleBarBgColor,   Color.FromArgb(64, 64, 64));
            Color titleFg = HexToColor(data.TitleBarFgColor,   Color.White);
            Color contBg  = HexToColor(data.ContentBgColor,    Color.White);
            Color contFg  = HexToColor(data.ContentFgColor,    Color.Black);
            Color shortBg = HexToColor(data.ShortcutBarBgColor, Color.White);

            titleBar.BackColor         = titleBg;
            titleTextBox.BackColor     = titleBg;
            titleTextBox.ForeColor     = titleFg;
            titleBgColorBtn.BackColor  = titleBg;
            titleFgColorBtn.BackColor  = titleFg;

            contentArea.BackColor       = contBg;
            contentBgColorBtn.BackColor = contBg;
            contentFgColorBtn.BackColor = contFg;
            Color rowBg = LightenColor(contBg, 20);
            if (_rowContainer  != null) _rowContainer.BackColor = contBg;
            if (_rowPanels     != null) foreach (var row in _rowPanels) row.BackColor = rowBg;
            if (_rowTextBoxes  != null) foreach (var rtb in _rowTextBoxes)
                { rtb.BackColor = rowBg; rtb.ForeColor = contFg; }

            shortcutBar.BackColor        = shortBg;
            shortcutBgColorBtn.BackColor = shortBg;

            // Title icon zones
            RestoreZoneIcon(titleLeftIconZone,  data.TitleLeftIconPath);
            RestoreZoneIcon(titleRightIconZone, data.TitleRightIconPath);

            // Title text
            titleTextBox.Text = data.TitleText ?? string.Empty;
            if (data.TitleFontSize > 0)
            {
                var font = new Font("Segoe UI", data.TitleFontSize, FontStyle.Bold);
                titleTextBox.Font = font;
                int newH = font.Height + 8;
                int newY = (titleBar.Height - newH) / 2;
                titleTextBox.SetBounds(titleTextBox.Left, newY, titleTextBox.Width, newH);
            }
            var titleAlign = StringToAlign(data.TitleAlignment);
            titleTextBox.TextAlign = titleAlign;
            if (_activeTextControl == titleTextBox)
                UpdateAlignmentButtons(titleAlign);

            // Rows
            for (int i = 0; i < RowCount; i++)
            {
                // Clear icons and buttons
                var icons = _rowPanels[i].Controls.OfType<PictureBox>().ToList();
                icons.ForEach(pb => { _rowPanels[i].Controls.Remove(pb); pb.Dispose(); });
                var btns = _rowPanels[i].Controls.OfType<Button>().ToList();
                btns.ForEach(b => { _rowPanels[i].Controls.Remove(b); b.Dispose(); });

                if (data.Rows == null || i >= data.Rows.Length) continue;
                var rowData = data.Rows[i];
                var rtb     = _rowTextBoxes[i];

                // Per-row colors and border
                Color rBg = HexToColor(rowData.BgColor, _rowPanels[i].BackColor);
                _rowPanels[i].BackColor = rBg;
                _rowTextBoxes[i].BackColor = rBg;
                if (!string.IsNullOrEmpty(rowData.BorderColor))
                    _rowBorderColors[i] = HexToColor(rowData.BorderColor, _rowBorderColors[i]);
                if (rowData.BorderWidth > 0)
                    _rowBorderWidths[i] = rowData.BorderWidth;
                _rowPanels[i].Invalidate();

                rtb.Text = rowData.Text ?? string.Empty;
                if (rowData.FontSize > 0)
                {
                    var font = new Font("Segoe UI", rowData.FontSize);
                    rtb.Font = font;
                    rtb.SelectAll();
                    rtb.SelectionFont = font;
                    rtb.Select(0, 0);
                    int newH = font.Height + 8;
                    int newY = (RowHeight - newH) / 2;
                    rtb.SetBounds(rtb.Left, newY, rtb.Width, newH);
                }

                var align = StringToAlign(rowData.Alignment);
                rtb.SelectAll();
                rtb.SelectionAlignment = align;
                rtb.Select(0, 0);

                if (rowData.Icons != null)
                {
                    foreach (var iconData in rowData.Icons)
                    {
                        if (!File.Exists(iconData.FilePath)) { ShowMissingFileWarning(iconData.FilePath); continue; }
                        var pb = CreateDroppedIcon(iconData.FilePath, _rowPanels[i]);
                        int x = iconData.X;
                        int y = iconData.Y;
                        if (x == 0 && y == 0)
                        {
                            x = (IconZoneWidth - IconSize) / 2;
                            y = (_rowPanels[i].Height - IconSize) / 2;
                        }
                        x = Math.Max(0, Math.Min(x, _rowPanels[i].Width - IconSize));
                        y = Math.Max(0, Math.Min(y, _rowPanels[i].Height - IconSize));
                        pb.Location = new Point(x, y);
                        _rowPanels[i].Controls.Add(pb);
                        pb.BringToFront();
                    }
                }

                if (rowData.Buttons != null)
                {
                    foreach (var bd in rowData.Buttons)
                    {
                        var btn = CreateDroppedButton(bd.Text, _rowPanels[i],
                            HexToColor(bd.BgColor,     Color.FromArgb(220, 220, 230)),
                            HexToColor(bd.FgColor,     Color.Black),
                            HexToColor(bd.BorderColor, Color.FromArgb(160, 160, 180)),
                            bd.BorderWidth > 0 ? bd.BorderWidth : 1);
                        btn.Location = new Point(bd.X, bd.Y);
                        _rowPanels[i].Controls.Add(btn);
                        btn.BringToFront();
                    }
                }
            }

            // Shortcut bar
            var shortcuts = shortcutBar.Controls.OfType<PictureBox>().ToList();
            shortcuts.ForEach(pb => { shortcutBar.Controls.Remove(pb); pb.Dispose(); });
            if (data.ShortcutIcons != null)
            {
                foreach (var iconData in data.ShortcutIcons)
                {
                    if (!File.Exists(iconData.FilePath)) { ShowMissingFileWarning(iconData.FilePath); continue; }
                    AddShortcutIcon(iconData.FilePath);
                }
            }

            ApplyPopupData(data.Popup);
        }

        private void ApplyPopupData(PopupData popup)
        {
            if (popup == null) return;

            _popupColumns        = Math.Max(1, popup.Columns);
            _popupRows           = Math.Max(1, popup.Rows);
            _popupOverlayOpacity = Math.Max(0, Math.Min(100, popup.OverlayOpacity));
            _popupBgColor        = HexToColor(popup.PopupBgColor, _popupBgColor);
            _popupBorderColor    = HexToColor(popup.BorderColor, _popupBorderColor);
            _popupBorderWidth    = Math.Max(0, popup.BorderWidth);
            _popupTextFontSize   = popup.TextFontSize > 0 ? popup.TextFontSize : _popupTextFontSize;
            _popupTextRows       = popup.TextRows > 0 ? popup.TextRows : _popupTextRows;

            UpdatePopupOverlay();
            UpdatePopupWindow();

            if (_popupTextDisplay != null)
            {
                _popupTextDisplay.Font = new Font("Segoe UI", _popupTextFontSize, _popupTextDisplay.Font.Style);
                _popupTextDisplay.Multiline = _popupTextRows > 1;
                _popupTextDisplay.BackColor = HexToColor(popup.TextBgColor, _popupTextDisplay.BackColor);
                _popupTextDisplay.ForeColor = HexToColor(popup.TextFgColor, _popupTextDisplay.ForeColor);
            }
            if (_popupTitleDisplay != null)
                _popupTitleDisplay.Text = popup.PopupTitleText ?? string.Empty;
            RestoreZoneIcon(_popupTitleLeftIconZone,  popup.PopupTitleLeftIconPath);
            RestoreZoneIcon(_popupTitleRightIconZone, popup.PopupTitleRightIconPath);

            Color gridBg = HexToColor(popup.GridBgColor, Color.FromArgb(200, 200, 215));
            if (_popupButtonGrid != null)
            {
                foreach (var slot in _popupButtonGrid.Controls.OfType<Panel>())
                    if (slot.Controls.Count == 0) slot.BackColor = gridBg;
            }

            if (popup.Buttons != null)
            {
                foreach (var bd in popup.Buttons)
                {
                    int idx = bd.Y * _popupColumns + bd.X;
                    if (_popupButtonGrid == null || idx < 0 || idx >= _popupButtonGrid.Controls.Count) continue;
                    var slot = _popupButtonGrid.Controls[idx] as Panel;
                    if (slot == null) continue;
                    SetSlotContent(slot, bd.Text,
                        HexToColor(bd.BgColor, Color.FromArgb(220, 220, 230)),
                        HexToColor(bd.FgColor, Color.Black),
                        HexToColor(bd.BorderColor, Color.FromArgb(160, 160, 180)),
                        bd.BorderWidth > 0 ? bd.BorderWidth : 1);
                }
            }
        }

        // ── Popup tab ─────────────────────────────────────────────────────

        private void InitializePopupTab()
        {
            const int LY1 = 11, CY1 = 8, LY2 = 39, CY2 = 36;

            // Row 1: Columns / Rows / Opacity
            var colsLabel = PopupLabel("열 수:", 10, LY1);
            var colsCombo = PopupCombo(new object[] { 1, 2, 3, 4 }, _popupColumns - 1, 65, CY1, 50);
            colsCombo.SelectedIndexChanged += (s, e) => { _popupColumns = (int)colsCombo.SelectedItem; UpdatePopupWindow(); };

            var rowsLabel = PopupLabel("행 수:", 132, LY1);
            var rowsCombo = PopupCombo(new object[] { 1, 2, 3, 4, 5, 6, 7, 8 }, _popupRows - 1, 185, CY1, 50);
            rowsCombo.SelectedIndexChanged += (s, e) => { _popupRows = (int)rowsCombo.SelectedItem; UpdatePopupWindow(); };

            var opacLabel = PopupLabel("불투명도:", 250, LY1);
            var opacItems = Enumerable.Range(1, 10).Select(i => (object)$"{i * 10}%").ToArray();
            var opacCombo = PopupCombo(opacItems, _popupOverlayOpacity / 10 - 1, 340, CY1, 70);
            opacCombo.SelectedIndexChanged += (s, e) =>
            {
                _popupOverlayOpacity = (opacCombo.SelectedIndex + 1) * 10;
                UpdatePopupOverlay();
            };

            // Row 2: BG Color / Border Color / Border Width
            var bgLbl = PopupLabel("팝업 배경:", 10, LY2);
            var bgBtn = PopupColorBtn(_popupBgColor, 95, CY2);
            bgBtn.Click += (s, e) =>
            {
                if (!PickColor(_popupBgColor, out Color c)) return;
                _popupBgColor = c;
                bgBtn.BackColor = c;
                if (_popupWindow != null) { _popupWindow.BackColor = c; _popupWindow.Invalidate(); }
            };

            var brdLbl = PopupLabel("테두리색:", 145, LY2);
            var brdBtn = PopupColorBtn(_popupBorderColor, 225, CY2);
            brdBtn.Click += (s, e) =>
            {
                if (!PickColor(_popupBorderColor, out Color c)) return;
                _popupBorderColor = c;
                brdBtn.BackColor  = c;
                _popupWindow?.Invalidate();
            };

            var wLbl   = PopupLabel("테두리 굵기:", 272, LY2);
            var wItems = new object[] { "0px", "1px", "2px", "3px", "4px", "5px" };
            var wCombo = PopupCombo(wItems, _popupBorderWidth, 375, CY2, 65);
            wCombo.SelectedIndexChanged += (s, e) => { _popupBorderWidth = wCombo.SelectedIndex; UpdatePopupWindow(); };

            var fsLbl = PopupLabel("폰트 크기:", 455, LY2);
            var fsNum = new NumericUpDown
            {
                Minimum   = 8, Maximum = 72, Value = _popupTextFontSize,
                Width     = 55, Height = 22,
                Location  = new Point(535, CY2),
                BackColor = Color.FromArgb(60, 60, 60),
                ForeColor = Color.FromArgb(220, 220, 220),
            };
            fsNum.ValueChanged += (s, e) =>
            {
                _popupTextFontSize = (int)fsNum.Value;
                if (_popupTextDisplay != null)
                    _popupTextDisplay.Font = new Font("Segoe UI", _popupTextFontSize);
                UpdatePopupWindow();
            };

            var trLbl = PopupLabel("입력창 행:", 600, LY2);
            var trNum = new NumericUpDown
            {
                Minimum   = 1, Maximum = 5, Value = _popupTextRows,
                Width     = 45, Height = 22,
                Location  = new Point(662, CY2),
                BackColor = Color.FromArgb(60, 60, 60),
                ForeColor = Color.FromArgb(220, 220, 220),
            };
            trNum.ValueChanged += (s, e) =>
            {
                _popupTextRows = (int)trNum.Value;
                if (_popupTextDisplay != null)
                    _popupTextDisplay.Multiline = _popupTextRows > 1;
                UpdatePopupWindow();
            };

            popupSettingsBar.Controls.AddRange(new Control[]
            {
                colsLabel, colsCombo, rowsLabel, rowsCombo, opacLabel, opacCombo,
                bgLbl, bgBtn, brdLbl, brdBtn, wLbl, wCombo, fsLbl, fsNum, trLbl, trNum
            });

            // Popup window and button grid
            _popupButtonGrid = new Panel();

            // Text display (shows simulated input as buttons are clicked)
            _popupTitleDisplay = new TextBox
            {
                BackColor   = Color.FromArgb(245, 245, 245),
                ForeColor   = Color.Black,
                Font        = new Font("Segoe UI", 18, FontStyle.Bold),
                BorderStyle = BorderStyle.None,
                TextAlign   = HorizontalAlignment.Center,
                Multiline   = false,
                Text        = "",
            };
            TrackFocusOn(_popupTitleDisplay);

            _popupTitleLeftIconZone = new Panel
            {
                BackColor = Color.Transparent
            };
            _popupTitleRightIconZone = new Panel
            {
                BackColor = Color.Transparent
            };
            SetupTitleIconZone(_popupTitleLeftIconZone);
            SetupTitleIconZone(_popupTitleRightIconZone);

            _popupTextDisplay = new TextBox
            {
                BackColor   = Color.FromArgb(245, 245, 245),
                ForeColor   = Color.Black,
                Font        = new Font("Segoe UI", _popupTextFontSize),
                BorderStyle = BorderStyle.FixedSingle,
                TextAlign   = HorizontalAlignment.Left,
                Multiline   = _popupTextRows > 1,
                ScrollBars  = ScrollBars.None,
                Text        = "",
            };
            TrackFocusOn(_popupTextDisplay);
            var titleMenu = new ContextMenuStrip();
            var titleClearItem = new ToolStripMenuItem("제목 지우기");
            titleClearItem.Click += (s, e) => { if (_popupTitleDisplay != null) _popupTitleDisplay.Text = ""; };
            titleMenu.Items.Add(titleClearItem);
            _popupTitleDisplay.ContextMenuStrip = titleMenu;

            var clearMenu = new ContextMenuStrip();
            var clearItem = new ToolStripMenuItem("지우기 (Clear)");
            clearItem.Click += (s, e) => { if (_popupTextDisplay != null) _popupTextDisplay.Text = ""; };
            clearMenu.Items.Add(clearItem);
            _popupTextDisplay.ContextMenuStrip = clearMenu;

            _popupWindow = new Panel();
            _popupWindow.Paint += (s, pe) =>
            {
                if (_popupBorderWidth <= 0) return;
                var rc = _popupWindow.ClientRectangle;
                using (var pen = new Pen(_popupBorderColor, _popupBorderWidth))
                {
                    int half = _popupBorderWidth / 2;
                    pe.Graphics.DrawRectangle(pen, half, half,
                        rc.Width - _popupBorderWidth, rc.Height - _popupBorderWidth);
                }
            };
            _popupWindow.Controls.Add(_popupTitleLeftIconZone);
            _popupWindow.Controls.Add(_popupTitleRightIconZone);
            _popupWindow.Controls.Add(_popupTitleDisplay);
            _popupWindow.Controls.Add(_popupTextDisplay);
            _popupWindow.Controls.Add(_popupButtonGrid);
            popupPreviewOuter.Controls.Add(_popupWindow);

            UpdatePopupWindow();
            UpdatePopupOverlay();
        }

        private void UpdatePopupOverlay()
        {
            // Higher opacity → darker background (255=white … 40=near-black)
            int level = (int)(240 - _popupOverlayOpacity * 2.0);
            level = Math.Max(20, Math.Min(240, level));
            popupPreviewOuter.BackColor = Color.FromArgb(level, level, level);
        }

        private void UpdatePopupWindow()
        {
            if (_popupWindow == null || _popupButtonGrid == null) return;

            // 제목행 + 입력창 + 버튼영역 레이아웃
            const int BtnW = 80, BtnH = 60, BtnGap = 4, Pad = 8, TitleGap = 8, TextGap = 14;
            int lineH     = (int)(_popupTextFontSize * 1.4f) + 4;
            int titleAreaH = 34;
            int textAreaH = _popupTextRows * lineH + 4;
            int innerW = _popupColumns * BtnW + (_popupColumns - 1) * BtnGap;
            int innerH = _popupRows    * BtnH + (_popupRows    - 1) * BtnGap;
            int bw     = _popupBorderWidth;
            int totalW = innerW + 2 * Pad + 2 * bw;
            int totalH = titleAreaH + TitleGap + textAreaH + TextGap + innerH + 2 * Pad + 2 * bw;

            int cx = (popupPreviewOuter.Width  - totalW) / 2;
            int cy = (popupPreviewOuter.Height - totalH) / 2;
            _popupWindow.SetBounds(Math.Max(0, cx), Math.Max(0, cy), totalW, totalH);
            _popupWindow.BackColor = _popupBgColor;

            _popupTitleLeftIconZone?.SetBounds(bw + Pad, bw + Pad, IconZoneWidth, titleAreaH);
            _popupTitleRightIconZone?.SetBounds(bw + Pad + innerW - IconZoneWidth, bw + Pad, IconZoneWidth, titleAreaH);
            _popupTitleDisplay?.SetBounds(bw + Pad, bw + Pad, innerW, titleAreaH);
            _popupTextDisplay?.SetBounds(bw + Pad, bw + Pad + titleAreaH + TitleGap, innerW, textAreaH);
            _popupButtonGrid.SetBounds(bw + Pad, bw + Pad + titleAreaH + TitleGap + textAreaH + TextGap, innerW, innerH);
            _popupTitleLeftIconZone?.BringToFront();
            _popupTitleRightIconZone?.BringToFront();

            BuildPopupGrid();
            _popupWindow.Invalidate();
        }

        private void BuildPopupGrid()
        {
            if (_popupButtonGrid == null) return;
            const int BtnW = 80, BtnH = 60, BtnGap = 4;

            // Save existing slot texts so they survive a settings change
            var saved = new string[_popupColumns * _popupRows];
            int prev  = _popupButtonGrid.Controls.Count;
            for (int i = 0; i < prev && i < saved.Length; i++)
            {
                if (_popupButtonGrid.Controls[i] is Panel slot && slot.Controls.Count > 0)
                    saved[i] = (slot.Controls[0] as Button)?.Text ?? "";
            }

            _popupButtonGrid.Controls.Clear();

            for (int r = 0; r < _popupRows; r++)
            {
                for (int c = 0; c < _popupColumns; c++)
                {
                    int idx  = r * _popupColumns + c;
                    int x    = c * (BtnW + BtnGap);
                    int y    = r * (BtnH + BtnGap);
                    var slot = CreateGridSlot(x, y, BtnW, BtnH);
                    _popupButtonGrid.Controls.Add(slot);
                    if (idx < saved.Length && !string.IsNullOrEmpty(saved[idx]))
                        SetSlotContent(slot, saved[idx]);
                }
            }
        }

        private Panel CreateGridSlot(int x, int y, int w, int h)
        {
            var slot = new Panel
            {
                Location    = new Point(x, y),
                Size        = new Size(w, h),
                BackColor   = Color.FromArgb(200, 200, 215),
                BorderStyle = BorderStyle.FixedSingle,
                AllowDrop   = true,
            };
            slot.DragEnter += DropTarget_DragEnter;
            slot.DragDrop  += (s, e) =>
            {
                if (e.Data.GetDataPresent("ButtonText"))
                    SetSlotContent(slot, (string)e.Data.GetData("ButtonText"));
            };
            return slot;
        }

        private void SetSlotContent(Panel slot, string text, Color? bgColor = null, Color? fgColor = null, Color? borderColor = null, int borderWidth = 1)
        {
            text = NormalizeCheonjiinLabel(text);
            slot.Controls.Clear();
            if (string.IsNullOrEmpty(text))
            {
                slot.BackColor = Color.FromArgb(200, 200, 215);
                return;
            }
            var btn = new Button
            {
                Text      = text,
                Dock      = DockStyle.Fill,
                Font      = new Font("Segoe UI", 16, FontStyle.Bold),
                BackColor = bgColor ?? Color.FromArgb(220, 220, 230),
                ForeColor = fgColor ?? Color.Black,
                FlatStyle = FlatStyle.Flat,
                Margin    = new Padding(0),
                Cursor    = Cursors.Hand,
                UseVisualStyleBackColor = false,
            };
            btn.FlatAppearance.BorderColor = borderColor ?? Color.FromArgb(160, 160, 180);
            btn.FlatAppearance.BorderSize = borderWidth;
            btn.Click += (s, ev) => { if (_popupTextDisplay != null) _popupTextDisplay.Text += text; };

            var menu      = new ContextMenuStrip();
            var clearItem = new ToolStripMenuItem("지우기");
            clearItem.Click += (s, ev) => SetSlotContent(slot, "");
            var bgItem = new ToolStripMenuItem("배경색 변경");
            bgItem.Click += (s, ev) => { if (PickColor(btn.BackColor, out Color c)) btn.BackColor = c; };
            var fgItem = new ToolStripMenuItem("글자색 변경");
            fgItem.Click += (s, ev) => { if (PickColor(btn.ForeColor, out Color c)) btn.ForeColor = c; };
            menu.Items.Add(clearItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(bgItem);
            menu.Items.Add(fgItem);
            btn.ContextMenuStrip  = menu;
            slot.ContextMenuStrip = menu;
            slot.Controls.Add(btn);
            slot.BackColor = _popupBgColor;
        }

        // ── Popup tab helper factories ─────────────────────────────────────

        private static Label PopupLabel(string text, int x, int y) => new Label
        {
            Text      = text,
            ForeColor = Color.FromArgb(200, 200, 200),
            Font      = new Font("Segoe UI", 8.5f),
            AutoSize  = true,
            Location  = new Point(x, y),
        };

        private static ComboBox PopupCombo(object[] items, int selectedIndex, int x, int y, int width)
        {
            var cb = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Location      = new Point(x, y),
                Size          = new Size(width, 20),
                BackColor     = Color.FromArgb(60, 60, 60),
                ForeColor     = Color.White,
                FlatStyle     = FlatStyle.Flat,
            };
            cb.Items.AddRange(items);
            if (selectedIndex >= 0 && selectedIndex < items.Length)
                cb.SelectedIndex = selectedIndex;
            return cb;
        }

        private static Button PopupColorBtn(Color color, int x, int y)
        {
            var btn = new Button
            {
                BackColor = color,
                Cursor    = Cursors.Hand,
                FlatStyle = FlatStyle.Flat,
                Location  = new Point(x, y),
                Size      = new Size(32, 22),
                UseVisualStyleBackColor = false,
            };
            btn.FlatAppearance.BorderColor = Color.FromArgb(150, 150, 150);
            return btn;
        }

        // ── Tab control drawing ───────────────────────────────────────────

        private void MainTabControl_DrawItem(object sender, DrawItemEventArgs e)
        {
            var tab  = (TabControl)sender;
            var page = tab.TabPages[e.Index];
            bool selected = (e.Index == tab.SelectedIndex);

            Color bgColor = selected
                ? Color.FromArgb(45, 45, 48)
                : Color.FromArgb(30, 30, 32);

            using (var bgBrush = new SolidBrush(bgColor))
                e.Graphics.FillRectangle(bgBrush, e.Bounds);

            if (selected)
            {
                using (var pen = new Pen(Color.FromArgb(0, 122, 204), 2))
                    e.Graphics.DrawLine(pen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right - 1, e.Bounds.Bottom - 1);
            }

            Color textColor = selected ? Color.White : Color.FromArgb(160, 160, 160);
            using (var textBrush = new SolidBrush(textColor))
            {
                var font = new Font("Segoe UI", 10f, selected ? FontStyle.Bold : FontStyle.Regular);
                var sf   = new StringFormat
                {
                    Alignment     = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };
                e.Graphics.DrawString(page.Text, font, textBrush, e.Bounds, sf);
            }
        }

        private void MainTabControl_SelectedIndexChanged(object sender, EventArgs e)
        {
            UpdateSettingsMenuBySelectedTab();
        }

        private void UpdateSettingsMenuBySelectedTab()
        {
            // Shared top toolbar stays visible for both tabs.
            editorToolbar.Visible = true;
            int tabTop = editorToolbar.Bottom;
            mainTabControl.Top = tabTop;
            mainTabControl.Height = ClientSize.Height - mainTabControl.Top;
            mainTabControl.BringToFront();

            if (mainTabControl.SelectedTab == popupTabPage)
            {
                int idx = fontSizeCombo.Items.IndexOf(_popupTextFontSize);
                if (idx >= 0) fontSizeCombo.SelectedIndex = idx;
                titleBgColorBtn.BackColor = _popupBgColor;
                contentBgColorBtn.BackColor = _popupTextDisplay?.BackColor ?? Color.FromArgb(245, 245, 245);
                shortcutBgColorBtn.BackColor = _popupButtonGrid?.Controls.OfType<Panel>().FirstOrDefault()?.BackColor ?? Color.FromArgb(200, 200, 215);
                titleFgColorBtn.BackColor = _popupTextDisplay?.ForeColor ?? Color.Black;
                contentFgColorBtn.BackColor = _popupButtonGrid?.Controls.OfType<Panel>().SelectMany(p => p.Controls.OfType<Button>()).FirstOrDefault()?.ForeColor ?? Color.Black;
                if (_popupTextDisplay != null)
                {
                    UpdateAlignmentButtons(_popupTextDisplay.TextAlign);
                    UpdateBoldButton(_popupTextDisplay.Font.Bold);
                }
            }
            else
            {
                titleBgColorBtn.BackColor = titleBar.BackColor;
                contentBgColorBtn.BackColor = contentArea.BackColor;
                shortcutBgColorBtn.BackColor = shortcutBar.BackColor;
                titleFgColorBtn.BackColor = titleTextBox.ForeColor;
                contentFgColorBtn.BackColor = _rowTextBoxes != null && _rowTextBoxes.Length > 0 ? _rowTextBoxes[0].ForeColor : Color.Black;
            }
        }

        private bool _missingFileWarningShown;
        private void ShowMissingFileWarning(string path)
        {
            if (_missingFileWarningShown) return;
            _missingFileWarningShown = true;
            MessageBox.Show($"아이콘 파일을 찾을 수 없어 건너뜁니다:\n{path}",
                "경고", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            _missingFileWarningShown = false;
        }
    }
}
