using System.Diagnostics;
using System.Runtime.InteropServices;

namespace MemoPadV10;

/// <summary>
/// 메모 패드 프로세스와 목록(--list) 프로세스 간 실행/활성화 및 메모 열기 요청.
/// </summary>
internal static class AppIpc
{
    public const string ListArg = "--list";

    private const string ListMutexName = "Local\\MemoPadV10.List.SingleInstance";
    private const string PadMutexName = "Local\\MemoPadV10.Pad.SingleInstance";
    private const string ShowListEventName = "Local\\MemoPadV10.ShowList";
    private const string ExitListEventName = "Local\\MemoPadV10.ExitList";
    private const string OpenMemoEventName = "Local\\MemoPadV10.OpenMemo";
    private const string MemosChangedEventName = "Local\\MemoPadV10.MemosChanged";
    private const string SettingsChangedListEventName = "Local\\MemoPadV10.SettingsChanged.List";
    private const string SettingsChangedPadEventName = "Local\\MemoPadV10.SettingsChanged.Pad";
    private const string BringListFrontEventName = "Local\\MemoPadV10.BringListFront";
    private const string BringPadsFrontEventName = "Local\\MemoPadV10.BringPadsFront";
    private const string PreviewThemeListEventName = "Local\\MemoPadV10.PreviewTheme.List";
    private const string PreviewThemePadEventName = "Local\\MemoPadV10.PreviewTheme.Pad";

    /// <summary>크로스 프로세스 Activate로 인한 재진입을 짧게 무시합니다.</summary>
    private static long _ignoreActivateUntilTick;

    public static void SuppressActivateHandling(int milliseconds = 450)
    {
        _ignoreActivateUntilTick = Environment.TickCount64 + milliseconds;
    }

    public static bool ShouldIgnoreActivate() =>
        Environment.TickCount64 < _ignoreActivateUntilTick;

    public static string PendingOpenPath => AppPaths.Combine("pending-open.txt");

    public static string PendingOpenFilePath => AppPaths.Combine("pending-open-file.txt");

    public static string PreferredPadIndexPath => AppPaths.Combine("preferred-pad-index.txt");

    public static string PendingNewMemoPath => AppPaths.Combine("pending-new.txt");

    /// <summary>설정창의 실시간 색 미리보기를 다른 프로세스에 전달하는 값(ARGB)입니다.</summary>
    public static string PreviewColorPath => AppPaths.Combine("preview-color.txt");

    public static string ExePath => Environment.ProcessPath ?? Application.ExecutablePath;

    public static Mutex? TryAcquireListMutex(out bool createdNew)
    {
        Mutex mutex = new(true, ListMutexName, out createdNew);
        if (!createdNew)
        {
            mutex.Dispose();
            return null;
        }

        return mutex;
    }

    public static Mutex? TryAcquirePadMutex(out bool createdNew)
    {
        Mutex mutex = new(true, PadMutexName, out createdNew);
        if (!createdNew)
        {
            mutex.Dispose();
            return null;
        }

        return mutex;
    }

