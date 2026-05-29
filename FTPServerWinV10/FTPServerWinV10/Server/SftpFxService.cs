using FxSsh;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

// SFTP subsystem (v3) — adapted from FxSsh SshServerLoader sample (MIT).
namespace FTPServerWinV10.Server
{
    public sealed class SftpFxService
    {
        private const int MaxNamesPerReadDir = 48;

        #region defines
        private const byte SSH_FXP_INIT = 1;
        private const byte SSH_FXP_VERSION = 2;
        private const byte SSH_FXP_OPEN = 3;
        private const byte SSH_FXP_CLOSE = 4;
        private const byte SSH_FXP_READ = 5;
        private const byte SSH_FXP_WRITE = 6;
        private const byte SSH_FXP_LSTAT = 7;
        private const byte SSH_FXP_FSTAT = 8;
        private const byte SSH_FXP_SETSTAT = 9;
        private const byte SSH_FXP_FSETSTAT = 10;
        private const byte SSH_FXP_OPENDIR = 11;
        private const byte SSH_FXP_READDIR = 12;
        private const byte SSH_FXP_REMOVE = 13;
        private const byte SSH_FXP_MKDIR = 14;
        private const byte SSH_FXP_RMDIR = 15;
        private const byte SSH_FXP_REALPATH = 16;
        private const byte SSH_FXP_STAT = 17;
        private const byte SSH_FXP_RENAME = 18;

        private const byte SSH_FXP_STATUS = 101;
        private const byte SSH_FXP_HANDLE = 102;
        private const byte SSH_FXP_DATA = 103;
        private const byte SSH_FXP_NAME = 104;
        private const byte SSH_FXP_ATTRS = 105;

        private const uint SSH_FILEXFER_ATTR_SIZE = 0x00000001;
        private const uint SSH_FILEXFER_ATTR_UIDGID = 0x00000002;
        private const uint SSH_FILEXFER_ATTR_PERMISSIONS = 0x00000004;
        private const uint SSH_FILEXFER_ATTR_ACMODTIME = 0x00000008;
        private const uint SSH_FILEXFER_ATTR_EXTENDED = 0x80000000;

        private const uint SSH_FXF_READ = 0x00000001;
        private const uint SSH_FXF_WRITE = 0x00000002;
        private const uint SSH_FXF_APPEND = 0x00000004;
        private const uint SSH_FXF_CREAT = 0x00000008;
        private const uint SSH_FXF_TRUNC = 0x00000010;

        private const int SSH_FX_OK = 0;
        private const int SSH_FX_EOF = 1;
        private const int SSH_FX_NO_SUCH_FILE = 2;
        private const int SSH_FX_PERMISSION_DENIED = 3;
        private const int SSH_FX_FAILURE = 4;
        private const int SSH_FX_OP_UNSUPPORTED = 8;
        #endregion

        private sealed class DirHandleState
        {
            public bool VirtualRoot;
            public string? PhysicalPath;
            public FileStruct[]? Entries;
            public int Index;
        }

        private readonly CancellationTokenSource _cancellationTokenSource = new();
        private readonly Dictionary<string, (string path, FileStream? fs)> _fileHandles = [];
        private readonly Dictionary<string, DirHandleState> _dirHandles = [];
        private readonly VirtualFileSystem _vfs;
        private readonly SessionPermissions _permissions;
        private readonly Action<string>? _log;
        private byte[]? _pandingBytes;
        private int _handleCursor;

        public SftpFxService(VirtualFileSystem vfs, SessionPermissions permissions, Action<string>? log = null)
        {
            _vfs = vfs;
            _permissions = permissions;
            _log = log;
        }

        public void OnData(byte[] data)
        {
            _pandingBytes = _pandingBytes == null ? data : [.. _pandingBytes, .. data];

            while (_pandingBytes is { Length: >= 4 })
            {
                var reader = new SshDataReader(_pandingBytes);
                var length = (int)reader.ReadUInt32() + 4;
                if (_pandingBytes.Length < length)
                    break;

                var packet = _pandingBytes.AsMemory()[..length];
                _pandingBytes = _pandingBytes.Length > length ? _pandingBytes[length..] : null;
                ProcessRequest(new SshDataReader(packet));
            }
        }

        public void OnClose() => _cancellationTokenSource.Cancel();

        public void WaitForClose() => Task.Delay(-1, _cancellationTokenSource.Token).Wait();

