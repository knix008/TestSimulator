using System;
using System.Drawing;
using System.Windows.Forms;
using System.Drawing.Drawing2D;

namespace CircleIconWin
{
    public partial class Form1 : Form
    {
        private Image loadedImage = null;
        private RectangleF selectionRectImg = RectangleF.Empty;
        private bool isDragging = false;
        private Point dragStart;
        private float zoomScale = 1.0f;

        public Form1()
        {
            InitializeComponent();
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
                    // 이미지가 PictureBox에 맞게 초기 줌 배율 자동 계산
                    float scaleX = (float)pictureBox1.Width / loadedImage.Width;
                    float scaleY = (float)pictureBox1.Height / loadedImage.Height;
                    zoomScale = Math.Min(scaleX, scaleY);
                    UpdateStatus(null);
                    pictureBox1.Invalidate();
                }
            }
        }

        private void BtnSave_Click(object sender, EventArgs e)
        {
            if (loadedImage == null || selectionRectImg.IsEmpty)
            {
                MessageBox.Show("저장할 원형 영역이 없습니다.");
                return;
            }
            Rectangle srcRect = Rectangle.Round(selectionRectImg);
            int size = Math.Min(srcRect.Width, srcRect.Height);
            if (size <= 0) return;
            using (Bitmap bmp = new Bitmap(size, size, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (GraphicsPath path = new GraphicsPath())
                {
                    path.AddEllipse(0, 0, size, size);
                    g.SetClip(path);
                    g.Clear(Color.Transparent);
                    g.DrawImage(loadedImage, new Rectangle(0, 0, size, size),
                        new Rectangle(srcRect.X, srcRect.Y, size, size), GraphicsUnit.Pixel);
                }
                using (SaveFileDialog sfd = new SaveFileDialog())
                {
                    sfd.Filter = "PNG 파일|*.png";
                    sfd.FileName = "circle.png";
                    if (sfd.ShowDialog() == DialogResult.OK)
                    {
                        bmp.Save(sfd.FileName, System.Drawing.Imaging.ImageFormat.Png);
                        MessageBox.Show("저장 완료", "정보", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                }
            }
        }

        private void PictureBox1_MouseWheel(object sender, MouseEventArgs e)
        {
            if (loadedImage == null) return;

            // Calculate the image point corresponding to the mouse location
            PointF imgPointBeforeZoom = ToImagePoint(e.Location);

            // Adjust zoom scale
            if (e.Delta > 0)
            {
                zoomScale = Math.Min(zoomScale + 0.1f, 5.0f);
            }
            else if (e.Delta < 0)
            {
                zoomScale = Math.Max(zoomScale - 0.1f, 0.5f);
            }

            // Calculate the new offset to keep the mouse point fixed
            PointF imgPointAfterZoom = ToImagePoint(e.Location);
            float dx = (imgPointAfterZoom.X - imgPointBeforeZoom.X) * zoomScale;
            float dy = (imgPointAfterZoom.Y - imgPointBeforeZoom.Y) * zoomScale;

            // Adjust the selection rectangle to account for the zoom
            selectionRectImg.X -= dx;
            selectionRectImg.Y -= dy;

            pictureBox1.Invalidate();
        }

        private PointF ToImagePoint(Point p)
        {
            if (loadedImage == null) return PointF.Empty;
            float imgW = loadedImage.Width * zoomScale;
            float imgH = loadedImage.Height * zoomScale;
            float offsetX = (pictureBox1.Width - imgW) / 2f;
            float offsetY = (pictureBox1.Height - imgH) / 2f;
            return new PointF((p.X - offsetX) / zoomScale, (p.Y - offsetY) / zoomScale);
        }

        private Rectangle ToPictureBoxRect(RectangleF imgRect)
        {
            float imgW = loadedImage.Width * zoomScale;
            float imgH = loadedImage.Height * zoomScale;
            float offsetX = (pictureBox1.Width - imgW) / 2f;
            float offsetY = (pictureBox1.Height - imgH) / 2f;
            return new Rectangle(
                (int)(imgRect.X * zoomScale + offsetX),
                (int)(imgRect.Y * zoomScale + offsetY),
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
            {
                UpdateMouseInfo(mouseLocation.Value);
            }
            else
            {
                lblMouseInfo.Text = "마우스: -";
            }
        }

        private void PictureBox1_MouseDown(object sender, MouseEventArgs e)
        {
            if (loadedImage == null) return;
            // 드래그 시작점 기록 (이미지 좌표계)
            dragStart = e.Location;
            isDragging = true;
            // 선택 영역 초기화 (드래그 시작점에서 0 크기)
            PointF imgStart = ToImagePoint(dragStart);
            selectionRectImg = new RectangleF(imgStart.X, imgStart.Y, 0, 0);
            pictureBox1.Invalidate();
        }

        private void PictureBox1_MouseMove(object sender, MouseEventArgs e)
        {
            if (!isDragging || loadedImage == null)
            {
                UpdateMouseInfo(e.Location);
                return;
            }
            // 드래그 시작점과 현재 마우스 위치로 정사각형 영역 계산
            PointF imgStart = ToImagePoint(dragStart);
            PointF imgEnd = ToImagePoint(e.Location);
            float width = imgEnd.X - imgStart.X;
            float height = imgEnd.Y - imgStart.Y;
            float size = Math.Max(Math.Abs(width), Math.Abs(height));
            float x = imgStart.X;
            float y = imgStart.Y;
            if (width < 0) x -= size;
            if (height < 0) y -= size;
            selectionRectImg = new RectangleF(x, y, size, size);
            pictureBox1.Invalidate();
            UpdateMouseInfo(e.Location);
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
                int offsetX = (pictureBox1.Width - zoomedWidth) / 2;
                int offsetY = (pictureBox1.Height - zoomedHeight) / 2;
                e.Graphics.DrawImage(loadedImage, new Rectangle(offsetX, offsetY, zoomedWidth, zoomedHeight));

                // Draw the zoom scale on the top-right corner of the PictureBox
                string zoomText = $"배율: {zoomScale:F1}";
                using (Font font = new Font("Arial", 16, FontStyle.Bold))
                using (Brush brush = new SolidBrush(Color.Yellow))
                {
                    SizeF textSize = e.Graphics.MeasureString(zoomText, font);
                    PointF textPosition = new PointF(pictureBox1.Width - textSize.Width - 10, 10); // Top-right corner
                    e.Graphics.DrawString(zoomText, font, brush, textPosition);
                }
            }

            if (!selectionRectImg.IsEmpty)
            {
                Rectangle circleRect = ToPictureBoxRect(selectionRectImg);

                // Dim the entire image
                using (Brush dimBrush = new SolidBrush(Color.FromArgb(128, Color.Gray)))
                {
                    e.Graphics.FillRectangle(dimBrush, new Rectangle(0, 0, pictureBox1.Width, pictureBox1.Height));
                }

                // Highlight the circular selection area
                using (GraphicsPath path = new GraphicsPath())
                {
                    path.AddEllipse(circleRect);
                    using (Region highlightRegion = new Region(path))
                    {
                        e.Graphics.SetClip(highlightRegion, System.Drawing.Drawing2D.CombineMode.Replace);

                        int zoomedWidth = (int)(loadedImage.Width * zoomScale);
                        int zoomedHeight = (int)(loadedImage.Height * zoomScale);
                        int offsetX = (pictureBox1.Width - zoomedWidth) / 2;
                        int offsetY = (pictureBox1.Height - zoomedHeight) / 2;
                        e.Graphics.DrawImage(loadedImage, new Rectangle(offsetX, offsetY, zoomedWidth, zoomedHeight));

                        e.Graphics.ResetClip();
                    }
                }

                // Draw the dashed circle outline
                using (Pen pen = new Pen(Color.Red, 2))
                {
                    pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
                    e.Graphics.DrawEllipse(pen, circleRect);
                }

                // Draw a red '+' at the center of the circle
                using (Pen crossPen = new Pen(Color.Red, 2))
                {
                    Point center = new Point(circleRect.X + circleRect.Width / 2, circleRect.Y + circleRect.Height / 2);
                    e.Graphics.DrawLine(crossPen, center.X - 5, center.Y, center.X + 5, center.Y);
                    e.Graphics.DrawLine(crossPen, center.X, center.Y - 5, center.X, center.Y + 5);
                }

                // Display selection information above the selection area, centered horizontally
                string selectionInfo = $"반경: {selectionRectImg.Width / 2:F1}, 넓이: {selectionRectImg.Width:F1}, 높이: {selectionRectImg.Height:F1}";
                using (Font font = new Font("Arial", 12, FontStyle.Bold))
                using (Brush brush = new SolidBrush(Color.Red))
                {
                    SizeF textSize = e.Graphics.MeasureString(selectionInfo, font);
                    PointF infoPosition = new PointF(circleRect.X + (circleRect.Width - textSize.Width) / 2, circleRect.Y - textSize.Height - 5);
                    e.Graphics.DrawString(selectionInfo, font, brush, infoPosition);
                }
            }
        }

        private void Form1_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape)
            {
                // Cancel the selection
                selectionRectImg = RectangleF.Empty;
                lblSelectionInfo.Text = "선택 영역: -";
                pictureBox1.Invalidate();
            }
            else if (!selectionRectImg.IsEmpty)
            {
                // Move the selection rectangle with arrow keys
                float moveStep = 5f / zoomScale; // Adjust movement based on zoom scale
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
            // Intercept arrow keys to prevent default behavior
            if (keyData == Keys.Up || keyData == Keys.Down || keyData == Keys.Left || keyData == Keys.Right)
            {
                Form1_KeyDown(this, new KeyEventArgs(keyData));
                return true; // Indicate that the key press has been handled
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

    }
}
