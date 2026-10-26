// sem-cs samples: smells rules. See sem-cs-cases.mjs for the format.
export default {
  // ───────────────────────────── complexity
  'cognitive-complexity': {
    options: { cognitiveThreshold: 4 },
    bad: `using System.Collections.Generic;
public class Report
{
    public int CountMatches(List<string> lines, string word) // Noncompliant
    {
        int count = 0;
        foreach (var line in lines)
        {
            if (line != null)
            {
                if (line.Contains(word) || line.StartsWith(word))
                {
                    count++;
                }
            }
        }
        return count;
    }
}`,
    good: `using System.Collections.Generic;
using System.Linq;
public class Report
{
    public int CountMatches(List<string> lines, string word)
    {
        return lines.Count(line => IsMatch(line, word));
    }

    private static bool IsMatch(string line, string word)
    {
        if (line == null)
        {
            return false;
        }
        return line.Contains(word);
    }
}`,
  },
  'cyclomatic-complexity': {
    options: { cyclomaticThreshold: 3 },
    bad: `public class Pricing
{
    public decimal Discount(int age, bool member, bool coupon) // Noncompliant
    {
        decimal d = 0;
        if (age < 18) d += 0.1m;
        if (member) d += 0.05m;
        if (coupon && age > 65) d += 0.2m;
        return d;
    }
}`,
    good: `public class Pricing
{
    public decimal Discount(int age, bool member)
    {
        decimal d = 0;
        if (age < 18) d += 0.1m;
        if (member) d += 0.05m;
        return d;
    }
}`,
  },
  'too-many-parameters': {
    bad: `public class Mailer
{
    public void Send(string from, string to, string cc, string bcc, string subject, string body, bool html, int priority) // Noncompliant
    {
        System.Console.WriteLine(from + to + cc + bcc + subject + body + html + priority);
    }
}`,
    good: `public class Message
{
    public string From { get; set; }
    public string To { get; set; }
    public string Body { get; set; }
}
public class Mailer
{
    public void Send(Message message, bool html)
    {
        System.Console.WriteLine(message.From + message.To + message.Body + html);
    }
}`,
  },
  'method-too-long': {
    options: { maxMethodLines: 3 },
    bad: `public class Setup
{
    public int Init() // Noncompliant
    {
        int a = 1;
        int b = 2;
        int c = 3;
        int d = 4;
        return a + b + c + d;
    }
}`,
    good: `public class Setup
{
    public int Init()
    {
        int a = 1;
        int b = 2;
        return a + b;
    }
}`,
  },
  'file-too-long': {
    options: { maxFileLines: 6 },
    bad: `using System; // Noncompliant
public class Big
{
    public int A() { return 1; }
    public int B() { return 2; }
    public int C() { return 3; }
    public int D() { return 4; }
}`,
    good: `using System;
public class Small
{
    // a comment line does not count
    public int A() { return 1; }
}`,
  },
  'deep-nesting': {
    bad: `public class Grid
{
    public int Sum(int[][] rows, bool skipNegative)
    {
        int total = 0;
        if (rows != null)
        {
            foreach (var row in rows)
            {
                for (int i = 0; i < row.Length; i++)
                {
                    if (skipNegative) // Noncompliant
                    {
                        if (row[i] < 0) continue;
                    }
                    total += row[i];
                }
            }
        }
        return total;
    }
}`,
    good: `public class Grid
{
    public int Sum(int[][] rows, bool skipNegative)
    {
        if (rows == null) return 0;
        int total = 0;
        foreach (var row in rows)
        {
            total += SumRow(row, skipNegative);
        }
        return total;
    }

    private static int SumRow(int[] row, bool skipNegative)
    {
        int total = 0;
        for (int i = 0; i < row.Length; i++)
        {
            if (skipNegative && row[i] < 0) continue;
            total += row[i];
        }
        return total;
    }
}`,
  },
  'expression-too-complex': {
    bad: `public class Validator
{
    public bool IsValid(int a, int b, int c, bool d, bool e)
    {
        return a > 0 && b > 0 && c > 0 && d && e; // Noncompliant
    }
}`,
    good: `public class Validator
{
    public bool IsValid(int a, int b, int c, bool d, bool e)
    {
        bool positive = a > 0 && b > 0 && c > 0;
        return positive && d && e;
    }
}`,
  },
  'too-many-returns': {
    bad: `public class Grader
{
    public string Grade(int score) // Noncompliant
    {
        if (score >= 90) return "A";
        if (score >= 80) return "B";
        if (score >= 70) return "C";
        return "F";
    }
}`,
    good: `public class Grader
{
    public string Grade(int score)
    {
        if (score >= 90) return "A";
        if (score >= 80) return "B";
        return "F";
    }
}`,
  },
  'too-many-switch-cases': {
    options: { maxSwitchCases: 3 },
    bad: `public class Days
{
    public string Name(int day)
    {
        switch (day) // Noncompliant
        {
            case 1: return "Mon";
            case 2: return "Tue";
            case 3: return "Wed";
            case 4: return "Thu";
            default: return "?";
        }
    }
}`,
    good: `public class Days
{
    private static readonly string[] Names = { "Mon", "Tue", "Wed", "Thu" };
    public string Name(int day)
    {
        switch (day)
        {
            case 1: return "Mon";
            case 2: return "Tue";
            default: return Names[day % 4];
        }
    }
}`,
  },
  'line-too-long': {
    options: { maxLineLength: 60 },
    bad: `public class Wide
{
    public int Total(int first, int second, int third, int fourth) { return first + second + third + fourth; } // Noncompliant
}`,
    good: `public class Wide
{
    public int Total(int first, int second)
    {
        return first + second;
    }
}`,
  },
  'too-many-generic-params': {
    bad: `public class Mapper<TSource, TTarget, TContext> // Noncompliant
{
    public TTarget Map(TSource s, TContext c) { return default; }
}
public static class Combine
{
    public static TR Apply<T1, T2, T3, TR>(T1 a, T2 b, T3 c) { return default; } // Noncompliant
}`,
    good: `public class Mapper<TSource, TTarget>
{
    public TTarget Map(TSource s) { return default; }
}
public static class Combine
{
    public static TR Apply<T1, T2, TR>(T1 a, T2 b) { return default; }
}`,
  },
  'inheritance-depth': {
    options: { maxInheritanceDepth: 2 },
    bad: `public class Animal { }
public class Mammal : Animal { }
public class Dog : Mammal { }
public class Puppy : Dog { } // Noncompliant`,
    good: `public class Animal { }
public class Mammal : Animal { }
public class Dog : Mammal { }`,
  },

  // ───────────────────────────── unused code
  'unused-private-member': {
    bad: `public class Calculator
{
    private int _unused; // Noncompliant
    public int Add(int a, int b) { return a + b; }
    private int Twice(int a) { return a * 2; } // Noncompliant
}`,
    good: `public class Calculator
{
    private int _calls;
    public int Add(int a, int b) { _calls++; return Twice(a) + b + _calls; }
    private int Twice(int a) { return a * 2; }
}`,
  },
  'unread-private-field': {
    bad: `public class Counter
{
    private int _last; // Noncompliant
    public int Next(int value)
    {
        _last = value;
        return value + 1;
    }
}`,
    good: `public class Counter
{
    private int _last;
    public int Next(int value)
    {
        int previous = _last;
        _last = value;
        return previous + 1;
    }
}`,
  },
  'unused-local': {
    bad: `public class Area
{
    public int Square(int side)
    {
        int unused = 42; // Noncompliant
        return side * side;
    }
}`,
    good: `public class Area
{
    public int Square(int side)
    {
        int result = side * side;
        return result;
    }
}`,
  },
  'unused-parameter': {
    bad: `public class Formatter
{
    public string Run(string s) { return Wrap(s, 2); }
    private string Wrap(string text, int width) // Noncompliant
    {
        return "[" + text + "]";
    }
}`,
    good: `public class Formatter
{
    public string Run(string s) { return Wrap(s, 2); }
    private string Wrap(string text, int width)
    {
        return "[" + text.PadLeft(width) + "]";
    }
}`,
  },
  'unused-type-parameter': {
    bad: `public class Repo
{
    public int Count<T>(int[] items) // Noncompliant
    {
        return items.Length;
    }
}`,
    good: `using System.Collections.Generic;
public class Repo
{
    public int Count<T>(List<T> items)
    {
        return items.Count;
    }
}`,
  },
  'field-could-be-readonly': {
    bad: `public class Person
{
    private string _name; // Noncompliant
    public Person(string name) { _name = name; }
    public string Name => _name;
}`,
    good: `public class Person
{
    private string _name;
    public Person(string name) { _name = name; }
    public string Name => _name;
    public void Rename(string name) { _name = name; }
}`,
  },

  // ───────────────────────────── empty / redundant
  'empty-catch-generic': {
    bad: `using System;
using System.IO;
public class Loader
{
    public string Load(string path)
    {
        try
        {
            return File.ReadAllText(path);
        }
        catch (Exception) // Noncompliant
        {
        }
        return null;
    }
}`,
    good: `using System;
using System.IO;
public class Loader
{
    public string Load(string path)
    {
        try
        {
            return File.ReadAllText(path);
        }
        catch (Exception)
        {
            // the file is optional: a missing or locked file means no settings
        }
        return null;
    }
}`,
  },
  'empty-block': {
    bad: `public class Worker
{
    public int Run(int n)
    {
        if (n > 10) { } // Noncompliant
        for (int i = 0; i < n; i++) { } // Noncompliant
        return n;
    }
}`,
    good: `public class Worker
{
    public int Run(int n)
    {
        if (n > 10)
        {
            // values above ten are accepted as they are
        }
        while (Step()) { }
        return n;
    }
    private bool Step() { return false; }
}`,
  },
  'empty-method': {
    bad: `public class Service
{
    public void Start() { Prepare(); }
    private void Prepare() // Noncompliant
    {
    }
}`,
    good: `public class Service
{
    public void Start() { Prepare(); }
    private void Prepare()
    {
        // nothing to prepare in this implementation
    }
    public virtual void OnStopped() { }
}`,
  },
  'not-implemented': {
    bad: `public class Exporter
{
    public void Export(string path)
    {
        throw new System.NotImplementedException(); // Noncompliant
    }
}`,
    good: `public class Exporter
{
    public void Export(string path)
    {
        throw new System.NotSupportedException("Export is not available.");
    }
}`,
  },
  'todo-comment': {
    bad: `public class Cache
{
    // TODO: evict old entries // Noncompliant
    public int Size { get; set; }
}`,
    good: `public class Cache
{
    // Entries are evicted by the background sweeper.
    public int Size { get; set; }
}`,
  },
  'fixme-comment': {
    bad: `public class Cache
{
    // FIXME: size can become negative // Noncompliant
    public int Size { get; set; }
}`,
    good: `public class Cache
{
    // Size never goes below zero.
    public int Size { get; set; }
}`,
  },
  'commented-out-code': {
    bad: `public class Totals
{
    public int Sum(int[] xs)
    {
        int total = 0;
        /* total = total * 2; */ // Noncompliant
        foreach (var x in xs) total += x;
        return total;
    }
}`,
    good: `public class Totals
{
    public int Sum(int[] xs)
    {
        int total = 0;
        // Add every value; negative values are allowed.
        foreach (var x in xs) total += x;
        return total;
    }
}`,
  },
  'console-logging': {
    bad: `using System;
using Microsoft.AspNetCore.Mvc;
public class OrdersController : Controller
{
    public IActionResult Index()
    {
        Console.WriteLine("listing orders"); // Noncompliant
        return View();
    }
}`,
    good: `using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
public class OrdersController : Controller
{
    private readonly ILogger<OrdersController> _logger;
    public OrdersController(ILogger<OrdersController> logger) { _logger = logger; }
    public IActionResult Index()
    {
        _logger.LogInformation("listing orders");
        return View();
    }
}`,
  },
  'debugger-break': {
    bad: `using System.Diagnostics;
public class Parser
{
    public int Parse(string s)
    {
        Debugger.Break(); // Noncompliant
        return int.Parse(s);
    }
}`,
    good: `using System.Diagnostics;
public class Parser
{
    public int Parse(string s)
    {
        if (Debugger.IsAttached) Debugger.Break();
        return int.Parse(s);
    }
}`,
  },
  'gc-collect': {
    bad: `public class Importer
{
    public void Import(byte[] data)
    {
        Process(data);
        System.GC.Collect(); // Noncompliant
    }
    private void Process(byte[] data) { System.Console.WriteLine(data.Length); }
}`,
    good: `public class Importer
{
    public void Import(byte[] data)
    {
        Process(data);
    }
    private void Process(byte[] data) { System.Console.WriteLine(data.Length); }
}`,
  },
  'goto-statement': {
    bad: `public class Search
{
    public int Find(int[] xs, int v)
    {
        int i = 0;
        loop:
        if (i < xs.Length && xs[i] != v) { i++; goto loop; } // Noncompliant
        return i;
    }
}`,
    good: `public class Search
{
    public int Find(int[] xs, int v)
    {
        int i = 0;
        while (i < xs.Length && xs[i] != v) i++;
        return i;
    }
}`,
  },
  'redundant-boolean-literal': {
    bad: `public class Flags
{
    public bool Check(bool enabled, bool visible)
    {
        if (enabled == true) return true; // Noncompliant
        return visible ? true : false; // Noncompliant
    }
}`,
    good: `public class Flags
{
    public bool Check(bool enabled, bool visible, bool? maybe)
    {
        if (enabled) return true;
        if (maybe == true) return true;
        return visible;
    }
}`,
  },
  'nested-ternary': {
    bad: `public class Sign
{
    public string Of(int x)
    {
        return x > 0 ? "plus" : x < 0 ? "minus" : "zero"; // Noncompliant
    }
}`,
    good: `public class Sign
{
    public string Of(int x)
    {
        if (x > 0) return "plus";
        return x < 0 ? "minus" : "zero";
    }
}`,
  },
  'return-boolean-literal': {
    bad: `public class Age
{
    public bool IsAdult(int age)
    {
        if (age >= 18) // Noncompliant
        {
            return true;
        }
        else
        {
            return false;
        }
    }
}`,
    good: `public class Age
{
    public bool IsAdult(int age)
    {
        return age >= 18;
    }
}`,
  },
  'collapsible-if': {
    bad: `public class Door
{
    public void Open(bool unlocked, bool closed)
    {
        if (unlocked)
        {
            if (closed) // Noncompliant
            {
                System.Console.WriteLine("opening");
            }
        }
    }
}`,
    good: `public class Door
{
    public void Open(bool unlocked, bool closed)
    {
        if (unlocked && closed)
        {
            System.Console.WriteLine("opening");
        }
    }
}`,
  },
  'switch-too-few-cases': {
    bad: `public class Toggle
{
    public string Label(int state)
    {
        switch (state) // Noncompliant
        {
            case 0: return "off";
            default: return "on";
        }
    }
}`,
    good: `public class Toggle
{
    public string Label(int state)
    {
        switch (state)
        {
            case 0: return "off";
            case 1: return "on";
            default: return "unknown";
        }
    }
}`,
  },
  'default-clause-position': {
    bad: `public class Level
{
    public string Name(int level)
    {
        switch (level)
        {
            case 0: return "low";
            default: return "unknown"; // Noncompliant
            case 1: return "high";
        }
    }
}`,
    good: `public class Level
{
    public string Name(int level)
    {
        switch (level)
        {
            case 0: return "low";
            case 1: return "high";
            default: return "unknown";
        }
    }
}`,
  },
  'switch-without-default': {
    bad: `public class Codes
{
    public string Describe(int code)
    {
        string s = "";
        switch (code) // Noncompliant
        {
            case 200: s = "ok"; break;
            case 404: s = "missing"; break;
            case 500: s = "error"; break;
        }
        return s;
    }
}`,
    good: `public enum Light { Red, Green }
public class Codes
{
    public string Describe(int code)
    {
        switch (code)
        {
            case 200: return "ok";
            case 404: return "missing";
            default: return "other";
        }
    }
    public string Color(Light l)
    {
        switch (l)
        {
            case Light.Red: return "stop";
            case Light.Green: return "go";
        }
        return "";
    }
}`,
  },
  'if-else-if-without-else': {
    bad: `public class Temperature
{
    public string Describe(int t)
    {
        string s = "mild";
        if (t > 30)
        {
            s = "hot";
        }
        else if (t < 5) // Noncompliant
        {
            s = "cold";
        }
        return s;
    }
}`,
    good: `public class Temperature
{
    public string Describe(int t)
    {
        string s;
        if (t > 30)
        {
            s = "hot";
        }
        else if (t < 5)
        {
            s = "cold";
        }
        else
        {
            s = "mild";
        }
        return s;
    }
}`,
  },
  'redundant-parentheses': {
    bad: `public class MathOps
{
    public int Add(int a, int b)
    {
        return ((a + b)); // Noncompliant
    }
}`,
    good: `public class MathOps
{
    public int Add(int a, int b)
    {
        return (a + b) * 2;
    }
}`,
  },
  'redundant-jump': {
    bad: `public class Printer
{
    public void Print(string[] lines)
    {
        foreach (var l in lines)
        {
            System.Console.WriteLine(l);
            continue; // Noncompliant
        }
        System.Console.WriteLine("done");
        return; // Noncompliant
    }
}`,
    good: `public class Printer
{
    public void Print(string[] lines)
    {
        foreach (var l in lines)
        {
            if (l == null) continue;
            System.Console.WriteLine(l);
        }
        System.Console.WriteLine("done");
    }
}`,
  },
  'redundant-cast': {
    bad: `public class Casts
{
    public int Run(int count)
    {
        int copy = (int)count; // Noncompliant
        string s = (string)"text"; // Noncompliant
        return copy + s.Length;
    }
}`,
    good: `public class Casts
{
    public long Run(int count, object boxed)
    {
        long wide = (long)count;
        string s = (string)boxed;
        return wide + s.Length;
    }
}`,
  },
  'redundant-tostring': {
    bad: `public class Names
{
    public string Upper(string name)
    {
        return name.ToString().ToUpper(); // Noncompliant
    }
}`,
    good: `public class Names
{
    public string Upper(int id)
    {
        return id.ToString().ToUpper();
    }
}`,
  },
  'redundant-modifier': {
    bad: `public partial class Settings // Noncompliant
{
    public int Size { get; set; }
}
public class Shape { public virtual double Area() { return 0; } }
public sealed class Circle : Shape
{
    public sealed override double Area() { return 3.14; } // Noncompliant
}`,
    good: `public partial class Settings
{
    public int Size { get; set; }
}
public partial class Settings
{
    public int Width { get; set; }
}
public class Shape { public virtual double Area() { return 0; } }
public sealed class Circle : Shape
{
    public override double Area() { return 3.14; }
}`,
  },
  'field-default-init': {
    bad: `public class Options
{
    private int _retries = 0; // Noncompliant
    private bool _verbose = false; // Noncompliant
    private string _name = null; // Noncompliant
    public string Describe() { return _name + _retries + _verbose; }
}`,
    good: `public class Options
{
    private int _retries = 3;
    private bool _verbose = true;
    private string _name = "default";
    public string Describe() { return _name + _retries + _verbose; }
}`,
  },
  'redundant-anonymous-property-name': {
    bad: `public class Projection
{
    public object Make(Person p)
    {
        return new { Name = p.Name, Age = p.Age }; // Noncompliant
    }
}
public class Person { public string Name { get; set; } public int Age { get; set; } }`,
    good: `public class Projection
{
    public object Make(Person p)
    {
        return new { p.Name, Years = p.Age };
    }
}
public class Person { public string Name { get; set; } public int Age { get; set; } }`,
  },
  'redundant-inheritance': {
    bad: `public class Entity : object // Noncompliant
{
    public int Id { get; set; }
}
public enum Color : int { Red, Green } // Noncompliant`,
    good: `public class Entity
{
    public int Id { get; set; }
}
public enum Color : byte { Red, Green }`,
  },
  'redundant-constructor': {
    bad: `public class Holder
{
    public Holder() // Noncompliant
    {
    }
    public int Value { get; set; }
    static Holder() { } // Noncompliant
}`,
    good: `public class Holder
{
    public Holder()
    {
        Value = 1;
    }
    public Holder(int v) { Value = v; }
    public int Value { get; set; }
}`,
  },
  'empty-finalizer': {
    bad: `public class Resource
{
    ~Resource() // Noncompliant
    {
    }
}`,
    good: `public class Resource
{
    private System.IntPtr _handle;
    ~Resource()
    {
        Release(_handle);
    }
    private static void Release(System.IntPtr h) { System.Console.WriteLine(h); }
}`,
  },
  'override-calls-only-base': {
    bad: `public class Base { public virtual int Compute(int x) { return x; } }
public class Derived : Base
{
    public override int Compute(int x) // Noncompliant
    {
        return base.Compute(x);
    }
}`,
    good: `public class Base { public virtual int Compute(int x) { return x; } }
public class Derived : Base
{
    public override int Compute(int x)
    {
        return base.Compute(x) + 1;
    }
}`,
  },
  'redundant-null-check-is': {
    bad: `public class Shape { }
public class Checker
{
    public bool IsShape(object o)
    {
        return o != null && o is Shape; // Noncompliant
    }
}`,
    good: `public class Shape { }
public class Checker
{
    public bool IsShape(object o)
    {
        return o is Shape;
    }
}`,
  },
  'duplicate-cast-after-is': {
    bad: `public class Shape { public double Area() { return 1; } }
public class Checker
{
    public double AreaOf(object o)
    {
        if (o is Shape)
        {
            return ((Shape)o).Area(); // Noncompliant
        }
        return 0;
    }
}`,
    good: `public class Shape { public double Area() { return 1; } }
public class Checker
{
    public double AreaOf(object o)
    {
        if (o is Shape s)
        {
            return s.Area();
        }
        return 0;
    }
}`,
  },
  'simplify-type-check': {
    bad: `public class Shape { }
public class Checker
{
    public bool A(object o) { return typeof(Shape).IsInstanceOfType(o); } // Noncompliant
    public bool B(object o) { return typeof(Shape).IsAssignableFrom(o.GetType()); } // Noncompliant
}`,
    good: `public class Shape { }
public class Checker
{
    public bool A(object o) { return o is Shape; }
    public bool B(System.Type t) { return typeof(Shape).IsAssignableFrom(t); }
}`,
  },
  'inverted-boolean-check': {
    bad: `public class Compare
{
    public bool Differ(int a, int b)
    {
        return !(a == b); // Noncompliant
    }
}`,
    good: `public class Compare
{
    public bool Differ(int a, int b)
    {
        return a != b;
    }
}`,
  },
  'double-negation': {
    bad: `public class Flags
{
    public bool Same(bool f)
    {
        return !!f; // Noncompliant
    }
}`,
    good: `public class Flags
{
    public bool Same(bool f)
    {
        return f;
    }
}`,
  },
  'string-isnullorempty': {
    bad: `public class Input
{
    public bool Blank(string s)
    {
        return s == ""; // Noncompliant
    }
}`,
    good: `public class Input
{
    public bool Blank(string s)
    {
        return string.IsNullOrEmpty(s);
    }
}`,
  },
  'count-instead-of-any': {
    bad: `using System.Collections.Generic;
using System.Linq;
public class Basket
{
    public bool HasItems(IEnumerable<string> items)
    {
        return items.Count() > 0; // Noncompliant
    }
}`,
    good: `using System.Collections.Generic;
using System.Linq;
public class Basket
{
    public bool HasItems(IEnumerable<string> items)
    {
        return items.Any();
    }
}`,
  },
  'linq-simplification': {
    bad: `using System.Collections.Generic;
using System.Linq;
public class Query
{
    public bool AnyPositive(IEnumerable<int> xs)
    {
        return xs.Where(x => x > 0).Any(); // Noncompliant
    }
    public IEnumerable<int> Same(IEnumerable<int> xs)
    {
        return xs.Select(x => x); // Noncompliant
    }
}`,
    good: `using System.Collections.Generic;
using System.Linq;
public class Query
{
    public bool AnyPositive(IEnumerable<int> xs)
    {
        return xs.Any(x => x > 0);
    }
    public IEnumerable<int> Doubled(IEnumerable<int> xs)
    {
        return xs.Select(x => x * 2);
    }
}`,
  },
  'string-concat-in-loop': {
    bad: `public class Joiner
{
    public string Join(string[] parts)
    {
        string result = "";
        foreach (var p in parts)
        {
            result += p; // Noncompliant
        }
        return result;
    }
}`,
    good: `using System.Text;
public class Joiner
{
    public string Join(string[] parts)
    {
        var sb = new StringBuilder();
        foreach (var p in parts)
        {
            sb.Append(p);
        }
        return sb.ToString();
    }
}`,
  },
  'char-overload': {
    bad: `public class Paths
{
    public bool IsAbsolute(string path)
    {
        return path.StartsWith("/"); // Noncompliant
    }
}`,
    good: `public class Paths
{
    public bool IsAbsolute(string path)
    {
        return path.StartsWith('/') || path.StartsWith("//");
    }
}`,
  },
  'list-find': {
    bad: `using System.Collections.Generic;
using System.Linq;
public class Users
{
    public string First(List<string> names)
    {
        return names.FirstOrDefault(n => n.Length > 3); // Noncompliant
    }
}`,
    good: `using System.Collections.Generic;
public class Users
{
    public string First(List<string> names)
    {
        return names.Find(n => n.Length > 3);
    }
}`,
  },
  'list-trueforall': {
    bad: `using System.Collections.Generic;
using System.Linq;
public class Users
{
    public bool AllLong(List<string> names)
    {
        return names.All(n => n.Length > 3); // Noncompliant
    }
}`,
    good: `using System.Collections.Generic;
public class Users
{
    public bool AllLong(List<string> names)
    {
        return names.TrueForAll(n => n.Length > 3);
    }
}`,
  },
  'list-exists': {
    bad: `using System.Collections.Generic;
using System.Linq;
public class Users
{
    public bool AnyLong(List<string> names)
    {
        return names.Any(n => n.Length > 3); // Noncompliant
    }
}`,
    good: `using System.Collections.Generic;
public class Users
{
    public bool AnyLong(List<string> names)
    {
        return names.Exists(n => n.Length > 3);
    }
}`,
  },
  'indexer-instead-of-first': {
    bad: `using System.Collections.Generic;
using System.Linq;
public class Users
{
    public string Head(List<string> names)
    {
        return names.First(); // Noncompliant
    }
}`,
    good: `using System.Collections.Generic;
public class Users
{
    public string Head(List<string> names)
    {
        return names[0];
    }
}`,
  },
  'filter-before-sort': {
    bad: `using System.Collections.Generic;
using System.Linq;
public class Sorter
{
    public IEnumerable<int> Positives(IEnumerable<int> xs)
    {
        return xs.OrderBy(x => x).Where(x => x > 0); // Noncompliant
    }
}`,
    good: `using System.Collections.Generic;
using System.Linq;
public class Sorter
{
    public IEnumerable<int> Positives(IEnumerable<int> xs)
    {
        return xs.Where(x => x > 0).OrderBy(x => x);
    }
}`,
  },
  'datetime-unix-epoch': {
    bad: `using System;
public class Clock
{
    public DateTime Epoch()
    {
        return new DateTime(1970, 1, 1, 0, 0, 0); // Noncompliant
    }
}`,
    good: `using System;
public class Clock
{
    public DateTime Epoch()
    {
        return DateTime.UnixEpoch;
    }
    public DateTime Y2K()
    {
        return new DateTime(2000, 1, 1);
    }
}`,
  },
  'datetime-benchmark': {
    bad: `using System;
public class Timing
{
    public double Measure(Action work)
    {
        var start = DateTime.Now;
        work();
        return (DateTime.Now - start).TotalMilliseconds; // Noncompliant
    }
}`,
    good: `using System;
using System.Diagnostics;
public class Timing
{
    public double Measure(Action work)
    {
        var watch = Stopwatch.StartNew();
        work();
        return watch.Elapsed.TotalMilliseconds;
    }
}`,
  },
  'datetime-parse-culture': {
    bad: `using System;
public class Dates
{
    public DateTime Read(string s)
    {
        return DateTime.Parse(s); // Noncompliant
    }
}`,
    good: `using System;
using System.Globalization;
public class Dates
{
    public DateTime Read(string s)
    {
        return DateTime.Parse(s, CultureInfo.InvariantCulture);
    }
}`,
  },

  // ───────────────────────────── exceptions
  'throw-generic-exception': {
    bad: `using System;
public class Account
{
    public void Withdraw(decimal amount)
    {
        if (amount < 0) throw new Exception("negative amount"); // Noncompliant
    }
}`,
    good: `using System;
public class Account
{
    public void Withdraw(decimal amount)
    {
        if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
    }
}`,
  },
  'catch-null-reference': {
    bad: `using System;
public class Reader
{
    public int Length(string s)
    {
        try
        {
            return s.Length;
        }
        catch (NullReferenceException) // Noncompliant
        {
            return 0;
        }
    }
}`,
    good: `public class Reader
{
    public int Length(string s)
    {
        if (s == null) return 0;
        return s.Length;
    }
}`,
  },
  'rethrow-caught-exception': {
    bad: `using System;
using System.IO;
public class Store
{
    public string Read(string path)
    {
        try
        {
            return File.ReadAllText(path);
        }
        catch (IOException ex)
        {
            Console.Error.WriteLine(ex.Message);
            throw ex; // Noncompliant
        }
    }
}`,
    good: `using System;
using System.IO;
public class Store
{
    public string Read(string path)
    {
        try
        {
            return File.ReadAllText(path);
        }
        catch (IOException ex)
        {
            Console.Error.WriteLine(ex.Message);
            throw;
        }
    }
}`,
  },
  'useless-catch-rethrow': {
    bad: `using System.IO;
public class Store
{
    public string Read(string path)
    {
        try
        {
            return File.ReadAllText(path);
        }
        catch // Noncompliant
        {
            throw;
        }
    }
}`,
    good: `using System;
using System.IO;
public class Store
{
    public string Read(string path)
    {
        try
        {
            return File.ReadAllText(path);
        }
        catch (IOException ex)
        {
            Console.Error.WriteLine(ex.Message);
            throw;
        }
    }
}`,
  },
  'throw-in-finally': {
    bad: `using System;
public class Batch
{
    private bool _done;
    public void Run(Action step)
    {
        try
        {
            step();
        }
        finally
        {
            if (!_done) throw new InvalidOperationException("not finished"); // Noncompliant
        }
    }
}`,
    good: `using System;
public class Batch
{
    private bool _done;
    public void Run(Action step)
    {
        try
        {
            step();
        }
        finally
        {
            if (!_done) Console.Error.WriteLine("not finished");
        }
    }
}`,
  },
  'exception-unexpected-location': {
    bad: `using System;
public class Money
{
    public decimal Amount { get; set; }
    public override int GetHashCode()
    {
        throw new InvalidOperationException("mutable"); // Noncompliant
    }
    public override string ToString()
    {
        if (Amount < 0) throw new ArgumentException("negative"); // Noncompliant
        return Amount.ToString();
    }
}`,
    good: `using System;
public class Money
{
    public decimal Amount { get; set; }
    public override int GetHashCode()
    {
        return Amount.GetHashCode();
    }
    public override string ToString()
    {
        return Amount < 0 ? "-" + (-Amount) : Amount.ToString();
    }
    public void Validate()
    {
        if (Amount < 0) throw new ArgumentException("negative");
    }
}`,
  },
  'exception-standard-constructors': {
    bad: `using System;
public class OrderException : Exception // Noncompliant
{
    public OrderException(string message) : base(message) { }
}`,
    good: `using System;
public class OrderException : Exception
{
    public OrderException() { }
    public OrderException(string message) : base(message) { }
    public OrderException(string message, Exception inner) : base(message, inner) { }
}`,
  },
  'exception-not-public': {
    bad: `using System;
internal class ParseException : Exception // Noncompliant
{
    public ParseException(string message) : base(message) { }
}`,
    good: `using System;
public class ParseException : Exception
{
    public ParseException(string message) : base(message) { }
}`,
  },
  'exception-naming': {
    bad: `public class ValidationException // Noncompliant
{
    public string Field { get; set; }
}`,
    good: `public class ValidationError
{
    public string Field { get; set; }
}`,
  },
  'argument-exception-param-name': {
    bad: `using System;
public class Greeter
{
    public string Greet(string name)
    {
        if (name == null) throw new ArgumentNullException("nmae"); // Noncompliant
        return "Hello " + name;
    }
}`,
    good: `using System;
public class Greeter
{
    public string Greet(string name)
    {
        if (name == null) throw new ArgumentNullException(nameof(name));
        return "Hello " + name;
    }
}`,
  },
  'use-nameof': {
    bad: `using System;
public class Greeter
{
    public string Greet(string name)
    {
        if (name == null) throw new ArgumentNullException("name"); // Noncompliant
        return "Hello " + name;
    }
}`,
    good: `using System;
public class Greeter
{
    public string Greet(string name)
    {
        if (name == null) throw new ArgumentNullException(nameof(name));
        return "Hello " + name;
    }
}`,
  },
};
