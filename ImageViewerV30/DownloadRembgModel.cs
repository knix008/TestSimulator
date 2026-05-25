using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

namespace ImageViewerV30
{
    public static class DownloadRembgModel
    {
        // rembg 공식 u2net onnx 모델 URL
        private const string ModelUrl = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx";
        private const string ModelFileName = "u2net.onnx";

        public static async Task<string> DownloadModelIfNotExistsAsync(string modelsDir)
        {
            string modelPath = Path.Combine(modelsDir, ModelFileName);
            if (File.Exists(modelPath))
                return modelPath;

            Directory.CreateDirectory(modelsDir);
            using var client = new HttpClient();
            using var response = await client.GetAsync(ModelUrl);
            response.EnsureSuccessStatusCode();
            using var fs = new FileStream(modelPath, FileMode.Create, FileAccess.Write);
            await response.Content.CopyToAsync(fs);
            return modelPath;
        }
    }
}
