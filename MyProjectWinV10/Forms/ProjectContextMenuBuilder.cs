using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public sealed class ProjectContextMenuBuilder
    {
        public required Action AddTask { get; init; }
        public required Action<int> AddSubtask { get; init; }
        public required Action<int> OpenTaskProperties { get; init; }
        public required Action<int> DeleteTask { get; init; }
        public required Action<int> IndentTask { get; init; }
        public required Action<int> OutdentTask { get; init; }
        public required Action<int> LinkFromTask { get; init; }
        public required Action<int> ToggleExpandTask { get; init; }
        public required Action ZoomIn { get; init; }
        public required Action ZoomOut { get; init; }
        public required Action GoToToday { get; init; }
        public Action? RenameProject { get; init; }

        public ContextMenuStrip Build(ContextMenuTarget target, int taskId, ProjectModel? model)
        {
            var menu = new ContextMenuStrip
            {
                Renderer = new DarkMenuRenderer(),
                ImageScalingSize = new Size(16, 16)
            };

            switch (target)
            {
                case ContextMenuTarget.TaskGridTask:
                    BuildTaskGridTaskMenu(menu, taskId, model);
                    break;
                case ContextMenuTarget.TaskGridEmpty:
                    BuildTaskGridEmptyMenu(menu);
                    break;
                case ContextMenuTarget.TaskGridProjectHeader:
                    BuildTaskGridProjectHeaderMenu(menu);
                    break;
                case ContextMenuTarget.TaskGridHeader:
                    BuildTaskGridHeaderMenu(menu);
                    break;
                case ContextMenuTarget.GanttTask:
                    BuildGanttTaskMenu(menu, taskId, model);
                    break;
                case ContextMenuTarget.GanttEmpty:
                    BuildGanttEmptyMenu(menu);
                    break;
                case ContextMenuTarget.GanttHeader:
                    BuildGanttHeaderMenu(menu);
                    break;
            }

            return menu;
        }

        private void BuildTaskGridTaskMenu(ContextMenuStrip menu, int taskId, ProjectModel? model)
        {
            var task = model?.GetTask(taskId);
            string taskLabel = task != null ? $"\"{task.Name}\"" : "Task";

            AddItem(menu, "Task Properties...", AppIcons.Properties, () => OpenTaskProperties(taskId));
            menu.Items.Add(new ToolStripSeparator());
            AddItem(menu, "Add Task", AppIcons.AddTask, AddTask);
            if (task != null)
                AddItem(menu, "Add Subtask", AppIcons.Indent, () => AddSubtask(taskId));
            AddItem(menu, "Delete Task", AppIcons.Delete, () => DeleteTask(taskId));
            menu.Items.Add(new ToolStripSeparator());
            AddItem(menu, "Indent Task", AppIcons.Indent, () => IndentTask(taskId));
            AddItem(menu, "Outdent Task", AppIcons.Outdent, () => OutdentTask(taskId));
            AddItem(menu, "Link Tasks", AppIcons.Link, () => LinkFromTask(taskId));

            if (task != null && model != null && model.HasChildren(taskId))
            {
                menu.Items.Add(new ToolStripSeparator());
                string expandText = task.IsExpanded ? "Collapse Subtasks" : "Expand Subtasks";
                AddItem(menu, expandText, AppIcons.View, () => ToggleExpandTask(taskId));
            }
        }

        private void BuildTaskGridEmptyMenu(ContextMenuStrip menu)
        {
            AddItem(menu, "Add Task", AppIcons.AddTask, AddTask);
            menu.Items.Add(new ToolStripSeparator());
            AddItem(menu, "Zoom In", AppIcons.ZoomIn, ZoomIn);
            AddItem(menu, "Zoom Out", AppIcons.ZoomOut, ZoomOut);
            AddItem(menu, "Go to Today", AppIcons.Today, GoToToday);
        }

        private void BuildTaskGridProjectHeaderMenu(ContextMenuStrip menu)
        {
            if (RenameProject != null)
                AddItem(menu, "Rename Project...", AppIcons.Properties, RenameProject);
            menu.Items.Add(new ToolStripSeparator());
            AddItem(menu, "Add Task", AppIcons.AddTask, AddTask);
            menu.Items.Add(new ToolStripSeparator());
            AddItem(menu, "Go to Today", AppIcons.Today, GoToToday);
        }

        private void BuildTaskGridHeaderMenu(ContextMenuStrip menu)
        {
            AddItem(menu, "Add Task", AppIcons.AddTask, AddTask);
            menu.Items.Add(new ToolStripSeparator());
            AddItem(menu, "Go to Today", AppIcons.Today, GoToToday);
        }

        private void BuildGanttTaskMenu(ContextMenuStrip menu, int taskId, ProjectModel? model)
        {
            var task = model?.GetTask(taskId);

            AddItem(menu, "Task Properties...", AppIcons.Properties, () => OpenTaskProperties(taskId));
            menu.Items.Add(new ToolStripSeparator());
            AddItem(menu, "Add Task", AppIcons.AddTask, AddTask);
            if (task != null)
                AddItem(menu, "Add Subtask", AppIcons.Indent, () => AddSubtask(taskId));
            AddItem(menu, "Delete Task", AppIcons.Delete, () => DeleteTask(taskId));
            menu.Items.Add(new ToolStripSeparator());
            AddItem(menu, "Indent Task", AppIcons.Indent, () => IndentTask(taskId));
            AddItem(menu, "Outdent Task", AppIcons.Outdent, () => OutdentTask(taskId));
            AddItem(menu, "Link Tasks", AppIcons.Link, () => LinkFromTask(taskId));

            if (task != null && model != null && model.HasChildren(taskId))
            {
                menu.Items.Add(new ToolStripSeparator());
                string expandText = task.IsExpanded ? "Collapse Subtasks" : "Expand Subtasks";
                AddItem(menu, expandText, AppIcons.View, () => ToggleExpandTask(taskId));
            }

            if (task != null)
            {
                menu.Items.Add(new ToolStripSeparator());
                AddItem(menu, "Go to Today", AppIcons.Today, GoToToday);
            }
        }

        private void BuildGanttEmptyMenu(ContextMenuStrip menu)
        {
            AddItem(menu, "Add Task", AppIcons.AddTask, AddTask);
            menu.Items.Add(new ToolStripSeparator());
            AddItem(menu, "Zoom In", AppIcons.ZoomIn, ZoomIn);
            AddItem(menu, "Zoom Out", AppIcons.ZoomOut, ZoomOut);
            AddItem(menu, "Go to Today", AppIcons.Today, GoToToday);
        }

        private void BuildGanttHeaderMenu(ContextMenuStrip menu)
        {
            AddItem(menu, "Zoom In", AppIcons.ZoomIn, ZoomIn);
            AddItem(menu, "Zoom Out", AppIcons.ZoomOut, ZoomOut);
            AddItem(menu, "Go to Today", AppIcons.Today, GoToToday);
        }

        private static void AddItem(ContextMenuStrip menu, string text, Image? image, Action action)
        {
            var item = new ToolStripMenuItem(text, image);
            item.Click += (_, _) => RunMenuAction(menu, action);
            menu.Items.Add(item);
        }

        private static void RunMenuAction(ContextMenuStrip menu, Action action) => action();
    }
}
