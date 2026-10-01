using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace MyDesktop.Interop;

/// <summary>
/// The real Windows context menu for a file, a folder or the desktop background.
///
/// While MyDesktop draws the desktop, Explorer's own icon view does not exist, and with it goes
/// everything the shell used to put on a right-click: Open with, Send to, Properties, Cut and Copy,
/// Paste, New, and every context menu handler the user has installed — the archivers, the version
/// control tools, the antivirus. A menu built by hand can never carry those, because they are code
/// that belongs to somebody else. Asking the shell for the menu it would have shown is the only way
/// to get them, and it costs a few hundred lines of COM.
/// </summary>
internal static class ShellContextMenu
{
    private const int FirstShellCommand = 1;
    private const int LastShellCommand = 0x6FFF;

    /// <summary>Ids at or above this belong to the caller's own entries, not to the shell.</summary>
    public const int FirstOwnCommand = 0x7000;

    /// <summary>
    /// One of the caller's own entries, appended below the shell's. A entry with children becomes a
    /// submenu and its own id is never returned.
    /// </summary>
    public sealed record Entry(int Id, string Text, IReadOnlyList<Entry>? Children = null);

    /// <summary>
    /// Shows the shell's menu for <paramref name="paths"/> at a screen point, optionally with the
    /// caller's own entries appended below a separator.
    /// </summary>
    /// <returns>
    /// The id of the caller's entry that was chosen, or 0 when the shell handled the click itself
    /// or the menu was dismissed.
    /// </returns>
    public static int ShowForItems(Window owner, IReadOnlyList<string> paths, Point screenPoint,
        IReadOnlyList<Entry>? ownItems = null)
    {
        var raw = CreateForItems(owner, paths);
        return raw == IntPtr.Zero
            ? 0
            : Track(owner, raw, screenPoint, ownItems, CMF_NORMAL | CMF_EXPLORE | CMF_CANRENAME);
    }

    /// <summary>
    /// Shows the menu the desktop's empty area would show: Paste, Paste shortcut, New, the display
    /// and personalisation entries, and whatever else is registered on the desktop background.
    /// </summary>
    public static int ShowForDesktopBackground(Window owner, Point screenPoint,
        IReadOnlyList<Entry>? ownItems = null)
    {
        if (SHGetDesktopFolder(out var desktop) != 0)
        {
            return 0;
        }

        try
        {
            var menuId = typeof(IContextMenu).GUID;
            if (desktop.CreateViewObject(Handle(owner), ref menuId, out var raw) != 0 || raw == IntPtr.Zero)
            {
                return 0;
            }

            return Track(owner, raw, screenPoint, ownItems, CMF_NORMAL | CMF_EXPLORE);
        }
        finally
        {
            Marshal.ReleaseComObject(desktop);
        }
    }

    /// <summary>
    /// The shell's menu for some items, built and then held open instead of shown.
    ///
    /// Windows 11 does not show the menu this class has always built. Explorer puts a short menu of
    /// its own in front of it — the row of cut, copy, rename and delete at the top, a handful of
    /// commands, and "Show more options" for everything else — and that shorter menu is what the
    /// desktop shows when an icon is right-clicked. It is drawn by Explorer itself and no other
    /// program can ask for it, so MyDesktop draws its own in the same shape. What it must not do is
    /// invent the commands: they are read out of the shell's menu here, and running one runs it
    /// through the very same IContextMenu, which is what makes it do exactly what Explorer does.
    /// </summary>
    public sealed class Live : IDisposable
    {
        private readonly IntPtr _rawMenu;
        private readonly IContextMenu _menu;
        private readonly IntPtr _hmenu;
        private readonly IntPtr _hwnd;
        private bool _closed;

        private Live(IntPtr rawMenu, IContextMenu menu, IntPtr hmenu, IntPtr hwnd)
        {
            _rawMenu = rawMenu;
            _menu = menu;
            _hmenu = hmenu;
            _hwnd = hwnd;
        }

        /// <summary>The shell's own top-level entries, in the order the shell put them in.</summary>
        public IReadOnlyList<Node> Entries { get; private set; } = [];

