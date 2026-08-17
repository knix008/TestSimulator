; Image Viewer — clean reinstall support for electron-builder NSIS
; On upgrade/reinstall: quit the running app, remove the old install dir,
; and wipe Electron userData so the previous program is fully replaced.
; Optional page: register as the default app for supported image formats.

!include "LogicLib.nsh"

Var RegisterFileAssoc
Var AssocCheckbox
Var AssocPageHwnd

!macro KillImageViewerProcesses
  ; Force-close any running instance so files can be deleted
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "Image Viewer.exe" /T >nul 2>&1'
  Sleep 800
!macroend

!macro RemoveImageViewerUserData
  SetShellVarContext current
  RMDir /r "$APPDATA\Image Viewer"
  RMDir /r "$LOCALAPPDATA\Image Viewer"
  ; package name fallback (dev / older builds)
  RMDir /r "$APPDATA\image-viewer-multios"
  RMDir /r "$LOCALAPPDATA\image-viewer-multios"
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    !include "nsDialogs.nsh"
    !include "fileAssocPage.nsh"
  !endif
!macroend

!macro customInit
  StrCpy $RegisterFileAssoc "1"
  !insertmacro KillImageViewerProcesses
!macroend

; Runs after the previous uninstaller, before new files are copied
!macro preInstall
  !insertmacro KillImageViewerProcesses

  ; Wipe install directory leftovers (failed/partial uninstalls)
  ${If} ${FileExists} "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
  ${EndIf}

  ; Always start clean: remove previous app settings / cache
  !insertmacro RemoveImageViewerUserData
!macroend

!macro customPageAfterChangeDir
  Page custom FileAssocPageCreate FileAssocPageLeave
!macroend

!macro _ClearImageViewerFileCapabilities
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "Image Viewer"
  DeleteRegKey SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities"
!macroend

!macro _WriteImageViewerFileCapabilities
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities" "ApplicationName" "Image Viewer"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities" "ApplicationDescription" "Image Viewer"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities" "ApplicationIcon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".jpg" "ImageViewer.jpeg"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".jpeg" "ImageViewer.jpeg"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".png" "ImageViewer.png"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".gif" "ImageViewer.gif"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".bmp" "ImageViewer.bmp"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".webp" "ImageViewer.webp"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".avif" "ImageViewer.avif"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".svg" "ImageViewer.svg"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".ico" "ImageViewer.ico"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".tif" "ImageViewer.tiff"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".tiff" "ImageViewer.tiff"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".heic" "ImageViewer.heic"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".heif" "ImageViewer.heic"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".hif" "ImageViewer.heic"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".dcm" "ImageViewer.dcm"
  WriteRegStr SHELL_CONTEXT "Software\com.shkwon.imageviewer\Capabilities\FileAssociations" ".dicom" "ImageViewer.dcm"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "Image Viewer" "Software\com.shkwon.imageviewer\Capabilities"
!macroend

!macro customInstall
  ; Default (including silent installs): keep associations from electron-builder.
  ; Unchecked on the custom page → undo them so we are not the default handler.
  ${If} $RegisterFileAssoc == 0
    !insertmacro APP_UNASSOCIATE "jpg" "ImageViewer.jpeg"
    !insertmacro APP_UNASSOCIATE "jpeg" "ImageViewer.jpeg"
    !insertmacro APP_UNASSOCIATE "png" "ImageViewer.png"
    !insertmacro APP_UNASSOCIATE "gif" "ImageViewer.gif"
    !insertmacro APP_UNASSOCIATE "bmp" "ImageViewer.bmp"
    !insertmacro APP_UNASSOCIATE "webp" "ImageViewer.webp"
    !insertmacro APP_UNASSOCIATE "avif" "ImageViewer.avif"
    !insertmacro APP_UNASSOCIATE "svg" "ImageViewer.svg"
    !insertmacro APP_UNASSOCIATE "ico" "ImageViewer.ico"
    !insertmacro APP_UNASSOCIATE "tif" "ImageViewer.tiff"
    !insertmacro APP_UNASSOCIATE "tiff" "ImageViewer.tiff"
    !insertmacro APP_UNASSOCIATE "heic" "ImageViewer.heic"
    !insertmacro APP_UNASSOCIATE "heif" "ImageViewer.heic"
    !insertmacro APP_UNASSOCIATE "hif" "ImageViewer.heic"
    !insertmacro APP_UNASSOCIATE "dcm" "ImageViewer.dcm"
    !insertmacro APP_UNASSOCIATE "dicom" "ImageViewer.dcm"
    !insertmacro _ClearImageViewerFileCapabilities
  ${Else}
    !insertmacro _WriteImageViewerFileCapabilities
  ${EndIf}
  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend

!macro customUnInstall
  !insertmacro KillImageViewerProcesses
  !insertmacro _ClearImageViewerFileCapabilities

  ${If} ${FileExists} "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
  ${EndIf}

  !insertmacro RemoveImageViewerUserData
!macroend
