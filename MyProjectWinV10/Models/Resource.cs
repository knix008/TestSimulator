using System.ComponentModel;

namespace MyProject.Models
{
    public class ResourceAssignment : INotifyPropertyChanged
    {
        private string _resourceName = "";
        private double _allocationPercent = 100.0;

        public int TaskId { get; set; }

        public string ResourceName
        {
            get => _resourceName;
            set { _resourceName = value; OnPropertyChanged(nameof(ResourceName)); }
        }

        public double AllocationPercent
        {
            get => _allocationPercent;
            set { _allocationPercent = Math.Max(0, value); OnPropertyChanged(nameof(AllocationPercent)); }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged(string name) =>
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
