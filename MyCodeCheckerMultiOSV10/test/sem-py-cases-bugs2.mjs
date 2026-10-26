// sem-py samples: comparisons, collections, signatures, async and misc bugs
// (rules defined in core/sem-py/rules/bugs2.js).
export default {
  'self-assignment': {
    bad: `
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = self.y  # Noncompliant


def swap(a, b):
    a, b = a, b  # Noncompliant
    total = 0
    total = total  # Noncompliant
    return a, b, total
`,
    good: `
import config

timeout = config.timeout


class Settings:
    timeout = timeout


class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y


def swap(a, b):
    a, b = b, a
    return a, b
`,
  },

  'identical-operands': {
    bad: `
def check(a, b, items):
    if a.size - a.size > 0:  # Noncompliant
        return 1
    if len(items) < len(items):  # Noncompliant
        return 2
    if a.ok and b.ok and a.ok:  # Noncompliant
        return 3
    return 0
`,
    good: `
import math


def check(a, b, items, value):
    if a.size - b.size > 0:
        return 1
    if len(items) < len(b.items):
        return 2
    if a.ok and b.ok:
        return 3
    if value != value:
        return math.nan
    return 2 - 2
`,
  },

  'identity-with-literal': {
    bad: `
def describe(code, name):
    if code is 404:  # Noncompliant
        return "missing"
    if name is not "admin":  # Noncompliant
        return "user"
    return "ok"
`,
    good: `
def describe(code, name, flag):
    if code == 404:
        return "missing"
    if name != "admin":
        return "user"
    if flag is None or flag is True:
        return "unset"
    return "ok"
`,
  },

  'identity-with-new-object': {
    bad: `
def empty(items, mapping):
    if items is []:  # Noncompliant
        return True
    if mapping is not dict():  # Noncompliant
        return False
    return None
`,
    good: `
_MISSING = object()


def empty(items, mapping, value=_MISSING):
    if items == []:
        return True
    if mapping is None:
        return False
    return value is _MISSING
`,
  },

  'nan-comparison': {
    bad: `
import math
import numpy as np


def clean(x, y):
    if x == math.nan:  # Noncompliant
        return 0.0
    if y != float("nan"):  # Noncompliant
        return y
    return np.nan if x < np.nan else x  # Noncompliant
`,
    good: `
import math
import numpy as np


def clean(x, y):
    if math.isnan(x):
        return 0.0
    if not np.isnan(y):
        return y
    return x
`,
  },

  'silly-equality': {
    bad: `
def matches(port, name):
    if "8080" == 8080:  # Noncompliant
        return True
    if [1, 2] != (1, 2):  # Noncompliant
        return False
    return port == name
`,
    good: `
def matches(port, name):
    if str(port) == "8080":
        return True
    if [1, 2] == list((1, 2)):
        return False
    if 1 == 1.0:
        return True
    return name == "x" or port is None
`,
  },

  'constant-condition-literal': {
    bad: `
def is_ready():
    return True


def run(x, items):
    if x == 1 or 2:  # Noncompliant
        print("one or two")
    if is_ready:  # Noncompliant
        print("ready")
    evens = [i for i in items if "even"]  # Noncompliant
    return evens
`,
    good: `
def is_ready():
    return True


def run(x, items):
    if x == 1 or x == 2:
        print("one or two")
    if is_ready():
        print("ready")
    while True:
        break
    while 1:
        break
    evens = [i for i in items if i % 2 == 0]
    return evens
`,
  },

  'all-branches-identical': {
    bad: `
def pick(flag, mode):
    if flag:  # Noncompliant
        value = 1
    elif mode:
        value = 1
    else:
        value = 1
    other = "a" if flag else "a"  # Noncompliant
    return value, other
`,
    good: `
def pick(flag, mode):
    if flag:
        value = 1
    elif mode:
        value = 2
    else:
        value = 1
    if flag:
        print("same")
    other = "a" if flag else "b"
    return value, other
`,
  },

  'duplicate-condition': {
    bad: `
def grade(score):
    if score > 90:
        return "A"
    elif score > 80:
        return "B"
    elif score > 90:  # Noncompliant
        return "C"
    return "F"
`,
    good: `
def grade(score):
    if score > 90:
        return "A"
    elif score > 80:
        return "B"
    elif score > 70:
        return "C"
    return "F"
`,
  },

  'duplicate-dict-key': {
    bad: `
HEADERS = {
    "Accept": "text/html",
    "User-Agent": "bot",
    "Accept": "application/json",  # Noncompliant
}
CODES = {1: "one", 2: "two", 1.0: "uno"}  # Noncompliant
`,
    good: `
HEADERS = {
    "Accept": "text/html",
    "User-Agent": "bot",
    "Accept-Language": "en",
}
CODES = {1: "one", 2: "two", "1": "uno"}
`,
  },

  'duplicate-set-element': {
    bad: `
VOWELS = {"a", "e", "i", "o", "a"}  # Noncompliant
PORTS = {
    80,
    443,
    80,  # Noncompliant
}
`,
    good: `
VOWELS = {"a", "e", "i", "o", "u"}
PORTS = {80, 443, 8080}
`,
  },

  'duplicate-argument': {
    bad: `
def connect(host, port):
    return (host, port)


connect(host="a", port=1, port=2)  # Noncompliant
`,
    good: `
def connect(host, port, **options):
    return (host, port, options)


connect(host="a", port=1, timeout=2)
connect("a", 1, **{"timeout": 2})
`,
  },

  'collection-size-comparison': {
    bad: `
def check(items, names):
    if len(items) >= 0:  # Noncompliant
        print("always")
    if len(names) < 0:  # Noncompliant
        print("never")
    return 0 > len(items)  # Noncompliant
`,
    good: `
def check(items, names):
    if len(items) > 0:
        print("some")
    if len(names) == 0:
        print("none")
    return len(items) >= 1
`,
  },

  'modified-while-iterating': {
    bad: `
def prune(items, index):
    for item in items:
        if item < 0:
            items.remove(item)  # Noncompliant
    for key in index:
        if not index[key]:
            del index[key]  # Noncompliant
    return items
`,
    good: `
def prune(items, index):
    for item in list(items):
        if item < 0:
            items.remove(item)
    for key in index:
        if key == "stop":
            index.pop(key)
            break
    return [i for i in items if i >= 0]
`,
  },

  'return-value-ignored': {
    bad: `
def normalize(name: str, items):
    name.strip()  # Noncompliant
    sorted(items)  # Noncompliant
    return name, items
`,
    good: `
def normalize(name, items):
    name = name.strip()
    items.sort()
    try:
        int(name)
    except ValueError:
        return None
    return name
`,
  },

  'strange-operator': {
    bad: `
def count(values):
    total = 0
    for v in values:
        total =+ v  # Noncompliant
    left = 10
    left =- 1  # Noncompliant
    return total, left
`,
    good: `
def count(values):
    total = 0
    for v in values:
        total += v
    left = -1
    right = +1
    other = (-left)
    return total, left, right, other
`,
  },

  'implicit-string-concatenation': {
    bad: `
COLORS = ["red", "green" "blue", "white"]  # Noncompliant


def show():
    print("a", "b" "c")  # Noncompliant
`,
    good: `
COLORS = ["red", "green", "blue", "white"]
MESSAGE = ("a long line "
           "continued here")
LINES = [
    "first part "
    "second part",
    "other",
]


def show():
    print("a", "b", "c")
    print("one" "line")
`,
  },

  'assert-on-tuple': {
    bad: `
def check(x):
    assert (x > 0, "x must be positive")  # Noncompliant
    return x
`,
    good: `
def check(x, pair):
    assert x > 0, "x must be positive"
    assert pair == (1, 2)
    return x
`,
  },

  'mutable-default-argument': {
    bad: `
def add_item(item, items=[]):  # Noncompliant
    items.append(item)
    return items


def tally(word, counts={}):  # Noncompliant
    counts[word] = counts.get(word, 0) + 1
    return counts
`,
    good: `
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items


def describe(names=[]):
    return ", ".join(names)


def memoized(n, cache={}):
    cache[n] = n * n
    return cache[n]
`,
  },

  'init-return-value': {
    bad: `
class Config:
    def __init__(self, path):
        self.path = path
        return self  # Noncompliant


class Stream:
    def __init__(self, items):
        for i in items:
            yield i  # Noncompliant
`,
    good: `
class Config:
    def __init__(self, path):
        self.path = path
        if not path:
            return
        self.loaded = True

        def helper():
            return 1
        self.helper = helper


def __init__(value):
    return value
`,
  },

  'special-method-signature': {
    bad: `
class Money:
    def __eq__(self):  # Noncompliant
        return True

    def __exit__(self, exc_type):  # Noncompliant
        return False

    def __len__(self, extra):  # Noncompliant
        return 0
`,
    good: `
class Money:
    def __eq__(self, other):
        return True

    def __exit__(self, *args):
        return False

    def __len__(self):
        return 0

    def __round__(self, ndigits=None):
        return self

    def __getitem__(self, key, default=None):
        return default
`,
  },

  'property-accessor-signature': {
    bad: `
class Box:
    @property
    def size(self, unit):  # Noncompliant
        return 1

    @size.setter
    def size(self):  # Noncompliant
        pass
`,
    good: `
class Box:
    def __init__(self):
        self._size = 0

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, value):
        self._size = value

    @size.deleter
    def size(self):
        self._size = 0
`,
  },

  'method-missing-self': {
    bad: `
class Tool:
    def run():  # Noncompliant
        return 1

    def stop(*, force=False):  # Noncompliant
        return force
`,
    good: `
class Tool:
    def run(self):
        return 1

    @staticmethod
    def stop(*, force=False):
        return force

    def __init_subclass__(**kwargs):
        pass

    def any_args(*args):
        return args
`,
  },

  'open-invalid-mode': {
    bad: `
def write(path, data):
    with open(path, "rw") as f:  # Noncompliant
        f.write(data)
    with open(path, mode="wbt") as f:  # Noncompliant
        f.write(data)
`,
    good: `
import io


def write(path, data):
    with open(path, "w") as f:
        f.write(data)
    with open(path, mode="rb+") as f:
        f.read()
    with io.open(path, "at") as f:
        f.write(data)
`,
  },

  'string-format-mismatch': {
    bad: `
def report(name, count, user):
    a = "%s has %d items" % (name,)  # Noncompliant
    b = "{} and {}".format(name)  # Noncompliant
    c = "%(user)s logged in" % {"name": user}  # Noncompliant
    d = "Hello {who}".format(name=user)  # Noncompliant
    e = "{0} {}".format(name, count)  # Noncompliant
    return a, b, c, d, e
`,
    good: `
def report(name, count, user, args):
    a = "%s has %d items" % (name, count)
    b = "{} and {}".format(name, count)
    c = "%(user)s logged in" % {"user": user}
    d = "Hello {who}".format(who=user)
    e = "{0} {1} {0}".format(name, count)
    f = "100%% of %s" % name
    g = "{} {}".format(*args)
    h = "{{literal}} {}".format(name)
    return a, b, c, d, e, f, g, h
`,
  },

  'async-time-sleep': {
    bad: `
import asyncio
import time


async def poll(client):
    while not client.ready:
        time.sleep(1)  # Noncompliant
    await asyncio.sleep(0)
`,
    good: `
import asyncio
import time


async def poll(client):
    while not client.ready:
        await asyncio.sleep(1)


def poll_sync(client):
    while not client.ready:
        time.sleep(1)
`,
  },

  'async-sync-http': {
    bad: `
import requests
import urllib.request


async def fetch(url):
    r = requests.get(url, timeout=5)  # Noncompliant
    page = urllib.request.urlopen(url)  # Noncompliant
    return r.text, page
`,
    good: `
import asyncio
import httpx
import requests


async def fetch(url):
    async with httpx.AsyncClient() as client:
        r = await client.get(url)
    other = await asyncio.to_thread(requests.get, url, timeout=5)
    return r.text, other


def fetch_sync(url):
    return requests.get(url, timeout=5).text
`,
  },

  'async-sync-subprocess': {
    bad: `
import os
import subprocess


async def build(cmd):
    subprocess.run(["make"], check=True)  # Noncompliant
    os.system("make install")  # Noncompliant
`,
    good: `
import asyncio
import subprocess


async def build(cmd):
    proc = await asyncio.create_subprocess_exec("make")
    await proc.wait()


def build_sync():
    subprocess.run(["make"], check=True)
`,
  },

  'async-input': {
    bad: `
async def ask():
    answer = input("Continue? ")  # Noncompliant
    return answer
`,
    good: `
import asyncio


async def ask():
    answer = await asyncio.to_thread(input, "Continue? ")
    return answer


def ask_sync():
    return input("Continue? ")
`,
  },

  'asyncio-task-not-saved': {
    bad: `
import asyncio


async def main(work):
    asyncio.create_task(work())  # Noncompliant
    loop = asyncio.get_running_loop()
    loop.create_task(work())  # Noncompliant
`,
    good: `
import asyncio

background = set()


async def main(work):
    task = asyncio.create_task(work())
    background.add(task)
    task.add_done_callback(background.discard)
    async with asyncio.TaskGroup() as tg:
        tg.create_task(work())
`,
  },

  'cancelled-error-swallowed': {
    bad: `
import asyncio


async def worker(queue):
    try:
        await queue.get()
    except asyncio.CancelledError:  # Noncompliant
        print("cancelled")
`,
    good: `
import asyncio


async def worker(queue):
    try:
        await queue.get()
    except asyncio.CancelledError:
        print("cancelled")
        raise
`,
  },

  'loop-else-without-break': {
    bad: `
def find(items, target):
    for item in items:
        if item == target:
            print("found")
    else:
        print("done")  # Noncompliant
`,
    good: `
def find(items, target):
    for item in items:
        if item == target:
            break
    else:
        print("not found")
    for item in items:
        for other in item:
            if other:
                break
        else:
            continue
        break
    else:
        print("never broke")
`,
  },

  'statement-no-effect': {
    bad: `
def update(x, y):
    x == y  # Noncompliant
    x + 1  # Noncompliant
    y  # Noncompliant
    return x
`,
    good: `
def update(x, y):
    """Docstring is fine."""
    x = y
    x += 1
    try:
        y
    except NameError:
        y = 0
    ...
    return x
`,
  },

  'loop-variable-closure': {
    bad: `
def make_handlers(buttons):
    handlers = []
    for b in buttons:
        handlers.append(lambda: print(b))  # Noncompliant
    for i in range(3):
        def show():
            return i  # Noncompliant
        handlers.append(show)
    return handlers
`,
    good: `
def make_handlers(buttons, rows):
    handlers = []
    for b in buttons:
        handlers.append(lambda b=b: print(b))
    for r in rows:
        best = sorted(r, key=lambda x: x - r[0])
        handlers.append(best)
    for i in range(3):
        def show():
            return i
        print(show())
    return handlers
`,
  },

  'pytz-tzinfo': {
    bad: `
import datetime
import pytz

when = datetime.datetime(2024, 1, 1, tzinfo=pytz.timezone("Europe/Paris"))  # Noncompliant
`,
    good: `
import datetime
import pytz
from zoneinfo import ZoneInfo

paris = pytz.timezone("Europe/Paris")
when = paris.localize(datetime.datetime(2024, 1, 1))
other = datetime.datetime(2024, 1, 1, tzinfo=ZoneInfo("Europe/Paris"))
utc = datetime.datetime(2024, 1, 1, tzinfo=pytz.utc)
`,
  },

  'annotation-type-mismatch': {
    bad: `
count: int = "3"  # Noncompliant
name: str = 42  # Noncompliant
`,
    good: `
from typing import Optional

count: int = 3
ratio: float = 1
name: str = "x"
maybe: Optional[int] = None
flag: int = True
`,
  },

  'return-type-mismatch': {
    bad: `
def parse(text) -> int:
    if not text:
        return None  # Noncompliant
    return "0"  # Noncompliant
`,
    good: `
from typing import Iterator, Optional


def parse(text) -> int:
    return int(text)


def ratio(a, b) -> float:
    return 1


def find(text) -> Optional[int]:
    return None


def gen() -> Iterator[int]:
    yield 1
    return
`,
  },

  'isinstance-invalid-type': {
    bad: `
def check(value):
    if isinstance(value, list[int]):  # Noncompliant
        return 1
    if isinstance(value, "str"):  # Noncompliant
        return 2
    return 0
`,
    good: `
def check(value):
    if isinstance(value, list):
        return 1
    if isinstance(value, (str, bytes)):
        return 2
    if isinstance(value, int | None):
        return 3
    return 0
`,
  },

  'test-assertion-incompatible-types': {
    path: 'tests/test_math.py',
    bad: `
import unittest


class MathTest(unittest.TestCase):
    def test_add(self):
        self.assertEqual("3", 3)  # Noncompliant
        self.assertIs([1], (1,))  # Noncompliant
`,
    good: `
import unittest


class MathTest(unittest.TestCase):
    def test_add(self):
        self.assertEqual("3", str(3))
        self.assertEqual(1.0, 1)
        self.assertIsNot(None, 1)
`,
  },

  'redefined-function': {
    bad: `
def load(path):
    return open(path).read()


def load(path):  # Noncompliant
    return path


class Helper:
    def run(self):
        return 1

    def run(self):  # Noncompliant
        return 2
`,
    good: `
import functools


def load(path):
    return path


cached = load


def load(path):
    return cached(path)


class Helper:
    @property
    def value(self):
        return 1

    @value.setter
    def value(self, v):
        pass

    @functools.singledispatchmethod
    def run(self, x):
        return x
`,
  },

  'overwritten-before-use': {
    bad: `
def build(conf):
    conf["host"] = "a"
    conf["host"] = "b"  # Noncompliant
    conf.port = 1
    conf.port = 2  # Noncompliant
    return conf
`,
    good: `
def build(conf, items):
    conf["host"] = "a"
    conf["port"] = 1
    conf.count = 1
    conf.count = conf.count + 1
    items[0] = 1
    items[0] = items[0] * 2
    conf.port = 1
    conf.reset()
    conf.port = 2
    return conf
`,
  },

  'unpacking-count-mismatch': {
    bad: `
a, b = 1, 2, 3  # Noncompliant
[x, y, z] = [1, 2]  # Noncompliant
`,
    good: `
a, b, c = 1, 2, 3
first, *rest = 1, 2, 3
x, y = y, x = 1, 2
`,
  },

  'division-by-zero': {
    bad: `
def average(values):
    total = sum(values)
    broken = total / 0  # Noncompliant
    total %= 0  # Noncompliant
    return broken
`,
    good: `
def average(values):
    total = sum(values)
    if not values:
        return 0
    try:
        probe = 1 / 0
    except ZeroDivisionError:
        probe = None
    text = "%d" % 0
    return total / len(values), probe, text
`,
  },

  'infinite-loop': {
    bad: `
def wait(limit):
    i = 0
    while i < limit:  # Noncompliant
        print("waiting")
    return i
`,
    good: `
def wait(limit, queue):
    i = 0
    while i < limit:
        print("waiting")
        i += 1
    j = 0
    while j < limit:
        if queue:
            break
    return i, j
`,
  },

  'lock-created-in-with': {
    bad: `
import threading


def update(state, value):
    with threading.Lock():  # Noncompliant
        state.value = value
`,
    good: `
import threading

_lock = threading.Lock()


def update(state, value):
    with _lock:
        state.value = value
`,
  },

  'super-first-arg': {
    bad: `
class Base:
    def greet(self):
        return "base"


class Other:
    pass


class Child(Base):
    def greet(self):
        return super(Other, self).greet()  # Noncompliant
`,
    good: `
class Base:
    def greet(self):
        return "base"


class Middle(Base):
    pass


class Child(Middle):
    def greet(self):
        a = super(Child, self).greet()
        b = super(Middle, self).greet()
        return a + b + super().greet()
`,
  },

  'self-reassigned': {
    bad: `
class Node:
    def reset(self, other):
        self = other  # Noncompliant
        return self
`,
    good: `
class Node:
    def reset(self, other):
        node = other
        return node

    def unwrap(self):
        self = self.inner
        return self
`,
  },

  'abstract-instantiation': {
    bad: `
from abc import ABC, abstractmethod


class Shape(ABC):
    @abstractmethod
    def area(self):
        pass


shape = Shape()  # Noncompliant
`,
    good: `
from abc import ABC, abstractmethod


class Shape(ABC):
    @abstractmethod
    def area(self):
        pass


class Square(Shape):
    def area(self):
        return 1


square = Square()
`,
  },

  'property-without-return': {
    bad: `
class Account:
    def __init__(self):
        self._balance = 0

    @property
    def balance(self):  # Noncompliant
        self._balance
`,
    good: `
class Account:
    def __init__(self):
        self._balance = 0

    @property
    def balance(self):
        return self._balance

    @property
    def secret(self):
        raise AttributeError("write-only")
`,
  },

  'dict-iteration-unpacking': {
    bad: `
def show():
    prices = {"apple": 1, "pear": 2}
    for name, price in prices:  # Noncompliant
        print(name, price)
`,
    good: `
def show(pairs):
    prices = {"apple": 1, "pear": 2}
    for name, price in prices.items():
        print(name, price)
    for a, b in pairs:
        print(a, b)
`,
  },

  'all-invalid-entry': {
    bad: `
def load():
    return 1


class Loader:
    pass


__all__ = ["load", Loader]  # Noncompliant
`,
    good: `
def load():
    return 1


class Loader:
    pass


__all__ = ["load", "Loader"]
`,
  },

  'all-undefined-name': {
    bad: `
def load():
    return 1


__all__ = ["load", "save"]  # Noncompliant
`,
    good: `
from os import path


def load():
    return 1


SAVE = 2
__all__ = ["load", "SAVE", "path"]
`,
  },
};
