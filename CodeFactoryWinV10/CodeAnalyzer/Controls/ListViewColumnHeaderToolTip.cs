using System.Runtime.InteropServices;



namespace CodeAnalyzer.Controls;



/// <summary>ListView Details 뷰의 열 헤더에 마우스를 올리면 열별 설명 Tooltip을 표시합니다.</summary>

internal sealed class ListViewColumnHeaderToolTip : IDisposable

{

    private const int LvmGetHeader = 0x101F;

    private const int HdmHitTest = 0x1206;

    private const uint HhtOnHeader = 0x0002;

    private const uint HhtOnDivider = 0x0004;



    private readonly ListView _listView;

    private readonly ToolTip _toolTip;

    private readonly System.Windows.Forms.Timer _pollTimer;

    private readonly HeaderWindow _headerWindow;

    private string[] _columnToolTips;

    private int _activeColumn = -1;



    public ListViewColumnHeaderToolTip(ListView listView, IReadOnlyList<string> columnToolTips)

    {

        _listView = listView;

        _columnToolTips = NormalizeToolTips(listView, columnToolTips);

        _headerWindow = new HeaderWindow();

        _toolTip = new ToolTip

        {

            AutoPopDelay = 12000,

            InitialDelay = 0,

            ReshowDelay = 0,

            ShowAlways = true,

            IsBalloon = false

        };



        _pollTimer = new System.Windows.Forms.Timer { Interval = 50 };

        _pollTimer.Tick += OnPollTick;



        _listView.HandleCreated += OnListViewHandleChanged;

        _listView.HandleDestroyed += OnListViewHandleChanged;

        _listView.VisibleChanged += OnListViewVisibleChanged;

        _listView.ColumnWidthChanged += (_, _) => ClearTooltip();

        _listView.Disposed += (_, _) => Dispose();



        UpdatePollingState();

    }



    public void UpdateColumnToolTips(IReadOnlyList<string> columnToolTips)

    {

        _columnToolTips = NormalizeToolTips(_listView, columnToolTips);

        ClearTooltip();

    }



    private void OnListViewHandleChanged(object? sender, EventArgs e)

    {

        ClearTooltip();

        _headerWindow.Detach();

        UpdatePollingState();

    }



    private void OnListViewVisibleChanged(object? sender, EventArgs e) => UpdatePollingState();



    private void UpdatePollingState()

    {

        var shouldPoll = !_listView.IsDisposed

            && _listView.Visible

            && _listView.IsHandleCreated

            && GetHeaderHandle() != IntPtr.Zero;



        _pollTimer.Enabled = shouldPoll;

        if (!shouldPoll)

        {

            ClearTooltip();

        }

    }



    private void OnPollTick(object? sender, EventArgs e)

    {

        if (_listView.IsDisposed || !_listView.IsHandleCreated || !_listView.Visible)

        {

            ClearTooltip();

            return;

        }



        var header = GetHeaderHandle();

        if (header == IntPtr.Zero)

        {

            ClearTooltip();

            return;

        }



        if (!TryGetHeaderClientPoint(header, out var headerPoint))

        {

            ClearTooltip();

            return;

        }



        var column = HitTestHeaderColumn(header, headerPoint);

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

        _headerWindow.Attach(header);



        _toolTip.Hide(_headerWindow);

        _toolTip.Show(

            _columnToolTips[column],

            _headerWindow,

            Math.Max(0, headerPoint.X),

            Math.Max(0, headerPoint.Y + 20),

            12000);

    }



    private bool TryGetHeaderClientPoint(IntPtr header, out Point headerPoint)

    {

        headerPoint = Point.Empty;



        var screen = Control.MousePosition;

        if (WindowFromPoint(screen) != header)

        {

            return false;

        }



        var native = new NativePoint { X = screen.X, Y = screen.Y };

        if (!ScreenToClient(header, ref native))

        {

            return false;

        }



        if (native.X < 0 || native.Y < 0)

        {

            return false;

        }



        if (!GetClientRect(header, out var rect))

        {

            return false;

        }



        if (native.X >= rect.Right || native.Y >= rect.Bottom)

        {

            return false;

        }



        headerPoint = new Point(native.X, native.Y);

        return true;

    }



