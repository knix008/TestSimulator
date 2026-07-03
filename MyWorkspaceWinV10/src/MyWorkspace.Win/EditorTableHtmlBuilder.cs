using System.Text;

namespace MyWorkspace.Win;

internal static class EditorTableHtmlBuilder
{
    public static string BuildInsertTableHtml(int rows, int columns)
    {
        rows = Math.Clamp(rows, 1, 20);
        columns = Math.Clamp(columns, 1, 20);

        var html = new StringBuilder();
        html.Append("<table><thead><tr>");
        for (var column = 0; column < columns; column++)
            html.Append("<th><p><br></p></th>");
        html.Append("</tr></thead>");

        if (rows > 1)
        {
            html.Append("<tbody>");
            for (var row = 1; row < rows; row++)
            {
                html.Append("<tr>");
                for (var column = 0; column < columns; column++)
                    html.Append("<td><p><br></p></td>");
                html.Append("</tr>");
            }

            html.Append("</tbody>");
        }

        html.Append("</table><p><br></p>");
        return html.ToString();
    }
}
