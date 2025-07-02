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
    MessageBox MB_OK|MB_ICONINFORMATION "AssociatePageLeave called; state = $0"
    WriteRegStr HKCU "Software\Classes\.md" "" "${PRODUCT_NAME}"
    WriteRegStr HKCU "Software\Classes\${PRODUCT_NAME}" "" "Markdown Document"
    WriteRegStr HKCU "Software\Classes\${PRODUCT_NAME}\DefaultIcon" "" "$INSTDIR\resources\icons\md.ico"
    WriteRegStr HKCU "Software\Classes\${PRODUCT_NAME}\shell\open\command" "" '"$INSTDIR\marktextv2-dev.exe" "%1"'
  ${EndIf}
FunctionEnd
