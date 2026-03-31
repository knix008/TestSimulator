using System;
using System.Drawing;
using System.Windows.Forms;
using System.Drawing.Drawing2D;

namespace CircleIconWin
{
    public partial class Form1 : Form
    {
        // ZoomPanel: AutoScroll 패널이 마우스 휠로 자동 스크롤하지 않도록 억제
        private class ZoomPanel : Panel
        {
            private const int WM_MOUSEWHEEL = 0x020A;
            protected override void WndProc(ref Message m)
            {
                if (m.Msg == WM_MOUSEWHEEL)
                    return;
                base.WndProc(ref m);
            }
        }

        private Image loadedImage = null;
        private RectangleF selectionRectImg = RectangleF.Empty;
        private bool isDragging = false;
        private Point dragStart;
        private float zoomScale = 1.0f;
        private ZoomPanel panelView;

        private enum SelectionMode
        {
            Circle,
            Ellipse,
            Square,
            Rectangle
        }

        private SelectionMode currentSelectionMode = SelectionMode.Circle;

        public Form1()
        {
            InitializeComponent();

            panelView = new ZoomPanel();
            panelView.AutoScroll = true;
            panelView.BackColor = pictureBox1.BackColor;
            panelView.Location = pictureBox1.Location;
            panelView.Size = pictureBox1.Size;

            this.Controls.Remove(pictureBox1);
            pictureBox1.SizeMode = PictureBoxSizeMode.Normal;
            pictureBox1.Location = new Point(0, 0);
            panelView.Controls.Add(pictureBox1);
            this.Controls.Add(panelView);
            panelView.BringToFront();

            메뉴Open.Click += BtnOpen_Click;
            메뉴Save.Click += BtnSave_Click;
            메뉴Exit.Click += (s, e) => this.Close();
            toolOpen.Click += BtnOpen_Click;
            toolSave.Click += BtnSave_Click;
            btnOpenRight.Click += BtnOpen_Click;
            btnSaveRight.Click += BtnSave_Click;
            pictureBox1.MouseDown += PictureBox1_MouseDown;
            pictureBox1.MouseMove += PictureBox1_MouseMove;
            pictureBox1.MouseUp += PictureBox1_MouseUp;
            pictureBox1.Paint += PictureBox1_Paint;
            pictureBox1.MouseWheel += PictureBox1_MouseWheel;
            pictureBox1.MouseLeave += PictureBox1_MouseLeave;
            this.KeyDown += Form1_KeyDown;

            // Attach event handlers for selection mode buttons
            btnCircleSelection.Click += (s, e) => currentSelectionMode = SelectionMode.Circle;
            btnEllipseSelection.Click += (s, e) => currentSelectionMode = SelectionMode.Ellipse;
            btnSquareSelection.Click += (s, e) => currentSelectionMode = SelectionMode.Square;
            btnRectangleSelection.Click += (s, e) => currentSelectionMode = SelectionMode.Rectangle;
        }

        // PictureBox 내에서 이미지가 중앙에 그려지는 오프셋 반환
        private Point GetImageOffset()
        {
            if (loadedImage == null) return Point.Empty;
            int zoomedW = (int)(loadedImage.Width * zoomScale);
            int zoomedH = (int)(loadedImage.Height * zoomScale);
            return new Point(
                (pictureBox1.Width - zoomedW) / 2,
                (pictureBox1.Height - zoomedH) / 2);
        }

        // PictureBox 크기를 패널 크기와 확대 이미지 크기 중 큰 값으로 조정 (중앙 정렬 확보)
        private void ResizePictureBox()
        {
            if (loadedImage == null) return;
            pictureBox1.Size = new Size(
                Math.Max(panelView.Width, (int)(loadedImage.Width * zoomScale)),
                Math.Max(panelView.Height, (int)(loadedImage.Height * zoomScale)));
        }

