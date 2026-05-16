using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace VNCServer.VNCServer;

/// <summary>
/// 클립보드 이미지 지원을 포함한 향상된 클립보드 관리자
/// </summary>
public class EnhancedClipboardManager
{
    private string _lastClipboardText = string.Empty;
    private Bitmap? _lastClipboardImage = null;
    private System.Threading.Timer? _clipboardTimer;
    private bool _isEnabled;

    public event EventHandler<string>? ClipboardTextChanged;
    public event EventHandler<Bitmap>? ClipboardImageChanged;

    [DllImport("user32.dll")]
    private static extern IntPtr SetClipboardViewer(IntPtr hWndNewViewer);

    [DllImport("user32.dll")]
    private static extern bool ChangeClipboardChain(IntPtr hWndRemove, IntPtr hWndNewNext);

    public EnhancedClipboardManager(bool isEnabled = true)
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
        _lastClipboardImage?.Dispose();
        _lastClipboardImage = null;
    }

    private void CheckClipboard(object? state)
    {
        try
        {
            // 텍스트 체크
            if (System.Windows.Forms.Clipboard.ContainsText())
            {
                string currentText = System.Windows.Forms.Clipboard.GetText();
                
                if (currentText != _lastClipboardText)
                {
                    _lastClipboardText = currentText;
                    ClipboardTextChanged?.Invoke(this, currentText);
                }
            }
            
            // 이미지 체크
            if (System.Windows.Forms.Clipboard.ContainsImage())
            {
                var image = System.Windows.Forms.Clipboard.GetImage();
                if (image != null)
                {
                    // 이미지가 변경되었는지 체크 (간단한 비교)
                    bool isNew = _lastClipboardImage == null || 
                                 !AreBitmapsEqual(_lastClipboardImage, (Bitmap)image);
                    
                    if (isNew)
                    {
                        _lastClipboardImage?.Dispose();
                        _lastClipboardImage = new Bitmap(image);
                        ClipboardImageChanged?.Invoke(this, (Bitmap)image);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Clipboard check error: {ex.Message}");
        }
    }

    private bool AreBitmapsEqual(Bitmap bmp1, Bitmap bmp2)
    {
        if (bmp1.Width != bmp2.Width || bmp1.Height != bmp2.Height)
            return false;

        // 간단한 해시 비교 (정확하지는 않지만 빠름)
        return bmp1.GetHashCode() == bmp2.GetHashCode();
    }

    public void SetClipboardText(string text)
    {
        try
        {
            _lastClipboardText = text;
            
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

    public void SetClipboardImage(Bitmap image)
    {
        try
        {
            _lastClipboardImage?.Dispose();
            _lastClipboardImage = new Bitmap(image);
            
            var thread = new Thread(() =>
            {
                try
                {
                    System.Windows.Forms.Clipboard.SetImage(image);
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Set clipboard image error: {ex.Message}");
                }
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            thread.Join();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Clipboard set image error: {ex.Message}");
        }
    }

    public string GetClipboardText()
    {
        return _lastClipboardText;
    }

    public Bitmap? GetClipboardImage()
    {
        return _lastClipboardImage;
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

    public void Dispose()
    {
        Stop();
    }
}
