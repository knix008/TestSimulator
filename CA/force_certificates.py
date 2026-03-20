#!/usr/bin/env python3
"""
Force Certificate Issuance Script
"""

import os
import json
import socket
import time

def force_request_certificate(cert_name, cert_type):
    """Force certificate request to CA server"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect(('127.0.0.1', 8888))
            
            request = {
                'action': 'issue_certificate',
                'common_name': cert_name,
                'type': cert_type
            }
            
            s.send(json.dumps(request).encode())
            
            response_data = s.recv(4096)
            response = json.loads(response_data.decode())
            
            if response['status'] == 'success':
                print(f"[OK] {cert_name} certificate issued successfully")
                
                # Save certificate files
                os.makedirs('certificates', exist_ok=True)
                
                with open(f'certificates/{cert_name}.crt', 'w') as f:
                    f.write(response['certificate'])
                    
                with open(f'certificates/{cert_name}.key', 'w') as f:
                    f.write(response['private_key'])
                
                print(f"   - certificates/{cert_name}.crt saved")
                print(f"   - certificates/{cert_name}.key saved")
                return True
            else:
                print(f"[ERROR] {cert_name} certificate issuance failed: {response.get('message', 'Unknown error')}")
                return False
                
    except Exception as e:
        print(f"[ERROR] CA server connection error: {e}")
        return False

def main():
    print("Force Certificate Issuance")
    print("=" * 30)
    
    # Check if CA server is running
    print("Checking CA server connection...")
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(5)
            s.connect(('127.0.0.1', 8888))
        print("[OK] CA server connection successful")
    except Exception as e:
        print(f"[ERROR] CA server connection failed: {e}")
        print("Please start CA server first: python ca_server.py")
        return
    
    # Request server certificate
    print("\nForce requesting server certificate...")
    force_request_certificate('server', 'server')
    
    # Request client certificate
    print("\nForce requesting client certificate...")
    force_request_certificate('client', 'client')
    
    print("\nCertificate issuance completed!")

if __name__ == "__main__":
    main()