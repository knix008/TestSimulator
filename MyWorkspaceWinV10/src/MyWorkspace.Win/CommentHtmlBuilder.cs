using System.Net;
using System.Text;
using Markdig;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Win;

internal static class CommentHtmlBuilder
{
    public static string BuildCommentsDocument(
        IReadOnlyList<PageCommentListItem> comments,
        int pageId,
        MarkdownPipeline pipeline)
    {
        var chrome = EditorChromeOptions.CreateCurrent();
        var p = chrome.Palette;
        var bodyFontSize = (14F * chrome.FontScaleFactor).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);

        var body = new StringBuilder();
        if (comments.Count == 0)
        {
            body.Append("<p class=\"empty\">")
                .Append(EscapeHtml(Localization.Get(K.CommentsEmpty)))
                .Append("</p>");
        }
        else
        {
            foreach (var comment in comments)
            {
                var markdown = ExpandAssetReferencesForDisplay(comment.Content, pageId);
                PageAssetStore.EnsureAssetsMaterialized(pageId, markdown);
                var html = Markdown.ToHtml(markdown, pipeline);

                body.Append("<article class=\"comment\" data-comment-id=\"")
                    .Append(comment.Id)
                    .Append("\">")
                    .Append("<header><span class=\"author\">")
                    .Append(EscapeHtml(comment.AuthorUsername))
                    .Append("</span><span class=\"time\">")
                    .Append(EscapeHtml(FormatCommentTime(comment.CreatedAt, comment.UpdatedAt)))
                    .Append("</span>");

                if (comment.CanDelete)
                {
                    body.Append("<button type=\"button\" class=\"delete-btn\" data-action=\"delete\" data-id=\"")
                        .Append(comment.Id)
                        .Append("\">")
                        .Append(EscapeHtml(Localization.Get(K.CommentsDelete)))
                        .Append("</button>");
                }

                body.Append("</header><div class=\"body\">")
                    .Append(html)
                    .Append("</div></article>");
            }
        }

        return $$"""
            <!DOCTYPE html>
            <html lang="ko">
            <head>
              <meta charset="utf-8">
              <meta name="color-scheme" content="{{(AppTheme.IsDark ? "dark" : "light")}}">
              <style>
                :root {
                  --bg: #{{p.Sidebar.R:X2}}{{p.Sidebar.G:X2}}{{p.Sidebar.B:X2}};
                  --text: #{{p.EditorText.R:X2}}{{p.EditorText.G:X2}}{{p.EditorText.B:X2}};
                  --muted: #{{p.TextSecondary.R:X2}}{{p.TextSecondary.G:X2}}{{p.TextSecondary.B:X2}};
                  --border: #{{p.Border.R:X2}}{{p.Border.G:X2}}{{p.Border.B:X2}};
                  --accent: #{{p.Accent.R:X2}}{{p.Accent.G:X2}}{{p.Accent.B:X2}};
                  --code-bg: #{{p.EditorCodeBackground.R:X2}}{{p.EditorCodeBackground.G:X2}}{{p.EditorCodeBackground.B:X2}};
                }
                * { box-sizing: border-box; }
                html, body {
                  margin: 0; padding: 0;
                  font-family: "Segoe UI", "Malgun Gothic", sans-serif;
                  font-size: {{bodyFontSize}}px;
                  line-height: 1.5;
                  color: var(--text);
                  background: var(--bg);
                }
                body { padding: 12px 14px 20px; }
                .empty { color: var(--muted); margin: 8px 0; }
                .comment {
                  border: 1px solid var(--border);
                  border-radius: 8px;
                  padding: 10px 12px;
                  margin-bottom: 10px;
                  background: color-mix(in srgb, var(--bg) 92%, var(--text));
                }
                .comment header {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  margin-bottom: 8px;
                  flex-wrap: wrap;
                }
                .author { font-weight: 600; }
                .time { color: var(--muted); font-size: 0.9em; }
                .delete-btn {
                  margin-left: auto;
                  border: 1px solid var(--border);
                  background: transparent;
                  color: var(--muted);
                  border-radius: 4px;
                  padding: 2px 8px;
                  cursor: pointer;
                  font-size: 0.85em;
                }
                .delete-btn:hover { color: var(--text); border-color: var(--accent); }
                .body :first-child { margin-top: 0; }
                .body :last-child { margin-bottom: 0; }
                .body img { max-width: 100%; height: auto; border-radius: 4px; margin: 6px 0; }
                .body a { color: var(--accent); }
                .body p { margin: 0 0 8px; }
                .body code {
                  background: var(--code-bg);
                  padding: 0.1em 0.35em;
                  border-radius: 4px;
                  font-family: Consolas, monospace;
                  font-size: 0.92em;
                }
                .file-attachment {
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 10px;
                  margin: 4px 0;
                  border: 1px solid var(--border);
                  border-radius: 6px;
                  background: var(--code-bg);
                  text-decoration: none !important;
                }
              </style>
            </head>
            <body>
              {{body}}
              <script>
                document.querySelectorAll('[data-action="delete"]').forEach(btn => {
                  btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    if (!id) return;
                    window.chrome?.webview?.postMessage(JSON.stringify({ type: 'delete-comment', id: Number(id) }));
                  });
                });
                document.addEventListener('click', (e) => {
                  const link = e.target.closest('a[href]');
                  if (!link) return;
                  const href = link.getAttribute('href');
                  if (!href) return;
                  e.preventDefault();
                  window.chrome?.webview?.postMessage(JSON.stringify({ type: 'open', href }));
                });
              </script>
            </body>
            </html>
            """;
    }

    private static string ExpandAssetReferencesForDisplay(string markdown, int pageId) =>
        PageMarkdownNormalizer.ExpandAssetReferences(markdown, pageId);

    private static string FormatCommentTime(DateTime createdAt, DateTime updatedAt)
    {
        var localCreated = createdAt.ToLocalTime();
        if (updatedAt > createdAt.AddSeconds(1))
        {
            var localUpdated = updatedAt.ToLocalTime();
            return Localization.Format(
                K.CommentsEditedAt,
                localCreated.ToString("g"),
                localUpdated.ToString("g"));
        }

        return localCreated.ToString("g");
    }

    private static string EscapeHtml(string value) => WebUtility.HtmlEncode(value);
}