        /// <summary>
        /// Opens the shell's menu for <paramref name="paths"/> and reads it, or returns null when the
        /// shell has nothing to say about them.
        /// </summary>
        public static Live? OpenForItems(Window owner, IReadOnlyList<string> paths)
        {
            var raw = CreateForItems(owner, paths);
            if (raw == IntPtr.Zero)
            {
                return null;
            }

            var menu = (IContextMenu)Marshal.GetObjectForIUnknown(raw);
            var hmenu = CreatePopupMenu();
            var hwnd = Handle(owner);

            if (menu.QueryContextMenu(hmenu, 0, FirstShellCommand, LastShellCommand,
                    CMF_NORMAL | CMF_EXPLORE | CMF_CANRENAME) < 0)
            {
                DestroyMenu(hmenu);
                Marshal.ReleaseComObject(menu);
                Marshal.Release(raw);
                return null;
            }

            var live = new Live(raw, menu, hmenu, hwnd);
            live.Entries = live.Read(hmenu);
            return live;
        }

        /// <summary>The first entry carrying one of <paramref name="verbs"/>, or null.</summary>
        public Node? Find(params string[] verbs)
        {
            foreach (var verb in verbs)
            {
                var match = Entries.FirstOrDefault(entry =>
                    string.Equals(entry.Verb, verb, StringComparison.OrdinalIgnoreCase));
                if (match is not null)
                {
                    return match;
                }
            }

            return null;
        }

        /// <summary>Runs one of the shell's commands, exactly as Explorer would run it.</summary>
        public void Run(Node node)
        {
            if (!_closed && node.Id > 0)
            {
                Invoke(_menu, _hwnd, node.Id - FirstShellCommand);
            }
        }

        /// <summary>
        /// Fills in a submenu. The shell leaves entries such as Open with empty until it is asked for
        /// them, and asking is a menu message, not a method.
        /// </summary>
        public IReadOnlyList<Node> Children(Node node)
        {
            if (_closed || node.Submenu == IntPtr.Zero)
            {
                return [];
            }

            try
            {
                if (Marshal.GetObjectForIUnknown(_rawMenu) is IContextMenu3 menu3)
                {
                    menu3.HandleMenuMsg2(WM_INITMENUPOPUP, node.Submenu, new IntPtr(node.Position), out _);
                }
                else if (Marshal.GetObjectForIUnknown(_rawMenu) is IContextMenu2 menu2)
                {
                    menu2.HandleMenuMsg(WM_INITMENUPOPUP, node.Submenu, new IntPtr(node.Position));
                }
            }
            catch (COMException)
            {
                // A handler that will not fill its submenu simply shows an empty one.
            }

            return Read(node.Submenu);
        }

        public void Dispose()
        {
            if (_closed)
            {
                return;
            }

            _closed = true;
            DestroyMenu(_hmenu);
            Marshal.ReleaseComObject(_menu);
            Marshal.Release(_rawMenu);
        }

        private List<Node> Read(IntPtr hmenu)
        {
            var nodes = new List<Node>();
            var count = GetMenuItemCount(hmenu);
            var text = Marshal.AllocHGlobal(512 * 2);

            try
            {
                for (var position = 0; position < count; position++)
                {
                    var info = new MENUITEMINFO
                    {
                        cbSize = Marshal.SizeOf<MENUITEMINFO>(),
                        fMask = MIIM_ID | MIIM_FTYPE | MIIM_STATE | MIIM_SUBMENU | MIIM_STRING,
                        dwTypeData = text,
                        cch = 512
                    };

                    if (!GetMenuItemInfo(hmenu, (uint)position, true, ref info))
                    {
                        continue;
                    }

                    if ((info.fType & MFT_SEPARATOR) != 0)
                    {
                        nodes.Add(Node.Separator);
                        continue;
                    }

                    var label = Label(Marshal.PtrToStringUni(info.dwTypeData, (int)info.cch) ?? string.Empty);

                    var id = (int)info.wID;
                    nodes.Add(new Node(
                        id,
                        label,
                        id >= FirstShellCommand && id <= LastShellCommand ? VerbOf(id) : null,
                        (info.fState & (MFS_DISABLED | MFS_GRAYED)) == 0,
                        info.hSubMenu,
                        position));
                }
            }
            finally
            {
                Marshal.FreeHGlobal(text);
            }

            return nodes;
        }

