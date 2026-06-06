using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace MyDiagramWinV10.App;

internal static class SingleInstanceMessenger
{
    private const int WmCopyData = 0x004A;
    private const int OpenProjectCopyDataId = 0x4D44;

    private static Mutex? _mutex;

    public static bool TryStartOrForward(string? projectPath)
    {
        var mutexName = $@"Local\MyDiagramWinV10.SingleInstance.{Environment.UserName}";
        _mutex = new Mutex(true, mutexName, out var createdNew);
        if (createdNew)
            return true;

        _mutex.Dispose();
        _mutex = null;

        if (!TryForwardToRunningInstance(projectPath))
            MessageBox.Show(
                "MyDiagramWinV10이 이미 실행 중입니다.",
                "MyDiagramWinV10",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);

        return false;
    }

    public static void Release()
    {
        _mutex?.ReleaseMutex();
        _mutex?.Dispose();
        _mutex = null;
    }

    public static bool TryForwardToRunningInstance(string? projectPath)
    {
        var processName = Path.GetFileNameWithoutExtension(Application.ExecutablePath);
        foreach (var process in Process.GetProcessesByName(processName))
        {
            if (process.Id == Environment.ProcessId)
                continue;

            var handle = process.MainWindowHandle;
            if (handle == IntPtr.Zero)
                continue;

            if (!string.IsNullOrWhiteSpace(projectPath))
                SendProjectPath(handle, projectPath);

            SetForegroundWindow(handle);
            if (IsIconic(handle))
                ShowWindow(handle, SwRestore);

            return true;
        }

        return false;
    }

    public static bool TryGetForwardedProjectPath(ref Message message, out string? projectPath)
    {
        projectPath = null;
        if (message.Msg != WmCopyData)
            return false;

        var data = Marshal.PtrToStructure<CopyDataStruct>(message.LParam);
        if (data.dwData != OpenProjectCopyDataId || data.lpData == IntPtr.Zero || data.cbData <= 0)
            return false;

        projectPath = Marshal.PtrToStringUni(data.lpData, data.cbData / 2 - 1);
        return !string.IsNullOrWhiteSpace(projectPath);
    }

    private static void SendProjectPath(IntPtr targetWindow, string projectPath)
    {
        var bytes = Encoding.Unicode.GetBytes(projectPath + '\0');
        var buffer = Marshal.AllocHGlobal(bytes.Length);
        try
        {
            Marshal.Copy(bytes, 0, buffer, bytes.Length);
            var data = new CopyDataStruct
            {
                dwData = OpenProjectCopyDataId,
                cbData = bytes.Length,
                lpData = buffer
            };

            var dataPtr = Marshal.AllocHGlobal(Marshal.SizeOf<CopyDataStruct>());
            try
            {
                Marshal.StructureToPtr(data, dataPtr, false);
                SendMessage(targetWindow, WmCopyData, IntPtr.Zero, dataPtr);
            }
            finally
            {
                Marshal.FreeHGlobal(dataPtr);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CopyDataStruct
    {
        public IntPtr dwData;
        public int cbData;
        public IntPtr lpData;
    }

    private const int SwRestore = 9;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
