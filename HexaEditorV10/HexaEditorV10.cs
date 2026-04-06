using System.Drawing.Drawing2D;
using System.Globalization;

namespace HexaEditorV10
{
    public partial class HexaEditorV10 : Form
    {
        private readonly List<byte> _buffer = new();
        private string? _filePath;
        private bool _dirty;
        private int _lastFindIndex = -1;
        private byte[]? _lastFindPattern;
        private int _highlightedRow = -1;
        private int _matchHighlightStart = -1;
        private int _matchHighlightLength;
        private bool _documentLoaded;

        public HexaEditorV10()
        {
            InitializeComponent();
            SetupHexGrid();
            SetupFindReplaceToolbar();
            SetBinaryEditorVisible(false);
            UpdateTitle();
            UpdateStatusBar();
            RefreshGridAndStatus();
        }

        private void SetBinaryEditorVisible(bool visible)
        {
            _documentLoaded = visible;
            hexGrid.Visible = visible;
            panelHexGridEmpty.Visible = !visible;
        }

        private void SetupFindReplaceToolbar()
        {
            Font mono = new Font("Consolas", 10F);
            txtFindToolbar.Font = mono;
            txtReplaceToolbar.Font = mono;
        }

        private void SetupHexGrid()
        {
            hexGrid.AutoGenerateColumns = false;
            hexGrid.ColumnCount = 18;
            hexGrid.RowHeadersVisible = false;
            hexGrid.AllowUserToResizeRows = false;
            hexGrid.MultiSelect = false;
            hexGrid.ClipboardCopyMode = DataGridViewClipboardCopyMode.EnableWithoutHeaderText;
            hexGrid.DefaultCellStyle.Font = new Font("Consolas", 10F);
            hexGrid.ColumnHeadersDefaultCellStyle.Font = new Font("Consolas", 10F);
            hexGrid.CellBorderStyle = DataGridViewCellBorderStyle.None;
            hexGrid.GridColor = Color.Silver;
            hexGrid.CurrentCellChanged += hexGrid_CurrentCellChanged;
            hexGrid.CellPainting += hexGrid_CellPainting;
            hexGrid.CellFormatting += hexGrid_CellFormatting;
            hexGrid.EditingControlShowing += hexGrid_EditingControlShowing;

            hexGrid.Columns[0].Name = "colOffset";
            hexGrid.Columns[0].HeaderText = "오프셋";
            hexGrid.Columns[0].Width = 90;
            hexGrid.Columns[0].ReadOnly = true;
            hexGrid.Columns[0].SortMode = DataGridViewColumnSortMode.NotSortable;

            for (int i = 0; i < 16; i++)
            {
                int col = i + 1;
                hexGrid.Columns[col].Name = "b" + i.ToString("X2", CultureInfo.InvariantCulture);
                hexGrid.Columns[col].HeaderText = i.ToString("X2", CultureInfo.InvariantCulture);
                hexGrid.Columns[col].Width = 38;
                hexGrid.Columns[col].ReadOnly = false;
                hexGrid.Columns[col].SortMode = DataGridViewColumnSortMode.NotSortable;
                hexGrid.Columns[col].DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
            }

            hexGrid.Columns[17].Name = "colAscii";
            hexGrid.Columns[17].HeaderText = "ASCII";
            hexGrid.Columns[17].Width = 220;
            hexGrid.Columns[17].ReadOnly = true;
            hexGrid.Columns[17].SortMode = DataGridViewColumnSortMode.NotSortable;
        }

        private int GridRowCount => Math.Max(1, (_buffer.Count + 15) / 16);

        private void RefreshGridAndStatus()
        {
            if (!_documentLoaded)
                return;
            hexGrid.RowCount = GridRowCount;
            hexGrid.Invalidate();
            UpdateStatusBar();
        }

        private void SetMatchHighlight(int start, int length)
        {
            if (start < 0 || length <= 0)
            {
                _matchHighlightStart = -1;
                _matchHighlightLength = 0;
            }
            else
            {
                _matchHighlightStart = start;
                _matchHighlightLength = length;
            }
            hexGrid.Invalidate();
        }

