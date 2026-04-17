# Model Readiness Assessment

Date: 2026-04-17  
Project: `YOLO26Training`  
Scope: Public Brain CT dataset 기반 고성능 Detection + Segmentation 결과의 실사용 가능성 평가

---

## 1) Evaluated Runs

| Task | Run | Best Weights |
|---|---|---|
| Detection | `ct_det_public_highperf` | `runs/detect/yolo26_runs/ct_det_public_highperf/weights/best.pt` |
| Segmentation | `ct_seg_public_highperf` | `runs/segment/yolo26_runs/ct_seg_public_highperf/weights/best.pt` |

---

## 2) Key Metrics (Validation)

| Task | Precision | Recall | mAP50 | mAP50-95 |
|---|---:|---:|---:|---:|
| Detection (Box) | `0.621` | `0.381` | `0.434` | `0.202` |
| Segmentation (Mask) | `0.471` | `0.364` | `0.385` | `0.153` |

Interpretation:
- Detection은 병변 위치 후보 탐색에는 의미가 있으나 누락(Recall)과 정밀 위치 정확도(mAP50-95)가 아직 낮음.
- Segmentation은 대략적 영역 표시는 가능하나 경계 정밀도/일관성이 실사용 수준에는 부족.

---

## 3) Readiness Decision Table

| Use Case | Current Suitability | Decision |
|---|---|---|
| 연구/프로토타이핑 (모델 비교, 파이프라인 검증) | 충분 | **사용 가능** |
| 후보 병변 하이라이트(참고용 시각화) | 부분 가능 | **제한적 사용 가능** |
| 자동 판독/의료 의사결정 보조 | 부족 | **사용 비권장** |
| 정량 리포트(면적/경계 기반) | 부족 | **사용 비권장** |

---

## 4) Risk Assessment

| Risk | Current Level | Note |
|---|---|---|
| False Negative (미검출) | High | Recall이 낮아 병변 누락 위험 존재 |
| False Positive (과검출) | Medium | 저신뢰 박스/마스크가 일부 이미지에서 관찰됨 |
| Boundary Accuracy (경계 정밀도) | High | Seg mAP50-95가 낮아 경계 기반 신뢰도 부족 |
| Domain Generalization | High | 단일 공개 데이터셋 기준, 외부 도메인 검증 미실시 |

---

## 5) Practical Recommendation

Current verdict: **Research-ready, Not clinical-ready.**

권장 최소 목표(실사용 검토 전):
- Detection: `mAP50-95 >= 0.35`, `Recall >= 0.60`
- Segmentation: `Mask mAP50-95 >= 0.30`, `Recall >= 0.55`

다음 개선 우선순위:
1. 라벨 품질 개선(정확 bbox/mask, 라벨 일관성 점검)
2. 데이터 확장 및 클래스 균형 개선
3. Threshold/NMS 튜닝(`conf`, `iou`) 및 후처리 규칙 적용
4. 외부 검증셋 분리 평가(기관/장비 도메인 분리)
5. 재학습 후 동일 지표로 재판정

---

## 6) Artifact Paths for Review

- Detection inference: `inference_outputs_public_highperf_both/detection`
- Segmentation inference: `inference_outputs_public_highperf_both/segmentation`
- Readable styled outputs: `inference_outputs_public_highperf_readable`
- Colored segmentation outputs: `inference_outputs_public_highperf_colored`

