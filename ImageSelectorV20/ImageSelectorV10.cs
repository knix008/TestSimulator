using System.Drawing.Imaging;
using System.Globalization;

namespace ImageSelectorV10;

public partial class ImageSelectorV10 : Form
{
    private const string BaseTitle = "ImageSelector V1.0";

    private sealed record ShapeOption(string Text, SelectionShape Shape)
    {
        public override string ToString() => Text;
    }

    public ImageSelectorV10()
    {
        InitializeComponent();
        KeyPreview = true;
        KeyDown += ImageSelectorV10_KeyDown;
        imageEditorPanel.ZoomFactorChanged += (_, z) => UpdateZoomLabel(z);
        imageEditorPanel.SelectionChanged += imageEditorPanel_SelectionChanged;
        InitializeShapeSelector();
        UpdateZoomLabel(imageEditorPanel.ZoomFactor);
    }

    private void ImageSelectorV10_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Control || e.Alt) return;
        if (e.KeyCode is not (Keys.Left or Keys.Right or Keys.Up or Keys.Down))
            return;
        if (ActiveControl is TextBoxBase)
            return;
        if (!imageEditorPanel.HasSelection) return;

        int step = e.Shift ? 10 : 1;
        switch (e.KeyCode)
        {
            case Keys.Left:
                imageEditorPanel.MoveSelectionByPixels(-step, 0);
                break;
            case Keys.Right:
                imageEditorPanel.MoveSelectionByPixels(step, 0);
                break;
            case Keys.Up:
                imageEditorPanel.MoveSelectionByPixels(0, -step);
                break;
            case Keys.Down:
                imageEditorPanel.MoveSelectionByPixels(0, step);
                break;
            default:
                return;
        }

        e.Handled = true;
        e.SuppressKeyPress = true;
    }

    private bool _syncingSelectionSizeUi;

    private void imageEditorPanel_SelectionChanged(object? sender, EventArgs e)
    {
        if (_syncingSelectionSizeUi) return;
        _syncingSelectionSizeUi = true;
        try
        {
            if (!imageEditorPanel.HasSelection) return;
            var sz = imageEditorPanel.SelectionSizePixels;
            txtSelectionWidth.Text = sz.Width.ToString();
            txtSelectionHeight.Text = sz.Height.ToString();
        }
        finally
        {
            _syncingSelectionSizeUi = false;
        }
    }

    private void btnApplySelectionSize_Click(object? sender, EventArgs e) => TryApplySelectionSizeFromInputs();

    private void InitializeShapeSelector()
    {
        var items = new[]
        {
            new ShapeOption("원형", SelectionShape.Circle),
            new ShapeOption("타원", SelectionShape.Ellipse),
            new ShapeOption("정사각형", SelectionShape.Square),
            new ShapeOption("직사각형", SelectionShape.Rectangle),
            new ShapeOption("둥근 정사각형", SelectionShape.RoundedSquare),
            new ShapeOption("둥근 직사각형", SelectionShape.RoundedRectangle),
        };
        cmbSelectionShape.Items.AddRange(items);
        cmbSelectionShape.SelectedIndex = 0;
    }

    private void cmbSelectionShape_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (cmbSelectionShape.SelectedItem is not ShapeOption item) return;
        imageEditorPanel.SelectionShape = item.Shape;
    }

    private void SelectionSizeTextBox_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter)
        {
            e.SuppressKeyPress = true;
            TryApplySelectionSizeFromInputs();
        }
    }

    private void TryApplySelectionSizeFromInputs()
    {
        if (!int.TryParse(txtSelectionWidth.Text.Trim(), NumberStyles.Integer, CultureInfo.CurrentCulture, out var w) ||
            !int.TryParse(txtSelectionHeight.Text.Trim(), NumberStyles.Integer, CultureInfo.CurrentCulture, out var h) ||
            w < 1 || h < 1)
        {
            MessageBox.Show(this, "가로·세로는 1 이상의 정수로 입력하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        imageEditorPanel.SetSelectionSizePixels(w, h);
    }

    private void UpdateZoomLabel(float zoom)
    {
        lblZoomValue.Text = $"{zoom * 100f:0.#}%";
        Text = $"{BaseTitle} ({lblZoomValue.Text})";
    }

    private void btnOpen_Click(object? sender, EventArgs e)
    {
        using var dlg = new OpenFileDialog
        {
            Title = "이미지 열기",
            Filter = "이미지 파일|*.png;*.jpg;*.jpeg;*.bmp;*.gif;*.tif;*.tiff;*.webp|모든 파일|*.*"
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            imageEditorPanel.LoadFromFile(dlg.FileName);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"이미지를 열 수 없습니다.\n{ex.Message}", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void btnZoomIn_Click(object? sender, EventArgs e) => imageEditorPanel.ZoomInAtCenter();

    private void btnZoomOut_Click(object? sender, EventArgs e) => imageEditorPanel.ZoomOutAtCenter();

    private void btnSaveSelection_Click(object? sender, EventArgs e)
    {
        if (!imageEditorPanel.HasSelection)
        {
            MessageBox.Show(this, "먼저 이미지에서 사각형으로 영역을 드래그해 선택하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var crop = imageEditorPanel.CreateCroppedSelection();
        if (crop == null)
        {
            MessageBox.Show(this, "저장할 유효한 영역이 없습니다.", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "선택 영역 저장",
            Filter = "PNG (*.png)|*.png|JPEG (*.jpg)|*.jpg|비트맵 (*.bmp)|*.bmp|GIF (*.gif)|*.gif|TIFF (*.tif)|*.tif",
            DefaultExt = "png",
            FileName = "selection"
        };

        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        try
        {
            SaveBitmapWithFormat(crop, dlg.FileName);
            MessageBox.Show(this, "선택 영역을 저장했습니다.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"저장하지 못했습니다.\n{ex.Message}", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static void SaveBitmapWithFormat(Bitmap bitmap, string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        ImageFormat fmt = ext switch
        {
            ".jpg" or ".jpeg" => ImageFormat.Jpeg,
            ".bmp" => ImageFormat.Bmp,
            ".gif" => ImageFormat.Gif,
            ".tif" or ".tiff" => ImageFormat.Tiff,
            _ => ImageFormat.Png
        };

        if (fmt.Equals(ImageFormat.Jpeg))
        {
            var codec = ImageCodecInfo.GetImageEncoders().FirstOrDefault(c => c.FormatID == ImageFormat.Jpeg.Guid);
            if (codec != null)
            {
                using var ep = new EncoderParameters(1);
                ep.Param[0] = new EncoderParameter(Encoder.Quality, 95L);
                bitmap.Save(path, codec, ep);
                return;
            }
        }

        bitmap.Save(path, fmt);
    }
}
