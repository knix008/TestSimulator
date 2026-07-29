using System.ComponentModel;
using System.Text.Json;

namespace MemoPadV10;

public partial class MemoPadForm : Form
{
    private const int ResizeBorderThickness = 8;
    private const int WmNcHitTest = 0x84;
    private const int HtClient = 0x1;
    private const int HtLeft = 0xA;
    private const int HtRight = 0xB;
    private const int HtTop = 0xC;
    private const int HtTopLeft = 0xD;
    private const int HtTopRight = 0xE;
    private const int HtBottom = 0xF;
    private const int HtBottomLeft = 0x10;
    private const int HtBottomRight = 0x11;

    private readonly List<string> _memoItems = [];
    private readonly string _memoFilePath;
    private bool _dragging;
    private Point _dragStartPoint;

    // 목록에서 열어 놓은 메모 창들을 추적해, 같은 메모를 중복해서 열지 않도록 합니다.
    private static readonly List<MemoPadForm> OpenMemoWindows = [];
    private string? _sourceMemo;

    private readonly ToolTip _toolTip = new();

    // 트레이 아이콘은 앱당 하나만 둡니다(첫 인스턴스가 생성).
    private static NotifyIcon? _trayIcon;
    private static MemoPadForm? _trayOwner;
    // 트레이 '종료'로만 실제 종료됩니다. 그 외 닫기는 트레이로 숨깁니다.
    private static bool _exitRequested;

    public MemoPadForm()
    {
        InitializeComponent();
        TrySetAppIcon();
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
        ApplyMainLanguage();
        SetupTrayIcon();
    }

