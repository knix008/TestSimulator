#!/usr/bin/env python3
"""
인증서 발급 테스트 스크립트
CA 서버에 서버/클라이언트 인증서를 요청합니다.
"""

import socket
import json
import time
import os

def request_certificate(common_name, cert_type='client'):
    """CA 서버에 인증서 요청"""
    try:
        # CA 서버에 연결
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.connect(('127.0.0.1', 8888))

        # 인증서 요청
        request = {
            'action': 'issue_certificate',
            'common_name': common_name,
            'type': cert_type
        }

        client.send(json.dumps(request).encode())

        # 응답 수신
        response = json.loads(client.recv(4096).decode())

        if response['status'] == 'success':
            print(f"[OK] {common_name} Certificate issued successfully ({cert_type})")

            # 인증서 저장 확인
            cert_path = f'certificates/{common_name}.crt'
            key_path = f'certificates/{common_name}.key'

            if os.path.exists(cert_path) and os.path.exists(key_path):
                print(f"  - Certificate: {cert_path}")
                print(f"  - Private key: {key_path}")

            return True
        else:
            print(f"[FAIL] {common_name} Certificate issuance failed")
            return False

    except Exception as e:
        print(f"[ERROR] {e}")
        return False
    finally:
        client.close()

def get_ca_certificate():
    """CA 루트 인증서 요청"""
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.connect(('127.0.0.1', 8888))

        request = {
            'action': 'get_ca_certificate'
        }

        client.send(json.dumps(request).encode())
        response = json.loads(client.recv(4096).decode())

        if response['status'] == 'success':
            print("[OK] CA root certificate verified")

            ca_cert_path = 'certificates/ca.crt'
            if os.path.exists(ca_cert_path):
                print(f"  - CA certificate: {ca_cert_path}")

            return True
        else:
            print("[FAIL] CA certificate verification failed")
            return False

    except Exception as e:
        print(f"[ERROR] {e}")
        return False
    finally:
        client.close()

if __name__ == "__main__":
    print("=" * 60)
    print("TLS Mutual Authentication System - Certificate Test")
    print("=" * 60)
    print()

    print("Connecting to CA server...")
    time.sleep(1)

    print("\n[1] Verify CA root certificate")
    get_ca_certificate()

    print("\n[2] Issue server certificate")
    request_certificate('server', 'server')

    print("\n[3] Issue client certificate")
    request_certificate('client', 'client')

    print("\n" + "=" * 60)
    print("Certificate issuance completed!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Run TLS Server: cd TLSServer && dotnet run")
    print("2. Run TLS Client: cd TLSClient && dotnet run")
    print()