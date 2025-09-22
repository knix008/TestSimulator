# Face Recognition Engine API Documentation

## Overview
이 문서는 얼굴 인식 엔진과 상호작용하기 위한 인터페이스를 설명합니다.  
얼굴 인식 엔진 초기화, 인물 등록 및 삭제, 신원 확인 및 동일인 확인 기능을 포함합니다.

## Workflow
![Workflow](face_recognition_workflow.jpg)

---

<details>
<summary style="font-size: 20px;">엔진 초기화 관련 함수</summary>

### 1. Initialize Face Recognition Engine

**Method:** `Initialize`

**Description:** 얼굴 인식에 필요한 변수와 모듈을 초기화합니다.

**Input:** `void`

**Output:** `bool` - 초기화 성공 여부를 나타냅니다.
</details>

---

<details>
<summary style="font-size: 20px;">신원 확인 관련 함수</summary>

### 1. Initialize Gallery

**Method:** `InitGallery`

**Description:** 신원 보장 목록(gallery)을 초기화합니다.

**Input:**
- `unsigned int num_user` - 등록할 인물의 수.
- `unsigned int* uids` - gallery에 등록할 인물들의 ID 값들.
- `float* features` - gallery에 등록할 인물들의 특징 값들.

**Output:** `bool` - 초기화 성공 여부를 나타냅니다.

---

### 2. Delete Gallery

**Method:** `DeleteGallery`

**Description:** 신원 보장 목록(gallery)을 삭제합니다.

**Input:** `void`

**Output:** `void`

---

### 3. Add Person

**Method:** `AddPerson`

**Description:** 신원 보장 목록(gallery)에 신규 인원을 등록하거나 기등록된 인물 정보를 갱신합니다.

**Input:**
- `unsigned int uid` - 등록할 인물의 ID.
- `unsigned char* buf` - 입력 이미지 버퍼(format: RGB).
- `int width` - 입력 이미지 버퍼의 넓이.
- `int height` - 입력 이미지 버퍼의 높이.

**Output:** `std::vector<float>` - 추출한 얼굴 특징 값을 벡터 형태(512차원)로 반환하며, 등록 또는 갱신에 실패한 경우 빈 벡터를 반환합니다.

---

### 4. Delete Person

**Method:** `DeletePerson`

**Description:** 특정 인물을 신원 보장 목록(gallery)에서 제거합니다.

**Input:** `unsigned int uid` - 제거할 인물의 ID.

**Output:** `bool` - 제거 성공 여부를 나타냅니다.

---

### 5. Get Gallery

**Method:** `GetGalleryIDs`

**Description:** 신원 보장 목록(gallery)에 등록된 인물들을 확인합니다.

**Input:**  `void`

**Output:** `std::vector<unsigned int>` - gallery에 등록된 인물들의 ID 값들.

---

### 6. Identify

**Method:** `Identify`

**Description:** 신원 보장 목록(gallery)에서 입력 이미지에 대응하는 인물을 확인합니다.

**Input:**
- `unsigned char* buf` - 입력 이미지 버퍼(format: RGB).
- `int width` - 입력 이미지 버퍼의 넓이.
- `int height` - 입력 이미지 버퍼의 높이.

**Output:** `RecognitionResult` - 얼굴 분석 결과를 포함하는 구조체를 반환합니다.

</details>

---

<details>
<summary style="font-size: 20px;">동일인 확인 관련 함수</summary>

### 1. Verify

**Method:** `Verify`

**Description:** 두 개의 입력 이미지를 전달받아 동일인 여부를 확인합니다.

**Input:**
- `unsigned char* real_buf` - 실시간 입력 이미지 버퍼(format: RGB).
- `int real_width` - 실시간 입력 이미지 버퍼의 넓이.
- `int real_height` - 실시간 입력 이미지 버퍼의 높이.
- `unsigned char* id_buf` - 신분증명서 입력 이미지 버퍼(format: RGB).
- `int id_width` - 신분증명서 입력 이미지 버퍼의 넓이.
- `int id_height` - 신분증명서 입력 이미지 버퍼의 높이.

**Output:** `RecognitionResult` - 얼굴 분석 결과를 포함하는 구조체를 반환합니다(real 기준).
</details>

---

<details>
<summary style="font-size: 20px;">Parameter Settings</summary>

### 1. Set Maximum Face Aspect Ratio

**Method:** `SetMaxFaceAspectRatio`

**Description:** 감지할 얼굴의 최대 종횡비를 설정합니다(기본: 1.5).

**Input:** `float ratio`

**Output:** `void`

---

### 2. Get Maximum Face Aspect Ratio

**Method:** `GetMaxFaceAspectRatio`

**Description:** 현재 설정된 얼굴 최대 종횡비를 가져옵니다.

**Input:** `void`

**Output:** `float`

---

### 3. Set Maximum Face Degree

**Method:** `SetMaxFaceDegree`

**Description:** 감지할 얼굴의 최대 각도를 설정합니다(기본: 30º).

