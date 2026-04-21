using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Drawing.Imaging;
using YOLO26BrainV20.Dialogs;
using YOLO26BrainV20.Inference;
using YOLO26BrainV20.Services;

namespace YOLO26BrainV20
{

public partial class BrainCtMainForm : Form
{

    private bool _syncingConfidenceUi;
    private Panel? _inputScrollPanel;
    private Panel? _outputScrollPanel;
    private Label? _inputZoomOverlay;
    private Label? _outputZoomOverlay;
    private float _inputZoom = 1f;
    private float _outputZoom = 1f;
    private Point _inputPanOffset;
    private Point _outputPanOffset;
    private bool _inputPanDragging;
    private bool _outputPanDragging;
    private Point _inputPanLastClient;
    private Point _outputPanLastClient;
    private Control? _inputPanCaptureHost;
    private Control? _outputPanCaptureHost;
    private const float MinZoom = 0.2f;
    private const float MaxZoom = 8.0f;
    private const float ZoomStep = 1.2f;

    private BrainYolo26Session? _session;
    private string? _modelPath;
    private string? _lastSessionKey;
    private IReadOnlyList<BrainDetection>? _lastDetections;
    private string? _lastInputImagePath;

    private TableLayoutPanel? _tableRoot;
    private SplitContainer? _splitUpper;
    private SplitContainer? _splitPreview;
    private Panel? _inputPreviewChrome;
    private Panel? _outputPreviewChrome;
    private Label? _lblExecutionProvider;
    private ComboBox? _comboExecutionProvider;

    public BrainCtMainForm()
    {
        InitializeComponent();
        // Skip runtime layout and I/O so Visual Studio WinForms designer can load this form.
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return;

        SetupResponsiveLayout();
        InitializeZoomPanels();
        WireFormEvents();
        SetupDetectionListViewColumns();
        SetSaveCommandsEnabled(false);
        ApplyRecommendedInferenceDefaults();
        TryApplyDefaultSegmentationModel();
        UpdateOverlayLayout();
        UpdateZoomText(isInput: true);
        UpdateZoomText(isInput: false);
    }

    private void WireFormEvents()
    {
        menuSaveImage.ShortcutKeys = Keys.Control | Keys.S;
        menuSaveCsv.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        menuSaveImage.Click += MenuSaveImage_Click;
        menuSaveCsv.Click += MenuSaveCsv_Click;
        menuExit.Click += MenuExit_Click;
        menuConvertPt.Click += MenuConvertPt_Click;
        menuOpenSampleFolder.Click += MenuOpenSampleFolder_Click;
        menuRecommendedDefaults.Click += MenuRecommendedDefaults_Click;
        btnModel.Click += BtnModel_Click;
        btnImage.Click += BtnImage_Click;
        btnAnalyze.Click += BtnAnalyze_Click;
        btnSave.Click += BtnSave_Click;
        btnSaveCsv.Click += BtnSaveCsv_Click;
        btnResetInputZoom.Click += (_, _) => ResetZoom(isInput: true);
        btnResetOutputZoom.Click += (_, _) => ResetZoom(isInput: false);
        listDetections.SelectedIndexChanged += ListDetections_SelectedIndexChanged;
        numConf.ValueChanged += ConfidenceUi_ValueChanged;
        trackConf.ValueChanged += TrackConf_ValueChanged;
        Resize += (_, _) =>
        {
            BalanceSplitters();
            UpdateOverlayLayout();
        };
        ClientSizeChanged += (_, _) =>
        {
            BalanceSplitters();
            UpdateOverlayLayout();
        };
        Shown += (_, _) => BalanceSplitters();
    }

