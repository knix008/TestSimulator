// sem-py samples: security hotspots / vulnerabilities (rules/security.js)
// and data-science rules (rules/datasci.js).
export default {
  // ── crypto ──
  'weak-hash': {
    bad: `import hashlib
import hmac
from Crypto.Hash import MD5


def fingerprint(data):
    return hashlib.md5(data).hexdigest()  # Noncompliant


def legacy_digest(data):
    h = hashlib.new('sha1')  # Noncompliant
    h.update(data)
    return h.digest()


def sign(key, msg):
    return hmac.new(key, msg, hashlib.md5).digest()  # Noncompliant


def pycrypto_digest(data):
    return MD5.new(data).hexdigest()  # Noncompliant
`,
    good: `import hashlib
import hmac


def fingerprint(data):
    return hashlib.sha256(data).hexdigest()


def cache_key(data):
    return hashlib.md5(data, usedforsecurity=False).hexdigest()


def sign(key, msg):
    return hmac.new(key, msg, hashlib.sha256).digest()


def modern(data):
    return hashlib.new('sha3_256', data).digest()
`,
  },

  'weak-cipher': {
    bad: `from Crypto.Cipher import DES, ARC4
from cryptography.hazmat.primitives.ciphers import algorithms


def encrypt_legacy(key, data):
    cipher = DES.new(key, DES.MODE_OFB)  # Noncompliant
    return cipher.encrypt(data)


def stream(key, data):
    return ARC4.new(key).encrypt(data)  # Noncompliant


def triple(key):
    return algorithms.TripleDES(key)  # Noncompliant
`,
    good: `from Crypto.Cipher import AES
from cryptography.hazmat.primitives.ciphers import algorithms


def encrypt(key, data):
    cipher = AES.new(key, AES.MODE_GCM)
    return cipher.encrypt_and_digest(data)


def modern(key, nonce):
    return algorithms.ChaCha20(key, nonce)
`,
  },

  'insecure-cipher-mode': {
    bad: `from Crypto.Cipher import AES, PKCS1_v1_5
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.asymmetric import padding


def ecb(key, data):
    return AES.new(key, AES.MODE_ECB).encrypt(data)  # Noncompliant


def ecb_hazmat(key):
    return Cipher(algorithms.AES(key), modes.ECB())  # Noncompliant


def rsa_legacy(pub, msg):
    return PKCS1_v1_5.new(pub).encrypt(msg)  # Noncompliant


def rsa_hazmat(public_key, msg):
    return public_key.encrypt(msg, padding.PKCS1v15())  # Noncompliant
`,
    good: `from Crypto.Cipher import AES, PKCS1_OAEP
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.asymmetric import padding


def gcm(key, data):
    return AES.new(key, AES.MODE_GCM).encrypt_and_digest(data)


def gcm_hazmat(key, iv):
    return Cipher(algorithms.AES(key), modes.GCM(iv))


def rsa(pub, msg):
    return PKCS1_OAEP.new(pub).encrypt(msg)


def rsa_sign(private_key, msg):
    return private_key.sign(msg, padding.PKCS1v15(), hashes.SHA256())
`,
  },

  'static-iv': {
    bad: `from Crypto.Cipher import AES
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

IV = b'0123456789abcdef'


def encrypt(key, data):
    cipher = AES.new(key, AES.MODE_CBC, b'fedcba9876543210')  # Noncompliant
    return cipher.encrypt(data)


def encrypt_iv(key, data):
    cipher = AES.new(key, AES.MODE_CBC, iv=IV)  # Noncompliant
    return cipher.encrypt(data)


def hazmat(key):
    return Cipher(algorithms.AES(key), modes.CBC(b'0000000000000000'))  # Noncompliant
`,
    good: `import os
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


def encrypt(key, data):
    iv = get_random_bytes(16)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return iv + cipher.encrypt(data)


def hazmat(key):
    iv = os.urandom(16)
    return iv, Cipher(algorithms.AES(key), modes.CBC(iv))
`,
  },

  'weak-key-size': {
    bad: `from cryptography.hazmat.primitives.asymmetric import rsa, dsa, ec
from Crypto.PublicKey import RSA


def make_rsa():
    return rsa.generate_private_key(public_exponent=65537, key_size=1024)  # Noncompliant


def make_dsa():
    return dsa.generate_private_key(key_size=1024)  # Noncompliant


def make_legacy():
    return RSA.generate(1024)  # Noncompliant


def make_ec():
    return ec.generate_private_key(ec.SECP192R1())  # Noncompliant
`,
    good: `from cryptography.hazmat.primitives.asymmetric import rsa, dsa, ec
from Crypto.PublicKey import RSA


def make_rsa():
    return rsa.generate_private_key(public_exponent=65537, key_size=3072)


def make_dsa():
    return dsa.generate_private_key(key_size=2048)


def make_legacy():
    return RSA.generate(2048)


def make_ec():
    return ec.generate_private_key(ec.SECP256R1())
`,
  },

  'insecure-random': {
    bad: `import random
import string

ALPHABET = string.ascii_letters + string.digits


def make_token():
    return ''.join(random.choice(ALPHABET) for _ in range(32))  # Noncompliant


def start(user):
    session_id = random.getrandbits(128)  # Noncompliant
    return user, session_id


def reset(user):
    send_mail(user, reset_code=random.randint(100000, 999999))  # Noncompliant


def send_mail(user, reset_code):
    return user, reset_code
`,
    good: `import random
import secrets


def make_token():
    return secrets.token_urlsafe(32)


def retry_backoff(attempt):
    delay = random.uniform(0.5, 1.5) * attempt
    return delay


def pick_color(colors):
    return random.choice(colors)
`,
  },

  // ── TLS ──
  'cert-validation-disabled': {
    bad: `import ssl
import requests


def fetch(url):
    return requests.get(url, verify=False)  # Noncompliant


def context():
    return ssl._create_unverified_context()  # Noncompliant


def lax_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # Noncompliant
    return ctx


def session():
    s = requests.Session()
    s.verify = False  # Noncompliant
    return s
`,
    good: `import ssl
import requests


def fetch(url):
    return requests.get(url, verify='/etc/ssl/certs/corp-ca.pem')


def context():
    ctx = ssl.create_default_context()
    ctx.verify_mode = ssl.CERT_REQUIRED
    return ctx


def session():
    s = requests.Session()
    s.verify = True
    return s
`,
  },

  'hostname-verification-disabled': {
    bad: `import ssl
import urllib3


def context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False  # Noncompliant
    return ctx


def pool():
    return urllib3.PoolManager(cert_reqs='CERT_REQUIRED', assert_hostname=False)  # Noncompliant
`,
    good: `import ssl
import urllib3


def context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = True
    return ctx


def pool():
    return urllib3.PoolManager(cert_reqs='CERT_REQUIRED', assert_hostname='api.example.org')
`,
  },

  'weak-tls-version': {
    bad: `import ssl
from OpenSSL import SSL


def legacy():
    return ssl.SSLContext(ssl.PROTOCOL_TLSv1)  # Noncompliant


def floor(ctx):
    ctx.minimum_version = ssl.TLSVersion.TLSv1_1  # Noncompliant


def openssl_ctx():
    return SSL.Context(SSL.SSLv3_METHOD)  # Noncompliant
`,
    good: `import ssl
from OpenSSL import SSL


def modern():
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    return ctx


def openssl_ctx():
    return SSL.Context(SSL.TLS_METHOD)
`,
  },

  // ── frameworks ──
  'csrf-disabled': [
    {
      bad: `from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from flask import Flask
from flask_wtf.csrf import CSRFProtect

app = Flask(__name__)
csrf = CSRFProtect(app)
app.config['WTF_CSRF_ENABLED'] = False  # Noncompliant


@csrf_exempt  # Noncompliant
def update_profile(request):
    return JsonResponse({'ok': True})


@app.route('/hook', methods=['POST'])
@csrf.exempt  # Noncompliant
def webhook():
    return 'ok'
`,
      good: `from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from flask import Flask
from flask_wtf.csrf import CSRFProtect

app = Flask(__name__)
csrf = CSRFProtect(app)
app.config['WTF_CSRF_ENABLED'] = True


@require_POST
@csrf_protect
def update_profile(request):
    return JsonResponse({'ok': True})
`,
    },
    {
      path: 'mysite/settings.py',
      bad: `INSTALLED_APPS = ['django.contrib.admin', 'django.contrib.auth']

MIDDLEWARE = [  # Noncompliant
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
]
`,
      good: `INSTALLED_APPS = ['django.contrib.admin', 'django.contrib.auth']

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
]
`,
    },
  ],

  'debug-mode-enabled': [
    {
      path: 'mysite/settings.py',
      bad: `import os

DEBUG = True  # Noncompliant
DEBUG_PROPAGATE_EXCEPTIONS = True  # Noncompliant
ALLOWED_HOSTS = ['shop.example.org']
`,
      good: `import os

DEBUG = os.environ.get('DJANGO_DEBUG') == '1'
ALLOWED_HOSTS = ['shop.example.org']
`,
    },
    {
      bad: `from flask import Flask

app = Flask(__name__)
app.config['DEBUG'] = True  # Noncompliant


@app.route('/')
def index():
    return 'hello'


if __name__ == '__main__':
    app.run(port=5000, debug=True)  # Noncompliant
`,
      good: `import os
from flask import Flask

app = Flask(__name__)
app.config['DEBUG'] = os.environ.get('FLASK_DEBUG') == '1'
DEBUG = True


class Options:
    verbose = True


if __name__ == '__main__':
    app.run(port=5000, debug=False)
`,
    },
  ],

  'allowed-hosts-wildcard': {
    path: 'mysite/settings.py',
    bad: `DEBUG = False
ALLOWED_HOSTS = ['shop.example.org', '*']  # Noncompliant
`,
    good: `DEBUG = False
ALLOWED_HOSTS = ['shop.example.org', '.shop.example.org']
`,
  },

  'hardcoded-secret-key': [
    {
      path: 'mysite/settings.py',
      bad: `DEBUG = False
SECRET_KEY = 'django-insecure-7f$k2!x9q@w3e4r5t6y7u8i9o0p'  # Noncompliant
`,
      good: `import os

DEBUG = False
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']
`,
    },
    {
      bad: `from flask import Flask

app = Flask(__name__)
app.secret_key = 'f3cd2a9b8e7d6c5b'  # Noncompliant
app.config['JWT_SECRET_KEY'] = 'super-signing-key-42'  # Noncompliant
app.config.update(SECRET_KEY='a8f5f167f44f4964e6c998dee827110c')  # Noncompliant
`,
      good: `import os
from flask import Flask

app = Flask(__name__)
app.secret_key = os.environ['FLASK_SECRET_KEY']
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY')
app.config.update(SECRET_KEY=os.environ['FLASK_SECRET_KEY'])
`,
    },
  ],

  'hardcoded-credentials': {
    bad: `DB_URL = 'postgresql://admin:Pa55w0rd!@db.internal/prod'  # Noncompliant


class Config:
    password = 'hunter2-prod'  # Noncompliant
    api_key = 'AKfj39dk20sl'  # Noncompliant


def settings():
    return {'user': 'svc', 'client_secret': '9f8e7d6c5b4a'}  # Noncompliant
`,
    good: `import os

DB_URL = os.environ['DATABASE_URL']
PASSWORD_ENV = 'DB_PASSWORD'


class Config:
    password = os.environ.get('APP_PASSWORD')
    api_key = 'changeme'
    password_field = 'password'


def settings():
    return {'user': 'svc', 'password': ''}
`,
  },

  'hardcoded-credentials-call': {
    bad: `import boto3
import psycopg2


def connect():
    return psycopg2.connect(host='db', user='app', password='Tr0ub4dor&3')  # Noncompliant


def s3():
    return boto3.client('s3', aws_access_key_id='AKIAIOSFODNN7EXAMPLE', aws_secret_access_key='wJalrXUtnFEMI/K7MDENG')  # Noncompliant
`,
    good: `import getpass
import logging
import os
import boto3
import psycopg2


def connect():
    return psycopg2.connect(host='db', user='app', password=os.environ['PGPASSWORD'])


def interactive():
    return psycopg2.connect(host='db', user='app', password=getpass.getpass())


def s3():
    return boto3.client('s3')


def audit():
    logging.info('login attempt', extra={'note': 'masked'})
`,
  },

  'empty-db-password': [
    {
      bad: `import psycopg2
import pymysql


def pg():
    return psycopg2.connect(host='db', user='app', password='')  # Noncompliant


def mysql():
    return pymysql.connect(host='db', user='root', passwd='')  # Noncompliant
`,
      good: `import os
import psycopg2
import pymysql


def pg():
    return psycopg2.connect(host='db', user='app', password=os.environ['PGPASSWORD'])


def mysql():
    return pymysql.connect(host='db', user='root', passwd=os.environ['MYSQL_PASSWORD'])
`,
    },
    {
      path: 'mysite/settings.py',
      bad: `DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'shop',
        'USER': 'shop',
        'PASSWORD': '',  # Noncompliant
    },
}
`,
      good: `import os

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'shop',
        'USER': 'shop',
        'PASSWORD': os.environ['DB_PASSWORD'],
    },
    'cache': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': 'cache.sqlite3',
        'PASSWORD': '',
    },
}
`,
    },
  ],

  // ── deserialization ──
  'unsafe-deserialization': {
    bad: `import pickle
import joblib
import numpy as np
import torch


def load_session(blob):
    return pickle.loads(blob)  # Noncompliant


def load_model(path):
    return joblib.load(path)  # Noncompliant


def load_weights(path):
    return torch.load(path)  # Noncompliant


def load_array(path):
    return np.load(path, allow_pickle=True)  # Noncompliant
`,
    good: `import json
import numpy as np
import torch


def load_session(blob):
    return json.loads(blob)


def load_weights(path):
    return torch.load(path, weights_only=True)


def load_array(path):
    return np.load(path)


def save(obj, path):
    torch.save(obj, path)
`,
  },

  'unsafe-yaml-load': {
    bad: `import yaml


def read(f):
    return yaml.load(f)  # Noncompliant


def read_full(f):
    return yaml.load(f, Loader=yaml.Loader)  # Noncompliant


def read_unsafe(text):
    return yaml.unsafe_load(text)  # Noncompliant
`,
    good: `import yaml


def read(f):
    return yaml.safe_load(f)


def read_explicit(f):
    return yaml.load(f, Loader=yaml.SafeLoader)


def write(data, f):
    yaml.dump(data, f)
`,
  },

  // ── files / processes / network ──
  'insecure-temp-file': {
    bad: `import tempfile


def scratch():
    path = tempfile.mktemp(suffix='.csv')  # Noncompliant
    with open(path, 'w') as f:
        f.write('a,b')
    return path
`,
    good: `import os
import tempfile


def scratch():
    fd, path = tempfile.mkstemp(suffix='.csv')
    with os.fdopen(fd, 'w') as f:
        f.write('a,b')
    return path
`,
  },

  'publicly-writable-directory': {
    bad: `import os

CACHE_DIR = '/var/tmp/app-cache'  # Noncompliant


def export(rows):
    with open('/tmp/report.csv', 'w') as f:  # Noncompliant
        f.writelines(rows)


def lock_file(name):
    return os.path.join('/dev/shm', name)  # Noncompliant
`,
    good: `import os
import tempfile


def export(rows):
    with tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False) as f:
        f.writelines(rows)
        return f.name


def is_temporary(path):
    """Paths under /tmp are cleaned on reboot."""
    return path.startswith('/tmp/')


def cache_dir():
    return os.path.join(tempfile.gettempdir(), 'app-cache')
`,
  },

  'file-permissions-loose': {
    bad: `import os
import stat
from pathlib import Path


def publish(path):
    os.chmod(path, 0o777)  # Noncompliant


def share(path):
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IROTH)  # Noncompliant


def open_umask():
    os.umask(0)  # Noncompliant


def touch(p):
    Path(p).chmod(0o666)  # Noncompliant
`,
    good: `import os
import stat
from pathlib import Path


def publish(path):
    os.chmod(path, 0o750)


def private(path):
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)


def strict_umask():
    os.umask(0o077)


def touch(p):
    Path(p).chmod(0o600)
`,
  },

  'archive-extraction': {
    bad: `import tarfile
import zipfile


def unpack(path, dest):
    with tarfile.open(path) as tar:
        tar.extractall(dest)  # Noncompliant


def unzip(path, dest):
    zipfile.ZipFile(path).extractall(dest)  # Noncompliant


def one(path, name, dest):
    with tarfile.open(path) as tar:
        tar.extract(name, dest)  # Noncompliant
`,
    good: `import tarfile
import zipfile


def unpack(path, dest):
    with tarfile.open(path) as tar:
        tar.extractall(dest, filter='data')


def unzip(path, dest):
    with zipfile.ZipFile(path) as zf:
        safe = [m for m in zf.namelist() if not m.startswith('/') and '..' not in m]
        zf.extractall(dest, members=safe)
`,
  },

  'dynamic-code-execution': {
    bad: `def calc(expr):
    return eval(expr)  # Noncompliant


def run_plugin(source, env):
    exec(source, env)  # Noncompliant
`,
    good: `import ast


def calc(expr):
    return ast.literal_eval(expr)


def constant():
    return eval('1 + 2')
`,
  },

  'hardcoded-ip': {
    bad: `import socket

SERVER = '10.20.30.40'  # Noncompliant


def connect():
    return socket.create_connection(('192.168.1.15', 22))  # Noncompliant


def dns():
    return {'resolver': '8.8.4.4:53'}  # Noncompliant


def upstream():
    resolver = '8.8.8.8'  # Noncompliant
    return resolver
`,
    good: `import os
import socket

SERVER = os.environ.get('SERVER_HOST', 'localhost')
__version__ = '1.2.3.4'
SCHEMA = '1.1.1.1'


def connect():
    return socket.create_connection(('127.0.0.1', 22))


def docs():
    return {'example': '192.0.2.10', 'any': '0.0.0.0'}
`,
  },

  'bind-all-interfaces': {
    bad: `import socket
import uvicorn
from flask import Flask

app = Flask(__name__)


def serve():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('0.0.0.0', 8080))  # Noncompliant
    s.listen()


def main():
    app.run(host='0.0.0.0', port=5000)  # Noncompliant


def api():
    uvicorn.run('main:app', host='0.0.0.0', port=8000)  # Noncompliant
`,
    good: `import socket
import uvicorn
from flask import Flask

app = Flask(__name__)


def serve():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 8080))
    s.listen()


def main():
    app.run(host='127.0.0.1', port=5000)


def api():
    uvicorn.run('main:app', host='127.0.0.1', port=8000)
`,
  },

  'ldap-anonymous-bind': {
    bad: `import ldap
from ldap3 import Connection, Server, ANONYMOUS


def bind_empty(uri, dn):
    conn = ldap.initialize(uri)
    conn.simple_bind_s(dn, '')  # Noncompliant
    return conn


def bind_anon(uri):
    conn = ldap.initialize(uri)
    conn.simple_bind()  # Noncompliant
    return conn


def ldap3_anon(host):
    return Connection(Server(host), authentication=ANONYMOUS)  # Noncompliant
`,
    good: `import os
import ldap
from ldap3 import Connection, Server, SIMPLE


def bind(uri, dn):
    conn = ldap.initialize(uri)
    conn.simple_bind_s(dn, os.environ['LDAP_PASSWORD'])
    return conn


def bind_kw(uri, dn, pw):
    conn = ldap.initialize(uri)
    conn.simple_bind_s(who=dn, cred=pw)
    return conn


def ldap3_bind(host, user, pw):
    return Connection(Server(host), user=user, password=pw, authentication=SIMPLE)
`,
  },

  'signal-process': {
    bad: `import os
import signal


def stop(pid):
    os.kill(pid, signal.SIGTERM)  # Noncompliant


def stop_group(pgid):
    os.killpg(pgid, signal.SIGKILL)  # Noncompliant
`,
    good: `import subprocess


def stop(proc: subprocess.Popen):
    proc.terminate()
    proc.wait(timeout=5)
`,
  },

  'hardcoded-jwt-secret': {
    bad: `import jwt


def issue(user_id):
    return jwt.encode({'sub': user_id}, 'my-signing-secret', algorithm='HS256')  # Noncompliant


def check(token):
    return jwt.decode(token, key='my-signing-secret', algorithms=['HS256'])  # Noncompliant
`,
    good: `import os
import jwt

SIGNING_KEY = os.environ['JWT_SIGNING_KEY']


def issue(user_id):
    return jwt.encode({'sub': user_id}, SIGNING_KEY, algorithm='HS256')


def check(token):
    return jwt.decode(token, key=SIGNING_KEY, algorithms=['HS256'])
`,
  },

  'cleartext-http-url': {
    bad: `import requests
from urllib.request import urlopen


def items():
    return requests.get('http://api.partner-shop.com/v1/items')  # Noncompliant


def feed(host):
    return urlopen(f'http://{host}/feed.xml')  # Noncompliant
`,
    good: `import requests
from urllib.request import urlopen


def items():
    return requests.get('https://api.partner-shop.com/v1/items')


def local():
    return urlopen('http://localhost:8000/health')


def feed(host):
    return urlopen(f'https://{host}/feed.xml')
`,
  },

  'assert-in-production': {
    bad: `def withdraw(account, amount):
    assert amount > 0, 'amount must be positive'  # Noncompliant
    account.balance -= amount


class Store:
    def get(self, key):
        assert isinstance(key, str)  # Noncompliant
        return self.data[key]
`,
    good: `def withdraw(account, amount):
    if amount <= 0:
        raise ValueError('amount must be positive')
    account.balance -= amount


def _internal(values):
    assert values
    return values[0]


class Store:
    def get(self, key):
        value = self.data.get(key)
        assert self.data is not None
        return value
`,
  },

  // ── AWS CDK ──
  'cdk-s3-public-access': {
    bad: `from aws_cdk import Stack, aws_s3 as s3


class SiteStack(Stack):
    def __init__(self, scope, id):
        super().__init__(scope, id)
        s3.Bucket(self, 'Site', public_read_access=True)  # Noncompliant
        s3.Bucket(
            self, 'Assets',
            block_public_access=s3.BlockPublicAccess(block_public_acls=False, block_public_policy=True),  # Noncompliant
        )
`,
    good: `from aws_cdk import Stack, aws_s3 as s3


class SiteStack(Stack):
    def __init__(self, scope, id):
        super().__init__(scope, id)
        s3.Bucket(self, 'Site', block_public_access=s3.BlockPublicAccess.BLOCK_ALL)
        s3.Bucket(self, 'Assets', public_read_access=False)
`,
  },

  'cdk-s3-unencrypted': {
    bad: `from aws_cdk import Stack, aws_s3 as s3


class DataStack(Stack):
    def __init__(self, scope, id):
        super().__init__(scope, id)
        s3.Bucket(self, 'Raw', encryption=s3.BucketEncryption.UNENCRYPTED)  # Noncompliant
        s3.Bucket(self, 'Logs', enforce_ssl=False)  # Noncompliant
`,
    good: `from aws_cdk import Stack, aws_s3 as s3


class DataStack(Stack):
    def __init__(self, scope, id):
        super().__init__(scope, id)
        s3.Bucket(self, 'Raw', encryption=s3.BucketEncryption.S3_MANAGED, enforce_ssl=True)
        s3.Bucket(self, 'Logs', encryption=s3.BucketEncryption.KMS)
`,
  },

  'cdk-open-ingress': {
    bad: `from aws_cdk import Stack, aws_ec2 as ec2


class NetStack(Stack):
    def __init__(self, scope, id, vpc):
        super().__init__(scope, id)
        sg = ec2.SecurityGroup(self, 'Web', vpc=vpc)
        sg.add_ingress_rule(ec2.Peer.any_ipv4(), ec2.Port.tcp(22))  # Noncompliant
        sg.add_ingress_rule(ec2.Peer.ipv4('0.0.0.0/0'), ec2.Port.tcp(3389))  # Noncompliant
`,
    good: `from aws_cdk import Stack, aws_ec2 as ec2


class NetStack(Stack):
    def __init__(self, scope, id, vpc):
        super().__init__(scope, id)
        sg = ec2.SecurityGroup(self, 'Web', vpc=vpc)
        sg.add_ingress_rule(ec2.Peer.ipv4('10.0.0.0/16'), ec2.Port.tcp(22))
        sg.add_ingress_rule(ec2.Peer.security_group_id('sg-0a1b2c3d'), ec2.Port.tcp(5432))
        sg.add_egress_rule(ec2.Peer.any_ipv4(), ec2.Port.tcp(443))
`,
  },

  'cdk-public-ip': {
    bad: `from aws_cdk import Stack, aws_ec2 as ec2, aws_rds as rds


class AppStack(Stack):
    def __init__(self, scope, id, vpc, image):
        super().__init__(scope, id)
        ec2.Instance(self, 'Bastion', vpc=vpc, machine_image=image, instance_type=ec2.InstanceType('t3.micro'), associate_public_ip_address=True)  # Noncompliant
        rds.DatabaseInstance(self, 'Db', vpc=vpc, engine=rds.DatabaseInstanceEngine.POSTGRES, publicly_accessible=True)  # Noncompliant
`,
    good: `from aws_cdk import Stack, aws_ec2 as ec2, aws_rds as rds


class AppStack(Stack):
    def __init__(self, scope, id, vpc, image):
        super().__init__(scope, id)
        ec2.Instance(self, 'Worker', vpc=vpc, machine_image=image, instance_type=ec2.InstanceType('t3.micro'), associate_public_ip_address=False)
        rds.DatabaseInstance(self, 'Db', vpc=vpc, engine=rds.DatabaseInstanceEngine.POSTGRES, publicly_accessible=False)
`,
  },

  'cdk-unencrypted-storage': {
    bad: `from aws_cdk import Stack, aws_rds as rds, aws_sqs as sqs


class StoreStack(Stack):
    def __init__(self, scope, id, vpc):
        super().__init__(scope, id)
        rds.DatabaseInstance(self, 'Db', vpc=vpc, engine=rds.DatabaseInstanceEngine.POSTGRES, storage_encrypted=False)  # Noncompliant
        sqs.Queue(self, 'Jobs', encryption=sqs.QueueEncryption.UNENCRYPTED)  # Noncompliant
`,
    good: `from aws_cdk import Stack, aws_rds as rds, aws_sqs as sqs


class StoreStack(Stack):
    def __init__(self, scope, id, vpc):
        super().__init__(scope, id)
        rds.DatabaseInstance(self, 'Db', vpc=vpc, engine=rds.DatabaseInstanceEngine.POSTGRES, storage_encrypted=True)
        sqs.Queue(self, 'Jobs', encryption=sqs.QueueEncryption.KMS_MANAGED)
`,
  },

  // ── data science ──
  'numpy-deprecated-alias': {
    bad: `import numpy as np


def to_float(a):
    return a.astype(np.float)  # Noncompliant


def flags(n):
    return np.zeros(n, dtype=np.bool)  # Noncompliant


def count(x):
    return np.int(x)  # Noncompliant
`,
    good: `import numpy as np


def to_float(a):
    return a.astype(np.float64)


def flags(n):
    return np.zeros(n, dtype=np.bool_)


def count(x):
    return int(x)
`,
  },

  'numpy-legacy-random': {
    bad: `import numpy as np


def sample(n):
    np.random.seed(0)  # Noncompliant
    return np.random.rand(n)  # Noncompliant


def pick(items):
    return np.random.choice(items, 3)  # Noncompliant
`,
    good: `import numpy as np


def sample(n):
    rng = np.random.default_rng(0)
    return rng.random(n)


def pick(items, rng):
    return rng.choice(items, 3)
`,
  },

  'random-seed-missing': {
    bad: `import numpy as np
from numpy.random import RandomState


def noise(n):
    rng = np.random.default_rng()  # Noncompliant
    return rng.normal(size=n)


def legacy():
    return RandomState()  # Noncompliant
`,
    good: `import numpy as np
from numpy.random import RandomState


def noise(n, seed=42):
    rng = np.random.default_rng(seed)
    return rng.normal(size=n)


def legacy():
    return RandomState(1234)
`,
  },

  'sklearn-random-state-missing': {
    bad: `from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import KFold, train_test_split


def fit(X, y):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)  # Noncompliant
    model = RandomForestClassifier(n_estimators=200)  # Noncompliant
    folds = KFold(n_splits=5, shuffle=True)  # Noncompliant
    return model.fit(X_train, y_train), folds, X_test, y_test
`,
    good: `from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold, train_test_split


def fit(X, y):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestClassifier(n_estimators=200, random_state=42)
    folds = KFold(n_splits=5)
    baseline = LinearRegression()
    return model.fit(X_train, y_train), folds, baseline, X_test, y_test
`,
  },

  'numpy-where-single-arg': {
    bad: `import numpy as np


def positives(a):
    return np.where(a > 0)  # Noncompliant
`,
    good: `import numpy as np


def positives(a):
    return np.nonzero(a > 0)


def clip_negative(a):
    return np.where(a > 0, a, 0)
`,
  },

  'numpy-matrix': {
    bad: `import numpy as np


def rotation():
    return np.matrix([[0, -1], [1, 0]])  # Noncompliant


def wrap(a):
    return np.asmatrix(a)  # Noncompliant
`,
    good: `import numpy as np


def rotation():
    return np.array([[0, -1], [1, 0]])


def apply(m, v):
    return m @ v
`,
  },

  'pandas-inplace': {
    bad: `import pandas as pd


def clean(path):
    df = pd.read_csv(path)
    df.dropna(inplace=True)  # Noncompliant
    df.rename(columns={'a': 'b'}, inplace=True)  # Noncompliant
    return df
`,
    good: `import pandas as pd


def clean(path):
    df = pd.read_csv(path)
    df = df.dropna()
    df = df.rename(columns={'a': 'b'})
    df.sort_values('b', inplace=False)
    return df
`,
  },

  'pandas-merge-args': {
    bad: `import pandas as pd


def join(orders, customers):
    return pd.merge(orders, customers)  # Noncompliant


def join2(path, customers):
    df = pd.read_csv(path)
    return df.merge(customers, on='customer_id')  # Noncompliant
`,
    good: `import pandas as pd


def join(orders, customers):
    return pd.merge(orders, customers, how='left', on='customer_id', validate='many_to_one')


def join2(path, customers):
    df = pd.read_csv(path)
    return df.merge(customers, how='inner', left_on='cid', right_on='id', validate='m:1')
`,
  },

  'pandas-values': {
    bad: `import pandas as pd


def matrix(path):
    df = pd.read_csv(path)
    X = df.values  # Noncompliant
    y = df['target'].values  # Noncompliant
    return X, y
`,
    good: `import pandas as pd


def matrix(path):
    df = pd.read_csv(path)
    X = df.to_numpy()
    y = df['target'].to_numpy()
    return X, y


def totals(counts):
    return sum(counts.values())


class Form:
    def __init__(self, values):
        self.values = values
`,
  },

  'pandas-chained-assignment': {
    bad: `import pandas as pd


def fix(path):
    df = pd.read_csv(path)
    df['price'][0] = 10  # Noncompliant
    df.loc[df['qty'] > 5]['flag'] = True  # Noncompliant
    return df
`,
    good: `import pandas as pd


def fix(path):
    df = pd.read_csv(path)
    df.loc[0, 'price'] = 10
    df.loc[df['qty'] > 5, 'flag'] = True
    df['total'] = df['price'] * df['qty']
    return df


def grid(n):
    cells = [[0] * n for _ in range(n)]
    cells[0][0] = 1
    return cells
`,
  },

  'pandas-append-removed': {
    bad: `import pandas as pd


def collect(rows):
    df = pd.DataFrame(columns=['a', 'b'])
    for row in rows:
        df = df.append(row, ignore_index=True)  # Noncompliant
    return df
`,
    good: `import pandas as pd


def collect(rows):
    frames = []
    for row in rows:
        frames.append(pd.DataFrame([row]))
    return pd.concat(frames, ignore_index=True)
`,
  },

  'torch-module-init': {
    bad: `import torch.nn as nn


class Net(nn.Module):
    def __init__(self, n_in, n_out):  # Noncompliant
        self.fc = nn.Linear(n_in, n_out)

    def forward(self, x):
        return self.fc(x)
`,
    good: `import torch.nn as nn


class Net(nn.Module):
    def __init__(self, n_in, n_out):
        super().__init__()
        self.fc = nn.Linear(n_in, n_out)

    def forward(self, x):
        return self.fc(x)


class Config:
    def __init__(self, size):
        self.size = size
`,
  },

  'torch-forward-direct': {
    bad: `import torch


def predict(model, batch):
    with torch.no_grad():
        return model.forward(batch)  # Noncompliant


def encode(encoder, x):
    return encoder.forward(x).mean(dim=0)  # Noncompliant
`,
    good: `import torch
import torch.nn as nn


def predict(model, batch):
    with torch.no_grad():
        return model(batch)


class Wrapped(nn.Linear):
    def forward(self, x):
        return super().forward(x) * 2


class Other(nn.Linear):
    def forward(self, x):
        return nn.Linear.forward(self, x)
`,
  },

  'torch-variable-deprecated': {
    bad: `import torch
from torch.autograd import Variable


def wrap(t):
    return Variable(t, requires_grad=True)  # Noncompliant


def wrap2(t):
    return torch.autograd.Variable(t)  # Noncompliant
`,
    good: `import torch


def wrap(t):
    return t.detach().requires_grad_(True)


def make():
    return torch.zeros(3, requires_grad=True)
`,
  },
};
