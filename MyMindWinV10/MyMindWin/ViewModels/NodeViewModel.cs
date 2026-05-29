using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    public class NodeViewModel : INotifyPropertyChanged
    {
        private double _x, _y;
        private double _targetX, _targetY;
        private bool _isSelected;
        private bool _isExpanded;
        private string _text;

        public MindMapNode Model { get; }
        public NodeViewModel? Parent { get; set; }
        public ObservableCollection<NodeViewModel> Children { get; } = [];
        public int Level { get; set; }
        public int BranchColorIndex { get; set; } = 0;

        public double X
        {
            get => _x;
            set { _x = value; OnPropertyChanged(); OnPropertyChanged(nameof(CenterX)); OnPropertyChanged(nameof(RightX)); }
        }

        public double Y
        {
            get => _y;
            set { _y = value; OnPropertyChanged(); OnPropertyChanged(nameof(CenterY)); }
        }

        public double TargetX { get => _targetX; set { _targetX = value; OnPropertyChanged(); } }
        public double TargetY { get => _targetY; set { _targetY = value; OnPropertyChanged(); } }

        public double Width { get; set; } = 120;
        public double Height { get; set; } = 36;

        public double CenterX => X + Width / 2;
        public double CenterY => Y + Height / 2;
        public double RightX => X + Width;
        public double LeftX => X;

        public bool IsSelected
        {
            get => _isSelected;
            set { _isSelected = value; OnPropertyChanged(); }
        }

        public bool IsExpanded
        {
            get => _isExpanded;
            set
            {
                _isExpanded = value;
                Model.IsExpanded = value;
                OnPropertyChanged();
            }
        }

        public string Text
        {
            get => _text;
            set
            {
                _text = value;
                Model.Text = value;
                OnPropertyChanged();
            }
        }

        public NodeViewModel(MindMapNode model, NodeViewModel? parent = null, int level = 0)
        {
            Model = model;
            Parent = parent;
            Level = level;
            _text = model.Text;
            _isExpanded = model.IsExpanded;
        }

        public IEnumerable<NodeViewModel> GetAllDescendants()
        {
            yield return this;
            foreach (var child in Children)
                foreach (var desc in child.GetAllDescendants())
                    yield return desc;
        }

        public IEnumerable<NodeViewModel> GetVisibleDescendants()
        {
            yield return this;
            if (!IsExpanded) yield break;
            foreach (var child in Children)
                foreach (var desc in child.GetVisibleDescendants())
                    yield return desc;
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? name = null)
            => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
