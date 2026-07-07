using System.Text;

namespace DCMViewer;

/// <summary>
/// 프로그램 설명을 보여 주는 모달 대화상자입니다.
/// </summary>
internal sealed class ProgramInfoForm : Form
{
    public ProgramInfoForm()
    {
        Text = "DCMViewer — 프로그램 정보";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ShowInTaskbar = false;
        ClientSize = new Size(560, 480);
        MinimumSize = new Size(400, 320);
        Font = new Font("Segoe UI", 9F);

        var main = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Padding = new Padding(12),
        };
        main.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));

        var contentRow = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
        };
        contentRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 48F));
        contentRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));

        using var infoIcon = SystemIcons.Information.ToBitmap();
        var picture = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.CenterImage,
            Image = new Bitmap(infoIcon),
            TabStop = false,
        };

        var scrollBody = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BorderStyle = BorderStyle.FixedSingle,
            TabStop = false,
            Padding = new Padding(8),
        };

        var bodyLabel = new Label
        {
            AutoSize = true,
            UseMnemonic = false,
            Text = BuildDescription(),
            TabStop = false,
        };

        scrollBody.Controls.Add(bodyLabel);
        scrollBody.Resize += (_, _) =>
        {
            var w = Math.Max(80, scrollBody.ClientSize.Width - scrollBody.Padding.Horizontal);
            bodyLabel.MaximumSize = new Size(w, 0);
            bodyLabel.Location = new Point(scrollBody.Padding.Left, scrollBody.Padding.Top);
        };

        contentRow.Controls.Add(picture, 0, 0);
        contentRow.Controls.Add(scrollBody, 1, 0);

        var ok = new Button
        {
            Text = "확인",
            DialogResult = DialogResult.OK,
            AutoSize = true,
            TabIndex = 0,
        };

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(0, 8, 0, 0),
        };
        buttonPanel.Controls.Add(ok);

        main.Controls.Add(contentRow, 0, 0);
        main.Controls.Add(buttonPanel, 0, 1);

        Controls.Add(main);
        AcceptButton = ok;
        CancelButton = ok;

        Shown += (_, _) =>
        {
            scrollBody.PerformLayout();
            ActiveControl = ok;
        };
    }

    private static string BuildDescription()
    {
        var sb = new StringBuilder();
        sb.AppendLine("DCMViewer는 의료용 DICOM(.dcm)과 일반 이미지를 함께 볼 수 있는 Windows Forms 뷰어입니다.");
        sb.AppendLine();
        sb.AppendLine("지원 형식");
        sb.AppendLine("  • DICOM: .dcm, .dicm");
        sb.AppendLine("  • 이미지: .jpg, .jpeg, .png, .gif, .webp, .bmp, .tif, .tiff, .ico");
        sb.AppendLine();
        sb.AppendLine("주요 기능");
        sb.AppendLine("  • 처음에는 창 크기에 맞게 표시");
        sb.AppendLine("  • 마우스 휠로 확대/축소 (초기 맞춤 배율 기준)");
        sb.AppendLine("  • 스크롤이 있을 때는 화면 중심 기준으로 확대/축소");
        sb.AppendLine("  • 확대/축소 시 초기 맞춤 대비 배율을 좌측 상단에 표시");
        sb.AppendLine("  • 다중 프레임 DICOM은 하단 슬라이더로 프레임 이동");
        sb.AppendLine();
        sb.AppendLine("기술 스택");
        sb.AppendLine("  • fo-dicom, fo-dicom.Imaging.Desktop, fo-dicom.Codecs");
        sb.AppendLine();
        sb.AppendLine("참고: JPEG2000 등 압축 DICOM은 fo-dicom.Codecs와 Visual C++ 재배포 패키지가 필요할 수 있습니다.");
        sb.AppendLine();
        sb.AppendLine("Copyright © 2026 SHKWON (knix008@naver.com)");
        return sb.ToString();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        foreach (Control c in Controls)
            DisposePictureBoxes(c);
        base.OnFormClosed(e);
    }

    private static void DisposePictureBoxes(Control root)
    {
        if (root is PictureBox pb && pb.Image is not null)
        {
            pb.Image.Dispose();
            pb.Image = null;
        }

        foreach (Control child in root.Controls)
            DisposePictureBoxes(child);
    }
}
