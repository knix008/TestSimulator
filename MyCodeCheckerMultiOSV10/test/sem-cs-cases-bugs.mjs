// sem-cs samples: bugs rules. See sem-cs-cases.mjs for the format.
export default {
  'self-assignment': {
    bad: `public class Person
{
    private string name;

    public Person(string name)
    {
        name = name; // Noncompliant
    }

    public void Rename(string value)
    {
        this.name = this.name; // Noncompliant
        Console.WriteLine(value);
    }
}`,
    good: `public class Person
{
    private string name;

    public Person(string name)
    {
        this.name = name;
    }

    public void Rename(string value)
    {
        name = value;
    }
}`,
  },

  'identical-operands': {
    bad: `public class Range
{
    public bool IsValid(int low, int high)
    {
        if (low == low) // Noncompliant
        {
            return true;
        }
        return high - high > 0; // Noncompliant
    }
}`,
    good: `public class Range
{
    public bool IsValid(int low, int high)
    {
        if (low <= high)
        {
            return true;
        }
        return high - low > 0;
    }

    public bool IsNaN(double d) => d != d;
}`,
  },

  'duplicate-condition': {
    bad: `public class Grader
{
    public string Grade(int score)
    {
        if (score > 90)
        {
            return "A";
        }
        else if (score > 80)
        {
            return "B";
        }
        else if (score > 90) // Noncompliant
        {
            return "C";
        }
        switch (score)
        {
            case 1: return "one";
            case 2: return "two";
            case 1: return "uno"; // Noncompliant
        }
        return "F";
    }
}`,
    good: `public class Grader
{
    public string Grade(int score)
    {
        if (score > 90)
        {
            return "A";
        }
        else if (score > 80)
        {
            return "B";
        }
        else if (score > 70)
        {
            return "C";
        }
        switch (score)
        {
            case 1: return "one";
            case 2: return "two";
        }
        return "F";
    }
}`,
  },

  'identical-branches': {
    bad: `public class Shipping
{
    public decimal Cost(string zone, decimal weight)
    {
        decimal cost = 0;
        if (zone == "EU")
        {
            cost = weight * 2;
            cost += 5;
        }
        else if (zone == "US")
        {
            cost = weight * 3;
            cost += 7;
        }
        else if (zone == "CA")
        { // Noncompliant
            cost = weight * 2;
            cost += 5;
        }
        return cost;
    }
}`,
    good: `public class Shipping
{
    public decimal Cost(string zone, decimal weight)
    {
        decimal cost = 0;
        if (zone == "EU" || zone == "CA")
        {
            cost = weight * 2;
            cost += 5;
        }
        else if (zone == "US")
        {
            cost = weight * 3;
            cost += 7;
        }
        return cost;
    }
}`,
  },

  'all-branches-identical': {
    bad: `public class Picker
{
    public int Pick(bool fast, int a, int b)
    {
        int r;
        if (fast) // Noncompliant
        {
            r = a + b;
        }
        else
        {
            r = a + b;
        }
        return fast ? r : r; // Noncompliant
    }
}`,
    good: `public class Picker
{
    public int Pick(bool fast, int a, int b)
    {
        int r;
        if (fast)
        {
            r = a + b;
        }
        else
        {
            r = a * b;
        }
        return fast ? r : -r;
    }
}`,
  },

  'exception-not-thrown': {
    bad: `public class Validator
{
    public void Check(int value)
    {
        if (value < 0)
        {
            new ArgumentOutOfRangeException(nameof(value)); // Noncompliant
        }
    }
}`,
    good: `public class Validator
{
    public void Check(int value)
    {
        if (value < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(value));
        }
    }
}`,
  },

  'return-value-ignored': {
    bad: `using System;
using System.Collections.Generic;
using System.Linq;

public class Cleaner
{
    public string Clean(string input, List<int> items, DateTime start)
    {
        input.Trim(); // Noncompliant
        start.AddDays(1); // Noncompliant
        items.Where(x => x > 0); // Noncompliant
        string.Format("{0}", input); // Noncompliant
        return input;
    }
}`,
    good: `using System;
using System.Collections.Generic;
using System.Linq;

public class Cleaner
{
    public string Clean(string input, List<int> items, DateTime start)
    {
        input = input.Trim();
        var next = start.AddDays(1);
        var positive = items.Where(x => x > 0).ToList();
        items.Add(positive.Count);
        return string.Format("{0} {1}", input, next);
    }
}`,
  },

  'integer-division-to-float': {
    bad: `public class Stats
{
    public double Ratio(int done, int total)
    {
        double ratio = done / total; // Noncompliant
        float half;
        half = 1 / 2; // Noncompliant
        return ratio + half;
    }
}`,
    good: `public class Stats
{
    public double Ratio(int done, int total)
    {
        double ratio = (double)done / total;
        float half;
        half = 1f / 2;
        int whole = done / total;
        return ratio + half + whole;
    }
}`,
  },

  'useless-increment': {
    bad: `public class Counter
{
    public int Next()
    {
        int i = 0;
        i = i++; // Noncompliant
        return i++; // Noncompliant
    }
}`,
    good: `public class Counter
{
    private int count;

    public int Next()
    {
        int i = 0;
        i++;
        return ++i + count++;
    }
}`,
  },

  'reversed-operator': {
    bad: `public class Accumulator
{
    public int Sum(int[] values)
    {
        int total = 0;
        int target = 10;
        foreach (var v in values)
        {
            total =+ v; // Noncompliant
            target =- 1; // Noncompliant
        }
        return total + target;
    }
}`,
    good: `public class Accumulator
{
    public int Sum(int[] values)
    {
        int total = 0;
        int target = 10;
        foreach (var v in values)
        {
            total += v;
            target -= 1;
        }
        int sign = -1;
        return total + target * sign;
    }
}`,
  },

  'shift-out-of-range': {
    bad: `public class Bits
{
    public long Mask(int value, long wide)
    {
        int a = value << 32; // Noncompliant
        long b = wide >> 64; // Noncompliant
        int c = value << 0; // Noncompliant
        return a + b + c;
    }
}`,
    good: `public class Bits
{
    public long Mask(int value, long wide)
    {
        int a = value << 31;
        long b = wide >> 32;
        long c = (long)value << 40;
        return a + b + c;
    }
}`,
  },

  'accessor-wrong-field': {
    bad: `public class Box
{
    private int width;
    private int height;

    public int Width
    {
        get { return width; }
        set { width = value; }
    }

    public int Height
    {
        get { return width; } // Noncompliant
        set { height = value; }
    }
}`,
    good: `public class Box
{
    private int width;
    private int height;

    public int Width
    {
        get { return width; }
        set { width = value; }
    }

    public int Height
    {
        get { return height; }
        set { height = value; }
    }
}`,
  },

  'setter-ignores-value': {
    bad: `public class Settings
{
    private string theme = "light";

    public string Theme
    {
        get { return theme; }
        set { theme = "dark"; } // Noncompliant
    }
}`,
    good: `public class Settings
{
    private string theme = "light";

    public string Theme
    {
        get { return theme; }
        set { theme = value; }
    }

    public string Locked
    {
        get { return "fixed"; }
        set { throw new NotSupportedException(); }
    }
}`,
  },

  'infinite-recursion': {
    bad: `public class Node
{
    private string name;

    public string Name
    {
        get { return Name; } // Noncompliant
        set { name = value; }
    }

    public int Depth(int level)
    {
        return Depth(level); // Noncompliant
    }
}`,
    good: `public class Node
{
    private string name;

    public string Name
    {
        get { return name; }
        set { name = value; }
    }

    public int Depth(int level)
    {
        if (level <= 0) return 0;
        return Depth(level - 1) + 1;
    }
}`,
  },

  'loop-at-most-once': {
    bad: `public class Finder
{
    public int First(int[] items)
    {
        for (int i = 0; i < items.Length; i++) // Noncompliant
        {
            Console.WriteLine(items[i]);
            return items[i];
        }
        return -1;
    }
}`,
    good: `public class Finder
{
    public int First(int[] items)
    {
        for (int i = 0; i < items.Length; i++)
        {
            if (items[i] > 0)
            {
                return items[i];
            }
        }
        return -1;
    }
}`,
  },

  'for-wrong-direction': {
    bad: `public class Looper
{
    public int Sum(int[] items)
    {
        int s = 0;
        for (int i = 0; i < items.Length; i--) // Noncompliant
        {
            s += items[i];
        }
        return s;
    }
}`,
    good: `public class Looper
{
    public int Sum(int[] items)
    {
        int s = 0;
        for (int i = items.Length - 1; i >= 0; i--)
        {
            s += items[i];
        }
        return s;
    }
}`,
  },

  'for-counter-not-updated': {
    bad: `public class Looper
{
    public int Sum(int[] items)
    {
        int s = 0;
        int j = 0;
        for (int i = 0; i < items.Length; j++) // Noncompliant
        {
            s += items[i++];
        }
        return s + j;
    }
}`,
    good: `public class Looper
{
    public int Sum(int[] items)
    {
        int s = 0;
        for (int i = 0; i < items.Length; i++)
        {
            s += items[i];
        }
        return s;
    }
}`,
  },

  'loop-counter-modified': {
    bad: `public class Looper
{
    public int Skip(int[] items)
    {
        int s = 0;
        for (int i = 0; i < items.Length; i++)
        {
            if (items[i] == 0)
            {
                i++; // Noncompliant
            }
            s += items[i];
        }
        return s;
    }
}`,
    good: `public class Looper
{
    public int Skip(int[] items)
    {
        int s = 0;
        int i = 0;
        while (i < items.Length)
        {
            if (items[i] == 0)
            {
                i++;
            }
            s += items[i];
            i++;
        }
        return s;
    }
}`,
  },

  'collection-size-check': {
    bad: `using System.Collections.Generic;

public class Guard
{
    public bool HasItems(List<string> list, int[] array)
    {
        if (list.Count >= 0) // Noncompliant
        {
            return true;
        }
        return array.Length < 0; // Noncompliant
    }
}`,
    good: `using System.Collections.Generic;

public class Guard
{
    public bool HasItems(List<string> list, int[] array)
    {
        if (list.Count > 0)
        {
            return true;
        }
        return array.Length == 0;
    }
}`,
  },

  'indexof-positive': {
    bad: `public class Search
{
    public bool HasColon(string text)
    {
        return text.IndexOf(':') > 0; // Noncompliant
    }
}`,
    good: `public class Search
{
    public bool HasColon(string text)
    {
        return text.IndexOf(':') >= 0;
    }
}`,
  },

  'new-guid': {
    bad: `using System;

public class Ids
{
    public Guid Create()
    {
        return new Guid(); // Noncompliant
    }
}`,
    good: `using System;

public class Ids
{
    public Guid Create()
    {
        return Guid.NewGuid();
    }

    public Guid Parse(string s) => new Guid(s);
}`,
  },

  'format-string-invalid': {
    bad: `using System;

public class Printer
{
    public string Show(string name, int age)
    {
        Console.WriteLine("{0} is {1} years, {2}", name, age); // Noncompliant
        return string.Format("{0 is {1}", name, age); // Noncompliant
    }
}`,
    good: `using System;

public class Printer
{
    public string Show(string name, int age)
    {
        Console.WriteLine("{0} is {1} years", name, age);
        return string.Format("{0} is {1} {{literal}}", name, age);
    }
}`,
  },

  'format-args-unused': {
    bad: `using System;

public class Printer
{
    public string Show(string name, int age)
    {
        Console.WriteLine("{0} is here", name, age); // Noncompliant
        return string.Format("Hello", name); // Noncompliant
    }
}`,
    good: `using System;

public class Printer
{
    public string Show(string name, int age)
    {
        Console.WriteLine("{0} is {1}", name, age);
        return string.Format("Hello {0}", name);
    }
}`,
  },

  'reference-equals-value-type': {
    bad: `public class Comparer
{
    public bool Same(int a, int b)
    {
        return object.ReferenceEquals(a, b); // Noncompliant
    }
}`,
    good: `public class Comparer
{
    public bool Same(int a, int b)
    {
        return a == b;
    }

    public bool SameRef(string a, string b) => object.ReferenceEquals(a, b);
}`,
  },

  'tostring-returns-null': {
    bad: `public class Money
{
    private decimal? amount;

    public override string ToString()
    {
        if (amount == null)
        {
            return null; // Noncompliant
        }
        return amount.ToString();
    }
}`,
    good: `public class Money
{
    private decimal? amount;

    public override string ToString()
    {
        if (amount == null)
        {
            return string.Empty;
        }
        return amount.ToString();
    }
}`,
  },

  'hashcode-mutable-field': {
    bad: `public class Point
{
    private readonly int x;
    private int y;

    public Point(int x, int y) { this.x = x; this.y = y; }

    public void Move(int dy) { y += dy; }

    public override bool Equals(object obj) => obj is Point p && p.x == x && p.y == y;

    public override int GetHashCode()
    {
        return x * 31 + y; // Noncompliant
    }
}`,
    good: `public class Point
{
    private readonly int x;
    private readonly int y;

    public Point(int x, int y) { this.x = x; this.y = y; }

    public override bool Equals(object obj) => obj is Point p && p.x == x && p.y == y;

    public override int GetHashCode()
    {
        return x * 31 + y;
    }
}`,
  },

  'equals-without-hashcode': {
    bad: `public class Tag // Noncompliant
{
    public string Name { get; set; }

    public override bool Equals(object obj)
    {
        return obj is Tag t && t.Name == Name;
    }
}`,
    good: `public class Tag
{
    public string Name { get; set; }

    public override bool Equals(object obj)
    {
        return obj is Tag t && t.Name == Name;
    }

    public override int GetHashCode() => Name == null ? 0 : Name.GetHashCode();
}`,
  },

  'base-object-equals': {
    bad: `public class Key
{
    public int Id { get; set; }

    public override bool Equals(object obj)
    {
        return base.Equals(obj); // Noncompliant
    }

    public override int GetHashCode()
    {
        return base.GetHashCode(); // Noncompliant
    }
}`,
    good: `public class Entity
{
    public int Id { get; set; }

    public override bool Equals(object obj) => obj is Entity e && e.Id == Id;

    public override int GetHashCode() => Id;
}

public class Customer : Entity
{
    public string Name { get; set; }

    public override bool Equals(object obj) => base.Equals(obj) && obj is Customer c && c.Name == Name;

    public override int GetHashCode() => base.GetHashCode();
}`,
  },

  'thread-static-instance': {
    bad: `using System;

public class Context
{
    [ThreadStatic]
    private int depth; // Noncompliant

    public int Depth => depth;
}`,
    good: `using System;

public class Context
{
    [ThreadStatic]
    private static int depth;

    public int Depth => depth;
}`,
  },

  'thread-static-initialized': {
    bad: `using System;
using System.Text;

public static class Buffers
{
    [ThreadStatic]
    private static StringBuilder cache = new StringBuilder(); // Noncompliant

    public static StringBuilder Get() => cache;
}`,
    good: `using System;
using System.Text;

public static class Buffers
{
    [ThreadStatic]
    private static StringBuilder cache;

    public static StringBuilder Get() => cache ??= new StringBuilder();
}`,
  },

  'anonymous-unsubscribe': {
    bad: `using System;

public class Listener
{
    public void Detach(Publisher p)
    {
        p.Changed -= (s, e) => Console.WriteLine("changed"); // Noncompliant
    }
}

public class Publisher
{
    public event EventHandler Changed;
}`,
    good: `using System;

public class Listener
{
    public void Attach(Publisher p) { p.Changed += OnChanged; }

    public void Detach(Publisher p) { p.Changed -= OnChanged; }

    private void OnChanged(object sender, EventArgs e) => Console.WriteLine("changed");
}

public class Publisher
{
    public event EventHandler Changed;
}`,
  },

  'static-init-order': {
    bad: `public class Limits
{
    public static int Double = Base * 2; // Noncompliant
    public static int Base = 21;
}`,
    good: `public class Limits
{
    public static int Base = 21;
    public static int Double = Base * 2;
}`,
  },

  'thread-suspend-resume': {
    bad: `using System.Threading;

public class Worker
{
    private readonly Thread thread = new Thread(() => { });

    public void Pause()
    {
        thread.Suspend(); // Noncompliant
    }

    public void Continue()
    {
        thread.Resume(); // Noncompliant
    }
}`,
    good: `using System.Threading;

public class Worker
{
    private readonly ManualResetEventSlim gate = new ManualResetEventSlim(true);

    public void Pause() { gate.Reset(); }

    public void Continue() { gate.Set(); }
}`,
  },

  'lock-non-readonly': {
    bad: `public class Cache
{
    private object sync = new object();
    private int count;

    public void Add()
    {
        lock (sync) // Noncompliant
        {
            count++;
        }
        lock (new object()) // Noncompliant
        {
            count--;
        }
    }
}`,
    good: `public class Cache
{
    private readonly object sync = new object();
    private int count;

    public void Add()
    {
        lock (sync)
        {
            count++;
        }
    }
}`,
  },

  'lock-weak-identity': {
    bad: `public class Registry
{
    private int count;

    public void Add()
    {
        lock (this) // Noncompliant
        {
            count++;
        }
        lock (typeof(Registry)) // Noncompliant
        {
            count++;
        }
        lock ("registry") // Noncompliant
        {
            count++;
        }
    }
}`,
    good: `public class Registry
{
    private readonly object sync = new object();
    private int count;

    public void Add()
    {
        lock (sync)
        {
            count++;
        }
    }
}`,
  },

  'flags-enum-uninitialized': {
    bad: `using System;

[Flags]
public enum Access
{
    None = 0,
    Read = 1,
    Write, // Noncompliant
    Execute
}`,
    good: `using System;

[Flags]
public enum Access
{
    None = 0,
    Read = 1,
    Write = 2,
    Execute = 4
}`,
  },

  'flags-zero-none': {
    bad: `using System;

[Flags]
public enum Options
{
    Default = 0, // Noncompliant
    Bold = 1,
    Italic = 2
}`,
    good: `using System;

[Flags]
public enum Options
{
    None = 0,
    Bold = 1,
    Italic = 2
}`,
  },

  'non-flags-bitwise': {
    bad: `public enum Color
{
    Red,
    Green,
    Blue
}

public class Painter
{
    public Color Mix()
    {
        return Color.Red | Color.Blue; // Noncompliant
    }
}`,
    good: `using System;

[Flags]
public enum Color
{
    None = 0,
    Red = 1,
    Green = 2,
    Blue = 4
}

public class Painter
{
    public Color Mix()
    {
        return Color.Red | Color.Blue;
    }
}`,
  },

  'stathread-missing': {
    bad: `using System.Windows.Forms;

static class Program
{
    static void Main() // Noncompliant
    {
        Application.EnableVisualStyles();
        Application.Run(new Form());
    }
}`,
    good: `using System;
using System.Windows.Forms;

static class Program
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.Run(new Form());
    }
}`,
  },

  'task-returns-null': {
    bad: `using System.Threading.Tasks;

public class Loader
{
    public Task LoadAsync(bool skip)
    {
        if (skip)
        {
            return null; // Noncompliant
        }
        return Task.Delay(10);
    }
}`,
    good: `using System.Threading.Tasks;

public class Loader
{
    public Task LoadAsync(bool skip)
    {
        if (skip)
        {
            return Task.CompletedTask;
        }
        return Task.Delay(10);
    }
}`,
  },

  'async-void': {
    bad: `using System.Threading.Tasks;

public class Sync
{
    public async void RefreshAsync() // Noncompliant
    {
        await Task.Delay(100);
    }
}`,
    good: `using System;
using System.Threading.Tasks;

public class Sync
{
    public async Task RefreshAsync()
    {
        await Task.Delay(100);
    }

    private async void OnClick(object sender, EventArgs e)
    {
        await RefreshAsync();
    }
}`,
  },

  'blocking-async-call': {
    bad: `using System.Net.Http;
using System.Threading.Tasks;

public class Client
{
    private readonly HttpClient http = new HttpClient();

    public string Fetch(string url)
    {
        var body = http.GetStringAsync(url).Result; // Noncompliant
        http.GetAsync(url).Wait(); // Noncompliant
        var other = http.GetStringAsync(url).GetAwaiter().GetResult(); // Noncompliant
        return body + other;
    }
}`,
    good: `using System.Net.Http;
using System.Threading.Tasks;

public class Client
{
    private readonly HttpClient http = new HttpClient();

    public async Task<string> FetchAsync(string url)
    {
        var body = await http.GetStringAsync(url);
        await http.GetAsync(url);
        return body;
    }
}`,
  },

  'valuetask-reused': {
    bad: `using System.Threading.Tasks;

public class Reader
{
    public async Task<int> ReadTwiceAsync()
    {
        ValueTask<int> pending = ReadAsync();
        int a = await pending;
        int b = await pending; // Noncompliant
        return a + b;
    }

    private ValueTask<int> ReadAsync() => new ValueTask<int>(1);
}`,
    good: `using System.Threading.Tasks;

public class Reader
{
    public async Task<int> ReadTwiceAsync()
    {
        int a = await ReadAsync();
        int b = await ReadAsync();
        return a + b;
    }

    private ValueTask<int> ReadAsync() => new ValueTask<int>(1);
}`,
  },
};
