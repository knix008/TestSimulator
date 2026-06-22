namespace ReqTrace.Helpers;

internal static class ClipboardHelper
{
    /// <summary>
    /// Places text on the system clipboard so it remains available after this process exits.
    /// </summary>
    public static bool TrySetPersistentText(string text)
    {
        if (string.IsNullOrEmpty(text))
            return false;

        try
        {
            Clipboard.SetDataObject(text, copy: true);
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
