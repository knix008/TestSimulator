; DCM Viewer — installer options page (included from customHeader, after MUI2 / nsDialogs)
;   [x] Desktop shortcut   [x] Start Menu shortcut   [x] Register as the default program for .dcm files

Function OptionsPageCreate
  nsDialogs::Create 1018
  Pop $OptPageHwnd
  ${If} $OptPageHwnd == error
    Abort
  ${EndIf}

  ${If} $LANGUAGE == 1042
    !insertmacro MUI_HEADER_TEXT "설치 옵션" "바로 가기와 DICOM 파일 연결을 선택하세요."
    ${NSD_CreateLabel} 0 0 100% 24u "설치할 항목을 선택하세요. 나중에 Windows 설정 > 앱 > 기본 앱 에서 파일 연결을 바꿀 수 있습니다."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "바탕 화면에 바로 가기 만들기"
    Pop $OptDesktopCheck
    ${NSD_CreateCheckbox} 0 52u 100% 12u "시작 메뉴에 바로 가기 만들기"
    Pop $OptStartMenuCheck
    ${NSD_CreateCheckbox} 0 70u 100% 12u "DICOM 파일(.dcm, .dicm, .dicom)의 기본 프로그램으로 등록 (DCM 파일 아이콘 포함)"
    Pop $OptAssocCheck
    ${NSD_CreateLabel} 0 96u 100% 30u "기본 프로그램으로 등록하면 탐색기에서 .dcm 파일이 DCM Viewer 아이콘으로 표시되고 더블 클릭으로 열립니다."
    Pop $0
  ${Else}
    !insertmacro MUI_HEADER_TEXT "Setup options" "Choose shortcuts and the DICOM file association."
    ${NSD_CreateLabel} 0 0 100% 24u "Select what to set up. File associations can be changed later in Windows Settings > Apps > Default apps."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create a desktop shortcut"
    Pop $OptDesktopCheck
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create a Start Menu shortcut"
    Pop $OptStartMenuCheck
    ${NSD_CreateCheckbox} 0 70u 100% 12u "Register as the default program for DICOM files (.dcm, .dicm, .dicom) with the DCM file icon"
    Pop $OptAssocCheck
    ${NSD_CreateLabel} 0 96u 100% 30u "When registered, .dcm files show the DCM Viewer document icon in Explorer and open with a double click."
    Pop $0
  ${EndIf}

  ${If} $OptDesktop == "1"
    ${NSD_Check} $OptDesktopCheck
  ${EndIf}
  ${If} $OptStartMenu == "1"
    ${NSD_Check} $OptStartMenuCheck
  ${EndIf}
  ${If} $OptFileAssoc == "1"
    ${NSD_Check} $OptAssocCheck
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function OptionsPageLeave
  ${NSD_GetState} $OptDesktopCheck $OptDesktop
  ${NSD_GetState} $OptStartMenuCheck $OptStartMenu
  ${NSD_GetState} $OptAssocCheck $OptFileAssoc
FunctionEnd
