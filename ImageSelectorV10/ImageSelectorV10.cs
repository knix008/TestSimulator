using System.Drawing.Imaging;
using System.Globalization;

namespace ImageSelectorV10;

public partial class ImageSelectorV10 : Form
{
    public ImageSelectorV10()
    {
        InitializeComponent();
        imageEditorPanel.ZoomFactorChanged += (_, z) => UpdateZoomLabel(z);
        imageEditorPanel.SelectionChanged += imageEditorPanel_SelectionChanged;
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
            FileName = SuggestCropFileName()
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

    private string SuggestCropFileName()
    {
        var note = txtRegionNote.Text.Trim();
        var safe = string.Join("_", note.Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries));
        if (safe.Length > 40) safe = safe[..40];
        return string.IsNullOrEmpty(safe) ? "selection" : safe;
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
