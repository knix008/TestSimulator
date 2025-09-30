using System.Net;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.Listen(IPAddress.Any, 5001, listenOptions =>
    {
        listenOptions.UseHttps(GenerateSelfSignedCertificate());
    });
});

var app = builder.Build();

app.MapPost("/api/intellivix/vixface/v2.0/updatefirmware", async (HttpContext context) =>
{
    try
    {
        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Received firmware upload request from {context.Connection.RemoteIpAddress}");

        if (!context.Request.HasFormContentType)
        {
            Console.WriteLine("[ERROR] Request does not contain multipart/form-data");
            return Results.BadRequest(new { error = "Invalid content type. Expected multipart/form-data" });
        }

        var form = await context.Request.ReadFormAsync();
        var file = form.Files["firmware"];

        if (file == null || file.Length == 0)
        {
            Console.WriteLine("[ERROR] No firmware file in request");
            return Results.BadRequest(new { error = "No firmware file provided" });
        }

        Console.WriteLine($"[INFO] Receiving firmware file: {file.FileName}");
        Console.WriteLine($"[INFO] File size: {file.Length:N0} bytes");

        var uploadsPath = Path.Combine(Directory.GetCurrentDirectory(), "uploads");
        Directory.CreateDirectory(uploadsPath);

        var filePath = Path.Combine(uploadsPath, $"{DateTime.Now:yyyyMMdd_HHmmss}_{file.FileName}");

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        Console.WriteLine($"[SUCCESS] Firmware saved to: {filePath}");
        Console.WriteLine($"[INFO] Simulating firmware update process...");

        await Task.Delay(2000);

        Console.WriteLine($"[SUCCESS] Firmware update completed successfully!");

        return Results.Ok(new
        {
            success = true,
            message = "Firmware updated successfully",
            filename = file.FileName,
            size = file.Length,
            savedPath = filePath,
            timestamp = DateTime.Now
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[ERROR] Exception: {ex.Message}");
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

app.MapGet("/", () =>
{
    return Results.Ok(new
    {
        device = "VixFace Device Simulator",
        version = "2.0",
        status = "running",
        endpoints = new[]
        {
            "POST /api/intellivix/vixface/v2.0/updatefirmware"
        }
    });
});

Console.WriteLine("=========================================");
Console.WriteLine("Device Simulator Starting...");
Console.WriteLine("=========================================");
Console.WriteLine("Listening on: https://localhost:5001");
Console.WriteLine("API Endpoint: POST /api/intellivix/vixface/v2.0/updatefirmware");
Console.WriteLine("Press Ctrl+C to stop");
Console.WriteLine("=========================================");

app.Run();

static X509Certificate2 GenerateSelfSignedCertificate()
{
    var certificatePath = Path.Combine(Directory.GetCurrentDirectory(), "devcert.pfx");
    var password = "DevPassword123";

    if (File.Exists(certificatePath))
    {
        Console.WriteLine("[INFO] Using existing certificate");
        return new X509Certificate2(certificatePath, password);
    }

    Console.WriteLine("[INFO] Generating self-signed certificate...");

    using var rsa = System.Security.Cryptography.RSA.Create(2048);
    var request = new System.Security.Cryptography.X509Certificates.CertificateRequest(
        "CN=localhost",
        rsa,
        System.Security.Cryptography.HashAlgorithmName.SHA256,
        System.Security.Cryptography.RSASignaturePadding.Pkcs1);

    request.CertificateExtensions.Add(
        new System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension(false, false, 0, false));

    request.CertificateExtensions.Add(
        new System.Security.Cryptography.X509Certificates.X509KeyUsageExtension(
            System.Security.Cryptography.X509Certificates.X509KeyUsageFlags.DigitalSignature |
            System.Security.Cryptography.X509Certificates.X509KeyUsageFlags.KeyEncipherment,
            false));

    request.CertificateExtensions.Add(
        new System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension(
            new System.Security.Cryptography.OidCollection
            {
                new System.Security.Cryptography.Oid("1.3.6.1.5.5.7.3.1")
            },
            false));

    var sanBuilder = new System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder();
    sanBuilder.AddDnsName("localhost");
    sanBuilder.AddIpAddress(IPAddress.Loopback);
    sanBuilder.AddIpAddress(IPAddress.IPv6Loopback);
    request.CertificateExtensions.Add(sanBuilder.Build());

    var certificate = request.CreateSelfSigned(DateTimeOffset.Now.AddDays(-1), DateTimeOffset.Now.AddYears(5));

    File.WriteAllBytes(certificatePath, certificate.Export(X509ContentType.Pfx, password));
    Console.WriteLine($"[INFO] Certificate generated and saved to {certificatePath}");

    return new X509Certificate2(certificatePath, password);
}
