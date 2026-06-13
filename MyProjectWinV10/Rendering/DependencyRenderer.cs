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

        public void DrawDependencies(Graphics g, IEnumerable<TaskDependency> dependencies,
            IEnumerable<ProjectTask> visibleTasks, Func<int, int> getRowY)
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

                DrawArrow(g, dep, pred, succ, predRowY, succRowY);
            }
        }

        public void DrawPreview(Graphics g, DependencyType type, ProjectTask pred, ProjectTask succ, int predRowY, int succRowY)
        {
            int predCenterY = predRowY + AppTheme.RowHeight / 2;
            int succCenterY = succRowY + AppTheme.RowHeight / 2;

            int fromX = type switch
            {
                DependencyType.SS or DependencyType.SF => _viewport.DateToX(pred.StartDate),
                _ => _viewport.DateToX(pred.EndDate.AddDays(1))
            };
            int fromY = predCenterY;

            int toX = type switch
            {
                DependencyType.FF or DependencyType.SF => _viewport.DateToX(succ.EndDate.AddDays(1)),
                _ => _viewport.DateToX(succ.StartDate)
            };
            int toY = succCenterY;

            var pts = DependencyLineGeometry.BuildPath(type, fromX, fromY, toX, toY);
            DependencyLineGeometry.DrawSilhouettePath(g, AppTheme.DependencyLinePreview, pts);
        }

        private void DrawArrow(Graphics g, TaskDependency dep, ProjectTask pred, ProjectTask succ, int predRowY, int succRowY)
        {
            Color lineColor = (pred.IsCritical && succ.IsCritical)
                ? AppTheme.DependencyLineCritical
                : AppTheme.DependencyLine;

            int predCenterY = predRowY + AppTheme.RowHeight / 2;
            int succCenterY = succRowY + AppTheme.RowHeight / 2;

            int fromX = dep.Type switch
            {
                DependencyType.SS or DependencyType.SF => _viewport.DateToX(pred.StartDate),
                _ => _viewport.DateToX(pred.EndDate.AddDays(1))
            };
            int fromY = predCenterY;

            int toX = dep.Type switch
            {
                DependencyType.FF or DependencyType.SF => _viewport.DateToX(succ.EndDate.AddDays(1)),
                _ => _viewport.DateToX(succ.StartDate)
            };
            int toY = succCenterY;

            var pts = DependencyLineGeometry.BuildPath(dep.Type, fromX, fromY, toX, toY);
            DependencyLineGeometry.DrawPath(g, lineColor, pts);
        }
    }
}
