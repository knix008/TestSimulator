using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

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
            if (e.Delta > 0)
                zoom = Math.Min(zoom + ZoomStep, ZoomMax);
            else
                zoom = Math.Max(zoom - ZoomStep, ZoomMin);
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
                float imgW = loadedImage.Width * zoom;
                float imgH = loadedImage.Height * zoom;
                float offsetX = (pictureBox1.Width - imgW) / 2f;
                float offsetY = (pictureBox1.Height - imgH) / 2f;
                e.Graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                e.Graphics.DrawImage(loadedImage, offsetX, offsetY, imgW, imgH);
            }
            if (!selectionRectImg.IsEmpty)
            {
                Rectangle selRect = ToPictureBoxRect(selectionRectImg);
                using (Pen pen = new Pen(Color.Red, 2))
                {
                    pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
                    e.Graphics.DrawEllipse(pen, selRect);
                }
                // 중심 좌표 및 크기 정보 표시
                int cx = selRect.X + selRect.Width / 2;
                int cy = selRect.Y + selRect.Height / 2;
                int diameter = selRect.Width;
                string info = $"중심: ({cx}, {cy})  크기: {diameter}px";
                var textSize = e.Graphics.MeasureString(info, pictureBox1.Font);
                Point textPos = new Point(selRect.X, selRect.Y - (int)textSize.Height - 4);
                if (textPos.Y < 0) textPos.Y = selRect.Y + selRect.Height + 4;
                using (SolidBrush bg = new SolidBrush(Color.FromArgb(180, Color.White)))
                {
                    e.Graphics.FillRectangle(bg, new Rectangle(textPos, textSize.ToSize()));
                }
                using (SolidBrush brush = new SolidBrush(Color.Black))
                {
                    e.Graphics.DrawString(info, pictureBox1.Font, brush, textPos);
                }
            }
        }
    }
}
