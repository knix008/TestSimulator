using System.Runtime.CompilerServices;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

/// <summary>
/// Shows one detailed error dialog per control until the next successful rebuild.
/// </summary>
internal static class ViewFailureReporter
{
    private static readonly ConditionalWeakTable<Control, FailureState> States = new();

    public static void Report(Control owner, string viewDisplayName, string phase, Exception ex)
    {
        if (AnalysisCancellation.IsCancellation(ex))
        {
            return;
        }

        var state = States.GetOrCreateValue(owner);
        var signature = BuildSignature(ex);
        lock (state.Sync)
        {
            if (state.Reported && string.Equals(state.LastSignature, signature, StringComparison.Ordinal))
            {
                return;
            }

            state.Reported = true;
            state.LastSignature = signature;
            state.LastException = ex;
        }

        var title = $"{viewDisplayName} 오류";
        var summary = string.Empty;

        void ShowDialog()
        {
            DetailedErrorDialog.Show(owner.FindForm(), title, ex, summary);
        }

        if (owner.InvokeRequired)
        {
            owner.BeginInvoke(ShowDialog);
        }
        else
        {
            ShowDialog();
        }
    }

    public static void Clear(Control owner)
    {
        if (!States.TryGetValue(owner, out var state))
        {
            return;
        }

        lock (state.Sync)
        {
            state.Reported = false;
            state.LastSignature = null;
            state.LastException = null;
        }
    }

    public static Exception? GetLastException(Control owner) =>
        States.TryGetValue(owner, out var state)
            ? state.LastException
            : null;

    public static string FormatCanvasMessage(Exception? ex, string phaseVerb)
    {
        if (ex is null)
        {
            return $"{phaseVerb}에 실패했습니다.";
        }

        var message = ex.Message;
        if (message.Length > 280)
        {
            message = message[..277] + "...";
        }

        return
            $"{phaseVerb}에 실패했습니다.{Environment.NewLine}{Environment.NewLine}" +
            $"원인: {message}";
    }

    private static string BuildSignature(Exception ex) =>
        $"{ex.GetType().FullName}|{ex.Message}|{ex.StackTrace}";

    private sealed class FailureState
    {
        public object Sync { get; } = new();
        public bool Reported;
        public string? LastSignature;
        public Exception? LastException;
    }
}
