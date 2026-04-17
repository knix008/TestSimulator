# YOLO26 Brain CT Training Results

Date: 2026-04-17  
Project: `YOLO26Training`  
Device: `NVIDIA GeForce RTX 4070 Laptop GPU` (`CUDA:0`)

---

## 1) Detection Training Result

### Run Information

| Item | Value |
|---|---|
| Task | Detection |
| Epochs | 30 |
| Run name | `ct_brain_det_gpu` |
| Data config | `yolo_data_det.yaml` |
| Model config | `yolo26.yaml` |

### Final Validation Metrics (best.pt)

| Metric | Value |
|---|---|
| Precision (P) | `0.387` |
| Recall (R) | `0.509` |
| mAP50 | `0.444` |
| mAP50-95 | `0.246` |

### Class-wise (mAP50-95)

| Class | mAP50-95 |
|---|---|
| aneurysm | `0.157` |
| cancer | `0.209` |
| tumor | `0.374` |

### Artifacts

| Type | Path |
|---|---|
| Weights (best) | `runs/detect/yolo26_runs/ct_brain_det_gpu/weights/best.pt` |
| Weights (last) | `runs/detect/yolo26_runs/ct_brain_det_gpu/weights/last.pt` |
| Exported ONNX | `models/yolo26-brain-ct-det.onnx` |

---

## 2) Segmentation Training Result

### Run Information

| Item | Value |
|---|---|
| Task | Segmentation |
| Epochs | 50 |
| Run name | `ct_brain_seg_gpu` |
| Data config | `yolo_data_seg.yaml` |
| Model config | `yolo26-seg.yaml` |
| Label source | Pseudo labels from detection boxes |

### Final Validation Metrics (best.pt)

| Branch | Precision (P) | Recall (R) | mAP50 | mAP50-95 |
|---|---:|---:|---:|---:|
| Box | `0.667` | `0.671` | `0.789` | `0.416` |
| Mask | `0.654` | `0.677` | `0.802` | `0.454` |

### Class-wise Mask (mAP50-95)

| Class | Mask mAP50-95 |
|---|---|
| aneurysm | `0.467` |
| cancer | `0.305` |
| tumor | `0.591` |

### Artifacts

| Type | Path |
|---|---|
| Weights (best) | `runs/segment/yolo26_runs/ct_brain_seg_gpu/weights/best.pt` |
| Weights (last) | `runs/segment/yolo26_runs/ct_brain_seg_gpu/weights/last.pt` |
| Exported ONNX | `models/yolo26-brain-ct-seg.onnx` |

---

## 3) Notes

- Segmentation labels in this run are pseudo labels converted from detection boxes, not true lesion polygons/masks.
- For better segmentation quality, replace pseudo labels with manually annotated real masks.

---

## 4) Next Experiment Template

Copy this section to append future runs.

```markdown
## Experiment: <name>

Date: <YYYY-MM-DD>
Device: <GPU/CPU>

### Detection
| Metric | Value |
|---|---|
| Precision (P) | `<value>` |
| Recall (R) | `<value>` |
| mAP50 | `<value>` |
| mAP50-95 | `<value>` |

### Segmentation
| Branch | Precision (P) | Recall (R) | mAP50 | mAP50-95 |
|---|---:|---:|---:|---:|
| Box | `<value>` | `<value>` | `<value>` | `<value>` |
| Mask | `<value>` | `<value>` | `<value>` | `<value>` |

### Artifact Paths
- Detection best: `<path>`
- Segmentation best: `<path>`
- Detection ONNX: `<path>`
- Segmentation ONNX: `<path>`

### Notes
- <memo>
```
