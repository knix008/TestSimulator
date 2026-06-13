using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;

namespace CodeAnalyzer.Services;

public static class UmlMemberExtractor
{
    public static (IReadOnlyList<string> Attributes, IReadOnlyList<string> Operations) FromSymbol(INamedTypeSymbol symbol)
    {
        var attributes = new List<string>();
        var operations = new List<string>();

        foreach (var member in symbol.GetMembers())
        {
            if (member.IsImplicitlyDeclared)
            {
                continue;
            }

            switch (member)
            {
                case IFieldSymbol field:
                    attributes.Add(FormatField(field));
                    break;
                case IPropertySymbol property:
                    attributes.Add(FormatProperty(property));
                    break;
                case IMethodSymbol method when method.MethodKind == MethodKind.Ordinary:
                    if (method.AssociatedSymbol is IPropertySymbol)
                    {
                        continue;
                    }

                    operations.Add(FormatMethod(method));
                    break;
            }
        }

        return (attributes, operations);
    }

    private static string FormatField(IFieldSymbol field)
    {
        if (field.ContainingType?.TypeKind == TypeKind.Enum)
        {
            return $"+ {field.Name}";
        }

        var modifiers = new List<string>();
        if (field.IsStatic)
        {
            modifiers.Add("{static}");
        }

        if (field.IsReadOnly || field.IsConst)
        {
            modifiers.Add("{readOnly}");
        }

        var suffix = modifiers.Count > 0 ? " " + string.Join(" ", modifiers) : string.Empty;
        return $"{Visibility(field.DeclaredAccessibility)} {field.Name}: {TruncateType(field.Type)}{suffix}";
    }

    private static string FormatProperty(IPropertySymbol property)
    {
        var modifiers = new List<string>();
        if (property.IsStatic)
        {
            modifiers.Add("{static}");
        }

        var hasGetter = property.GetMethod is not null;
        var hasSetter = property.SetMethod is not null;
        modifiers.Add(hasGetter && hasSetter ? "{get;set;}" : hasGetter ? "{get;}" : "{set;}");

        return $"{Visibility(property.DeclaredAccessibility)} {property.Name}: {TruncateType(property.Type)} {string.Join(" ", modifiers)}";
    }

    private static string FormatMethod(IMethodSymbol method)
    {
        var parameters = string.Join(", ", method.Parameters.Select(parameter =>
            $"{parameter.Name}: {TruncateType(parameter.Type)}"));
        var returnType = method.ReturnsVoid ? "void" : TruncateType(method.ReturnType);
        var modifiers = new List<string>();
        if (method.IsAbstract)
        {
            modifiers.Add("{abstract}");
        }

        if (method.IsStatic)
        {
            modifiers.Add("{static}");
        }

        var suffix = modifiers.Count > 0 ? " " + string.Join(" ", modifiers) : string.Empty;
        return $"{Visibility(method.DeclaredAccessibility)} {method.Name}({parameters}): {returnType}{suffix}";
    }

    private static string Visibility(Microsoft.CodeAnalysis.Accessibility accessibility) => accessibility switch
    {
        Microsoft.CodeAnalysis.Accessibility.Public => "+",
        Microsoft.CodeAnalysis.Accessibility.Private => "-",
        Microsoft.CodeAnalysis.Accessibility.Protected => "#",
        Microsoft.CodeAnalysis.Accessibility.Internal => "~",
        Microsoft.CodeAnalysis.Accessibility.ProtectedOrInternal => "#",
        Microsoft.CodeAnalysis.Accessibility.ProtectedAndInternal => "#",
        _ => "~"
    };

    private static string TruncateType(ITypeSymbol type)
    {
        var name = type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat);
        return name.Length > 24 ? name[..21] + "..." : name;
    }
}
