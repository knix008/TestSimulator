using System.ComponentModel;

namespace MyProject.Models
{
    public enum TaskType { Normal, Milestone, Summary }
    public enum DependencyType { FS, FF, SS, SF }

    public class TaskDependency
    {
        public int PredecessorId { get; set; }
        public int SuccessorId { get; set; }
        public DependencyType Type { get; set; } = DependencyType.FS;
        public int LagDays { get; set; } = 0;
    }

    public class ProjectTask : INotifyPropertyChanged
    {
        private string _name = "New Task";
        private DateTime _startDate = DateTime.Today;
        private int _durationDays = 5;
        private double _progress = 0.0;
        private TaskType _taskType = TaskType.Normal;
        private int _indentLevel = 0;
        private bool _isExpanded = true;
        private string _assignedTo = "";
        private string _notes = "";
        private Color _barColor = Color.Empty;
        private Color _progressColor = Color.Empty;
        private bool _autoSchedule = true;
        private string _deliverable = "";

        public int Id { get; set; }
        public int ParentId { get; set; } = -1;

        public string Name
        {
            get => _name;
            set { _name = value; OnPropertyChanged(nameof(Name)); }
        }

        public DateTime StartDate
        {
            get => _startDate;
            set { _startDate = value; OnPropertyChanged(nameof(StartDate)); OnPropertyChanged(nameof(EndDate)); }
        }

        public int DurationDays
        {
            get => _durationDays;
            set { _durationDays = Math.Max(1, value); OnPropertyChanged(nameof(DurationDays)); OnPropertyChanged(nameof(EndDate)); }
        }

        public DateTime EndDate => _taskType == TaskType.Milestone
            ? _startDate
            : _startDate.AddDays(_durationDays - 1);

        public double Progress
        {
            get => _progress;
            set { _progress = Math.Clamp(value, 0.0, 100.0); OnPropertyChanged(nameof(Progress)); }
        }

        public TaskType TaskType
        {
            get => _taskType;
            set { _taskType = value; OnPropertyChanged(nameof(TaskType)); }
        }

        public int IndentLevel
        {
            get => _indentLevel;
            set { _indentLevel = Math.Max(0, value); OnPropertyChanged(nameof(IndentLevel)); }
        }

        public bool IsExpanded
        {
            get => _isExpanded;
            set { _isExpanded = value; OnPropertyChanged(nameof(IsExpanded)); }
        }

        public bool IsVisible { get; set; } = true;

        public string AssignedTo
        {
            get => _assignedTo;
            set { _assignedTo = value; OnPropertyChanged(nameof(AssignedTo)); }
        }

        public string Notes
        {
            get => _notes;
            set { _notes = value; OnPropertyChanged(nameof(Notes)); }
        }

        public Color BarColor
        {
            get => _barColor;
            set { _barColor = value; OnPropertyChanged(nameof(BarColor)); }
        }

        public Color ProgressColor
        {
            get => _progressColor;
            set { _progressColor = value; OnPropertyChanged(nameof(ProgressColor)); }
        }

        public bool AutoSchedule
        {
            get => _autoSchedule;
            set { _autoSchedule = value; OnPropertyChanged(nameof(AutoSchedule)); }
        }

        public string Deliverable
        {
            get => _deliverable;
            set { _deliverable = value; OnPropertyChanged(nameof(Deliverable)); }
        }

        public bool IsCritical { get; set; } = false;

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged(string name) =>
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
