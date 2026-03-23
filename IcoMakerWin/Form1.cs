using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace IcoMakerWin
{
    public partial class Form1 : Form
    {
        private Bitmap loadedBitmap;

        public Form1()
        {
            InitializeComponent();
        }

        private void btnLoadImage_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog openFileDialog = new OpenFileDialog())
            {
                openFileDialog.Filter = "Image Files|*.bmp;*.jpg;*.jpeg;*.png;*.gif";
                if (openFileDialog.ShowDialog() == DialogResult.OK)
                {
                    Bitmap originalBitmap = new Bitmap(openFileDialog.FileName);
                    loadedBitmap = originalBitmap.Clone(new Rectangle(0, 0, originalBitmap.Width, originalBitmap.Height), System.Drawing.Imaging.PixelFormat.Format32bppArgb);
                    pictureBox.Image = loadedBitmap;
                }
            }
        }

        private void btnSaveAsIco_Click(object sender, EventArgs e)
        {
            if (loadedBitmap == null)
            {
                MessageBox.Show("Please load an image first.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            using (SaveFileDialog saveFileDialog = new SaveFileDialog())
            {
                saveFileDialog.Filter = "Icon Files|*.ico";
                if (saveFileDialog.ShowDialog() == DialogResult.OK)
                {
                    try
                    {
                        SaveAsIco(loadedBitmap, saveFileDialog.FileName);
                        MessageBox.Show("Icon saved successfully.", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Failed to save icon: {ex.Message}\n{ex.StackTrace}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
        }

        private void SaveAsIco(Bitmap bitmap, string filePath)
        {
            // 아이콘 크기를 32x32로 강제 조정
            using (Bitmap resizedBitmap = new Bitmap(bitmap, new Size(32, 32)))
            {
                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    Icon.FromHandle(resizedBitmap.GetHicon()).Save(stream);
                }
            }
        }
    }
}
