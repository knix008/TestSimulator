using CommunityToolkit.Mvvm.ComponentModel;
using PDFEditor.Core.Models;

namespace PDFEditor.App.ViewModels;

public partial class TextElementViewModel : ObservableObject
{
    private readonly TextElement _model;
    private readonly double _pageHeight;
    private readonly double _scale;
    private readonly Action _onUpdated;

    public TextElementViewModel(TextElement model, double pageHeight, double scale, Action onUpdated)
    {
        _model = model;
        _pageHeight = pageHeight;
        _scale = scale;
        _onUpdated = onUpdated;
        _text = model.Text;
    }

    public string Id => _model.Id;

    public string? FontName => _model.FontName;

    public double FontSize => _model.FontSize;

    public double DisplayLeft => _model.Bounds.Left * _scale;

    public double DisplayTop => (_pageHeight - _model.Bounds.Top) * _scale;

    public double DisplayWidth => _model.Bounds.Width * _scale;

    public double DisplayHeight => _model.Bounds.Height * _scale;

    [ObservableProperty]
    private string _text;

    [ObservableProperty]
    private bool _isSelected;

    partial void OnTextChanged(string value)
    {
        _model.Text = value;
        _onUpdated();
    }
}
