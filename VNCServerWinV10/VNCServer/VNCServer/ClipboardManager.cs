using System.Runtime.InteropServices;

namespace VNCServer.VNCServer;

/// <summary>
/// 클립보드 동기화를 담당하는 클래스
/// </summary>
public class ClipboardManager
{
    private string _lastClipboardText = string.Empty;
    private System.Threading.Timer? _clipboardTimer;
    private bool _isEnabled;

    public event EventHandler<string>? ClipboardChanged;

    [DllImport("user32.dll")]
    private static extern IntPtr SetClipboardViewer(IntPtr hWndNewViewer);

    [DllImport("user32.dll")]
    private static extern bool ChangeClipboardChain(IntPtr hWndRemove, IntPtr hWndNewNext);

    public ClipboardManager(bool isEnabled = true)
    {
        _isEnabled = isEnabled;
    }

    public void Start()
    {
        if (!_isEnabled)
            return;

        // 500ms마다 클립보드 변경 체크
        _clipboardTimer = new System.Threading.Timer(CheckClipboard, null, 0, 500);
    }

    public void Stop()
    {
        _clipboardTimer?.Dispose();
        _clipboardTimer = null;
    }

    private void CheckClipboard(object? state)
    {
        try
        {
            if (System.Windows.Forms.Clipboard.ContainsText())
            {
                string currentText = System.Windows.Forms.Clipboard.GetText();
                
                if (currentText != _lastClipboardText)
                {
                    _lastClipboardText = currentText;
                    ClipboardChanged?.Invoke(this, currentText);
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Clipboard check error: {ex.Message}");
        }
    }

    public void SetClipboardText(string text)
    {
        try
        {
            // 무한 루프 방지를 위해 로컬 클립보드 텍스트 업데이트
            _lastClipboardText = text;
            
            // UI 스레드에서 실행
            var thread = new Thread(() =>
            {
                try
                {
                    System.Windows.Forms.Clipboard.SetText(text);
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Set clipboard error: {ex.Message}");
                }
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            thread.Join();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Clipboard set error: {ex.Message}");
        }
    }

    public string GetClipboardText()
    {
        return _lastClipboardText;
    }

    public void SetEnabled(bool enabled)
    {
        _isEnabled = enabled;
        if (!enabled)
        {
            Stop();
        }
        else
        {
            Start();
        }
    }
}