        public event EventHandler<byte[]>? DataReceived;

        #region Process requests
        private void ProcessRequest(SshDataReader reader)
        {
            // SSH 채널에서 받은 버퍼는 [길이(4)][타입(1)][본문…] 형식이다.
            if (reader.DataAvailable >= 4)
                reader.ReadUInt32();

            var packetType = reader.ReadByte();
            switch (packetType)
            {
                case SSH_FXP_INIT: ProcessInit(reader); break;
                case SSH_FXP_OPEN: ProcessOpen(reader); break;
                case SSH_FXP_CLOSE: ProcessClose(reader); break;
                case SSH_FXP_READ: ProcessRead(reader); break;
                case SSH_FXP_WRITE: ProcessWrite(reader); break;
                case SSH_FXP_LSTAT: ProcessLStat(reader); break;
                case SSH_FXP_FSTAT: ProcessFStat(reader); break;
                case SSH_FXP_SETSTAT: ProcessSetStat(reader); break;
                case SSH_FXP_FSETSTAT: ProcessFSetStat(reader); break;
                case SSH_FXP_OPENDIR: ProcessOpenDir(reader); break;
                case SSH_FXP_READDIR: ProcessReadDir(reader); break;
                case SSH_FXP_REMOVE: ProcessRemove(reader); break;
                case SSH_FXP_MKDIR: ProcessMakeDir(reader); break;
                case SSH_FXP_RMDIR: ProcessRemoveDir(reader); break;
                case SSH_FXP_REALPATH: ProcessRealPath(reader); break;
                case SSH_FXP_STAT: ProcessLStat(reader); break;
                case SSH_FXP_RENAME: ProcessRename(reader); break;
                default:
                    SendStatus(0, SSH_FX_OP_UNSUPPORTED, $"Unsupported packet type '{packetType:X}'.", "en");
                    break;
            }
        }

        private void ProcessInit(SshDataReader reader)
        {
            var clientVersion = reader.ReadUInt32();
            SendInit();
            Log($"FXP_INIT (client v{clientVersion}) -> FXP_VERSION 3");
        }

        private void ProcessRealPath(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var path = reader.ReadString(Encoding.UTF8);
            var virtualPath = ToVirtualPath(path);
            var attr = IsVirtualRoot(virtualPath) ? CreateDirectoryAttr()
                : TryGetFileSystemInfo(virtualPath, out var info) ? GetAttr(info) : CreateDirectoryAttr();
            var dummyFile = new FileStruct { FileName = virtualPath, LongName = "", fileAttr = attr };
            SendName(requestId, [dummyFile]);
        }

        private void ProcessOpenDir(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var path = reader.ReadString(Encoding.UTF8);
            var virtualPath = ToVirtualPath(path);

            if (!_permissions.CanRead)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, $"Denied to access '{path}'.", "en");
                return;
            }

            if (IsVirtualRoot(virtualPath))
            {
                var handle = NextHandle();
                _dirHandles[handle] = new DirHandleState { VirtualRoot = true };
                SendHandle(requestId, handle);
                Log($"OPENDIR {virtualPath} (virtual root)");
                return;
            }

            var physical = ResolvePhysicalPath(virtualPath);
            if (physical != null && Directory.Exists(physical) && HasReadPermission(physical))
            {
                var handle = NextHandle();
                _dirHandles[handle] = new DirHandleState { PhysicalPath = physical };
                SendHandle(requestId, handle);
                Log($"OPENDIR {virtualPath} -> {physical}");
                return;
            }

