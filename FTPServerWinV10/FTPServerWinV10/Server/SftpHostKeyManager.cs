using System.Security.Cryptography;
using FxSsh;

namespace FTPServerWinV10.Server
{
    /// <summary>SFTP(SSH) 서버 호스트 RSA 키 관리.</summary>
    public static class SftpHostKeyManager
    {
        public static string DefaultDirectory =>
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FTPServerWinV10");

        public static string DefaultKeyPath =>
            Path.Combine(DefaultDirectory, "ssh_host_rsa.pem");

        public static string EnsureHostKey(string? customPath = null)
        {
            var path = string.IsNullOrWhiteSpace(customPath) ? DefaultKeyPath : customPath.Trim();
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
            if (!File.Exists(path))
                GenerateKey(path);
            return File.ReadAllText(path);
        }

        public static void GenerateKey(string path, int bits = 2048)
        {
            if (bits != 2048 && bits != 4096)
                bits = 2048;
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
            File.WriteAllText(path, KeyGenerator.GenerateRsaKeyPem(bits));
        }

        public static string GetSha256Fingerprint(string pemPath)
        {
            if (!File.Exists(pemPath))
                return "(키 없음)";
            try
            {
                var pem = File.ReadAllText(pemPath);
                using var rsa = RSA.Create();
                rsa.ImportFromPem(pem);
                var pub = rsa.ExportSubjectPublicKeyInfo();
                var hash = SHA256.HashData(pub);
                return "SHA256:" + Convert.ToBase64String(hash).TrimEnd('=');
            }
            catch (Exception ex)
            {
                return $"(지문 계산 실패: {ex.Message})";
            }
        }
    }
}
