# C-59 — App Store 2.5.0 submission materials (drafts, pending user ok)

Created: 2026-10-18. Build: v2.5.0 tag (worktree ~/prj/mark-wt/mas-2.5.0).
Every outward send below follows the draft → user ok → send → read-back rule.

## Build evidence (T-002)

- Source: `git worktree add ~/prj/mark-wt/mas-2.5.0 v2.5.0` (15a91bdd), node_modules symlinked.
- `npx tauri build --config src-tauri/mas.conf.json --features app-store` — green, 3m05s.
- `./tools/release/mas-pkg.sh` — Apple Distribution re-sign, Entitlements-mas.plist,
  productbuild Min OS 12.0, TestFlight profile embed, quarantine strip.
- `pkgutil --check-signature target/release/bundle/macos/Mark-mas.pkg` —
  Status: signed by a developer certificate issued by Apple; chain
  3rd Party Mac Developer Installer: Mikhail Yevdokimov (NY72L3P5TN) →
  Apple WWDR → Apple Root CA. Verified.
- Info.plist: CFBundleShortVersionString 2.5.0, CFBundleVersion 2.5.0,
  LSMinimumSystemVersion 12.0.
- embedded.provisionprofile: "Mark MAS", TeamIdentifier NY72L3P5TN.
- Sizes (measured 2026-10-18): pkg 12,666,424 B ≈ 12 MB download;
  Mark.app 27 MB installed.
- Store gates verified in the v2.5.0 tag source: live server start gated
  `#[cfg(not(feature = "app-store"))]` (src-tauri/src/main.rs:719); pandoc
  m015 gated; m048 asserts app-store never advertises `support` (Ko-fi) and
  does advertise `share`; updater artifacts off in mas.conf.json.
- Pkg for Transporter: `/Users/myevdokimov/Downloads/Mark-mas-2.5.0.pkg`
  (copy of worktree target/release/bundle/macos/Mark-mas.pkg).
  The stale 2.4.0 pkg in the main worktree target/ was removed to avoid mixups.

## Subtitle (30-char limit)

`WYSIWYG markdown, 12 MB` (24/30) — was `WYSIWYG markdown, 11 MB`.

## Promotional text (optional, no review needed)

Unchanged proposal from the 2.3.0 pack (153/170, no stale claims):

> Keep a file open while an AI agent writes it — every save reloads in place. Edit right in the finished page: tables, callouts, Mermaid and math included.

## Keywords (100 chars)

2.3.0-pack set (94/100), no stale claims:

`markdown,wysiwyg,md,editor,notes,mermaid,katex,latex,writing,docs,readme,ai,agent,split,themes`

## Description — en-US (base for all locales)

Derived from the user's 2.3.0 listing pack (~/Downloads/Mark-AppStore-2.3.0/en-US/listing.txt)
with the C-59 corrections: 33→32 themes + four families, measured sizes,
diagram PNG/SVG export, print/PDF, privacy URL kept.

```
Mark is a native macOS Markdown editor built around one idea: your editor should be the cheapest window you have open.

WATCH YOUR AGENT WRITE
Your AI agents write Markdown to disk; Mark reloads the file the moment it is saved and keeps your scroll position, so you can follow a pass as it happens and jump in when it finishes.

WRITE IN THE FINISHED PAGE
True WYSIWYG: headings, tables, task lists, footnotes, GitHub and Obsidian callouts and a front matter properties table look finished while you type. Split View puts the Markdown source beside the page when you need it.

DIAGRAMS AND MATH
32 diagram types in Mermaid syntax — from flowcharts to Venn, treemap and radar — plus KaTeX math and syntax-highlighted code, all rendered inline and recoloured by your theme. Any diagram can be copied as an image or saved as PNG and SVG.

COPY IT CLEAN
Copy as HTML for email, as plain text, or as structured text that keeps paragraphs, bullets, links and tables readable anywhere you paste.

ULTRALIGHT
Downloads as 12 MB (about 27 MB installed) and opens in under a second. No Electron, no bundled browser — Mark renders through the system WebKit your Mac already runs.

PRINT AND PDF
Print (⌘P) opens the system print panel directly; Export to PDF saves a clean file without it.

PRIVACY
No account, no analytics, no telemetry. Your documents never leave your machine. Privacy policy: https://xronocode.github.io/mark/privacy

Open source (MIT): https://github.com/xronocode/mark
```

