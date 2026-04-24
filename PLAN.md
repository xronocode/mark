# Mark Text Modernization & Tauri Port — Implementation Plan

**Дата:** 2026-04-24
**Рабочая директория:** [/Users/myevdokimov/prj/mark/](../../prj/mark/)
**Upstream:** https://github.com/marktext/marktext (develop @ `be81e3aa`, март 2026)
**Контекстный документ:** [marktext-port-context.md](../../prj/mark/marktext-port-context.md)

---

## 1. Context

Mark Text — это заброшенный авторами, но живой в комьюнити WYSIWYG Markdown редактор на Electron 18 + Vue 2. Основные проблемы, которые нужно решить:

1. **Вес приложения** — 150-200 MB (тянет Chromium), хочется ~10-20 MB.
2. **macOS Apple Silicon** — Gatekeeper блокирует неподписанные arm64 бинарники; официальные авторы отказались платить $99/год.
3. **Накопленные PR-ы комьюнити** — 15+ фиксов и фичей, включая CVE-2023-2318 (XSS) и критичные crash-ы, лежат годами без мержа.
4. **Устаревший стек** — Vue 2 (EOL), webpack, electron-builder, webpack-build занимает минуты.
5. **Простая установка на Mac** — сейчас brew cask deprecated, пользователь должен `sudo xattr` вручную. Нужен `brew install --cask` workflow.

**Желаемый исход:** легковесный (под 30 MB) нативный-на-ощущение MarkText с собственным Homebrew tap, в который инкорпорированы свежие комьюнити-доработки, с автоматизированной подписью и релизом через GitHub Actions.

### Стратегическое решение (утверждено)

**Гибридный двухфазный подход:**

- **Фаза A (быстрая):** взять develop, мержить PR #4001 (electron-vite + Vue 3) как основу, поверх него — 9 bugfix PR-ов и 4 feature PR-а. Результат: modernized Electron-приложение, -100 MB веса. Выпустить это как **v1.0** через свой Homebrew tap. Автономно (через `grace-multiagent-execute`).
- **Фаза B (радикальная):** после того как v1.0 стабилен — портировать на Tauri v2, переписав `src/main/` на Rust commands + плагины. Результат: ~15 MB, ad-hoc code signing бесплатно, нативная macOS интеграция через WKWebView. Интерактивно с ревью между шагами.

