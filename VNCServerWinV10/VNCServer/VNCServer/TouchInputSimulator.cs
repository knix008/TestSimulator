using System.Runtime.InteropServices;

namespace VNCServer.VNCServer;

/// <summary>
/// Windows 터치 입력 시뮬레이터
/// 멀티터치 제스처 지원 (탭, 드래그, 핀치, 회전 등)
/// </summary>
public class TouchInputSimulator
{
    private const int MAX_TOUCH_POINTS = 10;
    private readonly Dictionary<int, TouchPoint> _activeTouches;

    public event EventHandler<TouchEventArgs>? TouchDown;
    public event EventHandler<TouchEventArgs>? TouchMove;
    public event EventHandler<TouchEventArgs>? TouchUp;

    public class TouchPoint
    {
        public int Id { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int Pressure { get; set; } = 512;  // 0-1024
        public DateTime Timestamp { get; set; }
    }

    public class TouchEventArgs : EventArgs
    {
        public TouchPoint Touch { get; set; } = new TouchPoint();
        public List<TouchPoint> AllTouches { get; set; } = new List<TouchPoint>();
    }

    public TouchInputSimulator()
    {
        _activeTouches = new Dictionary<int, TouchPoint>();
    }

    /// <summary>
    /// 터치 다운 (손가락 화면에 닿음)
    /// </summary>
    public void SimulateTouchDown(int touchId, int x, int y, int pressure = 512)
    {
        var touch = new TouchPoint
        {
            Id = touchId,
            X = x,
            Y = y,
            Pressure = pressure,
            Timestamp = DateTime.Now
        };

        _activeTouches[touchId] = touch;

        // Windows Touch API 호출
        SendTouchInput(touch, TOUCH_FLAG.DOWN);

        TouchDown?.Invoke(this, new TouchEventArgs 
        { 
            Touch = touch, 
            AllTouches = _activeTouches.Values.ToList() 
        });
    }

    /// <summary>
    /// 터치 이동 (손가락 움직임)
    /// </summary>
    public void SimulateTouchMove(int touchId, int x, int y, int pressure = 512)
    {
        if (!_activeTouches.ContainsKey(touchId))
        {
            // 터치가 활성화되지 않았으면 다운 이벤트 먼저 발생
            SimulateTouchDown(touchId, x, y, pressure);
            return;
        }

        var touch = _activeTouches[touchId];
        touch.X = x;
        touch.Y = y;
        touch.Pressure = pressure;
        touch.Timestamp = DateTime.Now;

        SendTouchInput(touch, TOUCH_FLAG.MOVE);

        TouchMove?.Invoke(this, new TouchEventArgs 
        { 
            Touch = touch, 
            AllTouches = _activeTouches.Values.ToList() 
        });
    }

    /// <summary>
    /// 터치 업 (손가락 떼기)
    /// </summary>
    public void SimulateTouchUp(int touchId)
    {
        if (!_activeTouches.TryGetValue(touchId, out var touch))
            return;

        SendTouchInput(touch, TOUCH_FLAG.UP);

        TouchUp?.Invoke(this, new TouchEventArgs 
        { 
            Touch = touch, 
            AllTouches = _activeTouches.Values.ToList() 
        });

        _activeTouches.Remove(touchId);
    }

    /// <summary>
    /// 모든 활성 터치 해제
    /// </summary>
    public void ReleaseAllTouches()
    {
        var touchIds = _activeTouches.Keys.ToList();
        foreach (var id in touchIds)
        {
            SimulateTouchUp(id);
        }
    }

    /// <summary>
    /// 탭 제스처 (빠르게 터치 후 떼기)
    /// </summary>
    public void SimulateTap(int x, int y, int duration = 50)
    {
        SimulateTouchDown(0, x, y);
        Thread.Sleep(duration);
        SimulateTouchUp(0);
    }

    /// <summary>
    /// 더블 탭 제스처
    /// </summary>
    public void SimulateDoubleTap(int x, int y)
    {
        SimulateTap(x, y, 50);
        Thread.Sleep(100);
        SimulateTap(x, y, 50);
    }

    /// <summary>
    /// 롱 프레스 제스처
    /// </summary>
    public void SimulateLongPress(int x, int y, int duration = 500)
    {
        SimulateTouchDown(0, x, y);
        Thread.Sleep(duration);
        SimulateTouchUp(0);
    }

