#!/usr/bin/env python3
"""
CA (Certificate Authority) Server
인증서 발급 및 검증을 담당하는 CA 서버
"""

import os
import json
import socket
import threading
import ipaddress
from datetime import datetime, timedelta
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
import base64

class CAServer:
    def __init__(self, host='localhost', port=8888):
        self.host = host
        self.port = port
        self.ca_private_key = None
        self.ca_certificate = None
        self.certificates_db = {}  # 발급된 인증서 저장
        
        # CA 인증서 생성
        self._create_ca_certificate()
        
    def _create_ca_certificate(self):
        """CA 루트 인증서 생성"""
        print("Creating CA root certificate...")
        
        # CA 개인키 생성
        self.ca_private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048
        )
        
        # CA 인증서 생성
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "KR"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Seoul"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "Seoul"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Test CA"),
            x509.NameAttribute(NameOID.COMMON_NAME, "Test CA Root"),
        ])
        
        self.ca_certificate = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            self.ca_private_key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.utcnow()
        ).not_valid_after(
            datetime.utcnow() + timedelta(days=3650)  # 10년
        ).add_extension(
            x509.BasicConstraints(ca=True, path_length=None),
            critical=True,
        ).add_extension(
            x509.KeyUsage(
                key_cert_sign=True,
                crl_sign=True,
                digital_signature=True,
                key_encipherment=False,
                content_commitment=False,
                data_encipherment=False,
                key_agreement=False,
                encipher_only=False,
                decipher_only=False
            ),
            critical=True,
        ).sign(self.ca_private_key, hashes.SHA256())
        
        print("CA root certificate created successfully")
        
    def _save_certificate(self, cert_name, certificate, private_key):
        """인증서를 파일로 저장"""
        os.makedirs('certificates', exist_ok=True)
        
        # 인증서 저장
        with open(f'certificates/{cert_name}.crt', 'wb') as f:
            f.write(certificate.public_bytes(Encoding.PEM))
            
        # 개인키 저장
        with open(f'certificates/{cert_name}.key', 'wb') as f:
            f.write(private_key.private_bytes(
                encoding=Encoding.PEM,
                format=PrivateFormat.PKCS8,
                encryption_algorithm=NoEncryption()
            ))
            
        # CA 인증서 저장
        with open('certificates/ca.crt', 'wb') as f:
            f.write(self.ca_certificate.public_bytes(Encoding.PEM))
            
        with open('certificates/ca.key', 'wb') as f:
            f.write(self.ca_private_key.private_bytes(
                encoding=Encoding.PEM,
                format=PrivateFormat.PKCS8,
                encryption_algorithm=NoEncryption()
            ))
    
    def issue_certificate(self, common_name, cert_type='server'):
        """인증서 발급"""
        print(f"Certificate issuance request: {common_name} ({cert_type})")
        
        # 개인키 생성
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048
        )
        
        # 인증서 주체 생성
        subject = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "KR"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Seoul"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "Seoul"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Test Organization"),
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ])
        
        # 인증서 빌더
        builder = x509.CertificateBuilder()
        builder = builder.subject_name(subject)
        builder = builder.issuer_name(self.ca_certificate.subject)
        builder = builder.public_key(private_key.public_key())
        builder = builder.serial_number(x509.random_serial_number())
        builder = builder.not_valid_before(datetime.utcnow())
        builder = builder.not_valid_after(datetime.utcnow() + timedelta(days=365))
        
        # 확장 필드 추가
        builder = builder.add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        
        if cert_type == 'server':
            builder = builder.add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    key_encipherment=True,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    content_commitment=False,
                    data_encipherment=False,
                    encipher_only=False,
                    decipher_only=False
                ),
                critical=True,
            )
            builder = builder.add_extension(
                x509.ExtendedKeyUsage([
                    ExtendedKeyUsageOID.SERVER_AUTH,
                    ExtendedKeyUsageOID.CLIENT_AUTH
                ]),
                critical=True,
            )
        else:  # client
            builder = builder.add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    key_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    content_commitment=False,
                    data_encipherment=False,
                    encipher_only=False,
                    decipher_only=False
                ),
                critical=True,
            )
            builder = builder.add_extension(
                x509.ExtendedKeyUsage([
                    ExtendedKeyUsageOID.CLIENT_AUTH
                ]),
                critical=True,
            )
        
        # SAN (Subject Alternative Name) 추가
        builder = builder.add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName(common_name),
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1"))
            ]),
            critical=False,
        )
        
        # CA로 서명
        certificate = builder.sign(self.ca_private_key, hashes.SHA256())
        
        # 인증서 저장
        self._save_certificate(common_name, certificate, private_key)
        
        # 데이터베이스에 저장
        self.certificates_db[common_name] = {
            'certificate': certificate,
            'private_key': private_key,
            'type': cert_type,
            'issued_at': datetime.utcnow().isoformat()
        }
        
        print(f"Certificate issued successfully: {common_name}")
        return certificate, private_key
    
    def get_ca_certificate(self):
        """CA 인증서 반환"""
        return self.ca_certificate
    
    def verify_certificate(self, certificate):
        """인증서 검증"""
        try:
            # CA 인증서로 검증
            self.ca_certificate.public_key().verify(
                certificate.signature,
                certificate.tbs_certificate_bytes,
                certificate.signature_algorithm
            )
            return True
        except Exception as e:
            print(f"Certificate verification failed: {e}")
            return False
    
    def handle_client(self, client_socket, address):
        """클라이언트 요청 처리"""
        try:
            while True:
                data = client_socket.recv(1024)
                if not data:
                    break
                    
                request = json.loads(data.decode())
                response = {}
                
                if request['action'] == 'issue_certificate':
                    cert_name = request['common_name']
                    cert_type = request.get('type', 'server')
                    
                    if cert_name in self.certificates_db:
                        # 이미 존재하는 인증서의 PEM 형식 반환
                        certificate = self.certificates_db[cert_name]['certificate']
                        private_key = self.certificates_db[cert_name]['private_key']
                        
                        # 파일로도 저장 (혹시 파일이 없는 경우)
                        self._save_certificate(cert_name, certificate, private_key)
                        
                        cert_pem = certificate.public_bytes(Encoding.PEM).decode()
                        key_pem = private_key.private_bytes(
                            encoding=Encoding.PEM,
                            format=PrivateFormat.PKCS8,
                            encryption_algorithm=NoEncryption()
                        ).decode()
                        
                        response = {
                            'status': 'success',
                            'certificate': cert_pem,
                            'private_key': key_pem
                        }
                    else:
                        certificate, private_key = self.issue_certificate(cert_name, cert_type)
                        
                        # PEM 형식으로 인코딩
                        cert_pem = certificate.public_bytes(Encoding.PEM).decode()
                        key_pem = private_key.private_bytes(
                            encoding=Encoding.PEM,
                            format=PrivateFormat.PKCS8,
                            encryption_algorithm=NoEncryption()
                        ).decode()
                        
                        response = {
                            'status': 'success',
                            'certificate': cert_pem,
                            'private_key': key_pem
                        }
                
                elif request['action'] == 'get_ca_certificate':
                    ca_cert_pem = self.ca_certificate.public_bytes(Encoding.PEM).decode()
                    response = {
                        'status': 'success',
                        'ca_certificate': ca_cert_pem
                    }
                
                elif request['action'] == 'verify_certificate':
                    # 인증서 검증 로직 (실제 구현에서는 더 복잡)
                    response = {'status': 'success', 'verified': True}
                
                client_socket.send(json.dumps(response).encode())
                
        except Exception as e:
            print(f"Client handling error: {e}")
        finally:
            client_socket.close()
    
    def start_server(self):
        """CA 서버 시작"""
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind((self.host, self.port))
        server_socket.listen(5)
        
        print(f"CA server started: {self.host}:{self.port}")
        print("CA root certificate saved to certificates/ca.crt")
        
        while True:
            try:
                client_socket, address = server_socket.accept()
                print(f"Client connected: {address}")
                
                client_thread = threading.Thread(
                    target=self.handle_client,
                    args=(client_socket, address)
                )
                client_thread.daemon = True
                client_thread.start()
                
            except KeyboardInterrupt:
                print("\nCA server shutdown")
                break
            except Exception as e:
                print(f"Server error: {e}")
        
        server_socket.close()

if __name__ == "__main__":
    ca_server = CAServer()
    ca_server.start_server()
