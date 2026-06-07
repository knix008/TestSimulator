namespace MyUML20WinV10.Models;

public static class UmlVisibilityExtensions
{
    public static string ToSymbol(this UmlVisibility visibility) => visibility switch
    {
        UmlVisibility.Public => "+",
        UmlVisibility.Private => "-",
        UmlVisibility.Protected => "#",
        UmlVisibility.Package => "~",
        _ => "+",
    };
}
