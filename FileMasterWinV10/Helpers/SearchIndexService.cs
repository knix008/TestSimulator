using System.Collections.Concurrent;
using System.Text;

namespace FileMasterWinV10.Helpers;

public enum IndexState { NotBuilt, Building, Ready }

/// <summary>인덱스에 저장되는 단일 파일/폴더 항목.</summary>
public sealed record IndexedEntry(string FullPath, string Name, long Size, long ModifiedUtc, bool IsDirectory);

/// <summary>
/// 모든 고정 드라이브의 파일/폴더 이름을 백그라운드로 색인하여 빠른 검색을 제공한다.
/// - 최초 실행 시 전체 색인을 만들고 디스크에 저장한다.
/// - FileSystemWatcher로 추가/삭제/이름변경을 감지해 증분 갱신한다.
/// - 수동 재색인(RebuildAsync)을 지원한다.
/// </summary>
public sealed class SearchIndexService : IDisposable
{
    public static SearchIndexService Instance { get; } = new();

    private readonly ConcurrentDictionary<string, IndexedEntry> _entries = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<FileSystemWatcher> _watchers = new();
    private readonly object _buildLock = new();
    private CancellationTokenSource? _buildCts;

    private int _indexedCount;
    private volatile bool _dirty;
    private System.Threading.Timer? _autoSaveTimer;

    public IndexState State { get; private set; } = IndexState.NotBuilt;
    public int Count => _entries.Count;

    /// <summary>색인 진행 중이면 지금까지 색인한 항목 수, 완료 상태면 전체 항목 수.</summary>
    public int IndexedCount => State == IndexState.Building ? _indexedCount : _entries.Count;

    public DateTime? LastBuiltUtc { get; private set; }

    /// <summary>State/Count가 바뀔 때 발생(백그라운드 스레드에서 호출될 수 있음).</summary>
    public event EventHandler? StatusChanged;

