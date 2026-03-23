# TLS 1.3 Mutual Authentication System - Quick Start Guide

This guide explains how to run the complete CA-based TLS 1.3 mutual authentication system.

## System Overview

The system consists of:
1. **CA Server** (Python) - Issues and manages certificates
2. **TLS Server** (C# WinForms) - Listens for TLS 1.3 connections with mutual authentication
3. **TLS Client** (C# WinForms) - Connects to TLS server with client certificate

## Prerequisites

- Python 3.8+ with cryptography package installed
- .NET 9.0 or later
- Windows 10/11

## Quick Start (Recommended)

All commands should be run from the **CA1.3 directory**.

```bash
# Terminal 1: Start CA Server (keep running)
python ca_server.py

# Terminal 2: Generate certificates
python request_certificates.py

# Terminal 3: Build projects if needed
cd TLSServer && dotnet build && cd ..
cd TLSClient && dotnet build && cd ..

# Terminal 4: Run TLS Server
cd TLSServer
dotnet run

# Terminal 5: Run TLS Client
cd TLSClient
dotnet run
```

## Detailed Step-by-Step Instructions

### Step 1: Start the CA Server

From the **CA1.3 directory**, run:

```bash
python ca_server.py
```

The CA server will:
- Generate a root CA certificate automatically
- Listen on port 8888 for certificate requests
- Save all certificates to the `certificates/` folder in the current directory

Expected output (deprecation warnings can be ignored):
```
Creating CA root certificate...
CA root certificate created successfully
CA server started: localhost:8888
CA root certificate saved to certificates/ca.crt
```

**Important: Keep this terminal open** - the CA server must run in the background.

### Step 2: Generate Certificates

In the **CA1.3 directory**, open a **new terminal** and run:

```bash
python request_certificates.py
```

This script will:
- Connect to the CA server on port 8888
- Request and download CA root certificate
- Request and download server certificate and private key
- Request and download client certificate and private key
- Save all files locally to the `certificates/` folder

Expected output:
```
============================================================
TLS Certificate Request and Save
============================================================

[1] Get CA root certificate
[OK] CA root certificate received
  - CA certificate saved: certificates/ca.crt

[2] Request server certificate
[OK] server Certificate issued successfully (server)
  - Certificate saved: certificates/server.crt
  - Private key saved: certificates/server.key

[3] Request client certificate
[OK] client Certificate issued successfully (client)
  - Certificate saved: certificates/client.crt
  - Private key saved: certificates/client.key

============================================================
Certificate generation completed!
============================================================

Generated files in certificates/:
  - ca.crt
  - client.crt
  - client.key
  - server.crt
  - server.key
```

### Step 3: Build Projects (If Needed)

If you haven't built the projects yet, from the **CA1.3 directory**:

```bash
cd TLSServer
dotnet build
cd ..

cd TLSClient
dotnet build
cd ..
```

### Step 4: Run TLS Server

From the **CA1.3 directory**, open a **new terminal** and run:

```bash
cd TLSServer
dotnet run
```

The TLS Server GUI will open. Click the **"서버 시작"** (Start Server) button.

**Important Notes:**
- Default port: 8443
- The server loads certificates from: `../certificates/` (relative to TLSServer directory)
- Required files: `server.crt`, `server.key`, and `ca.crt`
- Uses TLS 1.3 protocol
- Requires client certificate for mutual authentication

### Step 5: Run TLS Client

From the **CA1.3 directory**, open a **new terminal** and run:

```bash
cd TLSClient
dotnet run
```

The TLS Client GUI will open.

**Connection Steps:**
1. Server IP is already filled: 127.0.0.1
2. Port is already filled: 8443
3. Click the **"연결"** (Connect) button

**Important Notes:**
- The client loads certificates from: `../certificates/` (relative to TLSClient directory)
- Required files: `client.crt`, `client.key`, and `ca.crt`
- Client certificate is automatically sent during TLS handshake
- Both server and client certificates are validated against the CA certificate

### Step 6: Test Communication

Once connected, you can:

1. **Send messages from server to client:**
   - Type a message in the server's message box
   - Click **"전송"** (Send)

2. **Send messages from client to server:**
   - Type a message in the client's message box
   - Click **"전송"** (Send)

3. **Verify TLS connection:**
   - Both sides will show "TLS 연결 성공 (상호 인증 완료)" when mutual authentication succeeds
   - All messages are encrypted with TLS 1.3

## Certificate Management

### Requesting New Certificates

Or use the Python script directly:

```bash
python request_certificates.py
```

### Certificate Locations

All certificates are stored in the `certificates/` directory:

```
certificates/
├── ca.crt              # CA root certificate (public)
├── server.crt          # Server certificate
├── server.key          # Server private key
├── client.crt          # Client certificate
└── client.key          # Client private key
```

## Troubleshooting

### Certificate Not Found Error

If you see "Certificate not found" errors in the server or client:

1. Make sure the CA server is running (`python ca_server.py`)
2. Run `python request_certificates.py` to generate certificates
3. Check that files exist in the `certificates/` directory
4. Verify the applications are running from their respective directories (TLSServer or TLSClient)

### Connection Refused Error

If the client cannot connect to the server:

1. Make sure the TLS server is running and the **"서버 시작"** button was clicked
2. Check firewall settings
3. Verify port 8443 is not being used by another application

### TLS Handshake Failed

If the TLS handshake fails:

1. Verify both server and client have valid certificates
2. Ensure the CA certificate is loaded correctly on both sides
3. Regenerate certificates: `python request_certificates.py`
4. Restart both server and client applications

### CA Server Connection Error

If certificate requests fail:

1. Make sure the CA server is running on port 8888
2. Check if the port is blocked by firewall
3. Verify Python and cryptography package are installed: `pip install cryptography`

## Security Features

This system implements:

- ✅ **Mutual TLS Authentication** - Both server and client verify each other
- ✅ **CA-Signed Certificates** - All certificates are signed by a trusted CA
- ✅ **TLS 1.3** - Latest encryption protocol with enhanced security
- ✅ **Certificate Validation** - Certificates are verified by checking the issuer (Test CA)
- ✅ **Encrypted Communication** - All messages are transmitted over TLS
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

## License

This project is for educational and testing purposes only.
