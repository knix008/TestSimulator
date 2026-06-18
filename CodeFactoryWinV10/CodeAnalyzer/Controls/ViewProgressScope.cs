using System.Diagnostics;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

/// <summary>뷰 전환·구성이 오래 걸릴 때 지연 후 진행률 대화상자를 표시합니다.</summary>
internal sealed class ViewProgressScope : IDisposable
{
    private static ViewProgressScope? _active;

    private readonly bool _ownsDialog;
    private readonly DeferredProgressDialog? _dialog;
    private readonly System.Windows.Forms.Timer? _showTimer;
    private readonly Stopwatch _stopwatch = Stopwatch.StartNew();

    private ViewProgressScope(IWin32Window? owner, string title, bool ownsDialog, DeferredProgressDialog? dialog)
    {
        _ownsDialog = ownsDialog;
        _dialog = dialog;

        if (!_ownsDialog)
        {
            return;
        }

        _active = this;
        _showTimer = new System.Windows.Forms.Timer { Interval = DeferredProgressRunner.DefaultShowDelayMs };
        _showTimer.Tick += (_, _) =>
        {
            _showTimer.Stop();
            if (_dialog is null || _dialog.IsDisposed)
            {
                return;
            }

            if (!_dialog.Visible)
            {
                _dialog.Show(owner);
            }
        };
        _showTimer.Start();
    }

    public static ViewProgressScope? Active => _active;

    public static IDisposable Begin(IWin32Window? owner, string title)
    {
        if (_active is not null)
        {
            return NoOpDisposable.Instance;
        }

        var dialog = new DeferredProgressDialog(title);
        dialog.UpdateProgress(new AnalysisProgressReport
        {
            Percent = 0,
            Message = "뷰를 준비하는 중...",
            Elapsed = TimeSpan.Zero
        });
        return new ViewProgressScope(owner, title, ownsDialog: true, dialog);
    }

    public static IDisposable BeginIfNeeded(IWin32Window? owner, string title) => Begin(owner, title);

    public void Report(int percent, string message)
    {
        if (_dialog is null || _dialog.IsDisposed)
        {
            return;
        }

        _dialog.UpdateProgress(new AnalysisProgressReport
        {
            Percent = Math.Clamp(percent, 0, 100),
            Message = message,
            Elapsed = _stopwatch.Elapsed
        });
    }

    public void ReportStep(int currentIndex, int totalCount, string message)
    {
        if (totalCount <= 0)
        {
            Report(0, message);
            return;
        }

        var percent = (int)Math.Round((currentIndex + 1) * 100.0 / totalCount);
        Report(Math.Clamp(percent, 1, 99), message);
    }

    public void Dispose()
    {
        if (!_ownsDialog)
        {
            return;
        }

        _showTimer?.Stop();
        _showTimer?.Dispose();
        if (_active == this)
        {
            _active = null;
        }

        if (_dialog is not null && !_dialog.IsDisposed)
        {
            if (_dialog.Visible)
            {
                _dialog.Close();
            }

            _dialog.Dispose();
        }
    }
}

internal static class ViewProgressReporter
{
    private static readonly AsyncLocal<IProgress<AnalysisProgressReport>?> AsyncProgress = new();
    private static readonly AsyncLocal<CancellationToken> AsyncCancellation = new();
    private static readonly AsyncLocal<Stopwatch?> AsyncStopwatch = new();

    public static IDisposable Attach(IProgress<AnalysisProgressReport> progress, CancellationToken cancellationToken = default)
    {
        AsyncProgress.Value = progress;
        AsyncCancellation.Value = cancellationToken;
        var stopwatch = Stopwatch.StartNew();
        AsyncStopwatch.Value = stopwatch;
        return new AttachScope();
    }

    public static void Report(int percent, string message)
    {
        AsyncCancellation.Value.ThrowIfCancellationRequested();

        if (AsyncProgress.Value is { } asyncProgress)
        {
            asyncProgress.Report(new AnalysisProgressReport
            {
                Percent = Math.Clamp(percent, 0, 100),
                Message = message,
                Elapsed = AsyncStopwatch.Value?.Elapsed ?? TimeSpan.Zero
            });
            return;
        }

        ViewProgressScope.Active?.Report(percent, message);
    }

    public static void ReportStep(int currentIndex, int totalCount, string message)
    {
        if (totalCount <= 0)
        {
            Report(0, message);
            return;
        }

        var percent = (int)Math.Round((currentIndex + 1) * 100.0 / totalCount);
        Report(Math.Clamp(percent, 1, 99), message);
    }

    private sealed class AttachScope : IDisposable
    {
        public void Dispose()
        {
            AsyncProgress.Value = null;
            AsyncCancellation.Value = default;
            AsyncStopwatch.Value = null;
        }
    }
}

file sealed class NoOpDisposable : IDisposable
{
    public static readonly NoOpDisposable Instance = new();
    public void Dispose()
    {
    }
}