    /// <summary>목록 앱을 실행하거나, 이미 있으면 앞으로 가져옵니다.</summary>
    public static void LaunchOrShowList()
    {
        try
        {
            using EventWaitHandle show = EventWaitHandle.OpenExisting(ShowListEventName);
            show.Set();
            return;
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            // 목록 프로세스가 없음 → 새로 실행
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = ExePath,
            Arguments = ListArg,
            UseShellExecute = true
        });
    }

    public static void SignalShowList()
    {
        try
        {
            using EventWaitHandle show = EventWaitHandle.OpenExisting(ShowListEventName);
            show.Set();
        }
        catch (WaitHandleCannotBeOpenedException)
        {
        }
    }

    public static EventWaitHandle CreateShowListEvent() =>
        new(false, EventResetMode.AutoReset, ShowListEventName);

    public static EventWaitHandle CreateExitListEvent() =>
        new(false, EventResetMode.AutoReset, ExitListEventName);

    public static EventWaitHandle CreateOpenMemoEvent() =>
        new(false, EventResetMode.AutoReset, OpenMemoEventName);

    public static EventWaitHandle CreateMemosChangedEvent() =>
        new(false, EventResetMode.AutoReset, MemosChangedEventName);

    public static EventWaitHandle CreateSettingsChangedListEvent() =>
        new(false, EventResetMode.AutoReset, SettingsChangedListEventName);

    public static EventWaitHandle CreateSettingsChangedPadEvent() =>
        new(false, EventResetMode.AutoReset, SettingsChangedPadEventName);

    public static EventWaitHandle CreateBringListFrontEvent() =>
        new(false, EventResetMode.AutoReset, BringListFrontEventName);

    public static EventWaitHandle CreateBringPadsFrontEvent() =>
        new(false, EventResetMode.AutoReset, BringPadsFrontEventName);

    public static EventWaitHandle CreatePreviewThemeListEvent() =>
        new(false, EventResetMode.AutoReset, PreviewThemeListEventName);

    public static EventWaitHandle CreatePreviewThemePadEvent() =>
        new(false, EventResetMode.AutoReset, PreviewThemePadEventName);

    public static void NotifyBringListToFront()
    {
        try
        {
            using EventWaitHandle ev = EventWaitHandle.OpenExisting(BringListFrontEventName);
            ev.Set();
        }
        catch (WaitHandleCannotBeOpenedException)
        {
        }
    }

    public static void NotifyBringPadsToFront()
    {
        try
        {
            using EventWaitHandle ev = EventWaitHandle.OpenExisting(BringPadsFrontEventName);
            ev.Set();
        }
        catch (WaitHandleCannotBeOpenedException)
        {
        }
    }

    /// <summary>목록에서 선택한 카드와 매칭되는 메모 창에 포커스하기 위한 인덱스 기억.</summary>
    public static void RememberPreferredPadIndex(int index)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(PreferredPadIndexPath)!);
            File.WriteAllText(PreferredPadIndexPath, index.ToString());
        }
        catch
        {
            // ignore
        }
    }

    public static bool TryPeekPreferredPadIndex(out int index)
    {
        index = -1;
        try
        {
            if (!File.Exists(PreferredPadIndexPath))
            {
                return false;
            }

            string text = File.ReadAllText(PreferredPadIndexPath).Trim();
            return int.TryParse(text, out index) && index >= 0;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>목록 창에 메모 파일 변경을 알려 즉시 새로고침하게 합니다.</summary>
    public static void NotifyMemosChanged()
    {
        try
        {
            using EventWaitHandle changed = EventWaitHandle.OpenExisting(MemosChangedEventName);
            changed.Set();
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            // 목록 프로세스가 없으면 무시합니다.
        }
    }

    /// <summary>설정 저장 후 목록 창만 갱신하도록 알립니다.</summary>
    public static void NotifyListSettingsChanged()
    {
        try
        {
            using EventWaitHandle list = EventWaitHandle.OpenExisting(SettingsChangedListEventName);
            list.Set();
        }
        catch (WaitHandleCannotBeOpenedException)
        {
        }
    }

    /// <summary>설정 저장 후 메모 패드 창들만 갱신하도록 알립니다.</summary>
    public static void NotifyPadSettingsChanged()
    {
        try
        {
            using EventWaitHandle pad = EventWaitHandle.OpenExisting(SettingsChangedPadEventName);
            pad.Set();
        }
        catch (WaitHandleCannotBeOpenedException)
        {
        }
    }

    /// <summary>실시간 색 미리보기를 목록 프로세스에 전달합니다(저장 없음).</summary>
    public static void NotifyListPreviewColor(Color color) =>
        SendPreviewColor(color, PreviewThemeListEventName);

    /// <summary>실시간 색 미리보기를 메모 패드 프로세스에 전달합니다(저장 없음).</summary>
    public static void NotifyPadPreviewColor(Color color) =>
        SendPreviewColor(color, PreviewThemePadEventName);

    private static void SendPreviewColor(Color color, string eventName)
    {
        try
        {
            string? dir = Path.GetDirectoryName(PreviewColorPath);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                Directory.CreateDirectory(dir);
            }

            File.WriteAllText(PreviewColorPath, color.ToArgb().ToString());
        }
        catch
        {
            // 미리보기 값 전달 실패는 무시합니다.
        }

        try
        {
            using EventWaitHandle ev = EventWaitHandle.OpenExisting(eventName);
            ev.Set();
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            // 대상 프로세스가 없으면 무시합니다.
        }
    }

    public static bool TryReadPreviewColor(out Color color)
    {
        color = Color.Empty;
        try
        {
            if (!File.Exists(PreviewColorPath))
            {
                return false;
            }

            string text = File.ReadAllText(PreviewColorPath).Trim();
            if (int.TryParse(text, out int argb))
            {
                color = Color.FromArgb(argb);
                return true;
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>서로 다른 pending 요청이 섞이지 않도록 정리합니다.</summary>
    private static void ClearPendingExcept(string? keepPath)
    {
        string[] paths =
        [
            PendingOpenPath,
            PendingOpenFilePath,
            PendingNewMemoPath
        ];
        foreach (string path in paths)
        {
            if (keepPath is not null
                && string.Equals(path, keepPath, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch
            {
                // ignore
            }
        }
    }

    /// <summary>빈 새 메모 창을 열도록 패드에 요청합니다.</summary>
    public static void RequestNewMemo()
    {
        string? dir = Path.GetDirectoryName(PendingNewMemoPath);
        if (!string.IsNullOrWhiteSpace(dir))
        {
            Directory.CreateDirectory(dir);
        }

        ClearPendingExcept(PendingNewMemoPath);
        File.WriteAllText(PendingNewMemoPath, "1");

        if (Mutex.TryOpenExisting(PadMutexName, out Mutex? existing))
        {
            existing.Dispose();
            try
            {
                using EventWaitHandle open = EventWaitHandle.OpenExisting(OpenMemoEventName);
                open.Set();
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = ExePath,
                    Arguments = "--new",
                    UseShellExecute = true
                });
            }

            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = ExePath,
            Arguments = "--new",
            UseShellExecute = true
        });
    }

    public static bool TryConsumePendingNewMemo()
    {
        try
        {
            if (!File.Exists(PendingNewMemoPath))
            {
                return false;
            }

            File.Delete(PendingNewMemoPath);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>패드에 외부 텍스트/RTF 파일 열기 요청.</summary>
    public static void RequestOpenTextFile(string filePath)
    {
        string? dir = Path.GetDirectoryName(PendingOpenFilePath);
        if (!string.IsNullOrWhiteSpace(dir))
        {
            Directory.CreateDirectory(dir);
        }

        ClearPendingExcept(PendingOpenFilePath);
        File.WriteAllText(PendingOpenFilePath, filePath);

        if (Mutex.TryOpenExisting(PadMutexName, out Mutex? existing))
        {
            existing.Dispose();
            try
            {
                using EventWaitHandle open = EventWaitHandle.OpenExisting(OpenMemoEventName);
                open.Set();
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = ExePath,
                    Arguments = $"--open-file \"{filePath}\"",
                    UseShellExecute = true
                });
            }

            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = ExePath,
            Arguments = $"--open-file \"{filePath}\"",
            UseShellExecute = true
        });
    }

    /// <summary>패드에 메모 열기 요청. 패드가 없으면 새로 시작합니다.</summary>
    public static void RequestOpenMemo(int index)
    {
        string? dir = Path.GetDirectoryName(PendingOpenPath);
        if (!string.IsNullOrWhiteSpace(dir))
        {
            Directory.CreateDirectory(dir);
        }

        if (Mutex.TryOpenExisting(PadMutexName, out Mutex? existing))
        {
            existing.Dispose();
            ClearPendingExcept(PendingOpenPath);
            File.WriteAllText(PendingOpenPath, index.ToString());
            try
            {
                using EventWaitHandle open = EventWaitHandle.OpenExisting(OpenMemoEventName);
                open.Set();
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                // 패드는 떠 있으나 수신 이벤트가 아직 없으면, 다음 시작 인자로 넘깁니다.
                Process.Start(new ProcessStartInfo
                {
                    FileName = ExePath,
                    Arguments = $"--open-index {index}",
                    UseShellExecute = true
                });
            }

            return;
        }

        try
        {
            if (File.Exists(PendingOpenPath))
            {
                File.Delete(PendingOpenPath);
            }
        }
        catch
        {
            // ignore
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = ExePath,
            Arguments = $"--open-index {index}",
            UseShellExecute = true
        });
    }

    /// <summary>패드 종료 시 목록 프로세스도 같이 닫히도록 신호합니다.</summary>
    public static void SignalExitList()
    {
        try
        {
            using EventWaitHandle exit = EventWaitHandle.OpenExisting(ExitListEventName);
            exit.Set();
        }
        catch (WaitHandleCannotBeOpenedException)
        {
        }
    }

    public static bool TryReadPendingOpenIndex(out int index)
    {
        index = -1;
        try
        {
            if (!File.Exists(PendingOpenPath))
            {
                return false;
            }

            string text = File.ReadAllText(PendingOpenPath).Trim();
            File.Delete(PendingOpenPath);
            return int.TryParse(text, out index) && index >= 0;
        }
        catch
        {
            return false;
        }
    }

    public static bool TryReadPendingOpenFilePath(out string filePath)
    {
        filePath = string.Empty;
        try
        {
            if (!File.Exists(PendingOpenFilePath))
            {
                return false;
            }

            string text = File.ReadAllText(PendingOpenFilePath).Trim().Trim('"');
            File.Delete(PendingOpenFilePath);
            if (string.IsNullOrWhiteSpace(text) || !File.Exists(text))
            {
                return false;
            }

            filePath = text;
            return true;
        }
        catch
        {
            return false;
        }
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    private const int SwRestore = 9;

    /// <param name="restoreIfHidden">
    /// false면 사용자가 닫아 숨긴 창을 다시 Show하지 않습니다(동반 포그라운드용).
    /// </param>
    public static void ActivateWindow(Form form, bool setForeground = true, bool restoreIfHidden = true)
    {
        if (form.IsDisposed)
        {
            return;
        }

        if (!form.Visible)
        {
            if (!restoreIfHidden)
            {
                return;
            }

            form.Show();
        }

        if (form.WindowState == FormWindowState.Minimized)
        {
            form.WindowState = FormWindowState.Normal;
        }

        form.BringToFront();
        if (setForeground)
        {
            form.Activate();
            if (form.IsHandleCreated)
            {
                ShowWindow(form.Handle, SwRestore);
                SetForegroundWindow(form.Handle);
            }
        }
        else if (form.IsHandleCreated && form.Visible)
        {
            // SW_SHOWNOACTIVATE (4) — 숨기지 않은 창만 Z-order만 올림
            ShowWindow(form.Handle, 4);
        }
    }
}
