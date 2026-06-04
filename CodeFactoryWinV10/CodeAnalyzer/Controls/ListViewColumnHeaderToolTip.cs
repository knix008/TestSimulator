namespace CodeAnalyzer.Controls;

/// <summary>ListView Details 뷰의 열 헤더에 마우스를 올리면 열별 설명 Tooltip을 표시합니다.</summary>
internal sealed class ListViewColumnHeaderToolTip : IDisposable
{
    private readonly ListView _listView;
    private readonly ToolTip _toolTip;
    private readonly string[] _columnToolTips;
    private int _activeColumn = -1;

    public ListViewColumnHeaderToolTip(ListView listView, IReadOnlyList<string> columnToolTips)
    {
        _listView = listView;
        _columnToolTips = columnToolTips.ToArray();
        _toolTip = new ToolTip
        {
            AutoPopDelay = 10000,
            InitialDelay = 400,
            ReshowDelay = 200,
            ShowAlways = true,
            IsBalloon = false
        };

        _listView.MouseMove += OnMouseMove;
        _listView.MouseLeave += OnMouseLeave;
    }

    public void UpdateColumnToolTips(IReadOnlyList<string> columnToolTips)
    {
        for (var i = 0; i < columnToolTips.Count && i < _columnToolTips.Length; i++)
        {
            _columnToolTips[i] = columnToolTips[i];
        }

        if (_activeColumn >= 0)
        {
            _toolTip.Hide(_listView);
            _activeColumn = -1;
        }
    }

    private void OnMouseMove(object? sender, MouseEventArgs e)
    {
        var column = HitTestColumn(e.Location);
        if (column < 0
            || column >= _columnToolTips.Length
            || string.IsNullOrWhiteSpace(_columnToolTips[column]))
        {
            ClearTooltip();
            return;
        }

        if (column == _activeColumn)
        {
            return;
        }

        _activeColumn = column;
        _toolTip.Show(_columnToolTips[column], _listView, e.Location.X, e.Location.Y + 18, 10000);
    }

    private void OnMouseLeave(object? sender, EventArgs e) => ClearTooltip();

    private void ClearTooltip()
    {
        if (_activeColumn < 0)
        {
            return;
        }

        _toolTip.Hide(_listView);
        _activeColumn = -1;
    }

    private int HitTestColumn(Point clientPoint)
    {
        if (_listView.View != View.Details || _listView.Columns.Count == 0)
        {
            return -1;
        }

        var headerBottom = GetHeaderHeight();
        if (clientPoint.Y < 0 || clientPoint.Y >= headerBottom)
        {
            return -1;
        }

        var x = clientPoint.X;
        if (_listView.Items.Count > 0)
        {
            x -= _listView.GetItemRect(0).Left;
        }

        if (x < 0)
        {
            return -1;
        }

        var offset = 0;
        for (var i = 0; i < _listView.Columns.Count; i++)
        {
            var width = _listView.Columns[i].Width;
            if (x >= offset && x < offset + width)
            {
                return i;
            }

            offset += width;
        }

        return -1;
    }

    private int GetHeaderHeight()
    {
        if (_listView.Items.Count > 0)
        {
            return Math.Max(1, _listView.GetItemRect(0).Top);
        }

        return _listView.Font.Height + 8;
    }

    public void Dispose()
    {
        _listView.MouseMove -= OnMouseMove;
        _listView.MouseLeave -= OnMouseLeave;
        _toolTip.Dispose();
    }
}