### Description — other locales

Each locale keeps its own native listing.txt body (already user-approved in the
2.3.0 pack) with the same semantic deltas applied in that language:

1. ULTRALIGHT sizes → «12 MB download / about 27 MB installed».
2. «33 themes» → 32 themes, four families Paper / Ink / Docs / macOS.
3. DIAGRAMS AND MATH gains: 32 types, PNG/SVG export, theme recolouring.
4. New PRINT AND PDF section (⌘P direct panel; PDF without it).

## Description deltas — ru (reference translation of the deltas)

- ULTRALIGHT: «Скачивается за 12 МБ (установленному нужно около 27 МБ) и открывается меньше чем за секунду.»
- Темы: «32 темы в четырёх семействах — Paper, Ink, Docs и macOS.»
- ДИАГРАММЫ И МАТЕМАТИКА: «32 типа диаграмм в синтаксисе Mermaid — от блок-схем до venn, treemap и radar — плюс математика KaTeX и подсветка кода; всё рисуется прямо в тексте и перекрашивается вместе с темой. Любую диаграмму можно скопировать как изображение или сохранить в PNG и SVG.»
- ПЕЧАТЬ И PDF: «Печать (⌘P) сразу открывает системную панель; экспорт в PDF сохраняет готовый файл без неё.»

## Reviewer notes (replaces the stale live-viewer sentence)

```
Mark is a local Markdown editor. All features work offline. There is no
account system and no server. Documents open via the standard open panel;
sandbox entitlements: user-selected read-write only.
```

## Locale matrix (verified via ASC API 2026-10-18)

ASC appInfo has **en-US only** (subtitle `WYSIWYG markdown, 11 MB` — stale).
The other nine localizations must be created at apply time. Locale codes
match the screenshot pack dirs: de-DE, en-US, es-ES, fr-FR, ja, ko, pt-BR,
ru, zh-Hans, zh-Hant (the app's 10 languages; zh-TW in static/locales =
zh-Hant in ASC). Name/subtitle/keywords/description bases per locale come
from each pack dir's listing.txt.

## What's New 2.5.0 — for store users jumping from 2.1.17 (four releases)

Store-build features only (no git-diff, pandoc, screenshot insert, live
server, Ko-fi). Native copy per locale; Mark, Paper, Ink, Docs, macOS,
Mermaid, ⌘P untranslated.

### en-US

```
Mark catches up in one step — everything from 2.3, 2.4 and 2.5.

THE NEW MARK
- Theme families Paper, Ink, Docs and macOS; a slim title bar, an outline beside the page, a status bar and a home screen with recent files.
- Folders show your Markdown notes only, with Recent and Pinned on top.
- Split View puts the Markdown source beside the rendered page.
- GitHub alerts and Obsidian callouts render as blocks; front matter opens as a table.
- Copy as Structured Text, for email and chat without the markers.
- Large documents open about ten times faster.

DIAGRAMS
- A new engine renders mermaid blocks — same syntax, and 32 diagram types from Venn and treemap to radar and swimlane.
- Diagrams, charts and math follow the theme's colours; any diagram or wide table opens full screen.
- Copy any diagram as an image, or save it as PNG or SVG.
- Each diagram gets its own look: Auto, the author's palette, Light or Dark.

PRINTING
- Print (⌘P) opens the system print panel directly; Export to PDF saves the file without it.

Also: the interface language can follow the system, one zoom for the whole app, and images from the document copy back to the clipboard.
```

### ru