        /// <summary>
        /// An entry's text as Windows 11 writes it.
        ///
        /// The shell's label carries its keyboard accelerator: an ampersand before the letter, and
        /// in languages whose words have no Latin letter to underline — Korean, Japanese, Chinese —
        /// that letter in brackets after the word, as in "열기(&amp;O)". Windows 11's own menu shows
        /// neither, so neither does this one. The ampersand would be swallowed by WPF anyway, which
        /// reads it as an accelerator of its own.
        /// </summary>
        private static string Label(string text)
        {
            var label = text.Replace("&", string.Empty).Trim();

            return label.Length > 3 && label[^1] == ')' && label[^3] == '(' && char.IsLetterOrDigit(label[^2])
                ? label[..^3].TrimEnd()
                : label;
        }

        /// <summary>
        /// The command's canonical verb — "open", "copy", "delete" and so on. It is how an entry is
        /// recognised whatever language Windows is in, and the labels here come out translated.
        /// </summary>
        private string? VerbOf(int id)
        {
            var buffer = Marshal.AllocHGlobal(260 * 2);
            try
            {
                Marshal.WriteInt16(buffer, 0, 0);
                if (_menu.GetCommandString(new IntPtr(id - FirstShellCommand), GCS_VERBW, IntPtr.Zero, buffer, 260) != 0)
                {
                    return null;
                }

                var verb = Marshal.PtrToStringUni(buffer);
                return string.IsNullOrWhiteSpace(verb) ? null : verb;
            }
            catch (COMException)
            {
                return null;
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
    }

    /// <summary>One entry of the shell's menu, as it was read out of it.</summary>
    public sealed record Node(int Id, string Text, string? Verb, bool Enabled, IntPtr Submenu, int Position)
    {
        public static readonly Node Separator = new(0, string.Empty, null, false, IntPtr.Zero, -1);

        public bool IsSeparator => Position < 0;

        public bool HasChildren => Submenu != IntPtr.Zero;
    }

    /// <summary>The IContextMenu for some items, or IntPtr.Zero. The caller owns the reference.</summary>
    private static IntPtr CreateForItems(Window owner, IReadOnlyList<string> paths)
    {
        if (paths.Count == 0)
        {
            return IntPtr.Zero;
        }

        // One IContextMenu covers several items only when they share a parent folder, which on the
        // desktop and in a fence they usually do. Anything from elsewhere is left out of the menu
        // rather than quietly acted on, because a command would run against the wrong folder.
        var folder = ParentOf(paths[0]);
        var wanted = paths.Where(path => string.Equals(ParentOf(path), folder, StringComparison.OrdinalIgnoreCase));

        var pidls = new List<IntPtr>();
        IShellFolder? parent = null;

        try
        {
            foreach (var path in wanted)
            {
                if (SHParseDisplayName(path, IntPtr.Zero, out var absolute, 0, out _) != 0 || absolute == IntPtr.Zero)
                {
                    continue;
                }

                var folderId = typeof(IShellFolder).GUID;
                if (SHBindToParent(absolute, ref folderId, out var itemParent, out var child) != 0)
                {
                    ILFree(absolute);
                    continue;
                }

                // The child id points into the item's own full id list rather than being an
                // allocation of its own, so it has to be copied out before that list is freed.
                // Using it afterwards reads memory the shell has handed back, which is how this
                // crashed inside GetUIObjectOf rather than merely showing the wrong menu.
                var childCopy = ILClone(child);
                ILFree(absolute);

                if (childCopy == IntPtr.Zero)
                {
                    Marshal.ReleaseComObject(itemParent);
                    continue;
                }

                if (parent is null)
                {
                    parent = itemParent;
                }
                else
                {
                    Marshal.ReleaseComObject(itemParent);
                }

                pidls.Add(childCopy);
            }

            if (parent is null || pidls.Count == 0)
            {
                return IntPtr.Zero;
            }

            var menuId = typeof(IContextMenu).GUID;
            var array = pidls.ToArray();
            return parent.GetUIObjectOf(Handle(owner), (uint)array.Length, array, ref menuId, IntPtr.Zero, out var raw) == 0
                ? raw
                : IntPtr.Zero;
        }
        finally
        {
            foreach (var pidl in pidls)
            {
                ILFree(pidl);
            }

            if (parent is not null)
            {
                Marshal.ReleaseComObject(parent);
            }
        }
    }

    /// <summary>
    /// What two items have to share for one menu to cover both. A shell place such as the Recycle
    /// Bin has no folder of its own; they all sit on the desktop, so they share that.
    /// </summary>
    private static string ParentOf(string path)
        => path.StartsWith("::", StringComparison.Ordinal)
            ? "::"
            : Path.GetDirectoryName(path) ?? string.Empty;

    private static int Track(Window owner, IntPtr rawMenu, Point screenPoint,
        IReadOnlyList<Entry>? ownItems, uint flags)
    {
        var contextMenu = (IContextMenu)Marshal.GetObjectForIUnknown(rawMenu);
        var hmenu = CreatePopupMenu();
        var hwnd = Handle(owner);

        // Submenu handles are destroyed with their parent, but only once they have been attached to
        // it, so they are tracked in case QueryContextMenu fails before that happens.
        var submenus = new List<IntPtr>();

        // Submenus such as "New" and "Send to" are filled in only when the owner forwards the menu
        // messages back to the shell, so the handler is installed for as long as the menu is up.
        var forwarder = new MessageForwarder(rawMenu);
        var source = HwndSource.FromHwnd(hwnd);
        source?.AddHook(forwarder.Hook);

        try
        {
            if (contextMenu.QueryContextMenu(hmenu, 0, FirstShellCommand, LastShellCommand, flags) < 0)
            {
                return 0;
            }

            if (ownItems is { Count: > 0 })
            {
                AppendMenu(hmenu, MF_SEPARATOR, IntPtr.Zero, null);
                Append(hmenu, ownItems, submenus);
            }

            // A popup menu belongs to the foreground window, and without this the menu can refuse to
            // close when the user clicks elsewhere.
            SetForegroundWindow(hwnd);

            var chosen = TrackPopupMenuEx(hmenu, TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_LEFTALIGN,
                (int)Math.Round(screenPoint.X), (int)Math.Round(screenPoint.Y), hwnd, IntPtr.Zero);

            // The documented cure for a menu that leaves the owner's message loop out of step.
            PostMessage(hwnd, 0x0000, IntPtr.Zero, IntPtr.Zero);

            if (chosen <= 0)
            {
                return 0;
            }

            if (chosen >= FirstOwnCommand)
            {
                return chosen;
            }

            Invoke(contextMenu, hwnd, chosen - FirstShellCommand);
            return 0;
        }
        finally
        {
            source?.RemoveHook(forwarder.Hook);
            DestroyMenu(hmenu);
            Marshal.ReleaseComObject(contextMenu);
            Marshal.Release(rawMenu);
        }
    }

    private static void Append(IntPtr menu, IReadOnlyList<Entry> entries, List<IntPtr> submenus)
    {
        foreach (var entry in entries)
        {
            if (entry.Children is { Count: > 0 } children)
            {
                var child = CreatePopupMenu();
                submenus.Add(child);
                Append(child, children, submenus);
                AppendMenu(menu, MF_POPUP, child, entry.Text);
                continue;
            }

            AppendMenu(menu, MF_STRING, new IntPtr(entry.Id), entry.Text);
        }
    }

    private static void Invoke(IContextMenu menu, IntPtr hwnd, int offset)
    {
        var invoke = new CMINVOKECOMMANDINFOEX
        {
            cbSize = Marshal.SizeOf<CMINVOKECOMMANDINFOEX>(),
            fMask = CMIC_MASK_UNICODE,
            hwnd = hwnd,
            lpVerb = new IntPtr(offset),
            lpVerbW = new IntPtr(offset),
            nShow = SW_SHOWNORMAL
        };

        try
        {
            menu.InvokeCommand(ref invoke);
        }
        catch (COMException exception)
        {
            // A handler that refuses is the handler's business, not a reason to take the app down.
            Services.Diagnostics.Write($"shell command failed: 0x{exception.HResult:X8}");
        }
    }

    private static IntPtr Handle(Window owner) => new WindowInteropHelper(owner).Handle;

    /// <summary>
    /// Passes the menu messages the shell needs in order to draw and fill its own submenus. Without
    /// it "New" and "Send to" open empty.
    /// </summary>
    private sealed class MessageForwarder(IntPtr rawMenu)
    {
        private readonly IContextMenu2? _menu2 = Marshal.GetObjectForIUnknown(rawMenu) as IContextMenu2;
        private readonly IContextMenu3? _menu3 = Marshal.GetObjectForIUnknown(rawMenu) as IContextMenu3;

        public IntPtr Hook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (msg is not (WM_INITMENUPOPUP or WM_DRAWITEM or WM_MEASUREITEM or WM_MENUCHAR))
            {
                return IntPtr.Zero;
            }

            try
            {
                if (_menu3 is not null)
                {
                    _menu3.HandleMenuMsg2((uint)msg, wParam, lParam, out var result);
                    handled = true;
                    return result;
                }

                if (_menu2 is not null)
                {
                    _menu2.HandleMenuMsg((uint)msg, wParam, lParam);
                    handled = true;
                }
            }
            catch (COMException)
            {
                // A handler that will not draw itself simply does not get drawn.
            }

            return IntPtr.Zero;
        }
    }

