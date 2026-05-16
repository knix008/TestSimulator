namespace VNCServer.VNCServer;

/// <summary>
/// 파일 전송 기능을 담당하는 클래스
/// </summary>
public class FileTransferManager
{
    private const int BUFFER_SIZE = 8192;

    public event EventHandler<FileTransferProgress>? ProgressChanged;
    public event EventHandler<string>? TransferCompleted;
    public event EventHandler<string>? TransferFailed;

    public class FileTransferProgress
    {
        public string FileName { get; set; } = string.Empty;
        public long BytesTransferred { get; set; }
        public long TotalBytes { get; set; }
        public double PercentComplete => TotalBytes > 0 ? (BytesTransferred * 100.0 / TotalBytes) : 0;
    }

    /// <summary>
    /// 파일을 스트림으로 전송
    /// </summary>
    public async Task SendFileAsync(Stream stream, string filePath)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"File not found: {filePath}");
        }

        try
        {
            var fileInfo = new FileInfo(filePath);
            var fileName = Path.GetFileName(filePath);

            // 파일 정보 전송 (이름 길이, 이름, 파일 크기)
            byte[] fileNameBytes = System.Text.Encoding.UTF8.GetBytes(fileName);
            await stream.WriteAsync(BitConverter.GetBytes(fileNameBytes.Length), 0, 4);
            await stream.WriteAsync(fileNameBytes, 0, fileNameBytes.Length);
            await stream.WriteAsync(BitConverter.GetBytes(fileInfo.Length), 0, 8);

            // 파일 데이터 전송
            using (var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read))
            {
                byte[] buffer = new byte[BUFFER_SIZE];
                long totalSent = 0;
                int bytesRead;

                while ((bytesRead = await fileStream.ReadAsync(buffer, 0, buffer.Length)) > 0)
                {
                    await stream.WriteAsync(buffer, 0, bytesRead);
                    totalSent += bytesRead;

                    ProgressChanged?.Invoke(this, new FileTransferProgress
                    {
                        FileName = fileName,
                        BytesTransferred = totalSent,
                        TotalBytes = fileInfo.Length
                    });
                }
            }

            TransferCompleted?.Invoke(this, fileName);
        }
        catch (Exception ex)
        {
            TransferFailed?.Invoke(this, $"Failed to send file: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// 스트림에서 파일 수신
    /// </summary>
    public async Task<string> ReceiveFileAsync(Stream stream, string downloadDirectory)
    {
        try
        {
            // 파일 정보 수신
            byte[] nameLengthBytes = new byte[4];
            await stream.ReadAsync(nameLengthBytes, 0, 4);
            int nameLength = BitConverter.ToInt32(nameLengthBytes, 0);

            byte[] nameBytes = new byte[nameLength];
            await stream.ReadAsync(nameBytes, 0, nameLength);
            string fileName = System.Text.Encoding.UTF8.GetString(nameBytes);

            byte[] fileSizeBytes = new byte[8];
            await stream.ReadAsync(fileSizeBytes, 0, 8);
            long fileSize = BitConverter.ToInt64(fileSizeBytes, 0);

            // 다운로드 디렉토리 생성
            if (!Directory.Exists(downloadDirectory))
            {
                Directory.CreateDirectory(downloadDirectory);
            }

            string filePath = Path.Combine(downloadDirectory, fileName);

            // 중복 파일명 처리
            int counter = 1;
            while (File.Exists(filePath))
            {
                string fileNameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
                string extension = Path.GetExtension(fileName);
                filePath = Path.Combine(downloadDirectory, $"{fileNameWithoutExt}_{counter}{extension}");
                counter++;
            }

            // 파일 데이터 수신
            using (var fileStream = new FileStream(filePath, FileMode.Create, FileAccess.Write))
            {
                byte[] buffer = new byte[BUFFER_SIZE];
                long totalReceived = 0;
                int bytesRead;

                while (totalReceived < fileSize)
                {
                    int toRead = (int)Math.Min(BUFFER_SIZE, fileSize - totalReceived);
                    bytesRead = await stream.ReadAsync(buffer, 0, toRead);
                    
                    if (bytesRead == 0)
                        break;

                    await fileStream.WriteAsync(buffer, 0, bytesRead);
                    totalReceived += bytesRead;

                    ProgressChanged?.Invoke(this, new FileTransferProgress
                    {
                        FileName = fileName,
                        BytesTransferred = totalReceived,
                        TotalBytes = fileSize
                    });
                }
            }

            TransferCompleted?.Invoke(this, fileName);
            return filePath;
        }
        catch (Exception ex)
        {
            TransferFailed?.Invoke(this, $"Failed to receive file: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// 여러 파일을 ZIP으로 압축하여 전송
    /// </summary>
    public async Task SendFilesAsZipAsync(Stream stream, string[] filePaths, string zipName = "files.zip")
    {
        using (var memoryStream = new MemoryStream())
        {
            using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Create, true))
            {
                foreach (var filePath in filePaths)
                {
                    if (File.Exists(filePath))
                    {
                        var fileName = Path.GetFileName(filePath);
                        var entry = archive.CreateEntry(fileName);
                        
                        using (var entryStream = entry.Open())
                        using (var fileStream = File.OpenRead(filePath))
                        {
                            await fileStream.CopyToAsync(entryStream);
                        }
                    }
                }
            }

            memoryStream.Position = 0;

            // ZIP 파일 정보 전송
            byte[] zipNameBytes = System.Text.Encoding.UTF8.GetBytes(zipName);
            await stream.WriteAsync(BitConverter.GetBytes(zipNameBytes.Length), 0, 4);
            await stream.WriteAsync(zipNameBytes, 0, zipNameBytes.Length);
            await stream.WriteAsync(BitConverter.GetBytes(memoryStream.Length), 0, 8);

            // ZIP 데이터 전송
            await memoryStream.CopyToAsync(stream);
            
            TransferCompleted?.Invoke(this, zipName);
        }
    }
}
