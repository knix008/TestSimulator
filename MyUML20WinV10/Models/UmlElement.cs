using System.ComponentModel;

namespace MyUML20WinV10.Models;

public abstract class UmlElement
{
    [Browsable(false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    public virtual string DisplayLabel => GetType().Name;
}
