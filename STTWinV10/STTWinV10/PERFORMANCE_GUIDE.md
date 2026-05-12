# STT 성능 최적화 가이드

## 🚀 STT 파이프라인 요약

앱은 **Whisper.net 기본 `WhisperProcessor` 옵션**에 가깝게 두고, **`WithLanguage("ko")`만** 지정합니다. 스레드 수·온도·프롬프트·`SplitOnWord`·무음 RMS 스킵 등은 **빌더에서 건드리지 않습니다**. 전사 **텍스트**에서는 반각/전각 **대괄호로만 둘러싼 블록**을 구조적으로 제거합니다(내용 추측·치환 없음).

### 1. **언어**
- **한국어 `ko` 고정** — 자동 언어 감지(`WithLanguageDetection`) 미사용

### 2. **실시간 처리**
- `RealtimeSTTService`의 타이머 간격·최소 버퍼 샘플 수 등은 **캡처 파이프라인** 설정입니다(Whisper 디코더 옵션과 별개).

### 3. **GPU 가속 (선택)**
- NVIDIA GPU 사용 시 `Whisper.net.Runtime.Cuda` 패키지 및 Whisper.net 문서에 맞는 **모델 로드/팩토리** 구성이 필요합니다. 현재 `WhisperSTTService`는 파일 경로 기준 `WhisperFactory.FromPath`만 사용합니다.

---

## ⚙️ 디코더를 직접 바꾸려면

`WhisperSTTService.InitializeAsync()` 안의 `CreateBuilder()` 체인에 `WithThreads`, `WithTemperature`, `WithPrompt`, `SplitOnWord` 등을 **필요할 때만** 추가하면 됩니다.

```csharp
// 현재(요지)
_processor = factory.CreateBuilder()
    .WithLanguage(WhisperSTTService.RecognitionLanguage)
    .Build();
```

### 속도 vs 품질 (참고)

| 방법 | 효과 |
|------|------|
| 더 큰 GGML 모델(Small, Large) | 정확도 향상, CPU·메모리 부담 증가 |
| `processingIntervalSeconds` 조정 | 반응성 vs 부하 트레이드오프 |
| 빌더에 `WithThreads(n)` 추가 | 인코딩/디코딩 스레드 수 명시(미지정 시 Whisper.net이 하드웨어에 맞게 설정) |

---

## 🎮 GPU 가속 활성화 (NVIDIA GPU 사용자)

### 1. STTWinV10.csproj 수정

```xml
<ItemGroup>
  <PackageReference Include="Whisper.net.Runtime.Cuda" Version="1.7.0" />
</ItemGroup>
```

위의 주석을 해제하고 패키지를 복원합니다.

### 2. MainWindow.xaml.cs (GPU 사용 시 개념)

GPU 가속은 **CUDA 런타임 패키지**와 Whisper.net에서 안내하는 **GPU용 모델 로드** 방식을 맞춰야 합니다. `WhisperSTTService`를 그에 맞게 수정해야 할 수 있습니다.

### 3. 요구 사항
- NVIDIA GPU (CUDA Compute Capability 3.5 이상)
- CUDA Toolkit 설치 (11.x 이상)

### 4. 성능 향상
- CPU 대비 **2~5배** 빠른 처리 속도
- 특히 Large 모델에서 큰 차이

---

## 🔧 모델별 참고

GGML 파일만 다르며, **디코더 빌더는 동일**합니다. 정확도와 속도·메모리는 모델 크기에 따라 달라집니다.

### Tiny 모델 (75MB)
- 저사양·빠른 응답 위주

### Base 모델 (142MB) - **권장**
- 속도와 품질 균형

### Small 모델 (466MB)
- 정확도 우선, CPU/GPU 부담 증가

### Large-v3 모델 (2.9GB)
- 최고 정확도, **GPU 권장**

---

## 📊 성능 비교 (참고)

아래 수치는 **과거 빔 크기 비교 예시**이며, 현재 앱은 Whisper.net 기본 디코더에 **`ko`만 지정**합니다. 실제 RTF는 CPU·모델·런타임에 따라 다릅니다.

### CPU (Intel i7-12700K, 12코어) — 대략적 RTF
| 모델 | 기본 디코더(참고) |
|------|------------------|
| Tiny | ~0.1초/초 |
| Base | ~0.3초/초 |
| Small | ~1.0초/초 |
| Large-v3 | ~3.0초/초 |

### GPU (NVIDIA RTX 4070) — 대략적 RTF
| 모델 | 기본 디코더(참고) |
|------|------------------|
| Tiny | ~0.05초/초 |
| Base | ~0.1초/초 |
| Small | ~0.3초/초 |
| Large-v3 | ~1.0초/초 |

*"초/초"는 1초 오디오 처리에 걸리는 시간*

---

## 💡 추가 팁

1. **실시간 처리**
   - `processingIntervalSeconds`를 2~3초로 설정 (현재 3초)
   - 너무 짧으면 잦은 처리로 오버헤드 증가

2. **배치 처리**
   - 긴 오디오 파일은 `TranscribeFileAsync` 사용
   - 실시간보다 효율적

3. **메모리 관리**
   - Large 모델은 4GB+ RAM 필요
   - 메모리 부족 시 Small 모델 권장

4. **정확도 향상**
   - 마이크 품질 확인 (16kHz 이상)
   - 배경 소음 최소화
   - 명확한 발음

---

## 🆚 Whisper.net vs faster-whisper

| 특징 | Whisper.net | faster-whisper |
|------|-------------|----------------|
| 언어 | C# (.NET) | Python |
| 기반 | whisper.cpp | CTranslate2 |
| 성능 | ⚡⚡⚡ | ⚡⚡⚡⚡ |
| 통합 | 네이티브 | 별도 프로세스 필요 |
| GPU 지원 | CUDA | CUDA, TensorRT |
| 배포 | 단일 실행 파일 | Python 런타임 필요 |

**결론**: C# WPF 애플리케이션에서는 **Whisper.net이 더 적합**합니다. faster-whisper는 Python 환경이 필요하고 IPC 오버헤드가 발생합니다.

---

## 🔍 문제 해결

### "처리 속도가 느려요"
1. 더 작은 모델 사용 (Base 또는 Tiny)
2. GPU 가속 활성화
3. `processingIntervalSeconds` 증가
4. `WhisperSTTService`의 `CreateBuilder()`에 `WithThreads`, `WithTemperature` 등을 추가해 동작을 조정

### "정확도가 낮아요"
1. 더 큰 모델 사용 (Small 또는 Large)
2. `WhisperSTTService` 빌더에 `WithPrompt` 등 whisper.net 옵션을 추가해 문맥·스타일 조정(환경에 따라 효과 다름)
3. 마이크 볼륨·배경 소음 조정
4. 짧은 말이 잘리면 `RealtimeSTTService.MinSamplesForPeriodicDecode` 또는 처리 간격 조정

### "GPU가 인식되지 않아요"
1. CUDA Toolkit 설치 확인
2. NVIDIA 드라이버 최신 버전 설치
3. Whisper.net.Runtime.Cuda 패키지 설치 확인
4. GPU 메모리 부족 시 모델 크기 줄이기

---

## 📈 향후 개선 계획

- [ ] UI에서 성능 옵션 직접 조정 가능
- [ ] 자동 GPU 감지 및 활성화
- [ ] 실시간 성능 모니터링 (FPS, 처리 시간)
- [ ] 커스텀 모델 지원
- [ ] 배치 처리 큐 시스템

---

**현재 설정으로도 충분히 빠른 성능을 제공합니다!** 🚀
