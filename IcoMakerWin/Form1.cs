using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing.Imaging;
using System.IO;

namespace IcoMakerWin
{
    public partial class Form1 : Form
    {
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
                    string filePath = openFileDialog.FileName;
                    pictureBox.Image = Image.FromFile(filePath);
                }
            }
        }

        private void btnSaveAsIco_Click(object sender, EventArgs e)
        {
            if (pictureBox.Image == null)
            {
                MessageBox.Show("Please load an image first.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            using (SaveFileDialog saveFileDialog = new SaveFileDialog())
            {
                saveFileDialog.Filter = "ICO Files|*.ico";
                if (saveFileDialog.ShowDialog() == DialogResult.OK)
                {
                    string savePath = saveFileDialog.FileName;
                    SaveImageAsIco(pictureBox.Image, savePath);
                    MessageBox.Show("ICO file saved successfully!", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
        }

        private void SaveImageAsIco(Image image, string filePath)
        {
            using (var memoryStream = new MemoryStream())
            {
                Bitmap bitmap = new Bitmap(image);
                bitmap.Save(memoryStream, ImageFormat.Png);
                using (var fileStream = new FileStream(filePath, FileMode.Create))
                {
                    Icon icon = CreateIconFromPng(memoryStream.ToArray());
                    icon.Save(fileStream);
                }
            }
        }

        private Icon CreateIconFromPng(byte[] pngData)
        {
            using (var memoryStream = new MemoryStream(pngData))
            using (var bitmap = new Bitmap(memoryStream))
            {
                IntPtr hIcon = bitmap.GetHicon();
                return Icon.FromHandle(hIcon);
            }
        }
    }
}
