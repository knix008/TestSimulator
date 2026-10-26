// sem-cs samples: naming rules. See sem-cs-cases.mjs for the format.
export default {
  'type-naming': {
    bad: `namespace App
{
    public class orderService { } // Noncompliant
    public struct _point { public int X; } // Noncompliant
    public delegate void callback(int value); // Noncompliant
    public enum color { Red } // Noncompliant
}`,
    good: `namespace App
{
    public class OrderService { }
    public struct Point { public int X; }
    public delegate void Callback(int value);
    public enum Color { Red }
}`,
  },
  'method-naming': {
    bad: `public class Account
{
    public void deposit(decimal amount) { Balance += amount; } // Noncompliant
    public decimal Balance { get; private set; }
    public string owner { get; set; } // Noncompliant
    public event System.EventHandler changed; // Noncompliant
    public int Total()
    {
        int helper() => 1; // Noncompliant
        return helper();
    }
}`,
    good: `public class Account
{
    public void Deposit(decimal amount) { Balance += amount; }
    public decimal Balance { get; private set; }
    public string Owner { get; set; }
    public event System.EventHandler Changed;
    public override string ToString() => Owner;
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern int messageBox(int h, string t, string c, int type);
    public int Total()
    {
        int Helper() => 1;
        return Helper();
    }
}`,
  },
  'interface-prefix': {
    bad: `public interface Repository { void Save(); } // Noncompliant
public interface Ilogger { void Log(string m); } // Noncompliant`,
    good: `public interface IRepository { void Save(); }
public interface ILogger { void Log(string m); }`,
  },
  'class-interface-prefix': {
    bad: `public class IOrderService { } // Noncompliant
public struct IPoint2 { } // Noncompliant`,
    good: `public class OrderService { }
public class IOHelper { }
public class Image { }
public static class IServiceCollectionExtensions { }`,
  },
  'local-naming': {
    bad: `public class Calc
{
    public int Sum(int[] Values, int max_count) // Noncompliant
    {
        int Total = 0; // Noncompliant
        foreach (var Item in Values) Total += Item; // Noncompliant
        return Total + max_count;
    }
}`,
    good: `public class Calc
{
    public int Sum(int[] values, int maxCount)
    {
        const int Offset = 0;
        int total = Offset;
        foreach (var item in values) total += item;
        values.Select((_, i) => i);
        return total + maxCount;
    }
}
public record Person(string Name, int Age);`,
  },
  'type-param-naming': {
    bad: `public class Cache<Key, Value> // Noncompliant
{
    public Value Get<Item>(Key k) => default; // Noncompliant
}`,
    good: `public class Cache<TKey, TValue>
{
    public TValue Get<T>(TKey k) => default;
}`,
  },
  'underscore-in-name': {
    bad: `public class Order_Line // Noncompliant
{
    public void Compute_Total() { } // Noncompliant
    public int Line_Count { get; set; } // Noncompliant
}`,
    good: `public class OrderLine
{
    public void ComputeTotal() { }
    public int LineCount { get; set; }
    private void button1_Click(object sender, System.EventArgs e) { }
}`,
  },
  'acronym-casing': {
    bad: `public class XMLParser // Noncompliant
{
    public string GetHTML() => ""; // Noncompliant
    public int HTTPStatus { get; set; } // Noncompliant
}
public interface IJSONReader { } // Noncompliant`,
    good: `public class XmlParser
{
    public string GetHtml() => "";
    public int HttpStatus { get; set; }
    public int ID { get; set; }
    public string UIElement { get; set; }
    public void OpenIOStream() { }
}
public interface IJsonReader { }
public interface IUIService { }`,
  },
  'hungarian-notation': {
    bad: `public class Form
{
    private string strTitle; // Noncompliant
    public void Show(int intCount) // Noncompliant
    {
        bool blnVisible = intCount > 0; // Noncompliant
        System.Console.WriteLine(strTitle + blnVisible);
    }
}`,
    good: `public class Form
{
    private string title;
    private string strategy;
    public void Show(int count)
    {
        bool visible = count > 0;
        string str = title + strategy;
        System.Console.WriteLine(str + visible);
    }
}`,
  },
  'private-field-naming': {
    bad: `public class Counter
{
    private int Count; // Noncompliant
    int _Total; // Noncompliant
    public int Get() => Count + _Total;
}`,
    good: `public class Counter
{
    private int count;
    private int _total;
    private int m_offset;
    private static readonly Counter Instance = new Counter();
    private const int MaxValue = 3;
    public int Get() => count + _total + m_offset + MaxValue + Instance.count;
}`,
  },
  'public-field-naming': {
    bad: `public class Point
{
    public int x; // Noncompliant
    protected int _y; // Noncompliant
    internal static int count; // Noncompliant
}`,
    good: `public class Point
{
    public int X;
    protected int Y;
    internal static int Count;
    private int z;
    public int Z => z;
}`,
  },
  'const-naming': {
    bad: `public class Limits
{
    public const int MAX_RETRIES = 3; // Noncompliant
    private const string DEFAULT = "x"; // Noncompliant
    const int retry_delay = 10; // Noncompliant
}`,
    good: `public class Limits
{
    public const int MaxRetries = 3;
    private const string Default = "x";
    const int retryDelay = 10;
    public const int ID = 1;
}
static class NativeMethods
{
    public const int WM_PAINT = 0x000F;
}`,
  },
  'async-suffix': {
    bad: `using System.Threading.Tasks;
public class Loader
{
    public async Task Load() { await Task.Delay(1); } // Noncompliant
    public Task<int> Count() => Task.FromResult(1); // Noncompliant
}
public interface IStore
{
    ValueTask Flush(); // Noncompliant
}`,
    good: `using System.Threading.Tasks;
public class Loader
{
    public async Task LoadAsync() { await Task.Delay(1); }
    public Task<int> CountAsync() => Task.FromResult(1);
    public static async Task Main() { await Task.Delay(1); }
    public override Task Run() => Task.CompletedTask;
    private async void OnClick(object sender, System.EventArgs e) { await Task.Delay(1); }
}
public class Worker : System.IDisposable, IExternalJob
{
    public Task Execute() => Task.CompletedTask;
    public void Dispose() { }
}`,
  },
  'async-suffix-not-awaitable': {
    bad: `public class Loader
{
    public void LoadAsync() { } // Noncompliant
    public int CountAsync() => 1; // Noncompliant
}`,
    good: `using System.Threading.Tasks;
using System.Collections.Generic;
public class Loader
{
    public Task LoadAsync() => Task.CompletedTask;
    public async void FireAsync() { await Task.Delay(1); }
    public IAsyncEnumerable<int> ReadAsync() => null;
    public ValueTask<int> CountAsync() => new ValueTask<int>(1);
    public T RunAsync<T>() => default;
}`,
  },
  'enum-naming': {
    bad: `public enum Colors { Red, Green } // Noncompliant
[System.Flags]
public enum FilePermission { Read = 1, Write = 2 } // Noncompliant`,
    good: `public enum Color { Red, Green }
public enum Status { Ok, Failed }
public enum Address { Home }
[System.Flags]
public enum FileAccessRights { None = 0, Read = 1, Write = 2 }`,
  },
  'enum-suffix': {
    bad: `public enum ColorEnum { Red } // Noncompliant
[System.Flags]
public enum AccessFlags { None = 0, Read = 1 } // Noncompliant`,
    good: `public enum Color { Red }
[System.Flags]
public enum AccessRights { None = 0, Read = 1 }`,
  },
  'enum-member-naming': {
    bad: `public enum Mode
{
    fast, // Noncompliant
    Very_Slow, // Noncompliant
    Normal
}`,
    good: `public enum Mode
{
    Fast,
    VerySlow,
    Normal,
    OK
}`,
  },
  'enum-member-type-prefix': {
    bad: `public enum Color
{
    ColorRed, // Noncompliant
    Color_Green, // Noncompliant
    Blue
}`,
    good: `public enum Color
{
    Red,
    Green,
    Colorful
}`,
  },
  'enum-reserved-member': {
    bad: `public enum Kind
{
    First,
    Reserved1, // Noncompliant
    ReservedForFuture // Noncompliant
}`,
    good: `public enum Kind
{
    First,
    Second
}`,
  },
  'namespace-naming': {
    bad: `namespace Company.my_product // Noncompliant
{
    public class A { }
}
namespace utils // Noncompliant
{
    public class B { }
}`,
    good: `namespace Company.MyProduct
{
    public class A { }
}
namespace Company.Utils.V2
{
    public class B { }
}`,
  },
  'type-name-matches-namespace': {
    bad: `namespace Shop.Orders
{
    public class Orders { } // Noncompliant
    public class Linq { } // Noncompliant
}`,
    good: `namespace Shop.Orders
{
    public class OrderList { }
    internal class Shop2 { }
    public class Order { }
}`,
  },
  'event-args-suffix': {
    bad: `using System;
public class OrderPlaced : EventArgs { } // Noncompliant
public class OrderPlacedEventArgs : EventArgs { }
public class Special : OrderPlacedEventArgs { } // Noncompliant`,
    good: `using System;
public class OrderPlacedEventArgs : EventArgs { }
public class SpecialOrderEventArgs : OrderPlacedEventArgs { }
public class Order { }`,
  },
  'attribute-suffix': {
    bad: `using System;
public class Audit : Attribute { } // Noncompliant
public class Secure : ValidationAttribute { } // Noncompliant`,
    good: `using System;
public class AuditAttribute : Attribute { }
public class SecureAttribute : ValidationAttribute { }
public class Audit { }`,
  },
  'delegate-suffix': {
    bad: `public delegate void ProgressDelegate(int percent); // Noncompliant`,
    good: `public delegate void ProgressCallback(int percent);
public delegate void Delegate2();`,
  },
  'event-handler-delegate-signature': {
    bad: `public delegate void SavedEventHandler(string path); // Noncompliant
public delegate int ClosedEventHandler(object sender, System.EventArgs e); // Noncompliant
public delegate void OpenedEventHandler(object source, System.EventArgs args); // Noncompliant`,
    good: `public delegate void SavedEventHandler(object sender, SavedEventArgs e);
public delegate void ProgressHandler(int percent);
public class SavedEventArgs : System.EventArgs { }`,
  },
  'event-before-after-prefix': {
    bad: `public class Window
{
    public event System.EventHandler BeforeClose; // Noncompliant
    public event System.EventHandler AfterOpen, Shown; // Noncompliant
}`,
    good: `public class Window
{
    public event System.EventHandler Closing;
    public event System.EventHandler Opened, Shown;
    public event System.EventHandler Aftermath;
}`,
  },
  'event-on-prefix': {
    bad: `public class Button
{
    public event System.EventHandler OnClick; // Noncompliant
    public event System.EventHandler OnHover { add { } remove { } } // Noncompliant
}`,
    good: `public class Button
{
    public event System.EventHandler Click;
    public event System.EventHandler Online;
    protected virtual void OnClick() => Click?.Invoke(this, System.EventArgs.Empty);
}`,
  },
  'parameter-name-mismatch': {
    bad: `public abstract class Shape
{
    public abstract double Scale(double factor, int steps);
}
public class Circle : Shape
{
    public override double Scale(double f, int steps) => f * steps; // Noncompliant
}
public interface IStore
{
    void Save(string key, string value);
}
public class Store : IStore
{
    public void Save(string name, string value) { } // Noncompliant
}`,
    good: `public abstract class Shape
{
    public abstract double Scale(double factor, int steps);
}
public class Circle : Shape
{
    public override double Scale(double factor, int steps) => factor * steps;
}
public interface IStore
{
    void Save(string key, string value);
}
public class Store : IStore
{
    public void Save(string key, string value) { }
    public void Save(int id, string value) { }
}`,
  },
  'local-shadows-field': {
    bad: `public class Counter
{
    private int count;
    public string Name { get; set; }
    public int Next()
    {
        int count = 1; // Noncompliant
        foreach (var Name in new[] { "a" }) { } // Noncompliant
        return count;
    }
}`,
    good: `public class Counter
{
    private int count;
    public string Name { get; set; }
    public int Next()
    {
        int next = count + 1;
        foreach (var name in new[] { "a" }) { }
        return next;
    }
    public static int Make()
    {
        int count = 3;
        return count;
    }
}`,
  },
  'property-matches-get-method': {
    bad: `public class Order
{
    public decimal Total { get; set; } // Noncompliant
    public decimal GetTotal() => Total;
}`,
    good: `public class Order
{
    public decimal Total { get; set; }
    public decimal GetTax() => Total * 0.1m;
    private decimal GetTotalCore() => Total;
}`,
  },
  'type-param-shadows-outer': {
    bad: `public class Box<T>
{
    public void Put<T>(T item) { } // Noncompliant
    public class Inner<T> { } // Noncompliant
}`,
    good: `public class Box<T>
{
    public void Put<TItem>(TItem item) { }
    public class Inner<TInner> { }
}`,
  },
  'members-differ-by-case': {
    bad: `public class Settings
{
    public int Value { get; set; }
    public int value; // Noncompliant
    public void Reset() { }
    public void reset(int x) { } // Noncompliant
}`,
    good: `public class Settings
{
    private int value;
    public int Value { get => value; set => this.value = value; }
    public void Reset() { }
    public void Reset(int x) { }
}`,
  },
  'negative-boolean-name': {
    bad: `public class Job
{
    private bool notReady; // Noncompliant
    public bool IsNotValid { get; set; } // Noncompliant
    public void Run(bool hasNotStarted) // Noncompliant
    {
        bool notDone = hasNotStarted || notReady; // Noncompliant
        System.Console.WriteLine(notDone);
    }
}`,
    good: `public class Job
{
    private bool ready;
    public bool IsValid { get; set; }
    public string NotificationText { get; set; }
    public void Run(bool hasStarted)
    {
        bool done = hasStarted || ready;
        int notCount = 0;
        System.Console.WriteLine(done + " " + notCount);
    }
}`,
  },
  'get-method-returns-void': {
    bad: `public class Repo
{
    public void GetUsers() { } // Noncompliant
    public void Get() { } // Noncompliant
}`,
    good: `using System.Collections.Generic;
public class Repo
{
    public List<string> GetUsers() => new List<string>();
    public void GetValue(out int v) { v = 1; }
    public void GetItems(List<string> target) { target.Add("a"); }
    public void Getaway() { }
}`,
  },
};
