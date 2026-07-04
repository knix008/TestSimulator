using MyWorkspace.Core.Models;

using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

internal sealed class TitleBarPageSearchBox : UserControl
{
    private const int DropDownMaxHeight = 280;
    private const int ItemHeight = 44;
    private const int IconColumnWidth = 28;

    private readonly CenteredSingleLineTextBox _textBox = new();
    private readonly ToolTip _toolTip = new();
    private readonly System.Windows.Forms.Timer _debounceTimer = new();
    private readonly SearchResultsPopupForm _resultsPopup = new();
    private readonly ListBox _resultsList = new();
    private readonly SearchResultsClickOutsideFilter _clickOutsideFilter;

    private Func<string, IReadOnlyList<PageSearchResult>>? _searchProvider;
    private bool _suppressTextChanged;
    private bool _restoreFocusAfterResults;
    private string _lastSearchQuery = string.Empty;
    private int _hoveredIndex = -1;
    private Form? _popupOwner;

    public event EventHandler<PageSearchSelection>? PageSelected;

    internal bool IsResultsPopupVisible => _resultsPopup.Visible;

    public TitleBarPageSearchBox()
    {
        Height = 32;
        MinimumSize = new Size(120, 32);
        TabStop = false;
        _clickOutsideFilter = new SearchResultsClickOutsideFilter(this);

        _textBox.TabStop = true;
        _textBox.Dock = DockStyle.Fill;
        _textBox.TextChanged += OnTextChanged;
        _textBox.KeyDown += OnTextBoxKeyDown;
        _textBox.GotFocus += (_, _) => _restoreFocusAfterResults = true;

        _debounceTimer.Interval = 250;
        _debounceTimer.Tick += (_, _) =>
        {
            _debounceTimer.Stop();
            RunSearch();
        };

        _resultsList.BorderStyle = BorderStyle.None;
        _resultsList.IntegralHeight = false;
        _resultsList.TabStop = false;
        _resultsList.Dock = DockStyle.Fill;
        _resultsList.DrawMode = DrawMode.OwnerDrawFixed;
        _resultsList.ItemHeight = ItemHeight;
        _resultsList.DrawItem += DrawResultItem;
        _resultsList.MouseMove += OnResultsMouseMove;
        _resultsList.MouseLeave += (_, _) =>
        {
            _hoveredIndex = -1;
            _resultsList.Invalidate();
        };
        _resultsList.Click += OnResultClicked;
        _resultsList.KeyDown += OnResultsKeyDown;
        _resultsList.MouseDoubleClick += OnResultClicked;

        _resultsPopup.Controls.Add(_resultsList);
        _resultsPopup.Size = new Size(320, ItemHeight);

        Controls.Add(_textBox);
        // Leave 1px inset so the painted border is not covered by the docked text field.
        Padding = new Padding(IconColumnWidth, 1, 8, 1);
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        UpdateStyles();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            Application.RemoveMessageFilter(_clickOutsideFilter);
            _debounceTimer.Dispose();
            _toolTip.Dispose();
            _resultsPopup.Dispose();
        }

