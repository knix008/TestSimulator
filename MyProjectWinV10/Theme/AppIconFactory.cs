using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace MyProject.Theme
{
    public static class AppIconFactory
    {
        public const string IconFileName = "MyProject.ico";
        public static string IconPath =>
            Path.Combine(AppContext.BaseDirectory, "Assets", IconFileName);

        public static string GetProjectIconPath()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                var candidate = Path.Combine(dir.FullName, "Assets", IconFileName);
                if (File.Exists(candidate))
                    return candidate;

                var csproj = Path.Combine(dir.FullName, "MyProject.csproj");
                if (File.Exists(csproj))
                    return Path.Combine(dir.FullName, "Assets", IconFileName);

                dir = dir.Parent;
            }

            return Path.Combine(Directory.GetCurrentDirectory(), "Assets", IconFileName);
        }

        public static void SaveIconFile(string path)
        {
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
                Directory.CreateDirectory(directory);

            using var bitmap = RenderBitmap(32);
            var handle = bitmap.GetHicon();
            try
            {
                using var source = Icon.FromHandle(handle);
                using var icon = new Icon(source, 32, 32);
                using var stream = File.Create(path);
                icon.Save(stream);
            }
            finally
            {
                DestroyIcon(handle);
            }
        }

        public static Icon CreateIcon()
        {
            var path = GetProjectIconPath();
            if (File.Exists(path))
                return new Icon(path);

            using var bitmap = RenderBitmap(32);
            return Icon.FromHandle(bitmap.GetHicon());
        }

        private static Bitmap RenderBitmap(int size)
        {
            var bitmap = new Bitmap(size, size);
            using var graphics = Graphics.FromImage(bitmap);
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.Clear(AppTheme.Accent);

            var scale = size / 32f;
            using var brush = new SolidBrush(Color.White);
            graphics.FillRectangle(brush, 6 * scale, 8 * scale, 20 * scale, 4 * scale);
            graphics.FillRectangle(brush, 6 * scale, 16 * scale, 14 * scale, 4 * scale);
            graphics.FillRectangle(brush, 6 * scale, 24 * scale, 8 * scale, 4 * scale);
            return bitmap;
        }

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern bool DestroyIcon(IntPtr handle);
    }
}