    /// <summary>
    /// 스와이프 제스처
    /// </summary>
    public void SimulateSwipe(int startX, int startY, int endX, int endY, int duration = 300)
    {
        SimulateTouchDown(0, startX, startY);
        
        int steps = duration / 16; // ~60fps
        for (int i = 1; i <= steps; i++)
        {
            float progress = (float)i / steps;
            int x = (int)(startX + (endX - startX) * progress);
            int y = (int)(startY + (endY - startY) * progress);
            
            SimulateTouchMove(0, x, y);
            Thread.Sleep(16);
        }
        
        SimulateTouchUp(0);
    }

    /// <summary>
    /// 핀치 제스처 (확대/축소)
    /// </summary>
    public void SimulatePinch(int centerX, int centerY, int startDistance, int endDistance, int duration = 500)
    {
        // 두 손가락 터치
        int touch1X = centerX - startDistance / 2;
        int touch1Y = centerY;
        int touch2X = centerX + startDistance / 2;
        int touch2Y = centerY;

        SimulateTouchDown(0, touch1X, touch1Y);
        SimulateTouchDown(1, touch2X, touch2Y);

        int steps = duration / 16;
        for (int i = 1; i <= steps; i++)
        {
            float progress = (float)i / steps;
            int currentDistance = (int)(startDistance + (endDistance - startDistance) * progress);
            
            touch1X = centerX - currentDistance / 2;
            touch2X = centerX + currentDistance / 2;
            
            SimulateTouchMove(0, touch1X, touch1Y);
            SimulateTouchMove(1, touch2X, touch2Y);
            Thread.Sleep(16);
        }

        SimulateTouchUp(0);
        SimulateTouchUp(1);
    }

    /// <summary>
    /// 회전 제스처
    /// </summary>
    public void SimulateRotate(int centerX, int centerY, float startAngle, float endAngle, int radius = 100, int duration = 500)
    {
        // 두 손가락으로 회전
        float startAngle1 = startAngle;
        float startAngle2 = startAngle + MathF.PI;
        float endAngle1 = endAngle;
        float endAngle2 = endAngle + MathF.PI;

        int touch1X = centerX + (int)(radius * MathF.Cos(startAngle1));
        int touch1Y = centerY + (int)(radius * MathF.Sin(startAngle1));
        int touch2X = centerX + (int)(radius * MathF.Cos(startAngle2));
        int touch2Y = centerY + (int)(radius * MathF.Sin(startAngle2));

        SimulateTouchDown(0, touch1X, touch1Y);
        SimulateTouchDown(1, touch2X, touch2Y);

        int steps = duration / 16;
        for (int i = 1; i <= steps; i++)
        {
            float progress = (float)i / steps;
            float currentAngle1 = startAngle1 + (endAngle1 - startAngle1) * progress;
            float currentAngle2 = startAngle2 + (endAngle2 - startAngle2) * progress;

            touch1X = centerX + (int)(radius * MathF.Cos(currentAngle1));
            touch1Y = centerY + (int)(radius * MathF.Sin(currentAngle1));
            touch2X = centerX + (int)(radius * MathF.Cos(currentAngle2));
            touch2Y = centerY + (int)(radius * MathF.Sin(currentAngle2));

            SimulateTouchMove(0, touch1X, touch1Y);
            SimulateTouchMove(1, touch2X, touch2Y);
            Thread.Sleep(16);
        }

        SimulateTouchUp(0);
        SimulateTouchUp(1);
    }

    #region Windows Touch API

