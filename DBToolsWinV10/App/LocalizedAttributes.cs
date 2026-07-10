using System.ComponentModel;

namespace DBToolsWinV10.App;

public sealed class LDisplayNameAttribute(string key, string fallback) : DisplayNameAttribute(fallback)
{
    public override string DisplayName => L.S(key, base.DisplayName);
}

public sealed class LCategoryAttribute(string key, string fallback) : CategoryAttribute(L.S(key, fallback))
{
}

public sealed class LDescriptionAttribute(string key, string fallback) : DescriptionAttribute(fallback)
{
    public override string Description => L.S(key, base.Description);
}