**Почему гибрид:** muya не зависит от Electron (подтверждено grep'ом — 0 импортов `electron` из `src/muya/`), поэтому он портируется в WebView "как есть". Все риски концентрируются в `src/main/` (12 подмодулей, 6 native-зависимостей). Разделение на две фазы даёт ранний ценностный релиз, снижает blast radius Tauri-миграции, и Фаза A сама по себе — законченный ценный артефакт даже если Фаза B затянется.

---

## 2. GRACE Prerequisites (TODO на старте)

GRACE требует `docs/requirements.xml` + `docs/technology.xml` + `docs/verification-plan.xml`. В проекте их пока нет. **Шаг 0** — запустить `$grace-init` в директории `/Users/myevdokimov/prj/mark/` (не внутри `marktext/`, а в родителе) и наполнить артефакты содержимым из этого плана. Структура GRACE-документов:

- `docs/requirements.xml` — UseCases из §4 этого плана (UC-1..UC-12).
- `docs/technology.xml` — стек-решения Фаз A и B (Vue 3, Vite, Tauri v2, Rust, Homebrew cask, GitHub Actions).
- `docs/verification-plan.xml` — заготовки V-M-xxx из §9.
- `docs/development-plan.xml` — модульная декомпозиция из §6.
- `docs/knowledge-graph.xml` — M-xxx + CrossLinks из §6.

---

## 3. Аудит текущего клона

| Параметр | Значение |
|---|---|
| Путь | `/Users/myevdokimov/prj/mark/marktext/` |
| Branch | `develop` |
| HEAD | `be81e3aa chore: update readme file (#4136)` |
| PR #4001 | **НЕ смержен** |
| Структура `src/` | `main/`, `renderer/`, `muya/`, `common/` |
| Muya ↔ Electron coupling | **Нулевое** (grep `require('electron')` в `src/muya/` → 0 совпадений) |
| `src/main/` подмодулей | 12 (`app`, `cli`, `commands`, `contextMenu`, `dataCenter`, `filesystem`, `keyboard`, `menu`, `preferences`, `spellchecker`, `windows`, `utils`) |
| Native-модули | `keytar`, `chokidar`, `fontmanager-redux`, `native-keymap`, `vscode-ripgrep`, `@hfelix/electron-localshortcut` |
| Build | webpack + electron-builder (`.electron-vue/build.js`) |
| Тесты | Karma (unit) + Playwright (e2e) |
| Runtime deps | 53 |
| DevDeps | 86 |

**Ключевой инсайт:** muya — чистый DOM-код, переживает WebView WKWebView без изменений. Риски порта сконцентрированы в `src/main/` и 6 нативных зависимостях.

---

## 4. UseCases (требования)

| ID | UseCase | Приоритет | Фаза |
|---|---|---|---|
| UC-1 | WYSIWYG-редактирование markdown (muya) | Critical | A (сохранить) |
| UC-2 | Source code / split view / typewriter modes | Critical | A |
| UC-3 | Экспорт HTML / PDF | High | A |
| UC-4 | Поиск по файлу и по папке (ripgrep) | High | A/B |
| UC-5 | Сайдбар с деревом файлов (chokidar watcher) | High | A/B |
| UC-6 | Темы (dark/light/sepia + пользовательские CSS) | High | A |
| UC-7 | Диаграммы (Mermaid v11, Vega, flowchart, KaTeX) | High | A (#4025) |
| UC-8 | Проверка орфографии | Medium | A/B |
| UC-9 | Мультивкладочность + drag&drop изображений | High | A |
| UC-10 | Full WYSIWYG mode (скрытие markdown-синтаксиса) | High | A (#4145) |
| UC-11 | Безопасность: XSS-fix + подтверждение shell.openPath | Critical | A (#3621, #4177) |
| UC-12 | Установка через `brew install --cask` | Critical | A |
| UC-13 | Ad-hoc macOS signing + notarization-free distribution | Critical | A |
| UC-14 | Запуск на macOS arm64 (Apple Silicon) без xattr | Critical | A |
| UC-15 | Footprint < 30 MB на диске | High | B |
| UC-16 | Auto-update через Homebrew (brew upgrade) | Medium | A |

---

## 5. Architecture Strategy

### Фаза A — Modernization (Electron-path)

```
marktext/  (будет fork'аться в отдельный repo)
├── electron/           # было src/main, переименовано под electron-vite
│   └── (всё из src/main/, но с Vite-конфигом)
├── src/                # renderer + muya, оба под Vite
│   ├── renderer/       # Vue 3 (после PR #4001)
│   ├── muya/           # как есть (нулевое coupling)
│   └── common/
├── electron.vite.config.ts    # единый конфиг для main + preload + renderer
├── .github/workflows/release.yml   # build → sign (ad-hoc) → publish GH Release
└── homebrew-tap/       # отдельный репо user/homebrew-marktext c Casks/marktext.rb
```

**Стек Фазы A:**
- Electron 30+ (LTS на момент 2026-04)
- Vue 3 + Composition API (через PR #4001)
- Vite 5 + electron-vite
- TypeScript (постепенно, не весь рефактор сразу)
- electron-builder для DMG/ZIP → ad-hoc signing через `codesign --force --deep --sign -`
- GitHub Actions: matrix build (macos-14 arm64, macos-13 x86_64, ubuntu, windows)
- Homebrew cask в своём tap

### Фаза B — Tauri Port

```
marktext-tauri/
├── src-tauri/          # Rust backend (бывший src/main)
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/   # #[tauri::command] — IPC API
│   │   ├── fs/         # файловые операции (notify crate вместо chokidar)
│   │   ├── search/     # ripgrep как embedded crate (grep-searcher)
│   │   ├── prefs/      # tauri-plugin-store
│   │   ├── shortcuts/  # tauri-plugin-global-shortcut
│   │   ├── spell/      # через ОС-APIs (NSSpellChecker на macOS)
│   │   └── fonts/      # font-kit crate
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                # frontend (Vue 3) — напрямую из Фазы A
│   ├── renderer/
│   └── muya/
├── vite.config.ts
└── homebrew-tap/       # тот же tap, обновлённая формула
```

**Стек Фазы B:**
- Tauri v2 (2026 stable)
- Rust 1.75+
- Vue 3 (unchanged из Фазы A)
- Tauri plugins: `@tauri-apps/plugin-store`, `-fs`, `-shell`, `-dialog`, `-global-shortcut`, `-os`, `-updater`
- `notify` crate (file watcher), `grep-searcher` (ripgrep library), `font-kit` (fonts)

---

## 6. Модульная декомпозиция (Фаза B — Tauri)

Для Фазы A модули остаются как в upstream + PR #4001; отдельная декомпозиция не нужна. Ниже — модули Tauri-порта.

| ID | Модуль | Type | Purpose | Depends | Target path | Verification |
|---|---|---|---|---|---|---|
| M-001 | `mt-tauri-shell` | ENTRY_POINT | Tauri main entrypoint, window lifecycle, меню | M-002..M-009 | `src-tauri/src/main.rs` | V-M-001 |
| M-002 | `mt-fs-commands` | INTEGRATION | Файловые IPC-команды: read/write/stat/rename/delete | M-010 | `src-tauri/src/commands/fs.rs` | V-M-002 |
| M-003 | `mt-fs-watcher` | CORE_LOGIC | File watcher через `notify`, эмит событий в окно | - | `src-tauri/src/fs/watcher.rs` | V-M-003 |
| M-004 | `mt-search` | CORE_LOGIC | Поиск в файле/папке через `grep-searcher` | - | `src-tauri/src/search/mod.rs` | V-M-004 |
| M-005 | `mt-prefs` | DATA_LAYER | Persistent settings через `tauri-plugin-store` | - | `src-tauri/src/prefs/mod.rs` | V-M-005 |
| M-006 | `mt-shortcuts` | INTEGRATION | Глобальные и локальные хоткеи | - | `src-tauri/src/shortcuts/mod.rs` | V-M-006 |
| M-007 | `mt-spell` | INTEGRATION | NSSpellChecker (mac) / hunspell (linux/win) bridge | - | `src-tauri/src/spell/mod.rs` | V-M-007 |
| M-008 | `mt-fonts` | INTEGRATION | Системные шрифты через `font-kit` | - | `src-tauri/src/fonts/mod.rs` | V-M-008 |
| M-009 | `mt-menu` | UI_COMPONENT | Нативное меню + context menu | M-005 | `src-tauri/src/menu/mod.rs` | V-M-009 |
| M-010 | `mt-security` | UTILITY | path-sandbox, URL whitelisting (CVE-2023-2318) | - | `src-tauri/src/security.rs` | V-M-010 |
| M-011 | `mt-renderer` | UI_COMPONENT | Vue 3 renderer app (из Фазы A) | M-012 | `src/renderer/` | V-M-011 |
| M-012 | `muya` | CORE_LOGIC | WYSIWYG engine (без изменений) | - | `src/muya/` | V-M-012 |
| M-013 | `mt-ipc-bridge` | UTILITY | Frontend wrapper над `invoke()`, mimicking старый Electron API | M-002..M-008 | `src/renderer/src/ipc/` | V-M-013 |

### Data Flows

- **DF-001 Open File:** renderer → `mt-ipc-bridge.readFile(path)` → `invoke('fs_read')` → M-002 → диск → buffer → renderer → muya.setContent
- **DF-002 Save File:** muya.getContent → renderer → `invoke('fs_write', path, content)` → M-002 → fsync → ack
- **DF-003 Search Folder:** renderer → `invoke('search', pattern, folder)` → M-004 (grep-searcher stream) → results батчатся через events → renderer UI
- **DF-004 File Changed Externally:** M-003 (notify watcher) → эмитит `mt:fs:changed` event → renderer → muya reload w/ позиция скролла (PR #4152)
- **DF-005 Global Shortcut:** OS → M-006 → event → renderer → command dispatcher
- **DF-006 Preferences Roundtrip:** renderer UI → `invoke('prefs_set')` → M-005 (tauri-plugin-store) → persist → event обратно в renderer

### IPC-контракт (backwards-compatible с Electron)

Критично: `mt-ipc-bridge` (M-013) эмулирует Electron IPC API, чтобы renderer-код из Фазы A переносился в Фазу B **без изменений**. Пример:

```ts
// renderer/src/ipc/index.ts
export const ipc = {
  fs: {
    read: (path: string) => invoke<string>('fs_read', { path }),
    write: (path: string, content: string) => invoke<void>('fs_write', { path, content }),
    watch: (path: string, cb: (e: FsEvent) => void) => listen('mt:fs:changed', e => cb(e.payload)),
  },
  // ... зеркало всего электроновского API
}
```

---

## 7. Phased Implementation Order

### Phase-0: GRACE Bootstrap & Fork Setup (1 день, autonomous)

1. `$grace-init` в `/Users/myevdokimov/prj/mark/`.
2. Fork `marktext/marktext` → `{user}/marktext` (пользователь создаёт вручную, агент просит URL).
3. Зеркало: `cd marktext && git remote add fork <url> && git push fork develop:main`.
4. Создать ветку `modernize` от `develop`.
5. Заполнить `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/verification-plan.xml`, `docs/knowledge-graph.xml` на основе этого плана.
6. **Gate:** `$grace-status` → green.

### Phase-A1: Baseline Stabilization (2-3 дня, autonomous)

1. Merge bugfix PR-ы в порядке минимального конфликта: #4154 (EPIPE) → #4135 (crash) → #4134 (hotkeys) → #4152 (scroll) → #4146 (unsaved prompt) → #4093 (dark flash) → #4177 (shell.openPath) → #3621 (XSS) → #4157 (Mermaid macOS). Каждый PR — отдельный cherry-pick + `yarn test` + commit.
2. Merge feature PR-ы: #4025 (Mermaid v11) → #4070 (Read-Only) → #4150 (HTML paste) → #4145 (Full WYSIWYG).
3. Запустить полный тест-сьют (Karma unit + Playwright e2e) и зафиксировать baseline зелёным.
4. **Gate:** все тесты зелёные, сборка `yarn build:bin` проходит.

### Phase-A2: Toolchain Migration (3-5 дней, autonomous с контрольной точкой)

1. Merge PR #4001 как отдельная ветка `refactor/electron-vite`, разрешить конфликты с результатом Phase-A1 вручную (помощь агента, ревью пользователя).
2. Обновить Electron до 30 LTS (на 2026-04).
3. Обновить Node.js target до 20 LTS.
4. Пересобрать native-модули (`electron-rebuild`) под новый Node ABI.
5. Прогнать e2e. Починить регрессии.
6. **Gate [USER REVIEW]:** приложение запускается, все 12 critical UCs работают.

### Phase-A3: macOS Distribution (2-3 дня, interactive)

1. Настроить `electron-builder` на ad-hoc signing: `"identity": null` → `codesign --force --deep --sign - <app>` в post-build хуке.
2. Создать `.github/workflows/release.yml`: tag `v*` → matrix build (macos-14, macos-13, ubuntu, windows) → publish GitHub Release с DMG/ZIP.
3. Создать отдельный репо `{user}/homebrew-marktext-modernized` со структурой:
   ```
   Casks/
     marktext.rb    # cask с url на GH Release, sha256, version, livecheck
   ```
4. Cask содержит `postflight do system_command "/usr/bin/xattr", args: ["-cr", "#{appdir}/MarkText.app"]` для снятия quarantine автоматически.
5. Livecheck block в cask для `brew upgrade --cask marktext` автообновления.
6. **Gate [USER REVIEW]:** `brew tap {user}/marktext-modernized && brew install --cask marktext` запускает приложение на чистом Mac без `sudo xattr`.

### Phase-A4: v1.0 Release (1 день, interactive)

1. Tag `v1.0.0`.
2. Проверить все 16 UCs на чистой установке через brew.
3. Release notes в GitHub: changelog из включённых PR-ов + атрибуция авторов.
4. **Gate [USER REVIEW]:** v1.0 выпущен. Фаза A закрыта.

**ОСТАНОВКА.** Между Фазой A и B — окно стабилизации ~2 недели на реальных пользователей (offer to `/schedule` agent-ревизора).

### Phase-B1: Tauri Skeleton (2-3 дня, interactive)

1. `cargo tauri init` поверх Vue 3 renderer из v1.0.
2. Создать модули M-001..M-013 как пустые стабы с `MODULE_CONTRACT` в docstring.
3. Frontend работает в Tauri dev (`cargo tauri dev`) с выключенными features — просто muya в окне.

### Phase-B2: FS & Search Migration (3-5 дней, interactive)

1. M-002, M-003, M-010 (fs commands, watcher, security). Параллельно писать unit-тесты Rust.
2. M-004 (search) через `grep-searcher` crate.
3. Порт `mt-ipc-bridge` (M-013) — слой совместимости. Renderer-тесты работают без изменений.
4. **Gate:** V-M-002, V-M-003, V-M-004, V-M-010 зелёные.

### Phase-B3: Integrations (3-5 дней, interactive)

1. M-005 (prefs via plugin-store), M-006 (shortcuts), M-007 (spell).
2. M-008 (fonts via `font-kit`).
3. M-009 (native menu).

### Phase-B4: Tauri Distribution (2-3 дня, interactive)

1. Обновить `.github/workflows/release.yml` на `tauri-action`.
2. Обновить Homebrew cask: новые URL, новые sha256, но та же формула. Пользователь получит Tauri-версию через обычный `brew upgrade --cask marktext`.
3. Verification: footprint < 30 MB, запуск на чистой macOS arm64 без xattr.
4. **Gate [USER REVIEW]:** v2.0 выпущен.

---

## 8. Distribution (Homebrew Tap)

### Структура tap-репозитория

```
{user}/homebrew-marktext-modernized/
├── Casks/
│   └── marktext.rb
└── README.md
```

### Cask-формула (скелет)

```ruby
cask "marktext" do
  version "1.0.0"
  sha256 arm:   "...", intel: "..."

  url "https://github.com/{user}/marktext/releases/download/v#{version}/MarkText-#{version}-#{arch}.dmg"
  name "Mark Text"
  desc "Lightweight Markdown editor"
  homepage "https://github.com/{user}/marktext"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "MarkText.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/MarkText.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/marktext",
    "~/Library/Preferences/com.github.marktext.marktext.plist",
    "~/Library/Saved Application State/com.github.marktext.marktext.savedState",
  ]
end
```

Пользовательский flow:

```bash
brew tap {user}/marktext-modernized
brew install --cask marktext
# работает. Обновление:
brew upgrade --cask marktext
```

---

## 9. Verification Plan

Ссылки `V-M-xxx` → `docs/verification-plan.xml` (будет создан в Phase-0).

| Ref | Модуль | Ключевые проверки | Log/trace anchors |
|---|---|---|---|
| V-M-001 | mt-tauri-shell | app lifecycle, window create/close/hide | `tracing::info!(event="window.created")` |
| V-M-002 | mt-fs-commands | read/write roundtrip UTF-8, 10 MB файл, symlink, permission denied | `tracing::debug!(event="fs.read",path,bytes)` |
| V-M-003 | mt-fs-watcher | create/modify/delete/rename events, debounce | `event="fs.watch.fired"` |
| V-M-004 | mt-search | regex/literal/case/whole-word, 10k files, cancel mid-stream | `event="search.result.batch"` |
| V-M-005 | mt-prefs | set→get roundtrip, миграция схемы из electron-store | `event="prefs.migrated"` |
| V-M-006 | mt-shortcuts | global (Cmd+Shift+M), local, conflict detection | `event="shortcut.registered"` |
| V-M-007 | mt-spell | suggest, добавить в словарь, multiple languages | `event="spell.suggest"` |
| V-M-008 | mt-fonts | enumerate, fallback при отсутствии шрифта | — |
| V-M-009 | mt-menu | все пункты меню вызывают правильные commands | `event="menu.invoked",id` |
| V-M-010 | mt-security | URL whitelist (http/https/file:<sandbox>), shell.openPath prompt | `event="security.blocked"` |
| V-M-011 | mt-renderer | muya mount, theme switch, Source/WYSIWYG toggle | — |
| V-M-012 | muya | все специфики — e2e через Playwright-сценарии | — |
| V-M-013 | mt-ipc-bridge | контракт-тесты (schema frontend↔backend) | — |

**Global gates:**
- Gate-A: все Phase-A тесты Karma+Playwright проходят.
- Gate-B: все Phase-B Rust unit + integration тесты + e2e Playwright через Tauri WebDriver.
- Gate-Dist: чистая macOS (VM без Mark Text в истории) → `brew install --cask` → app запустился.

### Сценарные mental walkthroughs

**WT-1: Открытие 50 MB markdown файла с Mermaid диаграммами**
UI (renderer) → `ipc.fs.read('./big.md')` → M-013 → `invoke('fs_read')` → M-002 читает стримингом → blob в renderer → muya parser → renderers/mermaid.js (v11) → SVG. Точки отказа: OOM в muya parser (нужно chunked parsing, уже есть в muya). Log-anchors: `fs.read.bytes`, `muya.parse.ms`, `mermaid.render.count`.

**WT-2: Внешнее изменение файла пока пользователь редактирует**
M-003 notify-event → `mt:fs:changed` → renderer сверяет mtime → если есть unsaved changes — показать диалог (PR #4146 logic) → если нет — reload с сохранением scroll position (PR #4152). Риск: race condition между write-through muya и внешним изменением. Решение: debounce 200ms + compare content hash. Log: `fs.changed.externally,path,hasUnsaved`.

**WT-3: brew install на чистой macOS arm64**
`brew tap` → клонирует tap → `brew install --cask marktext` → download DMG из GH Release → mount → copy `MarkText.app` в `/Applications` → postflight `xattr -cr` снимает quarantine → запуск. Gatekeeper проверяет ad-hoc signature — проходит (ad-hoc валиден локально). Log: brew install logs + `Console.app` для Gatekeeper трейса.

---

## 10. Risks

| Risk | Вероятность | Impact | Mitigation |
|---|---|---|---|
| Конфликты при мерже PR #4001 + bugfixes | Высокая | Средний | Мержить bugfixes ДО #4001 (Phase-A1 перед A2), меньше дивергенция |
| Apple Silicon: ad-hoc signing не проходит Gatekeeper на строгих политиках | Средняя | Высокий | Fallback: `xattr -cr` в cask postflight. Документировать в README |
| Native-модули не пересобираются под новый Electron ABI | Средняя | Средний | electron-rebuild в CI, fallback — форкнуть зависимость |
| Tauri v2 plugin-store несовместим со schema electron-store | Высокая | Средний | M-005 написать миграционный слой, читать старый JSON, писать новый формат |
| muya в WKWebView медленнее Chromium на больших файлах | Средняя | Высокий | Benchmark Phase-B1, fallback — оптимизация muya (virtual scroll) |
| NSSpellChecker API в Tauri — нет готового плагина | Высокая | Низкий | Написать свой rust-ffi бриджинг через `objc2` crate |
| Font enumeration через `font-kit` медленнее `fontmanager-redux` | Низкая | Низкий | Кеш список шрифтов в prefs |
| GitHub Actions matrix build падает на отдельных ОС | Средняя | Средний | Per-platform allow-failure flag в v1.0, обязательно в v2.0 |
| Homebrew tap livecheck не находит GH Release | Низкая | Низкий | Проверять через `brew livecheck --cask marktext` в CI |
| Пользователи старой установки потеряют настройки | Средняя | Высокий | M-005 мигрирует `~/Library/Application Support/marktext/config.json` в tauri-plugin-store |
| CVE-2023-2318 исправление ломает какой-то существующий markdown pattern | Низкая | Средний | Regression-тесты через CommonMark + GFM spec (уже есть в `test/specs/`) |
| Mermaid v11 breaking changes для существующих диаграмм пользователей | Средняя | Средний | Документировать в changelog v1.0, fallback — опция "legacy Mermaid v10" в настройках |

---

## 11. Автономное исполнение — особенности

Пользователь выбрал **смешанный режим**: Phase-0, A1, A2 — автономно (`$grace-multiagent-execute`), A3, A4, B1-B4 — интерактивно (`$grace-execute`).

Для автономной Phase-A1 и A2:
- Каждый PR-merge — отдельный commit (не squash), легко откатить `git revert`.
- После каждого commit — полный `yarn test`. Красный тест = STOP, не продолжать, эскалировать пользователю.
- `$grace-verification` пишет per-PR contract-тесты до мержа.
- Агенты Phase-A1 могут работать параллельно по PR-ам, но **только над независимыми PR-ами** (непересекающиеся файлы). Граф конфликтов:
  - #4154 + #4135 + #3621 — независимы (разные файлы), можно параллельно.
  - #4157 + #4025 — оба трогают Mermaid, последовательно.
  - #4145 + #4070 + #4150 — все в renderer/components, последовательно.

Триггеры для эскалации к пользователю в автономном режиме:
1. Любой красный тест.
2. Конфликт при git cherry-pick, который требует изменения логики (не просто import path rename).
3. Изменение native-модуля version в `package.json`.
4. Любое изменение `.github/workflows/` (безопасность CI).

---

## 12. Critical Files (для модификации)

**Phase-A (читать/редактировать):**
- [marktext/package.json](../../prj/mark/marktext/package.json) — deps, Electron version
- [marktext/.electron-vue/](../../prj/mark/marktext/.electron-vue/) — заменяется на `electron.vite.config.ts`
- [marktext/src/main/index.js](../../prj/mark/marktext/src/main/index.js) — точка входа main
- [marktext/src/renderer/](../../prj/mark/marktext/src/renderer/) — Vue 2 → Vue 3 (из PR #4001)
- [marktext/src/muya/lib/index.js](../../prj/mark/marktext/src/muya/lib/index.js) — НЕ трогать, только если багфикс
- [marktext/.github/workflows/](../../prj/mark/marktext/.github/workflows/) — заменяем release.yml
- [marktext/electron-builder.yml](../../prj/mark/marktext/electron-builder.yml) — ad-hoc signing config

**Phase-B (создать):**
- `marktext-tauri/src-tauri/` — весь Rust backend с нуля
- `marktext-tauri/src-tauri/Cargo.toml`, `tauri.conf.json`
- `marktext-tauri/src/renderer/src/ipc/index.ts` — M-013 bridge

**Distribution (создать):**
- Отдельный репо `{user}/homebrew-marktext-modernized/Casks/marktext.rb`
- `marktext/.github/workflows/release.yml` — релиз-пайплайн

**Referenced existing utilities (переиспользовать):**
- `src/muya/lib/parser/` — markdown parser, перенести as-is
- `src/muya/lib/renderers/` — mermaid/vega/flowchart/katex renderers (после #4025)
- `test/specs/commonMark/`, `test/specs/gfm/` — regression specs для parser
- `test/e2e/` — Playwright сценарии, расширить для Tauri WebDriver

---

## 13. Верификация end-to-end

**Как проверить что план сработал (после всех фаз):**

1. Клонировать новый tap на чистом Mac: `brew tap {user}/marktext-modernized`
2. `brew install --cask marktext` → без ошибок, без sudo.
3. Запустить: Spotlight → MarkText → окно открылось < 2 сек.
4. Открыть [test/fixtures/](../../prj/mark/marktext/test/fixtures/) файл с Mermaid, KaTeX, таблицей, изображением → всё рендерится.
5. `du -sh /Applications/MarkText.app` → < 30 MB (Phase B) или < 120 MB (Phase A).
6. Прогон e2e: `yarn e2e` на v1.0, `cargo tauri test` на v2.0.
7. `brew upgrade --cask marktext` после подъёма version в cask → обновление автоматическое.
8. Security: открыть PDF через внешнюю ссылку → prompt (#4177). Вставить `<script>alert(1)</script>` в markdown → не исполняется (#3621).
9. Проверить UC-1..UC-16 по чеклисту.

---

## 14. Open questions (для start of execution)

1. **GitHub username/organization** для форка и tap-репозитория — запросить перед Phase-0.
2. **Имя форка** — `marktext` или `marktext-modernized` / другое?
3. **Apple Developer ID** — есть в наличии или строго ad-hoc? (влияет на cask — для notarized версии не нужен `xattr -cr`).
4. **Windows/Linux** — в scope или только macOS на первой итерации? (matrix build в CI либо только mac).
5. **Телеметрия** — включать? По умолчанию в Mark Text нет, предлагаю оставить как есть.

Эти вопросы будут заданы как отдельные `AskUserQuestion` в начале Phase-0 (в экзекуционной сессии, не сейчас).
