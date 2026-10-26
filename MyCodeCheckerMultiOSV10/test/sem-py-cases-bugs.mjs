// sem-py samples: flow / CFG / symbolic-execution rules (rules/flow.js) and
// exception, call and type bugs (rules/bugs.js).
export default {
  'unreachable-code': [
    {
      bad: `import sys


def parse(text):
    if not text:
        return None
        print("empty")  # Noncompliant
    value = int(text)
    return value


def main(argv):
    for arg in argv:
        if arg == "--help":
            sys.exit(0)
            print("never")  # Noncompliant
        if arg == "--":
            break
            print("stop")  # Noncompliant
    raise SystemExit(1)
    cleanup()  # Noncompliant


def cleanup():
    pass
`,
      good: `import sys


def parse(text):
    if not text:
        print("empty")
        return None
    value = int(text)
    return value


def main(argv):
    for arg in argv:
        if arg == "--help":
            print("usage")
            sys.exit(0)
        if arg == "--":
            break
    cleanup()
    raise SystemExit(1)


def cleanup():
    pass
`,
    },
    {
      bad: `def serve(queue):
    while True:
        item = queue.get()
        if item is None:
            continue
        item.run()
    queue.close()  # Noncompliant
`,
      good: `def serve(queue):
    while True:
        item = queue.get()
        if item is None:
            break
        item.run()
    queue.close()


def wait(cond):
    while not cond():
        pass
    return True
`,
    },
  ],

  'dead-store': {
    bad: `def total(prices, tax):
    result = compute_base(prices)  # Noncompliant
    result = sum(prices)
    rate = tax * 2  # Noncompliant
    rate = tax
    return result * (1 + rate)


def compute_base(prices):
    return len(prices)


def label(user):
    name = user.first_name  # Noncompliant
    name = user.display_name
    return name.title()
`,
    good: `def total(prices, tax):
    result = sum(prices)
    if tax:
        result = result * (1 + tax)
    return result


def label(user):
    name = None
    if user.display_name:
        name = user.display_name
    return name


def retry(fn, attempts):
    error = 0
    for _ in range(attempts):
        try:
            return fn()
        except ValueError as exc:
            error = exc
    raise RuntimeError(str(error))
`,
  },

  'use-before-assignment': {
    bad: `def report(rows):
    print(header)  # Noncompliant
    header = "Report"
    for row in rows:
        print(row)


counter = 0


def bump():
    counter = counter + 1  # Noncompliant
    return counter


def drop(items):
    first = items[0]
    del first
    return first  # Noncompliant
`,
    good: `def report(rows):
    header = "Report"
    print(header)
    for row in rows:
        print(row)


counter = 0


def bump():
    global counter
    counter = counter + 1
    return counter


def pick(items):
    for item in items:
        if item:
            found = item
            break
    else:
        found = None
    return found
`,
  },

  'none-dereference': {
    bad: `def find_user(users, name):
    match = None
    for user in users:
        if user.name == name:
            match = user
    return match


def greet(conn):
    session = None
    session.close()  # Noncompliant


def load(cache, key):
    entry = cache.get(key)
    if entry is None:
        print(entry.value)  # Noncompliant
    return entry
`,
    good: `def greet(conn):
    session = None
    if conn:
        session = conn.open()
    if session is not None:
        session.close()


def load(cache, key):
    entry = cache.get(key)
    if entry is None:
        return None
    return entry.value


def safe(obj):
    value = None
    try:
        value.strip()
    except AttributeError:
        pass
    return obj
`,
  },

  'condition-always-true': {
    bad: `def scan(items):
    found = False
    for item in items:
        if item.ok:
            found = True
            break
    if found:
        return 1
    ready = True
    if ready:  # Noncompliant
        return 2
    return 0


def poll(source):
    max_retries = 3
    if max_retries > 0:  # Noncompliant
        return source.read()
    return None


def check(flag):
    if flag is None:
        return 0
    if flag is not None:  # Noncompliant
        return 1
    return 2
`,
    good: `def scan(items):
    found = False
    for item in items:
        if item.ok:
            found = True
            break
    if found:
        return 1
    return 0


def check(flag):
    if flag is None:
        return 0
    if flag:
        return 1
    return 2


def poll(source):
    retries = 3
    while retries > 0:
        retries -= 1
        if source.ready():
            return source.read()
    return None
`,
  },

  'condition-always-false': {
    bad: `def build(debug):
    verbose = False
    if verbose:  # Noncompliant
        print("building")
    return debug


def fetch(conn):
    result = None
    if result is not None:  # Noncompliant
        return result
    result = conn.query()
    return result


def page(items):
    size = 20
    if size < 1:  # Noncompliant
        size = 1
    return items[:size]
`,
    good: `def build(debug):
    verbose = False
    if debug:
        verbose = True
    if verbose:
        print("building")
    return debug


def fetch(conn):
    result = None
    if conn:
        result = conn.query()
    if result is not None:
        return result
    return None


def page(items, size=20):
    if size < 1:
        size = 1
    count = 0
    for _ in items:
        count += 1
    if count < size:
        return items
    return items[:size]
`,
  },

  'inconsistent-return': {
    bad: `def lookup(table, key):  # Noncompliant
    if key in table:
        return table[key]


def ratio(a, b):
    if b == 0:
        return  # Noncompliant
    return a / b
`,
    good: `def lookup(table, key):
    if key in table:
        return table[key]
    return None


def ratio(a, b):
    if b == 0:
        raise ZeroDivisionError("b")
    return a / b


def log(msg):
    if not msg:
        return
    print(msg)
`,
  },

  'parameter-reassigned': {
    bad: `def resize(image, width):
    width = 640  # Noncompliant
    return image.scale(width)


def send(message, retries):
    for attempt in range(3):
        print(attempt)
    retries = 5  # Noncompliant
    while retries:
        retries -= 1
        message.post()
`,
    good: `def resize(image, width):
    if width is None:
        width = 640
    return image.scale(width)


def send(message, retries):
    retries = max(retries, 1)
    while retries:
        retries -= 1
        message.post()
`,
  },

  'infinite-recursion': {
    bad: `def countdown(n):  # Noncompliant
    print(n)
    countdown(n - 1)


class Node:
    def __init__(self, parent):
        self.parent = parent

    def depth(self):  # Noncompliant
        return 1 + self.depth()

    @property
    def name(self):  # Noncompliant
        return self.name


async def watch(feed):  # Noncompliant
    await feed.next()
    await watch(feed)
`,
    good: `def countdown(n):
    if n <= 0:
        return
    print(n)
    countdown(n - 1)


class Node:
    def __init__(self, parent, label):
        self.parent = parent
        self._name = label

    def depth(self):
        if self.parent is None:
            return 0
        return 1 + self.parent.depth()

    @property
    def name(self):
        return self._name


async def watch(loop, feed):
    await feed.next()
    loop.create_task(watch(loop, feed))
`,
  },

  'raise-non-exception': {
    bad: `class Config:
    pass


def check(value):
    if value < 0:
        raise "negative value"  # Noncompliant
    if value > 100:
        raise Config()  # Noncompliant
    if value == 42:
        raise NotImplemented  # Noncompliant
    return value
`,
    good: `class ConfigError(Exception):
    pass


def check(value):
    if value < 0:
        raise ValueError("negative value")
    if value > 100:
        raise ConfigError()
    if value == 42:
        raise NotImplementedError
    return value
`,
  },

  'except-non-exception': {
    bad: `class Retry:
    pass


def run(job):
    try:
        job()
    except Retry:  # Noncompliant
        pass
    except ValueError():  # Noncompliant
        pass
    except (KeyError, str):  # Noncompliant
        pass
`,
    good: `class Retry(Exception):
    pass


def run(job, extra):
    try:
        job()
    except Retry:
        pass
    except (ValueError, KeyError):
        pass
    except extra:
        pass
`,
  },

  'except-boolean-expression': {
    bad: `def read(path):
    try:
        with open(path) as f:
            return f.read()
    except FileNotFoundError or PermissionError:  # Noncompliant
        return ""
    except ValueError and TypeError:  # Noncompliant
        return None
`,
    good: `def read(path):
    try:
        with open(path) as f:
            return f.read()
    except (FileNotFoundError, PermissionError):
        return ""
`,
  },

  'except-unreachable': {
    bad: `class AppError(Exception):
    pass


class DbError(AppError):
    pass


def run(job):
    try:
        job()
    except OSError:
        pass
    except FileNotFoundError:  # Noncompliant
        pass
    except AppError:
        pass
    except DbError:  # Noncompliant
        pass
    except Exception:
        pass
    except ValueError:  # Noncompliant
        pass
`,
    good: `class AppError(Exception):
    pass


class DbError(AppError):
    pass


def run(job):
    try:
        job()
    except FileNotFoundError:
        pass
    except OSError:
        pass
    except DbError:
        pass
    except AppError:
        pass
    except Exception:
        pass
`,
  },

  'bare-raise-outside-except': {
    bad: `import logging

try:
    import ujson as json
except ImportError:
    import json

if not hasattr(json, "dumps"):
    raise  # Noncompliant

try:
    import yaml
except ImportError:
    yaml = None
else:
    raise  # Noncompliant

logging.info("loaded %s", yaml)
`,
    good: `import logging

try:
    import ujson as json
except ImportError:
    logging.warning("fallback")
    raise


def reraise():
    raise
`,
  },

  'bare-raise-in-finally': {
    bad: `def save(db, row):
    try:
        db.insert(row)
    finally:
        db.close()
        raise  # Noncompliant


def load(db):
    try:
        return db.fetch()
    finally:
        if db.dirty:
            raise  # Noncompliant
`,
    good: `def save(db, row):
    try:
        db.insert(row)
    finally:
        try:
            db.close()
        except OSError:
            raise
`,
  },

  'jump-in-finally': {
    bad: `def fetch(conn):
    try:
        return conn.read()
    finally:
        conn.close()
        return None  # Noncompliant


def drain(items):
    for item in items:
        try:
            item.process()
        finally:
            break  # Noncompliant
`,
    good: `def fetch(conn):
    try:
        return conn.read()
    finally:
        conn.close()


def drain(items):
    try:
        for item in items:
            item.process()
    finally:
        for item in items:
            if item.done:
                break
`,
  },

  'break-outside-loop': {
    bad: `def check(value):
    if value:
        break  # Noncompliant
    return value


def skip(value):
    if not value:
        continue  # Noncompliant
`,
    good: `def first(values):
    for value in values:
        if value:
            break
    else:
        return None
    return value


def odd(values):
    out = []
    while values:
        value = values.pop()
        if value % 2 == 0:
            continue
        out.append(value)
    return out
`,
  },

  'return-outside-function': {
    bad: `import os

if not os.environ.get("APP"):
    return  # Noncompliant


class Plugin:
    yield 1  # Noncompliant
`,
    good: `import os


def configure():
    if not os.environ.get("APP"):
        return None
    return os.environ["APP"]


def numbers():
    yield 1


squares = [x * x for x in range(3)]
gen = (lambda: (yield))
`,
  },

  'call-arguments': [{
    bad: `def connect(host, port, timeout=10):
    return (host, port, timeout)


class Client:
    def __init__(self, url):
        self.url = url

    def send(self, data):
        return data


def main():
    connect("localhost")  # Noncompliant
    connect("localhost", 80, 5, True)  # Noncompliant
    connect("localhost", 80, retries=3)  # Noncompliant
    connect("localhost", 80, host="x")  # Noncompliant
    client = Client()  # Noncompliant
    client.send(1, 2)  # Noncompliant
    return client
`,
    good: `def connect(host, port, timeout=10, *, secure=False):
    return (host, port, timeout, secure)


def log(*args, **kwargs):
    return args, kwargs


class Client:
    def __init__(self, url):
        self.url = url

    def send(self, data):
        return data


def main(opts, extra):
    connect("localhost", 80)
    connect("localhost", port=80, timeout=5, secure=True)
    connect(*extra)
    connect("localhost", **opts)
    log(1, 2, 3, level="x")
    client = Client("http://x")
    client.send({"a": 1})
    return client
`,
  }, {
    extra: [{ path: 'app/mail.py', text: `def notify(user, message, *, urgent=False):
    return user, message, urgent
` }],
    bad: `import app.mail as mail
from app.mail import notify


def remind(user):
    notify(user)  # Noncompliant
    mail.notify(user, "hi", True)  # Noncompliant
    mail.notify(user, "hi", priority=1)  # Noncompliant
`,
    good: `import app.mail as mail
from app.mail import notify


def remind(user):
    notify(user, "hi")
    mail.notify(user, "hi", urgent=True)
    mail.notify(user=user, message="hi")
`,
  }],

  'not-callable': {
    bad: `class Settings:
    def __init__(self):
        self.debug = False


def main():
    count = 3
    count()  # Noncompliant
    names = ["a", "b"]
    names()  # Noncompliant
    cfg = Settings()
    cfg()  # Noncompliant
    "text"()  # Noncompliant


on_exit = None
on_exit()  # Noncompliant
`,
    good: `class Handler:
    def __call__(self, event):
        return event


def main(factory):
    handler = Handler()
    handler("x")
    make = factory
    make()
    count = len
    return count([1])
`,
  },

  'iterate-non-iterable': {
    bad: `class Bag:
    def __init__(self):
        self.items = []


def main(n):
    for i in 10:  # Noncompliant
        print(i)
    bag = Bag()
    for item in bag:  # Noncompliant
        print(item)
    first, second = 3.5  # Noncompliant
    for x in main:  # Noncompliant
        print(x)
    return first, second, n
`,
    good: `class Bag:
    def __init__(self):
        self.items = []

    def __iter__(self):
        return iter(self.items)


def main(n):
    for i in range(10):
        print(i)
    bag = Bag()
    for item in bag:
        print(item)
    first, second = divmod(n, 2)
    return [x for x in bag.items], first, second
`,
  },

  'subscript-unsupported': {
    bad: `class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y


def main():
    count = 5
    print(count[0])  # Noncompliant
    p = Point(1, 2)
    print(p[0])  # Noncompliant
    name = "abc"
    name[0] = "x"  # Noncompliant
    pair = (1, 2)
    del pair[0]  # Noncompliant
    tags = {"a", "b"}
    return tags[0]  # Noncompliant
`,
    good: `from typing import List


class Grid:
    def __init__(self):
        self.cells = {}

    def __getitem__(self, key):
        return self.cells[key]


def main(values: List[int]) -> List[int]:
    g = Grid()
    print(g[0, 0])
    name = "abc"
    print(name[0])
    items = [1, 2]
    items[0] = 3
    del items[1]
    return values[:1]
`,
  },

  'incompatible-operands': {
    bad: `def main():
    label = "count: " + 5  # Noncompliant
    items = [1, 2] + (3, 4)  # Noncompliant
    total = None + 1  # Noncompliant
    name = "abc"
    size = len(name) - name  # Noncompliant
    return label, items, total, size
`,
    good: `def main(value):
    label = "count: " + str(5)
    items = [1, 2] + list((3, 4))
    msg = "%s items" % 3
    rep = "ab" * 3
    total = 1 + 2.5
    merged = {"a": 1} | {"b": 2}
    return label, items, msg, rep, total, merged, value + 1
`,
  },

  'membership-unsupported': {
    bad: `class Token:
    def __init__(self, text):
        self.text = text


def main(word):
    limit = 10
    if word in limit:  # Noncompliant
        return 1
    tok = Token("x")
    if "x" in tok:  # Noncompliant
        return 2
    return word in 3.5  # Noncompliant
`,
    good: `class Vocabulary:
    def __init__(self):
        self.words = set()

    def __contains__(self, word):
        return word in self.words


def main(word):
    vocab = Vocabulary()
    if word in vocab:
        return 1
    if word in "abc":
        return 2
    return word not in [1, 2]
`,
  },

  'none-return-used': {
    bad: `def log(msg):
    print(msg)


def main(values):
    result = log("start")  # Noncompliant
    items = [3, 1, 2]
    ordered = items.sort()  # Noncompliant
    reverse = list(values).reverse()  # Noncompliant
    return result, ordered, reverse
`,
    good: `def log(msg):
    print(msg)
    return msg


def fail(msg):
    raise RuntimeError(msg)


def main(values):
    result = log("start")
    ordered = sorted(values)
    values.sort()
    return result, ordered
`,
  },

  'exception-not-raised': {
    bad: `class QuotaError(Exception):
    pass


def check(used, limit):
    if used < 0:
        ValueError("negative")  # Noncompliant
    if used > limit:
        QuotaError(used)  # Noncompliant
    return used
`,
    good: `import warnings


class QuotaError(Exception):
    pass


def check(used, limit):
    if used < 0:
        raise ValueError("negative")
    if used > limit:
        raise QuotaError(used)
    warnings.warn("checked")
    return used
`,
  },

  'async-not-awaited': {
    bad: `import asyncio


async def fetch(url):
    await asyncio.sleep(0)
    return url


class Worker:
    async def step(self):
        await asyncio.sleep(0)

    async def run(self):
        self.step()  # Noncompliant


async def main():
    fetch("http://a")  # Noncompliant
    await fetch("http://b")
`,
    good: `import asyncio


async def fetch(url):
    await asyncio.sleep(0)
    return url


class Worker:
    async def step(self):
        await asyncio.sleep(0)

    async def run(self):
        await self.step()


async def main():
    task = asyncio.create_task(fetch("http://a"))
    await fetch("http://b")
    await task
`,
  },
};