        private void UpdateTitle()
        {
            string name = string.IsNullOrEmpty(_filePath) ? "제목 없음" : Path.GetFileName(_filePath);
            Text = (_dirty ? "* " : "") + name + " — 바이너리 편집기";
        }

        private void UpdateStatusBar()
        {
            int offset = GetCurrentByteOffset();
            statusLabelOffset.Text = $"오프셋: 0x{offset:X8} ({offset} dec)";
            statusLabelSize.Text = $"크기: {_buffer.Count} 바이트";
            statusLabelPath.Text = string.IsNullOrEmpty(_filePath) ? "(저장되지 않음)" : _filePath;
        }

        private int GetCurrentByteOffset()
        {
            if (!_documentLoaded || hexGrid.CurrentCell == null)
                return 0;
            int row = hexGrid.CurrentCell.RowIndex;
            int col = hexGrid.CurrentCell.ColumnIndex;
            if (col >= 1 && col <= 16)
                return row * 16 + (col - 1);
            return row * 16;
        }

        private void hexGrid_CellValueNeeded(object? sender, DataGridViewCellValueEventArgs e)
        {
            int row = e.RowIndex;
            if (e.ColumnIndex == 0)
            {
                e.Value = (row * 16).ToString("X8", CultureInfo.InvariantCulture);
                return;
            }

            if (e.ColumnIndex >= 1 && e.ColumnIndex <= 16)
            {
                int idx = row * 16 + (e.ColumnIndex - 1);
                if (idx < _buffer.Count)
                    e.Value = _buffer[idx].ToString("X2", CultureInfo.InvariantCulture);
                else
                    e.Value = "";
                return;
            }

            if (e.ColumnIndex == 17)
            {
                var sb = new System.Text.StringBuilder(16);
                for (int i = 0; i < 16; i++)
                {
                    int idx = row * 16 + i;
                    if (idx >= _buffer.Count)
                        break;
                    byte b = _buffer[idx];
                    sb.Append(b is >= 32 and <= 126 ? (char)b : '.');
                }
                e.Value = sb.ToString();
            }
        }

