using System.ComponentModel;
using System.Text.Json;

namespace MemoPadV10;

public partial class MemoPadForm : Form
{
    private readonly List<string> _memoItems = [];
    private readonly string _memoFilePath;
    private bool _dragging;
    private Point _dragStartPoint;

    public MemoPadForm()
    {
        InitializeComponent();
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
        {
            _memoFilePath = string.Empty;
            return;
        }

        _memoFilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MemoPadV10",
            "memos.json");
        ApplySavedEditorSettings();
        LoadMemos();
        WireMemoEditorContextMenu();
    }

    private void WireMemoEditorContextMenu()
    {
        ContextMenuStrip ctx = new();
        ctx.Items.Add("굵게", null, (_, _) => RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Bold, false));
        ctx.Items.Add("기울임", null, (_, _) => RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Italic, false));
        ctx.Items.Add("밑줄", null, (_, _) => RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Underline, false));
        ctx.Items.Add("취소선", null, (_, _) => RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Strikeout, false));
        ctx.Items.Add(new ToolStripSeparator());
        ctx.Items.Add("글꼴 및 글자 색…", null, (_, _) => ShowMemoQuickFontDialog());
        memoEditor.ContextMenuStrip = ctx;
    }

    private void ShowMemoQuickFontDialog()
    {
        using FontDialog dlg = new();
        dlg.Font = memoEditor.SelectionFont ?? memoEditor.Font;
        dlg.Color = memoEditor.SelectionColor;
        dlg.ShowColor = true;
        dlg.ShowEffects = true;
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        using (Font chosen = dlg.Font)
        {
            Font copy = new(chosen.FontFamily, chosen.SizeInPoints, chosen.Style, GraphicsUnit.Point);
            int savedStart = memoEditor.SelectionStart;
            int savedLen = memoEditor.SelectionLength;

            if (savedLen == 0)
            {
                memoEditor.SelectionFont = copy;
                memoEditor.SelectionColor = dlg.Color;
                memoEditor.Font = new Font(copy.FontFamily, copy.SizeInPoints, copy.Style, GraphicsUnit.Point);
                copy.Dispose();
                return;
            }

            memoEditor.Select(savedStart, savedLen);
            memoEditor.SelectionFont = copy;
            memoEditor.SelectionColor = dlg.Color;
            copy.Dispose();
        }
    }

    private void ApplySavedEditorSettings()
    {
        EditorSettings.Data? data = EditorSettings.TryLoad() ?? EditorSettings.LoadDefaults();
        EditorSettings.ApplyToUi(memoEditor, this, data);
    }

    private void AddMemo()
    {
        string text = memoEditor.Text.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            MessageBox.Show("메모 내용을 입력해 주세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _memoItems.Add(memoEditor.Rtf ?? string.Empty);
        SaveMemos();
        memoEditor.Clear();
        MessageBox.Show("메모가 추가되었습니다.", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void LoadMemos()
    {
        try
        {
            if (!File.Exists(_memoFilePath))
            {
                return;
            }

            string json = File.ReadAllText(_memoFilePath);
            List<string>? loaded = JsonSerializer.Deserialize<List<string>>(json);
            if (loaded is null)
            {
                return;
            }

            _memoItems.Clear();
            _memoItems.AddRange(loaded.Where(m => !string.IsNullOrWhiteSpace(m)));
        }
        catch (Exception)
        {
            MessageBox.Show("메모 목록 파일을 불러오지 못했습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void SaveMemos()
    {
        try
        {
            string? dirPath = Path.GetDirectoryName(_memoFilePath);
            if (!string.IsNullOrWhiteSpace(dirPath))
            {
                Directory.CreateDirectory(dirPath);
            }

            string json = JsonSerializer.Serialize(_memoItems, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_memoFilePath, json);
        }
        catch (Exception)
        {
            MessageBox.Show("메모 저장에 실패했습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void addMemoIconButton_Click(object sender, EventArgs e)
    {
        MemoPadForm newMemoPad = CreateOffsetMemoPad();
        newMemoPad.Show();
    }

    private void saveMemoIconButton_Click(object sender, EventArgs e)
    {
        AddMemo();
    }

    private void settingsIconButton_Click(object sender, EventArgs e)
    {
        using EditorSettingsForm dlg = new(memoEditor, this);
        dlg.ShowDialog(this);
    }

    private void memoEditor_KeyDown(object? sender, KeyEventArgs e)
    {
        if (!e.Control)
        {
            return;
        }

        if (e.KeyCode == Keys.B)
        {
            RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Bold, false);
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.I)
        {
            RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Italic, false);
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.U)
        {
            RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Underline, false);
            e.SuppressKeyPress = true;
            return;
        }

        if (e.Shift && e.KeyCode == Keys.S)
        {
            RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Strikeout, false);
            e.SuppressKeyPress = true;
        }
    }

    private static string MemoPlainTextForDisplay(string stored)
    {
        if (string.IsNullOrEmpty(stored))
        {
            return stored;
        }

        ReadOnlySpan<char> span = stored.AsSpan().TrimStart();
        if (!span.StartsWith("{\\rtf", StringComparison.OrdinalIgnoreCase))
        {
            return stored;
        }

        using RichTextBox rtb = new();
        try
        {
            rtb.Rtf = stored;
            return rtb.Text;
        }
        catch (ArgumentException)
        {
            return stored;
        }
    }

    private static void ApplyMemoContentToEditor(RichTextBox editor, string stored)
    {
        ReadOnlySpan<char> span = stored.AsSpan().TrimStart();
        if (span.StartsWith("{\\rtf", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                editor.Rtf = stored;
                return;
            }
            catch (ArgumentException)
            {
                // Fall through to plain text.
            }
        }

        editor.Text = stored;
    }

    private MemoPadForm CreateOffsetMemoPad()
    {
        MemoPadForm newMemoPad = new();
        newMemoPad.StartPosition = FormStartPosition.Manual;
        newMemoPad.Location = new Point(Location.X + 30, Location.Y + 30);
        return newMemoPad;
    }

    private MemoPadForm CreateFrontOffsetMemoPad()
    {
        MemoPadForm newMemoPad = new();
        newMemoPad.StartPosition = FormStartPosition.Manual;
        newMemoPad.Location = new Point(Location.X - 30, Location.Y - 30);
        return newMemoPad;
    }

    private void OpenMemoInNewPadWindow(string stored)
    {
        MemoPadForm newMemoPad = CreateFrontOffsetMemoPad();
        ApplyMemoContentToEditor(newMemoPad.memoEditor, stored);
        newMemoPad.Show();
        newMemoPad.BringToFront();
        newMemoPad.memoEditor.Focus();
        newMemoPad.memoEditor.SelectionStart = newMemoPad.memoEditor.TextLength;
    }

    private void listIconButton_Click(object sender, EventArgs e)
    {
        LoadMemos();
        string? memoToOpen = null;

        using Form listForm = new()
        {
            Text = "메모 목록",
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(520, 420),
            MinimizeBox = false,
            MaximizeBox = false,
            FormBorderStyle = FormBorderStyle.SizableToolWindow
        };

        TableLayoutPanel layout = new()
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44f));

        ListBox listBox = new()
        {
            Dock = DockStyle.Fill,
            Font = new Font("맑은 고딕", 10f, FontStyle.Regular),
            HorizontalScrollbar = true
        };

        Button deleteButton = new()
        {
            Dock = DockStyle.Fill,
            Text = "삭제"
        };

        Button loadButton = new()
        {
            Dock = DockStyle.Fill,
            Text = "불러오기"
        };

        TableLayoutPanel buttonRow = new()
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            Padding = new Padding(0)
        };
        buttonRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        buttonRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        buttonRow.Controls.Add(deleteButton, 0, 0);
        buttonRow.Controls.Add(loadButton, 1, 0);

        Panel buttonPanel = new()
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(8, 6, 8, 6)
        };
        buttonPanel.Controls.Add(buttonRow);

        void RefreshMemoListDisplay()
        {
            listBox.Items.Clear();
            if (_memoItems.Count == 0)
            {
                listBox.Items.Add("저장된 메모가 없습니다.");
                listBox.Enabled = false;
                deleteButton.Enabled = false;
                loadButton.Enabled = false;
                return;
            }

            listBox.Enabled = true;
            deleteButton.Enabled = true;
            loadButton.Enabled = true;
            for (int i = 0; i < _memoItems.Count; i++)
            {
                string preview = MemoPlainTextForDisplay(_memoItems[i]).ReplaceLineEndings(" ");
                if (preview.Length > 200)
                {
                    preview = preview[..200] + "…";
                }

                listBox.Items.Add($"{i + 1}. {preview}");
            }
        }

        RefreshMemoListDisplay();

        void LoadSelectedMemo()
        {
            if (listBox.SelectedIndex < 0 || listBox.SelectedIndex >= _memoItems.Count)
            {
                return;
            }

            memoToOpen = _memoItems[listBox.SelectedIndex];
            listForm.DialogResult = DialogResult.OK;
            listForm.Close();
        }

        void DeleteSelectedMemo()
        {
            if (_memoItems.Count == 0)
            {
                return;
            }

            if (listBox.SelectedIndex < 0 || listBox.SelectedIndex >= _memoItems.Count)
            {
                MessageBox.Show("삭제할 메모를 목록에서 선택해 주세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (MessageBox.Show(
                    "선택한 메모를 삭제하시겠습니까?",
                    "메모 삭제",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button2) != DialogResult.Yes)
            {
                return;
            }

            _memoItems.RemoveAt(listBox.SelectedIndex);
            SaveMemos();
            RefreshMemoListDisplay();
        }

        loadButton.Click += (_, _) => LoadSelectedMemo();
        deleteButton.Click += (_, _) => DeleteSelectedMemo();
        listBox.DoubleClick += (_, _) => LoadSelectedMemo();
        listBox.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Delete)
            {
                DeleteSelectedMemo();
                e.Handled = true;
            }
        };

        layout.Controls.Add(listBox, 0, 0);
        layout.Controls.Add(buttonPanel, 0, 1);
        listForm.Controls.Add(layout);
        listForm.ShowDialog(this);

        if (!string.IsNullOrEmpty(memoToOpen))
        {
            OpenMemoInNewPadWindow(memoToOpen);
        }
    }

    private void closeIconButton_Click(object sender, EventArgs e)
    {
        Close();
    }

    private void topBarPanel_MouseDown(object sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        _dragging = true;
        _dragStartPoint = e.Location;
    }

    private void topBarPanel_MouseMove(object sender, MouseEventArgs e)
    {
        if (!_dragging)
        {
            return;
        }

        Point currentScreenPos = PointToScreen(e.Location);
        Location = new Point(currentScreenPos.X - _dragStartPoint.X, currentScreenPos.Y - _dragStartPoint.Y);
    }

    private void topBarPanel_MouseUp(object sender, MouseEventArgs e)
    {
        _dragging = false;
    }

}
