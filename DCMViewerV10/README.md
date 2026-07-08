# DCMViewerV10

Windows�� DICOM �� �Ϲ� �̹��� ����Դϴ�. C# Windows Forms�� [fo-dicom](https://github.com/fo-dicom/fo-dicom)���� �ۼ��Ǿ����ϴ�.

## ���� ����

| ���� | Ȯ���� |
|------|--------|
| DICOM | `.dcm`, `.dicm` |
| �̹��� | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.tif`, `.tiff`, `.ico` |

> `.ico` ������ **���� ����**�Դϴ�. �������� ��� ���Ŀ��� ���Ե��� �ʽ��ϴ�.

## �ֿ� ���

- DICOM / �̹��� ���� ���� ����, Ȯ�롤��ҡ��д�
- ���� **���� Ʈ��** Ž�� (�� �� Ŭ�� �̸�����, ����/���� ���� �̵�)
- DICOM ��Ÿ������ �� �Ϲ� �̹��� ���� ǥ��
- PNG / JPEG / BMP / TIFF / GIF ��������
- ���� ���� DCM **�ϰ� ��ȯ** (���: `converted_{����}` ���� ����)
- `.dcm` Windows ���� ���� �� �⺻ ���α׷� ���
- ������ �۾� ���� ��� (`%LocalAppData%\DCMViewer\last_directory.txt`)

## ���� ȯ��

- Visual Studio 2022 �̻� (Windows Forms Designer ����)
- .NET 8 SDK (`net8.0-windows`, `win-x64`)

## ���� �� ����

```powershell
cd DCMViewer
dotnet build
dotnet run
```

���� ���� `DCMViewer.exe`�� ������ ���� ���� �ܰ谡 ������ �� �ֽ��ϴ�. ���� ������ �� �ٽ� �����ϼ���.

## Release ���� �� MSI ����

Release �������� �����ϸ� publish �� WiX�� MSI�� �ڵ� �����˴ϴ�.

```powershell
cd DCMViewer
dotnet build -c Release
```

��� ���:

| ���⹰ | ��� |
|--------|------|
| publish ��� | `DCMViewer/bin/Release/net8.0-windows/win-x64/publish` |
| MSI ��ġ ���� | `DCMViewer.Installer/bin/x64/Release/DCMViewer.Installer.msi` |

MSI ��ġ �� **����� ����** �ܰ迡�� ���� �׸��� ������ �� �ֽ��ϴ� (�⺻��: ��� ����).

- **���� �޴� �ٷ� ����** ? ���� �޴��� DCMViewer ��ũ ����
- **���� ȭ�� �ٷ� ����** ? ���� ȭ�鿡 DCMViewer ��ũ ����
- **.dcm �⺻ ���α׷� ���** ? `.dcm` ���� ���� �� Windows �⺻ ���α׷� ����

## ������ (Assets)

| ���� | �뵵 |
|------|------|
| `DCMViewer/Assets/AppIcon.ico` | ���� ���� �� â ������ |
| `DCMViewer/Assets/DcmFile.ico` | `.dcm` ���� ���� ������ (Ž���⡤���� ����) |

������ �����:

```powershell
cd DCMViewer
./Assets/GenerateIcons.ps1
```

## .dcm ���� ����

�� �Ǵ� MSI ��ġ �� **.dcm �⺻ ���α׷� ���**�� �����ϸ� Ž���⿡�� `.dcm` ������ DCMViewer�� �� �� �ֽ��ϴ�.

- ������: `DCMViewer.exe "���\����.dcm"`
- �޴�: **���� �� DCM �⺻ ���α׷����� ���**

## ���� DICOM �ٿ�ε�

�׽�Ʈ�� DICOM ������ `samples` ������ ���� �� �ֽ��ϴ�.

```powershell
$dest = "samples"
New-Item -ItemType Directory -Path $dest -Force | Out-Null

$files = @(
    @{ Name = "CT_small.dcm";         Url = "https://github.com/pydicom/pydicom/raw/main/src/pydicom/data/test_files/CT_small.dcm" },
    @{ Name = "MR_small.dcm";         Url = "https://github.com/pydicom/pydicom/raw/main/src/pydicom/data/test_files/MR_small.dcm" },
    @{ Name = "SC_rgb_small_odd.dcm"; Url = "https://github.com/pydicom/pydicom/raw/main/src/pydicom/data/test_files/SC_rgb_small_odd.dcm" },
    @{ Name = "JPEG2000.dcm";         Url = "https://github.com/pydicom/pydicom/raw/main/src/pydicom/data/test_files/JPEG2000.dcm" },
    @{ Name = "MR000000.dcm";         Url = "https://github.com/dangom/sample-dicom/raw/master/MR000000.dcm" }
)

foreach ($f in $files) {
    Invoke-WebRequest -Uri $f.Url -OutFile (Join-Path $dest $f.Name)
}

Get-ChildItem $dest -Filter "*.dcm"
```

### ����

- �� URL�� ����� �� ������, 404�� ���� �ٸ� ���� DICOM�� ����ϼ���.
- JPEG / JPEG2000 �� ���� DICOM�� `fo-dicom.Codecs`�� Visual C++ ����� ��Ű���� �ʿ��� �� �ֽ��ϴ�.

## ������Ʈ ����

```
DCMViewerV10/
������ DCMViewer/              # ���� WinForms ��
������ DCMViewer.Installer/    # WiX MSI ��ġ ������Ʈ
������ samples/                # �׽�Ʈ�� DICOM (����)
������ README.md
������ UsersGuide.md           # ����� ���̵�
```

## ����

- [UsersGuide.md](UsersGuide.md) ? ��ɺ� ��� ���
- [DCMViewer/Assets/README.md](DCMViewer/Assets/README.md) ? ������ ���ҽ�

## ���۱�

Copyright ? 2026 SHKWON (knix008@naver.com)
