// FILE: tests/e2e/metadata-save-safety.spec.ts
// START_MODULE_CONTRACT
//   PURPOSE: Run the shared metadata save contract in Chromium.
//   SCOPE: Import the same renderer-only assertions as WebKit and label their evidence.
//   DEPENDS: perf/metadata-save-safety.spec.ts, Playwright.
//   LINKS: V-M-011, V-M-060; C-METADATA-SAVE-SAFETY T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   rendererContract - identify the shared renderer evidence in the report.
// END_MODULE_MAP
import {test} from '@playwright/test'
import './perf/metadata-save-safety.spec'
const rendererContract = 'Shared metadata save contract in Chromium; renderer doubles only'
test.beforeEach(()=>{test.info().annotations.push({type:'evidence-tier',description:rendererContract})})
