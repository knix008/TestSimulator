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
        private const int RowCount  = 10;
        private const int RowHeight = 80;
        private const int RowGap    = 5;
        private const int IconSize  = 60;

        // Row controls (RichTextBox for full alignment support)
        private Panel[]        _rowPanels;
        private RichTextBox[]  _rowTextBoxes;
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
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
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
            _rowPanels    = new Panel[RowCount];
            _rowTextBoxes = new RichTextBox[RowCount];

            _rowContainer = new Panel();
            _rowContainer.Width    = contentArea.ClientSize.Width;
            _rowContainer.Height   = RowGap + RowCount * (RowHeight + RowGap);
            _rowContainer.Location = Point.Empty;
            _rowContainer.BackColor = contentArea.BackColor;
            AttachScrollHandlers(_rowContainer);
            contentArea.Controls.Add(_rowContainer);
            contentArea.MouseWheel += WheelScroll;

            Color rowBg = LightenColor(contentArea.BackColor, 20);

            for (int i = 0; i < RowCount; i++)
            {
                int rowX = 4;
                int rowY = RowGap + i * (RowHeight + RowGap);
                int rowW = _rowContainer.Width - 8;

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
                    using (var pen = new Pen(Color.FromArgb(70, 255, 255, 255)))
                        pe.Graphics.DrawRectangle(pen, 0, 0, rc.Width - 1, rc.Height - 1);
                };

                var rtb = new RichTextBox();
                rtb.SetBounds(8, 8, rowW - 16, RowHeight - 16);
                rtb.BorderStyle  = BorderStyle.None;
                rtb.BackColor    = rowBg;
                rtb.ForeColor    = Color.White;
                rtb.Font         = CurrentFont();
                rtb.ScrollBars   = RichTextBoxScrollBars.None;
                rtb.Multiline    = true;
                rtb.DetectUrls   = false;
                rtb.SelectionAlignment = HorizontalAlignment.Left;
                rtb.MouseWheel  += WheelScroll;
                TrackFocusOn(rtb);

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
            int size = fontSizeCombo.SelectedItem != null ? (int)fontSizeCombo.SelectedItem : 14;
            return new Font("Segoe UI", size);
        }

        private void FontSizeCombo_Changed(object sender, EventArgs e)
        {
            int size = fontSizeCombo.SelectedItem != null ? (int)fontSizeCombo.SelectedItem : 14;
            if (_activeTextControl is RichTextBox rtb)
            {
                // Preserve bold/italic when changing size
                var style = (rtb.SelectionFont ?? rtb.Font).Style;
                var font  = new Font("Segoe UI", size, style);
                rtb.SelectAll();
                rtb.SelectionFont = font;
                rtb.Select(0, 0);
                rtb.Font = font;
            }
            else if (_activeTextControl is TextBox tb)
            {
                tb.Font = new Font("Segoe UI", size, tb.Font.Style);
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

        // ── Drop targets setup ────────────────────────────────────────────

        private void SetupDropTargets()
        {
            shortcutBar.AllowDrop = true;
            shortcutBar.DragEnter += DropTarget_DragEnter;
            shortcutBar.DragDrop  += ShortcutBar_DragDrop;
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
            e.Effect = e.Data.GetDataPresent("IconFilePath")
                ? DragDropEffects.Copy : DragDropEffects.None;
        }

        private void RowPanel_DragDrop(object sender, DragEventArgs e)
        {
            if (!e.Data.GetDataPresent("IconFilePath")) return;
            string filePath = (string)e.Data.GetData("IconFilePath");
            var row = (Panel)sender;
            var pt  = row.PointToClient(new Point(e.X, e.Y));

            var pb = CreateDroppedIcon(filePath, row);
            pb.Location = new Point(
                Math.Max(0, Math.Min(pt.X - IconSize / 2, row.Width - IconSize)),
                (row.Height - IconSize) / 2);
            row.Controls.Add(pb);
            pb.BringToFront();
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
            pb.Cursor    = Cursors.SizeAll;
            pb.BackColor = Color.Transparent;
            pb.ContextMenuStrip = BuildRemoveMenu(pb, row);

            Point drag = Point.Empty;
            pb.MouseDown += (s, ev) => { if (ev.Button == MouseButtons.Left) drag = ev.Location; };
            pb.MouseMove += (s, ev) =>
            {
                if (ev.Button != MouseButtons.Left) return;
                var loc = pb.Location;
                loc.Offset(ev.X - drag.X, ev.Y - drag.Y);
                loc.X = Math.Max(0, Math.Min(loc.X, row.Width  - pb.Width));
                loc.Y = Math.Max(0, Math.Min(loc.Y, row.Height - pb.Height));
                pb.Location = loc;
            };
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
                    Text      = rtb.Text,
                    FontSize  = (int)Math.Round((rtb.SelectionFont ?? rtb.Font).SizeInPoints),
                    Alignment = AlignToString(rtb.SelectionAlignment),
                    Icons     = _rowPanels[i].Controls
                        .OfType<PictureBox>()
                        .Select(pb => new IconData
                        {
                            FilePath = pb.Tag as string,
                            X        = pb.Left,
                            Y        = pb.Top
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

        private void LoadLayout(string filePath)
        {
            ScreenData data;
            var xs = new XmlSerializer(typeof(ScreenData));
            using (var r = new StreamReader(filePath))
                data = (ScreenData)xs.Deserialize(r);

            if (_rowContainer != null) _rowContainer.Top = 0;

            // Colors
            Color titleBg = HexToColor(data.TitleBarBgColor,   Color.FromArgb(25, 25, 112));
            Color titleFg = HexToColor(data.TitleBarFgColor,   Color.White);
            Color contBg  = HexToColor(data.ContentBgColor,    Color.FromArgb(18, 18, 60));
            Color contFg  = HexToColor(data.ContentFgColor,    Color.White);
            Color shortBg = HexToColor(data.ShortcutBarBgColor, Color.FromArgb(30, 30, 30));

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

            // Title text
            titleTextBox.Text = data.TitleText ?? string.Empty;
            if (data.TitleFontSize > 0)
                titleTextBox.Font = new Font("Segoe UI", data.TitleFontSize, FontStyle.Bold);
            var titleAlign = StringToAlign(data.TitleAlignment);
            titleTextBox.TextAlign = titleAlign;
            if (_activeTextControl == titleTextBox)
                UpdateAlignmentButtons(titleAlign);

            // Rows
            for (int i = 0; i < RowCount; i++)
            {
                var icons = _rowPanels[i].Controls.OfType<PictureBox>().ToList();
                icons.ForEach(pb => { _rowPanels[i].Controls.Remove(pb); pb.Dispose(); });

                if (data.Rows == null || i >= data.Rows.Length) continue;
                var rowData = data.Rows[i];
                var rtb     = _rowTextBoxes[i];

                rtb.Text = rowData.Text ?? string.Empty;
                if (rowData.FontSize > 0)
                {
                    var font = new Font("Segoe UI", rowData.FontSize);
                    rtb.Font = font;
                    rtb.SelectAll();
                    rtb.SelectionFont = font;
                    rtb.Select(0, 0);
                }

                var align = StringToAlign(rowData.Alignment);
                rtb.SelectAll();
                rtb.SelectionAlignment = align;
                rtb.Select(0, 0);

                if (rowData.Icons == null) continue;
                foreach (var iconData in rowData.Icons)
                {
                    if (!File.Exists(iconData.FilePath)) { ShowMissingFileWarning(iconData.FilePath); continue; }
                    var pb = CreateDroppedIcon(iconData.FilePath, _rowPanels[i]);
                    pb.Location = new Point(iconData.X, iconData.Y);
                    _rowPanels[i].Controls.Add(pb);
                    pb.BringToFront();
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
