// sem-cs samples: tests rules. See sem-cs-cases.mjs for the format.
const P = 'tests/SampleTests.cs';

// MSTest class wrapper
const ms = (body) => `using System;
using Microsoft.VisualStudio.TestTools.UnitTesting;

[TestClass]
public class SampleTests
{
${body}
}
`;
// xUnit class wrapper
const xu = (body) => `using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

public class SampleTests
{
${body}
}
`;
// NUnit class wrapper
const nu = (body) => `using System;
using NUnit.Framework;

[TestFixture]
public class SampleTests
{
${body}
}
`;

export default {
  'test-no-assertion': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Adds() // Noncompliant
    {
        var sum = Calculator.Add(1, 2);
    }`),
    good: ms(`    [TestMethod]
    public void Adds()
    {
        var sum = Calculator.Add(1, 2);
        Assert.AreEqual(3, sum);
    }

    [TestMethod]
    public void AddsWithHelper()
    {
        CheckSum(Calculator.Add(1, 2));
    }

    [TestMethod]
    [ExpectedException(typeof(ArgumentException))]
    public void Throws()
    {
        Calculator.Parse("x");
    }

    [TestMethod]
    public void Verifies()
    {
        var mock = new Mock<IService>();
        new Client(mock.Object).Run();
        mock.Verify(s => s.Call());
    }

    private static void CheckSum(int s)
    {
        Assert.AreEqual(3, s);
    }`),
  },

  'test-assert-argument-order': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Order()
    {
        var count = Calculator.Count();
        Assert.AreEqual(count, 5); // Noncompliant
        Assert.AreNotEqual(count, "x"); // Noncompliant
    }`) + `
[TestFixture]
public class OtherTests
{
    [Test]
    public void That()
    {
        var n = Calculator.Count();
        Assert.That(3, Is.EqualTo(n)); // Noncompliant
    }
}
`,
    good: ms(`    [TestMethod]
    public void Order()
    {
        var count = Calculator.Count();
        Assert.AreEqual(5, count);
        Assert.AreEqual(count, Calculator.Count());
        Assert.That(count, Is.EqualTo(5));
    }`),
  },

  'test-boolean-literal-assertion': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Flags()
    {
        bool ok = Calculator.IsReady();
        Assert.AreEqual(true, ok); // Noncompliant
        Assert.AreNotEqual(false, ok); // Noncompliant
    }`),
    good: ms(`    [TestMethod]
    public void Flags()
    {
        bool ok = Calculator.IsReady();
        Assert.IsTrue(ok);
        Assert.AreEqual(2, Calculator.Count());
    }`),
  },

  'test-incomplete-assertion': {
    path: P,
    bad: xu(`    [Fact]
    public void Fluent()
    {
        var result = Calculator.Count();
        result.Should(); // Noncompliant
        var sub = Substitute.For<IService>();
        sub.Received(); // Noncompliant
    }`),
    good: xu(`    [Fact]
    public void Fluent()
    {
        var result = Calculator.Count();
        result.Should().Be(3);
        var sub = Substitute.For<IService>();
        sub.Received().Call();
    }`),
  },

  'test-assert-literal-condition': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Literal()
    {
        Assert.IsTrue(true); // Noncompliant
        Assert.IsFalse(true); // Noncompliant
    }`),
    good: ms(`    [TestMethod]
    public void Literal()
    {
        Assert.IsTrue(Calculator.IsReady());
        Assert.Fail("not implemented yet");
    }`),
  },

  'test-assert-same-operands': {
    path: P,
    bad: xu(`    [Fact]
    public void Same()
    {
        var a = Calculator.Count();
        Assert.Equal(a, a); // Noncompliant
    }`),
    good: xu(`    [Fact]
    public void Same()
    {
        var a = Calculator.Count();
        Assert.Equal(4, a);
    }`),
  },

  'test-assert-equals-object': {
    path: P,
    bad: nu(`    [Test]
    public void Eq()
    {
        var a = Calculator.Count();
        Assert.Equals(4, a); // Noncompliant
    }`),
    good: nu(`    [Test]
    public void Eq()
    {
        var a = Calculator.Count();
        Assert.AreEqual(4, a);
        Assert.IsTrue(a.Equals(4));
    }`),
  },

  'test-assert-equality-condition': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Cond()
    {
        var a = Calculator.Count();
        Assert.IsTrue(a == 4); // Noncompliant
        Assert.IsFalse(a == 5); // Noncompliant
    }`),
    good: ms(`    [TestMethod]
    public void Cond()
    {
        var a = Calculator.Count();
        object o = Calculator.Find();
        Assert.AreEqual(4, a);
        Assert.IsTrue(o == null);
        Assert.IsTrue(a > 3);
    }`),
  },

  'test-float-equality-without-delta': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Floats()
    {
        double avg = Calculator.Average();
        Assert.AreEqual(0.3, avg); // Noncompliant
    }`),
    good: ms(`    [TestMethod]
    public void Floats()
    {
        double avg = Calculator.Average();
        decimal price = Calculator.Price();
        Assert.AreEqual(0.3, avg, 1e-9);
        Assert.AreEqual(1.5m, price);
        Assert.AreEqual(3, Calculator.Count());
    }`),
  },

  'test-same-on-value-type': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Same()
    {
        int a = Calculator.Count();
        Assert.AreSame(4, a); // Noncompliant
    }`),
    good: ms(`    [TestMethod]
    public void Same()
    {
        int a = Calculator.Count();
        object first = Calculator.Find();
        Assert.AreEqual(4, a);
        Assert.AreSame(first, Calculator.Find());
    }`),
  },

  'test-null-check-on-value-type': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Nulls()
    {
        int a = Calculator.Count();
        Assert.IsNotNull(a); // Noncompliant
    }`),
    good: ms(`    [TestMethod]
    public void Nulls()
    {
        int? a = Calculator.MaybeCount();
        string s = Calculator.Name();
        Assert.IsNotNull(a);
        Assert.IsNotNull(s);
    }`),
  },

  'test-assert-count-empty-single': {
    path: P,
    bad: xu(`    [Fact]
    public void Counts()
    {
        var items = new List<int>();
        Assert.Equal(0, items.Count); // Noncompliant
        Assert.Equal(1, items.Where(x => x > 1).Count()); // Noncompliant
    }`),
    good: xu(`    [Fact]
    public void Counts()
    {
        var items = new List<int>();
        Assert.Empty(items);
        Assert.Equal(3, items.Count);
    }`),
  },

  'test-try-catch-without-fail': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Throws()
    {
        try // Noncompliant
        {
            Calculator.Parse("x");
        }
        catch (FormatException e)
        {
            Assert.AreEqual("bad", e.Message);
        }
    }`),
    good: ms(`    [TestMethod]
    public void Throws()
    {
        try
        {
            Calculator.Parse("x");
            Assert.Fail("expected an exception");
        }
        catch (FormatException e)
        {
            Assert.AreEqual("bad", e.Message);
        }
    }`),
  },

  'test-expected-exception': {
    path: P,
    bad: ms(`    [TestMethod]
    [ExpectedException(typeof(FormatException))] // Noncompliant
    public void Throws()
    {
        Calculator.Parse("x");
    }`),
    good: ms(`    [TestMethod]
    public void Throws()
    {
        Assert.ThrowsException<FormatException>(() => Calculator.Parse("x"));
    }`),
  },

  'test-class-without-tests': {
    path: P,
    bad: `using Microsoft.VisualStudio.TestTools.UnitTesting;