    private static string[] NormalizeToolTips(ListView listView, IReadOnlyList<string> columnToolTips)

    {

        var count = listView.Columns.Count;

        var normalized = new string[count];

        for (var i = 0; i < count; i++)

        {

            normalized[i] = i < columnToolTips.Count && !string.IsNullOrWhiteSpace(columnToolTips[i])

                ? columnToolTips[i]

                : listView.Columns[i].Text;

        }



        return normalized;

    }



    private void ClearTooltip()

    {

        if (_activeColumn < 0)

        {

            return;

        }



        _toolTip.Hide(_headerWindow);

        _activeColumn = -1;

    }



    private IntPtr GetHeaderHandle() =>

        _listView.IsHandleCreated

            ? SendMessagePtr(_listView.Handle, LvmGetHeader, IntPtr.Zero, IntPtr.Zero)

            : IntPtr.Zero;



    private int HitTestHeaderColumn(IntPtr header, Point headerPoint)

    {

        if (_listView.Columns.Count == 0)

        {

            return -1;

        }



        var info = new HdHitTestInfo

        {

            Point = new NativePoint { X = headerPoint.X, Y = headerPoint.Y },

            Flags = 0,

            Item = -1

        };



        _ = SendMessageHitTest(header, HdmHitTest, IntPtr.Zero, ref info);

        if (info.Item >= 0

            && info.Item < _listView.Columns.Count

            && (info.Flags & (HhtOnHeader | HhtOnDivider)) != 0)

        {

            return info.Item;

        }



        return HitTestHeaderColumnByWidth(headerPoint.X);

    }



    private int HitTestHeaderColumnByWidth(int x)

    {

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



    public void Dispose()

    {

        _pollTimer.Stop();

        _pollTimer.Tick -= OnPollTick;

        _pollTimer.Dispose();



        _listView.HandleCreated -= OnListViewHandleChanged;

        _listView.HandleDestroyed -= OnListViewHandleChanged;

        _listView.VisibleChanged -= OnListViewVisibleChanged;



        ClearTooltip();

        _headerWindow.Detach();

        _toolTip.Dispose();

    }



    private sealed class HeaderWindow : NativeWindow

    {

        public void Attach(IntPtr header)

        {

            if (Handle == header)

            {

                return;

            }



            Detach();

            if (header != IntPtr.Zero)

            {

                AssignHandle(header);

            }

        }



        public void Detach()

        {

            if (Handle != IntPtr.Zero)

            {

                ReleaseHandle();

            }

        }

    }



    [DllImport("user32.dll", EntryPoint = "SendMessageW", CharSet = CharSet.Unicode)]

    private static extern IntPtr SendMessagePtr(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);



    [DllImport("user32.dll", EntryPoint = "SendMessageW", CharSet = CharSet.Unicode)]

    private static extern IntPtr SendMessageHitTest(IntPtr hWnd, int msg, IntPtr wParam, ref HdHitTestInfo lParam);



    [DllImport("user32.dll")]

    private static extern IntPtr WindowFromPoint(Point point);



    [DllImport("user32.dll")]

    private static extern bool ScreenToClient(IntPtr hWnd, ref NativePoint lpPoint);



    [DllImport("user32.dll")]

    private static extern bool GetClientRect(IntPtr hWnd, out NativeRect lpRect);



    [StructLayout(LayoutKind.Sequential)]

    private struct NativePoint

    {

        public int X;

        public int Y;

    }



    [StructLayout(LayoutKind.Sequential)]

    private struct NativeRect

    {

        public int Left;

        public int Top;

        public int Right;

        public int Bottom;

    }



    [StructLayout(LayoutKind.Sequential)]

    private struct HdHitTestInfo

    {

        public NativePoint Point;

        public uint Flags;

        public int Item;

    }

}

