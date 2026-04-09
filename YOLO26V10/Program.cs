using System;
using System.Windows.Forms;
using YOLO26V10.Segmentation;

namespace YOLO26V10
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            CudaRuntimeBootstrap.EnsureCudaBinOnPath();
            Yolo26ModelPreparer.EnsureModelDirectoryExists();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new YOLO26V10());
        }
    }
}

