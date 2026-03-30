using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using System.Xml.Serialization;

namespace LVLGEditor1._0
{
    public partial class Form1 : Form
    {
        private const int RowCount     = 10;
        private const int RowHeight    = 80;
        private const int RowGap       = 5;
        private const int IconSize     = 60;
        private const int IconZoneWidth = 80;   // 아이콘 전용 영역 너비

        // Row controls (RichTextBox for full alignment support)
        private Panel[]        _rowPanels;
        private RichTextBox[]  _rowTextBoxes;
        private Color[]        _rowBorderColors;
        private int[]          _rowBorderWidths;
        private Panel          _rowContainer;

        // Scroll state
        private bool _scrollDragging;
        private int  _scrollStartScreenY;
        private int  _scrollStartContainerTop;

        // Active text control (TextBox = title, RichTextBox = row)
        private Control _activeTextControl;

        // ── Constructor ───────────────────────────────────────────────────

        public Form1()
        {
            InitializeComponent();
            SetupDropTargets();
            TrackFocusOn(titleTextBox);
            LoadIconsFromFolder(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "icons"));
            InitializeButtonPalette();
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

            _rowContainer = new Panel();
            _rowContainer.Width    = contentArea.ClientSize.Width;
            _rowContainer.Height   = RowGap + RowCount * (RowHeight + RowGap);
            _rowContainer.Location = Point.Empty;
            _rowContainer.BackColor = contentArea.BackColor;
            AttachScrollHandlers(_rowContainer);
            contentArea.Controls.Add(_rowContainer);
            contentArea.MouseWheel += WheelScroll;

            Color rowBg        = LightenColor(contentArea.BackColor, 20);
            Color defaultBorder = Color.FromArgb(80, 0, 0, 0);

            for (int i = 0; i < RowCount; i++)
            {
                int idx  = i;   // capture for closures
                int rowX = 4;
                int rowY = RowGap + i * (RowHeight + RowGap);
                int rowW = _rowContainer.Width - 8;

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
                rtb.SetBounds(IconZoneWidth + 4, rtbY, rowW - IconZoneWidth - 8, rtbH);
                rtb.BorderStyle  = BorderStyle.None;
                rtb.BackColor    = rowBg;
                rtb.ForeColor    = Color.Black;
                rtb.Font         = font;
                rtb.ScrollBars   = RichTextBoxScrollBars.None;
                rtb.Multiline    = true;
                rtb.DetectUrls   = false;
                rtb.SelectionAlignment = HorizontalAlignment.Left;
                rtb.MouseWheel  += WheelScroll;
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
            int minTop = Math.Min(0, contentArea.ClientSize.Height - _rowContainer.Height);
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
            int minTop = Math.Min(0, contentArea.ClientSize.Height - _rowContainer.Height);
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
            if (_activeTextControl is RichTextBox rtb)
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

            if (_activeTextControl is RichTextBox rtb)
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
            if (_activeTextControl is RichTextBox rtb)
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
                ("천지인", new[] { "ㅣ","·","ㅡ","ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ" }),
                ("영문 대문자", Enumerable.Range('A', 26).Select(c => ((char)c).ToString()).ToArray()),
                ("영문 소문자", Enumerable.Range('a', 26).Select(c => ((char)c).ToString()).ToArray()),
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
                    buttonPalette.Controls.Add(CreatePaletteButton(text));
            }
        }

        private Button CreatePaletteButton(string text)
        {
            var btn = new Button
            {
                Text      = text,
                Size      = new Size(80, 60),
                Font      = new Font("Segoe UI", 16, FontStyle.Bold),
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
                if (dlg.ShowDialog() == DialogResult.OK)
                    LoadIconsFromFolder(dlg.SelectedPath);
            }
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
            var row = (Panel)sender;
            var pt  = row.PointToClient(new Point(e.X, e.Y));

            if (e.Data.GetDataPresent("IconFilePath"))
            {
                string filePath = (string)e.Data.GetData("IconFilePath");
                var pb = CreateDroppedIcon(filePath, row);
                // 아이콘 영역(80×80) 중앙에 배치
                pb.Location = new Point(
                    (IconZoneWidth - IconSize) / 2,
                    (row.Height   - IconSize) / 2);
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
            if (!PickColor(titleBgColorBtn.BackColor, out Color c)) return;
            titleBgColorBtn.BackColor  = c;
            titleBar.BackColor         = c;
            titleTextBox.BackColor     = c;
        }

        private void ContentBgColorBtn_Click(object sender, EventArgs e)
        {
            if (!PickColor(contentBgColorBtn.BackColor, out Color c)) return;
            contentBgColorBtn.BackColor = c;
            contentArea.BackColor       = c;
            Color rowBg = LightenColor(c, 20);
            if (_rowContainer != null) _rowContainer.BackColor = c;
            if (_rowPanels != null)
                foreach (var row in _rowPanels) row.BackColor = rowBg;
            if (_rowTextBoxes != null)
                foreach (var rtb in _rowTextBoxes) rtb.BackColor = rowBg;
        }

        private void ShortcutBgColorBtn_Click(object sender, EventArgs e)
        {
            if (!PickColor(shortcutBgColorBtn.BackColor, out Color c)) return;
            shortcutBgColorBtn.BackColor = c;
            shortcutBar.BackColor        = c;
        }

        private void TitleFgColorBtn_Click(object sender, EventArgs e)
        {
            if (!PickColor(titleFgColorBtn.BackColor, out Color c)) return;
            titleFgColorBtn.BackColor = c;
            titleTextBox.ForeColor    = c;
        }

        private void ContentFgColorBtn_Click(object sender, EventArgs e)
        {
            if (!PickColor(contentFgColorBtn.BackColor, out Color c)) return;
            contentFgColorBtn.BackColor = c;
            if (_rowTextBoxes != null)
                foreach (var rtb in _rowTextBoxes) rtb.ForeColor = c;
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

                using (var bmp = new Bitmap(lvglPreview.Width, lvglPreview.Height))
                {
                    lvglPreview.DrawToBitmap(bmp, new Rectangle(0, 0, lvglPreview.Width, lvglPreview.Height));
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
                ShortcutIcons    = BuildShortcutData()
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

        private static string GetZoneIconPath(Panel zone) =>
            zone.Controls.OfType<PictureBox>().FirstOrDefault()?.Tag as string;

        private void RestoreZoneIcon(Panel zone, string filePath)
        {
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
                        pb.Location = new Point(
                            (IconZoneWidth - IconSize) / 2,
                            (_rowPanels[i].Height - IconSize) / 2);
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
