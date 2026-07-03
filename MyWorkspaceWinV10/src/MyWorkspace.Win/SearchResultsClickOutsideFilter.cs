namespace MyWorkspace.Win;

internal sealed class SearchResultsClickOutsideFilter : IMessageFilter
{
    private const int WmLButtonDown = 0x0201;
    private const int WmRButtonDown = 0x0204;
    private const int WmNclButtonDown = 0x00A1;

    private readonly TitleBarPageSearchBox _owner;

    public SearchResultsClickOutsideFilter(TitleBarPageSearchBox owner) =>
        _owner = owner;

    public bool PreFilterMessage(ref Message m)
    {
        if (!_owner.IsResultsPopupVisible)
            return false;

        if (m.Msg is not (WmLButtonDown or WmRButtonDown or WmNclButtonDown))
            return false;

        var cursor = Control.MousePosition;
        if (_owner.ContainsScreenPoint(cursor) || _owner.ContainsResultsPopupPoint(cursor))
            return false;

        _owner.HideResultsPopup();
        return false;
    }
}
