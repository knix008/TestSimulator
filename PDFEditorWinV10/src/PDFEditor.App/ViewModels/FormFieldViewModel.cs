using CommunityToolkit.Mvvm.ComponentModel;
using PDFEditor.Core.Models;

namespace PDFEditor.App.ViewModels;

public partial class FormFieldViewModel : ObservableObject
{
    private readonly FormFieldModel _model;
    private readonly double _pageHeight;
    private readonly double _scale;
    private readonly Action _onUpdated;

    public FormFieldViewModel(FormFieldModel model, double pageHeight, double scale, Action onUpdated)
    {
        _model = model;
        _pageHeight = pageHeight;
        _scale = scale;
        _onUpdated = onUpdated;
        _value = model.Value ?? string.Empty;
        _isChecked = model.IsChecked ?? false;
    }

    public string Id => _model.Id;

    public string Name => _model.Name;

    public string FieldType => _model.FieldType;

    public bool IsCheckbox => _model.IsCheckbox;

    public bool HasBounds => _model.Bounds is not null && _model.Bounds.Width > 0;

    public double DisplayLeft => (_model.Bounds?.Left ?? 0) * _scale;

    public double DisplayTop => (_pageHeight - (_model.Bounds?.Top ?? 0)) * _scale;

    public double DisplayWidth => (_model.Bounds?.Width ?? 0) * _scale;

    public double DisplayHeight => (_model.Bounds?.Height ?? 0) * _scale;

    [ObservableProperty]
    private string _value;

    [ObservableProperty]
    private bool _isChecked;

    [ObservableProperty]
    private bool _isSelected;

    partial void OnValueChanged(string value)
    {
        _model.Value = value;
        _onUpdated();
    }

    partial void OnIsCheckedChanged(bool value)
    {
        _model.IsChecked = value;
        _onUpdated();
    }
}
