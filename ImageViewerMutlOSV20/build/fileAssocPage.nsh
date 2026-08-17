; Included from customHeader after MUI2, so MUI_HEADER_TEXT is available.

Function FileAssocPageCreate
  nsDialogs::Create 1018
  Pop $AssocPageHwnd
  ${If} $AssocPageHwnd == error
    Abort
  ${EndIf}

  ${If} $LANGUAGE == 1042
    !insertmacro MUI_HEADER_TEXT "파일 연결" "지원하는 이미지 파일을 Image Viewer로 엽니다."
    ${NSD_CreateLabel} 0 0 100% 40u "설치 후 JPEG, PNG, WebP, HEIC, TIFF, DICOM 등 지원 이미지 파일을 이 프로그램으로 열 수 있습니다.$\r$\nWindows 설정 > 기본 앱 에서도 나중에 변경할 수 있습니다."
    Pop $0
    ${NSD_CreateCheckbox} 0 56u 100% 20u "지원하는 이미지 파일의 기본 앱으로 Image Viewer 등록"
    Pop $AssocCheckbox
  ${Else}
    !insertmacro MUI_HEADER_TEXT "File associations" "Open supported images with Image Viewer."
    ${NSD_CreateLabel} 0 0 100% 40u "Register Image Viewer for JPEG, PNG, WebP, HEIC, TIFF, DICOM, and other supported image files.$\r$\nYou can change this later in Windows Settings > Default apps."
    Pop $0
    ${NSD_CreateCheckbox} 0 56u 100% 20u "Set Image Viewer as the default app for supported image files"
    Pop $AssocCheckbox
  ${EndIf}

  ${NSD_Check} $AssocCheckbox
  nsDialogs::Show
FunctionEnd

Function FileAssocPageLeave
  ${NSD_GetState} $AssocCheckbox $RegisterFileAssoc
FunctionEnd
