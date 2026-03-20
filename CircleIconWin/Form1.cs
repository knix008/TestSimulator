using System;
using System.Drawing;
using System.Windows.Forms;
using System.Drawing.Drawing2D;

namespace CircleIconWin
{
    public partial class Form1 : Form
    {
        private Image loadedImage = null;
        private Rectangle selectionRect = Rectangle.Empty;
        private bool isDragging = false;
        private Point dragStart;
        private float zoom = 1.0f;
        private const float ZoomStep = 0.1f;
        private const float ZoomMin = 0.1f;
        private const float ZoomMax = 5.0f;
        private float zoomScale = 1.0f; // Default zoom scale

        public Form1()
        {
            InitializeComponent();
            // 메뉴/툴바 이벤트 연결
            메뉴Open.Click += BtnOpen_Click;
            메뉴Save.Click += BtnSave_Click;
            메뉴Exit.Click += (s, e) => this.Close();
            toolOpen.Click += BtnOpen_Click;
            toolSave.Click += BtnSave_Click;
            btnOpenRight.Click += BtnOpen_Click;
            btnSaveRight.Click += BtnSave_Click;
            // PictureBox 이벤트
            pictureBox1.MouseDown += PictureBox1_MouseDown;
            pictureBox1.MouseMove += PictureBox1_MouseMove;
            pictureBox1.MouseUp += PictureBox1_MouseUp;
            pictureBox1.Paint += PictureBox1_Paint;
            pictureBox1.MouseWheel += PictureBox1_MouseWheel;
            pictureBox1.MouseLeave += PictureBox1_MouseLeave;
            pictureBox1.Focus();
            // Form 키보드 이벤트
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
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                using (GraphicsPath path = new System.Drawing.Drawing2D.GraphicsPath())
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
            // Implement zoom functionality centered on the mouse pointer
            if (e.Delta > 0)
            {
                zoomScale = Math.Min(zoomScale + 0.1f, 5.0f); // Limit maximum zoom
            }
            else if (e.Delta < 0)
            {
                zoomScale = Math.Max(zoomScale - 0.1f, 0.5f); // Limit minimum zoom
            }

            lblMouseInfo.Text = $"마우스: {e.Location}, 배율: {zoomScale:F1}";
            pictureBox1.Invalidate();
        }

        private PointF ToImagePoint(Point p)
        {
            if (loadedImage == null) return PointF.Empty;
            float imgW = loadedImage.Width * zoom;
            float imgH = loadedImage.Height * zoom;
            float offsetX = (pictureBox1.Width - imgW) / 2f;
            float offsetY = (pictureBox1.Height - imgH) / 2f;
            return new PointF((p.X - offsetX) / zoom, (p.Y - offsetY) / zoom);
        }

        private Rectangle ToPictureBoxRect(RectangleF imgRect)
        {
            float imgW = loadedImage.Width * zoom;
            float imgH = loadedImage.Height * zoom;
            float offsetX = (pictureBox1.Width - imgW) / 2f;
            float offsetY = (pictureBox1.Height - imgH) / 2f;
            return new Rectangle(
                (int)(imgRect.X * zoom + offsetX),
                (int)(imgRect.Y * zoom + offsetY),
                (int)(imgRect.Width * zoom),
                (int)(imgRect.Height * zoom));
        }

        private RectangleF selectionRectImg = RectangleF.Empty;

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
                PointF imgPt = ToImagePoint(mouseLocation.Value);
                lblMouseInfo.Text = string.Format("마우스: X={0}, Y={1} (이미지 X={2:F0}, Y={3:F0})",
                    mouseLocation.Value.X, mouseLocation.Value.Y, imgPt.X, imgPt.Y);
            }
            else
            {
                lblMouseInfo.Text = "마우스: -";
            }
        }

        private void PictureBox1_MouseDown(object sender, MouseEventArgs e)
        {
            if (loadedImage == null) return;
            isDragging = true;
            dragStart = e.Location;
            PointF imgStart = ToImagePoint(e.Location);
            // 새로운 선택 시작 시 기존 선택 영역 초기화
            selectionRectImg = new RectangleF(imgStart.X, imgStart.Y, 0, 0);
            UpdateStatus(e.Location);
            pictureBox1.Invalidate();
        }

        private void PictureBox1_MouseMove(object sender, MouseEventArgs e)
        {
            if (!isDragging || loadedImage == null)
            {
                UpdateStatus(e.Location);
                return;
            }
            PointF imgStart = new PointF(selectionRectImg.X, selectionRectImg.Y);
            PointF imgEnd = ToImagePoint(e.Location);
            float size = Math.Max(Math.Abs(imgEnd.X - imgStart.X), Math.Abs(imgEnd.Y - imgStart.Y));
            float x = imgStart.X;
            float y = imgStart.Y;
            if (imgEnd.X < imgStart.X) x -= size;
            if (imgEnd.Y < imgStart.Y) y -= size;
            selectionRectImg = new RectangleF(x, y, size, size);
            pictureBox1.Invalidate();
            UpdateStatus(e.Location);
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
                // Calculate the zoomed image dimensions
                int zoomedWidth = (int)(loadedImage.Width * zoomScale);
                int zoomedHeight = (int)(loadedImage.Height * zoomScale);

                // Draw the zoomed image centered in the PictureBox
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
                // Dim the entire image
                using (Brush dimBrush = new SolidBrush(Color.FromArgb(128, Color.Gray)))
                {
                    e.Graphics.FillRectangle(dimBrush, new Rectangle(0, 0, pictureBox1.Width, pictureBox1.Height));
                }

                // Highlight the circular selection area
                using (GraphicsPath path = new GraphicsPath())
                {
                    Rectangle circleRect = ToPictureBoxRect(selectionRectImg);
                    path.AddEllipse(circleRect);
                    using (Region highlightRegion = new Region(path))
                    {
                        e.Graphics.SetClip(highlightRegion, System.Drawing.Drawing2D.CombineMode.Replace);

                        // Draw the zoomed image within the circular selection area without distortion
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
                    Rectangle circleRect = ToPictureBoxRect(selectionRectImg);
                    e.Graphics.DrawEllipse(pen, circleRect);
                }

                // Draw a red '+' at the center of the circle
                using (Pen crossPen = new Pen(Color.Red, 2))
                {
                    Rectangle circleRect = ToPictureBoxRect(selectionRectImg);
                    Point center = new Point(circleRect.X + circleRect.Width / 2, circleRect.Y + circleRect.Height / 2);
                    e.Graphics.DrawLine(crossPen, center.X - 5, center.Y, center.X + 5, center.Y); // Horizontal line
                    e.Graphics.DrawLine(crossPen, center.X, center.Y - 5, center.X, center.Y + 5); // Vertical line
                }

                // Display selection information above the selection area, centered horizontally
                string selectionInfo = $"반경: {selectionRectImg.Width / 2:F1}, 넓이: {selectionRectImg.Width:F1}, 높이: {selectionRectImg.Height:F1}";
                using (Font font = new Font("Arial", 12, FontStyle.Bold))
                using (Brush brush = new SolidBrush(Color.Red))
                {
                    Rectangle circleRect = ToPictureBoxRect(selectionRectImg);
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
