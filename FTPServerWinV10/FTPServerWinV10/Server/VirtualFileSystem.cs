namespace FTPServerWinV10.Server
{
    /// <summary>
    /// Maps FTP virtual paths (/name/...) to physical directories.
    /// Single mount: "/" is the share root (files visible directly).
    /// Multiple mounts: "/" lists virtual names; "/name/..." maps to each physical folder.
    /// </summary>
    public class VirtualFileSystem
    {
        private readonly Dictionary<string, string> _mounts;
        private readonly bool _singleMount;
        private readonly string? _singleVirtualName;
        private readonly string? _singlePhysicalRoot;

        public VirtualFileSystem(IEnumerable<SharedFolderEntry> entries)
        {
            _mounts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var e in entries)
            {
                var name = e.VirtualName.Trim('/', ' ');
                if (string.IsNullOrEmpty(name) || !Directory.Exists(e.PhysicalPath))
                    continue;
                _mounts[name] = NormalizePhysicalRoot(e.PhysicalPath);
            }

            _singleMount = _mounts.Count == 1;
            if (_singleMount)
            {
                _singleVirtualName = _mounts.Keys.First();
                _singlePhysicalRoot = _mounts.Values.First();
            }
        }

        public IReadOnlyCollection<string> VirtualNames => _mounts.Keys;
        public bool HasMounts => _mounts.Count > 0;
        public bool IsSingleMount => _singleMount;

        /// <summary>
        /// Resolves a normalized FTP path to a physical path.
        /// Returns null only for multi-mount virtual root "/".
        /// </summary>
        public string? Resolve(string normalizedFtpPath)
        {
            normalizedFtpPath = NormalizePath(normalizedFtpPath);
            if (normalizedFtpPath == "/")
                return _singleMount ? _singlePhysicalRoot : null;

            return _singleMount
                ? ResolveSingleMount(normalizedFtpPath)
                : ResolveMultiMount(normalizedFtpPath);
        }

        /// <summary>Physical directory to list for LIST/NLST at the given FTP path.</summary>
        public string? ResolveListingPath(string normalizedFtpPath)
        {
            normalizedFtpPath = NormalizePath(normalizedFtpPath);
            if (normalizedFtpPath == "/")
                return _singleMount ? _singlePhysicalRoot : null;
            return Resolve(normalizedFtpPath);
        }

        public bool DirectoryExists(string normalizedFtpPath)
        {
            normalizedFtpPath = NormalizePath(normalizedFtpPath);
            if (normalizedFtpPath == "/") return true;

            var physical = Resolve(normalizedFtpPath);
            if (physical != null && Directory.Exists(physical))
                return true;

            if (!_singleMount)
            {
                var seg = normalizedFtpPath.TrimStart('/');
                return !seg.Contains('/') && _mounts.ContainsKey(seg);
            }

            return false;
        }

        public static string NormalizePath(string path)
        {
            if (string.IsNullOrEmpty(path)) return "/";
            path = path.Replace('\\', '/');
            var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            var stack = new Stack<string>();
            foreach (var p in parts)
            {
                if (p == "..") { if (stack.Count > 0) stack.Pop(); }
                else if (p != ".") stack.Push(p);
            }
            return "/" + string.Join("/", stack.Reverse());
        }

        private string? ResolveSingleMount(string normalizedFtpPath)
        {
            var path = StripVirtualPrefix(normalizedFtpPath, _singleVirtualName!);
            if (path == "/" || string.IsNullOrEmpty(path))
                return _singlePhysicalRoot;

            var sub = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var full = Path.GetFullPath(Path.Combine(_singlePhysicalRoot!, sub));
            return IsUnderRoot(full, _singlePhysicalRoot!) ? full : null;
        }

        private string? ResolveMultiMount(string normalizedFtpPath)
        {
            var parts = normalizedFtpPath.TrimStart('/').Split('/', 2);
            if (!_mounts.TryGetValue(parts[0], out var mountRoot))
                return null;
            if (parts.Length == 1)
                return mountRoot;

            var sub = parts[1].Replace('/', Path.DirectorySeparatorChar);
            var full = Path.GetFullPath(Path.Combine(mountRoot, sub));
            return IsUnderRoot(full, mountRoot) ? full : null;
        }

        private static string StripVirtualPrefix(string normalizedFtpPath, string virtualName)
        {
            var prefix = "/" + virtualName;
            if (normalizedFtpPath.Equals(prefix, StringComparison.OrdinalIgnoreCase))
                return "/";
            if (normalizedFtpPath.StartsWith(prefix + "/", StringComparison.OrdinalIgnoreCase))
                return normalizedFtpPath[prefix.Length..];
            return normalizedFtpPath;
        }

        private static string NormalizePhysicalRoot(string physicalPath) =>
            Path.GetFullPath(physicalPath)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        private static bool IsUnderRoot(string fullPath, string rootPath)
        {
            var rootFull = NormalizePhysicalRoot(rootPath);
            var full = Path.GetFullPath(fullPath);
            if (full.Equals(rootFull, StringComparison.OrdinalIgnoreCase))
                return true;
            var prefix = rootFull + Path.DirectorySeparatorChar;
            return full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
        }
    }
}
