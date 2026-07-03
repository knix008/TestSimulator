using CommunityToolkit.Mvvm.ComponentModel;
using PDFEditor.Core.Models;

namespace PDFEditor.App.ViewModels;

public partial class ImageElementViewModel : ObservableObject
{
    private readonly ImageElementModel _model;
    private readonly double _pageHeight;
    private readonly double _scale;
    private readonly Action _onUpdated;

    public ImageElementViewModel(ImageElementModel model, double pageHeight, double scale, Action onUpdated)
    {
        _model = model;
        _pageHeight = pageHeight;
        _scale = scale;
        _onUpdated = onUpdated;
        _width = model.Bounds.Width;
        _height = model.Bounds.Height;
        _replacementPath = model.ReplacementImagePath ?? string.Empty;
    }

    public string Id => _model.Id;

    public string XObjectName => _model.XObjectName;

    public double DisplayLeft => _model.Bounds.Left * _scale;

    public double DisplayTop => (_pageHeight - _model.Bounds.Top) * _scale;

    public double DisplayWidth => _model.Bounds.Width * _scale;

    public double DisplayHeight => _model.Bounds.Height * _scale;

    [ObservableProperty]
    private double _width;

    [ObservableProperty]
    private double _height;

    [ObservableProperty]
    private string _replacementPath;

    [ObservableProperty]
    private bool _isSelected;

    partial void OnWidthChanged(double value)
    {
        if (value <= 0)
        {
            return;
        }

        _model.Bounds.SetSize(value, _model.Bounds.Height);
        OnPropertyChanged(nameof(DisplayWidth));
        _onUpdated();
    }

    partial void OnHeightChanged(double value)
    {
        if (value <= 0)
        {
            return;
        }

        _model.Bounds.SetSize(_model.Bounds.Width, value);
        OnPropertyChanged(nameof(DisplayHeight));
        _onUpdated();
    }

    partial void OnReplacementPathChanged(string value)
    {
        _model.ReplacementImagePath = string.IsNullOrWhiteSpace(value) ? null : value;
        _onUpdated();
    }

    public void SetReplacementFile(string path)
    {
        ReplacementPath = path;
    }

    public void NotifyDisplayChanged()
    {
        OnPropertyChanged(nameof(DisplayLeft));
        OnPropertyChanged(nameof(DisplayTop));
        OnPropertyChanged(nameof(DisplayWidth));
        OnPropertyChanged(nameof(DisplayHeight));
    }
}
