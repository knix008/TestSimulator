import pickle
import subprocess
import hashlib

password = "python-secret"
data = pickle.loads(open("session", "rb").read())
subprocess.run("echo " + password, shell=True)
hashlib.md5(password.encode()).hexdigest()
def remember(items=[]):
    items.append(1)
    return items
except_line = None
try:
    remember()
except:
    pass
