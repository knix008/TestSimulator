using System.Drawing;
using System.Runtime.InteropServices;

namespace VNCServer.VNCServer;

/// <summary>
/// 다중 모니터 관리 및 개별 선택
/// </summary>
public class MultiMonitorManager
{
    private List<MonitorInfo> _monitors = new List<MonitorInfo>();

    public class MonitorInfo
    {
        public int Index { get; set; }
        public string DeviceName { get; set; } = string.Empty;
        public Rectangle Bounds { get; set; }
        public Rectangle WorkingArea { get; set; }
        public bool IsPrimary { get; set; }
        public int BitsPerPixel { get; set; }
        public string FriendlyName { get; set; } = string.Empty;

        public override string ToString()
        {
            var primary = IsPrimary ? " (주 모니터)" : "";
            return $"{FriendlyName}{primary} - {Bounds.Width}x{Bounds.Height} @ ({Bounds.X}, {Bounds.Y})";
        }
    }

    public MultiMonitorManager()
    {
        RefreshMonitors();
    }

    /// <summary>
    /// 모니터 목록 새로고침
    /// </summary>
    public void RefreshMonitors()
    {
        _monitors.Clear();
        int index = 0;

        foreach (var screen in Screen.AllScreens)
        {
            var monitor = new MonitorInfo
            {
                Index = index++,
                DeviceName = screen.DeviceName,
                Bounds = screen.Bounds,
                WorkingArea = screen.WorkingArea,
                IsPrimary = screen.Primary,
                BitsPerPixel = screen.BitsPerPixel,
                FriendlyName = GetFriendlyName(screen, index)
            };

            _monitors.Add(monitor);
        }
    }

    /// <summary>
    /// 친숙한 모니터 이름 생성
    /// </summary>
    private string GetFriendlyName(Screen screen, int index)
    {
        if (screen.Primary)
            return $"모니터 {index}: 주 디스플레이";
        
        return $"모니터 {index}";
    }

    /// <summary>
    /// 모든 모니터 목록
    /// </summary>
    public List<MonitorInfo> GetMonitors()
    {
        return new List<MonitorInfo>(_monitors);
    }

    /// <summary>
    /// 주 모니터
    /// </summary>
    public MonitorInfo? GetPrimaryMonitor()
    {
        return _monitors.FirstOrDefault(m => m.IsPrimary);
    }

    /// <summary>
    /// 인덱스로 모니터 가져오기
    /// </summary>
    public MonitorInfo? GetMonitor(int index)
    {
        return _monitors.FirstOrDefault(m => m.Index == index);
    }

    /// <summary>
    /// 특정 모니터 화면 캡처
    /// </summary>
    public Bitmap CaptureMonitor(int monitorIndex)
    {
        var monitor = GetMonitor(monitorIndex);
        if (monitor == null)
            throw new ArgumentException($"Monitor {monitorIndex} not found");

        return CaptureMonitor(monitor);
    }

    /// <summary>
    /// 특정 모니터 화면 캡처
    /// </summary>
    public Bitmap CaptureMonitor(MonitorInfo monitor)
    {
        var bitmap = new Bitmap(monitor.Bounds.Width, monitor.Bounds.Height);
        
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(
                monitor.Bounds.X,
                monitor.Bounds.Y,
                0, 0,
                monitor.Bounds.Size,
                CopyPixelOperation.SourceCopy
            );
        }

