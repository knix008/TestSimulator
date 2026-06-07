using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlOperation : UmlNamedElement
{
    [Category("기본")]
    [DisplayName("반환 타입")]
    public string ReturnTypeName { get; set; } = "void";

    [Category("기본")]
    [DisplayName("가시성")]
    public UmlVisibility Visibility { get; set; } = UmlVisibility.Public;

    [Category("기본")]
    [DisplayName("정적")]
    public bool IsStatic { get; set; }

    [Category("기본")]
    [DisplayName("추상")]
    public bool IsAbstract { get; set; }

    [Browsable(false)]
    public List<UmlParameter> Parameters { get; set; } = [];

    [Category("기본")]
    [DisplayName("매개변수")]
    public string ParametersText
    {
        get => string.Join(", ", Parameters.Select(p => p.SignatureText));
        set
        {
            Parameters.Clear();
            if (string.IsNullOrWhiteSpace(value))
                return;

            foreach (var part in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var colon = part.IndexOf(':');
                if (colon < 0)
                {
                    Parameters.Add(new UmlParameter { Name = part.Trim() });
                    continue;
                }

                Parameters.Add(new UmlParameter
                {
                    Name = part[..colon].Trim(),
                    TypeName = part[(colon + 1)..].Trim(),
                });
            }
        }
    }

    public string SignatureText
    {
        get
        {
            var prefix = Visibility.ToSymbol();
            if (IsStatic) prefix += "{static} ";
            if (IsAbstract) prefix += "{abstract} ";
            var args = string.Join(", ", Parameters.Select(p => p.SignatureText));
            return $"{prefix}{Name}({args}): {ReturnTypeName}";
        }
    }

    public UmlOperation Clone() => new()
    {
        Id = Id,
        Name = Name,
        ReturnTypeName = ReturnTypeName,
        Visibility = Visibility,
        IsStatic = IsStatic,
        IsAbstract = IsAbstract,
        Parameters = Parameters.Select(p => new UmlParameter { Name = p.Name, TypeName = p.TypeName }).ToList(),
    };
}
