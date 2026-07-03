using System.Windows;
using System.Windows.Input;
using PDFEditor.App.ViewModels;

namespace PDFEditor.App;

public partial class MainWindow : Window
{
    public MainWindow(MainViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }

    private void TextOverlay_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement element && element.DataContext is TextElementViewModel textElement)
        {
            if (DataContext is MainViewModel viewModel)
            {
                viewModel.SelectTextElement(textElement);
            }
        }

        e.Handled = true;
    }

    private void ImageOverlay_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement element && element.DataContext is ImageElementViewModel imageElement)
        {
            if (DataContext is MainViewModel viewModel)
            {
                viewModel.SelectImageElement(imageElement);
            }
        }

        e.Handled = true;
    }

    private void AnnotationOverlay_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement element && element.DataContext is AnnotationElementViewModel annotationElement)
        {
            if (DataContext is MainViewModel viewModel)
            {
                viewModel.SelectAnnotationElement(annotationElement);
            }
        }

        e.Handled = true;
    }

    private void FormFieldOverlay_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement element && element.DataContext is FormFieldViewModel formField)
        {
            if (DataContext is MainViewModel viewModel)
            {
                viewModel.SelectFormField(formField);
            }
        }

        e.Handled = true;
    }
}
