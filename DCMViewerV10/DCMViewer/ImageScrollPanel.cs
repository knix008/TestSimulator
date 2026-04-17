namespace DCMViewer;

/// <summary>
/// AutoScroll 패널에서 마우스 휠로 기본 스크롤 대신 줌만 사용할 때 base 스크롤을 막기 위한 패널입니다.
/// </summary>
internal sealed class ImageScrollPanel : Panel
{
    public Action<MouseEventArgs>? ZoomWheel { get; set; }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (ZoomWheel is not null)
        {
            ZoomWheel(e);
            return;
        }

        base.OnMouseWheel(e);
    }
}

/// <summary>
/// PictureBox가 포커스를 받은 상태에서도 휠로 줌만 처리합니다.
/// </summary>
internal sealed class ZoomPictureBox : PictureBox
{
    public Action<MouseEventArgs>? ZoomWheel { get; set; }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (ZoomWheel is not null)
        {
            ZoomWheel(e);
            return;
        }

        base.OnMouseWheel(e);
    }
}