```
Mark навёрстывает четыре релиза разом — всё из 2.3, 2.4 и 2.5.

НОВЫЙ MARK
- Семейства тем Paper, Ink, Docs и macOS; тонкий титлбар, структура рядом со страницей, строка состояния и домашний экран с недавними файлами.
- Папки показывают только заметки Markdown, сверху — недавние и закреплённые.
- Split View ставит исходный Markdown рядом с готовой страницей.
- Оповещения GitHub и коллауты Obsidian отображаются блоками, front matter открывается таблицей.
- «Скопировать как структурированный текст» — для почты и чата, без разметки.
- Большие документы открываются примерно в десять раз быстрее.

ДИАГРАММЫ
- Новый движок рисует блоки mermaid — синтаксис тот же, типов 32: от venn и treemap до radar и swimlane.
- Диаграммы, графики и формулы подхватывают цвета темы; любую диаграмму или широкую таблицу можно открыть на весь экран.
- Диаграмму можно скопировать как изображение или сохранить в PNG или SVG.
- У каждой диаграммы — свой вид: авто, палитра автора, светлый или тёмный.

ПЕЧАТЬ
- Печать (⌘P) сразу открывает системную панель, а экспорт в PDF сохраняет файл без неё.

А ещё: язык интерфейса может следовать за системным, один масштаб на всё приложение, и картинки из документа снова копируются в буфер.
```

### de-DE

```
Mark holt in einem Schritt auf — alles aus 2.3, 2.4 und 2.5.

DAS NEUE MARK
- Themen-Familien Paper, Ink, Docs und macOS; schmale Titelleiste, Gliederung neben der Seite, Statusleiste und ein Startbildschirm mit letzten Dateien.
- Ordner zeigen nur Ihre Markdown-Notizen, mit „Zuletzt verwendet" und „Angeheftet" oben.
- Split View stellt die Markdown-Quelle neben die gerenderte Seite.
- GitHub-Hinweise und Obsidian-Callouts erscheinen als Blöcke; Front Matter öffnet sich als Tabelle.
- „Als strukturierten Text kopieren" — für E-Mail und Chat ohne Syntaxreste.
- Große Dokumente öffnen rund zehnmal schneller.

DIAGRAMME
- Eine neue Engine rendert mermaid-Blöcke — gleiche Syntax, 32 Diagrammtypen von Venn und Treemap bis Radar und Swimlane.
- Diagramme, Charts und Formeln folgen den Farben des Themas; jedes Diagramm oder breite Tabelle geht in den Vollbildmodus.
- Jedes Diagramm als Bild kopieren oder als PNG bzw. SVG speichern.
- Jedes Diagramm bekommt seinen eigenen Look: Auto, die Palette des Autors, Hell oder Dunkel.

DRUCKEN
- Drucken (⌘P) öffnet direkt das Systemdruckfenster; der PDF-Export speichert die Datei ohne Umwege.

Außerdem: die Sprache der Oberfläche kann dem System folgen, ein Zoom für die ganze App — und Bilder aus dem Dokument lassen sich zurück in die Zwischenablage kopieren.
```

### es-ES

```
Mark se pone al día de un salto: todo lo de 2.3, 2.4 y 2.5.

EL NUEVO MARK
- Familias de temas Paper, Ink, Docs y macOS; barra de título fina, esquema junto a la página, barra de estado y una pantalla de inicio con archivos recientes.
- Las carpetas muestran solo tus notas Markdown, con Recientes y Fijados arriba.
- Split View pone el código Markdown junto a la página renderizada.
- Los avisos de GitHub y los callouts de Obsidian se ven como bloques; el front matter se abre como tabla.
- «Copiar como texto estructurado», para correo y chat sin marcas.
- Los documentos grandes abren unas diez veces más rápido.

DIAGRAMAS
- Un motor nuevo renderiza los bloques mermaid: misma sintaxis y 32 tipos de diagrama, de Venn y treemap a radar y swimlane.
- Diagramas, gráficas y fórmulas siguen los colores del tema; cualquier diagrama o tabla ancha se ve a pantalla completa.
- Copia cualquier diagrama como imagen o guárdalo como PNG o SVG.
- Cada diagrama elige su propio aspecto: Auto, la paleta del autor, Claro u Oscuro.

IMPRESIÓN
- Imprimir (⌘P) abre directo el panel del sistema; exportar a PDF guarda el archivo sin pasos extra.

Además: el idioma puede seguir al del sistema, un zoom para toda la app y las imágenes del documento vuelven al portapapeles.
```