**Input:** `float degree`

**Output:** `void`

---

### 4. Get Maximum Face Degree

**Method:** `GetMaxFaceDegree`

**Description:** 현재 설정된 얼굴 최대 각도를 가져옵니다.

**Input:** `void`

**Output:** `float`

---

### 5. Set Minimum Face Size

**Method:** `SetMinFaceSize`

**Description:** 감지할 얼굴의 최소 크기를 설정합니다(기본: 2500px).

**Input:** `unsigned int size`

**Output:** `void`

---

### 6. Get Minimum Face Size

**Method:** `GetMinFaceSize`

**Description:** 현재 설정된 얼굴 최소 크기를 가져옵니다.

**Input:** `void`

**Output:** `unsigned int`

---

### 7. Set Detection Threshold

**Method:** `SetDetTh`

**Description:** 얼굴 검출 임계치를 설정합니다(기본: 0.7).

**Input:** `float th`

**Output:** `void`

---

### 8. Get Detection Threshold

**Method:** `GetDetTh`

**Description:** 현재 설정된 얼굴 검출 임계치를 가져옵니다.

**Input:** `void`

**Output:** `float`

---

### 9. Set Face Anti-Spoofing Threshold

**Method:** `SetFASTh`

**Description:** 얼굴 위변조 탐지 임계치를 설정합니다(기본: 0.5).

**Input:** `float th`

**Output:** `void`

---

### 10. Get Face Anti-Spoofing Threshold

**Method:** `GetFASTh`

**Description:** 현재 설정된 얼굴 위변조 탐지 임계치를 가져옵니다.

**Input:** `void`

**Output:** `float`

---

### 11. Set 1:N Identification Threshold

**Method:** `SetFaceRecogTh1N`

**Description:** 1:N 신원 확인 임계치를 설정합니다(기본: 0.5).

**Input:** `float th`

**Output:** `void`

---

### 12. Get 1:N Identification Threshold

**Method:** `GetFaceRecogTh1N`

**Description:** 현재 설정된 1:N 신원 확인 임계치를 가져옵니다.

**Input:** `void`

**Output:** `float`

---

### 13. Set 1:1 Verification Threshold

**Method:** `SetFaceRecogTh11`

**Description:** 1:1 동일인 확인 임계치를 설정합니다(기본: 0.5).

**Input:** `float th`

**Output:** `void`

---

### 14. Get 1:1 Verification Threshold

**Method:** `GetFaceRecogTh11`

**Description:** 현재 설정된 1:1 동일인 확인 임계치를 가져옵니다.

**Input:** `void`

**Output:** `float`

---

### 15. Enable Face Anti-Spoofing

**Method:** `EnableFAS`

**Description:** 얼굴 위변조 탐지 기능을 활성화합니다.

**Input:** `void`

**Output:** `void`

---

### 16. Disable Face Anti-Spoofing

**Method:** `DisableFAS`

**Description:** 얼굴 위변조 탐지 기능을 비활성화합니다.

**Input:** `void`

**Output:** `void`
</details>

---

<details>
<summary style="font-size: 20px;">공통 구조체 및 결과 코드</summary>

### ResultCode 열거형

```cpp
enum ResultCode {
    SUCCESS = 0,                     // 얼굴 인식 성공
    INPUT_DATA_INVALID = 1,          // 입력 데이터 오류
    FACE_DETECTION_FAILED = 2,       // 얼굴 검출 실패 (모델 오류, 메모리 문제 등)
    NO_FACE_DETECTED = 3,            // 얼굴이 검출되지 않음
    FACE_SIZE_TOO_SMALL = 4,         // 얼굴 크기가 너무 작음
    FACE_ASPECT_RATIO_TOO_BIG = 5,   // 얼굴 종횡비가 너무 큼
    FACE_POSE_ESTIMATION_FAILED = 6, // 얼굴 각도 추정 실패
    FACE_POSE_TOO_BIG = 7,           // 얼굴 각도가 너무 큼
    FACE_ANTI_SPOOFING_DETECTED = 8, // 얼굴 위변조 탐지
    FEATURE_EXTRACTION_FAILED = 9,   // 얼굴 특징 추출 실패
    UNKNOWN_ERROR = 99               // 알 수 없는 기타 오류
};
```

### RecognitionResult 구조체

```cpp
struct RecognitionResult {
    int x = 0;                  // 얼굴 영역의 X 좌표
    int y = 0;                  // 얼굴 영역의 Y 좌표
    int w = 0;                  // 얼굴 영역의 너비
    int h = 0;                  // 얼굴 영역의 높이
    int id = -1;                // 식별된 ID
    int ve = -1;                // 동일인 여부 (0: 동일인, 1: 비동일인)
    float score = 0.f;          // 유사도 점수
    std::vector<float> feature; // 얼굴 특징값 (512차원 벡터)
    ResultCode rcode;           // 인식 결과 코드
};
```

</details>