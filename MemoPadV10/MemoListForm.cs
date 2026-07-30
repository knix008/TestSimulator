namespace MemoPadV10;

/// <summary>메모 저장 목록 전용 창(--list 모드). 저장된 메모를 세로 카드로 표시합니다.</summary>
public class MemoListForm : Form
{
    private const int CardSidePadding = 16;
    private const int CardShadowDepth = 5;
    private const int ResizeBorderThickness = 28;
    private const int WmNcHitTest = 0x84;
    private const int HtLeft = 0xA;
    private const int HtRight = 0xB;
    private const int HtTop = 0xC;
    private const int HtTopLeft = 0xD;
    private const int HtTopRight = 0xE;
    private const int HtBottom = 0xF;
    private const int HtBottomLeft = 0x10;
    private const int HtBottomRight = 0x11;

    private readonly List<string> _memoItems = [];
    private readonly Panel _topBarPanel;
    private readonly Panel _scrollViewport;
    private readonly Panel _clipPanel;
    private readonly FlowLayoutPanel _cardHost;
    private readonly ThemedVScrollBar _vScrollBar;
    private readonly Label _emptyLabel;
    private readonly Button _loadButton;
    private readonly Button _newButton;
    private readonly Button _settingsButton;
    private readonly Button _closeButton;
    private readonly ToolTip _toolTip = new();
    private readonly RichTextBox _settingsEditor = new() { Visible = false };
    private Color _memoBack = Color.FromArgb(248, 225, 140);
    private Color _cardFace = Color.FromArgb(252, 235, 170);
    private Color _cardSelectedBack = Color.FromArgb(255, 242, 190);
    private int _selectedIndex = -1;
    private bool _dragging;
    private Point _dragStartPoint;

    public MemoListForm()
    {
        Text = Loc.T("list.title");
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(420, 560);
        MinimizeBox = false;
        MaximizeBox = false;
        ShowInTaskbar = true;
        FormBorderStyle = FormBorderStyle.None;
        MinimumSize = new Size(360, 400);
        Padding = new Padding(1);

        TrySetAppIcon();

        _topBarPanel = new Panel
        {
            Name = "topBarPanel",
            Dock = DockStyle.Top,
            Height = 42,
            Padding = new Padding(4, 3, 4, 3)
        };
        _topBarPanel.MouseDown += TopBar_MouseDown;
        _topBarPanel.MouseMove += TopBar_MouseMove;
        _topBarPanel.MouseUp += TopBar_MouseUp;

        _settingsButton = new Button
        {
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI Symbol", 16F, FontStyle.Bold),
            Size = new Size(44, 36),
            Location = new Point(4, 3),
            Text = "⚙",
            TabStop = false,
            UseVisualStyleBackColor = true
        };
        _settingsButton.FlatAppearance.BorderSize = 0;
        _settingsButton.Click += (_, _) => OpenSettings();
        _toolTip.SetToolTip(_settingsButton, Loc.T("list.settings"));

        _closeButton = new Button
        {
            FlatStyle = FlatStyle.Flat,
            Font = new Font("맑은 고딕", 15F, FontStyle.Bold),
            Size = new Size(44, 36),
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            Text = "X",
            TabStop = false,
            UseVisualStyleBackColor = true
        };
        _closeButton.FlatAppearance.BorderSize = 0;
        _closeButton.Click += (_, _) => Close();
        _toolTip.SetToolTip(_closeButton, Loc.T("main.close"));

        _topBarPanel.Controls.Add(_settingsButton);
        _topBarPanel.Controls.Add(_closeButton);
        _topBarPanel.Resize += (_, _) =>
        {
            _closeButton.Location = new Point(_topBarPanel.ClientSize.Width - _closeButton.Width - 4, 3);
        };

        _cardHost = new FlowLayoutPanel
        {
            AutoScroll = false,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Padding = new Padding(CardSidePadding, 14, CardSidePadding, 12),
            Location = Point.Empty
        };
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            System.Reflection.BindingFlags.SetProperty | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic,
            null,
            _cardHost,
            [true]);
        _cardHost.Resize += (_, _) => ResizeCards();
        _cardHost.Layout += (_, _) => SyncScrollMetrics();
        _cardHost.KeyDown += Host_KeyDown;
        _cardHost.MouseWheel += ScrollViewport_MouseWheel;

