!include "MUI2.nsh"
Var AssociateMd

Page custom AssociatePageCreate AssociatePageLeave
!insertmacro MUI_PAGE_INSTFILES

Function AssociatePageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateCheckbox} 20u 40u 100% 12u "Associate .md files with ${PRODUCT_NAME}"
  Pop $AssociateMd
  SendMessage $AssociateMd ${BM_SETCHECK} ${BST_CHECKED} 0
  nsDialogs::Show
FunctionEnd

Function AssociatePageLeave
  ${NSD_GetState} $AssociateMd $0
  ${If} $0 == ${BST_CHECKED}
    WriteRegStr HKCR ".md" "" "${PRODUCT_NAME}.MarkdownFile"
    WriteRegStr HKCR "${PRODUCT_NAME}.MarkdownFile" "" "Markdown Document"
    WriteRegStr HKCR "${PRODUCT_NAME}.MarkdownFile\\DefaultIcon" "" "$INSTDIR\\icons\\md.ico"
    WriteRegStr HKCR "${PRODUCT_NAME}.MarkdownFile\\shell\\open\\command" "" '"$INSTDIR\\marktextv2.exe" "%1"'
  ${EndIf}
FunctionEnd

!macro customUnInstall
  MessageBox MB_YESNO "Do you want to delete user settings?" /SD IDNO IDNO SkipRemoval
    SetShellVarContext current
    RMDir /r "$APPDATA\marktext"
  SkipRemoval:
!macroend