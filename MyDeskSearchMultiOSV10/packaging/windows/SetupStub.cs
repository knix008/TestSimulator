using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

internal static class SetupStub
{
    private static int Main()
    {
        string temp = Path.Combine(Path.GetTempPath(), "MyDeskSearchSetup", Guid.NewGuid().ToString("n"));
        try
        {
            string self = Assembly.GetExecutingAssembly().Location;
            byte[] data = File.ReadAllBytes(self);
            byte[] marker = Encoding.ASCII.GetBytes("MYDSZIP");
            int at = LastIndexOf(data, marker);
            if (at < 0)
            {
                MessageBox.Show("This setup file does not contain the MyDeskSearch installer.", "MyDeskSearch");
                return 1;
            }

            Directory.CreateDirectory(temp);
            string zipPath = Path.Combine(temp, "payload.zip");
            using (FileStream zip = File.Create(zipPath))
            {
                zip.Write(data, at + marker.Length, data.Length - (at + marker.Length));
            }

            string files = Path.Combine(temp, "files");
            ZipFile.ExtractToDirectory(zipPath, files);
            string installer = Path.Combine(files, "install.ps1");
            if (!File.Exists(installer))
            {
                MessageBox.Show("install.ps1 was not found in the setup package.", "MyDeskSearch");
                return 1;
            }

            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = "powershell.exe";
            start.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + installer + "\"";
            start.WorkingDirectory = files;
            start.UseShellExecute = false;
            Process process = Process.Start(start);
            process.WaitForExit();
            return process.ExitCode;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "MyDeskSearch");
            return 1;
        }
        finally
        {
            try
            {
                if (Directory.Exists(temp))
                {
                    Directory.Delete(temp, true);
                }
            }
            catch (IOException)
            {
            }
        }
    }

    private static int LastIndexOf(byte[] data, byte[] marker)
    {
        for (int i = data.Length - marker.Length; i >= 0; i--)
        {
            bool match = true;
            for (int j = 0; j < marker.Length; j++)
            {
                if (data[i + j] != marker[j])
                {
                    match = false;
                    break;
                }
            }
            if (match)
            {
                return i;
            }
        }
        return -1;
    }
}
