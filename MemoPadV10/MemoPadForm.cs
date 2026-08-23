using System.ComponentModel;

namespace MemoPadV10;

public partial class MemoPadForm : Form
{
    private const int ResizeBorderThickness = 6;
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
    private bool _dragging;
    private Point _dragStartPoint;

    // 목록에서 열어 놓은 메모 창들을 추적해, 같은 메모를 중복해서 열지 않도록 합니다.
    private static readonly List<MemoPadForm> OpenMemoWindows = [];
    private string? _sourceMemo;
    private int _sourceMemoIndex = -1;
    private bool _skipAutoSaveOnClose;

    private readonly ToolTip _toolTip = new();
    private Panel _editorHost = null!;
    private Panel _editorClip = null!;
    private Panel _editorScrollRail = null!;
    private ThemedVScrollBar _editorScrollBar = null!;
    private bool _syncingEditorScroll;
    private bool _keepEditorScrolledToTop;
    private int _editorScrollSyncQueued;
    private int _transparencyPercent;

    // 트레이 아이콘은 앱당 하나만 둡니다(첫 인스턴스가 생성).
    private static NotifyIcon? _trayIcon;
    private static MemoPadForm? _trayOwner;
    // 트레이 '종료'로만 실제 종료됩니다. 그 외 닫기는 트레이로 숨깁니다.
    private static bool _exitRequested;

