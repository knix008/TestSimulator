// sem-cs samples: design rules. See sem-cs-cases.mjs for the format.
export default {
  'public-field': {
    bad: `public class Account
{
    public decimal Balance; // Noncompliant
    public int A, B; // Noncompliant
    private int count;
    public int Count => count;
}`,
    good: `public class Account
{
    public const int Max = 10;
    public static readonly Account Empty = new Account();
    public readonly int Id;
    private decimal balance;
    public decimal Balance { get => balance; set => balance = value; }
}
public struct Point { public int X; public int Y; }`,
  },
  'static-mutable-field': {
    bad: `public class Config
{
    public static int Retries = 3; // Noncompliant
    protected static string Name; // Noncompliant
    private static int hidden;
    public static int Hidden => hidden;
}`,
    good: `public class Config
{
    public const int Retries = 3;
    public static readonly string Name = "x";
    private static int counter;
    internal static int Shared;
    public static int Counter => counter;
}`,
  },
  'public-constant': {
    bad: `public class Limits
{
    public const int MaxItems = 100; // Noncompliant
    private const int Min = 1;
    public int Min2 => Min;
}`,
    good: `public class Limits
{
    public static readonly int MaxItems = 100;
    internal const int Hidden = 2;
    private const int Min = 1;
    public int Min2 => Min + Hidden;
}`,
  },
  'static-field-generic-type': {
    bad: `public class Cache<T>
{
    private static int hits; // Noncompliant
    private static T last;
    public int Hits => hits;
    public T Last => last;
}`,
    good: `public class Cache<T>
{
    private static T last;
    private static readonly System.Collections.Generic.List<T> items = new System.Collections.Generic.List<T>();
    private const int Size = 4;
    public T Last => last;
    public int Count => items.Count + Size;
}
public class Counter { private static int hits; public int Hits => hits; }`,
  },
  'field-shadows-base-field': {
    bad: `public class Animal
{
    protected string name;
    private int age;
    public int Age => age;
}
public class Dog : Animal
{
    private string name; // Noncompliant
    private int age;
    public string Show() => name + age;
}`,
    good: `public class Animal
{
    protected string name;
    private int age;
    public int Age => age;
}
public class Dog : Animal
{
    private string breed;
    private int age;
    public string Show() => name + breed + age;
}`,
  },
  'inner-shadows-outer-static': {
    bad: `public class Outer
{
    private static int count;
    public static void Reset() { count = 0; }
    public class Inner
    {
        private int count; // Noncompliant
        public void Reset() { count = 1; } // Noncompliant
        public int Get() => count;
    }
}`,
    good: `public class Outer
{
    private static int count;
    private int size;
    public static void Reset() { count = 0; }
    public int Size => size;
    public class Inner
    {
        private int size;
        public void Clear() { size = count; }
        public int Get() => size;
    }
}`,
  },
  'static-field-set-in-ctor': {
    bad: `public class Person
{
    private static int instances;
    private static string lastName;
    private string name;
    public Person(string n)
    {
        name = n;
        instances++; // Noncompliant
        Person.lastName = n; // Noncompliant
    }
    public string Show() => name + instances + lastName;
}`,
    good: `public class Person
{
    private static int instances;
    private string name;
    static Person() { instances = 0; }
    public Person(string n)
    {
        name = n;
        var local = 1;
        local++;
    }
    public static void Count() { instances++; }
    public string Show() => name + instances;
}`,
  },
  'abstract-class-public-ctor': {
    bad: `public abstract class Shape
{
    public Shape() { } // Noncompliant
    public abstract double Area();
    public override string ToString() => "shape";
}`,
    good: `public abstract class Shape
{
    protected Shape() { }
    public abstract double Area();
    public override string ToString() => "shape";
}
public class Square : Shape
{
    public Square() { }
    public override double Area() => 1;
}`,
  },
  'utility-class-ctor': {
    bad: `public class StringUtils // Noncompliant
{
    public static string Trim(string s) => s.Trim();
    public const int Max = 3;
}
public class MathUtils
{
    public MathUtils() { } // Noncompliant
    public static int Twice(int x) => x * 2;
}`,
    good: `public static class StringUtils
{
    public static string Trim(string s) => s.Trim();
}
public class MathUtils
{
    private MathUtils() { }
    public static int Twice(int x) => x * 2;
}
public class Program
{
    public static void Main() { }
}
public class Model
{
    public static int Count;
    public int Id { get; set; }
}`,
  },
  'only-private-ctors': {
    bad: `public class Locked // Noncompliant
{
    private Locked() { }
    public int Value { get; set; }
}`,
    good: `public class Singleton
{
    private Singleton() { }
    public static Singleton Instance { get; } = new Singleton();
}
public class Built
{
    private Built() { }
    public class Builder { public Built Make() => new Built(); }
}
public static class Tools { public static int One() => 1; }`,
  },
  'abstract-class-shape': {
    bad: `public abstract class Animal // Noncompliant
{
    public abstract string Sound();
    public abstract int Legs { get; }
}
public abstract class Helper // Noncompliant
{
    public int Twice(int x) => x * 2;
}`,
    good: `public interface IAnimal { string Sound(); }
public abstract class Animal
{
    public abstract string Sound();
    public string Describe() => Sound() + "!";
}
public abstract class Base
{
    protected Base() { }
    public int Twice(int x) => x * 2;
}
public abstract class Derived : Base
{
    public int Three(int x) => x * 3;
}`,
  },
  'private-class-not-sealed': {
    bad: `public class Outer
{
    private class Node // Noncompliant
    {
        public int Value;
    }
    private Node head = new Node();
    public int Head => head.Value;
}`,
    good: `public class Outer
{
    private sealed class Node { public int Value; }
    private class Base { public virtual int Get() => 1; }
    private sealed class Derived : Base { public override int Get() => 2; }
    private abstract class Shape { }
    public class Visible { }
    private Node head = new Node();
    public int Head => head.Value + new Derived().Get();
}`,
  },
  'empty-class': {
    bad: `namespace App
{
    public class Nothing // Noncompliant
    {
    }
}`,
    good: `namespace App
{
    public class MyException : System.Exception { }
    [System.Serializable]
    public class Marker { }
    public partial class Generated { }
    public class Data { public int Id { get; set; } }
}`,
  },
  'empty-interface': {
    bad: `public interface IMarker // Noncompliant
{
}`,
    good: `public interface IShape { double Area(); }
public interface IDerived : IShape { }
public interface IGeneric<T> : System.Collections.Generic.IEnumerable<T> { }`,
  },
  'too-many-methods': {
    options: { maxMethods: 3 },
    bad: `public class Big // Noncompliant
{
    public void A() { }
    public void B() { }
    public void C() { }
    public void D() { }
}`,
    good: `public class Small
{
    public void A() { }
    public void B() { }
    public void C() { }
    public int P { get; set; }
}`,
  },
  'class-coupling': {
    options: { maxClassCoupling: 3 },
    bad: `public class Hub // Noncompliant
{
    private Alpha a;
    private Beta b;
    private Gamma c;
    public Delta Make(Epsilon e) => new Delta();
}`,
    good: `public class Hub
{
    private Alpha a;
    private Beta b;
    private int count;
    private string name;
    public System.DateTime When;
    public Gamma Make(int x) => null;
}`,
  },
  'disposable-pattern': {
    bad: `using System;
public class Resource : IDisposable // Noncompliant
{
    public void Dispose() { }
}`,
    good: `using System;
public sealed class Sealed : IDisposable
{
    public void Dispose() { }
}
public class Resource : IDisposable
{
    public void Dispose() { Dispose(true); GC.SuppressFinalize(this); }
    protected virtual void Dispose(bool disposing) { }
}
public class Child : Resource
{
    protected override void Dispose(bool disposing) { base.Dispose(disposing); }
}`,
  },
  'dispose-not-idisposable': {
    bad: `public class Holder
{
    public void Dispose() { } // Noncompliant
}`,
    good: `using System;
public class Holder : IDisposable
{
    public void Dispose() { }
}
public class Other
{
    public void Dispose(bool all) { }
    private void Release() { }
}
public ref struct Span2 { public void Dispose() { } }
public class Form1 : Form { public void Dispose() { } }`,
  },
  'disposable-field-not-disposed-type': {
    bad: `using System.IO;
public class Logger
{
    private FileStream stream = new FileStream("a.log", FileMode.Append); // Noncompliant
    private StreamWriter writer; // Noncompliant
    private string path;
    public Logger(string p)
    {
        path = p;
        writer = new StreamWriter(p);
    }
    public void Log(string s) { writer.WriteLine(s); stream.Flush(); }
}`,
    good: `using System;
using System.IO;
public sealed class Logger : IDisposable
{
    private readonly FileStream stream = new FileStream("a.log", FileMode.Append);
    public void Dispose() { stream.Dispose(); }
}
public class Holder
{
    private StreamWriter writer;
    private static FileStream shared = new FileStream("b", FileMode.Open);
    public Holder(StreamWriter w) { writer = w; }
    public void Log(string s) { writer.WriteLine(s); shared.Flush(); }
}`,
  },
  'disposable-needs-finalizer': {
    bad: `using System;
public class NativeBuffer : IDisposable // Noncompliant
{
    private IntPtr handle;
    public void Dispose() { Free(handle); }
    private static void Free(IntPtr p) { }
}`,
    good: `using System;
public class NativeBuffer : IDisposable
{
    private IntPtr handle;
    ~NativeBuffer() { Free(handle); }
    public void Dispose() { Free(handle); GC.SuppressFinalize(this); }
    private static void Free(IntPtr p) { }
}
public class Plain : IDisposable
{
    private int size;
    public void Dispose() { size = 0; }
}`,
  },
  'suppress-finalize-misuse': {
    bad: `using System;
public class Res : IDisposable
{
    private Res other;
    public void Close()
    {
        GC.SuppressFinalize(this); // Noncompliant
    }
    public void Dispose()
    {
        GC.SuppressFinalize(other); // Noncompliant
    }
}`,
    good: `using System;
public class Res : IDisposable
{
    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }
    protected virtual void Dispose(bool disposing) { }
}`,
  },
  'iequatable-unsealed': {
    bad: `using System;
public class Money : IEquatable<Money> // Noncompliant
{
    public decimal Amount { get; set; }
    public bool Equals(Money other) => other != null && other.Amount == Amount;
}`,
    good: `using System;
public sealed class Money : IEquatable<Money>
{
    public decimal Amount { get; set; }
    public bool Equals(Money other) => other != null && other.Amount == Amount;
}
public struct Point : IEquatable<Point>
{
    public int X;
    public bool Equals(Point other) => X == other.X;
}`,
  },
  'iequatable-missing': {
    bad: `public sealed class Money
{
    public decimal Amount { get; set; }
    public bool Equals(Money other) => other != null && other.Amount == Amount; // Noncompliant
}`,
    good: `using System;
public sealed class Money : IEquatable<Money>
{
    public decimal Amount { get; set; }
    public bool Equals(Money other) => other != null && other.Amount == Amount;
}
public sealed class Other
{
    public override bool Equals(object o) => o is Other;
    public override int GetHashCode() => 1;
    public bool Equals(string s) => s == "x";
}`,
  },
  'icomparable-without-operators': {
    bad: `using System;
public class Version : IComparable<Version> // Noncompliant
{
    public int Major { get; set; }
    public int CompareTo(Version other) => Major.CompareTo(other.Major);
}`,
    good: `using System;
public class Version : IComparable<Version>
{
    public int Major { get; set; }
    public int CompareTo(Version other) => Major.CompareTo(other.Major);
    public override bool Equals(object o) => o is Version v && v.Major == Major;
    public override int GetHashCode() => Major;
    public static bool operator ==(Version a, Version b) => Equals(a, b);
    public static bool operator !=(Version a, Version b) => !Equals(a, b);
    public static bool operator <(Version a, Version b) => a.CompareTo(b) < 0;
    public static bool operator >(Version a, Version b) => a.CompareTo(b) > 0;
}
internal class Hidden : IComparable<Hidden>
{
    public int CompareTo(Hidden other) => 0;
}`,
  },
  'operators-inconsistent': {
    bad: `public struct Meters
{
    public double Value;
    public static bool operator ==(Meters a, Meters b) => a.Value == b.Value; // Noncompliant
    public static bool operator !=(Meters a, Meters b) => a.Value != b.Value;
}
public struct Money
{
    public decimal Value;
    public static Money operator +(Money a, Money b) => new Money { Value = a.Value + b.Value }; // Noncompliant
}`,
    good: `public struct Meters
{
    public double Value;
    public static bool operator ==(Meters a, Meters b) => a.Value == b.Value;
    public static bool operator !=(Meters a, Meters b) => a.Value != b.Value;
    public override bool Equals(object o) => o is Meters m && m.Value == Value;
    public override int GetHashCode() => Value.GetHashCode();
}
public struct Money
{
    public decimal Value;
    public static Money operator -(Money a) => new Money { Value = -a.Value };
}`,
  },
  'reference-type-equality-operator': {
    bad: `public class Customer
{
    public int Id { get; set; }
    public static bool operator ==(Customer a, Customer b) => a.Id == b.Id; // Noncompliant
    public static bool operator !=(Customer a, Customer b) => a.Id != b.Id;
    public override bool Equals(object o) => o is Customer c && c.Id == Id;
    public override int GetHashCode() => Id;
}`,
    good: `public class Money
{
    public decimal Value { get; set; }
    public static Money operator +(Money a, Money b) => new Money { Value = a.Value + b.Value };
    public static bool operator ==(Money a, Money b) => a.Value == b.Value;
    public static bool operator !=(Money a, Money b) => a.Value != b.Value;
    public override bool Equals(object o) => o is Money m && m.Value == Value;
    public override int GetHashCode() => Value.GetHashCode();
}
public struct Id
{
    public int V;
    public static bool operator ==(Id a, Id b) => a.V == b.V;
    public static bool operator !=(Id a, Id b) => a.V != b.V;
    public override bool Equals(object o) => o is Id i && i.V == V;
    public override int GetHashCode() => V;
}`,
  },
  'serializable-pattern': {
    bad: `using System.Runtime.Serialization;
public class Settings : ISerializable // Noncompliant
{
    public void GetObjectData(SerializationInfo info, StreamingContext context) { }
}`,
    good: `using System;
using System.Runtime.Serialization;
[Serializable]
public class Settings : ISerializable
{
    public Settings() { }
    protected Settings(SerializationInfo info, StreamingContext context) { }
    public void GetObjectData(SerializationInfo info, StreamingContext context) { }
}`,
  },
  'overload-default-params': {
    bad: `public class Printer
{
    public void Print(string text) { }
    public void Print(string text, int copies = 1) { } // Noncompliant
}`,
    good: `public class Printer
{
    public void Print(string text, int copies = 1) { }
    public void Print(int code) { }
    public void Send(string text) { }
    public void Send(string text, int copies) { }
}`,
  },
  'overloads-not-adjacent': {
    bad: `public class Calc
{
    public int Add(int a, int b) => a + b;
    public int Sub(int a, int b) => a - b;
    public double Add(double a, double b) => a + b; // Noncompliant
}`,
    good: `public class Calc
{
    public int Add(int a, int b) => a + b;
    public double Add(double a, double b) => a + b;
    public int Sub(int a, int b) => a - b;
}`,
  },
  'event-never-raised': {
    bad: `using System;
public class Button
{
    public event EventHandler Clicked; // Noncompliant
    public event EventHandler Pressed;
    public void Press() { Pressed?.Invoke(this, EventArgs.Empty); }
    public void Wire(EventHandler h) { Clicked += h; }
}`,
    good: `using System;
public class Button
{
    public event EventHandler Clicked;
    public event EventHandler Pressed;
    public void Press() { Pressed?.Invoke(this, EventArgs.Empty); }
    public void Click() { var h = Clicked; if (h != null) h(this, EventArgs.Empty); }
}
public abstract class Base
{
    public abstract event EventHandler Changed;
}`,
  },
  'pinvoke-visible': {
    bad: `using System.Runtime.InteropServices;
public class Native
{
    [DllImport("user32.dll")]
    public static extern int MessageBeep(uint type); // Noncompliant
}`,
    good: `using System.Runtime.InteropServices;
public class Native
{
    [DllImport("user32.dll")]
    private static extern int MessageBeep(uint type);
    public static int Beep() => MessageBeep(0);
}
internal class Hidden
{
    [DllImport("kernel32.dll")]
    public static extern int GetTickCount();
}`,
  },
  'indexer-param-type': {
    bad: `using System;
public class Schedule
{
    public string this[DateTime day] => day.ToString(); // Noncompliant
}`,
    good: `public enum Color { Red, Green }
public class Table<TKey>
{
    public string this[int i] => i.ToString();
    public string this[string key] => key;
    public string this[Color c] => c.ToString();
    public string this[TKey k] => k.ToString();
    public string this[int r, int c] => "";
}`,
  },
  'property-copies-collection': {
    bad: `using System.Linq;
using System.Collections.Generic;
public class Basket
{
    private readonly List<string> items = new List<string>();
    public string[] Items => items.ToArray(); // Noncompliant
    public List<string> Copy { get { return new List<string>(items); } } // Noncompliant
}`,
    good: `using System.Collections.Generic;
public class Basket
{
    private readonly List<string> items = new List<string>();
    public IReadOnlyList<string> Items => items;
    public string[] ToArray() => items.ToArray();
    public int Count => items.Count;
}`,
  },
  'method-should-be-property': {
    bad: `public class Person
{
    private string name;
    public string GetName() { return name; } // Noncompliant
    public int GetAge() => this.age; // Noncompliant
    private int age;
}`,
    good: `using System.Threading.Tasks;
public class Person
{
    private string name;
    private int[] scores;
    public string Name => name;
    public string GetNameUpper() => name.ToUpper();
    public int[] GetScores() => scores;
    public string GetFor(int id) => name;
    public Task<string> GetAsync() => Task.FromResult(name);
    private string GetSecret() => name;
    public virtual string GetLabel() => name;
}`,
  },
  'collection-property-writable': {
    bad: `using System.Collections.Generic;
public class Order
{
    public List<string> Lines { get; set; } // Noncompliant
    public IDictionary<string, int> Totals { get; set; } // Noncompliant
}`,
    good: `using System.Collections.Generic;
using System.Runtime.Serialization;
public class Order
{
    public List<string> Lines { get; } = new List<string>();
    public IDictionary<string, int> Totals { get; private set; }
    public IEnumerable<string> Tags { get; set; }
    public string[] Codes { get; set; }
    public IReadOnlyList<int> Ids { get; set; }
}
[DataContract]
public class Dto { public List<string> Items { get; set; } }`,
  },
  'localizable-literal': {
    bad: `using System.ComponentModel;
using System.Windows.Forms;
public class Ui
{
    public void Notify(string id, [Localizable(true)] string message) { }
    public void Run()
    {
        MessageBox.Show("File saved"); // Noncompliant
        Notify("x1", "Something went wrong"); // Noncompliant
    }
}`,
    good: `using System.ComponentModel;
using System.Windows.Forms;
public class Ui
{
    public void Notify(string id, [Localizable(true)] string message) { }
    public void Log(string message) { }
    public void Run(string text)
    {
        MessageBox.Show(Resources.FileSaved);
        MessageBox.Show(text);
        Notify("x1", Resources.Error);
        Log("Something went wrong");
    }
}`,
  },
  'nested-generic-signature': {
    bad: `using System.Collections.Generic;
public class Report
{
    public void Fill(List<Dictionary<string, int>> rows) { } // Noncompliant
}`,
    good: `using System;
using System.Collections.Generic;
using System.Threading.Tasks;
public class Report
{
    public void Fill(List<Row> rows) { }
    public void Run(Func<List<int>, int> f) { }
    public void Await(Task<List<int>> t) { }
    private void Inner(List<List<int>> x) { }
}
public class Row { }`,
  },
  'type-param-not-inferable': {
    bad: `public class Converter
{
    public T Parse<T>(string text) => default(T); // Noncompliant
}`,
    good: `using System.Collections.Generic;
public class Converter
{
    public T First<T>(List<T> items) => items[0];
    public T Create<T>() where T : new() => new T();
    public void Pair<TKey, TValue>(TKey k, TValue[] v) { }
    private T Hidden<T>(string s) => default(T);
}`,
  },
  'multidimensional-array-param': {
    bad: `public class Grid
{
    public void Load(int[,] cells) { } // Noncompliant
    public void LoadJagged(int[][] rows) { } // Noncompliant
}`,
    good: `public class Grid
{
    public void Load(int[] cells) { }
    public static void Main(string[] args) { }
    private void Inner(int[,] cells) { }
    public void Many(params int[][] rows) { }
}`,
  },
  'out-ref-parameter': {
    bad: `public class Calc
{
    public void Divide(int a, int b, out int quotient, out int rest) // Noncompliant
    {
        quotient = a / b;
        rest = a % b;
    }
    public void Swap(ref int a, int b) { a = b; } // Noncompliant
}`,
    good: `public class Calc
{
    public bool TryParse(string s, out int value) { value = 0; return true; }
    public void Deconstruct(out int a, out int b) { a = 1; b = 2; }
    public (int, int) Divide(int a, int b) => (a / b, a % b);
    private void Swap(ref int a, int b) { a = b; }
}`,
  },
  'optional-parameter': {
    bad: `public class Mailer
{
    public void Send(string to, int retries = 3) { } // Noncompliant
    public Mailer(string host = "localhost") { } // Noncompliant
}`,
    good: `using System.Runtime.CompilerServices;
public class Mailer
{
    public void Send(string to) { Send(to, 3); }
    public void Send(string to, int retries) { }
    public void Log(string msg, [CallerMemberName] string caller = "") { }
    private void Inner(int x = 1) { }
}`,
  },
};
