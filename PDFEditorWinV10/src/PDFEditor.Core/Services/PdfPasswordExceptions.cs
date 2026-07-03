namespace PDFEditor.Core.Services;

public sealed class PdfPasswordRequiredException : Exception
{
    public PdfPasswordRequiredException(string path)
        : base($"PDF is encrypted and requires a password: {path}")
    {
        FilePath = path;
    }

    public string FilePath { get; }
}

public sealed class PdfPasswordInvalidException : Exception
{
    public PdfPasswordInvalidException(string path)
        : base($"Invalid password for encrypted PDF: {path}")
    {
        FilePath = path;
    }

    public string FilePath { get; }
}
