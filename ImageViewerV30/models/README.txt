이 디렉토리는 rembg ONNX 모델 파일(예: u2net.onnx 등)을 저장하는 용도입니다.

- rembg ONNX 모델은 https://github.com/danielgatis/rembg 에서 다운로드할 수 있습니다.
- 예시: u2net.onnx, u2netp.onnx, u2net_human_seg.onnx 등
- 모델 파일을 여기에 저장하면, 추후 C#에서 ONNX 런타임을 통해 직접 사용할 수 있습니다.

C#에서 ONNX 모델을 사용하는 예시는 Microsoft.ML.OnnxRuntime 패키지를 참고하세요.