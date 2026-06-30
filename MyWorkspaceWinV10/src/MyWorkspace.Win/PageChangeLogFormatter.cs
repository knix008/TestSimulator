using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Win;

internal static class PageChangeLogFormatter
{
    public static string FormatDescription(PageChangeLogListItem log) =>
        log.Action switch
        {
            PageChangeAction.Created =>
                Localization.Format(K.PageLogActionCreated, log.NewTitle ?? string.Empty),
            PageChangeAction.TitleChanged =>
                Localization.Format(K.PageLogTitleChangedFormat, log.OldTitle ?? string.Empty, log.NewTitle ?? string.Empty),
            PageChangeAction.ContentChanged =>
                Localization.Format(
                    K.PageLogContentChangedFormat,
                    log.OldContentLength ?? 0,
                    log.NewContentLength ?? 0),
            PageChangeAction.TitleAndContentChanged =>
                Localization.Format(
                    K.PageLogTitleAndContentChangedFormat,
                    log.OldTitle ?? string.Empty,
                    log.NewTitle ?? string.Empty,
                    log.OldContentLength ?? 0,
                    log.NewContentLength ?? 0),
            PageChangeAction.Restored =>
                Localization.Format(
                    K.PageLogRestoredFormat,
                    log.OldTitle ?? string.Empty,
                    log.NewTitle ?? string.Empty),
            PageChangeAction.Moved =>
                Localization.Format(K.PageLogMovedFormat, log.Note ?? string.Empty),
            PageChangeAction.Deleted =>
                Localization.Format(K.PageLogActionDeleted, log.OldTitle ?? string.Empty),
            _ => log.Action.ToString()
        };
}
