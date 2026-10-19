// C# — records, LINQ, pattern matching
using System;
using System.Linq;

namespace Samples;

public record Person(string Name, int Age);

public static class Program
{
    public static void Main()
    {
        var people = new[] { new Person("Kim", 34), new Person("Lee", 27), new Person("Park", 45) };
        var adults = people.Where(p => p.Age >= 30).OrderBy(p => p.Name);
        foreach (var p in adults)
            Console.WriteLine(p switch { { Age: > 40 } => $"{p.Name} (senior)", _ => p.Name });
    }
}
