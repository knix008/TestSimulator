// sem-cs samples: security rules. See sem-cs-cases.mjs for the format.
export default {
  'weak-hash': {
    bad: `using System.Security.Cryptography;
class Hasher
{
    byte[] A(byte[] d) { using var h = MD5.Create(); return h.ComputeHash(d); } // Noncompliant
    byte[] B(byte[] d) { return SHA1.HashData(d); } // Noncompliant
    byte[] C(byte[] d) { var h = new SHA1Managed(); return h.ComputeHash(d); } // Noncompliant
    object D() { return HashAlgorithm.Create("MD5"); } // Noncompliant
}`,
    good: `using System.Security.Cryptography;
class Hasher
{
    byte[] A(byte[] d) { using var h = SHA256.Create(); return h.ComputeHash(d); }
    byte[] B(byte[] d) { return SHA512.HashData(d); }
    object D() { return HashAlgorithm.Create("SHA256"); }
}`,
  },
  'weak-cipher': {
    bad: `using System.Security.Cryptography;
class Crypto
{
    void A()
    {
        var a = DES.Create(); // Noncompliant
        var b = new TripleDESCryptoServiceProvider(); // Noncompliant
        var c = RC2.Create(); // Noncompliant
        a.Dispose(); b.Dispose(); c.Dispose();
    }
}`,
    good: `using System.Security.Cryptography;
class Crypto
{
    void A()
    {
        using var a = Aes.Create();
        a.KeySize = 256;
    }
}`,
  },
  'weak-cipher-mode': {
    bad: `using System.Security.Cryptography;
class Crypto
{
    void A(Aes aes, RSA rsa, RSACryptoServiceProvider csp, byte[] d)
    {
        aes.Mode = CipherMode.ECB; // Noncompliant
        rsa.Encrypt(d, RSAEncryptionPadding.Pkcs1); // Noncompliant
        csp.Encrypt(d, false); // Noncompliant
    }
}`,
    good: `using System.Security.Cryptography;
class Crypto
{
    void A(Aes aes, RSA rsa, RSACryptoServiceProvider csp, byte[] d)
    {
        aes.Mode = CipherMode.CBC;
        rsa.Encrypt(d, RSAEncryptionPadding.OaepSHA256);
        csp.Encrypt(d, true);
    }
}`,
  },
  'weak-key-size': {
    bad: `using System.Security.Cryptography;
class Keys
{
    void A()
    {
        var a = new RSACryptoServiceProvider(); // Noncompliant
        var b = new RSACryptoServiceProvider(1024); // Noncompliant
        var c = RSA.Create(512); // Noncompliant
        RSA d = RSA.Create();
        d.KeySize = 1024; // Noncompliant
        a.Dispose(); b.Dispose(); c.Dispose(); d.Dispose();
    }
}`,
    good: `using System.Security.Cryptography;
class Keys
{
    void A()
    {
        using var b = new RSACryptoServiceProvider(2048);
        using var c = RSA.Create(4096);
        RSA d = RSA.Create();
        d.KeySize = 3072;
    }
}`,
  },
  'custom-crypto-algorithm': {
    bad: `using System.Security.Cryptography;
public class MyHash : HashAlgorithm // Noncompliant
{
    protected override void HashCore(byte[] a, int s, int n) { }
    protected override byte[] HashFinal() { return new byte[0]; }
    public override void Initialize() { }
}`,
    good: `using System.Security.Cryptography;
public class HashService
{
    public byte[] Hash(byte[] d) { return SHA256.HashData(d); }
}`,
  },
  'weak-password-hashing': {
    bad: `using System.Security.Cryptography;
class Passwords
{
    byte[] A(string pwd, byte[] salt)
    {
        using var k = new Rfc2898DeriveBytes(pwd, salt); // Noncompliant
        using var k2 = new Rfc2898DeriveBytes(pwd, salt, 1000, HashAlgorithmName.SHA256); // Noncompliant
        return Rfc2898DeriveBytes.Pbkdf2(pwd, salt, 5000, HashAlgorithmName.SHA256, 32); // Noncompliant
    }
}`,
    good: `using System.Security.Cryptography;
class Passwords
{
    byte[] A(string pwd, byte[] salt)
    {
        using var k = new Rfc2898DeriveBytes(pwd, salt, 210000, HashAlgorithmName.SHA256);
        return Rfc2898DeriveBytes.Pbkdf2(pwd, salt, 600000, HashAlgorithmName.SHA256, 32);
    }
}`,
  },
  'constant-iv': {
    bad: `using System.Security.Cryptography;
using System.Text;
class Enc
{
    static readonly byte[] FixedIv = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
    void A(Aes aes, byte[] key)
    {
        var e = aes.CreateEncryptor(key, FixedIv); // Noncompliant
        aes.IV = Encoding.UTF8.GetBytes("0123456789abcdef"); // Noncompliant
        e.Dispose();
    }
}`,
    good: `using System.Security.Cryptography;
class Enc
{
    void A(Aes aes, byte[] key)
    {
        aes.GenerateIV();
        using var e = aes.CreateEncryptor(key, aes.IV);
        var iv = RandomNumberGenerator.GetBytes(16);
        aes.IV = iv;
    }
}`,
  },
  'insecure-random': {
    bad: `using System;
class Tokens
{
    string A()
    {
        var r = new Random(); // Noncompliant
        return r.Next().ToString() + Random.Shared.Next(); // Noncompliant
    }
}`,
    good: `using System.Security.Cryptography;
class Tokens
{
    string A() { return RandomNumberGenerator.GetInt32(1000000).ToString(); }
}`,
  },
  'hardcoded-jwt-key': {
    bad: `using System.Text;
using Microsoft.IdentityModel.Tokens;
class Jwt
{
    const string Secret = "my-super-secret-signing-key-123456";
    SecurityKey A() { return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)); } // Noncompliant
    SecurityKey B() { return new SymmetricSecurityKey(Encoding.UTF8.GetBytes("another-secret-key-0123456789")); } // Noncompliant
}`,
    good: `using System.Text;
using Microsoft.IdentityModel.Tokens;
class Jwt
{
    SecurityKey A(IConfiguration config) { return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"])); }
}`,
  },
  'weak-tls-protocol': {
    bad: `using System.Net;
using System.Net.Security;
using System.Security.Authentication;
class Tls
{
    void A(SslStream s)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls; // Noncompliant
        s.AuthenticateAsClient("host", null, SslProtocols.Tls11, true); // Noncompliant
    }
}`,
    good: `using System.Net;
using System.Net.Security;
using System.Security.Authentication;
class Tls
{
    void A(SslStream s)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13;
        s.AuthenticateAsClient("host", null, SslProtocols.None, true);
    }
}`,
  },
  'certificate-validation-disabled': {
    bad: `using System.Net;
using System.Net.Http;
class Http
{
    void A()
    {
        ServicePointManager.ServerCertificateValidationCallback += (s, c, ch, e) => true; // Noncompliant
        var h = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator, // Noncompliant
        };
        var h2 = new HttpClientHandler();
        h2.ServerCertificateCustomValidationCallback = (m, c, ch, e) => { return true; }; // Noncompliant
    }
}`,
    good: `using System.Net;
using System.Net.Http;
using System.Net.Security;
class Http
{
    void A()
    {
        var h2 = new HttpClientHandler();
        h2.ServerCertificateCustomValidationCallback = (m, c, ch, e) => e == SslPolicyErrors.None;
    }
}`,
  },
  'hardcoded-credentials': {
    bad: `using System.Net;
class Db
{
    string password = "s3cr3t!"; // Noncompliant
    const string ConnectionString = "Server=db;User Id=sa;Password=P@ssw0rd;"; // Noncompliant
    void A(Settings s)
    {
        string pwd = "hunter2"; // Noncompliant
        s.Password = "abc123"; // Noncompliant
        var c = new NetworkCredential("admin", "Admin123"); // Noncompliant
        Use(pwd, c);
    }
    void Use(string p, NetworkCredential c) { }
}
class Settings { public string Password { get; set; } }`,
    good: `using System;
class Db
{
    const string PasswordKey = "Password";
    string passwordPrompt = "Enter your password:";
    void A(Settings s)
    {
        string pwd = Environment.GetEnvironmentVariable("DB_PASSWORD");
        s.Password = pwd;
        var cs = "Server=db;Integrated Security=true;Password={0}";
        Use(cs);
    }
    void Use(string p) { }
}
class Settings { public string Password { get; set; } }`,
  },
  'hardcoded-ip': {
    bad: `class Net
{
    string host = "10.20.30.40"; // Noncompliant
    string url = "http://192.168.1.15:8080/api"; // Noncompliant
}`,
    good: `using System;
class Net
{
    string local = "127.0.0.1";
    string any = "0.0.0.0";
    string doc = "192.0.2.10";
    Version v = new Version("1.2.3.4");
    string notIp = "300.1.1.1";
}`,
  },
  'cookie-not-secure': {
    bad: `using System.Web;
using Microsoft.AspNetCore.Http;
class Cookies
{
    void A(HttpResponse r)
    {
        var c = new HttpCookie("id");
        c.Secure = false; // Noncompliant
        var o = new CookieOptions { Secure = false }; // Noncompliant
        var b = new CookieBuilder { SecurePolicy = CookieSecurePolicy.None }; // Noncompliant
    }
}`,
    good: `using System.Web;
using Microsoft.AspNetCore.Http;
class Cookies
{
    bool Secure;
    void A()
    {
        var c = new HttpCookie("id");
        c.Secure = true;
        var o = new CookieOptions { Secure = true };
        var b = new CookieBuilder { SecurePolicy = CookieSecurePolicy.Always };
        Secure = false;
    }
}`,
  },
  'cookie-not-httponly': {
    bad: `using System.Web;
using Microsoft.AspNetCore.Http;
class Cookies
{
    void A(CookieAuthenticationOptions opts)
    {
        var c = new HttpCookie("id");
        c.HttpOnly = false; // Noncompliant
        var o = new CookieOptions { HttpOnly = false }; // Noncompliant
        opts.Cookie.HttpOnly = false; // Noncompliant
    }
}`,
    good: `using System.Web;
using Microsoft.AspNetCore.Http;
class Cookies
{
    void A(CookieAuthenticationOptions opts)
    {
        var c = new HttpCookie("id");
        c.HttpOnly = true;
        var o = new CookieOptions { HttpOnly = true };
        opts.Cookie.HttpOnly = true;
    }
}`,
  },
  'xml-external-entities': {
    bad: `using System.Xml;
class Xml
{
    void A(string path)
    {
        var doc = new XmlDocument();
        doc.XmlResolver = new XmlUrlResolver(); // Noncompliant
        var s = new XmlReaderSettings { DtdProcessing = DtdProcessing.Parse }; // Noncompliant
        var s2 = new XmlReaderSettings();
        s2.ProhibitDtd = false; // Noncompliant
    }
}`,
    good: `using System.Xml;
class Xml
{
    void A(string path)
    {
        var doc = new XmlDocument();
        doc.XmlResolver = null;
        var s = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit };
    }
}`,
  },
  'xml-signature-unchecked': {
    bad: `using System.Security.Cryptography.Xml;
using System.Xml;
class Sig
{
    bool A(XmlDocument doc)
    {
        var signed = new SignedXml(doc);
        return signed.CheckSignature(); // Noncompliant
    }
}`,
    good: `using System.Security.Cryptography;
using System.Security.Cryptography.Xml;
using System.Xml;
class Sig
{
    bool A(XmlDocument doc, RSA key)
    {
        var signed = new SignedXml(doc);
        return signed.CheckSignature(key);
    }
}`,
  },
  'insecure-deserializer': {
    bad: `using System.IO;
using System.Runtime.Serialization.Formatters.Binary;
using System.Web.Script.Serialization;
class Ser
{
    object A(Stream s)
    {
        var f = new BinaryFormatter(); // Noncompliant
        var j = new JavaScriptSerializer(new SimpleTypeResolver()); // Noncompliant
        return f.Deserialize(s);
    }
}`,
    good: `using System.IO;
using System.Runtime.Serialization.Formatters.Binary;
using System.Text.Json;
using System.Web.Script.Serialization;
class Ser
{
    object A(Stream s, MyBinder b)
    {
        var f = new BinaryFormatter { Binder = b };
        var j = new JavaScriptSerializer();
        return JsonSerializer.Deserialize<Data>(s);
    }
}
class Data { }
class MyBinder { }`,
  },
  'json-type-name-handling': {
    bad: `using Newtonsoft.Json;
class Json
{
    JsonSerializerSettings A()
    {
        var s = new JsonSerializerSettings { TypeNameHandling = TypeNameHandling.All }; // Noncompliant
        s.TypeNameHandling = TypeNameHandling.Auto; // Noncompliant
        return s;
    }
}`,
    good: `using Newtonsoft.Json;
class Json
{
    JsonSerializerSettings A(KnownTypesBinder b)
    {
        var s = new JsonSerializerSettings { TypeNameHandling = TypeNameHandling.None };
        var t = new JsonSerializerSettings { TypeNameHandling = TypeNameHandling.Objects, SerializationBinder = b };
        return s;
    }
}
class KnownTypesBinder { }`,
  },
  'cors-permissive': {
    bad: `using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
class Startup
{
    void A(CorsPolicyBuilder p, HttpResponse r)
    {
        p.AllowAnyOrigin(); // Noncompliant
        p.WithOrigins("*"); // Noncompliant
        p.SetIsOriginAllowed(o => true); // Noncompliant
        r.Headers.Add("Access-Control-Allow-Origin", "*"); // Noncompliant
        r.Headers["Access-Control-Allow-Origin"] = "*"; // Noncompliant
    }
}
[EnableCors(origins: "*", headers: "*", methods: "*")] // Noncompliant
class Api { }`,
    good: `using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
class Startup
{
    void A(CorsPolicyBuilder p, HttpResponse r)
    {
        p.WithOrigins("https://app.example.com");
        p.SetIsOriginAllowed(o => o.EndsWith(".example.com"));
        r.Headers.Add("Access-Control-Allow-Origin", "https://app.example.com");
    }
}
[EnableCors(origins: "https://app.example.com", headers: "*", methods: "*")]
class Api { }`,
  },
  'debug-features': {
    bad: `using Microsoft.AspNetCore.Builder;
class Startup
{
    void Configure(IApplicationBuilder app)
    {
        app.UseDeveloperExceptionPage(); // Noncompliant
        app.UseDatabaseErrorPage(); // Noncompliant
    }
}`,
    good: `using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
class Startup
{
    void Configure(IApplicationBuilder app, IWebHostEnvironment env)
    {
        if (env.IsDevelopment())
        {
            app.UseDeveloperExceptionPage();
        }
        else
        {
            app.UseExceptionHandler("/Error");
        }
    }
}`,
  },
  'sql-formatted-query': {
    bad: `using System.Data.SqlClient;
class Repo
{
    void A(SqlConnection c, DbContext db, string name, int id)
    {
        var cmd = new SqlCommand("SELECT * FROM Users WHERE Name = '" + name + "'", c); // Noncompliant
        cmd.CommandText = $"DELETE FROM Users WHERE Id = {id}"; // Noncompliant
        db.Database.ExecuteSqlRaw(string.Format("UPDATE T SET N = '{0}'", name)); // Noncompliant
        cmd.Dispose();
    }
}`,
    good: `using System.Data.SqlClient;
class Repo
{
    const string Table = "Users";
    void A(SqlConnection c, DbContext db, string name, int id)
    {
        using var cmd = new SqlCommand("SELECT * FROM " + Table + " WHERE Name = @name", c);
        cmd.Parameters.AddWithValue("@name", name);
        cmd.CommandText = "DELETE FROM Users WHERE Id = @id";
        db.Database.ExecuteSqlInterpolated($"UPDATE T SET N = {name}");
    }
}`,
  },
  'jwt-signature-not-validated': {
    bad: `using Microsoft.IdentityModel.Tokens;
class Auth
{
    TokenValidationParameters A(JwtBuilder b)
    {
        b.DoNotVerifySignature(); // Noncompliant
        return new TokenValidationParameters
        {
            RequireSignedTokens = false, // Noncompliant
            ValidateIssuerSigningKey = false, // Noncompliant
        };
    }
}`,
    good: `using Microsoft.IdentityModel.Tokens;
class Auth
{
    TokenValidationParameters A(SecurityKey key)
    {
        return new TokenValidationParameters
        {
            RequireSignedTokens = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = key,
        };
    }
}`,
  },
  'jwt-lifetime-not-validated': {
    bad: `using Microsoft.IdentityModel.Tokens;
class Auth
{
    TokenValidationParameters A()
    {
        var p = new TokenValidationParameters { ValidateLifetime = false }; // Noncompliant
        p.RequireExpirationTime = false; // Noncompliant
        return p;
    }
}`,
    good: `using Microsoft.IdentityModel.Tokens;
class Auth
{
    TokenValidationParameters A()
    {
        var p = new TokenValidationParameters { ValidateLifetime = true };
        p.RequireExpirationTime = true;
        return p;
    }
}`,
  },
  'jwt-issuer-not-validated': {
    bad: `using Microsoft.IdentityModel.Tokens;
class Auth
{
    TokenValidationParameters A()
    {
        return new TokenValidationParameters
        {
            ValidateIssuer = false, // Noncompliant
            ValidateAudience = false, // Noncompliant
        };
    }
}`,
    good: `using Microsoft.IdentityModel.Tokens;
class Auth
{
    TokenValidationParameters A()
    {
        return new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "https://login.example.com",
            ValidateAudience = true,
            ValidAudience = "api",
        };
    }
}`,
  },
  'ldap-anonymous-bind': {
    bad: `using System.DirectoryServices;
class Ldap
{
    void A(string path)
    {
        using var e = new DirectoryEntry(path, "user", null, AuthenticationTypes.None); // Noncompliant
        e.AuthenticationType = AuthenticationTypes.Anonymous; // Noncompliant
    }
}`,
    good: `using System.DirectoryServices;
class Ldap
{
    void A(string path, string user, string pass)
    {
        using var e = new DirectoryEntry(path, user, pass, AuthenticationTypes.Secure);
    }
}`,
  },
  'permissive-file-access': {
    bad: `using System.IO;
using System.Security.AccessControl;
class Perms
{
    void A(string path, FileSecurity sec)
    {
        sec.AddAccessRule(new FileSystemAccessRule("Everyone", FileSystemRights.FullControl, AccessControlType.Allow)); // Noncompliant
        File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.OtherWrite); // Noncompliant
    }
}`,
    good: `using System.IO;
using System.Security.AccessControl;
class Perms
{
    void A(string path, FileSecurity sec, string account)
    {
        sec.AddAccessRule(new FileSystemAccessRule(account, FileSystemRights.Read, AccessControlType.Allow));
        sec.AddAccessRule(new FileSystemAccessRule("Everyone", FileSystemRights.Write, AccessControlType.Deny));
        File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
    }
}`,
  },
  'logging-configuration': {
    bad: `using Serilog;
class Logs
{
    void A()
    {
        log4net.Config.XmlConfigurator.Configure(); // Noncompliant
        var cfg = new LoggerConfiguration(); // Noncompliant
        var f = LoggerFactory.Create(b => b.AddConsole()); // Noncompliant
    }
}`,
    good: `using Microsoft.Extensions.Logging;
class Logs
{
    readonly ILogger<Logs> log;
    Logs(ILogger<Logs> log) { this.log = log; }
    void A() { log.LogInformation("started"); }
}`,
  },
  'insecure-temp-file': {
    bad: `using System.IO;
class Temp
{
    string A() { return Path.GetTempFileName(); } // Noncompliant
}`,
    good: `using System.IO;
class Temp
{
    string A(string dir)
    {
        var p = Path.Combine(dir, Path.GetRandomFileName());
        using var f = new FileStream(p, FileMode.CreateNew);
        return p;
    }
}`,
  },
  'publicly-writable-directory': {
    bad: `using System;
using System.IO;
class Temp
{
    void A()
    {
        File.WriteAllText("/tmp/report.txt", "x"); // Noncompliant
        var t = Environment.GetEnvironmentVariable("TMPDIR"); // Noncompliant
        var p = Path.GetTempPath(); // Noncompliant
    }
}`,
    good: `using System;
using System.IO;
class Temp
{
    void A()
    {
        var dir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        File.WriteAllText(Path.Combine(dir, "report.txt"), "x");
        var home = Environment.GetEnvironmentVariable("HOME");
    }
}`,
  },
  'os-command-partial-path': {
    bad: `using System.Diagnostics;
class Run
{
    void A()
    {
        Process.Start("git"); // Noncompliant
        var psi = new ProcessStartInfo("cmd.exe"); // Noncompliant
        var p = new Process();
        p.StartInfo.FileName = "powershell"; // Noncompliant
        var q = new ProcessStartInfo { FileName = "bash" }; // Noncompliant
    }
}`,
    good: `using System.Diagnostics;
class Run
{
    void A()
    {
        Process.Start(@"C:\\Program Files\\Git\\bin\\git.exe");
        var psi = new ProcessStartInfo("/usr/bin/git");
        Process.Start("https://example.com");
        Process.Start("readme.txt");
    }
}`,
  },
  'unsafe-code': {
    bad: `class Native
{
    unsafe void Copy(byte* src, byte* dst, int n) { for (int i = 0; i < n; i++) dst[i] = src[i]; } // Noncompliant
    void Fill(byte[] a)
    {
        unsafe // Noncompliant
        {
            fixed (byte* p = a) { p[0] = 1; }
        }
    }
}`,
    good: `using System;
class Native
{
    void Copy(ReadOnlySpan<byte> src, Span<byte> dst) { src.CopyTo(dst); }
}`,
  },
  'archive-expansion': {
    bad: `using System.IO.Compression;
class Zip
{
    void A(string zip, string dir)
    {
        ZipFile.ExtractToDirectory(zip, dir); // Noncompliant
        using var a = ZipFile.OpenRead(zip);
        foreach (var e in a.Entries)
        {
            e.ExtractToFile(dir + "/" + e.Name); // Noncompliant
        }
    }
}`,
    good: `using System.IO.Compression;
class Zip
{
    void A(string zip, string dir)
    {
        using var a = ZipFile.OpenRead(zip);
        long total = 0;
        foreach (var e in a.Entries)
        {
            total += e.Length;
            if (total > 100000000 || e.Length > 10 * e.CompressedLength) break;
            e.ExtractToFile(dir + "/" + e.Name);
        }
    }
}`,
  },
};