[TestClass]
public class EmptyTests // Noncompliant
{
    public void Helper() { }
}
`,
    good: `using Microsoft.VisualStudio.TestTools.UnitTesting;

[TestClass]
public class FullTests
{
    [TestMethod]
    public void Works() { Assert.IsTrue(Calculator.IsReady()); }
}

[TestClass]
public abstract class BaseTests
{
    protected void Helper() { }
}

[TestClass]
public class DerivedTests : BaseTests
{
}
`,
  },

  'test-method-signature': {
    path: P,
    bad: ms(`    [TestMethod]
    void Hidden() { Assert.IsTrue(Calculator.IsReady()); } // Noncompliant

    [TestMethod]
    public static void Shared() { Assert.IsTrue(Calculator.IsReady()); } // Noncompliant

    [TestMethod]
    public async void Later() { await Calculator.RunAsync(); Assert.IsTrue(Calculator.IsReady()); } // Noncompliant

    [TestMethod]
    public void Generic<T>() { Assert.IsTrue(Calculator.IsReady()); } // Noncompliant`),
    good: ms(`    [TestMethod]
    public void Visible() { Assert.IsTrue(Calculator.IsReady()); }

    [TestMethod]
    public async Task Later() { await Calculator.RunAsync(); Assert.IsTrue(Calculator.IsReady()); }

    private void Helper() { }`),
  },

  'test-class-not-public': {
    path: P,
    bad: `using Xunit;

internal class HiddenTests // Noncompliant
{
    [Fact]
    public void Works() { Assert.True(Calculator.IsReady()); }
}

[TestClass]
class ImplicitTests // Noncompliant
{
    [TestMethod]
    public void Works() { Assert.IsTrue(Calculator.IsReady()); }
}
`,
    good: `using Xunit;

public class VisibleTests
{
    [Fact]
    public void Works() { Assert.True(Calculator.IsReady()); }
}

internal class Helper
{
    public void Run() { }
}
`,
  },

  'test-method-outside-test-class': {
    path: P,
    bad: `using Microsoft.VisualStudio.TestTools.UnitTesting;

public class ForgottenTests
{
    [TestMethod]
    public void Works() { Assert.IsTrue(Calculator.IsReady()); } // Noncompliant
}
`,
    good: `using Microsoft.VisualStudio.TestTools.UnitTesting;

[TestClass]
public class RealTests
{
    [TestMethod]
    public void Works() { Assert.IsTrue(Calculator.IsReady()); }
}

public abstract class SharedTests
{
    [TestMethod]
    public void Common() { Assert.IsTrue(Calculator.IsReady()); }
}
`,
  },

  'test-parameters-without-data': {
    path: P,
    bad: xu(`    [Fact]
    public void Adds(int a) { Assert.Equal(a, Calculator.Add(a, 0)); } // Noncompliant`) + `
[TestClass]
public class MsTests
{
    [TestMethod]
    public void Parses(string text) { Assert.IsNotNull(Calculator.Parse(text)); } // Noncompliant
}
`,
    good: xu(`    [Theory]
    [InlineData(1)]
    public void Adds(int a) { Assert.Equal(a, Calculator.Add(a, 0)); }

    [Fact]
    public void Plain() { Assert.True(Calculator.IsReady()); }`) + `
[TestClass]
public class MsTests
{
    [TestMethod]
    [DataRow("1")]
    public void Parses(string text) { Assert.IsNotNull(Calculator.Parse(text)); }
}
`,
  },

  'test-theory-without-data': {
    path: P,
    bad: xu(`    [Theory]
    public void Adds(int a) { Assert.Equal(a, Calculator.Add(a, 0)); } // Noncompliant`),
    good: xu(`    [Theory]
    [MemberData(nameof(Numbers))]
    public void Adds(int a) { Assert.Equal(a, Calculator.Add(a, 0)); }

    [Theory]
    [AutoData]
    public void Auto(int a) { Assert.Equal(a, Calculator.Add(a, 0)); }

    public static IEnumerable<object[]> Numbers => new[] { new object[] { 1 } };`),
  },

  'test-data-argument-count': {
    path: P,
    bad: nu(`    [TestCase(1, 2)]
    [TestCase(1, 2, 3, 4)] // Noncompliant
    public void Adds(int a, int b, int expected = 3) { Assert.AreEqual(expected, Calculator.Add(a, b)); }`) + `
public class XTests
{
    [Theory]
    [InlineData(1)] // Noncompliant
    public void Sums(int a, int b) { Xunit.Assert.Equal(a + b, Calculator.Add(a, b)); }
}
`,
    good: nu(`    [TestCase(1, 2)]
    [TestCase(1, 2, 3)]
    [TestCase(1, 2, ExpectedResult = 3)]
    public void Adds(int a, int b, int expected = 3) { Assert.AreEqual(expected, Calculator.Add(a, b)); }

    [TestCase(1, 2, 3)]
    public void Many(params int[] values) { Assert.IsNotNull(values); }`),
  },

  'test-duplicate-data': {
    path: P,
    bad: xu(`    [Theory]
    [InlineData(1, "a")]
    [InlineData(2, "b")]
    [InlineData(1, "a")] // Noncompliant
    public void Cases(int n, string s) { Assert.NotNull(Calculator.Format(n, s)); }`),
    good: xu(`    [Theory]
    [InlineData(1, "a")]
    [InlineData(2, "b")]
    [InlineData(1, "b")]
    public void Cases(int n, string s) { Assert.NotNull(Calculator.Format(n, s)); }`),
  },

  'test-non-void-return': {
    path: P,
    bad: ms(`    [TestMethod]
    public int Computes() // Noncompliant
    {
        return Calculator.Count();
    }

    [TestMethod]
    public Task<int> ComputesAsync() // Noncompliant
    {
        return Calculator.CountAsync();
    }`),
    good: ms(`    [TestMethod]
    public void Computes()
    {
        Assert.AreEqual(3, Calculator.Count());
    }

    [TestMethod]
    public async Task ComputesAsync()
    {
        Assert.AreEqual(3, await Calculator.CountAsync());
    }`) + `
[TestFixture]
public class NTests
{
    [TestCase(1, 2, ExpectedResult = 3)]
    public int Adds(int a, int b) => Calculator.Add(a, b);
}
`,
  },

  'test-fixture-method-signature': {
    path: P,
    bad: ms(`    [ClassInitialize]
    public void Setup(TestContext context) { } // Noncompliant

    [TestInitialize]
    public static void Before() { } // Noncompliant

    [AssemblyInitialize]
    public static void Start() { } // Noncompliant

    [TestMethod]
    public void Works() { Assert.IsTrue(Calculator.IsReady()); }`),
    good: ms(`    [ClassInitialize]
    public static void Setup(TestContext context) { }

    [ClassCleanup]
    public static void TearDown() { }

    [TestInitialize]
    public void Before() { }

    [TestCleanup]
    public async Task AfterAsync() { await Calculator.RunAsync(); }

    [TestMethod]
    public void Works() { Assert.IsTrue(Calculator.IsReady()); }`),
  },

  'test-ignored-without-reason': {
    path: P,
    bad: ms(`    [TestMethod]
    [Ignore] // Noncompliant
    public void Later() { Assert.IsTrue(Calculator.IsReady()); }`) + `
public class XTests
{
    [Fact(Skip = " ")] // Noncompliant
    public void Skipped() { Xunit.Assert.True(Calculator.IsReady()); }
}
`,
    good: ms(`    [TestMethod]
    [Ignore("Waits for issue 42")]
    public void Later() { Assert.IsTrue(Calculator.IsReady()); }`) + `
public class XTests
{
    [Fact(Skip = "Flaky on CI, see issue 7")]
    public void Skipped() { Xunit.Assert.True(Calculator.IsReady()); }
}
`,
  },

  'test-empty-method': {
    path: P,
    bad: nu(`    [Test]
    public void Nothing() // Noncompliant
    {
    }`),
    good: nu(`    [Test]
    public void Something()
    {
        Assert.IsTrue(Calculator.IsReady());
    }

    [Test]
    public void Placeholder()
    {
        // intentionally empty: smoke test that the fixture loads
    }`),
  },

  'test-thread-sleep': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Waits()
    {
        Calculator.Start();
        System.Threading.Thread.Sleep(500); // Noncompliant
        Assert.IsTrue(Calculator.IsReady());
    }`),
    good: ms(`    [TestMethod]
    public void Waits()
    {
        Calculator.Start();
        Assert.IsTrue(Calculator.WaitReady(TimeSpan.FromSeconds(5)));
    }

    private static void Pause() { System.Threading.Thread.Sleep(10); }`),
  },

  'test-console-output': {
    path: P,
    bad: xu(`    [Fact]
    public void Prints()
    {
        var n = Calculator.Count();
        Console.WriteLine(n); // Noncompliant
        Assert.Equal(3, n);
    }`),
    good: xu(`    private readonly ITestOutputHelper output;

    public SampleTests(ITestOutputHelper output) { this.output = output; }

    [Fact]
    public void Prints()
    {
        var n = Calculator.Count();
        output.WriteLine(n.ToString());
        Assert.Equal(3, n);
    }`),
  },

  'test-current-time': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Ages()
    {
        var age = Calculator.Age(new DateTime(2000, 1, 1), DateTime.Now); // Noncompliant
        Assert.IsTrue(age > 20);
    }`),
    good: ms(`    [TestMethod]
    public void Ages()
    {
        var age = Calculator.Age(new DateTime(2000, 1, 1), new DateTime(2024, 6, 1));
        Assert.AreEqual(24, age);
    }`),
  },

  'test-unseeded-random': {
    path: P,
    bad: ms(`    [TestMethod]
    public void Shuffles()
    {
        var rnd = new Random(); // Noncompliant
        var n = Random.Shared.Next(); // Noncompliant
        Assert.IsNotNull(Calculator.Shuffle(rnd, n));
    }`),
    good: ms(`    [TestMethod]
    public void Shuffles()
    {
        var rnd = new Random(1234);
        Assert.IsNotNull(Calculator.Shuffle(rnd, rnd.Next()));
    }`),
  },

  'test-static-mutable-field': {
    path: P,
    bad: ms(`    private static int counter;

    [TestMethod]
    public void First()
    {
        counter = Calculator.Count(); // Noncompliant
        Assert.AreEqual(3, counter);
    }`),
    good: ms(`    private static readonly int Expected = 3;
    private int counter;

    [TestMethod]
    public void First()
    {
        counter = Calculator.Count();
        Assert.AreEqual(Expected, counter);
    }`),
  },
};
