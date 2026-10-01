using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace MyDesktop.Interop;

/// <summary>
/// The Windows colour dialog, so a fence can be any colour rather than one of a short list.
///
/// WPF has no colour picker of its own and this application deliberately carries no WinForms
/// reference (the tray icon is hand-written for the same reason), so the common dialog is called
/// directly. It costs thirty lines and gives the user the picker they already know, including the
/// custom-colour panel and the hex and HSL boxes.
/// </summary>
internal static class ColorPicker
{
    /// <summary>
    /// The sixteen custom slots the dialog keeps. Static, because they are the user's own mixes and
    /// losing them between two openings of the same dialog is exactly the annoyance the slots exist
    /// to prevent. They last as long as MyDesktop runs.
    /// </summary>
    private static readonly int[] Custom = new int[16];

    /// <summary>Opens the picker seeded with a colour. Returns "#RRGGBB", or null if cancelled.</summary>
    public static string? Pick(Window owner, string? current)
    {
        var slots = Marshal.AllocCoTaskMem(sizeof(int) * Custom.Length);

        try
        {
            Marshal.Copy(Custom, 0, slots, Custom.Length);

            var choose = new CHOOSECOLOR
            {
                lStructSize = Marshal.SizeOf<CHOOSECOLOR>(),
                hwndOwner = owner is null ? IntPtr.Zero : new WindowInteropHelper(owner).Handle,
                rgbResult = ToColorRef(current),
                lpCustColors = slots,

                // RGBINIT starts on the colour the fence already has, and FULLOPEN opens the custom
                // half straight away: a user who came here from a list of twenty wants the mixer.
                Flags = CC_RGBINIT | CC_FULLOPEN | CC_ANYCOLOR
            };

            if (!ChooseColor(ref choose))
            {
                return null;
            }

            Marshal.Copy(slots, Custom, 0, Custom.Length);
            return FromColorRef(choose.rgbResult);
        }
        finally
        {
            Marshal.FreeCoTaskMem(slots);
        }
    }

    /// <summary>"#RRGGBB" or "#AARRGGBB" in, COLORREF (0x00BBGGRR) out.</summary>
    private static int ToColorRef(string? hex)
    {
        if (string.IsNullOrWhiteSpace(hex))
        {
            return 0;
        }

        var text = hex.TrimStart('#');
        if (text.Length == 8)
        {
            // Alpha is the fence's transparency setting and does not belong to the picker.
            text = text[2..];
        }

        if (text.Length != 6 || !int.TryParse(text, System.Globalization.NumberStyles.HexNumber, null, out var rgb))
        {
            return 0;
        }

        var red = (rgb >> 16) & 0xFF;
        var green = (rgb >> 8) & 0xFF;
        var blue = rgb & 0xFF;
        return red | (green << 8) | (blue << 16);
    }

    private static string FromColorRef(int colorRef)
    {
        var red = colorRef & 0xFF;
        var green = (colorRef >> 8) & 0xFF;
        var blue = (colorRef >> 16) & 0xFF;
        return $"#{red:X2}{green:X2}{blue:X2}";
    }

    private const int CC_RGBINIT = 0x00000001;
    private const int CC_FULLOPEN = 0x00000002;
    private const int CC_ANYCOLOR = 0x00000100;

    [StructLayout(LayoutKind.Sequential)]
    private struct CHOOSECOLOR
    {
        public int lStructSize;
        public IntPtr hwndOwner;
        public IntPtr hInstance;
        public int rgbResult;
        public IntPtr lpCustColors;
        public int Flags;
        public IntPtr lCustData;
        public IntPtr lpfnHook;
        public IntPtr lpTemplateName;
    }

    [DllImport("comdlg32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ChooseColor(ref CHOOSECOLOR choose);
}
