using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using MyMindWin.ViewModels;

namespace MyMindWin
{
    public partial class MainWindow : Window
    {
        private readonly MainViewModel _vm;

        public MainWindow()
        {
            InitializeComponent();
            _vm = new MainViewModel();
            DataContext = _vm;

            MindMapCanvas.SetViewModel(_vm);

            // Keyboard shortcuts
            PreviewKeyDown += MainWindow_PreviewKeyDown;

            Loaded += (_, _) =>
            {
                if (!string.IsNullOrEmpty(App.StartupFilePath))
                {
                    _vm.OpenFile(App.StartupFilePath);
                    App.ClearStartupFilePath();
                }
                MindMapCanvas.FitToView();
                MindMapCanvas.Focus();
            };
        }

        // ── Tree ↔ Canvas sync ────────────────────────────────────────────

        private bool _suppressTreeSync;

        private void StructureTree_SelectedItemChanged(object sender, RoutedPropertyChangedEventArgs<object> e)
        {
            if (_suppressTreeSync) return;
            if (e.NewValue is NodeViewModel vm)
            {
                _suppressTreeSync = true;
                _vm.SelectedNode = vm;
                _suppressTreeSync = false;

                // Highlight in canvas - canvas reacts to SelectedNode change
                MindMapCanvas.Focus();
            }
        }

        // ── Keyboard shortcuts ────────────────────────────────────────────

        private void MainWindow_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.N && Keyboard.Modifiers == ModifierKeys.Control)
            {
                _vm.NewDocumentCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.O && Keyboard.Modifiers == ModifierKeys.Control)
            {
                _vm.OpenCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.S && Keyboard.Modifiers == ModifierKeys.Control &&
                     Keyboard.Modifiers != ModifierKeys.Shift)
            {
                _vm.SaveCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.S &&
                     Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
            {
                _vm.SaveAsCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.F5)
            {
                _vm.AutoLayoutCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.F4)
            {
                _vm.ResetViewCommand.Execute(null);
                e.Handled = true;
            }
        }
    }
}
