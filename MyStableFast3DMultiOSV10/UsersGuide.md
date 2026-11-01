# MyStableFast3D 사용 설명서 (요약)

그림이 들어간 전체 설명서는 **`doc/Guide.html`**(한국어) · **`doc/Guide.en.html`**(English) 이며,
프로그램 툴바 오른쪽의 **[사용 설명서]** 버튼으로 엽니다.

## 1. 처음 실행

1. 설치 파일을 실행하고 프로그램을 엽니다.
2. 엔진이 자동으로 설치됩니다(Python · PyTorch · 모델, 수 분~수십 분). 과정은 아래 **로그 패널**에 보입니다.
3. 상태 표시줄 오른쪽에 **준비됨 · (장치)** 가 나오면 쓸 수 있습니다.
4. Stable Fast 3D 는 Hugging Face 약관 동의와 토큰이 필요합니다 → 설정 → 엔진 → Hugging Face 토큰.
   토큰 없이 바로 쓰려면 모델을 **TripoSR** 로 바꿉니다.

## 2. 이미지를 3D로

1. **이미지 열기**(Ctrl+O) 또는 창에 끌어다 놓기.
2. 툴바의 **모델** 드롭다운에서 Stable Fast 3D 또는 TripoSR.
3. **3D로 변환**(F5). 취소는 Esc.
4. 결과를 살펴보고 **저장**(Ctrl+S) — GLB · glTF · OBJ · STL · PLY · USDZ.

GPU 가 있으면 GPU, 없으면 CPU 를 씁니다. GPU 에서 실패하면 자동으로 CPU 에서 다시 합니다.

## 3. 3D 화면

| 조작 | 동작 |
| --- | --- |
| 왼쪽 끌기 / 오른쪽 끌기 / 휠 | 회전 / 이동 / 확대 |
| F | 화면 맞춤 |
| 방향 큐브 클릭 | 그 방향에서 보기 |
| 광원 공 끌기 | 광원 이동 (축 화살표 · 평면 사각형으로 제한) |

- 바닥은 **5×5 로 나뉜 무한 격자**, X(빨강) · Y(초록) · Z(파랑) **좌표축**, 길이가 쓰인 **눈금자**.
- 오른쪽 **설정 패널**: 변환 · 장면 · 광원 · 재질 · 모델 · 카메라.

## 4. 3D 파일 열기 · 형식 변환

**3D 파일 열기**(Ctrl+Shift+O): GLB · glTF · OBJ(+MTL) · STL · PLY · FBX · DAE · 3MF · 3DS · USDZ · VRML · VTK · AMF · PCD · XYZ · KMZ · LWO.
열린 모델을 다른 형식으로 저장하면 형식 변환이 됩니다. 모델 탭의 회전 · 배율이 함께 적용됩니다.

## 5. 웹 버전

```bash
npm run web      # http://localhost:5195 + 엔진
```

## 6. 데이터

- 설정: `%APPDATA%\MyStableFast3D\settings.json`
- 엔진: `%LOCALAPPDATA%\MyStableFast3D\engine` (다시 설치: 설정 → 엔진)
- 모델 가중치: `~/.cache/huggingface` (공용 캐시)

## 7. 유료 API

Stability AI API 는 **기본으로 꺼져 있습니다**. 설정 → 엔진 → 변환 방법에서 고르면 확인을 받고, API 키가 필요하며,
변환마다 크레딧이 차감되고 이미지가 전송됩니다.
