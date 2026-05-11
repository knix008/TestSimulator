using System.Security.Cryptography;
using System.Text;

namespace PCClient
{
    /// <summary>
    /// AES-256-GCM 암호화/복호화 헬퍼 클래스
    /// Web Crypto API와 호환되도록 구현
    /// </summary>
    public static class EncryptionHelper
    {
        private const int KeySize = 256;
        private const int IvSize = 12; // GCM 표준 IV 크기
        private const int TagSize = 16; // GCM 인증 태그 크기
        private const int Pbkdf2Iterations = 100000;

        /// <summary>
        /// PBKDF2를 사용하여 암호화 키 생성
        /// </summary>
        public static byte[] DeriveKey(string password, string salt)
        {
            byte[] saltBytes = Encoding.UTF8.GetBytes(salt);
            using var pbkdf2 = new Rfc2898DeriveBytes(
                password,
                saltBytes,
                Pbkdf2Iterations,
                HashAlgorithmName.SHA256
            );
            return pbkdf2.GetBytes(32); // 256 bits = 32 bytes
        }

        /// <summary>
        /// AES-256-GCM으로 메시지 암호화
        /// </summary>
        public static string Encrypt(string plainText, byte[] key)
        {
            byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
            byte[] iv = new byte[IvSize];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(iv);
            }

            byte[] cipherText = new byte[plainBytes.Length];
            byte[] tag = new byte[TagSize];

            using var aes = new AesGcm(key);
            aes.Encrypt(iv, plainBytes, cipherText, tag);

            // IV + Tag + CipherText를 연결하여 Base64로 인코딩
            byte[] result = new byte[iv.Length + tag.Length + cipherText.Length];
            Buffer.BlockCopy(iv, 0, result, 0, iv.Length);
            Buffer.BlockCopy(tag, 0, result, iv.Length, tag.Length);
            Buffer.BlockCopy(cipherText, 0, result, iv.Length + tag.Length, cipherText.Length);

            return Convert.ToBase64String(result);
        }

        /// <summary>
        /// AES-256-GCM으로 메시지 복호화
        /// </summary>
        public static string Decrypt(string encryptedText, byte[] key)
        {
            try
            {
                byte[] encryptedBytes = Convert.FromBase64String(encryptedText);

                if (encryptedBytes.Length < IvSize + TagSize)
                {
                    throw new ArgumentException("암호화된 데이터가 너무 짧습니다.");
                }

                // IV, Tag, CipherText 분리
                byte[] iv = new byte[IvSize];
                byte[] tag = new byte[TagSize];
                byte[] cipherText = new byte[encryptedBytes.Length - IvSize - TagSize];

                Buffer.BlockCopy(encryptedBytes, 0, iv, 0, IvSize);
                Buffer.BlockCopy(encryptedBytes, IvSize, tag, 0, TagSize);
                Buffer.BlockCopy(encryptedBytes, IvSize + TagSize, cipherText, 0, cipherText.Length);

                byte[] plainBytes = new byte[cipherText.Length];

                using var aes = new AesGcm(key);
                aes.Decrypt(iv, cipherText, tag, plainBytes);

                return Encoding.UTF8.GetString(plainBytes);
            }
            catch (Exception ex)
            {
                return $"[복호화 실패: {ex.Message}]";
            }
        }
    }
}