    // ---------------------------------------------------------------- interop

    private const uint CMF_NORMAL = 0x00000000;
    private const uint CMF_EXPLORE = 0x00000004;
    private const uint CMF_CANRENAME = 0x00000010;

    private const uint CMIC_MASK_UNICODE = 0x00004000;
    private const int SW_SHOWNORMAL = 1;

    /// <summary>Asks GetCommandString for the command's language-independent name.</summary>
    private const uint GCS_VERBW = 0x00000004;

    private const uint MIIM_STATE = 0x00000001;
    private const uint MIIM_ID = 0x00000002;
    private const uint MIIM_SUBMENU = 0x00000004;
    private const uint MIIM_STRING = 0x00000040;
    private const uint MIIM_FTYPE = 0x00000100;

    private const uint MFT_SEPARATOR = 0x00000800;
    private const uint MFS_GRAYED = 0x00000003;
    private const uint MFS_DISABLED = 0x00000002;

    private const uint MF_STRING = 0x00000000;
    private const uint MF_POPUP = 0x00000010;
    private const uint MF_SEPARATOR = 0x00000800;

    private const uint TPM_LEFTALIGN = 0x0000;
    private const uint TPM_RETURNCMD = 0x0100;
    private const uint TPM_RIGHTBUTTON = 0x0002;

