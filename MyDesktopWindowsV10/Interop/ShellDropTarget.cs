using System.Runtime.InteropServices;
using System.Windows;
using ComTypes = System.Runtime.InteropServices.ComTypes;

namespace MyDesktop.Interop;

/// <summary>
/// Hands a drop to the folder itself, the way Explorer does.
///
/// MyDesktop used to accept only <see cref="DataFormats.FileDrop"/>, which is the format a drag out
/// of Explorer carries. Many other programs never produce it. A picture dragged out of a browser, an
/// attachment dragged out of a mail client, a file dragged out of an archive: all of those are
/// *virtual* files — the data object describes them (CFSTR_FILEDESCRIPTOR) and hands over the bytes
/// on request (CFSTR_FILECONTENTS), and there is no path to copy because the file does not exist
/// anywhere yet. A dragged link is neither: it is a URL that the desktop turns into a .url file.
///
/// Writing all of that out by hand is a long tail of formats and no two programs agree on it.
/// The shell already does it — every folder has an <c>IDropTarget</c> that knows how to swallow
/// anything droppable, including the progress window, the "file already exists" question, the
/// copy-or-move decision that depends on the drive, and the Ctrl, Shift and Alt overrides. So
/// MyDesktop asks for that object and forwards the drag to it, exactly as it asks the shell for the
/// context menu rather than writing one.
/// </summary>
internal static class ShellDropTarget
{
    private static IDropTarget? _active;
    private static string? _activeFolder;

    /// <summary>What the folder would do with this data, for the cursor shown during the drag.</summary>
    public static DragDropEffects Over(string folder, DragEventArgs e)
    {
        try
        {
            if (Data(e) is not { } data)
            {
                return DragDropEffects.None;
            }

            if (!string.Equals(_activeFolder, folder, StringComparison.OrdinalIgnoreCase) || _active is null)
            {
                Leave();

                _active = Create(folder);
                _activeFolder = folder;
                if (_active is null)
                {
                    return DragDropEffects.None;
                }

                var entering = Allowed(e);
                _active.DragEnter(data, KeyState(e), Cursor(), ref entering);

                // The one line worth having when a particular program's drag does nothing: it says
                // what that program actually offered, which is the whole question.
                Services.Diagnostics.Write(
                    $"drag entered '{folder}': effect={(DragDropEffects)entering} formats={Formats(e)}");

                return (DragDropEffects)entering;
            }

            var effect = Allowed(e);
            _active.DragOver(KeyState(e), Cursor(), ref effect);
            return (DragDropEffects)effect;
        }
        catch (COMException exception)
        {
            Services.Diagnostics.Write($"shell drop target refused the drag: 0x{exception.HResult:X8}");
            Leave();
            return DragDropEffects.None;
        }
    }

    /// <summary>
    /// Lets the folder take the drop. Whatever lands there is the shell's doing, so the caller only
    /// has to look at the folder afterwards to see what arrived.
    /// </summary>
    public static DragDropEffects Drop(string folder, DragEventArgs e)
    {
        try
        {
            if (Data(e) is not { } data)
            {
                return DragDropEffects.None;
            }

            // Over() is what sets the target up, and a drop can arrive without it on a fast drag.
            if (_active is null || !string.Equals(_activeFolder, folder, StringComparison.OrdinalIgnoreCase))
            {
                Over(folder, e);
            }

            if (_active is null)
            {
                return DragDropEffects.None;
            }

            var effect = Allowed(e);
            _active.Drop(data, KeyState(e), Cursor(), ref effect);
            Services.Diagnostics.Write($"shell drop into '{folder}': effect={(DragDropEffects)effect}");
            return (DragDropEffects)effect;
        }
        catch (COMException exception)
        {
            Services.Diagnostics.Write($"shell drop failed: 0x{exception.HResult:X8}");
            return DragDropEffects.None;
        }
        finally
        {
            Release();
        }
    }

    /// <summary>The drag left without dropping, so the folder stops expecting it.</summary>
    public static void Leave()
    {
        try
        {
            _active?.DragLeave();
        }
        catch (COMException)
        {
        }

        Release();
    }

    private static void Release()
    {
        if (_active is not null)
        {
            Marshal.ReleaseComObject(_active);
        }

        _active = null;
        _activeFolder = null;
    }

