using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace FTPServerWinV10.Server
{
    internal static class CertificateGenerator
    {
        internal static void GenerateSelfSignedPfx(
            string commonName, int validityYears, string pfxPath, string pfxPassword)
        {
            using var rsa = RSA.Create(2048);
            var request = new CertificateRequest(
                new X500DistinguishedName($"CN={commonName}"),
                rsa,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);

            request.CertificateExtensions.Add(
                new X509BasicConstraintsExtension(false, false, 0, false));
            request.CertificateExtensions.Add(
                new X509KeyUsageExtension(
                    X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
            // TLS Server Authentication OID
            request.CertificateExtensions.Add(
                new X509EnhancedKeyUsageExtension(
                    new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") }, false));

            var from = DateTimeOffset.UtcNow.AddDays(-1); // -1 day avoids clock skew issues
            using var cert = request.CreateSelfSigned(from, from.AddYears(validityYears).AddDays(2));

            File.WriteAllBytes(pfxPath, cert.Export(X509ContentType.Pfx, pfxPassword));
        }
    }
}
