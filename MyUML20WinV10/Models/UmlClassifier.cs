using System.ComponentModel;
using System.Text.Json.Serialization;

namespace MyUML20WinV10.Models;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "classifierKind")]
[JsonDerivedType(typeof(UmlClass), "class")]
[JsonDerivedType(typeof(UmlInterface), "interface")]
[JsonDerivedType(typeof(UmlEnumeration), "enumeration")]
public abstract class UmlClassifier : UmlNamedElement
{
    [Category("기본")]
    [DisplayName("추상")]
    public bool IsAbstract { get; set; }

    [Category("기본")]
    [DisplayName("스테레오타입")]
    public string Stereotype { get; set; } = string.Empty;

    [Browsable(false)]
    public List<UmlProperty> Properties { get; set; } = [];

    [Browsable(false)]
    public List<UmlOperation> Operations { get; set; } = [];

    public abstract string NotationKeyword { get; }

    public abstract UmlClassifier CloneClassifier();
}
