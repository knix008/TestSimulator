namespace FTPServerWinV10.Server
{
    /// <summary>
    /// Maps FTP virtual paths (/name) to physical directories.
    /// "/" is the virtual root; each registered entry appears as a subdirectory under it.
    /// </summary>
    public class VirtualFileSystem
    {
        private readonly Dictionary<string, string> _mounts; // virtualName → physicalPath

        public VirtualFileSystem(IEnumerable<SharedFolderEntry> entries)
        {
            _mounts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var e in entries)
            {
                var name = e.VirtualName.Trim('/', ' ');
                if (!string.IsNullOrEmpty(name) && Directory.Exists(e.PhysicalPath))
                    _mounts[name] = e.PhysicalPath;
            }
        }

        public IReadOnlyCollection<string> VirtualNames => _mounts.Keys;
        public bool HasMounts => _mounts.Count > 0;

        /// <summary>Resolves a normalized FTP path to a physical path. Returns null for "/" or unknown paths.</summary>
        public string? Resolve(string normalizedFtpPath)
        {
            if (normalizedFtpPath == "/") return null;

            var parts = normalizedFtpPath.TrimStart('/').Split('/', 2);
            if (!_mounts.TryGetValue(parts[0], out var mountRoot)) return null;
            if (parts.Length == 1) return mountRoot;

            var sub = parts[1].Replace('/', Path.DirectorySeparatorChar);
            var full = Path.GetFullPath(Path.Combine(mountRoot, sub));
            // Security: prevent directory traversal outside the mount root
            return full.StartsWith(mountRoot, StringComparison.OrdinalIgnoreCase) ? full : null;
        }

        /// <summary>Returns true if the FTP path points to an existing directory (including virtual root).</summary>
        public bool DirectoryExists(string normalizedFtpPath)
        {
            if (normalizedFtpPath == "/") return true;
            var physical = Resolve(normalizedFtpPath);
            if (physical != null) return Directory.Exists(physical);
            // Path has one segment that is a known virtual name → the mount root
            var seg = normalizedFtpPath.TrimStart('/');
            return !seg.Contains('/') && _mounts.ContainsKey(seg);
        }

        /// <summary>Normalizes an FTP path, resolving ".." and "." segments.</summary>
        public static string NormalizePath(string path)
        {
            if (string.IsNullOrEmpty(path)) return "/";
            var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            var stack = new Stack<string>();
            foreach (var p in parts)
            {
                if (p == "..") { if (stack.Count > 0) stack.Pop(); }
                else if (p != ".") stack.Push(p);
            }
            return "/" + string.Join("/", stack.Reverse());
        }
    }
}