    [Flags]
    private enum TOUCH_FLAG : uint
    {
        DOWN = 0x0001,
        MOVE = 0x0002,
        UP = 0x0004
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINTER_TOUCH_INFO
    {
        public POINTER_INFO pointerInfo;
        public TOUCH_FLAGS touchFlags;
        public TOUCH_MASK touchMask;
        public RECT rcContact;
        public RECT rcContactRaw;
        public uint orientation;
        public uint pressure;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINTER_INFO
    {
        public POINTER_INPUT_TYPE pointerType;
        public uint pointerId;
        public uint frameId;
        public POINTER_FLAGS pointerFlags;
        public IntPtr sourceDevice;
        public IntPtr hwndTarget;
        public POINT ptPixelLocation;
        public POINT ptHimetricLocation;
        public POINT ptPixelLocationRaw;
        public POINT ptHimetricLocationRaw;
        public uint dwTime;
        public uint historyCount;
        public int inputData;
        public uint dwKeyStates;
        public ulong PerformanceCount;
        public POINTER_BUTTON_CHANGE_TYPE ButtonChangeType;
    }

    private enum POINTER_INPUT_TYPE
    {
        POINTER = 1,
        TOUCH = 2,
        PEN = 3,
        MOUSE = 4
    }

    [Flags]
    private enum POINTER_FLAGS : uint
    {
        NONE = 0x00000000,
        NEW = 0x00000001,
        INRANGE = 0x00000002,
        INCONTACT = 0x00000004,
        FIRSTBUTTON = 0x00000010,
        SECONDBUTTON = 0x00000020,
        THIRDBUTTON = 0x00000040,
        FOURTHBUTTON = 0x00000080,
        FIFTHBUTTON = 0x00000100,
        PRIMARY = 0x00002000,
        CONFIDENCE = 0x00004000,
        CANCELED = 0x00008000,
        DOWN = 0x00010000,
        UPDATE = 0x00020000,
        UP = 0x00040000
    }

    [Flags]
    private enum TOUCH_FLAGS : uint
    {
        NONE = 0x00000000
    }

    [Flags]
    private enum TOUCH_MASK : uint
    {
        NONE = 0x00000000,
        CONTACTAREA = 0x00000001,
        ORIENTATION = 0x00000002,
        PRESSURE = 0x00000004
    }

    private enum POINTER_BUTTON_CHANGE_TYPE
    {
        NONE = 0,
        FIRSTBUTTON_DOWN = 1,
        FIRSTBUTTON_UP = 2
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int left;
        public int top;
        public int right;
        public int bottom;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool InitializeTouchInjection(uint maxCount = 10, uint dwMode = 1);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool InjectTouchInput(uint count, [In] POINTER_TOUCH_INFO[] contacts);

    private static bool _touchInitialized = false;

    private void SendTouchInput(TouchPoint touch, TOUCH_FLAG flag)
    {
        try
        {
            if (!_touchInitialized)
            {
                _touchInitialized = InitializeTouchInjection(MAX_TOUCH_POINTS, 1);
                if (!_touchInitialized)
                {
                    Console.WriteLine("Failed to initialize touch injection");
                    return;
                }
            }

            var pointerFlags = POINTER_FLAGS.INRANGE | POINTER_FLAGS.INCONTACT;
            
            if (flag == TOUCH_FLAG.DOWN)
                pointerFlags |= POINTER_FLAGS.DOWN | POINTER_FLAGS.NEW;
            else if (flag == TOUCH_FLAG.MOVE)
                pointerFlags |= POINTER_FLAGS.UPDATE;
            else if (flag == TOUCH_FLAG.UP)
                pointerFlags |= POINTER_FLAGS.UP;

            var touchInfo = new POINTER_TOUCH_INFO
            {
                pointerInfo = new POINTER_INFO
                {
                    pointerType = POINTER_INPUT_TYPE.TOUCH,
                    pointerId = (uint)touch.Id,
                    pointerFlags = pointerFlags,
                    ptPixelLocation = new POINT { x = touch.X, y = touch.Y }
                },
                touchFlags = TOUCH_FLAGS.NONE,
                touchMask = TOUCH_MASK.CONTACTAREA | TOUCH_MASK.PRESSURE,
                pressure = (uint)touch.Pressure,
                rcContact = new RECT
                {
                    left = touch.X - 2,
                    top = touch.Y - 2,
                    right = touch.X + 2,
                    bottom = touch.Y + 2
                }
            };

            InjectTouchInput(1, new[] { touchInfo });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Touch injection error: {ex.Message}");
        }
    }

    #endregion

    /// <summary>
    /// 활성 터치 포인트 수
    /// </summary>
    public int ActiveTouchCount => _activeTouches.Count;

    /// <summary>
    /// 터치 지원 여부 확인
    /// </summary>
    public static bool IsTouchSupported()
    {
        return GetSystemMetrics(SM_DIGITIZER) != 0;
    }

    /// <summary>
    /// 최대 터치 포인트 수
    /// </summary>
    public static int GetMaxTouchPoints()
    {
        return GetSystemMetrics(SM_MAXIMUMTOUCHES);
    }

    private const int SM_DIGITIZER = 94;
    private const int SM_MAXIMUMTOUCHES = 95;

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);
}
