Param(
    [int]$Epochs = 30,
    [string]$RunName = "ct_brain_det_auto",
    [string]$Device = "0"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "venv")) {
    Write-Host "[INFO] venv not found. Creating environment..."
    python -m venv venv
}

Write-Host "[INFO] Activating venv and installing requirements..."
& .\venv\Scripts\python.exe -m pip install --upgrade pip
& .\venv\Scripts\python.exe -m pip install -r requirements.txt

Write-Host "[1/3] Downloading dataset from Kaggle..."
& .\venv\Scripts\python.exe scripts\download_kaggle_ct.py

Write-Host "[2/3] Converting dataset to YOLO detection format..."
& .\venv\Scripts\python.exe scripts\convert_to_yolo.py

Write-Host "[3/3] Training detection model (epochs=$Epochs, run=$RunName, device=$Device)..."
& .\venv\Scripts\python.exe scripts\train_yolo26.py `
    --task "detect" `
    --data "yolo_data_det.yaml" `
    --model "yolo26.yaml" `
    --onnx-name "yolo26-brain-ct-det.onnx" `
    --epochs $Epochs `
    --name $RunName `
    --project "yolo26_runs" `
    --device $Device

Write-Host "Done. Detection outputs:"
Write-Host "  runs/detect/yolo26_runs/$RunName/weights/best.pt"
Write-Host "  runs/detect/yolo26_runs/$RunName/weights/last.pt"
Write-Host "  models/yolo26-brain-ct-det.onnx"
