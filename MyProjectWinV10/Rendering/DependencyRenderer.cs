using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Rendering
{
    public class DependencyRenderer
    {
        private readonly GanttViewport _viewport;

        public DependencyRenderer(GanttViewport viewport, TaskBarRenderer barRenderer)
        {
            _viewport = viewport;
        }

        public void DrawDependencies(
            Graphics g,
            IEnumerable<TaskDependency> dependencies,
            IEnumerable<ProjectTask> visibleTasks,
            Func<int, int> getRowY,
            bool showCriticalPath,
            Func<TaskDependency, bool>? isCriticalDependency = null)
        {
            var taskList = visibleTasks.ToList();
            var taskMap = taskList.ToDictionary(t => t.Id);
            var rowMap = taskList.ToDictionary(t => t.Id, t => getRowY(t.Id));

            foreach (var dep in dependencies)
            {
                if (!taskMap.TryGetValue(dep.PredecessorId, out var pred)) continue;
                if (!taskMap.TryGetValue(dep.SuccessorId, out var succ)) continue;
                if (!pred.IsVisible || !succ.IsVisible) continue;

                int predRowY = rowMap[pred.Id];
                int succRowY = rowMap[succ.Id];
                bool isCritical = showCriticalPath && isCriticalDependency?.Invoke(dep) == true;

                DrawArrow(g, dep, pred, succ, predRowY, succRowY, isCritical);
            }
        }

        public void DrawPreview(Graphics g, DependencyType type, ProjectTask pred, ProjectTask succ, int predRowY, int succRowY)
        {
            GetConnectionPoints(type, pred, succ, predRowY, succRowY, out int fromX, out int fromY, out int toX, out int toY);
            var pts = DependencyLineGeometry.BuildPath(type, fromX, fromY, toX, toY);
            DependencyLineGeometry.DrawSilhouettePath(g, AppTheme.DependencyLinePreview, pts);
        }

        public void DrawPreviewToPoint(Graphics g, DependencyType type, ProjectTask pred, int predRowY, int toX, int toY)
        {
            GetFromPoint(type, pred, predRowY, out int fromX, out int fromY);
            var pts = DependencyLineGeometry.BuildPath(type, fromX, fromY, toX, toY);
            DependencyLineGeometry.DrawSilhouettePath(g, AppTheme.DependencyLinePreview, pts);
        }

        private void GetConnectionPoints(
            DependencyType type,
            ProjectTask pred,
            ProjectTask succ,
            int predRowY,
            int succRowY,
            out int fromX,
            out int fromY,
            out int toX,
            out int toY)
        {
            GetFromPoint(type, pred, predRowY, out fromX, out fromY);
            GetToPoint(type, succ, succRowY, out toX, out toY);
        }

        private void GetFromPoint(DependencyType type, ProjectTask pred, int predRowY, out int fromX, out int fromY)
        {
            fromY = predRowY + AppTheme.RowHeight / 2;
            fromX = type switch
            {
                DependencyType.SS or DependencyType.SF => _viewport.DateToX(pred.StartDate),
                _ => _viewport.DateToX(pred.EndDate.AddDays(1))
            };
        }

        private void GetToPoint(DependencyType type, ProjectTask succ, int succRowY, out int toX, out int toY)
        {
            toY = succRowY + AppTheme.RowHeight / 2;
            toX = type switch
            {
                DependencyType.FF or DependencyType.SF => _viewport.DateToX(succ.EndDate.AddDays(1)),
                _ => _viewport.DateToX(succ.StartDate)
            };
        }

        private void DrawArrow(
            Graphics g,
            TaskDependency dep,
            ProjectTask pred,
            ProjectTask succ,
            int predRowY,
            int succRowY,
            bool isCritical)
        {
            Color lineColor = isCritical
                ? AppTheme.DependencyLineCritical
                : AppTheme.DependencyLine;

            GetConnectionPoints(dep.Type, pred, succ, predRowY, succRowY, out int fromX, out int fromY, out int toX, out int toY);
            var pts = DependencyLineGeometry.BuildPath(dep.Type, fromX, fromY, toX, toY);
            DependencyLineGeometry.DrawPath(g, lineColor, pts);
        }
    }
}