        private void hexGrid_CellValuePushed(object? sender, DataGridViewCellValueEventArgs e)
        {
            if (e.ColumnIndex < 1 || e.ColumnIndex > 16)
                return;

            int idx = e.RowIndex * 16 + (e.ColumnIndex - 1);
            string? raw = e.Value?.ToString()?.Trim();
            if (string.IsNullOrEmpty(raw))
            {
                if (idx < _buffer.Count)
                {
                    _buffer[idx] = 0;
                    _dirty = true;
                }
                return;
            }

            if (!HexUtil.TryParseByte(raw, out byte b))
            {
                MessageBox.Show(this, "바이트는 00~FF(16진수) 두 자리로 입력하세요.", "입력 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            while (_buffer.Count < idx)
                _buffer.Add(0);
            if (_buffer.Count == idx)
                _buffer.Add(b);
            else
                _buffer[idx] = b;
            _dirty = true;
            UpdateTitle();
            hexGrid.RowCount = GridRowCount;
            hexGrid.Invalidate();
            UpdateStatusBar();
        }

        private void hexGrid_CellFormatting(object? sender, DataGridViewCellFormattingEventArgs e)
        {
            if (e.RowIndex < 0 || e.ColumnIndex < 0)
                return;

            if (e.ColumnIndex >= 1 && e.ColumnIndex <= 16 &&
                _matchHighlightStart >= 0 && _matchHighlightLength > 0)
            {
                int idx = e.RowIndex * 16 + (e.ColumnIndex - 1);
                bool inMatch = idx >= _matchHighlightStart && idx < _matchHighlightStart + _matchHighlightLength;
                if (inMatch)
                {
                    e.CellStyle.BackColor = Color.FromArgb(255, 244, 179);
                    e.CellStyle.SelectionBackColor = Color.FromArgb(255, 226, 119);
                }
            }
        }

        private void hexGrid_EditingControlShowing(object? sender, DataGridViewEditingControlShowingEventArgs e)
        {
            if (e.Control is TextBox tb)
            {
                tb.CharacterCasing = CharacterCasing.Upper;
                tb.MaxLength = 2;
                tb.KeyPress -= HexCellEdit_KeyPress;
                if (hexGrid.CurrentCell != null &&
                    hexGrid.CurrentCell.ColumnIndex >= 1 &&
                    hexGrid.CurrentCell.ColumnIndex <= 16)
                {
                    tb.KeyPress += HexCellEdit_KeyPress;
                }
            }
        }

        private static void HexCellEdit_KeyPress(object? sender, KeyPressEventArgs e)
        {
            if (char.IsControl(e.KeyChar))
                return;
            bool isHex =
                (e.KeyChar >= '0' && e.KeyChar <= '9') ||
                (e.KeyChar >= 'a' && e.KeyChar <= 'f') ||
                (e.KeyChar >= 'A' && e.KeyChar <= 'F');
            if (!isHex)
                e.Handled = true;
        }

        private void hexGrid_SelectionChanged(object? sender, EventArgs e)
        {
            UpdateCurrentRowHighlight();
            UpdateStatusBar();
        }

        private void hexGrid_CurrentCellChanged(object? sender, EventArgs e)
        {
            UpdateCurrentRowHighlight();
            UpdateStatusBar();
        }

        private void UpdateCurrentRowHighlight()
        {
            int newRow = hexGrid.CurrentCell?.RowIndex ?? -1;
            if (_highlightedRow == newRow)
                return;

            if (_highlightedRow >= 0 && _highlightedRow < hexGrid.RowCount)
            {
                DataGridViewRow oldRow = hexGrid.Rows[_highlightedRow];
                oldRow.DefaultCellStyle.BackColor = Color.White;
                oldRow.DefaultCellStyle.SelectionBackColor = SystemColors.Highlight;
            }

            if (newRow >= 0 && newRow < hexGrid.RowCount)
            {
                DataGridViewRow currentRow = hexGrid.Rows[newRow];
                currentRow.DefaultCellStyle.BackColor = Color.FromArgb(236, 246, 255);
                currentRow.DefaultCellStyle.SelectionBackColor = Color.FromArgb(184, 220, 255);
            }

            int oldRowIndex = _highlightedRow;
            _highlightedRow = newRow;

            if (oldRowIndex >= 0 && oldRowIndex < hexGrid.RowCount)
                hexGrid.InvalidateRow(oldRowIndex);
            if (_highlightedRow >= 0 && _highlightedRow < hexGrid.RowCount)
                hexGrid.InvalidateRow(_highlightedRow);
        }

        private void hexGrid_CellPainting(object? sender, DataGridViewCellPaintingEventArgs e)
        {
            if (e.RowIndex < 0 || e.ColumnIndex < 0)
                return;
            if (e.Graphics == null)
                return;

            if (e.ColumnIndex == 17 && _matchHighlightStart >= 0 && _matchHighlightLength > 0)
                PaintAsciiCellWithMatchHighlight(e);
            else
                e.Paint(e.CellBounds, DataGridViewPaintParts.All);

            using Pen borderPen = new(Color.Silver, 1F)
            {
                DashStyle = e.RowIndex == 0 ? DashStyle.Solid : DashStyle.Dot
            };

            int right = e.CellBounds.Right - 1;
            int bottom = e.CellBounds.Bottom - 1;
            e.Graphics.DrawLine(borderPen, e.CellBounds.Left, bottom, right, bottom);
            e.Graphics.DrawLine(borderPen, right, e.CellBounds.Top, right, bottom);
            e.Handled = true;
        }

        /// <summary>
        /// ASCII 열은 한 셀에 16글자가 들어가므로, 찾기 매치 구간은 글자 단위로만 배경색을 칠합니다.
        /// </summary>
        private void PaintAsciiCellWithMatchHighlight(DataGridViewCellPaintingEventArgs e)
        {
            Rectangle bounds = e.CellBounds;
            Font font = e.CellStyle?.Font ?? hexGrid.DefaultCellStyle.Font ?? this.Font;
            Color fore = e.CellStyle?.ForeColor ?? hexGrid.DefaultCellStyle.ForeColor;
            int row = e.RowIndex;

            bool rowHighlight = row == _highlightedRow;
            Color rowBg = rowHighlight ? Color.FromArgb(236, 246, 255) : Color.White;
            Color matchBg = Color.FromArgb(255, 244, 179);
            Color matchSelectedBg = Color.FromArgb(255, 226, 119);
            bool cellSelected = hexGrid[17, row].Selected;

            using (var brush = new SolidBrush(rowBg))
                e.Graphics!.FillRectangle(brush, bounds);

            const int padX = 4;
            int innerW = Math.Max(1, bounds.Width - padX * 2);
            int charW = innerW / 16;
            int x = bounds.Left + padX;

            for (int i = 0; i < 16; i++)
            {
                int idx = row * 16 + i;
                if (idx >= _buffer.Count)
                    break;

                byte b = _buffer[idx];
                char ch = b is >= 32 and <= 126 ? (char)b : '.';

                bool inMatch = idx >= _matchHighlightStart && idx < _matchHighlightStart + _matchHighlightLength;
                Color bg;
                Color txt = fore;
                if (cellSelected)
                {
                    if (inMatch)
                        bg = matchSelectedBg;
                    else
                    {
                        bg = SystemColors.Highlight;
                        txt = SystemColors.HighlightText;
                    }
                }
                else if (inMatch)
                {
                    bg = matchBg;
                }
                else
                {
                    bg = rowBg;
                }

                int segW = i == 15 ? Math.Max(1, bounds.Right - padX - x) : charW;
                Rectangle r = new Rectangle(x, bounds.Y, segW, bounds.Height);

                using (var brush = new SolidBrush(bg))
                    e.Graphics!.FillRectangle(brush, r);

                TextRenderer.DrawText(e.Graphics, ch.ToString(), font, r, txt,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.NoPadding);

                x += segW;
            }
        }

        private void hexGrid_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Control && e.KeyCode == Keys.C && hexGrid.CurrentCell != null)
            {
                int row = hexGrid.CurrentCell.RowIndex;
                int col = hexGrid.CurrentCell.ColumnIndex;
                if (col >= 1 && col <= 16)
                {
                    int idx = row * 16 + (col - 1);
                    if (idx < _buffer.Count)
                    {
                        Clipboard.SetText(_buffer[idx].ToString("X2", CultureInfo.InvariantCulture));
                        e.Handled = true;
                    }
                }
            }
        }