    private static string IndexFilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "CommandCenter", "search-index.bin");

    private SearchIndexService() { }

    /// <summary>저장된 색인이 있으면 로드하고, 없으면 백그라운드로 새로 만든다. 이후 변경 감시를 시작한다.</summary>
    public void Initialize()
    {
        // 로드/감시 시작을 백그라운드에서 수행해 UI 시작을 막지 않는다.
        Task.Run(() =>
        {
            if (TryLoad())
            {
                State = IndexState.Ready;
                RaiseStatus();
                StartWatching();
                StartAutoSave();
            }
            else
            {
                _ = RebuildAsync();
            }
        });
    }

    // 변경분을 주기적으로 백그라운드 저장한다(종료 시 UI를 막지 않기 위함).
    private void StartAutoSave()
    {
        _autoSaveTimer ??= new System.Threading.Timer(_ =>
        {
            if (!_dirty) return;
            _dirty = false;
            TrySave();
        }, null, TimeSpan.FromSeconds(120), TimeSpan.FromSeconds(120));
    }

    /// <summary>전체 드라이브를 다시 스캔하여 색인을 새로 만든다(수동 재색인).</summary>
    public Task RebuildAsync()
    {
        CancellationToken ct;
        lock (_buildLock)
        {
            _buildCts?.Cancel();
            _buildCts = new CancellationTokenSource();
            ct = _buildCts.Token;
        }

        return Task.Run(() =>
        {
            _indexedCount = 0;
            State = IndexState.Building;
            RaiseStatus();
            try
            {
                var map = new ConcurrentDictionary<string, IndexedEntry>(StringComparer.OrdinalIgnoreCase);
                foreach (var drive in DriveInfo.GetDrives())
                {
                    if (ct.IsCancellationRequested) return;
                    if (drive.DriveType != DriveType.Fixed || !drive.IsReady) continue;
                    ScanSubtree(drive.RootDirectory.FullName, map, ct, () =>
                    {
                        int c = Interlocked.Increment(ref _indexedCount);
                        if ((c & 0x0FFF) == 0) RaiseStatus(); // 약 4096개마다 진척 보고
                    });
                }

                if (ct.IsCancellationRequested) return;

                _entries.Clear();
                foreach (var kv in map) _entries[kv.Key] = kv.Value;
                LastBuiltUtc = DateTime.UtcNow;
                State = IndexState.Ready;
                _dirty = false;
                TrySave();
                RaiseStatus();
                StartWatching();
                StartAutoSave();
            }
            catch (OperationCanceledException) { }
            finally
            {
                // 취소로 중단된 경우 상태를 되돌린다.
                if (State == IndexState.Building)
                {
                    State = _entries.Count > 0 ? IndexState.Ready : IndexState.NotBuilt;
                    RaiseStatus();
                }
            }
        }, ct);
    }

    /// <summary>진행 중인 색인 작업을 중지한다.</summary>
    public void CancelBuild()
    {
        lock (_buildLock) _buildCts?.Cancel();
    }

    private static void ScanSubtree(string root, ConcurrentDictionary<string, IndexedEntry> map, CancellationToken ct, Action? onItem = null)
    {
        var stack = new Stack<string>();
        stack.Push(root);

        while (stack.Count > 0)
        {
            if (ct.IsCancellationRequested) return;
            var dir = stack.Pop();

            IEnumerable<FileSystemInfo> children;
            try
            {
                var di = new DirectoryInfo(dir);
                if ((di.Attributes & FileAttributes.ReparsePoint) != 0) continue; // 심볼릭 링크/정션 순환 방지
                children = di.EnumerateFileSystemInfos();
            }
            catch { continue; }

            foreach (var info in children)
            {
                if (ct.IsCancellationRequested) return;
                try
                {
                    bool isDir = (info.Attributes & FileAttributes.Directory) != 0;
                    long size = isDir ? 0 : ((FileInfo)info).Length;
                    map[info.FullName] = new IndexedEntry(info.FullName, info.Name, size, info.LastWriteTimeUtc.Ticks, isDir);
                    onItem?.Invoke();
                    if (isDir && (info.Attributes & FileAttributes.ReparsePoint) == 0)
                        stack.Push(info.FullName);
                }
                catch { }
            }
        }
    }

    // ──────────────────── 검색 ────────────────────

    /// <summary>색인에서 이름 기준으로 검색해 정렬된 경로 목록을 반환한다.</summary>
    public List<string> Search(string pattern, FileSearchOptions options, string? root, CancellationToken ct)
    {
        if (!DesktopSearchHelper.TryCreateQuery(pattern, options, out var query))
            return [];

        string? rootPrefix = string.IsNullOrWhiteSpace(root) ? null : root;
        var matches = new List<SearchMatch>();

        foreach (var e in _entries.Values)
        {
            if (ct.IsCancellationRequested) break;
            if (e.IsDirectory && !options.IncludeFolders) continue;
            if (rootPrefix != null && !e.FullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase)) continue;

            int score = DesktopSearchHelper.ScoreName(e.Name, query, options.CaseSensitive);
            if (score > 0)
                matches.Add(new SearchMatch(e.FullPath, e.Name, e.ModifiedUtc, score));
        }

        return DesktopSearchHelper.SortMatches(matches, options.SortOrder, options.CaseSensitive)
            .Select(m => m.FullPath)
            .ToList();
    }

    // ──────────────────── 변경 감시(증분 갱신) ────────────────────

    public void StartWatching()
    {
        StopWatching();
        foreach (var drive in DriveInfo.GetDrives())
        {
            if (drive.DriveType != DriveType.Fixed || !drive.IsReady) continue;
            try
            {
                var w = new FileSystemWatcher(drive.RootDirectory.FullName)
                {
                    IncludeSubdirectories = true,
                    InternalBufferSize = 64 * 1024,
                    NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName
                                 | NotifyFilters.LastWrite | NotifyFilters.Size,
                };
                w.Created += (_, e) => IndexPath(e.FullPath);
                w.Deleted += (_, e) => RemovePath(e.FullPath);
                w.Renamed += (_, e) => { RemovePath(e.OldFullPath); IndexPath(e.FullPath); };
                w.Changed += (_, e) => { if (File.Exists(e.FullPath)) IndexPath(e.FullPath); };
                w.Error += (_, _) => _ = RebuildAsync(); // 버퍼 오버플로 등 → 재색인
                w.EnableRaisingEvents = true;
                _watchers.Add(w);
            }
            catch { }
        }
    }

    public void StopWatching()
    {
        foreach (var w in _watchers)
        {
            try { w.EnableRaisingEvents = false; w.Dispose(); } catch { }
        }
        _watchers.Clear();
    }

    private void IndexPath(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                var di = new DirectoryInfo(path);
                _entries[path] = new IndexedEntry(path, di.Name, 0, di.LastWriteTimeUtc.Ticks, true);
                // 폴더가 통째로 이동/생성된 경우 하위 항목도 색인한다.
                if ((di.Attributes & FileAttributes.ReparsePoint) == 0)
                {
                    var map = new ConcurrentDictionary<string, IndexedEntry>(StringComparer.OrdinalIgnoreCase);
                    ScanSubtree(path, map, CancellationToken.None);
                    foreach (var kv in map) _entries[kv.Key] = kv.Value;
                }
            }
            else if (File.Exists(path))
            {
                var fi = new FileInfo(path);
                _entries[path] = new IndexedEntry(path, fi.Name, fi.Length, fi.LastWriteTimeUtc.Ticks, false);
            }
            _dirty = true;
        }
        catch { }
    }

    private void RemovePath(string path)
    {
        _entries.TryRemove(path, out _);
        var prefix = path.TrimEnd('\\', '/') + "\\";
        foreach (var key in _entries.Keys)
        {
            if (key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                _entries.TryRemove(key, out _);
        }
        _dirty = true;
    }

    // ──────────────────── 영속화 ────────────────────

    private bool TryLoad()
    {
        try
        {
            var path = IndexFilePath;
            if (!File.Exists(path)) return false;

            using var fs = File.OpenRead(path);
            using var br = new BinaryReader(fs, Encoding.UTF8);
            long ticks = br.ReadInt64();
            int count = br.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                string full = br.ReadString();
                string name = br.ReadString();
                long size = br.ReadInt64();
                long mod = br.ReadInt64();
                bool dir = br.ReadBoolean();
                _entries[full] = new IndexedEntry(full, name, size, mod, dir);
            }
            LastBuiltUtc = new DateTime(ticks, DateTimeKind.Utc);
            return _entries.Count > 0;
        }
        catch
        {
            _entries.Clear();
            return false;
        }
    }

    public void Save() => TrySave();

    private void TrySave()
    {
        try
        {
            var path = IndexFilePath;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var snapshot = _entries.Values.ToArray();

            var tmp = path + ".tmp";
            using (var fs = File.Create(tmp))
            using (var bw = new BinaryWriter(fs, Encoding.UTF8))
            {
                bw.Write((LastBuiltUtc ?? DateTime.UtcNow).Ticks);
                bw.Write(snapshot.Length);
                foreach (var e in snapshot)
                {
                    bw.Write(e.FullPath);
                    bw.Write(e.Name);
                    bw.Write(e.Size);
                    bw.Write(e.ModifiedUtc);
                    bw.Write(e.IsDirectory);
                }
            }
            File.Move(tmp, path, overwrite: true);
        }
        catch { }
    }

    private void RaiseStatus() => StatusChanged?.Invoke(this, EventArgs.Empty);

    public void Dispose()
    {
        // 종료를 즉시 처리한다. 저장은 백그라운드로 흘려보내(대기하지 않음),
        // 미저장분은 주기적 자동저장/다음 재색인으로 복구된다.
        lock (_buildLock) _buildCts?.Cancel();
        _autoSaveTimer?.Dispose();
        _autoSaveTimer = null;
        StopWatching();
        if (_dirty)
        {
            _dirty = false;
            Task.Run(() => TrySave());
        }
    }
}
