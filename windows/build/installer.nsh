; Uninstalling ends the session host (src/host.cs) and removes its program: it runs from outside the app's folder, so
; that an update's installer leaves it and its chats running. Taking the app away takes them too; the uninstall an
; update makes of the old version doesn't.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /IM "terminal-app-host-*" /FI "USERNAME eq %USERNAME%"`
    Pop $0
    RMDir /r "$LOCALAPPDATA\terminal-app-host"
  ${endIf}
!macroend