    /// <summary>실행 중 시스템 트레이에 앱 아이콘을 표시합니다(앱당 1개).</summary>
    private void SetupTrayIcon()
    {
        if (_trayIcon != null)
        {
            return;
        }

        _trayOwner = this;
        _trayIcon = new NotifyIcon
        {
            Icon = Icon ?? SystemIcons.Application,
            Text = Loc.T("tray.tooltip"),
            Visible = true
        };

        ContextMenuStrip menu = new();
        menu.Items.Add(Loc.T("tray.show"), null, (_, _) => RestoreFromTray());
        menu.Items.Add(Loc.T("tray.exit"), null, (_, _) => ExitApplication());
        _trayIcon.ContextMenuStrip = menu;
        _trayIcon.DoubleClick += (_, _) => RestoreFromTray();

        // 기본 창의 닫기(X)는 종료가 아니라 트레이로 숨깁니다.
        FormClosing += PrimaryFormClosing;

        Application.ApplicationExit += (_, _) =>
        {
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }
        };
    }

    /// <summary>트레이 '종료' 전용: 실제로 앱을 끝냅니다.</summary>
    private static void ExitApplication()
    {
        _exitRequested = true;
        Application.Exit();
    }

    private void PrimaryFormClosing(object? sender, FormClosingEventArgs e)
    {
        // 트레이 '종료'나 Windows 종료가 아니면, 닫지 않고 트레이로 숨깁니다.
        if (!_exitRequested && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
        }
    }

    private void RestoreFromTray()
    {
        Form target = _trayOwner ?? this;
        if (target.IsDisposed)
        {
            return;
        }

        target.Show();
        if (target.WindowState == FormWindowState.Minimized)
        {
            target.WindowState = FormWindowState.Normal;
        }

        target.Activate();
        target.BringToFront();
    }

    /// <summary>임베드된 app.ico를 작업표시줄/Alt-Tab 아이콘으로 설정합니다.</summary>
    private void TrySetAppIcon()
    {
        try
        {
            using Stream? s = typeof(MemoPadForm).Assembly
                .GetManifestResourceStream("MemoPadV10.assets.app.ico");
            if (s != null)
            {
                Icon = new Icon(s);
            }
        }
        catch
        {
            // 아이콘 로드 실패는 치명적이지 않으므로 무시합니다.
        }
    }

    private void WireMemoEditorContextMenu()
    {
        ContextMenuStrip ctx = new();
        // 아이콘과 레이블을 함께 표시하기 위해 이미지 마진을 사용합니다.
        ctx.ShowImageMargin = true;

        ctx.Items.Add(new ToolStripMenuItem(Loc.T("settings.style.bold"), new Bitmap(EditorSettingsForm.MakeGlyphIcon("B", Color.Navy, Color.Transparent, 20), new Size(18,18)), (_, _) => RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Bold, false)));
        ctx.Items.Add(new ToolStripMenuItem(Loc.T("settings.style.italic"), new Bitmap(EditorSettingsForm.MakeGlyphIcon("I", Color.DarkGreen, Color.Transparent, 20), new Size(18,18)), (_, _) => RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Italic, false)));
        ctx.Items.Add(new ToolStripMenuItem(Loc.T("settings.style.underline"), new Bitmap(EditorSettingsForm.MakeGlyphIcon("U", Color.DarkMagenta, Color.Transparent, 20), new Size(18,18)), (_, _) => RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Underline, false)));
        ctx.Items.Add(new ToolStripMenuItem(Loc.T("settings.style.strike"), new Bitmap(EditorSettingsForm.MakeGlyphIcon("S", Color.Sienna, Color.Transparent, 20), new Size(18,18)), (_, _) => RichTextFormatting.ToggleFontStyle(memoEditor, FontStyle.Strikeout, false)));
        ctx.Items.Add(new ToolStripSeparator());
        ctx.Items.Add(new ToolStripMenuItem(Loc.T("settings.font"), new Bitmap(EditorSettingsForm.MakeGlyphIcon("A", Color.MediumBlue, Color.Transparent, 20), new Size(18,18)), (_, _) => ShowMemoQuickFontDialog()));
        memoEditor.ContextMenuStrip = ctx;
    }

    /// <summary>메인 창의 언어 종속 텍스트(툴팁·컨텍스트 메뉴)를 현재 언어로 갱신합니다.</summary>
    private void ApplyMainLanguage()
    {
        _toolTip.SetToolTip(addMemoIconButton, Loc.T("main.add"));
        _toolTip.SetToolTip(saveMemoIconButton, Loc.T("main.save"));
        _toolTip.SetToolTip(settingsIconButton, Loc.T("main.settings"));
        _toolTip.SetToolTip(listIconButton, Loc.T("main.listBtn"));
        _toolTip.SetToolTip(closeIconButton, Loc.T("main.close"));
        WireMemoEditorContextMenu();
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
            MessageBox.Show(Loc.T("memo.empty"), Loc.T("common.info"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _memoItems.Add(memoEditor.Rtf ?? string.Empty);
        SaveMemos();
        memoEditor.Clear();
        MessageBox.Show(Loc.T("memo.added"), Loc.T("common.done"), MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            MessageBox.Show(Loc.T("list.loadFailed"), Loc.T("common.error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
            MessageBox.Show(Loc.T("memo.saveFailed"), Loc.T("common.error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
        // 설정에서 언어가 바뀌었을 수 있으므로 메인 창 텍스트를 갱신합니다.
        ApplyMainLanguage();
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
        // 이미 같은 메모를 보여주는 창이 열려 있으면 새로 열지 않고 그 창을 앞으로 가져옵니다.
        foreach (MemoPadForm existing in OpenMemoWindows)
        {
            if (existing.IsDisposed || !string.Equals(existing._sourceMemo, stored, StringComparison.Ordinal))
            {
                continue;
            }

            if (existing.WindowState == FormWindowState.Minimized)
            {
                existing.WindowState = FormWindowState.Normal;
            }

            existing.Activate();
            existing.BringToFront();
            existing.memoEditor.Focus();
            return;
        }

        MemoPadForm newMemoPad = CreateFrontOffsetMemoPad();
        ApplyMemoContentToEditor(newMemoPad.memoEditor, stored);
        newMemoPad._sourceMemo = stored;
        OpenMemoWindows.Add(newMemoPad);
        newMemoPad.FormClosed += (_, _) => OpenMemoWindows.Remove(newMemoPad);
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
            Text = Loc.T("list.title"),
            StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(520, 420),
            MinimizeBox = false,
            MaximizeBox = false,
            ShowInTaskbar = false,
            ShowIcon = false,
            FormBorderStyle = FormBorderStyle.FixedDialog
        };

        ListView listView = new()
        {
            Dock = DockStyle.Fill,
            Font = new Font("맑은 고딕", 10f, FontStyle.Regular),
            View = View.Details,
            FullRowSelect = true,
            MultiSelect = false,
            HideSelection = false
        };
        listView.Columns.Add(Loc.T("list.col.no"), 60, HorizontalAlignment.Left);
        listView.Columns.Add(Loc.T("list.col.preview"), 420, HorizontalAlignment.Left);

        // 마지막(미리보기) 컬럼이 남는 너비를 모두 채우도록 해, 오른쪽에 빈 컬럼처럼 보이는 공간을 없앱니다.
        void FitPreviewColumn()
        {
            int remaining = listView.ClientSize.Width - listView.Columns[0].Width;
            if (remaining > 60)
            {
                listView.Columns[1].Width = remaining;
            }
        }
        listView.Resize += (_, _) => FitPreviewColumn();

        Button loadButton = new()
        {
            Text = Loc.T("list.load"),
            Size = new Size(112, 34),
            Margin = new Padding(6, 0, 0, 0),
            Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("▶", Color.ForestGreen, Color.Transparent, 20), new Size(16, 16)),
            ImageAlign = ContentAlignment.MiddleRight,
            TextAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText
        };

        Button deleteButton = new()
        {
            Text = Loc.T("list.delete"),
            Size = new Size(112, 34),
            Margin = new Padding(6, 0, 0, 0),
            Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("✕", Color.Firebrick, Color.Transparent, 20), new Size(16, 16)),
            ImageAlign = ContentAlignment.MiddleRight,
            TextAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText
        };

        // 오른쪽 정렬로 [삭제] [불러오기] 순서로 배치합니다.
        FlowLayoutPanel buttonPanel = new()
        {
            Dock = DockStyle.Bottom,
            Height = 52,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(10)
        };
        buttonPanel.Controls.Add(loadButton);
        buttonPanel.Controls.Add(deleteButton);

        void RefreshMemoListDisplay()
        {
            listView.Items.Clear();
            if (_memoItems.Count == 0)
            {
                listView.Items.Add(new ListViewItem(new[] { "", Loc.T("list.empty") }));
                listView.Enabled = false;
                deleteButton.Enabled = false;
                loadButton.Enabled = false;
                return;
            }

            listView.Enabled = true;
            deleteButton.Enabled = true;
            loadButton.Enabled = true;
            for (int i = 0; i < _memoItems.Count; i++)
            {
                string preview = MemoPlainTextForDisplay(_memoItems[i]).ReplaceLineEndings(" ");
                if (preview.Length > 200)
                {
                    preview = preview[..200] + "…";
                }

                var item = new ListViewItem((i + 1).ToString());
                item.SubItems.Add(preview);
                listView.Items.Add(item);
            }
        }

        RefreshMemoListDisplay();

        void LoadSelectedMemo()
        {
            if (listView.SelectedIndices.Count == 0)
            {
                return;
            }

            int idx = listView.SelectedIndices[0];
            if (idx < 0 || idx >= _memoItems.Count)
            {
                return;
            }

            memoToOpen = _memoItems[idx];
            listForm.DialogResult = DialogResult.OK;
            listForm.Close();
        }

        void DeleteSelectedMemo()
        {
            if (_memoItems.Count == 0)
            {
                return;
            }

            if (listView.SelectedIndices.Count == 0)
            {
                MessageBox.Show(Loc.T("list.selectToDelete"), Loc.T("common.info"), MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (MessageBox.Show(
                    Loc.T("list.confirmDelete"),
                    Loc.T("list.confirmDelete.title"),
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button2) != DialogResult.Yes)
            {
                return;
            }

            int idxToDelete = listView.SelectedIndices[0];
            if (idxToDelete < 0 || idxToDelete >= _memoItems.Count)
            {
                return;
            }

            _memoItems.RemoveAt(idxToDelete);
            SaveMemos();
            RefreshMemoListDisplay();
        }

        loadButton.Click += (_, _) => LoadSelectedMemo();
        deleteButton.Click += (_, _) => DeleteSelectedMemo();
        listView.DoubleClick += (_, _) => LoadSelectedMemo();
        listView.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Delete)
            {
                DeleteSelectedMemo();
                e.Handled = true;
            }
        };

        // Fill(listView)을 먼저 추가하고 Bottom(buttonPanel)을 나중에 추가해야
        // 버튼 줄이 하단에 고정되고 목록이 그 위 공간을 채웁니다.
        listForm.Controls.Add(listView);
        listForm.Controls.Add(buttonPanel);
        buttonPanel.BringToFront();
        listForm.AcceptButton = loadButton;
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

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmNcHitTest)
        {
            Point screenPoint = new(unchecked((short)(long)m.LParam), unchecked((short)((long)m.LParam >> 16)));
            Point cursorPoint = PointToClient(screenPoint);
            bool left = cursorPoint.X <= ResizeBorderThickness;
            bool right = cursorPoint.X >= ClientSize.Width - ResizeBorderThickness;
            bool top = cursorPoint.Y <= ResizeBorderThickness;
            bool bottom = cursorPoint.Y >= ClientSize.Height - ResizeBorderThickness;

            if (left && top)
            {
                m.Result = (IntPtr)HtTopLeft;
                return;
            }

            if (right && top)
            {
                m.Result = (IntPtr)HtTopRight;
                return;
            }

            if (left && bottom)
            {
                m.Result = (IntPtr)HtBottomLeft;
                return;
            }

            if (right && bottom)
            {
                m.Result = (IntPtr)HtBottomRight;
                return;
            }

            if (left)
            {
                m.Result = (IntPtr)HtLeft;
                return;
            }

            if (right)
            {
                m.Result = (IntPtr)HtRight;
                return;
            }

            if (top)
            {
                m.Result = (IntPtr)HtTop;
                return;
            }

            if (bottom)
            {
                m.Result = (IntPtr)HtBottom;
                return;
            }
        }

        base.WndProc(ref m);
    }
}
