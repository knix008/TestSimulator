using System.Security.Cryptography;
using System.Text;

namespace ReqTrace.Persistence.Database;

/// <summary>
/// Encrypts the DB connection password at rest using Windows DPAPI, scoped to the
/// current Windows user, so settings.json on disk never contains a plaintext password.
/// </summary>
public static class DbCredentialProtector
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("ReqTrace.DbConnectionSettings.Password");

    public static string Protect(string plainText)
    {
        if (string.IsNullOrEmpty(plainText))
            return string.Empty;

        var bytes = Encoding.UTF8.GetBytes(plainText);
        var protectedBytes = ProtectedData.Protect(bytes, Entropy, DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(protectedBytes);
    }

    public static string Unprotect(string protectedText)
    {
        if (string.IsNullOrEmpty(protectedText))
            return string.Empty;

        try
        {
            var protectedBytes = Convert.FromBase64String(protectedText);
            var bytes = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(bytes);
        }
        catch (Exception ex) when (ex is FormatException or CryptographicException)
        {
            // Saved by a different Windows user/machine, or corrupted - treat as "no password" rather than crash.
            return string.Empty;
        }
    }
}
