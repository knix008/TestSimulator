using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class SearchResultsPopup : Form
{
    private const int ItemHeight = 42;
    private const int MaxVisibleItems = 8;
    private const int HorizontalPadding = 10;
    private const int DetailPanelHeight = 108;

    private readonly ListBox _listBox;
    private readonly Panel _borderPanel;
    private readonly TextBox _detailBox;
    private IReadOnlyList<SearchResultItem> _results = [];
    private AnalysisResult? _analysis;

    // Prevent the popup from stealing keyboard focus under any circumstance
    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= 0x08000000; // WS_EX_NOACTIVATE
            return cp;
        }
    }

    public SearchResultsPopup()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        KeyPreview = true;

        _borderPanel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(74, 108, 155),
            Padding = new Padding(1)
        };

        _listBox = new ListBox
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.None,
            IntegralHeight = false,
            DrawMode = DrawMode.OwnerDrawFixed,
            ItemHeight = ItemHeight,
            Font = new Font("Segoe UI", 9f)
        };
        _listBox.Dock = DockStyle.Fill;
        _listBox.DrawItem += ListBox_DrawItem;
        _listBox.SelectedIndexChanged += (_, _) => UpdateDetailPreview();
        _listBox.DoubleClick += (_, _) => ConfirmSelection();
        _listBox.KeyDown += ListBox_KeyDown;

        _detailBox = new TextBox
        {
            Dock = DockStyle.Bottom,
            Height = DetailPanelHeight,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BorderStyle = BorderStyle.None,
            BackColor = Color.FromArgb(248, 249, 252),
            Font = new Font("Segoe UI", 8.75f),
            WordWrap = true
        };

        var inner = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = SystemColors.Window
        };
        inner.Controls.Add(_detailBox);
        inner.Controls.Add(_listBox);
        _borderPanel.Controls.Add(inner);
        Controls.Add(_borderPanel);
    }

    public event Action<SearchResultItem>? ResultSelected;

    public int SelectedIndex
    {
        get => _listBox.SelectedIndex;
        set
        {
            if (value < 0 || value >= _listBox.Items.Count)
            {
                _listBox.ClearSelected();
                return;
            }

            _listBox.SelectedIndex = value;
            _listBox.TopIndex = Math.Max(0, value - 2);
        }
    }

    public bool HasResults => _results.Count > 0;

    public void ShowResults(
        IReadOnlyList<SearchResultItem> results,
        Rectangle anchorScreenBounds,
        AnalysisResult? analysis = null)
    {
        _results = results;
        _analysis = analysis;
        _listBox.BeginUpdate();
        _listBox.Items.Clear();
        foreach (var result in results)
        {
            _listBox.Items.Add(result);
        }

        _listBox.EndUpdate();

        if (results.Count == 0)
        {
            HidePopup();
            return;
        }

        var width = Math.Max(anchorScreenBounds.Width, 420);
        var visibleCount = Math.Min(results.Count, MaxVisibleItems);
        var listHeight = visibleCount * ItemHeight + 4;
        var height = listHeight + DetailPanelHeight + 6;
        Location = new Point(anchorScreenBounds.Left, anchorScreenBounds.Bottom + 2);
        Size = new Size(width, height);
        SelectedIndex = 0;
        UpdateDetailPreview();

        if (!Visible)
        {
            Show();
        }
    }

    public void FocusList()
    {
        _listBox.Focus();
    }

    public void HidePopup()
    {
        if (Visible)
        {
            Hide();
        }
    }

    public void MoveSelection(int delta)
    {
        if (_listBox.Items.Count == 0)
        {
            return;
        }

        var next = _listBox.SelectedIndex < 0 ? 0 : _listBox.SelectedIndex + delta;
        next = Math.Clamp(next, 0, _listBox.Items.Count - 1);
        SelectedIndex = next;
        UpdateDetailPreview();
    }

    private void UpdateDetailPreview()
    {
        if (_listBox.SelectedItem is not SearchResultItem item)
        {
            _detailBox.Text = "항목을 선택하면 상세 정보가 표시됩니다. Enter 또는 더블클릭으로 이동합니다.";
            return;
        }

        _detailBox.Text = SearchResultDetailBuilder.BuildDetailText(_analysis, item);
    }

    public void ConfirmSelection()
    {
        if (_listBox.SelectedItem is not SearchResultItem item)
        {
            return;
        }

        ResultSelected?.Invoke(item);
        HidePopup();
    }

    private void ListBox_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter)
        {
            ConfirmSelection();
            e.Handled = true;
            e.SuppressKeyPress = true;
        }
        else if (e.KeyCode == Keys.Escape)
        {
            HidePopup();
            e.Handled = true;
        }
    }

    protected override bool ProcessDialogKey(Keys keyData)
    {
        if (keyData == Keys.Escape)
        {
            HidePopup();
            return true;
        }

        return base.ProcessDialogKey(keyData);
    }

    private static void ListBox_DrawItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0 || sender is not ListBox listBox || listBox.Items[e.Index] is not SearchResultItem item)
        {
            return;
        }

        var selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
        var backColor = selected ? Color.FromArgb(232, 240, 254) : SystemColors.Window;
        var kindColor = item.Kind switch
        {
            SearchResultKind.Type => Color.FromArgb(142, 68, 173),
            SearchResultKind.File => Color.FromArgb(39, 174, 96),
            SearchResultKind.Directory => Color.FromArgb(211, 84, 0),
            _ => Color.FromArgb(41, 128, 185)
        };

        using var background = new SolidBrush(backColor);
        e.Graphics.FillRectangle(background, e.Bounds);

        using var kindFont = new Font(e.Font!, FontStyle.Bold);
        using var detailFont = new Font(e.Font!.FontFamily, 8.25f);
        using var titleBrush = new SolidBrush(Color.FromArgb(35, 45, 60));
        using var detailBrush = new SolidBrush(Color.Gray);
        using var kindBrush = new SolidBrush(kindColor);

        var kindText = $"[{item.KindLabel}]";
        e.Graphics.DrawString(kindText, kindFont, kindBrush, e.Bounds.Left + HorizontalPadding, e.Bounds.Top + 4);

        var kindWidth = e.Graphics.MeasureString(kindText, kindFont).Width;
        var titleX = e.Bounds.Left + HorizontalPadding + kindWidth + 4;
        var titleWidth = e.Bounds.Width - (int)kindWidth - HorizontalPadding * 2 - 4;
        var title = Truncate(item.Title, titleWidth, e.Graphics, e.Font);
        e.Graphics.DrawString(title, e.Font, titleBrush, titleX, e.Bounds.Top + 5);
        e.Graphics.DrawString(item.Detail, detailFont, detailBrush, e.Bounds.Left + HorizontalPadding, e.Bounds.Top + 22);

        if (selected)
        {
            e.DrawFocusRectangle();
        }
    }

    private static string Truncate(string text, float maxWidth, Graphics graphics, Font font)
    {
        if (graphics.MeasureString(text, font).Width <= maxWidth)
        {
            return text;
        }

        const string suffix = "...";
        for (var length = text.Length - 1; length > 0; length--)
        {
            var candidate = text[..length] + suffix;
            if (graphics.MeasureString(candidate, font).Width <= maxWidth)
            {
                return candidate;
            }
        }

        return suffix;
    }
}