### fr-FR

```
Mark rattrape quatre versions d'un coup — tout 2.3, 2.4 et 2.5.

LE NOUVEAU MARK
- Familles de thèmes Paper, Ink, Docs et macOS ; barre de titre fine, plan à côté de la page, barre d'état et un écran d'accueil avec les fichiers récents.
- Les dossiers ne montrent que vos notes Markdown, avec Récents et Épinglés en haut.
- Split View place la source Markdown à côté de la page rendue.
- Les alertes GitHub et les callouts Obsidian s'affichent en blocs ; le front matter s'ouvre en tableau.
- « Copier en texte structuré », pour l'e-mail et le chat, sans balises.
- Les documents volumineux s'ouvrent environ dix fois plus vite.

DIAGRAMMES
- Un nouveau moteur affiche les blocs mermaid — même syntaxe, 32 types de diagrammes, de Venn et treemap à radar et swimlane.
- Diagrammes, graphiques et formules suivent les couleurs du thème ; tout diagramme ou tableau large passe en plein écran.
- Copiez un diagramme en image, ou enregistrez-le en PNG ou SVG.
- Chaque diagramme a son propre look : Auto, la palette de l'auteur, Clair ou Sombre.

IMPRESSION
- Imprimer (⌘P) ouvre directement la fenêtre du système ; l'export PDF enregistre le fichier sans détour.

Et aussi : la langue peut suivre celle du système, un seul zoom pour toute l'app, et les images du document repartent dans le presse-papiers.
```

### ja

```
Mark が一気に追いつきます — 2.3、2.4、2.5 のすべてを一度に。

新しい Mark
- テーマファミリー Paper、Ink、Docs、macOS。スリムなタイトルバー、ページ横のアウトライン、ステータスバー、最近のファイルがあるホーム画面。
- フォルダーは Markdown のノートだけを表示。上部に「最近」と「ピン留め」。
- Split View は Markdown ソースを描画結果の隣に表示します。
- GitHub アラートと Obsidian コールアウトをブロックで表示、front matter はテーブルで開きます。
- 「構造化テキストとしてコピー」— メールやチャットにマークなしで貼れます。
- 大きなドキュメントのオープンが約 10 倍速くなりました。

ダイアグラム
- 新エンジンが mermaid ブロックをレンダリング。同じ構文で、Venn や treemap、radar、swimlane まで 32 種類。
- ダイアグラム・チャート・数式はテーマの色に合わせられ、任意のダイアグラムや横長テーブルは全画面で表示できます。
- ダイアグラムを画像としてコピー、PNG / SVG として保存。
- それぞれのダイアグラムに独自の見た目を：Auto、作者のパレット、Light または Dark。

印刷
- 印刷（⌘P）はシステムの印刷パネルを直接開き、PDF 書き出しはパネルなしでファイルに保存します。

そのほか：インターフェースの言語をシステムに合わせられ、アプリ全体でひとつのズーム、ドキュメント内の画像をクリップボードに戻せます。
```

### ko

