using MyAgileBoardWinV10.Controls;
using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Services;

public static class ProjectBoardSync
{
    public static void SyncFromBoard(KanbanProject project, IEnumerable<KanbanColumnControl> columns)
    {
        foreach (var colCtrl in columns)
            colCtrl.SyncToModel();
    }

    public static void Normalize(KanbanProject project)
    {
        project.BurndownChartColors ??= BurndownChartColorSettings.CreateDefault();

        // 이전 .mab: 프로젝트 전역 ShowGrid=false → 모든 컬럼에 적용
        if (!project.ShowGrid)
        {
            foreach (var column in project.Columns)
                column.ShowGrid = false;
        }

        foreach (var column in project.Columns)
        {
            if (string.IsNullOrWhiteSpace(column.CanvasColorHex))
                column.CanvasColorHex = KanbanColumn.DefaultCanvasColorHex;

            if (column.ColumnWidth <= 0)
                column.ColumnWidth = ColumnWidthDefaults.Default;

            if (string.IsNullOrWhiteSpace(column.TitleFontFamily))
                column.TitleFontFamily = "Segoe UI";

            if (column.TitleFontSize <= 0)
                column.TitleFontSize = 9.5f;

            foreach (var card in column.Cards)
                NormalizeCard(card);
        }

        foreach (var archived in project.ArchivedCards)
            NormalizeCard(archived.Card);
    }

    private static void NormalizeCard(KanbanCard card)
    {
        if (string.IsNullOrWhiteSpace(card.CardColorHex))
            card.CardColorHex = "#F5F5F5";

        card.TitleStyle ??= new CardTextStyle();
    }
}
