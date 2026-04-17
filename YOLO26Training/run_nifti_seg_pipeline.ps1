Param(
    [Parameter(Mandatory = $true)]
    [string]$CtDir,
    [Parameter(Mandatory = $true)]
    [string]$MaskDir,
    [string]$OutputRoot = "yolo_dataset_seg_real",
    [string]$RunName = "ct_seg_real_labels",
    [int]$Epochs = 50,
    [string]$Device = "0",
    [float]$Conf = 0.10,
    [switch]$RunInference = $false,
    [string]$InferenceSource = "",
    [string]$ClassName = "hemorrhage",
    [int]$ClassId = 0
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "venv")) {
    Write-Host "[INFO] venv not found. Creating environment..."
    python -m venv venv
}

Write-Host "[INFO] Installing requirements..."
& .\venv\Scripts\python.exe -m pip install --upgrade pip
& .\venv\Scripts\python.exe -m pip install -r requirements.txt

Write-Host "[1/5] Checking NIfTI CT/mask pairs..."
& .\venv\Scripts\python.exe scripts\check_nifti_pairs.py `
    --ct-dir $CtDir `
    --mask-dir $MaskDir

Write-Host "[2/5] Converting NIfTI to YOLO segmentation dataset..."
& .\venv\Scripts\python.exe scripts\convert_nifti_ct_to_yolo_seg.py `
    --ct-dir $CtDir `
    --mask-dir $MaskDir `
    --output-root $OutputRoot `
    --class-id $ClassId `
    --class-name $ClassName

$DataYaml = Join-Path $OutputRoot "dataset.yaml"
if (-not (Test-Path $DataYaml)) {
    throw "Dataset YAML not found: $DataYaml"
}

Write-Host "[3/5] Training segmentation model..."
& .\venv\Scripts\python.exe scripts\train_yolo26.py `
    --task "segment" `
    --data $DataYaml `
    --model "yolo26-seg.yaml" `
    --onnx-name "yolo26-brain-ct-seg-real.onnx" `
    --epochs $Epochs `
    --name $RunName `
    --project "yolo26_runs" `
    --device $Device

$BestPt = "runs/segment/yolo26_runs/$RunName/weights/best.pt"
if (-not (Test-Path $BestPt)) {
    throw "Best model not found: $BestPt"
}

if ($RunInference) {
    if ([string]::IsNullOrWhiteSpace($InferenceSource)) {
        throw "When -RunInference is used, -InferenceSource must be provided."
    }

    Write-Host "[4/5] Running segmentation inference..."
    & .\venv\Scripts\python.exe scripts\infer_ct.py `
        --source $InferenceSource `
        --detect-model "runs/detect/yolo26_runs/ct_brain_det_gpu/weights/best.pt" `
        --seg-model $BestPt `
        --output-dir "inference_outputs_real_seg" `
        --conf $Conf `
        --device $Device

    Write-Host "[5/5] Collecting positive predictions..."
    & .\venv\Scripts\python.exe scripts\collect_positive_predictions.py `
        --source $InferenceSource `
        --detect-model "runs/detect/yolo26_runs/ct_brain_det_gpu/weights/best.pt" `
        --seg-model $BestPt `
        --output-dir "positive_predictions_real_seg" `
        --conf $Conf `
        --device $Device
}
else {
    Write-Host "[4/5] Skipped inference (-RunInference not set)."
    Write-Host "[5/5] Skipped positive collection (-RunInference not set)."
}

Write-Host "Done."
Write-Host "Best weights: $BestPt"
Write-Host "ONNX: models/yolo26-brain-ct-seg-real.onnx"