```
Mark가 한 번에 따라잡습니다 — 2.3, 2.4, 2.5의 모든 것.

새로운 Mark
- 테마 패밀리 Paper, Ink, Docs, macOS. 슬림 타이틀 바, 페이지 옆 아웃라인, 상태 바, 최근 파일이 있는 홈 화면.
- 폴더는 Markdown 노트만 보여 주고, 상단에 최근 항목과 고정 항목이 있습니다.
- Split View는 Markdown 원본을 렌더링된 페이지 옆에 놓습니다.
- GitHub 알림과 Obsidian 콜아웃이 블록으로 표시되고, front matter는 표로 열립니다.
- '구조화된 텍스트로 복사' — 마크 없이 메일과 채팅에 붙여넣기.
- 큰 문서가 약 10배 빠르게 열립니다.

다이어그램
- 새 엔진이 mermaid 블록을 렌더링합니다. 같은 문법으로 Venn, treemap, radar, swimlane까지 32가지 유형.
- 다이어그램, 차트, 수식은 테마 색을 따르고, 어떤 다이어그램이나 넓은 표도 전체 화면으로 볼 수 있습니다.
- 다이어그램을 이미지로 복사하거나 PNG / SVG로 저장하세요.
- 각 다이어그램에 나만의 모습을: Auto, 저자 팔레트, Light 또는 Dark.

인쇄
- 인쇄(⌘P)는 시스템 인쇄 패널을 바로 열고, PDF 내보내기는 패널 없이 파일로 저장합니다.

또한: 인터페이스 언어를 시스템 따라가기, 앱 전체에 하나의 줌, 문서 속 이미지를 다시 클립보드로.
```

### pt-BR

```
O Mark alcança quatro versões de uma vez — tudo do 2.3, 2.4 e 2.5.

O NOVO MARK
- Famílias de temas Paper, Ink, Docs e macOS; barra de título fina, tópicos ao lado da página, barra de status e uma tela inicial com arquivos recentes.
- As pastas mostram só suas notas Markdown, com Recentes e Fixados no topo.
- A Split View põe o Markdown ao lado da página renderizada.
- Alertas do GitHub e callouts do Obsidian aparecem como blocos; o front matter abre como tabela.
- «Copiar como texto estruturado», para e-mail e chat sem marcadores.
- Documentos grandes abrem cerca de dez vezes mais rápido.

DIAGRAMAS
- Um motor novo renderiza blocos mermaid — mesma sintaxe, 32 tipos de diagrama, de Venn e treemap a radar e swimlane.
- Diagramas, gráficos e fórmulas seguem as cores do tema; qualquer diagrama ou tabela larga abre em tela cheia.
- Copie qualquer diagrama como imagem ou salve em PNG ou SVG.
- Cada diagrama ganha o próprio visual: Auto, a paleta do autor, Claro ou Escuro.

IMPRESSÃO
- Imprimir (⌘P) abre direto o painel do sistema; exportar para PDF salva o arquivo sem etapas extras.

E mais: o idioma pode seguir o do sistema, um zoom só para todo o app e as imagens do documento voltam para a área de transferência.
```

### zh-Hans

```
Mark 一步补齐四个版本 — 2.3、2.4、2.5 的全部内容。

全新的 Mark
- 主题家族 Paper、Ink、Docs 与 macOS；纤细标题栏、页面旁的大纲、状态栏，以及带最近文件的主屏幕。
- 文件夹只显示你的 Markdown 笔记，顶部是最近与固定项。
- Split View 把 Markdown 源码放在渲染页面旁边。
- GitHub 警告和 Obsidian callout 以块显示，front matter 以表格打开。
- 「复制为结构化文本」— 邮件和聊天里不带标记。
- 大文档打开快约十倍。

图表
- 全新引擎渲染 mermaid 块 — 语法不变，32 种图表：从 venn、treemap 到 radar、swimlane。
- 图表、图形与公式跟随主题配色；任何图表或宽表格都能全屏查看。
- 任意图表可复制为图片，或保存为 PNG / SVG。
- 每张图表都有自己的外观：自动、作者配色、浅色或深色。

打印
- 打印（⌘P）直接打开系统打印面板；导出 PDF 无需面板、直接保存文件。

此外：界面语言可跟随系统，整个应用一个缩放，文档里的图片也能重新拷回剪贴板。
```

### zh-Hant

