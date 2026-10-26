// sem-cs samples: flow rules (symbolic execution and data flow). See sem-cs-cases.mjs for the format.
export default {
  'null-dereference': {
    bad: `public class Report
{
    public int Length(bool empty)
    {
        string text = null;
        if (!empty)
        {
            text = "content";
        }
        return text.Length; // Noncompliant
    }

    public int Size(string name)
    {
        if (name == null)
        {
            System.Console.WriteLine("no name");
        }
        return name.Length; // Noncompliant
    }
}`,
    good: `public class Report
{
    public int Length(bool empty)
    {
        string text = null;
        if (!empty)
        {
            text = "content";
        }
        return text == null ? 0 : text.Length;
    }

    public int Size(string name)
    {
        if (name == null)
        {
            return 0;
        }
        return name.Length;
    }
}`,
  },

  'nullable-value-null': {
    bad: `public class Meter
{
    public int Read(bool ready)
    {
        int? value = null;
        if (ready)
        {
            System.Console.WriteLine("ready");
        }
        return value.Value; // Noncompliant
    }
}`,
    good: `public class Meter
{
    public int Read(bool ready)
    {
        int? value = null;
        if (ready)
        {
            value = 42;
        }
        return value.HasValue ? value.Value : 0;
    }
}`,
  },

  'empty-collection-access': {
    bad: `using System.Collections.Generic;

public class Inventory
{
    public int Total()
    {
        var items = new List<int>();
        int sum = 0;
        foreach (var item in items) // Noncompliant
        {
            sum += item;
        }
        return sum;
    }
}`,
    good: `using System.Collections.Generic;

public class Inventory
{
    public int Total(int[] source)
    {
        var items = new List<int>();
        items.AddRange(source);
        int sum = 0;
        foreach (var item in items)
        {
            sum += item;
        }
        return sum;
    }
}`,
  },

  'dispose-twice': {
    bad: `using System.IO;

public class Writer
{
    public void Save(string path, string text)
    {
        var stream = new FileStream(path, FileMode.Create);
        stream.WriteByte(1);
        stream.Dispose();
        stream.Dispose(); // Noncompliant
    }
}`,
    good: `using System.IO;

public class Writer
{
    public void Save(string path, string text)
    {
        var stream = new FileStream(path, FileMode.Create);
        stream.WriteByte(1);
        stream.Dispose();
    }
}`,
  },

  'disposed-object-used': {
    bad: `using System.IO;

public class Writer
{
    public void Save(string path)
    {
        var stream = new FileStream(path, FileMode.Create);
        stream.Dispose();
        stream.WriteByte(1); // Noncompliant
    }
}`,
    good: `using System.IO;

public class Writer
{
    public void Save(string path)
    {
        var stream = new FileStream(path, FileMode.Create);
        stream.WriteByte(1);
        stream.Dispose();
    }
}`,
  },

  'disposable-not-disposed': {
    bad: `using System.IO;

public class Logger
{
    public void Append(string path, string line)
    {
        var writer = new StreamWriter(path); // Noncompliant
        writer.WriteLine(line);
    }
}`,
    good: `using System.IO;

public class Logger
{
    public void Append(string path, string line)
    {
        using (var writer = new StreamWriter(path))
        {
            writer.WriteLine(line);
        }
    }
}`,
  },

  'division-by-zero': {
    bad: `public class Averager
{
    public int Average(int sum, bool any)
    {
        int count = 0;
        if (any)
        {
            System.Console.WriteLine("some");
        }
        return sum / count; // Noncompliant
    }
}`,
    good: `public class Averager
{
    public int Average(int sum, int count)
    {
        if (count == 0)
        {
            return 0;
        }
        return sum / count;
    }
}`,
  },

  'lock-not-released': {
    bad: `using System.Threading;

public class Counter
{
    private readonly object sync = new object();
    private int value;

    public void Add(int n)
    {
        Monitor.Enter(sync); // Noncompliant
        if (n < 0)
        {
            return;
        }
        value += n;
        Monitor.Exit(sync);
    }
}`,
    good: `using System.Threading;

public class Counter
{
    private readonly object sync = new object();
    private int value;

    public void Add(int n)
    {
        Monitor.Enter(sync);
        try
        {
            if (n < 0)
            {
                return;
            }
            value += n;
        }
        finally
        {
            Monitor.Exit(sync);
        }
    }
}`,
  },

  'condition-always-same': {
    bad: `public class Gate
{
    public string Check(bool a)
    {
        if (a)
        {
            if (a) // Noncompliant
            {
                return "open";
            }
        }
        return "closed";
    }
}`,
    good: `public class Gate
{
    public string Check(bool a, bool b)
    {
        if (a)
        {
            if (b)
            {
                return "open";
            }
        }
        return "closed";
    }
}`,
  },

  'unreachable-branch': {
    bad: `public class Gate
{
    public string Check(string name)
    {
        string label = null;
        if (label != null) // Noncompliant
        {
            return label;
        }
        return name;
    }
}`,
    good: `public class Gate
{
    public string Check(string name, string label)
    {
        if (label != null)
        {
            return label;
        }
        return name;
    }
}`,
  },

  'dead-store': {
    bad: `public class Calc
{
    public int Compute(int a)
    {
        int result = a * 2; // Noncompliant
        result = a + 1;
        return result;
    }
}`,
    good: `public class Calc
{
    public int Compute(int a)
    {
        int result = a * 2;
        result = result + 1;
        return result;
    }
}`,
  },

  'unreachable-code': {
    bad: `public class Calc
{
    public int Compute(int a)
    {
        return a * 2;
        a++; // Noncompliant
    }
}`,
    good: `public class Calc
{
    public int Compute(int a)
    {
        a++;
        return a * 2;
    }
}`,
  },
};
