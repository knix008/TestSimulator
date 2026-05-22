using FileMasterWinV10.Dialogs;
using FileMasterWinV10.Models;

namespace FileMasterWinV10.Helpers;

public static class FileOperationRunner
{
    private static int _running;

    public static bool IsRunning => Volatile.Read(ref _running) != 0;

    /// <summary>파일 작업이 끝났을 때(성공/취소/오류 모두) 발생합니다.</summary>
    public static event Action? OperationCompleted;

    public static async Task<(bool Success, Exception? Error)> RunAsync(
        Form? owner,
        string title,
        Action<IProgress<FileOperationProgress>, CancellationToken> work)
    {
        if (Interlocked.CompareExchange(ref _running, 1, 0) != 0)
        {
            MessageBox.Show(owner, "다른 파일 작업이 진행 중입니다.", "작업 중",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return (false, null);
        }

        using var dlg = new FileOperationProgressDialog(title);
        using var cts = new CancellationTokenSource();
        dlg.CancelRequested += () => cts.Cancel();

        var progress = new Progress<FileOperationProgress>(p => dlg.ReportProgress(p));

        if (owner != null)
        {
            dlg.StartPosition = FormStartPosition.CenterParent;
            owner.UseWaitCursor = true;
            dlg.Show(owner);
        }
        else
        {
            dlg.StartPosition = FormStartPosition.CenterScreen;
            dlg.Show();
        }

        try
        {
            await Task.Run(() => work(progress, cts.Token), cts.Token).ConfigureAwait(true);
            dlg.FinishSuccess();
            return (true, null);
        }
        catch (OperationCanceledException)
        {
            dlg.FinishCancelled();
            return (false, null);
        }
        catch (Exception ex)
        {
            dlg.FinishFailed(ex.Message);
            return (false, ex);
        }
        finally
        {
            if (owner != null)
                owner.UseWaitCursor = false;
            Interlocked.Exchange(ref _running, 0);
            OperationCompleted?.Invoke();
        }
    }
}
