namespace ReqTrace.Persistence;

public class ProjectLoadException : Exception
{
    public ProjectLoadException(string message, Exception inner) : base(message, inner)
    {
    }
}
