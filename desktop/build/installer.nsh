; Render controls at the system DPI instead of letting Windows stretch the whole wizard.
ManifestDPIAware true

!define MUI_BGCOLOR "1E1B18"
!define MUI_TEXTCOLOR "EDDFCA"
!define MUI_INSTFILESPAGE_COLORS "EDDFCA 141210"
!define MUI_FINISHPAGE_TITLE "Tu POS esta listo"
!define MUI_FINISHPAGE_TEXT "Asados Santacruz POS se instalo correctamente.$\r$\n$\r$\nYa puedes iniciar sesion con tu cuenta habitual. Encontraras el acceso directo en tu escritorio y en el menu Inicio."
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Asados Santacruz POS"
!define MUI_ABORTWARNING
!ifndef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_GUIINIT PosGuiInit
!endif

!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_TEXT "Preparando tu punto de venta"
  !define MUI_PAGE_HEADER_SUBTEXT "ASADOS SANTACRUZ  /  Instalacion de escritorio"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW PosInstallationShow
!macroend

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION StartApp
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW PosFinishShow
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customHeader
  BrandingText "ASADOS SANTACRUZ  |  POS"
  SetFont "Segoe UI" 9

  !ifndef BUILD_UNINSTALLER
  Function PosGuiInit
    SetCtlColors $HWNDPARENT EDDFCA 1E1B18
    GetDlgItem $0 $HWNDPARENT 1028
    SetCtlColors $0 B0A89E 1E1B18
  FunctionEnd

  Function PosInstallationShow
    FindWindow $0 "#32770" "" $HWNDPARENT
    GetDlgItem $1 $0 1004
    System::Call 'uxtheme::SetWindowTheme(p r1, w "", w "")'
    SendMessage $1 0x409 0 0x002636E1
    SendMessage $1 0x2001 0 0x00181214
    SetCtlColors $0 EDDFCA 1E1B18
    GetDlgItem $1 $0 1006
    SetCtlColors $1 EDDFCA 1E1B18
    GetDlgItem $1 $0 1016
    SetCtlColors $1 EDDFCA 141210
  FunctionEnd

  Function PosFinishShow
    System::Call 'uxtheme::SetWindowTheme(p$mui.FinishPage.Run, w "", w "")'
    SetCtlColors $mui.FinishPage.Run FFFFFF 1E1B18
  FunctionEnd
  !endif
!macroend
