using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace RemoteDesktopWinV10.App;

public static class ConnectionProfileStore
{
    private static readonly byte[] Entropy = "RemoteDesktopWinV10.Profile.v1"u8.ToArray();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static string ProfilesFilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "RemoteDesktopWinV10",
        "profiles.json");

    public static List<ConnectionProfile> Load()
    {
        try
        {
            var path = ProfilesFilePath;
            if (!File.Exists(path))
            {
                return new List<ConnectionProfile>();
            }

            var json = File.ReadAllText(path);
            var doc = JsonSerializer.Deserialize<ProfileFile>(json, JsonOptions);
            return doc?.Profiles ?? new List<ConnectionProfile>();
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                "프로필 파일을 읽거나 해석할 수 없습니다.\r\n경로: " + ProfilesFilePath,
                ex);
        }
    }

    public static void Save(IReadOnlyList<ConnectionProfile> profiles)
    {
        var dir = Path.GetDirectoryName(ProfilesFilePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var data = new ProfileFile { Profiles = profiles.ToList() };
        var json = JsonSerializer.Serialize(data, JsonOptions);
        var tmp = ProfilesFilePath + ".tmp";
        File.WriteAllText(tmp, json);
        File.Copy(tmp, ProfilesFilePath, overwrite: true);
        File.Delete(tmp);
    }

    public static byte[]? ProtectPassword(string? plain)
    {
        if (string.IsNullOrEmpty(plain))
        {
            return null;
        }

        var bytes = Encoding.UTF8.GetBytes(plain);
        return ProtectedData.Protect(bytes, Entropy, DataProtectionScope.CurrentUser);
    }

    public static string? UnprotectPassword(string? encryptedBase64)
    {
        if (string.IsNullOrEmpty(encryptedBase64))
        {
            return null;
        }

        try
        {
            var blob = Convert.FromBase64String(encryptedBase64);
            var plain = ProtectedData.Unprotect(blob, Entropy, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plain);
        }
        catch
        {
            return null;
        }
    }

    private sealed class ProfileFile
    {
        public List<ConnectionProfile> Profiles { get; set; } = new();
    }
}
