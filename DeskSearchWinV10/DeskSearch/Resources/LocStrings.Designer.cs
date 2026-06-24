namespace DeskSearch.Resources;

#nullable enable

using System.Globalization;
using System.Resources;

public static class LocStrings
{
    private static readonly ResourceManager ResourceManager =
        new("DeskSearch.Resources.LocStrings", typeof(LocStrings).Assembly);

    public static CultureInfo? Culture { get; set; }

    public static string Get(string name) =>
        ResourceManager.GetString(name, Culture) ?? name;

    public static string Format(string name, params object[] args) =>
        string.Format(CultureInfo.CurrentCulture, Get(name), args);
}
