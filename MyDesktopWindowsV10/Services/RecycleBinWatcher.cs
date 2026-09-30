using System.Runtime.InteropServices;
using System.Windows.Threading;

namespace Palisades.Services;

/// <summary>
/// Explorer swaps the Recycle Bin icon the moment the bin fills or empties, no matter who did the
/// deleting. Palisades draws its own copy of that icon, so it has to notice the same thing. The
/// shell offers no event worth the interop here, but asking how much is in the bin is cheap: the
/// answer comes from the bin's own index, not from walking the files.
/// </summary>
public sealed class RecycleBinWatcher : IDisposable
{
    private readonly DispatcherTimer _timer;
    private long _items = -1;

    public RecycleBinWatcher()
    {
        _timer = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromSeconds(1) };
        _timer.Tick += (_, _) => Check();
    }

    /// <summary>Raised on the UI thread when the bin went from empty to full or back.</summary>
    public event Action? Changed;

    public void Start()
    {
        _items = Count();
        _timer.Start();
    }

    /// <summary>
    /// Looks now instead of waiting for the next tick, for when Palisades itself is what changed the
    /// bin and the icon should follow immediately.
    /// </summary>
    public void Check()
    {
        var count = Count();
        if (count == _items)
        {
            return;
        }

        // Only crossing between empty and not empty changes the icon, but the count is what tells us.
        var wasEmpty = _items <= 0;
        _items = count;

        if (wasEmpty != (count <= 0))
        {
            Diagnostics.Write($"recycle bin now holds {count} item(s)");
            Changed?.Invoke();
        }
    }

    public void Dispose() => _timer.Stop();

    /// <summary>
    /// True when the bin holds nothing, so there is nothing to offer emptying. A bin the shell will
    /// not answer for counts as not empty: an entry that turns out to have no work to do is better
    /// than one that goes missing when it should not.
    /// </summary>
    public static bool IsEmpty() => Count() == 0;

    private static long Count()
    {
        var info = new SHQUERYRBINFO { cbSize = Marshal.SizeOf<SHQUERYRBINFO>() };

        // A null root asks about every drive at once, which is what the desktop icon shows.
        return SHQueryRecycleBin(null, ref info) == 0 ? info.i64NumItems : -1;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SHQUERYRBINFO
    {
        public int cbSize;
        public long i64Size;
        public long i64NumItems;
    }

    [DllImport("shell32.dll", EntryPoint = "SHQueryRecycleBinW", CharSet = CharSet.Unicode)]
    private static extern int SHQueryRecycleBin(string? root, ref SHQUERYRBINFO info);
}
