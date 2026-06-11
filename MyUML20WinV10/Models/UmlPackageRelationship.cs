using System.ComponentModel;

namespace MyUML20WinV10.Models;

public enum UmlPackageRelationshipKind
{
    Merge,
    Import,
    Nesting,
}

public sealed class UmlPackageRelationship : UmlRelationship
{
    [Category("기본")]
    [DisplayName("패키지 관계")]
    public UmlPackageRelationshipKind PackageKind { get; set; } = UmlPackageRelationshipKind.Merge;

    public override string RelationshipKind => PackageKind switch
    {
        UmlPackageRelationshipKind.Import => "PackageImport",
        UmlPackageRelationshipKind.Nesting => "PackageNesting",
        _ => "PackageMerge",
    };

    public override string DisplayLabel => PackageKind switch
    {
        UmlPackageRelationshipKind.Import => "«import»",
        UmlPackageRelationshipKind.Nesting => "nesting",
        _ => "«merge»",
    };
}
