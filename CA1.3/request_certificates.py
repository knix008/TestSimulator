#!/usr/bin/env python3
"""
인증서 발급 및 저장 스크립트
CA 서버에 인증서를 요청하고 로컬에 저장합니다.
"""

import socket
import json
import os

def request_and_save_certificate(common_name, cert_type='client'):
    """CA 서버에 인증서 요청하고 저장"""
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
        response = json.loads(client.recv(8192).decode())

        if response['status'] == 'success':
            print(f"[OK] {common_name} Certificate issued successfully ({cert_type})")

            # certificates 디렉토리 생성
            os.makedirs('certificates', exist_ok=True)

            # 인증서 저장
            cert_path = f'certificates/{common_name}.crt'
            with open(cert_path, 'w') as f:
                f.write(response['certificate'])
            print(f"  - Certificate saved: {cert_path}")

            # 개인키 저장
            key_path = f'certificates/{common_name}.key'
            with open(key_path, 'w') as f:
                f.write(response['private_key'])
            print(f"  - Private key saved: {key_path}")

            return True
        else:
            print(f"[FAIL] {common_name} Certificate issuance failed")
            return False

    except Exception as e:
        print(f"[ERROR] {e}")
        return False
    finally:
        client.close()

def get_and_save_ca_certificate():
    """CA 루트 인증서 요청하고 저장"""
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.connect(('127.0.0.1', 8888))

        request = {
            'action': 'get_ca_certificate'
        }

        client.send(json.dumps(request).encode())
        response = json.loads(client.recv(4096).decode())

        if response['status'] == 'success':
            print("[OK] CA root certificate received")

            # certificates 디렉토리 생성
            os.makedirs('certificates', exist_ok=True)

            # CA 인증서 저장
            ca_cert_path = 'certificates/ca.crt'
            with open(ca_cert_path, 'w') as f:
                f.write(response['ca_certificate'])
            print(f"  - CA certificate saved: {ca_cert_path}")

            return True
        else:
            print("[FAIL] CA certificate request failed")
            return False

    except Exception as e:
        print(f"[ERROR] {e}")
        return False
    finally:
        client.close()

if __name__ == "__main__":
    print("=" * 60)
    print("TLS Certificate Request and Save")
    print("=" * 60)
    print()

    print("[1] Get CA root certificate")
    get_and_save_ca_certificate()

    print("\n[2] Request server certificate")
    request_and_save_certificate('server', 'server')

    print("\n[3] Request client certificate")
    request_and_save_certificate('client', 'client')

    print("\n" + "=" * 60)
    print("Certificate generation completed!")
    print("=" * 60)
    print("\nGenerated files in certificates/:")
    for file in os.listdir('certificates'):
        print(f"  - {file}")
    print()