; Custom NSIS hooks for MyWorkspace installer.
; electron-builder assisted installer shows checkboxes for:
; - Desktop shortcut (createDesktopShortcut)
; - Start menu shortcut (createStartMenuShortcut)

!macro customHeader
  ; Use Korean as default installer language when OS locale matches.
!macroend

!macro customInstall
  ; Shortcuts are created by electron-builder from nsis.createDesktopShortcut /
  ; createStartMenuShortcut options. Nothing extra required here.
!macroend

!macro customUnInstall
  ; electron-builder removes Start menu folder and desktop shortcut on uninstall.
!macroend
