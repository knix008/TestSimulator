namespace MyWorkspace.Win.Forms;

internal sealed class TableInsertPopupForm : Form
{
    private const int MaxRows = 8;
    private const int MaxColumns = 8;

    private readonly Label _lblSize = new();
    private readonly TableSizePickerControl _picker = new(MaxRows, MaxColumns);

    public int SelectedRows { get; private set; }
    public int SelectedColumns { get; private set; }

    public TableInsertPopupForm()
    {
        FormBorderStyle = FormBorderStyle.FixedToolWindow;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowIcon = false;
        AutoScaleMode = AutoScaleMode.Font;
        Font = AppTheme.UiFont;
        Padding = new Padding(10);
        ClientSize = new Size(_picker.Width + 20, _lblSize.Height + _picker.Height + 28);

        _lblSize.AutoSize = false;
        _lblSize.Dock = DockStyle.Top;
        _lblSize.Height = 22;
        _lblSize.TextAlign = ContentAlignment.MiddleLeft;

        _picker.Dock = DockStyle.Top;
        _picker.HoverChanged += (_, _) => UpdateSizeLabel();
        _picker.SelectionCompleted += OnSelectionCompleted;

        Controls.Add(_picker);
        Controls.Add(_lblSize);

        ApplyTheme();
        ApplyLocalization();
        UpdateSizeLabel();

        Deactivate += (_, _) =>
        {
            if (DialogResult == DialogResult.None)
            {
                DialogResult = DialogResult.Cancel;
                Close();
            }
        };
    }

    public static bool TryShow(IWin32Window owner, ToolStrip? toolbar, ToolStripButton? anchorButton, out int rows, out int columns)
    {
        rows = 0;
        columns = 0;

        using var popup = new TableInsertPopupForm();
        var screenLocation = anchorButton != null && toolbar != null
            ? GetScreenLocationNear(toolbar, anchorButton, popup.Size)
            : new Point(Cursor.Position.X - popup.Width / 2, Cursor.Position.Y + 12);
        popup.ApplyScreenLocation(screenLocation);

        if (popup.ShowDialog(owner) != DialogResult.OK)
            return false;

        rows = popup.SelectedRows;
        columns = popup.SelectedColumns;
        return rows > 0 && columns > 0;
    }

    public static bool TryShow(IWin32Window owner, Point screenLocation, out int rows, out int columns)
    {
        rows = 0;
        columns = 0;

        using var popup = new TableInsertPopupForm();
        popup.ApplyScreenLocation(screenLocation);

        if (popup.ShowDialog(owner) != DialogResult.OK)
            return false;

        rows = popup.SelectedRows;
        columns = popup.SelectedColumns;
        return rows > 0 && columns > 0;
    }

    private static Point GetScreenLocationNear(ToolStrip toolbar, ToolStripButton button, Size popupSize)
    {
        var anchor = toolbar.PointToScreen(new Point(button.Bounds.Left, button.Bounds.Top));
        return new Point(anchor.X - popupSize.Width - 8, anchor.Y - 4);
    }

    private void ApplyScreenLocation(Point screenLocation)
    {
        var area = Screen.FromPoint(screenLocation).WorkingArea;
        var x = Math.Clamp(screenLocation.X, area.Left, area.Right - Width);
        var y = Math.Clamp(screenLocation.Y, area.Top, area.Bottom - Height);
        Location = new Point(x, y);
    }

    private void ApplyTheme()
    {
        BackColor = AppTheme.Surface;
        ForeColor = AppTheme.TextPrimary;
        _lblSize.ForeColor = AppTheme.TextSecondary;
        _lblSize.BackColor = Color.Transparent;
        _picker.ApplyTheme();
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.TableInsertTitle);
        UpdateSizeLabel();
    }

    private void UpdateSizeLabel()
    {
        _lblSize.Text = _picker.HoverRows > 0 && _picker.HoverColumns > 0
            ? Localization.Format(K.TableInsertSizeFormat, _picker.HoverRows, _picker.HoverColumns)
            : Localization.Get(K.TableInsertHint);
    }

    private void OnSelectionCompleted(object? sender, EventArgs e)
    {
        if (_picker.HoverRows <= 0 || _picker.HoverColumns <= 0)
            return;

        SelectedRows = _picker.HoverRows;
        SelectedColumns = _picker.HoverColumns;
        DialogResult = DialogResult.OK;
        Close();
    }

    private sealed class TableSizePickerControl : Control
    {
        private const int CellSize = 18;
        private const int CellGap = 2;
        private const int OuterPadding = 2;

        private readonly int _maxRows;
        private readonly int _maxColumns;

        public int HoverRows { get; private set; }
        public int HoverColumns { get; private set; }

        public event EventHandler? HoverChanged;
        public event EventHandler? SelectionCompleted;

        public TableSizePickerControl(int maxRows, int maxColumns)
        {
            _maxRows = Math.Max(1, maxRows);
            _maxColumns = Math.Max(1, maxColumns);

            var width = OuterPadding * 2 + _maxColumns * CellSize + (_maxColumns - 1) * CellGap;
            var height = OuterPadding * 2 + _maxRows * CellSize + (_maxRows - 1) * CellGap;
            Size = new Size(width, height);
            MinimumSize = Size;
            MaximumSize = Size;
            Cursor = Cursors.Hand;
            TabStop = false;

            SetStyle(ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.UserPaint, true);
        }

        public void ApplyTheme() => Invalidate();

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            UpdateHover(e.Location);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button != MouseButtons.Left)
                return;

            UpdateHover(e.Location);
            if (HoverRows > 0 && HoverColumns > 0)
                SelectionCompleted?.Invoke(this, EventArgs.Empty);
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            if (HoverRows == 0 && HoverColumns == 0)
                return;

            HoverRows = 0;
            HoverColumns = 0;
            Invalidate();
            HoverChanged?.Invoke(this, EventArgs.Empty);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.Clear(AppTheme.Surface);

            for (var row = 1; row <= _maxRows; row++)
            {
                for (var column = 1; column <= _maxColumns; column++)
                {
                    var rect = GetCellBounds(row, column);
                    var selected = row <= HoverRows && column <= HoverColumns;
                    var fill = selected ? AppTheme.AccentHover : AppTheme.BorderLight;
                    var border = selected ? AppTheme.Accent : AppTheme.Border;

                    using var brush = new SolidBrush(fill);
                    e.Graphics.FillRectangle(brush, rect);

                    using var pen = new Pen(border);
                    e.Graphics.DrawRectangle(pen, rect.X, rect.Y, rect.Width - 1, rect.Height - 1);
                }
            }
        }

        private void UpdateHover(Point location)
        {
            var column = (location.X - OuterPadding) / (CellSize + CellGap) + 1;
            var row = (location.Y - OuterPadding) / (CellSize + CellGap) + 1;

            if (location.X < OuterPadding || location.Y < OuterPadding)
            {
                row = 0;
                column = 0;
            }
            else
            {
                row = Math.Clamp(row, 0, _maxRows);
                column = Math.Clamp(column, 0, _maxColumns);
            }

            if (HoverRows == row && HoverColumns == column)
                return;

            HoverRows = row;
            HoverColumns = column;
            Invalidate();
            HoverChanged?.Invoke(this, EventArgs.Empty);
        }

        private Rectangle GetCellBounds(int row, int column)
        {
            var x = OuterPadding + (column - 1) * (CellSize + CellGap);
            var y = OuterPadding + (row - 1) * (CellSize + CellGap);
            return new Rectangle(x, y, CellSize, CellSize);
        }
    }
}