```
Mark 一步補齊四個版本 — 2.3、2.4、2.5 的全部內容。

全新的 Mark
- 主題家族 Paper、Ink、Docs 與 macOS；纖細標題列、頁面旁的大綱、狀態列，以及帶最近檔案的主畫面。
- 資料夾只顯示你的 Markdown 筆記，頂部是最近與釘選項目。
- Split View 把 Markdown 原文放在排版頁面旁邊。
- GitHub 警示和 Obsidian callout 以區塊顯示，front matter 以表格開啟。
- 「複製為結構化文字」— 信件和聊天裡不帶標記。
- 大文件開啟快約十倍。

圖表
- 全新引擎渲染 mermaid 區塊 — 語法不變，32 種圖表：從 venn、treemap 到 radar、swimlane。
- 圖表、圖形與公式跟隨主題配色；任何圖表或寬表格都能全螢幕檢視。
- 任意圖表可複製為圖片，或儲存為 PNG / SVG。
- 每張圖表都有自己的外觀：自動、作者配色、淺色或深色。

列印
- 列印（⌘P）直接開啟系統列印面板；輸出 PDF 無需面板、直接存檔。

此外：介面語言可跟隨系統，整個 App 一個縮放，文件裡的圖片也能重新拷回剪貼簿。
```

## Screenshot captions fix (if the 2.3.0 set is uploaded)

Caption 5 in the 2.3.0 pack says «33 themes. Light, dark, yours.» →
use «32 themes. Light, dark, yours.» (theme families changed in 2.3.x;
number corrected by the 2.5.0 release notes).

## Upload plan (after user ok)

1. User uploads `/Users/myevdokimov/Downloads/Mark-mas-2.5.0.pkg` via Transporter.
2. asc-api.py (needs MARK_ASC_ISSUER) → wait processingState READY.
3. Apply metadata per locale via API (version localizations: description,
   what's New; appInfo: subtitle). UI-only: review submission with manual
   release, age rating unchanged, appReviewDetails unchanged.
4. Read back via API; record evidence here and in plan.xml.

## Apply log (2026-10-18, user «ок» received)

Executed by `.grace/changes/active/C-59/asc-apply.py` + `asc-payload.json`
(MARK_ASC_ISSUER from env; key untouched in ~/Downloads):

- Upload: `xcrun altool --upload-app` with the ASC API key
  (M665M4B6J3) — UPLOAD SUCCEEDED, Delivery 3896c4bb-43b1-42cf-8218-0004e4ee738d,
  12,666,424 bytes in 7.1 s. Build 2.5.0 (id 3896c4bb…) state=VALID
  after ~3 min; usesNonExemptEncryption=false set via API.
- Version 2.5.0 created via API: 30c769eb-669e-4639-a811-9c8121b9f7bc,
  platform MAC_OS, **releaseType MANUAL** (manual release).
- appInfo: draft 045fe5cd-864c-4f2e-8f2e-c7c221dfdf7d is the editable one
  (live 248ecb0e freezes name/subtitle). en-US subtitle →
  `WYSIWYG markdown, 12 MB`; 9 locale localizations created/patched with
  pack names+subtitles; privacyPolicyUrl inherited from en-US.
- versionLocalizations: en-US patched, 9 created — description (pack base
  + C-59 deltas), whatsNew (new copy), keywords, promotionalText;
  supportUrl/marketingUrl inherited from en-US.
- Reviewer notes (appStoreReviewDetail b0117b28…): stale live-viewer
  sentence removed.
- Media: en-US inherited 10 old 2.1.x screenshots + old preview — deleted
  and replaced. All 10 locales now carry 6 shots (APP_DESKTOP set) +
  v5 preview (DESKTOP set, 42,062,584 B, chunked upload). Preview served
  by Apple (videoUrl m3u8 present) — the C-15 silent no-AAC trap did not
  recur (v5 has the required silent AAC track).
- Read-back (`status`): 10 locales × (desc/wn applied, shots=6, vids=1),
  version PREPARE_FOR_SUBMISSION. API findings recorded: platform enum
  MAC_OS; appScreenshots hang off appScreenshotSets (type APP_DESKTOP);
  appPreviews off appPreviewSets (previewType DESKTOP); large assets
  upload as multi-chunk operations; ASC auto-creates an appInfoLocalization
  when a version localization appears.
- Remaining user step: submit for review in ASC UI (manual release
  already set on the version); then release manually after approval.
