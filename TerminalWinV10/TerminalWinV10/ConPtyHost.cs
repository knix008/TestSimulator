using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace TerminalWinV10
{
    /// <summary>
    /// Windows ConPTY 기반 로컬 셸 — Microsoft Console-Docs 파이프 규약 준수.
    /// </summary>
    internal sealed class ConPtyHost : IDisposable
    {
        private const int ProcThreadAttributePseudoConsole = 0x00020016;
        private const uint ExtendedStartupinfoPresent = 0x00080000;
        private const uint HandleFlagInherit = 0x00000001;

        private IntPtr _pseudoConsole = IntPtr.Zero;
        private IntPtr _processHandle = IntPtr.Zero;
        private FileStream? _inputStream;
        private FileStream? _outputStream;
        private CancellationTokenSource? _readCts;
        private bool _disposed;
        private bool _stopRequested;

        public event Action<string>? OutputReceived;
        public event Action? SessionEnded;
        public bool IsRunning { get; private set; }

        public static bool IsSupported =>
            Environment.OSVersion.Platform == PlatformID.Win32NT &&
            Environment.OSVersion.Version.Build >= 17763;

        public void Start(string executable, string arguments, string workingDirectory, int columns, int rows)
        {
            if (!IsSupported)
                throw new PlatformNotSupportedException("ConPTY requires Windows 10 1809 or later.");

            if (IsRunning)
                Stop();

            _stopRequested = false;

            // Host writes to inputWrite, reads from outputRead.
            // CreatePseudoConsole receives inputRead + outputWrite (MS Console-Docs).
            var inputRead = IntPtr.Zero;
            var inputWrite = IntPtr.Zero;
            var outputRead = IntPtr.Zero;
            var outputWrite = IntPtr.Zero;

            try
            {
                if (!CreatePipe(out inputRead, out inputWrite, IntPtr.Zero, 0))
                    throw new InvalidOperationException($"CreatePipe(input) failed: {Marshal.GetLastWin32Error()}");
                if (!CreatePipe(out outputRead, out outputWrite, IntPtr.Zero, 0))
                    throw new InvalidOperationException($"CreatePipe(output) failed: {Marshal.GetLastWin32Error()}");

                SetHandleInherit(inputRead, false);
                SetHandleInherit(outputWrite, false);

                var size = new COORD { X = ToConsoleSize(columns), Y = ToConsoleSize(rows) };
                var hr = CreatePseudoConsole(size, inputRead, outputWrite, 0, out _pseudoConsole);
                if (hr != 0)
                    throw new InvalidOperationException($"CreatePseudoConsole failed: 0x{hr:X8}");

                _inputStream = new FileStream(new SafeFileHandle(inputWrite, ownsHandle: true), FileAccess.Write, 4096, false);
                _outputStream = new FileStream(new SafeFileHandle(outputRead, ownsHandle: true), FileAccess.Read, 4096, false);

                var attrList = InitAttributeList();
                try
                {
                    if (!UpdateProcThreadAttribute(
                            attrList, 0, (IntPtr)ProcThreadAttributePseudoConsole,
                            _pseudoConsole, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero))
                        throw new InvalidOperationException($"UpdateProcThreadAttribute failed: {Marshal.GetLastWin32Error()}");

                    var si = new STARTUPINFOEX
                    {
                        StartupInfo = new STARTUPINFO { cb = Marshal.SizeOf<STARTUPINFOEX>() },
                        lpAttributeList = attrList
                    };

                    var cmdLine = string.IsNullOrEmpty(arguments)
                        ? $"\"{executable}\""
                        : $"\"{executable}\" {arguments}";

                    if (!CreateProcess(
                            null!,
                            cmdLine,
                            IntPtr.Zero,
                            IntPtr.Zero,
                            false,
                            ExtendedStartupinfoPresent,
                            IntPtr.Zero,
                            workingDirectory,
                            ref si,
                            out var pi))
                        throw new InvalidOperationException($"CreateProcess failed: {Marshal.GetLastWin32Error()}");

                    _processHandle = pi.hProcess;
                    CloseHandle(pi.hThread);

                    // Pseudoconsole에 넘긴 끝은 자식 프로세스 생성 후 닫습니다 (MS 문서).
                    CloseHandle(inputRead);
                    CloseHandle(outputWrite);
                    inputRead = IntPtr.Zero;
                    outputWrite = IntPtr.Zero;
                }
                finally
                {
                    DeleteProcThreadAttributeList(attrList);
                }

                IsRunning = true;
                _readCts = new CancellationTokenSource();
                _ = Task.Run(() => ReadLoopAsync(_readCts.Token));
            }
            catch
            {
                CleanupHandles(inputRead, inputWrite, outputRead, outputWrite);
                if (_processHandle != IntPtr.Zero)
                {
                    CloseHandle(_processHandle);
                    _processHandle = IntPtr.Zero;
                }
                if (_pseudoConsole != IntPtr.Zero)
                {
                    ClosePseudoConsole(_pseudoConsole);
                    _pseudoConsole = IntPtr.Zero;
                }
                try { _inputStream?.Dispose(); } catch { /* ignore */ }
                try { _outputStream?.Dispose(); } catch { /* ignore */ }
                _inputStream = null;
                _outputStream = null;
                IsRunning = false;
                throw;
            }
        }

        public void Resize(int columns, int rows)
        {
            if (_pseudoConsole == IntPtr.Zero)
                return;

            ResizePseudoConsole(_pseudoConsole, new COORD
            {
                X = ToConsoleSize(columns),
                Y = ToConsoleSize(rows)
            });
        }

        public void WriteInput(string text)
        {
            if (!IsRunning || string.IsNullOrEmpty(text) || _inputStream == null)
                return;

            try
            {
                var bytes = Console.InputEncoding.GetBytes(text);
                _inputStream.Write(bytes, 0, bytes.Length);
                _inputStream.Flush();
            }
            catch (IOException) { /* pipe closed */ }
        }

        public void Stop()
        {
            if (!IsRunning && _pseudoConsole == IntPtr.Zero && _processHandle == IntPtr.Zero)
                return;

            _stopRequested = true;
            IsRunning = false;

            try { _readCts?.Cancel(); } catch { /* ignore */ }

            try { _inputStream?.Flush(); } catch { /* ignore */ }
            try { _inputStream?.Dispose(); } catch { /* ignore */ }
            try { _outputStream?.Dispose(); } catch { /* ignore */ }
            _inputStream = null;
            _outputStream = null;

            if (_processHandle != IntPtr.Zero)
            {
                try { TerminateProcess(_processHandle, 0); } catch { /* ignore */ }
                WaitForSingleObject(_processHandle, 500);
                CloseHandle(_processHandle);
                _processHandle = IntPtr.Zero;
            }

            if (_pseudoConsole != IntPtr.Zero)
            {
                try { ClosePseudoConsole(_pseudoConsole); } catch { /* ignore */ }
                _pseudoConsole = IntPtr.Zero;
            }

            try { _readCts?.Dispose(); } catch { /* ignore */ }
            _readCts = null;
        }

        private async Task ReadLoopAsync(CancellationToken token)
        {
            var buffer = new byte[4096];
            var encoding = new UTF8Encoding(false, true);
            var unexpectedEnd = false;

            try
            {
                while (!token.IsCancellationRequested && _outputStream != null)
                {
                    int read = await _outputStream.ReadAsync(buffer, 0, buffer.Length, token).ConfigureAwait(false);
                    if (read <= 0)
                    {
                        unexpectedEnd = !_stopRequested;
                        break;
                    }

                    OutputReceived?.Invoke(encoding.GetString(buffer, 0, read));
                }
            }
            catch (OperationCanceledException) { }
            catch (IOException) when (!_stopRequested) { unexpectedEnd = true; }
            catch (ObjectDisposedException) { }
            finally
            {
                IsRunning = false;
                if (unexpectedEnd && !_disposed)
                    SessionEnded?.Invoke();
            }
        }

        private static void SetHandleInherit(IntPtr handle, bool inherit)
        {
            if (!SetHandleInformation(handle, HandleFlagInherit, inherit ? HandleFlagInherit : 0u))
                throw new InvalidOperationException($"SetHandleInformation failed: {Marshal.GetLastWin32Error()}");
        }

        private static IntPtr InitAttributeList()
        {
            var size = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
            var list = Marshal.AllocHGlobal(size);
            if (!InitializeProcThreadAttributeList(list, 1, 0, ref size))
            {
                Marshal.FreeHGlobal(list);
                throw new InvalidOperationException("InitializeProcThreadAttributeList failed.");
            }
            return list;
        }

        private static void CleanupHandles(IntPtr a, IntPtr b, IntPtr c, IntPtr d)
        {
            if (a != IntPtr.Zero) CloseHandle(a);
            if (b != IntPtr.Zero) CloseHandle(b);
            if (c != IntPtr.Zero) CloseHandle(c);
            if (d != IntPtr.Zero) CloseHandle(d);
        }

        private static short ToConsoleSize(int value) => (short)Math.Max(1, Math.Min(short.MaxValue, value));

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            Stop();
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct COORD
        {
            public short X;
            public short Y;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public short wShowWindow, cbReserved2;
            public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFOEX
        {
            public STARTUPINFO StartupInfo;
            public IntPtr lpAttributeList;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess, hThread;
            public int dwProcessId, dwThreadId;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern int CreatePseudoConsole(COORD size, IntPtr hInput, IntPtr hOutput, uint dwFlags, out IntPtr phPC);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern void ClosePseudoConsole(IntPtr hPC);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern int ResizePseudoConsole(IntPtr hPC, COORD size);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CreatePipe(out IntPtr hReadPipe, out IntPtr hWritePipe, IntPtr lpPipeAttributes, int nSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetHandleInformation(IntPtr hObject, uint dwMask, uint dwFlags);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcess(
            string lpApplicationName, string lpCommandLine,
            IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles,
            uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory,
            ref STARTUPINFOEX lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, int dwAttributeCount, int dwFlags, ref IntPtr lpSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool UpdateProcThreadAttribute(
            IntPtr lpAttributeList, uint dwFlags, IntPtr attribute, IntPtr lpValue,
            IntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);
    }
}