            SendStatus(requestId, SSH_FX_NO_SUCH_FILE, $"No such folder '{path}'.", "en");
            Log($"OPENDIR failed: {path} (virtual={virtualPath})");
        }

        private void ProcessReadDir(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var handle = reader.ReadString(Encoding.ASCII);

            if (!_dirHandles.TryGetValue(handle, out var state))
            {
                SendStatus(requestId, SSH_FX_EOF, "", "");
                return;
            }

            try
            {
                state.Entries ??= LoadDirEntries(state);
                if (state.Index >= state.Entries.Length)
                {
                    _dirHandles.Remove(handle);
                    SendStatus(requestId, SSH_FX_EOF, "", "");
                    return;
                }

                var batch = state.Entries
                    .Skip(state.Index)
                    .Take(MaxNamesPerReadDir)
                    .ToArray();
                state.Index += batch.Length;

                if (batch.Length == 0)
                {
                    _dirHandles.Remove(handle);
                    SendStatus(requestId, SSH_FX_EOF, "", "");
                    return;
                }

                SendName(requestId, batch);
                if (state.Index >= state.Entries.Length)
                    _dirHandles.Remove(handle);
            }
            catch (Exception ex)
            {
                _dirHandles.Remove(handle);
                SendStatus(requestId, SSH_FX_FAILURE, "Failed to read directory.", "en");
                Log($"READDIR error: {ex.Message}");
            }
        }

        private void ProcessClose(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var handle = reader.ReadString(Encoding.ASCII);

            if (_fileHandles.TryGetValue(handle, out var file))
            {
                file.fs?.Close();
                _fileHandles.Remove(handle);
            }
            _dirHandles.Remove(handle);
            SendStatus(requestId, SSH_FX_OK, "", "");
        }

        private void ProcessLStat(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var path = reader.ReadString(Encoding.UTF8);
            StatPath(requestId, ToVirtualPath(path), path);
        }

        private void ProcessFStat(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var handle = reader.ReadString(Encoding.ASCII);

            if (_dirHandles.TryGetValue(handle, out var dir))
            {
                if (!_permissions.CanRead)
                {
                    SendStatus(requestId, SSH_FX_PERMISSION_DENIED, "Denied.", "en");
                    return;
                }
                if (dir.VirtualRoot)
                    SendAttrs(requestId, CreateDirectoryAttr());
                else if (dir.PhysicalPath != null)
                    SendAttrs(requestId, GetAttr(new DirectoryInfo(dir.PhysicalPath)));
                else
                    SendAttrs(requestId, CreateDirectoryAttr());
                return;
            }

            if (_fileHandles.TryGetValue(handle, out var file))
            {
                if (!_permissions.CanRead)
                {
                    SendStatus(requestId, SSH_FX_PERMISSION_DENIED, "Denied.", "en");
                    return;
                }
                try
                {
                    var info = File.GetAttributes(file.path).HasFlag(FileAttributes.Directory)
                        ? (FileSystemInfo)new DirectoryInfo(file.path)
                        : new FileInfo(file.path);
                    SendAttrs(requestId, GetAttr(info));
                }
                catch (Exception)
                {
                    SendStatus(requestId, SSH_FX_FAILURE, "Failed to stat handle.", "en");
                }
                return;
            }

            SendStatus(requestId, SSH_FX_FAILURE, $"Unknown handle '{handle}'.", "en");
        }

        private void ProcessOpen(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var filename = reader.ReadString(Encoding.UTF8);
            var pflags = reader.ReadUInt32();
            _ = ReadFileAttrs(reader);

            var needsRead = (pflags & SSH_FXF_READ) != 0;
            var needsWrite = (pflags & (SSH_FXF_WRITE | SSH_FXF_CREAT | SSH_FXF_TRUNC | SSH_FXF_APPEND)) != 0;
            if (needsRead && !_permissions.CanRead)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, $"Read not allowed: '{filename}'.", "en");
                return;
            }
            if (needsWrite && !_permissions.CanWrite)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, $"Write not allowed: '{filename}'.", "en");
                return;
            }

            try
            {
                var virtualPath = ToVirtualPath(filename);
                var physical = ResolvePhysicalPath(virtualPath);
                if (physical == null || Directory.Exists(physical))
                    throw new IOException("Not a file");

                var access = default(FileAccess);
                if ((pflags & SSH_FXF_READ) != 0) access |= FileAccess.Read;
                if ((pflags & SSH_FXF_WRITE) != 0) access |= FileAccess.Write;
                var mode = default(FileMode);
                if ((pflags & SSH_FXF_TRUNC) != 0) mode = FileMode.Create;
                else if ((pflags & SSH_FXF_CREAT) != 0) mode = FileMode.CreateNew;
                else if ((pflags & SSH_FXF_APPEND) != 0) mode = FileMode.Append;
                else mode = FileMode.Open;

                var fs = new FileStream(physical, mode, access);
                var handle = NextHandle();
                _fileHandles[handle] = (physical, fs);
                SendHandle(requestId, handle);
            }
            catch (Exception)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, $"Denied to open '{filename}'.", "en");
            }
        }

        private void ProcessRead(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var handle = reader.ReadString(Encoding.ASCII);
            var offset = reader.ReadUInt64();
            var length = reader.ReadUInt32();

            if (_fileHandles.TryGetValue(handle, out var map) && map.fs != null)
            {
                map.fs.Position = (long)offset;
                var buffer = new byte[length];
                var readLenth = map.fs.Read(buffer);
                if (readLenth > 0)
                    SendData(requestId, buffer.AsMemory()[..readLenth]);
                else
                    SendStatus(requestId, SSH_FX_EOF, "", "");
            }
            else
                SendStatus(requestId, SSH_FX_FAILURE, $"Unknown handle '{handle}'.", "en");
        }

        private void ProcessWrite(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var handle = reader.ReadString(Encoding.ASCII);
            var offset = reader.ReadUInt64();
            var data = reader.ReadBinary();

            if (!_permissions.CanWrite)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, "Write not allowed.", "en");
                return;
            }

            if (_fileHandles.TryGetValue(handle, out var map) && map.fs != null)
            {
                map.fs.Position = (long)offset;
                map.fs.Write(data);
                SendStatus(requestId, SSH_FX_OK, "", "");
            }
            else
                SendStatus(requestId, SSH_FX_FAILURE, $"Unknown handle '{handle}'.", "en");
        }

        private void ProcessSetStat(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var path = reader.ReadString(Encoding.UTF8);
            var attr = ReadFileAttrs(reader);
            if (!_permissions.CanWrite)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, "Write not allowed.", "en");
                return;
            }

            var physical = ResolvePhysicalPath(ToVirtualPath(path));
            if (physical != null && File.Exists(physical))
                SetAttr(new FileInfo(physical), attr);
            SendStatus(requestId, SSH_FX_OK, "", "");
        }

        private void ProcessFSetStat(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var handle = reader.ReadString(Encoding.ASCII);
            _ = ReadFileAttrs(reader);
            if (!_permissions.CanWrite)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, "Write not allowed.", "en");
                return;
            }

            if (_fileHandles.TryGetValue(handle, out var map))
                SetAttr(new FileInfo(map.path), new FileAttr());

            SendStatus(requestId, SSH_FX_OK, "", "");
        }

        private void ProcessRemove(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var filename = reader.ReadString(Encoding.UTF8);
            if (!_permissions.CanWrite)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, "Write not allowed.", "en");
                return;
            }

            var physical = ResolvePhysicalPath(ToVirtualPath(filename));
            if (physical == null)
            {
                SendStatus(requestId, SSH_FX_NO_SUCH_FILE, $"No such file '{filename}'.", "en");
                return;
            }

            try
            {
                File.Delete(physical);
                SendStatus(requestId, SSH_FX_OK, "", "");
            }
            catch (Exception)
            {
                SendStatus(requestId, SSH_FX_FAILURE, $"Failure to delete file '{filename}'.", "en");
            }
        }

        private void ProcessRename(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var oldpath = reader.ReadString(Encoding.UTF8);
            var newpath = reader.ReadString(Encoding.UTF8);
            if (!_permissions.CanWrite)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, "Write not allowed.", "en");
                return;
            }

            var absOldPath = ResolvePhysicalPath(ToVirtualPath(oldpath));
            var absNewPath = ResolvePhysicalPath(ToVirtualPath(newpath));
            if (absOldPath == null || absNewPath == null)
            {
                SendStatus(requestId, SSH_FX_NO_SUCH_FILE, "Path not found.", "en");
                return;
            }

            try
            {
                if (File.GetAttributes(absOldPath).HasFlag(FileAttributes.Directory))
                    Directory.Move(absOldPath, absNewPath);
                else
                    File.Move(absOldPath, absNewPath);
                SendStatus(requestId, SSH_FX_OK, "", "");
            }
            catch (Exception)
            {
                SendStatus(requestId, SSH_FX_FAILURE, $"Failure to rename '{oldpath}' to '{newpath}'.", "en");
            }
        }

        private void ProcessMakeDir(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var path = reader.ReadString(Encoding.UTF8);
            var attr = ReadFileAttrs(reader);
            if (!_permissions.CanWrite)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, "Write not allowed.", "en");
                return;
            }

            var physical = ResolvePhysicalPath(ToVirtualPath(path));
            if (physical == null)
            {
                SendStatus(requestId, SSH_FX_FAILURE, $"Failure to make directory '{path}'.", "en");
                return;
            }

            try
            {
                Directory.CreateDirectory(physical);
                SetAttr(new DirectoryInfo(physical), attr);
                SendStatus(requestId, SSH_FX_OK, "", "");
            }
            catch (Exception)
            {
                SendStatus(requestId, SSH_FX_FAILURE, $"Failure to make directory '{path}'.", "en");
            }
        }

        private void ProcessRemoveDir(SshDataReader reader)
        {
            var requestId = reader.ReadUInt32();
            var path = reader.ReadString(Encoding.UTF8);
            if (!_permissions.CanWrite)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, "Write not allowed.", "en");
                return;
            }

            var physical = ResolvePhysicalPath(ToVirtualPath(path));
            if (physical == null)
            {
                SendStatus(requestId, SSH_FX_FAILURE, $"Failure to delete directory '{path}'.", "en");
                return;
            }

            try
            {
                Directory.Delete(physical, false);
                SendStatus(requestId, SSH_FX_OK, "", "");
            }
            catch (Exception)
            {
                SendStatus(requestId, SSH_FX_FAILURE, $"Failure to delete directory '{path}'.", "en");
            }
        }
        #endregion

        #region Path / listing helpers
        private static string ToVirtualPath(string path) =>
            VirtualFileSystem.NormalizePath(path);

        private static bool IsVirtualRoot(string virtualPath) =>
            virtualPath == "/";

        private string? ResolvePhysicalPath(string virtualPath)
        {
            virtualPath = VirtualFileSystem.NormalizePath(virtualPath);
            if (virtualPath == "/")
                return _vfs.IsSingleMount ? _vfs.Resolve("/") : null;

            return _vfs.Resolve(virtualPath) ?? _vfs.ResolveListingPath(virtualPath);
        }

        private FileStruct[] LoadDirEntries(DirHandleState state)
        {
            if (state.VirtualRoot)
            {
                return _vfs.VirtualNames
                    .Select(name => MakeSyntheticDirEntry(name))
                    .ToArray();
            }

            if (state.PhysicalPath == null)
                return [];

            return EnumeratePhysicalDir(state.PhysicalPath);
        }

        private static FileStruct[] EnumeratePhysicalDir(string physicalPath)
        {
            var list = new List<FileStruct>();
            foreach (var x in new DirectoryInfo(physicalPath).EnumerateFileSystemInfos())
            {
                try
                {
                    list.Add(new FileStruct
                    {
                        FileName = x.Name,
                        LongName = FormatLongName(x),
                        fileAttr = GetAttr(x)
                    });
                }
                catch
                {
                }
            }
            return list.ToArray();
        }

        private static FileStruct MakeSyntheticDirEntry(string name) => new()
        {
            FileName = name,
            LongName = $"drwxrwxrwx 1 0 0 0 Jan  1  1970 {name}",
            fileAttr = CreateDirectoryAttr()
        };

        private void StatPath(uint requestId, string virtualPath, string originalPath)
        {
            if (!_permissions.CanRead)
            {
                SendStatus(requestId, SSH_FX_PERMISSION_DENIED, $"Denied to access '{originalPath}'.", "en");
                return;
            }

            if (IsVirtualRoot(virtualPath) && !_vfs.IsSingleMount)
            {
                SendAttrs(requestId, CreateDirectoryAttr());
                return;
            }

            if (_vfs.DirectoryExists(virtualPath) && ResolvePhysicalPath(virtualPath) == null)
            {
                SendAttrs(requestId, CreateDirectoryAttr());
                return;
            }

            if (!TryGetFileSystemInfo(virtualPath, out var info))
            {
                SendStatus(requestId, SSH_FX_NO_SUCH_FILE, $"No such file or directory '{originalPath}'.", "en");
                return;
            }

            try
            {
                SendAttrs(requestId, GetAttr(info));
            }
            catch (Exception)
            {
                SendStatus(requestId, SSH_FX_FAILURE, $"Failed to stat '{originalPath}'.", "en");
            }
        }

        private bool TryGetFileSystemInfo(string virtualPath, out FileSystemInfo info)
        {
            info = null!;
            var physical = ResolvePhysicalPath(virtualPath);
            if (physical == null)
                return false;
            if (!File.Exists(physical) && !Directory.Exists(physical))
                return false;
            info = File.GetAttributes(physical).HasFlag(FileAttributes.Directory)
                ? new DirectoryInfo(physical)
                : new FileInfo(physical);
            return true;
        }

        private static bool HasReadPermission(string physicalPath)
        {
            try
            {
                if (File.Exists(physicalPath))
                {
                    using var _ = File.Open(physicalPath, FileMode.Open, FileAccess.Read);
                    return true;
                }
                if (Directory.Exists(physicalPath))
                {
                    using var enumerator = new DirectoryInfo(physicalPath).EnumerateFileSystemInfos().GetEnumerator();
                    return true;
                }
            }
            catch
            {
            }
            return false;
        }

        private void Log(string message) => _log?.Invoke($"SFTP: {message}");
        #endregion

        #region Attrs / IO helpers
        private FileAttr ReadFileAttrs(SshDataReader reader)
        {
            var attr = new FileAttr();
            var flags = reader.ReadUInt32();
            if ((flags & SSH_FILEXFER_ATTR_SIZE) != 0) attr.Size = reader.ReadUInt64();
            if ((flags & SSH_FILEXFER_ATTR_UIDGID) != 0) attr.UserId = reader.ReadUInt32();
            if ((flags & SSH_FILEXFER_ATTR_UIDGID) != 0) attr.GroupId = reader.ReadUInt32();
            if ((flags & SSH_FILEXFER_ATTR_PERMISSIONS) != 0) attr.Permissions = reader.ReadUInt32();
            if ((flags & SSH_FILEXFER_ATTR_ACMODTIME) != 0) attr.AccessTime = reader.ReadUInt32();
            if ((flags & SSH_FILEXFER_ATTR_ACMODTIME) != 0) attr.ModificationTime = reader.ReadUInt32();
            if ((flags & SSH_FILEXFER_ATTR_EXTENDED) != 0)
            {
                var count = reader.ReadUInt32();
                var extends = new (string type, string data)[count];
                for (int i = 0; i < count; i++)
                {
                    extends[i].type = reader.ReadString(Encoding.ASCII);
                    extends[i].data = reader.ReadString(Encoding.UTF8);
                }
                attr.Extends = extends;
            }
            return attr;
        }

        private static FileAttr CreateDirectoryAttr() => new()
        {
            Permissions = 0x41EDu,
            AccessTime = (uint)DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            ModificationTime = (uint)DateTimeOffset.UtcNow.ToUnixTimeSeconds()
        };

        private static FileAttr GetAttr(FileSystemInfo info)
        {
            try
            {
                var isDir = info.Attributes.HasFlag(FileAttributes.Directory);
                return new FileAttr
                {
                    Size = isDir ? null : (ulong)new FileInfo(info.FullName).Length,
                    Permissions = isDir ? 0x41EDu : 0x81A4u,
                    AccessTime = (uint)new DateTimeOffset(info.LastAccessTimeUtc, TimeSpan.Zero).ToUnixTimeSeconds(),
                    ModificationTime = (uint)new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero).ToUnixTimeSeconds()
                };
            }
            catch
            {
                return new FileAttr();
            }
        }

        private static void SetAttr(FileSystemInfo info, FileAttr attr)
        {
            if (attr.AccessTime != null)
                info.LastAccessTimeUtc = DateTimeOffset.FromUnixTimeSeconds(attr.AccessTime.Value).UtcDateTime;
            if (attr.ModificationTime != null)
                info.LastWriteTimeUtc = DateTimeOffset.FromUnixTimeSeconds(attr.ModificationTime.Value).UtcDateTime;
        }

        private static string FormatLongName(FileSystemInfo info)
        {
            var isDir = info.Attributes.HasFlag(FileAttributes.Directory);
            var mode = isDir ? "drwxrwxrwx" : "-rw-rw-rw-";
            var size = isDir ? 0 : new FileInfo(info.FullName).Length;
            var stamp = info.LastWriteTimeUtc.ToString("MMM dd HH:mm", CultureInfo.InvariantCulture);
            return $"{mode} 1 0 0 {size,8} {stamp} {info.Name}";
        }

        private string NextHandle() =>
            Interlocked.Increment(ref _handleCursor).ToString();
        #endregion

        #region Process responses
        private void SendPacket(byte[] packet)
        {
            var length = packet.Length - 4;
            packet[0] = (byte)(length >> 24);
            packet[1] = (byte)(length >> 16);
            packet[2] = (byte)(length >> 8);
            packet[3] = (byte)(length & 0xFF);
            DataReceived?.Invoke(this, packet);
        }

        private void SendStatus(uint requestId, uint statusCode, string message, string language)
        {
            var writer = new SshDataWriter();
            writer.Write(0u);
            writer.Write(SSH_FXP_STATUS);
            writer.Write(requestId);
            writer.Write(statusCode);
            writer.Write(message, Encoding.ASCII);
            writer.Write(language, Encoding.ASCII);
            SendPacket(writer.ToByteArray());
        }

        private void SendInit()
        {
            var writer = new SshDataWriter(9);
            writer.Write(0u);
            writer.Write(SSH_FXP_VERSION);
            writer.Write((uint)3);
            SendPacket(writer.ToByteArray());
        }

        private void SendName(uint requestId, FileStruct[] fileNames)
        {
            var writer = new SshDataWriter();
            writer.Write(0u);
            writer.Write(SSH_FXP_NAME);
            writer.Write(requestId);
            writer.Write((uint)fileNames.Length);
            foreach (var file in fileNames)
            {
                writer.Write(file.FileName, Encoding.UTF8);
                writer.Write(file.LongName, Encoding.UTF8);
                WriteFileAttr(writer, file.fileAttr);
            }
            SendPacket(writer.ToByteArray());
        }

        private void SendHandle(uint requestId, string handle)
        {
            var writer = new SshDataWriter();
            writer.Write(0u);
            writer.Write(SSH_FXP_HANDLE);
            writer.Write(requestId);
            writer.Write(handle, Encoding.ASCII);
            SendPacket(writer.ToByteArray());
        }

        private void SendAttrs(uint requestId, FileAttr attr)
        {
            var writer = new SshDataWriter();
            writer.Write(0u);
            writer.Write(SSH_FXP_ATTRS);
            writer.Write(requestId);
            WriteFileAttr(writer, attr);
            SendPacket(writer.ToByteArray());
        }

        private void SendData(uint requestId, ReadOnlyMemory<byte> bytes)
        {
            var writer = new SshDataWriter();
            writer.Write(0u);
            writer.Write(SSH_FXP_DATA);
            writer.Write(requestId);
            writer.WriteBinary(bytes);
            SendPacket(writer.ToByteArray());
        }

        private static void WriteFileAttr(SshDataWriter writer, FileAttr attr)
        {
            writer.Write(attr.Flags);
            if (attr.Size != null) writer.Write(attr.Size.Value);
            if (attr.UserId != null) writer.Write(attr.UserId.Value);
            if (attr.GroupId != null) writer.Write(attr.GroupId.Value);
            if (attr.Permissions != null) writer.Write(attr.Permissions.Value);
            if (attr.AccessTime != null) writer.Write(attr.AccessTime.Value);
            if (attr.ModificationTime != null) writer.Write(attr.ModificationTime.Value);
            if (attr.ExtendedCount != null) writer.Write(attr.ExtendedCount.Value);
            if (attr.ExtendedCount > 0)
                foreach (var item in attr.Extends)
                {
                    writer.Write(item.type, Encoding.ASCII);
                    writer.Write(item.data, Encoding.UTF8);
                }
        }
        #endregion

        private sealed class FileStruct
        {
            public string FileName = "";
            public string LongName = "";
            public FileAttr fileAttr = new();
        }

        private sealed class FileAttr
        {
            public uint Flags
            {
                get
                {
                    var flags = 0u;
                    if (Size != null) flags |= SSH_FILEXFER_ATTR_SIZE;
                    if (UserId != null || GroupId != null) flags |= SSH_FILEXFER_ATTR_UIDGID;
                    if (Permissions != null) flags |= SSH_FILEXFER_ATTR_PERMISSIONS;
                    if (AccessTime != null || ModificationTime != null) flags |= SSH_FILEXFER_ATTR_ACMODTIME;
                    if (ExtendedCount != null) flags |= SSH_FILEXFER_ATTR_EXTENDED;
                    return flags;
                }
            }
            public ulong? Size;
            public uint? UserId;
            public uint? GroupId;
            public uint? Permissions;
            public uint? AccessTime;
            public uint? ModificationTime;
            public uint? ExtendedCount => Extends == null ? null : (uint)Extends.Length;
            public (string type, string data)[] Extends = [];
        }
    }
}
