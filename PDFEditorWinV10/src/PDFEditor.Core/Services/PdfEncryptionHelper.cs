using iText.Kernel.Exceptions;
using iText.Kernel.Pdf;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

public static class PdfEncryptionHelper
{
    public static bool IsEncrypted(string pdfPath)
    {
        try
        {
            using var reader = new PdfReader(pdfPath);
            return reader.IsEncrypted();
        }
        catch
        {
            return false;
        }
    }

    public static PdfReader OpenReader(string pdfPath, string? password)
    {
        try
        {
            if (string.IsNullOrEmpty(password))
            {
                return new PdfReader(pdfPath);
            }

            var passwordBytes = System.Text.Encoding.UTF8.GetBytes(password);
            var properties = new ReaderProperties().SetPassword(passwordBytes);
            return new PdfReader(pdfPath, properties);
        }
        catch (BadPasswordException)
        {
            if (string.IsNullOrEmpty(password) && IsEncrypted(pdfPath))
            {
                throw new PdfPasswordRequiredException(pdfPath);
            }

            throw new PdfPasswordInvalidException(pdfPath);
        }
        catch (PdfException ex) when (ex.Message.Contains("password", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrEmpty(password))
            {
                throw new PdfPasswordRequiredException(pdfPath);
            }

            throw new PdfPasswordInvalidException(pdfPath);
        }
    }

    public static PdfWriter CreateWriter(string outputPath, EditorDocument document)
    {
        if (!document.IsEncrypted || string.IsNullOrEmpty(document.Password))
        {
            return new PdfWriter(outputPath);
        }

        var userBytes = System.Text.Encoding.UTF8.GetBytes(document.Password);
        var writerProperties = new WriterProperties()
            .SetStandardEncryption(
                userBytes,
                userBytes,
                EncryptionConstants.ALLOW_PRINTING | EncryptionConstants.ALLOW_COPY,
                EncryptionConstants.ENCRYPTION_AES_256);

        return new PdfWriter(outputPath, writerProperties);
    }
}