        base.Dispose(disposing);
    }

    public void SetSearchProvider(Func<string, IReadOnlyList<PageSearchResult>>? provider) =>
        _searchProvider = provider;

    public void ClearSearch()
    {
        _suppressTextChanged = true;
        try
        {
            _textBox.ClearText();
        }
        finally
        {
            _suppressTextChanged = false;
        }

        HideResultsPopup();
    }

    public void ApplyTheme()
    {
        BackColor = AppTheme.Surface;
        _textBox.BackColor = AppTheme.Surface;
        _textBox.ForeColor = AppTheme.TextPrimary;
        _textBox.Font = AppTheme.UiFont;
        _textBox.PlaceholderText = Localization.Get(K.TitleBarPageSearchPlaceholder);
        _toolTip.SetToolTip(_textBox, Localization.Get(K.TipTitleBarPageSearch));
        _toolTip.SetToolTip(this, Localization.Get(K.TipTitleBarPageSearch));

        _resultsPopup.BackColor = AppTheme.Surface;
        _resultsList.BackColor = AppTheme.Surface;
        _resultsList.ForeColor = AppTheme.TextPrimary;
        _resultsList.Font = AppTheme.UiFont;
        AppTheme.StyleListBox(_resultsList);
        AppTheme.StyleToolTip(_toolTip);
        PerformLayout();
        Invalidate();
    }

    internal bool ContainsScreenPoint(Point screenPoint) =>
        RectangleToScreen(ClientRectangle).Contains(screenPoint);

    internal bool ContainsResultsPopupPoint(Point screenPoint) =>
        _resultsPopup.Visible && _resultsPopup.Bounds.Contains(screenPoint);

    internal void HideResultsPopup() => HideDropDown();

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        var outer = new Rectangle(0, 0, Width - 1, Height - 1);
        var inner = Rectangle.Inflate(outer, -1, -1);

        using (var backBrush = new SolidBrush(AppTheme.Surface))
            e.Graphics.FillRectangle(backBrush, inner);

        using (var pen = new Pen(AppTheme.Border))
            e.Graphics.DrawRectangle(pen, outer);

        DrawSearchIcon(e.Graphics);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (Enabled)
            _textBox.Focus();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        Invalidate();
        RepositionResultsPopup();
    }

    protected override void OnEnabledChanged(EventArgs e)
    {
        base.OnEnabledChanged(e);
        _textBox.Enabled = Enabled;
        if (!Enabled)
            HideDropDown();
    }

    private void OnTextChanged(object? sender, EventArgs e)
    {
        if (_suppressTextChanged)
            return;

        _restoreFocusAfterResults = true;
        _debounceTimer.Stop();
        _debounceTimer.Start();
    }

    private void OnTextBoxKeyDown(object? sender, KeyEventArgs e)
    {
        _restoreFocusAfterResults = true;

        if (e.KeyCode == Keys.Down)
        {
            if (!_resultsPopup.Visible)
                RunSearch();
            else
                MoveSelection(1);

            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.Up && _resultsPopup.Visible)
        {
            MoveSelection(-1);
            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.Escape)
        {
            HideDropDown();
            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.Enter && !_resultsPopup.Visible)
        {
            RunSearch();
            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.Enter && _resultsPopup.Visible)
        {
            SelectResultAt(_resultsList.SelectedIndex >= 0 ? _resultsList.SelectedIndex : 0);
            e.Handled = true;
            e.SuppressKeyPress = true;
        }
    }

    private void OnResultsKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter)
        {
            SelectResultAt(_resultsList.SelectedIndex);
            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.Escape)
        {
            HideDropDown();
            RestoreSearchInputFocus();
            e.Handled = true;
            e.SuppressKeyPress = true;
        }
    }

    private void MoveSelection(int delta)
    {
        if (_resultsList.Items.Count == 0)
            return;

        var next = _resultsList.SelectedIndex + delta;
        if (next < 0)
            next = 0;
        if (next >= _resultsList.Items.Count)
            next = _resultsList.Items.Count - 1;

        _resultsList.SelectedIndex = next;
        _resultsList.TopIndex = next;
    }

    private void OnResultClicked(object? sender, EventArgs e)
    {
        var index = _resultsList.IndexFromPoint(_resultsList.PointToClient(Cursor.Position));
        if (index < 0)
            index = _resultsList.SelectedIndex;

        SelectResultAt(index);
    }

    private void OnResultsMouseMove(object? sender, MouseEventArgs e)
    {
        var index = _resultsList.IndexFromPoint(e.Location);
        if (index == _hoveredIndex)
            return;

        _hoveredIndex = index;
        _resultsList.Invalidate();
    }

    private void RunSearch()
    {
        _debounceTimer.Stop();

        if (!Enabled || _searchProvider == null)
        {
            HideDropDown();
            return;
        }

        var query = _textBox.Text.Trim();
        _lastSearchQuery = query;
        if (query.Length == 0)
        {
            HideDropDown();
            return;
        }

        IReadOnlyList<PageSearchResult> results;
        try
        {
            results = _searchProvider(query);
        }
        catch
        {
            HideDropDown();
            return;
        }

        ShowResults(results);
    }

    private void ShowResults(IReadOnlyList<PageSearchResult> results)
    {
        var wasVisible = _resultsPopup.Visible;

        _resultsList.BeginUpdate();
        try
        {
            _resultsList.Items.Clear();
            if (results.Count == 0)
            {
                _resultsList.Items.Add(Localization.Get(K.TitleBarPageSearchNoResults));
            }
            else
            {
                foreach (var result in results)
                    _resultsList.Items.Add(result);
            }
        }
        finally
        {
            _resultsList.EndUpdate();
        }

        if (results.Count > 0)
            _resultsList.SelectedIndex = 0;

        var width = Math.Max(Width, 320);
        var height = Math.Min(DropDownMaxHeight, Math.Max(ItemHeight, results.Count * ItemHeight));
        if (results.Count == 0)
            height = ItemHeight;

        _resultsPopup.ClientSize = new Size(width, height);

        var owner = FindForm();
        if (owner == null)
            return;

        _resultsPopup.Location = PointToScreen(new Point(0, Height));

        if (!wasVisible)
        {
            AttachPopupOwner(owner);
            _resultsPopup.Show(owner);
            Application.AddMessageFilter(_clickOutsideFilter);
        }
        else
        {
            RepositionResultsPopup();
        }

        if (_restoreFocusAfterResults)
            RestoreSearchInputFocus();
    }

    private void AttachPopupOwner(Form owner)
    {
        if (_popupOwner == owner)
            return;

        DetachPopupOwner();
        _popupOwner = owner;
        _popupOwner.Move += OnPopupOwnerMoved;
        _popupOwner.Resize += OnPopupOwnerMoved;
    }

    private void DetachPopupOwner()
    {
        if (_popupOwner == null)
            return;

        _popupOwner.Move -= OnPopupOwnerMoved;
        _popupOwner.Resize -= OnPopupOwnerMoved;
        _popupOwner = null;
    }

    private void OnPopupOwnerMoved(object? sender, EventArgs e) => RepositionResultsPopup();

    private void RepositionResultsPopup()
    {
        if (!_resultsPopup.Visible)
            return;

        _resultsPopup.Location = PointToScreen(new Point(0, Height));
    }

    private void RestoreSearchInputFocus()
    {
        if (IsDisposed || !Enabled)
            return;

        void FocusSearchBox()
        {
            if (IsDisposed || !Enabled)
                return;

            var owner = FindForm();
            if (owner is { IsHandleCreated: true, IsDisposed: false })
                SetForegroundWindow(owner.Handle);

            if (!_textBox.ContainsFocus)
                _textBox.Focus();
        }

        if (InvokeRequired)
            BeginInvoke(FocusSearchBox);
        else
            FocusSearchBox();
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    private void SelectResultAt(int index)
    {
        if (index < 0 || index >= _resultsList.Items.Count)
            return;

        if (_resultsList.Items[index] is not PageSearchResult result)
            return;

        HideDropDown();
        PageSelected?.Invoke(this, new PageSearchSelection
        {
            PageId = result.PageId,
            Query = _lastSearchQuery,
            MatchInContent = result.MatchInContent
        });
    }

    private void HideDropDown()
    {
        Application.RemoveMessageFilter(_clickOutsideFilter);
        DetachPopupOwner();

        if (_resultsPopup.Visible)
            _resultsPopup.Hide();
    }

    private static void PaintSearchIconGlyph(Graphics graphics, int height)
    {
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;

        var color = AppTheme.TextMuted;
        using var pen = new Pen(color, 1.35f)
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round
        };

        var cx = IconColumnWidth / 2f;
        var cy = height / 2f;
        graphics.DrawEllipse(pen, cx - 5f, cy - 5f, 9f, 9f);
        graphics.DrawLine(pen, cx + 2.5f, cy + 2.5f, cx + 7f, cy + 7f);
    }

    private void DrawSearchIcon(Graphics graphics)
    {
        var clip = graphics.ClipBounds;
        graphics.SetClip(new RectangleF(0, 0, IconColumnWidth, Height));
        try
        {
            PaintSearchIconGlyph(graphics, Height);
        }
        finally
        {
            graphics.SetClip(clip);
        }
    }

    private void DrawResultItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0)
            return;

        var selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
        var hovered = e.Index == _hoveredIndex;
        var backColor = selected || hovered ? AppTheme.AccentHover : AppTheme.Surface;
        var titleColor = selected || hovered ? AppTheme.Accent : AppTheme.TextPrimary;
        var detailColor = AppTheme.TextMuted;

        using (var backBrush = new SolidBrush(backColor))
            e.Graphics.FillRectangle(backBrush, e.Bounds);

        if (e.Index >= _resultsList.Items.Count)
            return;

        if (_resultsList.Items[e.Index] is not PageSearchResult result)
        {
            TextRenderer.DrawText(
                e.Graphics,
                _resultsList.Items[e.Index]?.ToString() ?? string.Empty,
                AppTheme.UiFont,
                new Rectangle(e.Bounds.X + 10, e.Bounds.Y, e.Bounds.Width - 16, e.Bounds.Height),
                AppTheme.TextMuted,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            return;
        }

        var titleRect = new Rectangle(e.Bounds.X + 10, e.Bounds.Y + 4, e.Bounds.Width - 16, 18);
        var detailRect = new Rectangle(e.Bounds.X + 10, e.Bounds.Y + 22, e.Bounds.Width - 16, 16);

        TextRenderer.DrawText(
            e.Graphics,
            result.PageTitle,
            AppTheme.UiFontSemibold,
            titleRect,
            titleColor,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);

        var detail = string.IsNullOrWhiteSpace(result.Snippet)
            ? result.WorkspaceName
            : $"{result.WorkspaceName} · {result.Snippet}";

        TextRenderer.DrawText(
            e.Graphics,
            detail,
            AppTheme.UiFont,
            detailRect,
            detailColor,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }
}
