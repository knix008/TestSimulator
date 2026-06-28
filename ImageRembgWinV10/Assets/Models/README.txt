rembg U2Net 모델(u2net.onnx)은 첫 실행 시 자동으로 다운로드됩니다.
오프라인 환경에서는 이 폴더에 u2net.onnx 파일을 직접 배치할 수 있습니다.

다운로드 URL:
https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx

MD5: 60024c5c889badc19c04ad937298a77b

---

rembg2 (RMBG-2.0) 모델(rembg2.onnx)은 Hugging Face의 게이트(라이선스 동의) 모델이라
설치 프로그램(MSI)에는 포함되지 않습니다. 자동 다운로드도 지원하지 않습니다.

사용하려면:
1. https://huggingface.co/briaai/RMBG-2.0/tree/main/onnx 에서 라이선스(비상업적 용도)에
   동의한 뒤 onnx 파일(예: model_fp16.onnx)을 직접 받습니다.
2. 프로그램에서 rembg2를 선택하면 안내 대화상자가 표시됩니다. "예"를 누르고 받은 파일을
   선택하면 자동으로 설치됩니다 (별도 권한 없이 동작).
   - 직접 배치하려면: %LOCALAPPDATA%\ImageRembgWinV10\models\rembg2.onnx
   - (개발/포터블 빌드에서만) 이 폴더에 "rembg2.onnx"로 저장해도 인식됩니다. 단, MSI로
     설치한 경우 이 폴더(Program Files 하위)는 일반 사용자 권한으로 쓸 수 없습니다.

파일이 없으면 rembg2 선택 시 안내 오류 메시지가 표시됩니다.
