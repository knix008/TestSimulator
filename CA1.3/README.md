# TLS Mutual Authentication System - Quick Start Guide

This guide explains how to run the complete CA-based TLS mutual authentication system.

## System Overview

The system consists of:
1. **CA Server** (Python) - Issues and manages certificates
2. **TLS Server** (C# WinForms) - Listens for TLS connections
3. **TLS Client** (C# WinForms) - Connects to TLS server

## Prerequisites

- Python 3.8+ with cryptography package installed
- .NET 9.0 or later
- Windows 10/11

## Step-by-Step Instructions

### Step 1: Start the CA Server

Open a terminal in the CA directory and run:

```bash
python ca_server.py
```

The CA server will:
- Generate a root CA certificate automatically
- Listen on port 8888 for certificate requests
- Save all certificates to the `certificates/` folder

You should see:
```
Creating CA root certificate...
CA root certificate created successfully
CA server started: localhost:8888
CA root certificate saved to certificates/ca.crt
```

### Step 2: Generate Certificates

In a **new terminal**, run:

```bash
python test_certificates.py
```

This will automatically request certificates from the CA server for both the TLS server and client.

You should see:
```
[1] Verify CA root certificate
[OK] CA root certificate verified
  - CA certificate: certificates/ca.crt

[2] Issue server certificate
[OK] server Certificate issued successfully (server)
  - Certificate: certificates/server.crt
  - Private key: certificates/server.key

[3] Issue client certificate
[OK] client Certificate issued successfully (client)
  - Certificate: certificates/client.crt
  - Private key: certificates/client.key
```

### Step 3: Run TLS Server

In a **new terminal**, navigate to the TLSServer directory and run:

```bash
cd TLSServer
dotnet run
```

Or simply double-click the executable:
```
TLSServer\bin\Debug\net9.0-windows\TLSServer.exe
```

The TLS Server GUI will open. Click the **"서버 시작"** (Start Server) button.

**Important Notes:**
- Default port: 8443
- The server loads certificates from relative path: `../certificates/`
- Required files: `server.crt`, `server.key`, and `ca.crt`

### Step 4: Run TLS Client

In a **new terminal**, navigate to the TLSClient directory and run:

```bash
cd TLSClient
dotnet run
```

Or simply double-click the executable:
```
TLSClient\bin\Debug\net9.0-windows\TLSClient.exe
```

The TLS Client GUI will open. Enter connection details and click the **"연결"** (Connect) button.

**Connection Settings:**
- Server IP: 127.0.0.1
- Port: 8443

**Important Notes:**
- The client loads certificates from relative path: `../certificates/`
- Required files: `client.crt`, `client.key`, and `ca.crt`

### Step 5: Test Communication

Once connected, you can:

1. **Send messages from server to client:**
   - Type a message in the server's message box
   - Click **"전송"** (Send)

2. **Send messages from client to server:**
   - Type a message in the client's message box
   - Click **"전송"** (Send)

3. **Verify TLS connection:**
   - Both sides will show "TLS 연결 성공 (상호 인증 완료)" when mutual authentication succeeds
   - All messages are encrypted with TLS

## Certificate Management

### Requesting New Certificates

You can request additional client certificates using the client GUI:

1. Enter a certificate name in the **"인증서명"** field
2. Click **"인증서 요청"** (Request Certificate)
3. The certificate will be saved to `certificates/<name>.crt` and `certificates/<name>.key`

### Certificate Locations

All certificates are stored in the `certificates/` directory:

```
certificates/
├── ca.crt              # CA root certificate (public)
├── ca.key              # CA private key
├── server.crt          # Server certificate
├── server.key          # Server private key
├── client.crt          # Client certificate
└── client.key          # Client private key
```

## Troubleshooting

### Certificate Not Found Error

If you see "Certificate not found" errors in the server or client:

1. Make sure the CA server is running
2. Run `python test_certificates.py` to generate certificates
3. Check that files exist in the `certificates/` directory
4. Verify the applications are running from their respective directories (TLSServer or TLSClient)
5. The applications use relative path `../certificates/` to access certificate files

### Connection Refused Error

If the client cannot connect to the server:

1. Make sure the TLS server is running and started
2. Check firewall settings
3. Verify the port is not being used by another application
4. Try connecting to 127.0.0.1 or localhost

### TLS Handshake Failed

If the TLS handshake fails:

1. Verify both server and client have valid certificates
2. Ensure the CA certificate is loaded correctly on both sides
3. Check that certificates are issued by the same CA
4. Restart both server and client applications

### CA Server Connection Error

If certificate requests fail:

1. Make sure the CA server is running on port 8888
2. Check if the port is blocked by firewall
3. Verify Python and cryptography package are installed correctly

## Security Features

This system implements:

- ✅ **Mutual TLS Authentication** - Both server and client verify each other
- ✅ **CA-Signed Certificates** - All certificates are signed by a trusted CA
- ✅ **TLS 1.3** - Latest encryption protocol with enhanced security
- ✅ **Certificate Validation** - Certificates are verified by checking the issuer (Test CA)
- ✅ **Encrypted Communication** - All messages are transmitted over TLS
- ✅ **Custom Certificate Validation** - Uses RemoteCertificateValidationCallback for flexible validation
- ✅ **Modern Certificate Loading** - Uses X509CertificateLoader for secure certificate handling

## Architecture

```
┌─────────────┐         ┌─────────────┐
│  CA Server  │         │ TLS Server  │
│  (Python)   │         │  (C#/GUI)   │
│  Port 8888  │         │  Port 8443  │
└──────┬──────┘         └──────┬──────┘
       │                       │
       │ Issue Certs           │ TLS 1.3
       │                       │ Mutual Auth
       │                       │
       │                ┌──────┴──────┐
       └────────────────┤ TLS Client  │
         Request Cert   │  (C#/GUI)   │
                        └─────────────┘
```

## Development Notes

- The CA server uses Python's `cryptography` library for certificate management
- The TLS server and client use .NET's `SslStream` for TLS 1.3 connections
- Certificate loading uses `X509CertificateLoader` (modern .NET API)
- Certificates use RSA 2048-bit keys with SHA-256 signatures
- All certificates include Subject Alternative Names (SANs) for localhost and 127.0.0.1
- Builds with zero warnings using modern certificate handling APIs

## License

This project is for educational and testing purposes only.