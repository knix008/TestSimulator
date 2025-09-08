using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Management;
using Microsoft.AspNetCore.Http; // 추가
using Microsoft.AspNetCore.Routing; // 추가
using Microsoft.AspNetCore.Server.Kestrel.Https; // 추가
using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography;
using System.Net;

namespace ServerApp01
{
    public partial class Server : Form
    {
        private IHost? _webHost;
        private bool _isDisposed;
        private X509Certificate2? _certificate;

        public Server()
        {
            this.InitializeComponent();
            StartWebServer();
        }

        private X509Certificate2 CreateSelfSignedCertificate()
        {
            // 인증서 생성을 위한 기본 정보 설정
            string subjectName = "CN=localhost";
            string friendlyName = "Development Self-Signed Certificate";
            
            // RSA 키 쌍 생성
            using var rsa = RSA.Create(2048);
            
            // 인증서 요청 생성
            var certificateRequest = new CertificateRequest(
                subjectName, 
                rsa, 
                HashAlgorithmName.SHA256, 
                RSASignaturePadding.Pkcs1);

            // 기본 확장 설정
            certificateRequest.CertificateExtensions.Add(
                new X509BasicConstraintsExtension(false, false, 0, true));
            
            certificateRequest.CertificateExtensions.Add(
                new X509KeyUsageExtension(
                    X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, 
                    true));

            // SAN(Subject Alternative Name) 확장 추가
            var sanBuilder = new SubjectAlternativeNameBuilder();
            sanBuilder.AddDnsName("localhost");
            sanBuilder.AddIpAddress(IPAddress.Loopback);        // 127.0.0.1 추가
            sanBuilder.AddIpAddress(IPAddress.IPv6Loopback);    // ::1 추가
            certificateRequest.CertificateExtensions.Add(sanBuilder.Build());

            // 확장된 키 사용 추가
            certificateRequest.CertificateExtensions.Add(
                new X509EnhancedKeyUsageExtension(
                    new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") }, // 서버 인증
                    true));

            // 인증서 생성 (1년 유효)
            var certificate = certificateRequest.CreateSelfSigned(
                DateTimeOffset.UtcNow.AddDays(-1),
                DateTimeOffset.UtcNow.AddYears(1));

            // 개인 키를 포함하여 내보내기 가능하도록 설정
            certificate = new X509Certificate2(certificate.Export(X509ContentType.Pfx), "", X509KeyStorageFlags.Exportable | X509KeyStorageFlags.PersistKeySet | X509KeyStorageFlags.MachineKeySet);

            return certificate;
        }

        private async void StartWebServer()
        {
            try
            {
                // 인증서 미리 생성
                _certificate = CreateSelfSignedCertificate();

                var builder = WebApplication.CreateBuilder();
                
                // HTTP와 HTTPS 구성
                builder.WebHost.ConfigureKestrel(options =>
                {
                    // HTTPS 엔드포인트 구성
                    options.ListenLocalhost(5001, listenOptions =>
                    {
                        listenOptions.UseHttps(httpsOptions =>
                        {
                            httpsOptions.ServerCertificate = _certificate;
                            httpsOptions.ClientCertificateMode = ClientCertificateMode.NoCertificate;
                            httpsOptions.SslProtocols = System.Security.Authentication.SslProtocols.Tls12 | System.Security.Authentication.SslProtocols.Tls13;
                            
                            // 개발 환경에서는 인증서 유효성 검사 무시
                            httpsOptions.CheckCertificateRevocation = false;
                        });
                    });

                    // HTTP 엔드포인트 구성
                    options.ListenLocalhost(5000);
                });

                // CORS 정책 추가
                builder.Services.AddCors(options =>
                {
                    options.AddDefaultPolicy(builder =>
                    {
                        builder.AllowAnyOrigin()
                               .AllowAnyMethod()
                               .AllowAnyHeader();
                    });
                });

                var app = builder.Build();

                // 개발 환경에서 상세한 오류 페이지 표시
                if (builder.Environment.IsDevelopment())
                {
                    app.UseDeveloperExceptionPage();
                }

                // 기본 라우팅 미들웨어 추가
                app.UseRouting();

                // CORS 미들웨어 활성화
                app.UseCors();

                // 에러 처리 미들웨어 추가
                app.Use(async (context, next) =>
                {
                    try
                    {
                        await next();
                    }
                    catch (Exception ex)
                    {
                        LogMessage($"요청 처리 중 오류 발생: {ex.Message}");
                        throw;
                    }
                });

                // 접속 로깅 미들웨어
                app.Use(async (context, next) =>
                {
                    var endpoint = context.GetEndpoint()?.DisplayName ?? "알 수 없는 엔드포인트";
                    var clientIp = context.Connection.RemoteIpAddress?.ToString() ?? "알 수 없는 IP";
                    LogMessage($"새로운 접속: {clientIp} -> {context.Request.Path} ({endpoint})");
                    
                    await next();
                });

                // 루트 경로 테스트 핸들러 추가
                app.MapGet("/", () => "서버가 정상적으로 실행 중입니다!");

                // API 엔드포인트 구성
                app.MapGet("/api/v1/info/getcpuinfo", GetCpuInfo);

                _webHost = app;

                LogMessage("서버가 시작되었습니다:");
                LogMessage("HTTP API 엔드포인트: http://localhost:5000/api/v1/info/getcpuinfo");
                LogMessage("HTTPS API 엔드포인트: https://localhost:5001/api/v1/info/getcpuinfo");
                
                await app.RunAsync();
            }
            catch (Exception ex)
            {
                LogMessage($"서버 시작 오류: {ex.Message}");
                LogMessage($"스택 트레이스: {ex.StackTrace}");
            }
        }

        private static object GetCpuInfo()
        {
            try
            {
                var cpuInfo = new List<object>();
                
                using (var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_Processor"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        cpuInfo.Add(new
                        {
                            Name = obj["Name"]?.ToString(),
                            Manufacturer = obj["Manufacturer"]?.ToString(),
                            Architecture = obj["Architecture"]?.ToString(),
                            MaxClockSpeed = obj["MaxClockSpeed"]?.ToString(),
                            NumberOfCores = obj["NumberOfCores"]?.ToString(),
                            NumberOfLogicalProcessors = obj["NumberOfLogicalProcessors"]?.ToString()
                        });
                    }
                }

                return new
                {
                    success = true,
                    data = cpuInfo,
                    timestamp = DateTime.UtcNow
                };
            }
            catch (Exception ex)
            {
                return new
                {
                    success = false,
                    error = ex.Message,
                    timestamp = DateTime.UtcNow
                };
            }
        }

        private void LogMessage(string message)
        {
            if (LogTextBox.InvokeRequired)
            {
                LogTextBox.Invoke(() => LogMessage(message));
            }
            else
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}\r\n");
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (!_isDisposed)
            {
                if (disposing)
                {
                    _certificate?.Dispose();
                    _webHost?.Dispose();
                    components?.Dispose();
                }
                _isDisposed = true;
            }
            base.Dispose(disposing);
        }
    }
}