        _vScrollBar = new ThemedVScrollBar
        {
            Dock = DockStyle.Right,
            Width = 12,
            Visible = false
        };
        _vScrollBar.ValueChanged += (_, _) =>
        {
            _cardHost.Top = -_vScrollBar.Value;
        };

        _clipPanel = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = false
        };
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            System.Reflection.BindingFlags.SetProperty | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic,
            null,
            _clipPanel,
            [true]);
        _clipPanel.Controls.Add(_cardHost);
        _clipPanel.Resize += (_, _) => SyncScrollMetrics();
        _clipPanel.MouseWheel += ScrollViewport_MouseWheel;

        _scrollViewport = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = false
        };
        _scrollViewport.Controls.Add(_clipPanel);
        _scrollViewport.Controls.Add(_vScrollBar);
        _vScrollBar.BringToFront();
        _scrollViewport.MouseWheel += ScrollViewport_MouseWheel;

        _emptyLabel = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("맑은 고딕", 11f, FontStyle.Regular),
            ForeColor = Color.DimGray,
            Text = Loc.T("list.empty"),
            Visible = false
        };

        _loadButton = new Button
        {
            Text = Loc.T("list.load"),
            Size = new Size(112, 34),
            Margin = new Padding(6, 0, 0, 0),
            Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("\U0001F4C2", Color.ForestGreen, Color.Transparent, 20, "Segoe UI Symbol"), new Size(16, 16)),
            ImageAlign = ContentAlignment.MiddleRight,
            TextAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText
        };
        _loadButton.Click += (_, _) => ImportTextFile();
        _toolTip.SetToolTip(_loadButton, Loc.T("list.load.tip"));

        _newButton = new Button
        {
            Text = Loc.T("list.new"),
            Size = new Size(112, 34),
            Margin = new Padding(6, 0, 0, 0),
            Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("\U0001F4DD", Color.DarkSlateGray, Color.Transparent, 20, "Segoe UI Symbol"), new Size(16, 16)),
            ImageAlign = ContentAlignment.MiddleRight,
            TextAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText
        };
        _newButton.Click += (_, _) =>
        {
            CancelPendingListRetake();
            AppIpc.SuppressActivateHandling(1000);
            AppIpc.RequestNewMemo();
        };
        _toolTip.SetToolTip(_newButton, Loc.T("list.new.tip"));

        FlowLayoutPanel buttonPanel = new()
        {
            Name = "listBottomPanel",
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(10),
            WrapContents = false
        };
        // RightToLeft: 먼저 넣은 버튼이 오른쪽에 옴 → 새 메모를 오른쪽에
        buttonPanel.Controls.Add(_newButton);
        buttonPanel.Controls.Add(_loadButton);

        Panel contentPanel = new() { Dock = DockStyle.Fill };
        contentPanel.Controls.Add(_scrollViewport);
        contentPanel.Controls.Add(_emptyLabel);

        TableLayoutPanel root = new()
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(0)
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42f));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52f));

        _topBarPanel.Dock = DockStyle.Fill;
        root.Controls.Add(_topBarPanel, 0, 0);
        root.Controls.Add(contentPanel, 0, 1);
        root.Controls.Add(buttonPanel, 0, 2);

        Controls.Add(_settingsEditor);
        Controls.Add(root);
        AcceptButton = _newButton;
        KeyPreview = true;
        KeyDown += Host_KeyDown;
        Paint += (_, e) =>
        {
            using Pen pen = new(Color.FromArgb(160, 140, 80));
            e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
        };

        ApplyMemoTheme();
        ReloadAndRefresh();
        ApplyLanguage();
        Activated += MemoListForm_Activated;
    }

    private int _companionRaiseGeneration;

    /// <summary>
    /// 목록을 선택하면 열린 메모 창도 같이 보이게 올립니다.
    /// 포커스는 목록에 유지해야 닫기·카드 선택이 가능합니다.
    /// </summary>
    private void MemoListForm_Activated(object? sender, EventArgs e)
    {
        if (AppIpc.ShouldIgnoreActivate())
        {
            return;
        }

        RaiseCompanionPads(keepListOnTop: true);
    }

    private void RaiseCompanionPads(bool keepListOnTop)
    {
        int generation = ++_companionRaiseGeneration;
        AppIpc.SuppressActivateHandling(600);
        if (_selectedIndex >= 0)
        {
            AppIpc.RememberPreferredPadIndex(_selectedIndex);
        }

        AppIpc.NotifyBringPadsToFront();

        if (!keepListOnTop)
        {
            return;
        }

        // 패드 프로세스에서 창을 올린 뒤, 목록이 다시 위에 오도록 짧게 지연합니다.
        System.Windows.Forms.Timer retake = new() { Interval = 80 };
        retake.Tick += (_, _) =>
        {
            retake.Stop();
            retake.Dispose();
            // 더블클릭 열기 등으로 무효화된 요청은 목록을 다시 올리지 않음
            if (IsDisposed || generation != _companionRaiseGeneration)
            {
                return;
            }

            AppIpc.SuppressActivateHandling(400);
            AppIpc.ActivateWindow(this, setForeground: true, restoreIfHidden: false);
        };
        retake.Start();
    }

    /// <summary>진행 중인 '목록 다시 위로' 타이머를 취소합니다(메모 열기 직전).</summary>
    private void CancelPendingListRetake() => _companionRaiseGeneration++;

    private void ApplyMemoTheme()
    {
        EditorSettings.Data data = EditorSettings.TryLoad() ?? EditorSettings.LoadDefaults();
        EditorSettings.ApplyToUi(_settingsEditor, this, data);
        Loc.Language = Loc.Parse(data.Language);

        ApplyBackColorToUi(Color.FromArgb(data.EditorBackColorArgb));
    }

    /// <summary>배경색을 목록 창 전체(카드·패널·스크롤바·툴바)에 반영합니다.</summary>
    private void ApplyBackColorToUi(Color memoBack)
    {
        _memoBack = memoBack;
        BackColor = _memoBack;
        DeriveCardColors(_memoBack);

        _topBarPanel.BackColor = EditorSettings.DeriveToolbarColor(_memoBack);
        _cardHost.BackColor = _memoBack;
        _clipPanel.BackColor = _memoBack;
        _scrollViewport.BackColor = _memoBack;
        _emptyLabel.BackColor = _memoBack;
        _vScrollBar.ApplyTheme(_memoBack);
        foreach (Control c in Controls.Find("listBottomPanel", true))
        {
            c.BackColor = EditorSettings.DeriveToolbarColor(_memoBack);
        }

        StyleToolbarButton(_settingsButton);
        StyleToolbarButton(_closeButton);

        if (_cardHost.Controls.Count > 0)
        {
            UpdateCardSelectionVisuals();
        }
    }

    /// <summary>설정창의 실시간 색 미리보기를 목록 창 전체에 즉시 반영합니다(저장 없음).</summary>
    public void ApplyPreviewBackColor(Color color) => ApplyBackColorToUi(color);

    /// <summary>메인 메모 창 툴바 버튼과 동일: 테두리 없음, 호버 시 시스템 기본 음영.</summary>
    private void StyleToolbarButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.BorderColor = _topBarPanel.BackColor;
        // 이전에 지정한 커스텀 호버색을 지우고 메인 창과 같은 시각 스타일을 씁니다.
        button.FlatAppearance.MouseOverBackColor = Color.Empty;
        button.FlatAppearance.MouseDownBackColor = Color.Empty;
        button.UseVisualStyleBackColor = true;
    }

    private void DeriveCardColors(Color baseColor)
    {
        _cardFace = ControlPaint.Light(baseColor, 0.12f);
        _cardSelectedBack = ControlPaint.Light(baseColor, 0.28f);
    }

    private void TopBar_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        _dragging = true;
        _dragStartPoint = e.Location;
    }

    private void TopBar_MouseMove(object? sender, MouseEventArgs e)
    {
        if (!_dragging)
        {
            return;
        }

        Point screen = _topBarPanel.PointToScreen(e.Location);
        Location = new Point(screen.X - _dragStartPoint.X, screen.Y - _dragStartPoint.Y);
    }

    private void TopBar_MouseUp(object? sender, MouseEventArgs e)
    {
        _dragging = false;
    }

    private void TrySetAppIcon()
    {
        try
        {
            using Stream? s = typeof(MemoListForm).Assembly
                .GetManifestResourceStream("MemoPadV10.assets.app.ico");
            if (s != null)
            {
                Icon = new Icon(s);
            }
        }
        catch
        {
            // ignore
        }
    }

    private void ApplyLanguage()
    {
        Text = Loc.T("list.title");
        _emptyLabel.Text = Loc.T("list.empty");
        _loadButton.Text = Loc.T("list.load");
        _newButton.Text = Loc.T("list.new");
        _toolTip.SetToolTip(_loadButton, Loc.T("list.load.tip"));
        _toolTip.SetToolTip(_newButton, Loc.T("list.new.tip"));
        _toolTip.SetToolTip(_settingsButton, Loc.T("list.settings"));
        _toolTip.SetToolTip(_closeButton, Loc.T("main.close"));
        RefreshDisplay();
    }

    public void ReloadAndRefresh()
    {
        _memoItems.Clear();
        _memoItems.AddRange(MemoStore.Load());
        if (_selectedIndex >= _memoItems.Count)
        {
            _selectedIndex = _memoItems.Count - 1;
        }

        RefreshDisplay();
    }

    private void RefreshDisplay()
    {
        _cardHost.SuspendLayout();
        _cardHost.Controls.Clear();

        if (_memoItems.Count == 0)
        {
            _selectedIndex = -1;
            _emptyLabel.Visible = true;
            _scrollViewport.Visible = false;
            _loadButton.Enabled = false;
            _cardHost.ResumeLayout();
            return;
        }

        _emptyLabel.Visible = false;
        _scrollViewport.Visible = true;
        _cardHost.Visible = true;
        _loadButton.Enabled = true;

        if (_selectedIndex < 0)
        {
            _selectedIndex = 0;
        }

        for (int i = 0; i < _memoItems.Count; i++)
        {
            _cardHost.Controls.Add(CreateMemoCard(i, _memoItems[i]));
        }

        _cardHost.ResumeLayout();
        SyncScrollMetrics();
        UpdateCardSelectionVisuals();
    }

    private Panel CreateMemoCard(int index, string stored)
    {
        string preview = MemoStore.PlainTextForDisplay(stored).Trim();
        if (string.IsNullOrEmpty(preview))
        {
            preview = "...";
        }

        MemoCardPanel card = new()
        {
            Height = 122,
            Margin = new Padding(0, 4, 0, 10),
            Cursor = Cursors.Hand,
            MemoIndex = index,
            PreviewText = preview,
            HostBackColor = _memoBack,
            FaceColor = _cardFace,
            SelectedFaceColor = _cardSelectedBack,
            IsSelected = index == _selectedIndex
        };

        Button cardDeleteButton = new()
        {
            FlatAppearance = { BorderSize = 0 },
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI Emoji", 11F, FontStyle.Regular),
            ForeColor = Color.Firebrick,
            Size = new Size(28, 26),
            Text = "🗑",
            Cursor = Cursors.Hand,
            TabStop = false,
            BackColor = Color.Transparent,
            Anchor = AnchorStyles.Top | AnchorStyles.Right
        };
        _toolTip.SetToolTip(cardDeleteButton, Loc.T("list.delete"));
        cardDeleteButton.Click += (_, _) =>
        {
            SelectCard(index);
            DeleteMemoAt(index);
        };

        void SelectThis(object? _, EventArgs __) => SelectCard(index);
        void OpenThis(object? _, EventArgs __)
        {
            // 더블클릭 직전 Click의 동반 올리기와 경합하지 않도록, 선택은 하되 열기만 진행
            SelectCard(index, raiseCompanions: false);
            LoadSelectedMemo();
        }

        card.Click += SelectThis;
        card.DoubleClick += OpenThis;

        card.Controls.Add(cardDeleteButton);
        cardDeleteButton.BringToFront();
        void LayoutCardChildren()
        {
            int faceRight = Math.Max(0, card.ClientSize.Width - CardShadowDepth);
            cardDeleteButton.Location = new Point(Math.Max(0, faceRight - cardDeleteButton.Width - 6), 4);
            card.Invalidate();
        }

        card.Resize += (_, _) => LayoutCardChildren();
        LayoutCardChildren();

        return card;
    }

    private bool _syncingScroll;

    private void ResizeCards()
    {
        if (_cardHost.IsDisposed || !_cardHost.IsHandleCreated)
        {
            return;
        }

        int width = _cardHost.ClientSize.Width - (CardSidePadding * 2);
        if (width < 120)
        {
            width = 120;
        }

        foreach (Control control in _cardHost.Controls)
        {
            if (control.Width != width)
            {
                control.Width = width;
            }
        }
    }

    private void SyncScrollMetrics()
    {
        if (_syncingScroll || _clipPanel.IsDisposed || !_clipPanel.IsHandleCreated)
        {
            return;
        }

        _syncingScroll = true;
        try
        {
            int viewportW = _clipPanel.ClientSize.Width;
            int viewportH = Math.Max(1, _clipPanel.ClientSize.Height);
            _cardHost.Width = Math.Max(120, viewportW);
            _cardHost.Left = 0;
            ResizeCards();
            _cardHost.PerformLayout();

            int contentH = _cardHost.Padding.Vertical;
            if (_cardHost.Controls.Count > 0)
            {
                contentH = Math.Max(contentH, _cardHost.Controls[_cardHost.Controls.Count - 1].Bottom + _cardHost.Padding.Bottom);
            }

            _cardHost.Height = Math.Max(viewportH, contentH);
            int max = Math.Max(0, _cardHost.Height - viewportH);
            _vScrollBar.Visible = max > 0;
            _vScrollBar.Maximum = max;
            if (_vScrollBar.Value > max)
            {
                _vScrollBar.SetValueSilent(max);
            }

            _cardHost.Top = -_vScrollBar.Value;
            _cardHost.Invalidate(true);
            _clipPanel.Invalidate();
        }
        finally
        {
            _syncingScroll = false;
        }
    }

    private void ScrollViewport_MouseWheel(object? sender, MouseEventArgs e)
    {
        if (_vScrollBar.Maximum <= 0)
        {
            return;
        }

        int step = Math.Max(32, Math.Abs(e.Delta) / 3);
        _vScrollBar.Value += e.Delta > 0 ? -step : step;
    }

    private void SelectCard(int index, bool raiseCompanions = true)
    {
        if (index < 0 || index >= _memoItems.Count)
        {
            return;
        }

        bool changed = _selectedIndex != index;
        _selectedIndex = index;
        UpdateCardSelectionVisuals();
        _cardHost.Focus();
        // 카드 클릭으로 선택이 바뀌거나 같은 카드 재클릭이면 메모 창도 같이 올림
        if (raiseCompanions && (changed || !AppIpc.ShouldIgnoreActivate()))
        {
            RaiseCompanionPads(keepListOnTop: true);
        }
    }

    private void UpdateCardSelectionVisuals()
    {
        foreach (Control control in _cardHost.Controls)
        {
            if (control is not MemoCardPanel card)
            {
                continue;
            }

            card.HostBackColor = _memoBack;
            card.FaceColor = _cardFace;
            card.SelectedFaceColor = _cardSelectedBack;
            card.IsSelected = card.MemoIndex == _selectedIndex;
            card.Invalidate();
        }
    }

    /// <summary>파일에 저장된 설정을 목록 창 전체에 반영합니다.</summary>
    public void ApplySettingsFromStore()
    {
        ApplyMemoTheme();
        ApplyLanguage();
        ReloadAndRefresh();
    }

    private void OpenSettings()
    {
        using EditorSettingsForm dlg = new(_settingsEditor, this);
        // 색을 고를 때마다 목록 전체와 메모 패드 프로세스에 실시간 반영합니다.
        dlg.PreviewColorChanged += color =>
        {
            ApplyPreviewBackColor(color);
            AppIpc.NotifyPadPreviewColor(color);
        };

        DialogResult result = dlg.ShowDialog(this);
        // OK면 디스크의 새 설정, 취소면 저장된 설정으로 목록·패드를 되돌립니다.
        ApplySettingsFromStore();
        AppIpc.NotifyPadSettingsChanged();
    }

    private DateTime _lastOpenRequestUtc = DateTime.MinValue;
    private int _lastOpenRequestIndex = -1;

    /// <summary>텍스트/RTF 파일을 선택해 메모 창에서 엽니다.</summary>
    private void ImportTextFile()
    {
        using OpenFileDialog dlg = new()
        {
            Title = Loc.T("list.load"),
            Filter = Loc.T("list.openFile.filter"),
            FilterIndex = 1,
            CheckFileExists = true,
            Multiselect = false
        };

        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        AppIpc.RequestOpenTextFile(dlg.FileName);
    }

    private void LoadSelectedMemo()
    {
        if (_selectedIndex < 0 || _selectedIndex >= _memoItems.Count)
        {
            MessageBox.Show(this, Loc.T("list.selectToLoad"), Loc.T("common.info"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        // 더블클릭 시 동일 요청이 연속으로 들어오면 한 번만 처리합니다.
        DateTime now = DateTime.UtcNow;
        if (_lastOpenRequestIndex == _selectedIndex
            && (now - _lastOpenRequestUtc).TotalMilliseconds < 600)
        {
            return;
        }

        _lastOpenRequestIndex = _selectedIndex;
        _lastOpenRequestUtc = now;
        CancelPendingListRetake();
        AppIpc.SuppressActivateHandling(1000);
        AppIpc.RememberPreferredPadIndex(_selectedIndex);
        AppIpc.RequestOpenMemo(_selectedIndex);
    }

    private void DeleteMemoAt(int index)
    {
        if (index < 0 || index >= _memoItems.Count)
        {
            return;
        }

        DialogResult confirm = MessageBox.Show(
            this,
            Loc.T("memo.confirmDelete"),
            Loc.T("memo.confirmDelete.title"),
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);
        if (confirm != DialogResult.Yes)
        {
            return;
        }

        _memoItems.RemoveAt(index);
        MemoStore.Save(_memoItems);
        AppIpc.NotifyMemosChanged();
        if (_selectedIndex >= _memoItems.Count)
        {
            _selectedIndex = _memoItems.Count - 1;
        }
        else if (_selectedIndex > index)
        {
            _selectedIndex--;
        }

        RefreshDisplay();
    }

    private void Host_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Delete)
        {
            if (_selectedIndex >= 0)
            {
                DeleteMemoAt(_selectedIndex);
            }

            e.Handled = true;
            return;
        }

        if (e.KeyCode == Keys.Enter)
        {
            LoadSelectedMemo();
            e.Handled = true;
            return;
        }

        if (e.KeyCode == Keys.Escape)
        {
            Close();
            e.Handled = true;
            return;
        }

        if (e.KeyCode == Keys.Up && _selectedIndex > 0)
        {
            SelectCard(_selectedIndex - 1);
            e.Handled = true;
            return;
        }

        if (e.KeyCode == Keys.Down && _selectedIndex < _memoItems.Count - 1)
        {
            SelectCard(_selectedIndex + 1);
            e.Handled = true;
        }
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

    /// <summary>그림자·테두리·미리보기(...)를 한 번에 그리는 카드. 잔상/검정 배경을 막기 위해 더블버퍼로 전체 영역을 다시 칠합니다.</summary>
    private sealed class MemoCardPanel : Panel
    {
        private static readonly Font NumberFont = new("맑은 고딕", 9f, FontStyle.Bold);
        private static readonly Font PreviewFont = new("맑은 고딕", 10f, FontStyle.Regular);

        public int MemoIndex { get; set; }
        public string PreviewText { get; set; } = string.Empty;
        public Color HostBackColor { get; set; } = Color.FromArgb(248, 225, 140);
        public Color FaceColor { get; set; } = Color.FromArgb(252, 235, 170);
        public Color SelectedFaceColor { get; set; } = Color.FromArgb(255, 242, 190);
        public bool IsSelected { get; set; }

        public MemoCardPanel()
        {
            SetStyle(ControlStyles.UserPaint
                | ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer
                | ControlStyles.ResizeRedraw
                | ControlStyles.Opaque, true);
            UpdateStyles();
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            // OnPaint에서 전체 영역을 칠합니다.
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            int depth = CardShadowDepth;
            int faceWidth = Math.Max(1, Width - depth);
            int faceHeight = Math.Max(1, Height - depth);

            // 1) 호스트 배경으로 카드 전체를 지워 리사이즈 잔상을 제거합니다.
            using (SolidBrush clear = new(HostBackColor))
            {
                g.FillRectangle(clear, ClientRectangle);
            }

            // 2) 그림자
            for (int i = depth; i >= 1; i--)
            {
                int alpha = 5 + ((depth - i) * 6);
                using SolidBrush shadow = new(Color.FromArgb(alpha, 50, 40, 20));
                g.FillRectangle(shadow, i, i, faceWidth, faceHeight);
            }

            // 3) 카드 면
            Color face = IsSelected ? SelectedFaceColor : FaceColor;
            using (SolidBrush faceBrush = new(face))
            {
                g.FillRectangle(faceBrush, 0, 0, faceWidth, faceHeight);
            }

            // 4) 옅은 테두리
            Color border = IsSelected
                ? ControlPaint.Dark(HostBackColor, 0.22f)
                : ControlPaint.Dark(HostBackColor, 0.12f);
            using (Pen borderPen = new(Color.FromArgb(IsSelected ? 160 : 110, border), 1f))
            {
                g.DrawRectangle(borderPen, 0, 0, faceWidth - 1, faceHeight - 1);
            }

            // 5) 번호 / 미리보기(... 말줄임)
            TextRenderer.DrawText(
                g,
                $"#{MemoIndex + 1}",
                NumberFont,
                new Rectangle(12, 8, Math.Max(40, faceWidth - 48), 18),
                Color.FromArgb(120, 90, 30),
                TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);

            Rectangle previewRect = new(
                12,
                30,
                Math.Max(20, faceWidth - 24),
                Math.Max(20, faceHeight - 42));
            TextRenderer.DrawText(
                g,
                PreviewText,
                PreviewFont,
                previewRect,
                Color.FromArgb(40, 40, 40),
                TextFormatFlags.WordBreak
                    | TextFormatFlags.EndEllipsis
                    | TextFormatFlags.TextBoxControl
                    | TextFormatFlags.NoPadding);
        }
    }
}
