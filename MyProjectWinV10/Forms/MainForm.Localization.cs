using MyProject.Theme;

namespace MyProject.Forms
{
    public partial class MainForm
    {
        private void ApplyLocalization()
        {
            ApplyMenuTexts();
            ApplyToolbarTexts();
            ConfigureToolbarToolTips();
            ApplyDynamicMenuTexts();
            UpdateTitleBar();
            UpdateTodayStatusLabel();
            statusLabel.Text = AppLocalizer.Get("Status.Ready");
            selectionPropertiesControl.ApplyLocalization();
            taskGridControl.Invalidate();
            calendarViewControl.Invalidate();
            ganttChartControl.Invalidate();
        }

        private void ApplyMenuTexts()
        {
            menuFile.Text = AppLocalizer.Get("Menu.File");
            menuDatabase.Text = AppLocalizer.Get("Menu.Database");
            menuEdit.Text = AppLocalizer.Get("Menu.Edit");
            menuTask.Text = AppLocalizer.Get("Menu.Task");
            menuView.Text = AppLocalizer.Get("Menu.View");
            menuReport.Text = AppLocalizer.Get("Menu.Report");

            menuNew.Text = AppLocalizer.Get("Menu.New");
            menuOpen.Text = AppLocalizer.Get("Menu.Open");
            menuSave.Text = AppLocalizer.Get("Menu.Save");
            menuSaveAs.Text = AppLocalizer.Get("Menu.SaveAs");
            menuProjectSettings.Text = AppLocalizer.Get("Menu.ProjectSettings");
            menuPreferences.Text = AppLocalizer.Get("Menu.Preferences");
            menuExportMsProject.Text = AppLocalizer.Get("Menu.ExportMsProject");
            menuExit.Text = AppLocalizer.Get("Menu.Exit");

            menuDatabaseConnection.Text = AppLocalizer.Get("Menu.DbConnection");
            menuFetchFromDatabase.Text = AppLocalizer.Get("Menu.DbFetch");
            menuRefreshFromDatabase.Text = AppLocalizer.Get("Menu.DbRefresh");
            menuSaveToDatabase.Text = AppLocalizer.Get("Menu.DbSave");
            menuOpenFromDatabase.Text = AppLocalizer.Get("Menu.DbOpen");

            menuUndo.Text = AppLocalizer.Get("Menu.Undo");
            menuRedo.Text = AppLocalizer.Get("Menu.Redo");

            menuAddTask.Text = AppLocalizer.Get("Menu.AddTask");
            menuAddSubtask.Text = AppLocalizer.Get("Menu.AddSubtask");
            menuDeleteTask.Text = AppLocalizer.Get("Menu.DeleteTask");
            menuIndent.Text = AppLocalizer.Get("Menu.Indent");
            menuOutdent.Text = AppLocalizer.Get("Menu.Outdent");
            menuLink.Text = AppLocalizer.Get("Menu.Link");
            menuUnlink.Text = AppLocalizer.Get("Menu.Unlink");
            menuDepType.Text = AppLocalizer.Get("Menu.DepType");
            menuDepFS.Text = AppLocalizer.Get("Menu.DepFS");
            menuDepFF.Text = AppLocalizer.Get("Menu.DepFF");
            menuDepSS.Text = AppLocalizer.Get("Menu.DepSS");
            menuDepSF.Text = AppLocalizer.Get("Menu.DepSF");
            menuTaskProps.Text = AppLocalizer.Get("Menu.TaskProps");
            menuExpandCollapse.Text = AppLocalizer.Get("Menu.ExpandCollapse");

            menuZoomIn.Text = AppLocalizer.Get("Menu.ZoomIn");
            menuZoomOut.Text = AppLocalizer.Get("Menu.ZoomOut");
            menuToday.Text = AppLocalizer.Get("Menu.Today");
            menuPropertiesPanel.Text = AppLocalizer.Get("Menu.PropertiesPanel");
            menuCalendarView.Text = AppLocalizer.Get("Menu.CalendarView");
            menuShowCriticalPath.Text = AppLocalizer.Get("Menu.ShowCriticalPath");

            menuExportExcel.Text = AppLocalizer.Get("Menu.ExportExcel");
            menuExportHtml.Text = AppLocalizer.Get("Menu.ExportHtml");
            menuExportWord.Text = AppLocalizer.Get("Menu.ExportWord");
            menuExportMd.Text = AppLocalizer.Get("Menu.ExportMd");
            menuExportPdf.Text = AppLocalizer.Get("Menu.ExportPdf");
            menuExportGanttImage.Text = AppLocalizer.Get("Menu.ExportGanttImage");
            menuPrint.Text = AppLocalizer.Get("Menu.Print");
        }