    public MemoPadForm()
    {
        InitializeComponent();
        RemoveSaveButtonIfPresent();
        TrySetAppIcon();
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
        {
            return;
        }

        SetupThemedEditorScroll();
        memoEditor.WordWrap = true;
        memoEditor.DetectUrls = false;
        memoEditor.HideSelection = false;
        ApplySavedEditorSettings();
        EnsureEditorReadableColors();
        LoadMemos();
        ApplyMainLanguage();
        FormClosing += AutoSaveBeforeClosing;
        SetupTrayIcon();
        FormClosing += (_, e) =>
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                AppIpc.SuppressActivateHandling(800);
            }
        };
        Activated += MemoPadForm_Activated;
    }

    private void RemoveSaveButtonIfPresent()
    {
        foreach (Button button in topBarPanel.Controls.OfType<Button>().ToList())
        {
            bool isSaveButton = button.Name.Contains("save", StringComparison.OrdinalIgnoreCase)
                || string.Equals(button.Text, "💾", StringComparison.Ordinal);
            if (!isSaveButton)
            {
                continue;
            }

            topBarPanel.Controls.Remove(button);
            button.Dispose();
        }
    }

    /// <summary>
    /// 메모 창을 선택하면 목록을 같이 보이게만 올립니다(포커스는 메모에 유지).
    /// </summary>
    private void MemoPadForm_Activated(object? sender, EventArgs e)
    {
        if (AppIpc.ShouldIgnoreActivate() || !Visible)
        {
            return;
        }

        AppIpc.SuppressActivateHandling(500);
        AppIpc.NotifyBringListToFront();
    }

    /// <summary>
    /// 목록과 동일한 옅은 회색 테마 스크롤바.
    /// RichTextBox는 Vertical을 유지해 첫 줄 표시를 보장하고, 시스템 바만 클립으로 가립니다.
    /// 테마 바 표시/숨김이 클립 폭을 바꾸지 않도록 오른쪽 레일을 항상 확보합니다.
    /// </summary>
    private void SetupThemedEditorScroll()
    {
        _editorHost = new Panel
        {
            Name = "editorHost",
            Dock = DockStyle.Fill,
            BackColor = memoEditor.BackColor
        };
        _editorClip = new Panel
        {
            Name = "editorClip",
            Dock = DockStyle.Fill,
            BackColor = memoEditor.BackColor
        };
        // Visible 토글 시 Dock 폭이 바뀌면 RTB가 리플로우되며 첫 줄이 밀리므로 레일은 항상 확보
        _editorScrollRail = new Panel
        {
            Name = "editorScrollRail",
            Dock = DockStyle.Right,
            Width = 10,
            BackColor = memoEditor.BackColor
        };
        _editorScrollBar = new ThemedVScrollBar
        {
            Dock = DockStyle.Fill,
            Visible = false
        };
        _editorScrollBar.ApplyTheme(memoEditor.BackColor);
        _editorScrollRail.Controls.Add(_editorScrollBar);

        Controls.Remove(memoEditor);
        // None이면 첫 줄이 안 보이는 경우가 있어 Vertical 유지
        memoEditor.ScrollBars = RichTextBoxScrollBars.Vertical;
        memoEditor.BorderStyle = BorderStyle.None;
        memoEditor.Dock = DockStyle.None;
        memoEditor.Location = Point.Empty;

        _editorClip.Controls.Add(memoEditor);
        _editorHost.Controls.Add(_editorClip);
        _editorHost.Controls.Add(_editorScrollRail);
        _editorScrollRail.BringToFront();

        Controls.Add(_editorHost);
        // Dock.Top이 Fill보다 먼저 잡히고 툴바가 위에 그려지도록 순서를 고정합니다.
        // (editorHost를 앞으로 두면 Fill이 전체 영역을 차지해 툴바 하단을 덮습니다.)
        Controls.SetChildIndex(_editorHost, 0);
        Controls.SetChildIndex(topBarPanel, Controls.Count - 1);

        void LayoutEditor()
        {
            if (_editorClip.IsDisposed || memoEditor.IsDisposed)
            {
                return;
            }

            // 시스템 세로 스크롤바를 클립 밖으로 밀어 테마 바만 보이게 함
            int hide = SystemInformation.VerticalScrollBarWidth + 4;
            memoEditor.SetBounds(
                0,
                0,
                Math.Max(1, _editorClip.ClientSize.Width + hide),
                Math.Max(1, _editorClip.ClientSize.Height));

            if (_keepEditorScrolledToTop)
            {
                RichTextScrollInterop.ScrollToTop(memoEditor);
            }
        }

        _editorClip.Resize += (_, _) =>
        {
            LayoutEditor();
            ScheduleEditorScrollSync();
        };
        LayoutEditor();

        _editorScrollBar.ValueChanged += EditorScrollBar_ValueChanged;
        memoEditor.VScroll += (_, _) =>
        {
            if (!_keepEditorScrolledToTop)
            {
                ScheduleEditorScrollSync();
            }
        };
        memoEditor.ContentsResized += (_, _) => ScheduleEditorScrollSync();
        memoEditor.TextChanged += (_, _) => ScheduleEditorScrollSync();
        memoEditor.MouseWheel += (_, _) => ScheduleEditorScrollSync();
        _editorClip.MouseWheel += (_, _) => ScheduleEditorScrollSync();
    }

    /// <summary>현재 창 투명도(0=불투명 … 100=최대 투명). 설정 창에서 조절합니다.</summary>
    internal int TransparencyPercent
    {
        get => _transparencyPercent;
        set
        {
            _transparencyPercent = EditorSettings.ClampTransparencyPercent(value);
            EditorSettings.ApplyWindowTransparency(this, _transparencyPercent);
        }
    }

    /// <summary>바인딩된 메모(또는 기본값)의 글꼴·색·투명도를 이 창에 적용합니다.</summary>
    private void ApplyBoundMemoLook()
    {
        MemoLookData look;
        if (_sourceMemoIndex >= 0)
        {
            look = MemoSettingsStore.Get(
                _sourceMemoIndex,
                Math.Max(_memoItems.Count, _sourceMemoIndex + 1));
        }
        else
        {
            look = MemoLookData.FromEditorSettings(EditorSettings.TryLoad() ?? EditorSettings.LoadDefaults());
        }

        _transparencyPercent = EditorSettings.ClampTransparencyPercent(look.TransparencyPercent);
        EditorSettings.ApplyLook(memoEditor, this, look);
        StyleMainToolbarButtons();
        EnsureEditorReadableColors();
        ApplyEditorWrapperColors();
    }

    /// <summary>설정 대화상자 확인 시: 바인딩된 메모면 메모별 저장, 아니면 전역 기본값 저장.</summary>
    internal void SaveSettingsFromDialog()
    {
        MemoLookData look = MemoLookData.Capture(memoEditor, this, TransparencyPercent);

        EditorSettings.Data global = EditorSettings.TryLoad() ?? EditorSettings.LoadDefaults();
        global.Language = Loc.Code(Loc.Language);

        if (_sourceMemoIndex >= 0)
        {
            // 언어만 전역 갱신. 모양은 이 메모에만 저장.
            EditorSettings.Save(global);
            int count = Math.Max(_memoItems.Count, _sourceMemoIndex + 1);
            MemoSettingsStore.Set(_sourceMemoIndex, look, count);
            ApplyBoundMemoLook();
            return;
        }

        // 미저장 창: 새 메모 기본 모양으로 전역 저장
        global.FontName = look.FontName;
        global.FontSize = look.FontSize;
        global.FontStyle = look.FontStyle;
        global.ForeColorArgb = look.ForeColorArgb;
        global.EditorBackColorArgb = look.EditorBackColorArgb;
        global.FormBackColorArgb = look.FormBackColorArgb;
        global.WindowTransparencyPercent = look.TransparencyPercent;
        EditorSettings.Save(global);
        _transparencyPercent = look.TransparencyPercent;
        EditorSettings.ApplyLook(memoEditor, this, look);
        StyleMainToolbarButtons();
        EnsureEditorReadableColors();
        ApplyEditorWrapperColors();
    }

    private void EditorScrollBar_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingEditorScroll)
        {
            return;
        }

        _keepEditorScrolledToTop = false;
        RichTextScrollInterop.SetVerticalPosition(memoEditor, _editorScrollBar.Value);
    }

    private void ScheduleEditorScrollSync()
    {
        if (IsDisposed || !IsHandleCreated)
        {
            return;
        }

        // 리사이즈/입력 중 BeginInvoke가 쌓여 UI가 멈추지 않도록 한 번만 대기열에 넣습니다.
        if (Interlocked.Exchange(ref _editorScrollSyncQueued, 1) == 1)
        {
            return;
        }

        try
        {
            BeginInvoke(new Action(() =>
            {
                Interlocked.Exchange(ref _editorScrollSyncQueued, 0);
                try
                {
                    SyncEditorScrollBarFromEditor();
                }
                catch (Exception ex)
                {
                    ErrorReport.Report(ex, "EditorScrollSync");
                }
            }));
        }
        catch (Exception ex)
        {
            Interlocked.Exchange(ref _editorScrollSyncQueued, 0);
            ErrorReport.Report(ex, "EditorScrollSync.Schedule");
        }
    }

    private void SyncEditorScrollBarFromEditor()
    {
        if (_editorScrollBar is null || _syncingEditorScroll || !memoEditor.IsHandleCreated)
        {
            return;
        }

        if (_keepEditorScrolledToTop)
        {
            RichTextScrollInterop.ScrollToTop(memoEditor);
        }

        _syncingEditorScroll = true;
        try
        {
            _editorHost.BackColor = memoEditor.BackColor;
            _editorClip.BackColor = memoEditor.BackColor;
            _editorScrollRail.BackColor = memoEditor.BackColor;

            if (!RichTextScrollInterop.TryReadVertical(memoEditor, out int pos, out int max) || max <= 0)
            {
                // 레일 폭은 유지한 채 바만 숨겨, 표시 전환으로 인한 리플로우를 막습니다.
                _editorScrollBar.Visible = false;
                _editorScrollBar.Maximum = 0;
                _editorScrollBar.SetValueSilent(0);
                return;
            }

            _editorScrollBar.Visible = true;
            _editorScrollBar.Maximum = max;
            _editorScrollBar.SetValueSilent(Math.Clamp(_keepEditorScrolledToTop ? 0 : pos, 0, max));
            _editorScrollBar.ApplyTheme(memoEditor.BackColor);
        }
        finally
        {
            _syncingEditorScroll = false;
        }
    }

    /// <summary>배경과 글자색 대비가 낮으면 글자를 검정으로 맞춥니다.</summary>
    private void EnsureEditorReadableColors()
    {
        Color back = memoEditor.BackColor;
        Color fore = memoEditor.ForeColor;
        int backLuma = (back.R * 299 + back.G * 587 + back.B * 114) / 1000;
        int foreLuma = (fore.R * 299 + fore.G * 587 + fore.B * 114) / 1000;
        if (Math.Abs(backLuma - foreLuma) < 60)
        {
            memoEditor.ForeColor = backLuma > 140 ? Color.Black : Color.White;
        }
    }

    /// <summary>실행 중 시스템 트레이에 앱 아이콘을 표시합니다(앱당 1개).</summary>
    private void SetupTrayIcon()
    {
        if (_trayIcon != null)
        {
            // 아이콘은 유지하되, 소유 폼이 사라졌으면 현재 폼으로 갱신
            if (_trayOwner is null || _trayOwner.IsDisposed)
            {
                _trayOwner = this;
                FormClosing += PrimaryFormClosing;
            }

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

            _trayOwner = null;
        };
    }

    /// <summary>트레이 '종료' 전용: 목록 프로세스와 패드를 함께 종료합니다.</summary>
    private static void ExitApplication()
    {
        AppIpc.SignalExitList();
        _exitRequested = true;
        Application.Exit();
    }

    private void PrimaryFormClosing(object? sender, FormClosingEventArgs e)
    {
        // 트레이 '종료'나 Windows 종료가 아니면, 닫지 않고 트레이로 숨깁니다.
        if (!_exitRequested && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            // 목록 Activated → 동반 올리기가 숨긴 창을 다시 열지 않도록 잠시 차단
            AppIpc.SuppressActivateHandling(800);
            Hide();
        }
    }

    private void RestoreFromTray()
    {
        // 트레이에서는 메모 목록 앱을 실행/활성화합니다.
        AppIpc.LaunchOrShowList();
    }

    /// <summary>목록 앱에서 보낸 메모 열기 요청을 수신합니다.</summary>
    public static void StartOpenMemoWatcher()
    {
        EventWaitHandle openEvent = AppIpc.CreateOpenMemoEvent();
        Thread watcher = new(() =>
        {
            while (true)
            {
                openEvent.WaitOne();
                MemoPadForm? owner = _trayOwner;
                if (owner is null || owner.IsDisposed)
                {
                    continue;
                }

                try
                {
                    // 불러오기/파일 열기를 새 메모보다 우선 — pending-new 잔여물이 내용을 가로채지 않게
                    if (AppIpc.TryReadPendingOpenFilePath(out string filePath))
                    {
                        owner.BeginInvoke(new Action(() => owner.OpenExternalTextFile(filePath)));
                        continue;
                    }

                    if (AppIpc.TryReadPendingOpenIndex(out int idx))
                    {
                        owner.BeginInvoke(new Action(() => owner.OpenMemoByIndex(idx)));
                        continue;
                    }

                    if (AppIpc.TryConsumePendingNewMemo())
                    {
                        owner.BeginInvoke(new Action(OpenBlankNewMemo));
                    }
                }
                catch (ObjectDisposedException)
                {
                }
            }
        })
        {
            IsBackground = true,
            Name = "MemoPadOpenWatcher"
        };
        watcher.Start();
    }

    /// <summary>설정 저장 알림을 받아 열려 있는 모든 메모 창 테마를 갱신합니다.</summary>
    public static void StartSettingsWatcher()
    {
        EventWaitHandle settingsEvent = AppIpc.CreateSettingsChangedPadEvent();
        Thread watcher = new(() =>
        {
            while (true)
            {
                settingsEvent.WaitOne();
                MemoPadForm? owner = _trayOwner;
                if (owner is null || owner.IsDisposed)
                {
                    continue;
                }

                try
                {
                    owner.BeginInvoke(new Action(ApplyThemeToAllOpenPads));
                }
                catch (ObjectDisposedException)
                {
                }
            }
        })
        {
            IsBackground = true,
            Name = "MemoPadSettingsWatcher"
        };
        watcher.Start();
    }

    /// <summary>목록 프로세스의 실시간 색 미리보기를 받아 모든 메모 창에 즉시 반영합니다.</summary>
    public static void StartThemePreviewWatcher()
    {
        EventWaitHandle previewEvent = AppIpc.CreatePreviewThemePadEvent();
        Thread watcher = new(() =>
        {
            while (true)
            {
                previewEvent.WaitOne();
                if (!AppIpc.TryReadPreviewColor(out Color color))
                {
                    continue;
                }

                MemoPadForm? owner = _trayOwner;
                if (owner is null || owner.IsDisposed)
                {
                    continue;
                }

                try
                {
                    owner.BeginInvoke(new Action(() => PreviewBackColorToAllPads(color)));
                }
                catch (ObjectDisposedException)
                {
                }
            }
        })
        {
            IsBackground = true,
            Name = "MemoPadThemePreviewWatcher"
        };
        watcher.Start();
    }

    /// <summary>목록이 보일 때, 이미 열려 있는(Visible) 메모 창만 Z-order로 올립니다. 포커스는 훔치지 않습니다.</summary>
    public static void StartCompanionForegroundWatcher()
    {
        EventWaitHandle bringPadsEvent = AppIpc.CreateBringPadsFrontEvent();
        Thread watcher = new(() =>
        {
            while (true)
            {
                bringPadsEvent.WaitOne();
                MemoPadForm? owner = _trayOwner;
                if (owner is null || owner.IsDisposed)
                {
                    continue;
                }

                try
                {
                    owner.BeginInvoke(new Action(() =>
                    {
                        AppIpc.SuppressActivateHandling(500);
                        RaiseVisiblePadsWithoutStealingFocus();
                    }));
                }
                catch (ObjectDisposedException)
                {
                }
            }
        })
        {
            IsBackground = true,
            Name = "MemoPadCompanionFgWatcher"
        };
        watcher.Start();
    }

    /// <summary>보이는 메모 창만 앞으로 올립니다. 숨긴 창은 열지 않고, 포커스도 가져가지 않습니다.</summary>
    private static void RaiseVisiblePadsWithoutStealingFocus()
    {
        List<MemoPadForm> pads = [];
        foreach (Form form in Application.OpenForms)
        {
            if (form is MemoPadForm pad && !pad.IsDisposed && pad.Visible)
            {
                pads.Add(pad);
            }
        }

        // 선택 카드에 해당하는 창이 있으면 그 창을 마지막으로 올려 상대 Z만 맞춤
        MemoPadForm? preferred = FindPadMatchingListSelection();
        foreach (MemoPadForm pad in pads)
        {
            if (preferred is not null && ReferenceEquals(pad, preferred))
            {
                continue;
            }

            AppIpc.ActivateWindow(pad, setForeground: false, restoreIfHidden: false);
        }

        if (preferred is { IsDisposed: false, Visible: true })
        {
            AppIpc.ActivateWindow(preferred, setForeground: false, restoreIfHidden: false);
        }
    }

    /// <summary>목록이 요청한 최근 열기 인덱스와 일치하는 창을 찾습니다(없으면 null).</summary>
    private static MemoPadForm? FindPadMatchingListSelection()
    {
        if (!AppIpc.TryPeekPreferredPadIndex(out int index) || index < 0)
        {
            return null;
        }

        if (_trayOwner is { IsDisposed: false, Visible: true } owner && owner._sourceMemoIndex == index)
        {
            return owner;
        }

        foreach (MemoPadForm existing in OpenMemoWindows)
        {
            if (!existing.IsDisposed && existing.Visible && existing._sourceMemoIndex == index)
            {
                return existing;
            }
        }

        return null;
    }

    /// <summary>언어 등 전역 설정을 모든 패드에 반영합니다. 메모 모양은 각자 유지합니다.</summary>
    public static void ApplyThemeToAllOpenPads()
    {
        EditorSettings.Data data = EditorSettings.TryLoad() ?? EditorSettings.LoadDefaults();
        Loc.Language = Loc.Parse(data.Language);

        foreach (Form form in Application.OpenForms)
        {
            if (form is not MemoPadForm pad || pad.IsDisposed)
            {
                continue;
            }

            pad.ApplyMainLanguage();
            // 모양은 메모별 설정을 다시 적용해 전역 테마로 덮어쓰지 않습니다.
            pad.ApplyBoundMemoLook();
        }
    }

    /// <summary>목록/전역 미리보기: 아직 메모에 묶이지 않은 창에만 반영합니다.</summary>
    public static void PreviewBackColorToAllPads(Color color)
    {
        foreach (Form form in Application.OpenForms)
        {
            if (form is MemoPadForm pad && !pad.IsDisposed && pad._sourceMemoIndex < 0)
            {
                pad.ApplyBackColorPreview(color);
            }
        }
    }

    /// <summary>배경색을 편집기·폼·툴바·에디터 래퍼 패널에 반영합니다(저장 없음).</summary>
    private void ApplyBackColorPreview(Color color)
    {
        memoEditor.BackColor = color;
        BackColor = color;
        EditorSettings.ApplyToolbarColor(this, color);
        StyleMainToolbarButtons();
        ApplyEditorWrapperColors();
    }

    /// <summary>테마 스크롤을 감싸는 패널·레일·스크롤바 색을 편집기 배경과 맞춥니다.</summary>
    private void ApplyEditorWrapperColors()
    {
        if (_editorHost != null)
        {
            _editorHost.BackColor = memoEditor.BackColor;
        }

        if (_editorClip != null)
        {
            _editorClip.BackColor = memoEditor.BackColor;
        }

        if (_editorScrollRail != null)
        {
            _editorScrollRail.BackColor = memoEditor.BackColor;
        }

        if (_editorScrollBar != null)
        {
            _editorScrollBar.ApplyTheme(memoEditor.BackColor);
            SyncEditorScrollBarFromEditor();
        }
    }

    /// <summary>외부 .txt / .rtf 파일 내용을 메모 창에 엽니다.</summary>
    public void OpenExternalTextFile(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            MessageBox.Show(this, Loc.T("list.openFile.missing"), Loc.T("common.error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        string content;
        try
        {
            content = File.ReadAllText(filePath);
        }
        catch (Exception)
        {
            MessageBox.Show(this, Loc.T("list.openFile.failed"), Loc.T("common.error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        // 기본(트레이) 창이 비어 있으면 그 창에 표시합니다.
        if (ReferenceEquals(_trayOwner, this)
            && _sourceMemo is null
            && string.IsNullOrWhiteSpace(memoEditor.Text))
        {
            ApplyExternalContentToEditor(memoEditor, content, filePath);
            _sourceMemo = null;
            _sourceMemoIndex = -1;
            TransparencyPercent = 0;
            Show();
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }

            Activate();
            BringToFront();
            memoEditor.Focus();
            memoEditor.SelectionStart = memoEditor.TextLength;
            return;
        }

        MemoPadForm newMemoPad = CreateFrontOffsetMemoPad();
        ApplyExternalContentToEditor(newMemoPad.memoEditor, content, filePath);
        newMemoPad._sourceMemo = null;
        newMemoPad._sourceMemoIndex = -1;
        newMemoPad.TransparencyPercent = 0;
        OpenMemoWindows.Add(newMemoPad);
        newMemoPad.FormClosed += (_, _) => OpenMemoWindows.Remove(newMemoPad);
        newMemoPad.Show();
        newMemoPad.BringToFront();
        newMemoPad.memoEditor.Focus();
        newMemoPad.memoEditor.SelectionStart = newMemoPad.memoEditor.TextLength;
    }

    private static void ApplyExternalContentToEditor(RichTextBox editor, string content, string filePath)
    {
        string ext = Path.GetExtension(filePath);
        if (ext.Equals(".rtf", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                editor.Rtf = content;
                return;
            }
            catch (ArgumentException)
            {
                // plain text fallback
            }
        }

        editor.Text = content;
    }

    /// <summary>저장된 메모 목록에서 지정 인덱스를 열어 표시합니다.</summary>
    public void OpenMemoByIndex(int index)
    {
        LoadMemos();
        if (index < 0 || index >= _memoItems.Count)
        {
            return;
        }

        string stored = _memoItems[index];

        // 같은 카드를 이미 편집 중인 창이 있으면 그 창만 앞으로 가져옵니다.
        if (TryActivateOpenMemo(index, stored))
        {
            return;
        }

        // 기존에 열린 창은 그대로 두고 새 창에서 엽니다.
        OpenMemoInNewPadWindow(index, stored);
    }

    private static bool TryActivateOpenMemo(int index, string stored)
    {
        // 같은 목록 카드(인덱스)를 편집 중인 창만 앞으로 가져옵니다.
        _ = stored;
        if (_trayOwner is { IsDisposed: false } owner
            && owner._sourceMemoIndex == index
            && index >= 0)
        {
            ActivateMemoWindow(owner);
            return true;
        }

        foreach (MemoPadForm existing in OpenMemoWindows)
        {
            if (existing.IsDisposed || existing._sourceMemoIndex != index || index < 0)
            {
                continue;
            }

            ActivateMemoWindow(existing);
            return true;
        }

        return false;
    }

    private static void ActivateMemoWindow(MemoPadForm form)
    {
        AppIpc.SuppressActivateHandling(1000);
        if (form._sourceMemoIndex >= 0)
        {
            AppIpc.RememberPreferredPadIndex(form._sourceMemoIndex);
        }

        // 목록에서 연 창: 내용이 있는 메모를 최상단+포커스. 목록은 아래에 같이 보이게.
        AppIpc.NotifyBringListToFront();
        AppIpc.ActivateWindow(form, setForeground: true, restoreIfHidden: true);
        form.TopMost = true;
        form.TopMost = false;
        AppIpc.ActivateWindow(form, setForeground: true, restoreIfHidden: true);
        form.memoEditor.Focus();
    }

    private void BindSourceMemo(int index, string stored)
    {
        _sourceMemoIndex = index;
        _sourceMemo = stored;
        ApplyBoundMemoLook();
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
        _toolTip.SetToolTip(deleteMemoIconButton, Loc.T("main.delete"));
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
        // 생성 직: 아직 메모가 없으면 전역 기본 모양, 있으면 메모별 모양.
        ApplyBoundMemoLook();
        ApplyMainLanguage();
    }

    /// <summary>툴바 아이콘에 테두리가 생기지 않도록 flat 스타일을 유지합니다.</summary>
    private void StyleMainToolbarButtons()
    {
        Color bar = topBarPanel.BackColor;
        Button[] buttons =
        [
            addMemoIconButton,
            deleteMemoIconButton,
            settingsIconButton,
            listIconButton,
            closeIconButton
        ];

        foreach (Button button in buttons)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.FlatAppearance.BorderColor = bar;
            button.FlatAppearance.MouseOverBackColor = Color.Empty;
            button.FlatAppearance.MouseDownBackColor = Color.Empty;
            button.UseVisualStyleBackColor = true;
            button.TabStop = false;
        }
    }

    private bool SaveCurrentMemo(bool showResult)
    {
        string text = memoEditor.Text.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            if (showResult)
            {
                MessageBox.Show(this, Loc.T("memo.empty"), Loc.T("common.info"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            }

            return false;
        }

        LoadMemos();
        string rtf = memoEditor.Rtf ?? string.Empty;
        bool updated = MemoEditing.Save(_memoItems, ref _sourceMemoIndex, ref _sourceMemo, rtf);
        SaveMemos();
        // 새로 저장되거나 갱신된 메모에 현재 창 모양을 묶습니다.
        if (_sourceMemoIndex >= 0)
        {
            int count = Math.Max(_memoItems.Count, _sourceMemoIndex + 1);
            MemoLookData look = MemoLookData.Capture(memoEditor, this, TransparencyPercent);
            MemoSettingsStore.Set(_sourceMemoIndex, look, count);
        }

        AppIpc.NotifyMemosChanged();

        if (showResult)
        {
            MessageBox.Show(
                this,
                Loc.T(updated ? "memo.updated" : "memo.added"),
                Loc.T("common.done"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }

        return true;
    }

    private void AutoSaveBeforeClosing(object? sender, FormClosingEventArgs e)
    {
        if (_skipAutoSaveOnClose)
        {
            return;
        }

        SaveCurrentMemo(showResult: false);
    }

    private void LoadMemos()
    {
        _memoItems.Clear();
        _memoItems.AddRange(MemoStore.Load());
    }

    private void SaveMemos()
    {
        MemoStore.Save(_memoItems);
    }

    private void addMemoIconButton_Click(object sender, EventArgs e)
    {
        SaveCurrentMemo(showResult: false);
        OpenBlankNewMemo();
    }

    private void deleteMemoIconButton_Click(object sender, EventArgs e)
    {
        DeleteCurrentMemo();
    }

    /// <summary>
    /// 목록에서 연 메모(_sourceMemo) 또는 현재 편집 내용과 일치하는 저장된 메모를 삭제합니다.
    /// </summary>
    private void DeleteCurrentMemo()
    {
        LoadMemos();

        int idx = -1;
        if (_sourceMemo != null)
        {
            idx = _memoItems.FindIndex(m => string.Equals(m, _sourceMemo, StringComparison.Ordinal));
        }

        if (idx < 0 && !string.IsNullOrWhiteSpace(memoEditor.Text))
        {
            string current = memoEditor.Rtf ?? string.Empty;
            idx = _memoItems.FindIndex(m => string.Equals(m, current, StringComparison.Ordinal));
        }

        if (idx < 0)
        {
            MessageBox.Show(this, Loc.T("memo.nothingToDelete"), Loc.T("common.info"), MessageBoxButtons.OK, MessageBoxIcon.Information);
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

        string deleted = _memoItems[idx];
        _memoItems.RemoveAt(idx);
        MemoSettingsStore.RemoveAt(idx);
        SaveMemos();
        AppIpc.NotifyMemosChanged();

        // 같은 메모를 보고 있는 다른 창도 정리합니다.
        foreach (MemoPadForm open in OpenMemoWindows.ToList())
        {
            if (open.IsDisposed || ReferenceEquals(open, this))
            {
                continue;
            }

            bool sameIndex = open._sourceMemoIndex == idx;
            bool sameContent = string.Equals(open._sourceMemo, deleted, StringComparison.Ordinal);
            if (sameIndex || sameContent)
            {
                open._skipAutoSaveOnClose = true;
                open.Close();
                continue;
            }

            if (open._sourceMemoIndex > idx)
            {
                open._sourceMemoIndex--;
            }
        }

        _sourceMemo = null;
        _sourceMemoIndex = -1;
        if (OpenMemoWindows.Contains(this))
        {
            _skipAutoSaveOnClose = true;
            Close();
            return;
        }

        memoEditor.Clear();
        MessageBox.Show(this, Loc.T("memo.deleted"), Loc.T("common.done"), MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void settingsIconButton_Click(object sender, EventArgs e)
    {
        using EditorSettingsForm dlg = new(memoEditor, this);
        // 색을 고를 때마다 열린 모든 메모 창과 목록 프로세스에 실시간 반영합니다.
        dlg.PreviewColorChanged += color =>
        {
            ApplyBackColorPreview(color);
        };

        DialogResult result = dlg.ShowDialog(this);
        if (result == DialogResult.OK)
        {
            ApplyBoundMemoLook();
            ApplyMainLanguage();
            // 언어 변경만 다른 창·목록에 알립니다.
            ApplyLanguageToAllOpenPads();
            AppIpc.NotifyListSettingsChanged();
        }
        else
        {
            ApplyBoundMemoLook();
            ApplyMainLanguage();
            AppIpc.NotifyListSettingsChanged();
        }
    }

    private static void ApplyLanguageToAllOpenPads()
    {
        EditorSettings.Data data = EditorSettings.TryLoad() ?? EditorSettings.LoadDefaults();
        Loc.Language = Loc.Parse(data.Language);
        foreach (Form form in Application.OpenForms)
        {
            if (form is MemoPadForm pad && !pad.IsDisposed)
            {
                pad.ApplyMainLanguage();
            }
        }
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

    /// <summary>핸들 생성 후에도 전체 내용·첫 줄이 보이도록 저장된 메모를 에디터에 넣습니다.</summary>
    private static void ApplyStoredContent(MemoPadForm pad, string stored)
    {
        void Apply()
        {
            if (pad.IsDisposed || pad.memoEditor.IsDisposed)
            {
                return;
            }

            pad._keepEditorScrolledToTop = true;
            MemoStore.ApplyContentToEditor(pad.memoEditor, stored);
            string text = pad.memoEditor.Text;
            if (string.IsNullOrWhiteSpace(text) && !string.IsNullOrWhiteSpace(stored))
            {
                string plain = MemoStore.PlainTextForDisplay(stored);
                pad.memoEditor.Text = string.IsNullOrWhiteSpace(plain) ? stored : plain;
            }

            pad.EnsureEditorReadableColors();
            RichTextScrollInterop.ScrollToTop(pad.memoEditor);
            pad.memoEditor.Invalidate();
            pad.memoEditor.Update();
            pad.ScheduleEditorScrollSync();
        }

        if (!pad.IsHandleCreated)
        {
            pad.Show();
        }

        Apply();
        if (!pad.IsDisposed && pad.IsHandleCreated)
        {
            pad.BeginInvoke(new Action(() =>
            {
                Apply();
                // 레이아웃(테마 스크롤 표시) 후에도 첫 줄 유지, 이후 사용자 스크롤 허용
                System.Windows.Forms.Timer release = new() { Interval = 250 };
                release.Tick += (_, _) =>
                {
                    release.Stop();
                    release.Dispose();
                    if (!pad.IsDisposed)
                    {
                        pad._keepEditorScrolledToTop = false;
                    }
                };
                release.Start();
            }));
        }
    }

    private void OpenMemoInNewPadWindow(int index, string stored)
    {
        foreach (MemoPadForm existing in OpenMemoWindows)
        {
            if (existing.IsDisposed || existing._sourceMemoIndex != index || index < 0)
            {
                continue;
            }

            existing.BindSourceMemo(index, stored);
            ApplyStoredContent(existing, stored);
            ActivateMemoWindow(existing);
            return;
        }

        AppIpc.SuppressActivateHandling(1000);
        AppIpc.RememberPreferredPadIndex(index);

        // OpenMemoByIndex를 받은 창이 비어 있으면 그 창에 표시 (정적 _trayOwner 꼬임 방지)
        if (_sourceMemoIndex < 0 && string.IsNullOrWhiteSpace(memoEditor.Text))
        {
            BindSourceMemo(index, stored);
            ApplyStoredContent(this, stored);
            ActivateMemoWindow(this);
            return;
        }

        if (_trayOwner is { IsDisposed: false } primary
            && !ReferenceEquals(primary, this)
            && primary._sourceMemoIndex < 0
            && string.IsNullOrWhiteSpace(primary.memoEditor.Text))
        {
            primary.BindSourceMemo(index, stored);
            ApplyStoredContent(primary, stored);
            ActivateMemoWindow(primary);
            return;
        }

        MemoPadForm newMemoPad = CreateFrontOffsetMemoPad();
        newMemoPad.BindSourceMemo(index, stored);
        OpenMemoWindows.Add(newMemoPad);
        newMemoPad.FormClosed += (_, _) => OpenMemoWindows.Remove(newMemoPad);
        newMemoPad.Show();
        ApplyStoredContent(newMemoPad, stored);
        ActivateMemoWindow(newMemoPad);
    }

    /// <summary>빈 새 메모 창을 만들고 맨 위에 표시합니다.</summary>
    public static void OpenBlankNewMemo()
    {
        MemoPadForm? owner = _trayOwner;
        if (owner is null || owner.IsDisposed)
        {
            return;
        }

        AppIpc.SuppressActivateHandling(1000);
        owner.SaveCurrentMemo(showResult: false);

        // 보이는 기본 창이 비어 있을 때만 재사용. 숨겨진 트레이 창 재사용은
        // 목록 뒤에 가려지거나 포커스가 어긋나 입력이 안 되는 경우가 있어 새 창을 엽니다.
        if (owner.Visible
            && owner._sourceMemoIndex < 0
            && owner._sourceMemo is null
            && string.IsNullOrWhiteSpace(owner.memoEditor.Text))
        {
            owner.memoEditor.Clear();
            owner.TransparencyPercent = 0;
            ActivateMemoWindow(owner);
            owner.memoEditor.Focus();
            return;
        }

        MemoPadForm newMemoPad = owner.CreateOffsetMemoPad();
        newMemoPad._sourceMemo = null;
        newMemoPad._sourceMemoIndex = -1;
        newMemoPad.memoEditor.Clear();
        newMemoPad.TransparencyPercent = 0;
        OpenMemoWindows.Add(newMemoPad);
        newMemoPad.FormClosed += (_, _) => OpenMemoWindows.Remove(newMemoPad);
        newMemoPad.Show();
        ActivateMemoWindow(newMemoPad);
        newMemoPad.memoEditor.Focus();
    }

    private void listIconButton_Click(object sender, EventArgs e)
    {
        AppIpc.LaunchOrShowList();
    }

    private void closeIconButton_Click(object sender, EventArgs e)
    {
        AppIpc.SuppressActivateHandling(800);
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

            // 중앙은 자식 컨트롤(에디터)이 클릭/입력을 받도록 클라이언트 영역으로 둡니다.
            m.Result = (IntPtr)HtClient;
            return;
        }

        base.WndProc(ref m);
    }
}
