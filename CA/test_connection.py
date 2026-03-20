#!/usr/bin/env python3
"""
TLS Connection Test Script
"""

import socket
import ssl
import sys

def test_tcp_connection(host, port):
    """Test TCP connection"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((host, port))
        sock.close()
        
        if result == 0:
            print(f"[OK] TCP connection successful: {host}:{port}")
            return True
        else:
            print(f"[ERROR] TCP connection failed: {host}:{port} (error code: {result})")
            return False
    except Exception as e:
        print(f"[ERROR] TCP connection error: {e}")
        return False

def test_tls_connection(host, port):
    """Test TLS connection"""
    try:
        # Create TCP socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((host, port))
        
        # Create SSL context
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        # Wrap with TLS
        tls_sock = context.wrap_socket(sock, server_hostname=host)
        
        print(f"[OK] TLS connection successful: {host}:{port}")
        print(f"   Protocol: {tls_sock.version()}")
        print(f"   Cipher: {tls_sock.cipher()}")
        
        tls_sock.close()
        return True
        
    except Exception as e:
        print(f"[ERROR] TLS connection failed: {e}")
        return False

def main():
    print("TLS Connection Test")
    print("=" * 40)
    
    # Test CA server
    print("\n1. CA server connection test (port 8888)")
    test_tcp_connection("127.0.0.1", 8888)
    
    # Test TLS server
    print("\n2. TLS server connection test (port 8443)")
    if test_tcp_connection("127.0.0.1", 8443):
        print("\n3. TLS handshake test")
        test_tls_connection("127.0.0.1", 8443)
    
    print("\nTest completed!")