        private void ApplyToolbarTexts()
        {
            btnUndo.Text = AppLocalizer.Get("Menu.Undo").Replace("&", "");
            btnRedo.Text = AppLocalizer.Get("Menu.Redo").Replace("&", "");
            btnNew.Text = AppLocalizer.Get("Menu.New").Replace("&", "");
            btnOpen.Text = AppLocalizer.Get("Menu.Open").Replace("&", "").Replace("...", "");
            btnSave.Text = AppLocalizer.Get("Menu.Save").Replace("&", "");
            btnSaveAs.Text = AppLocalizer.Get("Menu.SaveAs").Replace("&", "").Replace("...", "");
            btnAddTask.Text = AppLocalizer.Get("Menu.AddTask").Replace("&", "");
            btnAddSubtask.Text = AppLocalizer.Get("Menu.AddSubtask").Replace("&", "");
            btnDeleteTask.Text = AppLocalizer.Get("Menu.DeleteTask").Replace("&", "");
            btnTaskProps.Text = AppLocalizer.Get("Menu.TaskProps").Replace("&", "").Replace("...", "");
            btnNotes.Text = AppLocalizer.Get("Menu.Notes");
            btnIndent.Text = AppLocalizer.Get("Menu.Indent").Replace("&", "");
            btnOutdent.Text = AppLocalizer.Get("Menu.Outdent").Replace("&", "");
            btnExpandCollapse.Text = AppLocalizer.Get("Menu.ExpandCollapse");
            btnCriticalPath.Text = AppLocalizer.Get("Menu.ShowCriticalPath").Replace("&", "");
            btnLink.Text = AppLocalizer.Get("Menu.Link").Replace("&", "");
            btnUnlink.Text = AppLocalizer.Get("Menu.Unlink").Replace("&", "");
            btnCalendarView.Text = AppLocalizer.Get("Menu.CalendarView").Replace("&", "");
            btnZoomIn.Text = AppLocalizer.Get("Menu.ZoomIn").Replace("&", "");
            btnZoomOut.Text = AppLocalizer.Get("Menu.ZoomOut").Replace("&", "");
            btnZoomDefault.Text = AppLocalizer.Get("Menu.ZoomOut").Replace("&", "");
            btnToday.Text = AppLocalizer.Get("Menu.Today").Replace("&", "");
            btnPropertiesPanel.Text = AppLocalizer.Get("Menu.PropertiesPanel").Replace("&", "");
            btnReport.Text = AppLocalizer.Get("Menu.ExportExcel").Replace("&", "").Split('(')[0].Trim();
            btnExportMd.Text = AppLocalizer.Get("Menu.ExportMd").Replace("&", "").Replace("...", "");
            btnExportPdf.Text = AppLocalizer.Get("Menu.ExportPdf").Replace("&", "").Replace("...", "");
            btnExportGanttImage.Text = AppLocalizer.Get("Menu.ExportGanttImage").Replace("&", "").Replace("...", "");
            btnPrint.Text = AppLocalizer.Get("Menu.Print").Replace("&", "").Replace("...", "");
            btnInfo.Text = AppLocalizer.Get("About.Title");
        }

        private void ApplyDynamicMenuTexts()
        {
            if (_menuAutoRefreshFromDatabase != null)
            {
                _menuAutoRefreshFromDatabase.Text = AppLocalizer.Get("Menu.DbAutoRefresh");
                _menuAutoRefreshFromDatabase.ToolTipText = AppLocalizer.Get("Tip.DbAutoRefresh");
            }

            if (_menuCalendarWeekly != null)
                _menuCalendarWeekly.Text = AppLocalizer.Get("Menu.CalendarWeekly");
            if (_menuCalendarMonthly != null)
                _menuCalendarMonthly.Text = AppLocalizer.Get("Menu.CalendarMonthly");
            if (_menuCalendarYearly != null)
                _menuCalendarYearly.Text = AppLocalizer.Get("Menu.CalendarYearly");

            if (_btnCalendarWeekly != null)
                _btnCalendarWeekly.Text = AppLocalizer.Get("Calendar.Weekly");
            if (_btnCalendarMonthly != null)
                _btnCalendarMonthly.Text = AppLocalizer.Get("Calendar.Monthly");
            if (_btnCalendarYearly != null)
                _btnCalendarYearly.Text = AppLocalizer.Get("Calendar.Yearly");
        }

        private void UpdateTodayStatusLabel()
        {
            lblDateToday.Text = AppLocalizer.Format("Status.Today", DateTime.Today.ToString("yyyy-MM-dd"));
        }

        private void OnPreferences()
        {
            using var dlg = new PreferencesDialog();
            dlg.ShowDialog(this);
        }
    }
}
