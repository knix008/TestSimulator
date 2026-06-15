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
        /// <summary>Decoration at the predecessor (line start) connection point.</summary>
        public DependencyLineEnd StartLineEnd { get; set; } = DependencyLineEnd.None;
        /// <summary>Decoration at the successor (line end) connection point.</summary>
        public DependencyLineEnd EndLineEnd { get; set; } = DependencyLineEnd.Arrow;
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
        private Color _bandColor = Color.Empty;
        private bool _autoSchedule = true;
        private string _deliverable = "";

        public int Id { get; set; }
        public int ParentId { get; set; } = -1;

        public string Name
        {
            get => _name;
            set
            {
                if (_name == value) return;
                _name = value;
                OnPropertyChanged(nameof(Name));
            }
        }

        public DateTime StartDate
        {
            get => _startDate;
            set
            {
                if (_startDate == value) return;
                _startDate = value;
                OnPropertyChanged(nameof(StartDate));
                OnPropertyChanged(nameof(EndDate));
            }
        }

        public int DurationDays
        {
            get => _durationDays;
            set
            {
                int clamped = Math.Max(1, value);
                if (_durationDays == clamped) return;
                _durationDays = clamped;
                OnPropertyChanged(nameof(DurationDays));
                OnPropertyChanged(nameof(EndDate));
            }
        }

        public DateTime EndDate
        {
            get
            {
                if (_taskType == TaskType.Milestone)
                    return _startDate.Date;

                return _endDateResolver?.Invoke(this)
                    ?? _startDate.AddDays(Math.Max(1, _durationDays) - 1);
            }
        }

        private static Func<ProjectTask, DateTime>? _endDateResolver;

        public static void SetEndDateResolver(Func<ProjectTask, DateTime>? resolver) =>
            _endDateResolver = resolver;

        public double Progress
        {
            get => _progress;
            set
            {
                double clamped = Math.Clamp(value, 0.0, 100.0);
                if (_progress == clamped) return;
                _progress = clamped;
                OnPropertyChanged(nameof(Progress));
            }
        }

        public TaskType TaskType
        {
            get => _taskType;
            set
            {
                if (_taskType == value) return;
                _taskType = value;
                OnPropertyChanged(nameof(TaskType));
            }
        }

        public int IndentLevel
        {
            get => _indentLevel;
            set
            {
                int clamped = Math.Max(0, value);
                if (_indentLevel == clamped) return;
                _indentLevel = clamped;
                OnPropertyChanged(nameof(IndentLevel));
            }
        }

        public bool IsExpanded
        {
            get => _isExpanded;
            set
            {
                if (_isExpanded == value) return;
                _isExpanded = value;
                OnPropertyChanged(nameof(IsExpanded));
            }
        }

        public bool IsVisible { get; set; } = true;

        public string AssignedTo
        {
            get => _assignedTo;
            set
            {
                if (_assignedTo == value) return;
                _assignedTo = value;
                OnPropertyChanged(nameof(AssignedTo));
            }
        }

        public string Notes
        {
            get => _notes;
            set
            {
                if (_notes == value) return;
                _notes = value;
                OnPropertyChanged(nameof(Notes));
            }
        }

        public Color BarColor
        {
            get => _barColor;
            set
            {
                if (_barColor == value) return;
                _barColor = value;
                OnPropertyChanged(nameof(BarColor));
            }
        }

        public Color ProgressColor
        {
            get => _progressColor;
            set
            {
                if (_progressColor == value) return;
                _progressColor = value;
                OnPropertyChanged(nameof(ProgressColor));
            }
        }

        /// <summary>Optional explicit row-band color in the task grid. Only effective on root tasks (ParentId == -1).</summary>
        public Color BandColor
        {
            get => _bandColor;
            set
            {
                if (_bandColor == value) return;
                _bandColor = value;
                OnPropertyChanged(nameof(BandColor));
            }
        }

        public bool AutoSchedule
        {
            get => _autoSchedule;
            set
            {
                if (_autoSchedule == value) return;
                _autoSchedule = value;
                OnPropertyChanged(nameof(AutoSchedule));
            }
        }

        public string Deliverable
        {
            get => _deliverable;
            set
            {
                if (_deliverable == value) return;
                _deliverable = value;
                OnPropertyChanged(nameof(Deliverable));
            }
        }

        public bool IsCritical { get; set; } = false;

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged(string name) =>
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