        return bitmap;
    }

    /// <summary>
    /// 모든 모니터를 하나의 이미지로 캡처
    /// </summary>
    public Bitmap CaptureAllMonitors()
    {
        // 전체 가상 화면 크기 계산
        var minX = _monitors.Min(m => m.Bounds.X);
        var minY = _monitors.Min(m => m.Bounds.Y);
        var maxX = _monitors.Max(m => m.Bounds.X + m.Bounds.Width);
        var maxY = _monitors.Max(m => m.Bounds.Y + m.Bounds.Height);

        var totalWidth = maxX - minX;
        var totalHeight = maxY - minY;

        var bitmap = new Bitmap(totalWidth, totalHeight);
        
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(
                minX, minY,
                0, 0,
                new Size(totalWidth, totalHeight),
                CopyPixelOperation.SourceCopy
            );
        }

        return bitmap;
    }

    /// <summary>
    /// 특정 모니터를 가상 화면 좌표로 변환
    /// </summary>
    public Rectangle GetVirtualScreenBounds(int monitorIndex)
    {
        var monitor = GetMonitor(monitorIndex);
        if (monitor == null)
            return Rectangle.Empty;

        return monitor.Bounds;
    }

    /// <summary>
    /// 마우스 위치를 특정 모니터 로컬 좌표로 변환
    /// </summary>
    public Point GlobalToMonitorLocal(Point globalPoint, int monitorIndex)
    {
        var monitor = GetMonitor(monitorIndex);
        if (monitor == null)
            return globalPoint;

        return new Point(
            globalPoint.X - monitor.Bounds.X,
            globalPoint.Y - monitor.Bounds.Y
        );
    }

    /// <summary>
    /// 모니터 로컬 좌표를 전역 좌표로 변환
    /// </summary>
    public Point MonitorLocalToGlobal(Point localPoint, int monitorIndex)
    {
        var monitor = GetMonitor(monitorIndex);
        if (monitor == null)
            return localPoint;

        return new Point(
            localPoint.X + monitor.Bounds.X,
            localPoint.Y + monitor.Bounds.Y
        );
    }

    /// <summary>
    /// 특정 점이 어느 모니터에 있는지 확인
    /// </summary>
    public MonitorInfo? GetMonitorFromPoint(Point globalPoint)
    {
        return _monitors.FirstOrDefault(m => m.Bounds.Contains(globalPoint));
    }

    /// <summary>
    /// 모니터 정보 요약
    /// </summary>
    public string GetMonitorsSummary()
    {
        var summary = $"총 {_monitors.Count}개 모니터:\n";
        
        foreach (var monitor in _monitors)
        {
            summary += $"  - {monitor}\n";
        }

        return summary;
    }

    /// <summary>
    /// 모니터 레이아웃 시각화 (ASCII 아트)
    /// </summary>
    public string VisualizeLayout()
    {
        if (_monitors.Count == 0)
            return "모니터 없음";

        var minX = _monitors.Min(m => m.Bounds.X);
        var minY = _monitors.Min(m => m.Bounds.Y);
        var maxX = _monitors.Max(m => m.Bounds.X + m.Bounds.Width);
        var maxY = _monitors.Max(m => m.Bounds.Y + m.Bounds.Height);

        var totalWidth = maxX - minX;
        var totalHeight = maxY - minY;

        var result = "모니터 레이아웃:\n";
        result += $"전체 크기: {totalWidth}x{totalHeight}\n\n";

        foreach (var monitor in _monitors)
        {
            var relX = monitor.Bounds.X - minX;
            var relY = monitor.Bounds.Y - minY;
            
            result += $"[{monitor.Index}] {monitor.FriendlyName}\n";
            result += $"    위치: ({relX}, {relY})\n";
            result += $"    크기: {monitor.Bounds.Width}x{monitor.Bounds.Height}\n";
            result += $"    색 심도: {monitor.BitsPerPixel} bits\n";
            result += "\n";
        }

        return result;
    }

    /// <summary>
    /// 모니터 개수
    /// </summary>
    public int MonitorCount => _monitors.Count;

    /// <summary>
    /// 다중 모니터 구성 여부
    /// </summary>
    public bool IsMultiMonitor => _monitors.Count > 1;
}

/// <summary>
/// 모니터 선택 설정
/// </summary>
public class MonitorCaptureSettings
{
    public MonitorCaptureMode Mode { get; set; } = MonitorCaptureMode.AllMonitors;
    public int SelectedMonitorIndex { get; set; } = 0;
    public List<int> SelectedMonitors { get; set; } = new List<int>();

    public enum MonitorCaptureMode
    {
        AllMonitors,        // 모든 모니터 (가상 화면)
        PrimaryMonitor,     // 주 모니터만
        SpecificMonitor,    // 특정 모니터 1개
        MultipleMonitors    // 여러 모니터 선택
    }
}