    /// <summary>
    /// Reparents toolbar and previews into a table + splitters so resizing keeps a 50/50 preview and fluid paths.
    /// </summary>
    private void SetupResponsiveLayout()
    {
        if (_tableRoot != null)
            return;

        SuspendLayout();
        try
        {

        _tableRoot = new TableLayoutPanel
        {
            Name = "tableRoot",
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 6,
            Padding = new Padding(4, 2, 4, 4),
        };
        _tableRoot.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        // Upper split is horizontal (stacked panels): mins are heights — must fit this row.
        _tableRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 216f));
        _tableRoot.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        _tableRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 20f));
        _tableRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 36f));
        _tableRoot.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        _tableRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 108f));

        _splitUpper = new SplitContainer
        {
            Name = "splitUpper",
            Dock = DockStyle.Fill,
            Orientation = Orientation.Horizontal,
            FixedPanel = FixedPanel.None,
            SplitterWidth = 6,
            // Safe until Load clamps using real client height (avoids SplitterDistance exception during first layout).
            Panel1MinSize = 32,
            Panel2MinSize = 32,
        };

        var tblOnnx = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 2,
            Padding = new Padding(4, 4, 8, 0),
        };
        tblOnnx.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        tblOnnx.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        tblOnnx.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tblOnnx.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        lblOnnxTitle.Margin = new Padding(0, 0, 0, 2);
        lblOnnxTitle.AutoSize = true;
        // Fill + AutoSize in an AutoSize table row can collapse/clamp row height and clip the next row's button.
        lblOnnxTitle.Dock = DockStyle.Top;
        lblOnnxTitle.TextAlign = ContentAlignment.BottomLeft;
        btnModel.Margin = new Padding(0, 0, 8, 4);
        btnModel.Dock = DockStyle.Left;
        lblOnnxPath.Dock = DockStyle.Fill;
        lblOnnxPath.Margin = new Padding(0, 0, 0, 4);
        lblOnnxPath.TextAlign = ContentAlignment.MiddleLeft;
        tblOnnx.Controls.Add(lblOnnxTitle, 0, 0);
        tblOnnx.SetColumnSpan(lblOnnxTitle, 2);
        tblOnnx.Controls.Add(btnModel, 0, 1);
        tblOnnx.Controls.Add(lblOnnxPath, 1, 1);
        _splitUpper.Panel1.Controls.Add(tblOnnx);

        var tblImg = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 2,
            Padding = new Padding(8, 4, 4, 0),
        };
        tblImg.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        tblImg.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        tblImg.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tblImg.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        lblImageTitle.Margin = new Padding(0, 0, 0, 2);
        lblImageTitle.AutoSize = true;
        lblImageTitle.Dock = DockStyle.Top;
        lblImageTitle.TextAlign = ContentAlignment.BottomLeft;
        btnImage.Margin = new Padding(0, 0, 8, 4);
        btnImage.Dock = DockStyle.Left;
        lblSlicePath.Dock = DockStyle.Fill;
        lblSlicePath.Margin = new Padding(0, 0, 0, 4);
        lblSlicePath.TextAlign = ContentAlignment.MiddleLeft;
        tblImg.Controls.Add(lblImageTitle, 0, 0);
        tblImg.SetColumnSpan(lblImageTitle, 2);
        tblImg.Controls.Add(btnImage, 0, 1);
        tblImg.Controls.Add(lblSlicePath, 1, 1);
        _splitUpper.Panel2.Controls.Add(tblImg);

        _tableRoot.Controls.Add(_splitUpper, 0, 0);

        var flowActions = new FlowLayoutPanel
        {
            Name = "flowActions",
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            AutoScroll = true,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(0, 2, 0, 4),
        };
        _lblExecutionProvider = new Label
        {
            Text = "ONNX 실행",
            AutoSize = true,
            Margin = new Padding(0, 8, 6, 0),
            TextAlign = ContentAlignment.MiddleLeft,
        };
        _comboExecutionProvider = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = 240,
            Margin = new Padding(0, 4, 12, 0),
        };
        _comboExecutionProvider.Items.AddRange(new object[]
        {
            "자동 (CUDA 우선, 실패 시 CPU)",
            "CPU만",
            "GPU (CUDA)만",
        });
        _comboExecutionProvider.SelectedIndex = 0;
        _comboExecutionProvider.SelectedIndexChanged += (_, _) => InvalidateSession();

        lblConf.Margin = new Padding(0, 6, 8, 0);
        lblConf.AutoSize = true;
        trackConf.Margin = new Padding(0, 2, 8, 0);
        trackConf.MinimumSize = new Size(120, 0);
        trackConf.MaximumSize = new Size(480, 0);
        numConf.Margin = new Padding(0, 4, 12, 0);
        btnAnalyze.Margin = new Padding(0, 2, 8, 0);
        btnSave.Margin = new Padding(0, 2, 8, 0);
        btnSaveCsv.Margin = new Padding(0, 2, 0, 0);
        lblLabels.Visible = false;
        txtLabels.Visible = false;
        lblLabels.Margin = new Padding(12, 6, 0, 0);
        txtLabels.Margin = new Padding(0, 2, 0, 0);
        txtLabels.Width = 200;
        flowActions.Controls.Add(_lblExecutionProvider);
        flowActions.Controls.Add(_comboExecutionProvider);
        flowActions.Controls.Add(lblConf);
        flowActions.Controls.Add(trackConf);
        flowActions.Controls.Add(numConf);
        flowActions.Controls.Add(btnAnalyze);
        flowActions.Controls.Add(btnSave);
        flowActions.Controls.Add(btnSaveCsv);
        flowActions.Controls.Add(lblLabels);
        flowActions.Controls.Add(txtLabels);
        _tableRoot.Controls.Add(flowActions, 0, 1);

        progressInference.Margin = new Padding(0, 0, 0, 4);
        progressInference.Dock = DockStyle.Fill;
        _tableRoot.Controls.Add(progressInference, 0, 2);

        lblStatus.Dock = DockStyle.Fill;
        lblStatus.Margin = new Padding(0, 0, 0, 4);
        _tableRoot.Controls.Add(lblStatus, 0, 3);

        _splitPreview = new SplitContainer
        {
            Name = "splitPreview",
            Dock = DockStyle.Fill,
            Orientation = Orientation.Vertical,
            FixedPanel = FixedPanel.None,
            SplitterWidth = 6,
            // Safe until Load clamps using real client width (vertical split mins are widths).
            Panel1MinSize = 32,
            Panel2MinSize = 32,
        };

        var wrapIn = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 0, 4, 0) };
        var headIn = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 30,
            ColumnCount = 2,
            RowCount = 1,
            Padding = new Padding(0, 0, 0, 4),
        };
        headIn.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        headIn.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        lblPreviewInTitle.Dock = DockStyle.Fill;
        lblPreviewInTitle.Margin = Padding.Empty;
        lblPreviewInTitle.TextAlign = ContentAlignment.MiddleLeft;
        btnResetInputZoom.Dock = DockStyle.Fill;
        btnResetInputZoom.Margin = new Padding(8, 0, 0, 0);
        btnResetInputZoom.AutoSize = true;
        headIn.Controls.Add(lblPreviewInTitle, 0, 0);
        headIn.Controls.Add(btnResetInputZoom, 1, 0);
        panelInputViewport.Dock = DockStyle.Fill;
        var chromeIn = new Panel
        {
            Dock = DockStyle.Fill,
            Name = "previewInputChrome",
            BackColor = panelInputViewport.BackColor,
        };
        chromeIn.Controls.Add(panelInputViewport);
        wrapIn.Controls.Add(chromeIn);
        wrapIn.Controls.Add(headIn);
        _inputPreviewChrome = chromeIn;
        _splitPreview.Panel1.Controls.Add(wrapIn);

        var wrapOut = new Panel { Dock = DockStyle.Fill, Padding = new Padding(4, 0, 0, 0) };
        var headOut = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 30,
            ColumnCount = 2,
            RowCount = 1,
            Padding = new Padding(0, 0, 0, 4),
        };
        headOut.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        headOut.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        lblPreviewOutTitle.Dock = DockStyle.Fill;
        lblPreviewOutTitle.Margin = Padding.Empty;
        lblPreviewOutTitle.TextAlign = ContentAlignment.MiddleLeft;
        btnResetOutputZoom.Dock = DockStyle.Fill;
        btnResetOutputZoom.Margin = new Padding(8, 0, 0, 0);
        btnResetOutputZoom.AutoSize = true;
        headOut.Controls.Add(lblPreviewOutTitle, 0, 0);
        headOut.Controls.Add(btnResetOutputZoom, 1, 0);
        panelOutputViewport.Dock = DockStyle.Fill;
        var chromeOut = new Panel
        {
            Dock = DockStyle.Fill,
            Name = "previewOutputChrome",
            BackColor = panelOutputViewport.BackColor,
        };
        chromeOut.Controls.Add(panelOutputViewport);
        wrapOut.Controls.Add(chromeOut);
        wrapOut.Controls.Add(headOut);
        _outputPreviewChrome = chromeOut;
        _splitPreview.Panel2.Controls.Add(wrapOut);

        _tableRoot.Controls.Add(_splitPreview, 0, 4);

        listDetections.Dock = DockStyle.Fill;
        _tableRoot.Controls.Add(listDetections, 0, 5);

        Controls.Add(_tableRoot);
        menuStripMain.BringToFront();
        Load += OnLoadClampSplitContainerMinimums;
        }
        finally
        {
            ResumeLayout(performLayout: true);
        }
    }

    private void OnLoadClampSplitContainerMinimums(object? sender, EventArgs e)
    {
        Load -= OnLoadClampSplitContainerMinimums;
        try
        {
            if (_splitPreview != null)
            {
                var w = Math.Max(1, _splitPreview.ClientSize.Width);
                var s = _splitPreview.SplitterWidth;
                var each = Math.Min(260, Math.Max(40, (w - s) / 2 - 8));
                _splitPreview.Panel1MinSize = each;
                _splitPreview.Panel2MinSize = each;
            }

            if (_splitUpper != null)
            {
                var h = Math.Max(1, _splitUpper.ClientSize.Height);
                var s = _splitUpper.SplitterWidth;
                var each = Math.Min(120, Math.Max(40, (h - s) / 2 - 8));
                _splitUpper.Panel1MinSize = each;
                _splitUpper.Panel2MinSize = each;
            }

            BalanceSplitters();
        }
        catch
        {
            // keep conservative constructor mins
        }
    }

    private void BalanceSplitters()
    {
        if (_splitUpper == null || _splitPreview == null)
            return;
        if (WindowState == FormWindowState.Minimized || !IsHandleCreated)
            return;
        try
        {
            // Horizontal split: distance is vertical — use height.
            var uh = _splitUpper.Height;
            if (uh > _splitUpper.Panel1MinSize + _splitUpper.Panel2MinSize + _splitUpper.SplitterWidth)
                _splitUpper.SplitterDistance = (uh - _splitUpper.SplitterWidth) / 2;

            // Vertical split: distance is horizontal — use width.
            var pw = _splitPreview.Width;
            if (pw > _splitPreview.Panel1MinSize + _splitPreview.Panel2MinSize + _splitPreview.SplitterWidth)
                _splitPreview.SplitterDistance = (pw - _splitPreview.SplitterWidth) / 2;
        }
        catch
        {
            // layout not ready
        }
    }

    private void InitializeZoomPanels()
    {
        _inputScrollPanel = panelInputViewport;
        _outputScrollPanel = panelOutputViewport;
        picInput.MouseWheel += (_, e) => ChangeZoom(isInput: true, e.Delta > 0);
        picOutput.MouseWheel += (_, e) => ChangeZoom(isInput: false, e.Delta > 0);
        panelInputViewport.MouseWheel += (_, e) => ChangeZoom(isInput: true, e.Delta > 0);
        panelOutputViewport.MouseWheel += (_, e) => ChangeZoom(isInput: false, e.Delta > 0);
        picInput.MouseEnter += (_, _) => _inputScrollPanel.Focus();
        picOutput.MouseEnter += (_, _) => _outputScrollPanel.Focus();

        void wirePan(Control c)
        {
            c.MouseDown += Viewport_MouseDown;
            c.MouseMove += Viewport_MouseMove;
            c.MouseUp += Viewport_MouseUp;
        }

        wirePan(panelInputViewport);
        wirePan(panelOutputViewport);
        wirePan(picInput);
        wirePan(picOutput);

        _inputZoomOverlay = CreateZoomOverlayLabel();
        _outputZoomOverlay = CreateZoomOverlayLabel();
        _inputZoomOverlay.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        _outputZoomOverlay.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        if (_inputPreviewChrome != null && _outputPreviewChrome != null)
        {
            _inputPreviewChrome.Controls.Add(_inputZoomOverlay);
            _outputPreviewChrome.Controls.Add(_outputZoomOverlay);
            LayoutViewportZoomLabels();
        }

        picInput.Location = Point.Empty;
        picOutput.Location = Point.Empty;
    }

    private static Label CreateZoomOverlayLabel() =>
        new ZoomOverlayLabel
        {
            AutoSize = true,
            BackColor = Color.Transparent,
            ForeColor = Color.Red,
            Font = new Font("맑은 고딕", 9f, FontStyle.Bold),
            Text = "100%",
            TabStop = false,
        };

    private void UpdateOverlayLayout()
    {
        LayoutViewportZoomLabels();

        UpdateZoomLayoutForSide(isInput: true);
        UpdateZoomLayoutForSide(isInput: false);
    }

    /// <summary>배율 표시를 입력/출력 미리보기 영역 각각의 좌측 상단에 고정합니다(스크롤 패널 밖 크롬 위 오버레이).</summary>
    private void LayoutViewportZoomLabels()
    {
        if (_inputZoomOverlay != null)
        {
            _inputZoomOverlay.Location = new Point(8, 8);
            _inputZoomOverlay.BringToFront();
        }

        if (_outputZoomOverlay != null)
        {
            _outputZoomOverlay.Location = new Point(8, 8);
            _outputZoomOverlay.BringToFront();
        }

        menuStripMain.BringToFront();
    }

    private void ChangeZoom(bool isInput, bool zoomIn)
    {
        var pic = isInput ? picInput : picOutput;
        if (pic.Image == null)
            return;

        if (isInput)
        {
            _inputZoom = Math.Clamp(_inputZoom * (zoomIn ? ZoomStep : 1f / ZoomStep), MinZoom, MaxZoom);
            UpdateZoomLayoutForSide(isInput: true);
            UpdateZoomText(isInput: true);
        }
        else
        {
            _outputZoom = Math.Clamp(_outputZoom * (zoomIn ? ZoomStep : 1f / ZoomStep), MinZoom, MaxZoom);
            UpdateZoomLayoutForSide(isInput: false);
            UpdateZoomText(isInput: false);
        }
    }

    private void UpdateZoomLayoutForSide(bool isInput)
    {
        PictureBox pic = isInput ? picInput : picOutput;
        Panel? panel = isInput ? _inputScrollPanel : _outputScrollPanel;
        float zoom = isInput ? _inputZoom : _outputZoom;
        ref var panOffset = ref isInput ? ref _inputPanOffset : ref _outputPanOffset;

        if (panel == null || pic.Image == null)
            return;

        var imgW = pic.Image.Width;
        var imgH = pic.Image.Height;
        if (imgW <= 0 || imgH <= 0)
            return;

        var cw = Math.Max(1, panel.ClientSize.Width);
        var ch = Math.Max(1, panel.ClientSize.Height);
        var fit = Math.Min((float)cw / imgW, (float)ch / imgH);
        var scale = fit * zoom;
        var drawW = Math.Max(1, (int)Math.Round(imgW * scale));
        var drawH = Math.Max(1, (int)Math.Round(imgH * scale));

        pic.SizeMode = PictureBoxSizeMode.StretchImage;
        pic.Size = new Size(drawW, drawH);

        // Pan with scrollbars whenever the scaled image exceeds the viewport — not only when zoom > 1
        // (rounding can overflow at 100%, or a high zoom may still fit a tiny bitmap).
        var overflows = drawW > cw || drawH > ch;

        Point priorScroll = Point.Empty;
        if (panel.AutoScroll)
        {
            priorScroll = new Point(
                Math.Max(0, -panel.AutoScrollPosition.X),
                Math.Max(0, -panel.AutoScrollPosition.Y));
        }

        if (!overflows)
        {
            panel.AutoScroll = false;
            panel.AutoScrollMinSize = Size.Empty;
            var cx = Math.Max(0, (cw - drawW) / 2);
            var cy = Math.Max(0, (ch - drawH) / 2);
            var minL = Math.Min(0, cw - drawW);
            var maxL = Math.Max(0, cw - drawW);
            var minT = Math.Min(0, ch - drawH);
            var maxT = Math.Max(0, ch - drawH);
            var x = Math.Clamp(cx + panOffset.X, minL, maxL);
            var y = Math.Clamp(cy + panOffset.Y, minT, maxT);
            pic.Location = new Point(x, y);
            panOffset = new Point(x - cx, y - cy);
        }
        else
        {
            panOffset = Point.Empty;
            panel.AutoScroll = true;
            panel.AutoScrollMinSize = new Size(drawW, drawH);
            pic.Location = Point.Empty;

            if (priorScroll != Point.Empty)
            {
                var maxX = ScrollMax(panel.HorizontalScroll);
                var maxY = ScrollMax(panel.VerticalScroll);
                var sx = Math.Clamp(priorScroll.X, panel.HorizontalScroll.Minimum, maxX);
                var sy = Math.Clamp(priorScroll.Y, panel.VerticalScroll.Minimum, maxY);
                try
                {
                    panel.AutoScrollPosition = new Point(-sx, -sy);
                }
                catch
                {
                    // scroll range not ready
                }
            }
        }
    }

    private static int ScrollMax(ScrollProperties sp)
    {
        var r = sp.Maximum - sp.LargeChange + 1;
        return Math.Max(sp.Minimum, r);
    }

    private Panel? ViewportHostFromSender(object? sender) =>
        sender switch
        {
            Panel p when ReferenceEquals(p, panelInputViewport) => panelInputViewport,
            Panel p when ReferenceEquals(p, panelOutputViewport) => panelOutputViewport,
            PictureBox pb when ReferenceEquals(pb, picInput) => panelInputViewport,
            PictureBox pb when ReferenceEquals(pb, picOutput) => panelOutputViewport,
            _ => null,
        };

    private static Point ToPanelClientPoint(object? sender, MouseEventArgs e)
    {
        if (sender is PictureBox pb && pb.Parent is Panel pv)
            return new Point(e.X + pb.Left, e.Y + pb.Top);
        return e.Location;
    }

    private void Viewport_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;
        var panel = ViewportHostFromSender(sender);
        if (panel == null)
            return;
        var pt = ToPanelClientPoint(sender, e);
        // Capture on the control that received the click so drag MouseMove/MouseUp are reliable (Panel-only capture can drop moves on some layouts).
        var captureHost = (sender as Control) ?? panel;
        if (ReferenceEquals(panel, panelInputViewport))
        {
            _inputPanDragging = true;
            _inputPanLastClient = pt;
            _inputPanCaptureHost = captureHost;
            _inputPanCaptureHost.Capture = true;
            panelInputViewport.Cursor = Cursors.SizeAll;
            picInput.Cursor = Cursors.SizeAll;
        }
        else
        {
            _outputPanDragging = true;
            _outputPanLastClient = pt;
            _outputPanCaptureHost = captureHost;
            _outputPanCaptureHost.Capture = true;
            panelOutputViewport.Cursor = Cursors.SizeAll;
            picOutput.Cursor = Cursors.SizeAll;
        }
    }

    private void Viewport_MouseMove(object? sender, MouseEventArgs e)
    {
        var panel = ViewportHostFromSender(sender);
        if (panel == null)
            return;
        var pt = ToPanelClientPoint(sender, e);
        if (ReferenceEquals(panel, panelInputViewport))
        {
            if (!_inputPanDragging)
                return;
            var dx = pt.X - _inputPanLastClient.X;
            var dy = pt.Y - _inputPanLastClient.Y;
            _inputPanLastClient = pt;
            ApplyViewportPan(panel, picInput, isInput: true, dx, dy);
        }
        else
        {
            if (!_outputPanDragging)
                return;
            var dx = pt.X - _outputPanLastClient.X;
            var dy = pt.Y - _outputPanLastClient.Y;
            _outputPanLastClient = pt;
            ApplyViewportPan(panel, picOutput, isInput: false, dx, dy);
        }

        // Do not run full UpdateZoomLayout here — it fights AutoScroll/pan and makes dragging feel stuck.
        LayoutViewportZoomLabels();
    }

    private void Viewport_MouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;
        var panel = ViewportHostFromSender(sender);
        if (panel == null)
            return;
        if (ReferenceEquals(panel, panelInputViewport))
        {
            _inputPanDragging = false;
            _inputPanCaptureHost?.Capture = false;
            _inputPanCaptureHost = null;
            panelInputViewport.Cursor = Cursors.Default;
            picInput.Cursor = Cursors.Default;
        }
        else
        {
            _outputPanDragging = false;
            _outputPanCaptureHost?.Capture = false;
            _outputPanCaptureHost = null;
            panelOutputViewport.Cursor = Cursors.Default;
            picOutput.Cursor = Cursors.Default;
        }
    }

    private void ApplyViewportPan(Panel panel, PictureBox pic, bool isInput, int dx, int dy)
    {
        if (pic.Image == null)
            return;
        var zoom = isInput ? _inputZoom : _outputZoom;
        if (zoom > 1.0001f && panel.AutoScroll)
        {
            var curX = Math.Max(0, -panel.AutoScrollPosition.X);
            var curY = Math.Max(0, -panel.AutoScrollPosition.Y);
            curX -= dx;
            curY -= dy;
            var maxX = ScrollMax(panel.HorizontalScroll);
            var maxY = ScrollMax(panel.VerticalScroll);
            curX = Math.Clamp(curX, panel.HorizontalScroll.Minimum, maxX);
            curY = Math.Clamp(curY, panel.VerticalScroll.Minimum, maxY);
            try
            {
                panel.AutoScrollPosition = new Point(-curX, -curY);
            }
            catch
            {
                // ignore
            }

            return;
        }

        if (zoom <= 1.0001f)
        {
            ref var panOffset = ref isInput ? ref _inputPanOffset : ref _outputPanOffset;
            panOffset = new Point(panOffset.X + dx, panOffset.Y + dy);
            UpdateZoomLayoutForSide(isInput);
        }
    }

    private void ResetZoom(bool isInput)
    {
        if (isInput)
        {
            _inputZoom = 1f;
            _inputPanOffset = Point.Empty;
            UpdateZoomLayoutForSide(isInput: true);
            UpdateZoomText(isInput: true);
        }
        else
        {
            _outputZoom = 1f;
            _outputPanOffset = Point.Empty;
            UpdateZoomLayoutForSide(isInput: false);
            UpdateZoomText(isInput: false);
        }
    }

    private void UpdateZoomText(bool isInput)
    {
        var overlay = isInput ? _inputZoomOverlay : _outputZoomOverlay;
        var pic = isInput ? picInput : picOutput;
        if (overlay == null)
            return;

        if (pic.Image == null)
        {
            overlay.Visible = false;
            LayoutViewportZoomLabels();
            return;
        }

        overlay.Visible = true;
        overlay.BackColor = Color.Transparent;
        overlay.ForeColor = Color.Red;
        var z = isInput ? _inputZoom : _outputZoom;
        var pct = Math.Round(z * 100);
        overlay.Text = isInput ? $"입력 {pct:0}%" : $"결과 {pct:0}%";
        LayoutViewportZoomLabels();
    }

    private void SyncTrackBarFromNumeric()
    {
        if (_syncingConfidenceUi)
            return;
        _syncingConfidenceUi = true;
        try
        {
            var pct = (int)Math.Clamp((int)Math.Round((double)numConf.Value * 100), trackConf.Minimum, trackConf.Maximum);
            if (trackConf.Value != pct)
                trackConf.Value = pct;
        }
        finally
        {
            _syncingConfidenceUi = false;
        }
    }

    private void SyncNumericFromTrackBar()
    {
        if (_syncingConfidenceUi)
            return;
        _syncingConfidenceUi = true;
        try
        {
            var dec = Math.Round(trackConf.Value / 100m, 2, MidpointRounding.AwayFromZero);
            dec = Math.Clamp(dec, numConf.Minimum, numConf.Maximum);
            if (numConf.Value != dec)
                numConf.Value = dec;
        }
        finally
        {
            _syncingConfidenceUi = false;
        }
    }

    private void ConfidenceUi_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingConfidenceUi)
            return;
        SyncTrackBarFromNumeric();
    }

    private void TrackConf_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingConfidenceUi)
            return;
        SyncNumericFromTrackBar();
    }

    private void ApplyRecommendedInferenceDefaults()
    {
        txtLabels.Text = BrainCtInferenceDefaults.RecommendedClassLabelsComma;
        var dec = (decimal)Math.Round(BrainCtInferenceDefaults.RecommendedMinConfidence, 2, MidpointRounding.AwayFromZero);
        dec = Math.Clamp(dec, numConf.Minimum, numConf.Maximum);
        numConf.Value = dec;
        SyncTrackBarFromNumeric();
    }

    private void MenuRecommendedDefaults_Click(object? sender, EventArgs e)
    {
        var explain =
            "다음 권장값을 적용합니다.\n\n" +
            $"· 최소 신뢰도: {BrainCtInferenceDefaults.RecommendedMinConfidence:0.##} (Ultralytics YOLO predict 기본)\n" +
            $"· 단일 클래스 표시: {BrainCtInferenceDefaults.RecommendedClassLabelsComma}\n\n" +
            "계속할까요?";
        if (MessageBox.Show(this, explain, "추천 기본값", MessageBoxButtons.YesNo, MessageBoxIcon.Question) !=
            DialogResult.Yes)
            return;

        ApplyRecommendedInferenceDefaults();
        InvalidateSession();
        lblStatus.Text =
            $"추천 기본값 적용됨 · 신뢰도 {BrainCtInferenceDefaults.RecommendedMinConfidence:0.##} · 클래스 {BrainCtInferenceDefaults.RecommendedClassLabelsComma}";
    }

    private void SetupDetectionListViewColumns()
    {
        listDetections.Columns.Clear();
        listDetections.Columns.Add("#", 44);
        listDetections.Columns.Add("클래스", 160);
        listDetections.Columns.Add("신뢰도", 88);
        listDetections.Columns.Add("Left", 72);
        listDetections.Columns.Add("Top", 72);
        listDetections.Columns.Add("Width", 72);
        listDetections.Columns.Add("Height", 72);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        picInput.Image?.Dispose();
        picInput.Image = null;
        picOutput.Image?.Dispose();
        picOutput.Image = null;
        _session?.Dispose();
        _session = null;
        base.OnFormClosed(e);
    }

    private void SetSaveCommandsEnabled(bool enabled)
    {
        btnSave.Enabled = enabled;
        btnSaveCsv.Enabled = enabled;
        menuSaveImage.Enabled = enabled;
        menuSaveCsv.Enabled = enabled;
    }

    private void BtnModel_Click(object? sender, EventArgs e)
    {
        var initialDir = TryResolveRepoSubdirectory("models")
            ?? Path.GetDirectoryName(_modelPath)
            ?? Environment.CurrentDirectory;
        using var dlg = new OpenFileDialog
        {
            Title = "출혈 세그멘테이션 ONNX 선택 (YOLO26-seg 등)",
            Filter = "ONNX|*.onnx|모든 파일|*.*",
            CheckFileExists = true,
            InitialDirectory = initialDir,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        _modelPath = dlg.FileName;
        InvalidateSession();
        lblOnnxPath.Text = dlg.FileName;
        lblStatus.Text = $"모델을 불러왔습니다: {Path.GetFileName(_modelPath)}";
    }

    private void BtnImage_Click(object? sender, EventArgs e)
    {
        var initialDir = TryResolveRepoSubdirectory("samples")
            ?? (string.IsNullOrEmpty(_lastInputImagePath) ? null : Path.GetDirectoryName(_lastInputImagePath))
            ?? Environment.CurrentDirectory;
        using var dlg = new OpenFileDialog
        {
            Title = "뇌 CT 이미지 선택",
            Filter = "이미지|*.png;*.jpg;*.jpeg;*.bmp|모든 파일|*.*",
            CheckFileExists = true,
            InitialDirectory = initialDir,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        if (!TryLoadInputImageFromPath(dlg.FileName, out var err))
        {
            MessageBox.Show(this, err ?? "알 수 없는 오류", "이미지를 열 수 없습니다", MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private bool TryLoadInputImageFromPath(string path, out string? error)
    {
        error = null;
        try
        {
            picInput.Image?.Dispose();
            picInput.Image = null;
            picOutput.Image?.Dispose();
            picOutput.Image = null;
            UpdateZoomText(isInput: true);
            UpdateZoomText(isInput: false);
            listDetections.Items.Clear();
            SetSaveCommandsEnabled(false);
            _lastDetections = null;
            _lastInputImagePath = null;
            lblSlicePath.Text = "불러온 이미지 없음";

            picInput.Image = new Bitmap(path);
            ResetZoom(isInput: true);
            _lastInputImagePath = path;
            lblSlicePath.Text = path;
            lblStatus.Text = $"이미지를 불러왔습니다: {Path.GetFileName(path)}";
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            UpdateZoomText(isInput: true);
            UpdateZoomText(isInput: false);
            return false;
        }
    }

    private async void MenuConvertPt_Click(object? sender, EventArgs e)
    {
        var script = Path.Combine(AppContext.BaseDirectory, "tools", "export_yolo26_brain_onnx.py");
        if (!File.Exists(script))
        {
            MessageBox.Show(this,
                $"변환 스크립트가 없습니다(빌드 출력의 tools 폴더).\n{script}",
                "PyTorch→ONNX",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var py = PythonOnnxExportRunner.FindPythonLauncher();
        if (string.IsNullOrEmpty(py))
        {
            MessageBox.Show(this,
                "Python을 찾지 못했습니다. PATH에 py 또는 python을 넣거나, 환경 변수 YOLO26_PYTHON에 python.exe 전체 경로를 지정하세요.\n\n" +
                "또한 pip install ultralytics 및 tools\\requirements-export.txt 내 패키지가 필요합니다.",
                "PyTorch→ONNX",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        using var ofd = new OpenFileDialog
        {
            Title = "PyTorch 가중치 선택",
            Filter = "PyTorch|*.pt;*.pth|모든 파일|*.*",
            CheckFileExists = true,
        };
        if (ofd.ShowDialog(this) != DialogResult.OK)
            return;

        using var sfd = new SaveFileDialog
        {
            Title = "ONNX 저장 위치",
            Filter = "ONNX|*.onnx",
            FileName = "hemorrhage_seg.onnx",
            DefaultExt = "onnx",
            OverwritePrompt = true,
        };
        if (sfd.ShowDialog(this) != DialogResult.OK)
            return;

        using var optDlg = new OnnxExportOptionsForm();
        if (optDlg.ShowDialog(this) != DialogResult.OK)
            return;

        var opset = optDlg.Opset;
        menuTools.Enabled = false;
        UseWaitCursor = true;
        lblStatus.Text = "Python으로 ONNX 변환 중… (시간이 걸릴 수 있음)";
        try
        {
            var (ok, log) = await PythonOnnxExportRunner
                .RunExportAsync(py, script, ofd.FileName, sfd.FileName, opset, CancellationToken.None)
                .ConfigureAwait(true);

            if (!ok)
            {
                MessageBox.Show(this, TruncateForDialog(log, 6000), "변환 실패", MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                lblStatus.Text = "변환 실패";
                return;
            }

            if (!string.IsNullOrWhiteSpace(log))
            {
                MessageBox.Show(this, TruncateForDialog(log, 4000), "변환 로그", MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }

            if (MessageBox.Show(this,
                    "변환이 완료되었습니다. 이 ONNX를 지금 모델로 불러올까요?",
                    "PyTorch→ONNX",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question) == DialogResult.Yes)
            {
                _modelPath = sfd.FileName;
                InvalidateSession();
                lblOnnxPath.Text = sfd.FileName;
            }

            lblStatus.Text = $"ONNX 변환 완료: {Path.GetFileName(sfd.FileName)}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "변환 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            lblStatus.Text = "변환 오류";
        }
        finally
        {
            UseWaitCursor = false;
            menuTools.Enabled = true;
        }
    }

    private void MenuOpenSampleFolder_Click(object? sender, EventArgs e)
    {
        var dir = AppDataPaths.GetSampleDownloadDirectory();
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = '"' + dir + '"',
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "폴더를 열 수 없습니다", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async void BtnAnalyze_Click(object? sender, EventArgs e)
    {
        if (picInput.Image == null)
        {
            MessageBox.Show(this, "뇌 CT 이미지를 먼저 불러오세요.", "입력 없음", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (string.IsNullOrEmpty(_modelPath) || !File.Exists(_modelPath))
        {
            MessageBox.Show(this, "ONNX 모델 파일을 선택하세요.", "모델 없음", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var labels = ParseLabels();

        Bitmap? frame = null;
        try
        {
            frame = new Bitmap(picInput.Image);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "이미지 복사 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        btnAnalyze.Enabled = false;
        btnModel.Enabled = false;
        btnImage.Enabled = false;
        SetInferenceProgressUi(true, "추론 중 — ONNX 세션 준비 및 출혈 세그 실행…");

        try
        {
            EnsureSession(labels);
            var conf = (float)numConf.Value;

            var (annotated, dets) = await Task.Run(() => _session!.Detect(frame, conf)).ConfigureAwait(true);

            picOutput.Image?.Dispose();
            picOutput.Image = annotated;
            ResetZoom(isInput: false);
            _lastDetections = dets;
            SetSaveCommandsEnabled(true);

            var modelName = Path.GetFileName(_modelPath);
            var labelsSummary = string.Join(",", labels);
            lblStatus.Text =
                $"{_session!.ExecutionProviderSummary} · 모델 {modelName} · conf {conf:0.##} · 클래스 {labelsSummary} · 출혈 영역 {dets.Count}건";

            listDetections.BeginUpdate();
            listDetections.Items.Clear();
            for (var i = 0; i < dets.Count; i++)
            {
                var d = dets[i];
                var item = new ListViewItem((i + 1).ToString(CultureInfo.InvariantCulture))
                {
                    Tag = i,
                };
                item.SubItems.Add(d.Label);
                item.SubItems.Add(d.Confidence.ToString("0.###", CultureInfo.InvariantCulture));
                item.SubItems.Add(d.Box.Left.ToString("0.0", CultureInfo.InvariantCulture));
                item.SubItems.Add(d.Box.Top.ToString("0.0", CultureInfo.InvariantCulture));
                item.SubItems.Add(d.Box.Width.ToString("0.0", CultureInfo.InvariantCulture));
                item.SubItems.Add(d.Box.Height.ToString("0.0", CultureInfo.InvariantCulture));
                listDetections.Items.Add(item);
            }

            listDetections.EndUpdate();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "추론 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
            lblStatus.Text = "오류";
        }
        finally
        {
            SetInferenceProgressUi(false);
            frame?.Dispose();
            btnAnalyze.Enabled = true;
            btnModel.Enabled = true;
            btnImage.Enabled = true;
        }
    }

    private void SetInferenceProgressUi(bool active, string? statusText = null)
    {
        progressInference.Visible = true;
        progressInference.Style = active ? ProgressBarStyle.Marquee : ProgressBarStyle.Continuous;
        progressInference.MarqueeAnimationSpeed = active ? 35 : 0;
        numConf.Enabled = !active;
        trackConf.Enabled = !active;
        if (statusText != null)
            lblStatus.Text = statusText;
    }

    private void BtnSave_Click(object? sender, EventArgs e) => TrySaveResultImage();

    private void BtnSaveCsv_Click(object? sender, EventArgs e) => TrySaveDetectionsCsv();

    private void MenuSaveImage_Click(object? sender, EventArgs e) => TrySaveResultImage();

    private void MenuSaveCsv_Click(object? sender, EventArgs e) => TrySaveDetectionsCsv();

    private void MenuExit_Click(object? sender, EventArgs e) => Close();

    private string SuggestedResultBaseName() =>
        string.IsNullOrEmpty(_lastInputImagePath)
            ? "brain_ct_hemorrhage_seg"
            : Path.GetFileNameWithoutExtension(_lastInputImagePath) + "_hemorrhage_seg";

    private void TrySaveResultImage()
    {
        if (picOutput.Image == null)
        {
            MessageBox.Show(this, "저장할 결과 이미지가 없습니다. 먼저 추론을 실행하세요.", "저장",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "결과 이미지 저장",
            Filter = "PNG|*.png|JPEG|*.jpg;*.jpeg|BMP|*.bmp",
            FileName = SuggestedResultBaseName() + ".png",
            DefaultExt = "png",
            OverwritePrompt = true,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            using var clone = new Bitmap(picOutput.Image);
            SaveBitmapAs(clone, dlg.FileName);
            lblStatus.Text = $"이미지 저장됨: {Path.GetFileName(dlg.FileName)}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static void SaveBitmapAs(Bitmap bmp, string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext is ".jpg" or ".jpeg")
        {
            var jpgCodec = ImageCodecInfo.GetImageEncoders()
                .First(c => c.FormatID == ImageFormat.Jpeg.Guid);
            using var encParams = new EncoderParameters(1);
            encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 95L);
            bmp.Save(path, jpgCodec, encParams);
            return;
        }

        if (ext == ".bmp")
        {
            bmp.Save(path, ImageFormat.Bmp);
            return;
        }

        bmp.Save(path, ImageFormat.Png);
    }

    private void TrySaveDetectionsCsv()
    {
        if (_lastDetections == null)
        {
            MessageBox.Show(this, "저장할 출혈 영역 목록이 없습니다. 먼저 세그 추론을 실행하세요.", "저장",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "출혈 영역 목록 CSV 저장",
            Filter = "CSV|*.csv",
            FileName = SuggestedResultBaseName() + ".csv",
            DefaultExt = "csv",
            OverwritePrompt = true,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            WriteDetectionsCsv(dlg.FileName, _lastDetections);
            lblStatus.Text = $"CSV 저장됨: {Path.GetFileName(dlg.FileName)} ({_lastDetections.Count}건)";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static void WriteDetectionsCsv(string path, IReadOnlyList<BrainDetection> dets)
    {
        using var sw = new StreamWriter(path, false, new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        sw.WriteLine("index,label,confidence,left,top,width,height,right,bottom");
        for (var i = 0; i < dets.Count; i++)
        {
            var d = dets[i];
            var inv = CultureInfo.InvariantCulture;
            sw.WriteLine(string.Join(",",
                (i + 1).ToString(inv),
                EscapeCsv(d.Label),
                d.Confidence.ToString("0.####", inv),
                d.Box.Left.ToString("0.###", inv),
                d.Box.Top.ToString("0.###", inv),
                d.Box.Width.ToString("0.###", inv),
                d.Box.Height.ToString("0.###", inv),
                d.Box.Right.ToString("0.###", inv),
                d.Box.Bottom.ToString("0.###", inv)));
        }
    }

    private static string TruncateForDialog(string text, int maxChars)
    {
        var t = text.TrimEnd();
        if (t.Length <= maxChars)
            return t;
        return t[..maxChars] + Environment.NewLine + "… (이하 생략)";
    }

    private static string EscapeCsv(string s)
    {
        if (s.Contains(',') || s.Contains('"') || s.Contains('\r') || s.Contains('\n'))
            return "\"" + s.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
        return s;
    }

    private void ListDetections_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (listDetections.SelectedItems.Count == 0 || _lastDetections == null)
            return;

        if (listDetections.SelectedItems[0].Tag is not int idx || idx < 0 || idx >= _lastDetections.Count)
            return;

        var d = _lastDetections[idx];
        lblStatus.Text =
            $"선택 #{idx + 1}: {d.Label} (신뢰도 {d.Confidence:0.###}) · " +
            $"박스 픽셀 좌표 Left={d.Box.Left:0}, Top={d.Box.Top:0}, " +
            $"Right={d.Box.Right:0}, Bottom={d.Box.Bottom:0}";
    }

    private List<string> ParseLabels()
    {
        var raw = txtLabels.Text.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var list = raw.Where(s => s.Length > 0).ToList();
        if (list.Count == 0 && !string.IsNullOrWhiteSpace(BrainCtInferenceDefaults.RecommendedClassLabelsComma))
        {
            return BrainCtInferenceDefaults.RecommendedClassLabelsComma
                .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .ToList();
        }

        return list;
    }

    private void InvalidateSession()
    {
        _session?.Dispose();
        _session = null;
        _lastSessionKey = null;
    }

    /// <summary>저장소 models 폴더에 기본 세그 ONNX가 있으면 자동 선택.</summary>
    private void TryApplyDefaultSegmentationModel()
    {
        if (!string.IsNullOrEmpty(_modelPath) && File.Exists(_modelPath))
            return;

        var modelsDir = TryResolveRepoSubdirectory("models");
        if (modelsDir == null)
            return;

        foreach (var name in BrainCtInferenceDefaults.DefaultSegmentationOnnxFallbacks)
        {
            var path = Path.Combine(modelsDir, name);
            if (!File.Exists(path))
                continue;
            _modelPath = path;
            lblOnnxPath.Text = path;
            lblStatus.Text = $"기본 세그 모델: {Path.GetFileName(path)}";
            return;
        }
    }

    private static string? TryResolveRepoSubdirectory(string childDirName)
    {
        if (string.IsNullOrWhiteSpace(childDirName))
            return null;

        try
        {
            for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
            {
                var candidate = Path.Combine(dir.FullName, childDirName);
                if (Directory.Exists(candidate))
                    return candidate;
            }
        }
        catch (IOException)
        {
            // ignore
        }
        catch (UnauthorizedAccessException)
        {
            // ignore
        }

        return null;
    }

    private OnnxExecutionProviderRequest GetExecutionProviderRequest() =>
        _comboExecutionProvider?.SelectedIndex switch
        {
            1 => OnnxExecutionProviderRequest.CpuOnly,
            2 => OnnxExecutionProviderRequest.CudaOnly,
            _ => OnnxExecutionProviderRequest.Auto,
        };

    private void EnsureSession(IReadOnlyList<string> labels)
    {
        var ep = GetExecutionProviderRequest();
        var key = _modelPath + "\0" + string.Join(",", labels) + "\0" + (int)ep;
        if (_session != null && _lastSessionKey == key)
            return;

        InvalidateSession();
        _session = new BrainYolo26Session(_modelPath!, labels, ep, cudaDeviceId: 0);
        _lastSessionKey = key;
    }

    /// <summary>배율 텍스트만 보이고, 마우스는 아래 컨트롤로 통과합니다.</summary>
    private sealed class ZoomOverlayLabel : Label
    {
        private const int WM_NCHITTEST = 0x0084;
        private const int HTTRANSPARENT = -1;

        public ZoomOverlayLabel()
        {
            SetStyle(ControlStyles.Selectable, false);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_NCHITTEST)
            {
                m.Result = (IntPtr)HTTRANSPARENT;
                return;
            }

            base.WndProc(ref m);
        }
    }
}

}
