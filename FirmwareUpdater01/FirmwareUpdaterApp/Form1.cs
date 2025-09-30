using System.Net.Http;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

namespace FirmwareUpdaterApp;

public partial class Form1 : Form
{
    private string? firmwareFilePath;
    private static readonly HttpClient httpClient;

    static Form1()
    {
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true
        };
        httpClient = new HttpClient(handler);
    }

    public Form1()
    {
        InitializeComponent();
    }

    private void btnBrowse_Click(object sender, EventArgs e)
    {
        using var openFileDialog = new OpenFileDialog
        {
            Filter = "Binary Files (*.bin)|*.bin|All Files (*.*)|*.*",
            Title = "Select Firmware File"
        };

        if (openFileDialog.ShowDialog() == DialogResult.OK)
        {
            firmwareFilePath = openFileDialog.FileName;
            txtFirmwarePath.Text = firmwareFilePath;
            LogMessage($"Selected firmware file: {Path.GetFileName(firmwareFilePath)}");
        }
    }

    private async void btnUpload_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrEmpty(firmwareFilePath) || !File.Exists(firmwareFilePath))
        {
            MessageBox.Show("Please select a valid firmware file.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        if (string.IsNullOrWhiteSpace(txtDeviceUrl.Text))
        {
            MessageBox.Show("Please enter device URL.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        btnUpload.Enabled = false;
        btnBrowse.Enabled = false;
        progressBar.Value = 0;

        try
        {
            LogMessage("Starting firmware upload...");
            await UploadFirmware(firmwareFilePath);
            progressBar.Value = 100;
            LogMessage("Firmware upload completed successfully!");
            MessageBox.Show("Firmware uploaded successfully!", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            LogMessage($"Error: {ex.Message}");
            MessageBox.Show($"Upload failed: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            btnUpload.Enabled = true;
            btnBrowse.Enabled = true;
        }
    }

    private async Task UploadFirmware(string filePath)
    {
        var deviceUrl = txtDeviceUrl.Text.TrimEnd('/');
        var apiUrl = $"{deviceUrl}/api/intellivix/vixface/v2.0/updatefirmware";

        LogMessage($"Uploading to: {apiUrl}");
        LogMessage($"File size: {new FileInfo(filePath).Length:N0} bytes");

        using var fileStream = File.OpenRead(filePath);
        using var content = new MultipartFormDataContent();
        using var streamContent = new StreamContent(fileStream);

        streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
        content.Add(streamContent, "firmware", Path.GetFileName(filePath));

        progressBar.Value = 30;
        var response = await httpClient.PostAsync(apiUrl, content);

        progressBar.Value = 70;
        response.EnsureSuccessStatusCode();

        var responseBody = await response.Content.ReadAsStringAsync();
        LogMessage($"Response: {responseBody}");
    }

    private void LogMessage(string message)
    {
        if (InvokeRequired)
        {
            Invoke(new Action(() => LogMessage(message)));
            return;
        }

        txtLog.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}");
    }
}
