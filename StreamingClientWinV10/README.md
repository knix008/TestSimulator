# StreamingClientWinV10

.NET 8 WPF 동영상 스트리밍 클라이언트.

## 기능

- 서버에서 동영상 목록 조회 및 타일 형식 표시
- 동영상별 썸네일 및 제목, 길이 표시
- 동영상 선택 시 플레이어 창 실행
- 재생 / 일시 정지 / 정지 제어
- 재생 위치 탐색 (Seek bar)
- 볼륨 조절 및 음소거
- 동영상별 댓글 목록 표시

## 요구 사항

- .NET 8 SDK
- Visual Studio 2022 (WPF Designer 포함)

## 빌드 및 실행

```bash
dotnet build
dotnet run
```

## 서버 API 스펙

앱이 연결하는 REST API 엔드포인트:

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/videos` | 동영상 목록 반환 |
| GET | `/api/videos/{id}/thumbnail` | 썸네일 이미지 반환 |
| GET | `/api/videos/{id}/stream` | 동영상 스트림 |
| GET | `/api/videos/{id}/comments` | 댓글 목록 반환 |

### Video JSON 예시

```json
{
  "id": 1,
  "title": "샘플 동영상",
  "description": "설명 텍스트",
  "thumbnailUrl": "/api/videos/1/thumbnail",
  "streamUrl": "/api/videos/1/stream",
  "duration": 150,
  "createdAt": "2025-01-01T00:00:00Z"
}
```

### Comment JSON 예시

```json
{
  "id": 1,
  "videoId": 1,
  "author": "사용자명",
  "content": "댓글 내용",
  "createdAt": "2025-05-01T12:00:00Z"
}
```

## 프로젝트 구조

```
StreamingClientWinV10/
├── Models/
│   ├── Video.cs            # 동영상 모델
│   └── Comment.cs          # 댓글 모델
├── Helpers/
│   ├── RelayCommand.cs     # ICommand 구현
│   ├── AppSettings.cs      # 설정 저장/로드 (JSON)
│   └── Converters.cs       # WPF Value Converters
├── Services/
│   └── VideoApiService.cs  # HTTP REST API 클라이언트
├── ViewModels/
│   ├── BaseViewModel.cs    # INotifyPropertyChanged
│   └── MainViewModel.cs    # 메인 화면 ViewModel
├── Controls/
│   └── VideoTileControl    # 타일 UserControl
└── Views/
    ├── MainWindow          # 동영상 라이브러리 메인 창
    ├── VideoPlayerWindow   # 플레이어 + 댓글 창
    └── SettingsWindow      # 서버 URL 설정 다이얼로그
```

## 설정

초기 실행 시 서버 URL은 `http://localhost:5000`으로 설정됩니다.  
상단 **⚙ 서버 설정** 버튼으로 변경할 수 있으며, 설정은 다음 경로에 저장됩니다:

```
%APPDATA%\StreamingClientWinV10\settings.json
```
