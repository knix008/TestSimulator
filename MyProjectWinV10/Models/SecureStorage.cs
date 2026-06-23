using System.Security.Cryptography;
using System.Text;

namespace MyProject.Models
{
    internal static class SecureStorage
    {
        public static string Protect(string plainText)
        {
            if (string.IsNullOrEmpty(plainText))
                return "";

            var bytes = Encoding.UTF8.GetBytes(plainText);
            var protectedBytes = ProtectedData.Protect(bytes, optionalEntropy: null, DataProtectionScope.CurrentUser);
            return Convert.ToBase64String(protectedBytes);
        }

        public static string Unprotect(string protectedText)
        {
            if (string.IsNullOrEmpty(protectedText))
                return "";

            try
            {
                var protectedBytes = Convert.FromBase64String(protectedText);
                var bytes = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, DataProtectionScope.CurrentUser);
                return Encoding.UTF8.GetString(bytes);
            }
            catch
            {
                return "";
            }
        }
    }
}
