using CommunityToolkit.Mvvm.ComponentModel;
using PDFEditor.Core.Models;

namespace PDFEditor.App.ViewModels;

public partial class AnnotationElementViewModel : ObservableObject
{
    private readonly AnnotationModel _model;
    private readonly double _pageHeight;
    private readonly double _scale;
    private readonly Action _onUpdated;

    public AnnotationElementViewModel(AnnotationModel model, double pageHeight, double scale, Action onUpdated)
    {
        _model = model;
        _pageHeight = pageHeight;
        _scale = scale;
        _onUpdated = onUpdated;
        _contents = model.Contents ?? string.Empty;
        _subject = model.Subject ?? string.Empty;
    }

    public string Id => _model.Id;

    public string Subtype => _model.Subtype;

    public double DisplayLeft => _model.Bounds.Left * _scale;

    public double DisplayTop => (_pageHeight - _model.Bounds.Top) * _scale;

    public double DisplayWidth => _model.Bounds.Width * _scale;

    public double DisplayHeight => _model.Bounds.Height * _scale;

    [ObservableProperty]
    private string _contents;

    [ObservableProperty]
    private string _subject;

    [ObservableProperty]
    private bool _isSelected;

    partial void OnContentsChanged(string value)
    {
        _model.Contents = value;
        _onUpdated();
    }

    partial void OnSubjectChanged(string value)
    {
        _model.Subject = value;
        _onUpdated();
    }
}