/// <summary>
/// 모니터별 캡처 관리자
/// </summary>
public class MonitorCaptureManager
{
    private readonly MultiMonitorManager _monitorManager;
    private MonitorCaptureSettings _settings;

    public MonitorCaptureManager()
    {
        _monitorManager = new MultiMonitorManager();
        _settings = new MonitorCaptureSettings();
    }

    public MultiMonitorManager MonitorManager => _monitorManager;
    public MonitorCaptureSettings Settings
    {
        get => _settings;
        set => _settings = value;
    }

    /// <summary>
    /// 현재 설정에 따라 화면 캡처
    /// </summary>
    public Bitmap CaptureScreen()
    {
        switch (_settings.Mode)
        {
            case MonitorCaptureSettings.MonitorCaptureMode.AllMonitors:
                return _monitorManager.CaptureAllMonitors();

            case MonitorCaptureSettings.MonitorCaptureMode.PrimaryMonitor:
                var primary = _monitorManager.GetPrimaryMonitor();
                if (primary != null)
                    return _monitorManager.CaptureMonitor(primary);
                return _monitorManager.CaptureAllMonitors();

            case MonitorCaptureSettings.MonitorCaptureMode.SpecificMonitor:
                return _monitorManager.CaptureMonitor(_settings.SelectedMonitorIndex);

            case MonitorCaptureSettings.MonitorCaptureMode.MultipleMonitors:
                return CaptureMultipleMonitors(_settings.SelectedMonitors);

            default:
                return _monitorManager.CaptureAllMonitors();
        }
    }

    /// <summary>
    /// 여러 모니터를 하나의 이미지로 합성
    /// </summary>
    private Bitmap CaptureMultipleMonitors(List<int> monitorIndices)
    {
        if (monitorIndices.Count == 0)
            return _monitorManager.CaptureAllMonitors();

        var monitors = monitorIndices
            .Select(i => _monitorManager.GetMonitor(i))
            .Where(m => m != null)
            .ToList();

        if (monitors.Count == 0)
            return _monitorManager.CaptureAllMonitors();

        // 선택된 모니터들의 경계 계산
        var minX = monitors.Min(m => m!.Bounds.X);
        var minY = monitors.Min(m => m!.Bounds.Y);
        var maxX = monitors.Max(m => m!.Bounds.X + m.Bounds.Width);
        var maxY = monitors.Max(m => m!.Bounds.Y + m.Bounds.Height);

        var totalWidth = maxX - minX;
        var totalHeight = maxY - minY;

        var bitmap = new Bitmap(totalWidth, totalHeight);
        
        using (var graphics = Graphics.FromImage(bitmap))
        {
            // 검은 배경
            graphics.Clear(Color.Black);

            // 각 모니터 캡처
            foreach (var monitor in monitors)
            {
                if (monitor == null) continue;

                using (var monitorBitmap = _monitorManager.CaptureMonitor(monitor))
                {
                    var destX = monitor.Bounds.X - minX;
                    var destY = monitor.Bounds.Y - minY;
                    graphics.DrawImage(monitorBitmap, destX, destY);
                }
            }
        }

        return bitmap;
    }

    /// <summary>
    /// 캡처 영역 정보
    /// </summary>
    public Rectangle GetCaptureArea()
    {
        switch (_settings.Mode)
        {
            case MonitorCaptureSettings.MonitorCaptureMode.AllMonitors:
                return SystemInformation.VirtualScreen;

            case MonitorCaptureSettings.MonitorCaptureMode.PrimaryMonitor:
                var primary = _monitorManager.GetPrimaryMonitor();
                return primary?.Bounds ?? Rectangle.Empty;

            case MonitorCaptureSettings.MonitorCaptureMode.SpecificMonitor:
                var monitor = _monitorManager.GetMonitor(_settings.SelectedMonitorIndex);
                return monitor?.Bounds ?? Rectangle.Empty;

            default:
                return SystemInformation.VirtualScreen;
        }
    }
}