        private void BtnOpen_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog ofd = new OpenFileDialog())
            {
                ofd.Filter = "Image Files|*.png;*.jpg;*.jpeg;*.bmp;*.gif";
                if (ofd.ShowDialog() == DialogResult.OK)
                {
                    loadedImage = Image.FromFile(ofd.FileName);
                    selectionRectImg = RectangleF.Empty;
                    isDragging = false;
                    float scaleX = (float)panelView.Width / loadedImage.Width;
                    float scaleY = (float)panelView.Height / loadedImage.Height;
                    zoomScale = Math.Min(scaleX, scaleY);
                    panelView.AutoScrollPosition = new Point(0, 0);
                    ResizePictureBox();
                    UpdateStatus(null);
                    pictureBox1.Invalidate();
                }
            }
        }

        private void BtnSave_Click(object sender, EventArgs e)
        {
            if (loadedImage == null || selectionRectImg.IsEmpty)
            {
                MessageBox.Show("저장할 선택 영역이 없습니다.");
                return;
            }
            Rectangle srcRect = Rectangle.Round(selectionRectImg);
            int outW = srcRect.Width;
            int outH = srcRect.Height;
            if (outW <= 0 || outH <= 0) return;

            using (Bitmap bmp = new Bitmap(outW, outH, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);

                if (currentSelectionMode == SelectionMode.Circle || currentSelectionMode == SelectionMode.Ellipse)
                {
                    using (GraphicsPath path = new GraphicsPath())
                    {
                        path.AddEllipse(0, 0, outW, outH);
                        g.SetClip(path);
                        g.DrawImage(loadedImage, new Rectangle(0, 0, outW, outH), srcRect, GraphicsUnit.Pixel);
                    }
                }
                else
                {
                    g.DrawImage(loadedImage, new Rectangle(0, 0, outW, outH), srcRect, GraphicsUnit.Pixel);
                }

                using (SaveFileDialog sfd = new SaveFileDialog())
                {
                    sfd.Filter = "PNG 파일|*.png";
                    sfd.FileName = currentSelectionMode == SelectionMode.Circle ? "circle.png" :
                                   currentSelectionMode == SelectionMode.Ellipse ? "ellipse.png" :
                                   currentSelectionMode == SelectionMode.Square ? "square.png" : "rectangle.png";
                    if (sfd.ShowDialog() == DialogResult.OK)
                    {
                        bmp.Save(sfd.FileName, System.Drawing.Imaging.ImageFormat.Png);
                        MessageBox.Show($"저장 완료: {sfd.FileName}", "정보", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                }
            }
        }

        private void PictureBox1_MouseWheel(object sender, MouseEventArgs e)
        {
            if (loadedImage == null) return;

            float oldZoom = zoomScale;
            Point oldOffset = GetImageOffset();

            // 마우스 아래 이미지 좌표
            float imgX = (e.Location.X - oldOffset.X) / oldZoom;
            float imgY = (e.Location.Y - oldOffset.Y) / oldZoom;

            // 패널 뷰포트 내 마우스 위치
            float viewportMouseX = e.Location.X + panelView.AutoScrollPosition.X;
            float viewportMouseY = e.Location.Y + panelView.AutoScrollPosition.Y;

            if (e.Delta > 0)
                zoomScale = Math.Min(zoomScale + 0.1f, 5.0f);
            else if (e.Delta < 0)
                zoomScale = Math.Max(zoomScale - 0.1f, 0.1f);

            ResizePictureBox();

            Point newOffset = GetImageOffset();

            // 마우스 아래 픽셀이 같은 뷰포트 위치에 유지되도록 스크롤 조정
            float newScrollX = imgX * zoomScale + newOffset.X - viewportMouseX;
            float newScrollY = imgY * zoomScale + newOffset.Y - viewportMouseY;
            panelView.AutoScrollPosition = new Point(
                (int)Math.Max(0, newScrollX),
                (int)Math.Max(0, newScrollY));

            pictureBox1.Invalidate();
        }

        private PointF ToImagePoint(Point p)
        {
            if (loadedImage == null) return PointF.Empty;
            Point offset = GetImageOffset();
            return new PointF((p.X - offset.X) / zoomScale, (p.Y - offset.Y) / zoomScale);
        }

        private Rectangle ToPictureBoxRect(RectangleF imgRect)
        {
            Point offset = GetImageOffset();
            return new Rectangle(
                (int)(imgRect.X * zoomScale) + offset.X,
                (int)(imgRect.Y * zoomScale) + offset.Y,
                (int)(imgRect.Width * zoomScale),
                (int)(imgRect.Height * zoomScale));
        }

        private void UpdateMouseInfo(Point mouseLocation)
        {
            PointF imgPoint = ToImagePoint(mouseLocation);
            float zoomedX = imgPoint.X * zoomScale;
            float zoomedY = imgPoint.Y * zoomScale;
            lblMouseInfo.Text = string.Format("마우스: X={0:F1}, Y={1:F1} (이미지 X={2:F1}, Y={3:F1})",
                zoomedX, zoomedY, imgPoint.X, imgPoint.Y);
        }

        private void UpdateStatus(Point? mouseLocation = null)
        {
            if (!selectionRectImg.IsEmpty)
            {
                lblSelectionInfo.Text = string.Format("선택 영역: X={0:F0}, Y={1:F0}, W={2:F0}, H={3:F0}",
                    selectionRectImg.X, selectionRectImg.Y, selectionRectImg.Width, selectionRectImg.Height);
            }
            else
            {
                lblSelectionInfo.Text = "선택 영역: -";
            }
            if (mouseLocation.HasValue)
                UpdateMouseInfo(mouseLocation.Value);
            else
                lblMouseInfo.Text = "마우스: -";
        }

        private void PictureBox1_MouseDown(object sender, MouseEventArgs e)
        {
            if (loadedImage == null) return;
            isDragging = true;
            dragStart = e.Location;
            PointF imgStart = ToImagePoint(e.Location);
            selectionRectImg = new RectangleF(imgStart.X, imgStart.Y, 0, 0);
            pictureBox1.Invalidate();
        }

        private void PictureBox1_MouseMove(object sender, MouseEventArgs e)
        {
            if (!isDragging || loadedImage == null) return;

            PointF imgDragStart = ToImagePoint(dragStart);
            PointF imgEnd = ToImagePoint(e.Location);

            switch (currentSelectionMode)
            {
                case SelectionMode.Circle:
                case SelectionMode.Square:
                    float size = Math.Max(Math.Abs(imgEnd.X - imgDragStart.X), Math.Abs(imgEnd.Y - imgDragStart.Y));
                    float x = imgEnd.X >= imgDragStart.X ? imgDragStart.X : imgDragStart.X - size;
                    float y = imgEnd.Y >= imgDragStart.Y ? imgDragStart.Y : imgDragStart.Y - size;
                    selectionRectImg = new RectangleF(x, y, size, size);
                    break;
                case SelectionMode.Ellipse:
                case SelectionMode.Rectangle:
                    selectionRectImg = new RectangleF(
                        Math.Min(imgDragStart.X, imgEnd.X),
                        Math.Min(imgDragStart.Y, imgEnd.Y),
                        Math.Abs(imgEnd.X - imgDragStart.X),
                        Math.Abs(imgEnd.Y - imgDragStart.Y));
                    break;
            }

            pictureBox1.Invalidate();
        }

        private void PictureBox1_MouseUp(object sender, MouseEventArgs e)
        {
            isDragging = false;
            UpdateStatus(e.Location);
        }

        private void PictureBox1_MouseLeave(object sender, EventArgs e)
        {
            UpdateStatus(null);
        }

        private void PictureBox1_Paint(object sender, PaintEventArgs e)
        {
            if (loadedImage != null)
            {
                int zoomedWidth = (int)(loadedImage.Width * zoomScale);
                int zoomedHeight = (int)(loadedImage.Height * zoomScale);
                Point offset = GetImageOffset();
                e.Graphics.DrawImage(loadedImage, new Rectangle(offset.X, offset.Y, zoomedWidth, zoomedHeight));

                // 배율 텍스트: 스크롤 위치와 무관하게 뷰포트 좌상단(10, 10)에 고정
                string zoomText = $"배율: {zoomScale:F1}";
                using (Font font = new Font("Arial", 16, FontStyle.Bold))
                using (Brush brush = new SolidBrush(Color.Red))
                {
                    float textX = 10 - panelView.AutoScrollPosition.X;
                    float textY = 10 - panelView.AutoScrollPosition.Y;
                    e.Graphics.DrawString(zoomText, font, brush, new PointF(textX, textY));
                }
            }

            if (!selectionRectImg.IsEmpty)
            {
                Rectangle selRect = ToPictureBoxRect(selectionRectImg);
                bool isEllipseMode = currentSelectionMode == SelectionMode.Circle || currentSelectionMode == SelectionMode.Ellipse;

                using (Brush dimBrush = new SolidBrush(Color.FromArgb(128, Color.Gray)))
                {
                    e.Graphics.FillRectangle(dimBrush, new Rectangle(0, 0, pictureBox1.Width, pictureBox1.Height));
                }

                int zoomedW = (int)(loadedImage.Width * zoomScale);
                int zoomedH = (int)(loadedImage.Height * zoomScale);
                Point imgOffset = GetImageOffset();

                if (isEllipseMode)
                {
                    using (GraphicsPath path = new GraphicsPath())
                    {
                        path.AddEllipse(selRect);
                        using (Region highlightRegion = new Region(path))
                        {
                            e.Graphics.SetClip(highlightRegion, CombineMode.Replace);
                            e.Graphics.DrawImage(loadedImage, new Rectangle(imgOffset.X, imgOffset.Y, zoomedW, zoomedH));
                            e.Graphics.ResetClip();
                        }
                    }
                }
                else
                {
                    using (Region highlightRegion = new Region(selRect))
                    {
                        e.Graphics.SetClip(highlightRegion, CombineMode.Replace);
                        e.Graphics.DrawImage(loadedImage, new Rectangle(imgOffset.X, imgOffset.Y, zoomedW, zoomedH));
                        e.Graphics.ResetClip();
                    }
                }

                using (Pen pen = new Pen(Color.Red, 2))
                {
                    pen.DashStyle = DashStyle.Dash;
                    if (isEllipseMode)
                        e.Graphics.DrawEllipse(pen, selRect);
                    else
                        e.Graphics.DrawRectangle(pen, selRect);
                }

                using (Pen crossPen = new Pen(Color.Red, 2))
                {
                    Point center = new Point(selRect.X + selRect.Width / 2, selRect.Y + selRect.Height / 2);
                    e.Graphics.DrawLine(crossPen, center.X - 5, center.Y, center.X + 5, center.Y);
                    e.Graphics.DrawLine(crossPen, center.X, center.Y - 5, center.X, center.Y + 5);
                }

                string selectionInfo;
                switch (currentSelectionMode)
                {
                    case SelectionMode.Circle:
                        selectionInfo = $"원형 반경: {selectionRectImg.Width / 2:F1}  크기: {selectionRectImg.Width:F1}x{selectionRectImg.Height:F1}";
                        break;
                    case SelectionMode.Ellipse:
                        selectionInfo = $"타원: {selectionRectImg.Width:F1}x{selectionRectImg.Height:F1}";
                        break;
                    case SelectionMode.Square:
                        selectionInfo = $"사각형: {selectionRectImg.Width:F1}x{selectionRectImg.Height:F1}";
                        break;
                    default:
                        selectionInfo = $"직사각형: {selectionRectImg.Width:F1}x{selectionRectImg.Height:F1}";
                        break;
                }

                using (Font font = new Font("Arial", 12, FontStyle.Bold))
                using (Brush brush = new SolidBrush(Color.Red))
                {
                    SizeF textSize = e.Graphics.MeasureString(selectionInfo, font);
                    PointF infoPosition = new PointF(selRect.X + (selRect.Width - textSize.Width) / 2, selRect.Y - textSize.Height - 5);
                    e.Graphics.DrawString(selectionInfo, font, brush, infoPosition);
                }
            }
        }

        private void Form1_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape)
            {
                selectionRectImg = RectangleF.Empty;
                lblSelectionInfo.Text = "선택 영역: -";
                pictureBox1.Invalidate();
            }
            else if (!selectionRectImg.IsEmpty)
            {
                float moveStep = 5f / zoomScale;
                switch (e.KeyCode)
                {
                    case Keys.Up:
                        selectionRectImg.Y = Math.Max(0, selectionRectImg.Y - moveStep);
                        break;
                    case Keys.Down:
                        selectionRectImg.Y = Math.Min(loadedImage.Height - selectionRectImg.Height, selectionRectImg.Y + moveStep);
                        break;
                    case Keys.Left:
                        selectionRectImg.X = Math.Max(0, selectionRectImg.X - moveStep);
                        break;
                    case Keys.Right:
                        selectionRectImg.X = Math.Min(loadedImage.Width - selectionRectImg.Width, selectionRectImg.X + moveStep);
                        break;
                }
                UpdateStatus();
                pictureBox1.Invalidate();
            }
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.Up || keyData == Keys.Down || keyData == Keys.Left || keyData == Keys.Right)
            {
                Form1_KeyDown(this, new KeyEventArgs(keyData));
                return true;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        private void btnCircleSelection_Click(object sender, EventArgs e)
        {
            currentSelectionMode = SelectionMode.Circle;
        }

        private void lblSelectionInfo_Click(object sender, EventArgs e)
        {
            // Placeholder for lblSelectionInfo click event logic
        }
    }
}