        private bool ConfirmDiscardChanges()
        {
            if (!_dirty)
                return true;
            var r = MessageBox.Show(this, "저장하지 않은 변경 사항이 있습니다. 저장하지 않고 계속하시겠습니까?", "확인",
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            return r == DialogResult.Yes;
        }

        private void ClearDocument()
        {
            _buffer.Clear();
            _filePath = null;
            _dirty = false;
            _lastFindIndex = -1;
            _lastFindPattern = null;
            SetMatchHighlight(-1, 0);
            hexGrid.ClearSelection();
            RefreshGridAndStatus();
            UpdateTitle();
        }

        private void menuFileNew_Click(object? sender, EventArgs e)
        {
            if (!ConfirmDiscardChanges())
                return;
            ClearDocument();
            SetBinaryEditorVisible(true);
            UpdateTitle();
            RefreshGridAndStatus();
        }

        private void menuFileOpen_Click(object? sender, EventArgs e)
        {
            if (!ConfirmDiscardChanges())
                return;

            using var dlg = new OpenFileDialog
            {
                Title = "바이너리 파일 열기",
                Filter = "모든 파일 (*.*)|*.*"
            };
            if (dlg.ShowDialog(this) != DialogResult.OK)
                return;

            try
            {
                byte[] data = File.ReadAllBytes(dlg.FileName);
                _buffer.Clear();
                _buffer.AddRange(data);
                _filePath = dlg.FileName;
                _dirty = false;
                _lastFindIndex = -1;
                _lastFindPattern = null;
                SetMatchHighlight(-1, 0);
                SetBinaryEditorVisible(true);
                RefreshGridAndStatus();
                UpdateTitle();
                if (hexGrid.RowCount > 0)
                    hexGrid.CurrentCell = hexGrid[1, 0];
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "파일을 열 수 없습니다.\n" + ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void menuFileClose_Click(object? sender, EventArgs e)
        {
            if (!ConfirmDiscardChanges())
                return;
            SetBinaryEditorVisible(false);
            ClearDocument();
            UpdateStatusBar();
        }

        private bool SaveToPath(string path)
        {
            try
            {
                File.WriteAllBytes(path, _buffer.ToArray());
                _filePath = path;
                _dirty = false;
                UpdateTitle();
                UpdateStatusBar();
                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "저장할 수 없습니다.\n" + ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        private void menuFileSave_Click(object? sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(_filePath))
            {
                menuFileSaveAs_Click(sender, e);
                return;
            }
            SaveToPath(_filePath);
        }

        private void menuFileSaveAs_Click(object? sender, EventArgs e)
        {
            using var dlg = new SaveFileDialog
            {
                Title = "다른 이름으로 저장",
                Filter = "모든 파일 (*.*)|*.*",
                FileName = string.IsNullOrEmpty(_filePath) ? "binary.bin" : Path.GetFileName(_filePath)
            };
            if (dlg.ShowDialog(this) != DialogResult.OK)
                return;
            SaveToPath(dlg.FileName);
        }

        private void menuFileExit_Click(object? sender, EventArgs e)
        {
            Close();
        }

        private void menuEditGoTo_Click(object? sender, EventArgs e)
        {
            using var dlg = new GoToOffsetForm();
            if (dlg.ShowDialog(this) != DialogResult.OK)
                return;
            long off = dlg.Offset;
            if (off < 0 || off > int.MaxValue)
            {
                MessageBox.Show(this, "유효하지 않은 오프셋입니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            int o = (int)off;
            if (o > _buffer.Count)
            {
                MessageBox.Show(this, $"오프셋이 파일 크기({_buffer.Count} 바이트)를 벗어났습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            int row = o / 16;
            int col = (o % 16) + 1;
            if (row >= hexGrid.RowCount)
                hexGrid.RowCount = GridRowCount;
            if (row < hexGrid.RowCount)
            {
                hexGrid.ClearSelection();
                hexGrid.CurrentCell = hexGrid[col, row];
                hexGrid.FirstDisplayedScrollingRowIndex = Math.Max(0, Math.Min(row, hexGrid.RowCount - 1));
            }
            UpdateStatusBar();
        }

        private void menuEditFind_Click(object? sender, EventArgs e)
        {
            txtFindToolbar.Focus();
            txtFindToolbar.SelectAll();
        }

        private void menuEditReplace_Click(object? sender, EventArgs e)
        {
            txtReplaceToolbar.Focus();
            txtReplaceToolbar.SelectAll();
        }

        private void menuEditFindPrev_Click(object? sender, EventArgs e)
        {
            btnToolbarFindPrev_Click(sender, e);
        }

        private void txtFindToolbar_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                e.Handled = true;
                e.SuppressKeyPress = true;
                if (e.Shift)
                    btnToolbarFindPrev_Click(sender, e);
                else
                    btnToolbarFindNext_Click(sender, e);
            }
        }

        private void btnToolbarFindNext_Click(object? sender, EventArgs e)
        {
            if (!TryGetFindPatternFromToolbar(out byte[] pat))
                return;
            _lastFindPattern = pat;
            int start = _lastFindIndex >= 0 ? _lastFindIndex + 1 : GetCurrentByteOffset();
            int idx = HexUtil.IndexOf(_buffer, pat, start);
            if (idx < 0 && start > 0)
                idx = HexUtil.IndexOf(_buffer, pat, 0);
            if (idx < 0)
            {
                MessageBox.Show(this, "더 이상 찾을 수 없습니다.", "찾기", MessageBoxButtons.OK, MessageBoxIcon.Information);
                _lastFindIndex = -1;
                SetMatchHighlight(-1, 0);
                return;
            }
            _lastFindIndex = idx;
            SetMatchHighlight(idx, pat.Length);
            GoToByteIndex(idx);
        }

        private void btnToolbarFindPrev_Click(object? sender, EventArgs e)
        {
            if (!TryGetFindPatternFromToolbar(out byte[] pat))
                return;
            _lastFindPattern = pat;
            int anchor = _lastFindIndex >= 0 ? _lastFindIndex : GetCurrentByteOffset();
            int idx = HexUtil.FindPrevious(_buffer, pat, anchor);
            if (idx < 0)
            {
                MessageBox.Show(this, "더 이상 찾을 수 없습니다.", "찾기", MessageBoxButtons.OK, MessageBoxIcon.Information);
                _lastFindIndex = -1;
                SetMatchHighlight(-1, 0);
                return;
            }
            _lastFindIndex = idx;
            SetMatchHighlight(idx, pat.Length);
            GoToByteIndex(idx);
        }

        private void btnToolbarReplace_Click(object? sender, EventArgs e)
        {
            if (!TryGetFindPatternFromToolbar(out byte[] findPat))
                return;
            if (!HexUtil.TryParseHexBytes(txtReplaceToolbar.Text, out byte[]? rep) || rep == null)
            {
                MessageBox.Show(this, "바꿀 내용이 올바른 16진수가 아닙니다.", "바꾸기", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            int idx;
            if (_lastFindIndex >= 0 &&
                _lastFindPattern != null &&
                _lastFindPattern.AsSpan().SequenceEqual(findPat) &&
                HexUtil.MatchesAt(_buffer, _lastFindIndex, findPat))
            {
                idx = _lastFindIndex;
            }
            else
            {
                idx = HexUtil.IndexOf(_buffer, findPat, GetCurrentByteOffset());
                if (idx < 0)
                    idx = HexUtil.IndexOf(_buffer, findPat, 0);
                if (idx < 0)
                {
                    MessageBox.Show(this, "찾을 수 없습니다.", "바꾸기", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                _lastFindIndex = idx;
                _lastFindPattern = findPat;
            }

            HexUtil.ReplaceAt(_buffer, idx, findPat, rep);
            _dirty = true;
            RefreshGridAndStatus();
            UpdateTitle();
            _lastFindIndex = idx + rep.Length - 1;
            SetMatchHighlight(idx, rep.Length);
            GoToByteIndex(idx);
        }

        private void btnToolbarReplaceAll_Click(object? sender, EventArgs e)
        {
            if (!TryGetFindPatternFromToolbar(out byte[] findPat))
                return;
            if (!HexUtil.TryParseHexBytes(txtReplaceToolbar.Text, out byte[]? rep) || rep == null)
            {
                MessageBox.Show(this, "바꿀 내용이 올바른 16진수가 아닙니다.", "바꾸기", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            int count = HexUtil.ReplaceAll(_buffer, findPat, rep);
            if (count == 0)
            {
                MessageBox.Show(this, "바꿀 항목이 없습니다.", "바꾸기", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            _dirty = true;
            _lastFindIndex = -1;
            _lastFindPattern = null;
            SetMatchHighlight(-1, 0);
            RefreshGridAndStatus();
            UpdateTitle();
            MessageBox.Show(this, $"{count}곳을 바꿨습니다.", "바꾸기", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private bool TryGetFindPatternFromToolbar(out byte[] pat)
        {
            pat = Array.Empty<byte>();
            if (!HexUtil.TryParseFindBytes(txtFindToolbar.Text, out byte[]? p) || p == null || p.Length == 0)
            {
                MessageBox.Show(this,
                    "찾을 내용을 입력하세요.\n예) DE AD BE EF (Hex) / ascii:TEST / 'TEST' / TEST",
                    "찾기", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            pat = p;
            return true;
        }

        private void GoToByteIndex(int idx)
        {
            if (idx < 0 || idx > _buffer.Count)
                return;
            int row = idx / 16;
            int col = (idx % 16) + 1;
            hexGrid.RowCount = GridRowCount;
            if (row < hexGrid.RowCount)
            {
                hexGrid.ClearSelection();
                hexGrid.CurrentCell = hexGrid[col, row];
                hexGrid.FirstDisplayedScrollingRowIndex = Math.Max(0, Math.Min(row, hexGrid.RowCount - 1));
            }
            UpdateStatusBar();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!ConfirmDiscardChanges())
                e.Cancel = true;
            base.OnFormClosing(e);
        }

        private sealed class GoToOffsetForm : Form
        {
            private readonly TextBox _text = new();
            private readonly Button _ok = new();
            private readonly Button _cancel = new();

            public long Offset { get; private set; }

            public GoToOffsetForm()
            {
                Text = "오프셋으로 이동";
                FormBorderStyle = FormBorderStyle.FixedDialog;
                MinimizeBox = false;
                MaximizeBox = false;
                StartPosition = FormStartPosition.CenterParent;
                ClientSize = new Size(360, 110);
                var label = new Label
                {
                    AutoSize = false,
                    Location = new Point(12, 14),
                    Size = new Size(330, 20),
                    Text = "오프셋 (16진수: 0x10 또는 10h, 10진수: 숫자만)"
                };
                _text.Location = new Point(12, 38);
                _text.Size = new Size(330, 23);
                _ok.Text = "확인";
                _ok.DialogResult = DialogResult.OK;
                _ok.Location = new Point(168, 72);
                _cancel.Text = "취소";
                _cancel.DialogResult = DialogResult.Cancel;
                _cancel.Location = new Point(252, 72);
                AcceptButton = _ok;
                CancelButton = _cancel;
                Controls.Add(label);
                Controls.Add(_text);
                Controls.Add(_ok);
                Controls.Add(_cancel);
                Shown += (_, _) => _text.Focus();
            }

            protected override void OnShown(EventArgs e)
            {
                base.OnShown(e);
                _text.Focus();
            }

            protected override void OnFormClosing(FormClosingEventArgs e)
            {
                if (DialogResult == DialogResult.OK)
                {
                    if (!TryParseOffset(_text.Text, out long off))
                    {
                        MessageBox.Show(this, "오프셋을 해석할 수 없습니다.", "입력 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        e.Cancel = true;
                        return;
                    }
                    Offset = off;
                }
                base.OnFormClosing(e);
            }

            private static bool TryParseOffset(string s, out long offset)
            {
                offset = 0;
                s = s.Trim();
                if (s.Length == 0)
                    return false;
                if (s.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
                    return long.TryParse(s.AsSpan(2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out offset);
                if (s.EndsWith("h", StringComparison.OrdinalIgnoreCase) && s.Length > 1)
                    return long.TryParse(s.AsSpan(0, s.Length - 1), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out offset);
                if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out offset))
                    return true;
                return long.TryParse(s, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out offset);
            }
        }

    }

    internal static class HexUtil
    {
        public static bool TryParseByte(string s, out byte value)
        {
            value = 0;
            s = s.Trim();
            if (s.Length == 1)
                s = "0" + s;
            if (s.Length != 2)
                return false;
            return byte.TryParse(s, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out value);
        }

        public static bool TryParseHexBytes(string? text, out byte[]? bytes)
        {
            bytes = null;
            if (string.IsNullOrWhiteSpace(text))
                return false;
            var sb = new System.Text.StringBuilder();
            foreach (char c in text)
            {
                if (char.IsWhiteSpace(c))
                    continue;
                sb.Append(c);
            }
            string hex = sb.ToString();
            if (hex.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
                hex = hex[2..];
            if (hex.Length % 2 != 0)
                return false;
            var arr = new byte[hex.Length / 2];
            for (int i = 0; i < arr.Length; i++)
            {
                ReadOnlySpan<char> pair = hex.AsSpan(i * 2, 2);
                if (!byte.TryParse(pair, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out arr[i]))
                    return false;
            }
            bytes = arr;
            return true;
        }

        public static bool TryParseFindBytes(string? text, out byte[]? bytes)
        {
            bytes = null;
            if (string.IsNullOrWhiteSpace(text))
                return false;

            string input = text.Trim();

            // Explicit ASCII mode: ascii:Hello
            if (input.StartsWith("ascii:", StringComparison.OrdinalIgnoreCase))
            {
                string asciiText = input[6..];
                if (asciiText.Length == 0)
                    return false;
                bytes = System.Text.Encoding.ASCII.GetBytes(asciiText);
                return true;
            }

            // Quoted ASCII mode: 'Hello' or "Hello"
            if (input.Length >= 2 &&
                ((input[0] == '\'' && input[^1] == '\'') || (input[0] == '"' && input[^1] == '"')))
            {
                string asciiText = input[1..^1];
                bytes = System.Text.Encoding.ASCII.GetBytes(asciiText);
                return true;
            }

            // Try hex first to preserve existing behavior.
            if (TryParseHexBytes(input, out byte[]? hexBytes) && hexBytes != null && hexBytes.Length > 0)
            {
                bytes = hexBytes;
                return true;
            }

            // Fallback: plain ASCII text.
            bytes = System.Text.Encoding.ASCII.GetBytes(input);
            return bytes.Length > 0;
        }

        public static string ToHexString(byte[] data)
        {
            var sb = new System.Text.StringBuilder(data.Length * 3);
            for (int i = 0; i < data.Length; i++)
            {
                if (i > 0)
                    sb.Append(' ');
                sb.Append(data[i].ToString("X2", CultureInfo.InvariantCulture));
            }
            return sb.ToString();
        }

        public static int IndexOf(List<byte> buffer, byte[] pattern, int startIndex)
        {
            if (pattern.Length == 0 || startIndex < 0 || buffer.Count < pattern.Length)
                return -1;
            int limit = buffer.Count - pattern.Length;
            for (int i = startIndex; i <= limit; i++)
            {
                int j = 0;
                for (; j < pattern.Length; j++)
                {
                    if (buffer[i + j] != pattern[j])
                        break;
                }
                if (j == pattern.Length)
                    return i;
            }
            return -1;
        }

        /// <summary>
        /// 패턴이 시작할 수 있는 최대 인덱스까지 역방향으로 검색합니다.
        /// </summary>
        public static int LastIndexOf(List<byte> buffer, byte[] pattern, int maxStartInclusive)
        {
            if (pattern.Length == 0 || buffer.Count < pattern.Length || maxStartInclusive < 0)
                return -1;
            int limit = Math.Min(maxStartInclusive, buffer.Count - pattern.Length);
            for (int i = limit; i >= 0; i--)
            {
                if (MatchesAt(buffer, i, pattern))
                    return i;
            }
            return -1;
        }

        /// <summary>
        /// anchorStart 이전에 나오는 마지막 일치(또는 끝에서 앞으로 감싼 일치)를 반환합니다.
        /// </summary>
        public static int FindPrevious(List<byte> buffer, byte[] pattern, int anchorStart)
        {
            if (pattern.Length == 0 || buffer.Count < pattern.Length)
                return -1;

            int idx = LastIndexOf(buffer, pattern, anchorStart - 1);
            if (idx >= 0)
                return idx;

            int hi = buffer.Count - pattern.Length;
            int lo = Math.Max(0, anchorStart);
            for (int i = hi; i >= lo; i--)
            {
                if (MatchesAt(buffer, i, pattern))
                    return i;
            }
            return -1;
        }

        public static bool MatchesAt(List<byte> buffer, int index, byte[] pattern)
        {
            if (index < 0 || buffer.Count < index + pattern.Length)
                return false;
            for (int i = 0; i < pattern.Length; i++)
            {
                if (buffer[index + i] != pattern[i])
                    return false;
            }
            return true;
        }

        public static void ReplaceAt(List<byte> buffer, int index, byte[] find, byte[] replace)
        {
            buffer.RemoveRange(index, find.Length);
            buffer.InsertRange(index, replace);
        }

        public static int ReplaceAll(List<byte> buffer, byte[] find, byte[] replace)
        {
            if (find.Length == 0)
                return 0;
            int count = 0;
            int i = 0;
            while (i <= buffer.Count - find.Length)
            {
                bool ok = true;
                for (int j = 0; j < find.Length; j++)
                {
                    if (buffer[i + j] != find[j])
                    {
                        ok = false;
                        break;
                    }
                }
                if (ok)
                {
                    buffer.RemoveRange(i, find.Length);
                    buffer.InsertRange(i, replace);
                    i += replace.Length;
                    count++;
                }
                else
                {
                    i++;
                }
            }
            return count;
        }
    }
}