    /// <summary>
    /// The data object as COM sees it. WPF wraps the one that came in from the other program, and
    /// the shell will only talk to the original.
    /// </summary>
    private static ComTypes.IDataObject? Data(DragEventArgs e) => e.Data as ComTypes.IDataObject;

    private static string Formats(DragEventArgs e)
    {
        try
        {
            var names = e.Data.GetFormats();
            return names.Length == 0 ? "(none)" : string.Join(", ", names.Take(12));
        }
        catch (Exception exception) when (exception is COMException or OutOfMemoryException)
        {
            return "(unreadable)";
        }
    }

    private static IDropTarget? Create(string folder)
    {
        var itemId = typeof(IShellItem).GUID;
        if (SHCreateItemFromParsingName(folder, IntPtr.Zero, ref itemId, out var item) != 0 || item is null)
        {
            return null;
        }

        try
        {
            var handler = BHID_SFUIObject;
            var targetId = typeof(IDropTarget).GUID;
            if (item.BindToHandler(IntPtr.Zero, ref handler, ref targetId, out var raw) != 0 || raw == IntPtr.Zero)
            {
                return null;
            }

            var target = (IDropTarget)Marshal.GetObjectForIUnknown(raw);
            Marshal.Release(raw);
            return target;
        }
        finally
        {
            Marshal.ReleaseComObject(item);
        }
    }

    private static int Allowed(DragEventArgs e)
    {
        var allowed = (int)e.AllowedEffects & (DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK);
        return allowed == 0 ? DROPEFFECT_COPY : allowed;
    }

    /// <summary>
    /// The modifier keys as the shell expects them. They are not decoration: Ctrl means copy, Shift
    /// means move and Alt means make a shortcut, and the folder decides all three.
    /// </summary>
    private static int KeyState(DragEventArgs e)
    {
        var state = 0;
        if (e.KeyStates.HasFlag(DragDropKeyStates.LeftMouseButton)) state |= MK_LBUTTON;
        if (e.KeyStates.HasFlag(DragDropKeyStates.RightMouseButton)) state |= MK_RBUTTON;
        if (e.KeyStates.HasFlag(DragDropKeyStates.MiddleMouseButton)) state |= MK_MBUTTON;
        if (e.KeyStates.HasFlag(DragDropKeyStates.ShiftKey)) state |= MK_SHIFT;
        if (e.KeyStates.HasFlag(DragDropKeyStates.ControlKey)) state |= MK_CONTROL;
        if (e.KeyStates.HasFlag(DragDropKeyStates.AltKey)) state |= MK_ALT;
        return state;
    }

    private static POINTL Cursor()
    {
        NativeMethods.GetCursorPos(out var point);
        return new POINTL { X = point.X, Y = point.Y };
    }

    // ---------------------------------------------------------------- interop

    private const int DROPEFFECT_COPY = 1;
    private const int DROPEFFECT_MOVE = 2;
    private const int DROPEFFECT_LINK = 4;

    private const int MK_LBUTTON = 0x0001;
    private const int MK_RBUTTON = 0x0002;
    private const int MK_SHIFT = 0x0004;
    private const int MK_CONTROL = 0x0008;
    private const int MK_MBUTTON = 0x0010;
    private const int MK_ALT = 0x0020;

    private static Guid BHID_SFUIObject = new("3981e225-f559-11d3-8e3a-00c04f6837d5");

    [StructLayout(LayoutKind.Sequential)]
    private struct POINTL
    {
        public int X;
        public int Y;
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        [PreserveSig] int BindToHandler(IntPtr bindContext, ref Guid handler, ref Guid riid, out IntPtr ppv);

        [PreserveSig] int GetParent(out IShellItem parent);

        [PreserveSig] int GetDisplayName(uint kind, out IntPtr name);

        [PreserveSig] int GetAttributes(uint mask, out uint attributes);

        [PreserveSig] int Compare(IShellItem other, uint hint, out int order);
    }

    [ComImport, Guid("00000122-0000-0000-C000-000000000046"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDropTarget
    {
        [PreserveSig] int DragEnter(ComTypes.IDataObject data, int keyState, POINTL point, ref int effect);

        [PreserveSig] int DragOver(int keyState, POINTL point, ref int effect);

        [PreserveSig] int DragLeave();

        [PreserveSig] int Drop(ComTypes.IDataObject data, int keyState, POINTL point, ref int effect);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr bindContext, ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItem item);
}
