using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace WalletGeneratorGui;

/// <summary>
/// 시작 패스워드로 니모닉을 AES-GCM으로 암호화해 저장합니다. 패스워드 자체는 저장하지 않습니다.
/// </summary>
internal static class WalletVaultStore
{
    private const int Version = 1;
    private const int Pbkdf2Iterations = 210_000;
    private const int SaltSize = 16;
    private const int KeySize = 32;
    private const int NonceSize = 12;
    private const int TagSize = 16;

    private sealed record VaultDto(int Version, string SaltB64, string NonceB64, string TagB64, string CipherB64);

    public static void Save(string filePath, string mnemonicNormalized, string password)
    {
        var salt = new byte[SaltSize];
        RandomNumberGenerator.Fill(salt);
        var key = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            Pbkdf2Iterations,
            HashAlgorithmName.SHA256,
            KeySize);

        var plain = Encoding.UTF8.GetBytes(mnemonicNormalized);
        var nonce = new byte[NonceSize];
        RandomNumberGenerator.Fill(nonce);
        var cipher = new byte[plain.Length];
        var tag = new byte[TagSize];
        using (var aes = new AesGcm(key, TagSize))
        {
            aes.Encrypt(nonce, plain, cipher, tag);
        }

        CryptographicOperations.ZeroMemory(key);

        var dto = new VaultDto(
            Version,
            Convert.ToBase64String(salt),
            Convert.ToBase64String(nonce),
            Convert.ToBase64String(tag),
            Convert.ToBase64String(cipher));

        var json = JsonSerializer.Serialize(dto, new JsonSerializerOptions { WriteIndented = false });
        File.WriteAllText(filePath, json);
    }

    /// <summary>패스워드가 맞지 않거나 손상된 파일이면 false.</summary>
    public static bool TryDecrypt(string filePath, string password, out string mnemonicNormalized)
    {
        mnemonicNormalized = string.Empty;
        if (!File.Exists(filePath))
        {
            return false;
        }

        VaultDto? dto;
        try
        {
            dto = JsonSerializer.Deserialize<VaultDto>(File.ReadAllText(filePath));
        }
        catch
        {
            return false;
        }

        if (dto is null || dto.Version != Version)
        {
            return false;
        }

        byte[] salt;
        byte[] nonce;
        byte[] tag;
        byte[] cipher;
        try
        {
            salt = Convert.FromBase64String(dto.SaltB64);
            nonce = Convert.FromBase64String(dto.NonceB64);
            tag = Convert.FromBase64String(dto.TagB64);
            cipher = Convert.FromBase64String(dto.CipherB64);
        }
        catch
        {
            return false;
        }

        if (salt.Length != SaltSize || nonce.Length != NonceSize || tag.Length != TagSize)
        {
            return false;
        }

        var key = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            Pbkdf2Iterations,
            HashAlgorithmName.SHA256,
            KeySize);

        var plain = new byte[cipher.Length];
        try
        {
            using var aes = new AesGcm(key, TagSize);
            aes.Decrypt(nonce, cipher, tag, plain);
        }
        catch
        {
            CryptographicOperations.ZeroMemory(key);
            return false;
        }

        CryptographicOperations.ZeroMemory(key);
        mnemonicNormalized = Encoding.UTF8.GetString(plain);
        CryptographicOperations.ZeroMemory(plain);
        return true;
    }

    public static void DeleteIfExists(string filePath)
    {
        try
        {
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }
        }
        catch
        {
            // best effort
        }
    }
}
