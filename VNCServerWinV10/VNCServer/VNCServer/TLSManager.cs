using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;

namespace VNCServer.VNCServer;

/// <summary>
/// TLS/SSL 암호화 연결을 관리하는 클래스
/// </summary>
public class TLSManager
{
    private readonly X509Certificate2? _serverCertificate;
    private readonly bool _isEnabled;

    public bool IsEnabled => _isEnabled;

    public TLSManager(bool isEnabled, string? certificatePath = null, string? certificatePassword = null)
    {
        _isEnabled = isEnabled;

        if (_isEnabled && !string.IsNullOrEmpty(certificatePath))
        {
            try
            {
                if (File.Exists(certificatePath))
                {
                    _serverCertificate = string.IsNullOrEmpty(certificatePassword)
                        ? new X509Certificate2(certificatePath)
                        : new X509Certificate2(certificatePath, certificatePassword);
                }
                else
                {
                    System.Diagnostics.Debug.WriteLine($"Certificate file not found: {certificatePath}");
                    _isEnabled = false;
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to load certificate: {ex.Message}");
                _isEnabled = false;
            }
        }
        else if (_isEnabled && string.IsNullOrEmpty(certificatePath))
        {
            // 인증서가 없으면 자체 서명 인증서 생성 시도
            _serverCertificate = GenerateSelfSignedCertificate();
        }
    }

    /// <summary>
    /// 일반 스트림을 SSL 스트림으로 래핑
    /// </summary>
    public async Task<Stream> WrapStreamAsync(Stream innerStream)
    {
        if (!_isEnabled || _serverCertificate == null)
        {
            return innerStream;
        }

        var sslStream = new SslStream(
            innerStream,
            false,
            ValidateClientCertificate,
            null,
            EncryptionPolicy.RequireEncryption);

        try
        {
            await sslStream.AuthenticateAsServerAsync(
                _serverCertificate,
                clientCertificateRequired: false,
                enabledSslProtocols: SslProtocols.Tls12 | SslProtocols.Tls13,
                checkCertificateRevocation: false);

            return sslStream;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"SSL authentication failed: {ex.Message}");
            sslStream.Dispose();
            throw;
        }
    }

    private bool ValidateClientCertificate(
        object sender,
        X509Certificate? certificate,
        X509Chain? chain,
        SslPolicyErrors sslPolicyErrors)
    {
        // 클라이언트 인증서 검증 (현재는 모두 허용)
        // 프로덕션 환경에서는 적절한 검증 로직 구현 필요
        return true;
    }

    /// <summary>
    /// 자체 서명 인증서 생성
    /// </summary>
    private X509Certificate2? GenerateSelfSignedCertificate()
    {
        try
        {
            // .NET 5.0+ 에서 사용 가능한 방식
            using (var rsa = System.Security.Cryptography.RSA.Create(2048))
            {
                var request = new System.Security.Cryptography.X509Certificates.CertificateRequest(
                    "CN=VNC Server Self-Signed",
                    rsa,
                    System.Security.Cryptography.HashAlgorithmName.SHA256,
                    System.Security.Cryptography.RSASignaturePadding.Pkcs1);

                request.CertificateExtensions.Add(
                    new System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension(
                        false, false, 0, false));

                request.CertificateExtensions.Add(
                    new System.Security.Cryptography.X509Certificates.X509KeyUsageExtension(
                        System.Security.Cryptography.X509Certificates.X509KeyUsageFlags.DigitalSignature |
                        System.Security.Cryptography.X509Certificates.X509KeyUsageFlags.KeyEncipherment,
                        false));

                request.CertificateExtensions.Add(
                    new System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension(
                        new System.Security.Cryptography.OidCollection
                        {
                            new System.Security.Cryptography.Oid("1.3.6.1.5.5.7.3.1") // Server Authentication
                        },
                        false));

                var certificate = request.CreateSelfSigned(
                    DateTimeOffset.Now.AddDays(-1),
                    DateTimeOffset.Now.AddYears(5));

                // Windows에서는 키를 영구 저장소에 저장해야 할 수 있음
                return new X509Certificate2(certificate.Export(X509ContentType.Pfx));
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to generate self-signed certificate: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// 인증서를 파일로 저장
    /// </summary>
    public void SaveCertificate(string filePath, string password)
    {
        if (_serverCertificate == null)
        {
            throw new InvalidOperationException("No certificate available to save");
        }

        try
        {
            byte[] certBytes = _serverCertificate.Export(X509ContentType.Pfx, password);
            File.WriteAllBytes(filePath, certBytes);
        }
        catch (Exception ex)
        {
            throw new Exception($"Failed to save certificate: {ex.Message}", ex);
        }
    }

    /// <summary>
    /// 인증서 정보 가져오기
    /// </summary>
    public string GetCertificateInfo()
    {
        if (_serverCertificate == null)
        {
            return "No certificate loaded";
        }

        return $"Subject: {_serverCertificate.Subject}\n" +
               $"Issuer: {_serverCertificate.Issuer}\n" +
               $"Valid From: {_serverCertificate.NotBefore}\n" +
               $"Valid To: {_serverCertificate.NotAfter}\n" +
               $"Thumbprint: {_serverCertificate.Thumbprint}";
    }
}
