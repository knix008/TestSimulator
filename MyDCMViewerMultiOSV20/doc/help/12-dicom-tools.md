<!-- tour: tageditor -->
# DICOM 도구

## DICOM 태그 편집

**도구 › DICOM 태그 편집…** — 원본은 그대로 두고 고친 내용을 **새 파일** 로 저장합니다.

![태그 편집](images/help-tageditor.jpg)

1. 표에서 요소를 고릅니다(시퀀스 안의 요소도 들여쓰기로 보입니다). 위의 칸으로 찾습니다.
2. 값을 바꾸거나 **추가 / 바꾸기**, **이 요소 삭제**, **되살리기** 를 합니다.
3. **새 파일로 저장…** — *저장한 뒤 열기* 를 켜면 바로 엽니다.

<!-- tour: anonymize -->
## 익명화 사본 저장

![익명화](images/help-anonymize.jpg)

**도구 › 익명화 사본 저장…** — 체크한 개인 식별 요소(환자 이름 · ID · 생년월일 · 기관 · 의사 · 날짜 등)를 대체 문자열로 바꾸거나 비웁니다.

- 시퀀스 안의 요소까지 처리합니다.
- **모든 비공개(private) 태그 지우기**
- **검사 · 시리즈 · 영상 UID 새로 만들기** — 한 파일 안의 같은 UID 는 같은 새 UID 로 바뀌어 관계가 유지됩니다.
- Patient Identity Removed = YES, 비식별화 방법을 기록하고 `<파일명>_anon.dcm` 으로 저장합니다. 픽셀은 바뀌지 않습니다.

## 비압축 DICOM 으로 저장 (전송 구문 변환)

JPEG · JPEG 2000 · JPEG-LS · RLE · Deflate 로 압축된 파일을 Explicit VR Little Endian 비압축으로 바꿉니다. YBR 컬러는 RGB 로, 손실 압축이었다면 Lossy Image Compression = 01 을 기록합니다. 압축을 읽지 못하는 다른 프로그램에 넘길 때 씁니다.

## 영상을 DICOM 으로 저장 (Secondary Capture)

지금 보이는 그림(윈도우 · 컬러맵 · 필터 · 주석 포함)을 Secondary Capture DICOM 으로 저장합니다. 일반 그림 파일도 DICOM 으로 만들 수 있습니다.

## 시리즈를 DICOMDIR 로 내보내기

**파일 › 이미지 내보내기 › 시리즈를 DICOMDIR 로 내보내기** — 정렬된 시리즈(또는 연 파일들)를 CD · USB 용 `DICOMDIR` + `DICOM/S0001/I0000001 …` 폴더로 씁니다. 웹에서는 ZIP 으로 내려받습니다.