    private const int WM_INITMENUPOPUP = 0x0117;
    private const int WM_DRAWITEM = 0x002B;
    private const int WM_MEASUREITEM = 0x002C;
    private const int WM_MENUCHAR = 0x0120;

    [ComImport, Guid("000214E6-0000-0000-C000-000000000046"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellFolder
    {
        [PreserveSig] int ParseDisplayName(IntPtr hwnd, IntPtr bc, [MarshalAs(UnmanagedType.LPWStr)] string displayName,
            ref uint eaten, out IntPtr pidl, ref uint attributes);

        [PreserveSig] int EnumObjects(IntPtr hwnd, int flags, out IntPtr enumIdList);

        [PreserveSig] int BindToObject(IntPtr pidl, IntPtr bc, ref Guid riid, out IntPtr ppv);

        [PreserveSig] int BindToStorage(IntPtr pidl, IntPtr bc, ref Guid riid, out IntPtr ppv);

        [PreserveSig] int CompareIDs(IntPtr lParam, IntPtr pidl1, IntPtr pidl2);

        [PreserveSig] int CreateViewObject(IntPtr hwndOwner, ref Guid riid, out IntPtr ppv);

        [PreserveSig] int GetAttributesOf(uint count, [MarshalAs(UnmanagedType.LPArray)] IntPtr[] pidls,
            ref uint attributes);

        [PreserveSig] int GetUIObjectOf(IntPtr hwndOwner, uint count, [MarshalAs(UnmanagedType.LPArray)] IntPtr[] pidls,
            ref Guid riid, IntPtr reserved, out IntPtr ppv);

        [PreserveSig] int GetDisplayNameOf(IntPtr pidl, uint flags, IntPtr name);

        [PreserveSig] int SetNameOf(IntPtr hwnd, IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string name,
            uint flags, out IntPtr outPidl);
    }

    [ComImport, Guid("000214E4-0000-0000-C000-000000000046"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IContextMenu
    {
        [PreserveSig] int QueryContextMenu(IntPtr hmenu, uint indexMenu, int idCmdFirst, int idCmdLast, uint flags);

        [PreserveSig] int InvokeCommand(ref CMINVOKECOMMANDINFOEX info);

        [PreserveSig] int GetCommandString(IntPtr idCmd, uint type, IntPtr reserved, IntPtr name, uint max);
    }

    [ComImport, Guid("000214F4-0000-0000-C000-000000000046"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IContextMenu2
    {
        [PreserveSig] int QueryContextMenu(IntPtr hmenu, uint indexMenu, int idCmdFirst, int idCmdLast, uint flags);

        [PreserveSig] int InvokeCommand(ref CMINVOKECOMMANDINFOEX info);

        [PreserveSig] int GetCommandString(IntPtr idCmd, uint type, IntPtr reserved, IntPtr name, uint max);

        [PreserveSig] int HandleMenuMsg(uint msg, IntPtr wParam, IntPtr lParam);
    }

    [ComImport, Guid("BCFCE0A0-EC17-11D0-8D10-00A0C90F2719"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IContextMenu3
    {
        [PreserveSig] int QueryContextMenu(IntPtr hmenu, uint indexMenu, int idCmdFirst, int idCmdLast, uint flags);

        [PreserveSig] int InvokeCommand(ref CMINVOKECOMMANDINFOEX info);

        [PreserveSig] int GetCommandString(IntPtr idCmd, uint type, IntPtr reserved, IntPtr name, uint max);

        [PreserveSig] int HandleMenuMsg(uint msg, IntPtr wParam, IntPtr lParam);

        [PreserveSig] int HandleMenuMsg2(uint msg, IntPtr wParam, IntPtr lParam, out IntPtr result);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CMINVOKECOMMANDINFOEX
    {
        public int cbSize;
        public uint fMask;
        public IntPtr hwnd;
        public IntPtr lpVerb;
        [MarshalAs(UnmanagedType.LPStr)] public string? lpParameters;
        [MarshalAs(UnmanagedType.LPStr)] public string? lpDirectory;
        public int nShow;
        public uint dwHotKey;
        public IntPtr hIcon;
        [MarshalAs(UnmanagedType.LPStr)] public string? lpTitle;
        public IntPtr lpVerbW;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpParametersW;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpDirectoryW;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpTitleW;
        public POINT ptInvoke;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHParseDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr bindContext,
        out IntPtr pidl, uint attributesIn, out uint attributesOut);

    [DllImport("shell32.dll")]
    private static extern int SHBindToParent(IntPtr pidl, ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellFolder parent, out IntPtr child);

    [DllImport("shell32.dll")]
    private static extern int SHGetDesktopFolder([MarshalAs(UnmanagedType.Interface)] out IShellFolder folder);

    [DllImport("shell32.dll")]
    private static extern void ILFree(IntPtr pidl);

    [DllImport("shell32.dll")]
    private static extern IntPtr ILClone(IntPtr pidl);

    [DllImport("user32.dll")]
    private static extern IntPtr CreatePopupMenu();

    [DllImport("user32.dll")]
    private static extern bool DestroyMenu(IntPtr menu);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool AppendMenu(IntPtr menu, uint flags, IntPtr id,
        [MarshalAs(UnmanagedType.LPWStr)] string? item);

    [DllImport("user32.dll")]
    private static extern int TrackPopupMenuEx(IntPtr menu, uint flags, int x, int y, IntPtr hwnd, IntPtr parameters);

    [DllImport("user32.dll")]
    private static extern int GetMenuItemCount(IntPtr menu);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetMenuItemInfoW")]
    private static extern bool GetMenuItemInfo(IntPtr menu, uint item, bool byPosition, ref MENUITEMINFO info);

    [StructLayout(LayoutKind.Sequential)]
    private struct MENUITEMINFO
    {
        public int cbSize;
        public uint fMask;
        public uint fType;
        public uint fState;
        public uint wID;
        public IntPtr hSubMenu;
        public IntPtr hbmpChecked;
        public IntPtr hbmpUnchecked;
        public IntPtr dwItemData;
        public IntPtr dwTypeData;
        public uint cch;
        public IntPtr hbmpItem;
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
}
