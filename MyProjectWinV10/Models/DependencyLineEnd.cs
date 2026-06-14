namespace MyProject.Models
{
    /// <summary>Decoration at the start or end of a dependency connector line.</summary>
    public enum DependencyLineEnd
    {
        None = 0,
        Arrow = 1,
        OpenArrow = 2,
        Dot = 3,
        Square = 4
    }
}
