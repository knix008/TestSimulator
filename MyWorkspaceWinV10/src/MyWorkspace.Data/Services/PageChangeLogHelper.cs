using MyWorkspace.Core.Enums;

namespace MyWorkspace.Data.Services;

internal static class PageChangeLogHelper
{
    public static PageChangeAction ResolveUpdateAction(bool titleChanged, bool contentChanged) =>
        titleChanged switch
        {
            true when contentChanged => PageChangeAction.TitleAndContentChanged,
            true => PageChangeAction.TitleChanged,
            _ when contentChanged => PageChangeAction.ContentChanged,
            _ => PageChangeAction.ContentChanged
        };
}
