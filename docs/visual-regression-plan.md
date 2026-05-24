# Visual Regression Test Plan — Mark v2.0.0-alpha

## Pre-test Protocol (ОБЯЗАТЕЛЬНО перед каждым прогоном)

```bash
# Вариант 1: Скрипт (рекомендуется)
bash tools/dev-smoke.sh

# Вариант 2: Вручную
# 1. Чистое состояние
pkill -f "target/.*/mark" ; pkill -f vite ; sleep 2

# 2. Свежий dev server
npm run dev &
until curl -s -o /dev/null -w '%{http_code}' http://localhost:1420/ | grep -q 200; do sleep 1; done

# 3. Свежий билд
cargo build --manifest-path src-tauri/Cargo.toml --bin mark

# 4. Сброс window-state (дефолтные размеры)
rm -f ~/Library/Application\ Support/com.xronocode.mark/.window-state.json

# 5. Запуск с проверкой
MARK_SKIP_MIGRATION=1 ./target/debug/mark 2>/tmp/mark-stderr.log &
sleep 4
grep 'BLOCK_TITLEBAR_TRANSPARENT_OVERLAY_OK' /tmp/mark-stderr.log || echo "FAIL: titlebar"
grep 'BLOCK_INVOKE_OK' /tmp/mark-stderr.log || echo "FAIL: renderer boot"
curl -s -o /dev/null -w '%{http_code}' http://localhost:1420/ | grep -q 200 || echo "FAIL: dev server died"
```

**Критерий прохождения каждого теста:**
- ✅ = визуально корректно + бэкенд маркер в stderr (если есть)
- ❌ = сломано
- ⚠️ = работает с оговорками

## Правила во время тестирования (ОБЯЗАТЕЛЬНО)

1. **ОДИН экземпляр Mark.** Если нужно перезапустить — сначала `pkill -f "target/.*/mark"`, подождать 2с, только потом запускать новый. Проверить: `pgrep -f "target/.*/mark"` должен вернуть **один** PID.

2. **Перед каждым скриншотом** — проверить:
   - Dev server жив: `curl -s -o /dev/null -w '%{http_code}' http://localhost:1420/` → 200
   - Mark процесс жив: `pgrep -f "target/.*/mark"` → ровно 1 PID
   - Если любая проверка не прошла → **остановиться, выполнить Pre-test Protocol заново**

3. **Тесты требующие перезапуска Mark** (выполнить полный Pre-test Protocol заново):
   - 1.10 (сохранение размера) — закрыть и открыть Mark
   - 9A.7 (restore layout) — закрыть и открыть Mark
   - 9A.8 (startup action) — закрыть и открыть Mark
   - 11.13 (second instance) — запустить второй экземпляр, потом убить его
   - 14.4–14.6 (Finder/CLI open) — может создать второй экземпляр

4. **Белый экран = сначала проверь dev server**, а не ищи баг рендеринга. В 90% случаев это мёртвый сервер.

5. **После fullscreen (1.12, 1.13)** — подождать 2с после выхода, macOS анимация может задержать layout recalc.

---

## ГРУППА 1: Окно и тайтлбар

| # | Тест | Фронт (что видим) | Бэк (что проверяем) |
|---|------|--------------------|-----------------------|
| 1.1 | Стартовый размер окна | 1024×768, по центру экрана | `.window-state.json` отсутствует → дефолт из tauri.conf.json |
| 1.2 | Traffic lights + иконки на одной строке | 🔴🟡🟢 слева, затем sidebar/folder/toc/gear/moon | `BLOCK_TITLEBAR_TRANSPARENT_OVERLAY_OK` в stderr |
| 1.3 | Прозрачный тайтлбар | Нет белой полосы над иконками, фон == фон редактора | — |
| 1.4 | Заголовок "Untitled-1" | По центру тайтлбара | — |
| 1.5 | Version badge | "v2.0.0-alpha.7 DEV" справа | Только в debug build |
| 1.6 | Word count "W 0" | Справа, кликабельный | Клик переключает Words → Chars → Paragraphs → **All** (4 режима) |
| 1.7 | Drag окна за тайтлбар | Перетаскивание за пустую область тайтлбара работает | `data-tauri-drag-region` + fallback mousedown handler |
| 1.8 | Double-click maximize | Двойной клик по тайтлбару → maximize/restore (macOS) | — |
| 1.9 | Ресайз окна | Углы и грани, плавный ресайз | — |
| 1.10 | Сохранение размера между запусками | Закрыть → открыть → тот же размер и позиция | `.window-state.json` обновился |
| 1.11 | Minimize / Restore | 🟡 клик → dock, клик из dock → восстановление | — |
| 1.12 | Fullscreen (зелёная кнопка) | 🟢 клик → fullscreen, Esc → обратно | — |
| 1.13 | **Fullscreen → выход → тайтлбар цел** | После Esc из fullscreen: иконки на месте, drag работает, traffic lights видны | Регрессия: тайтлбар может сломаться после fullscreen |
| 1.14 | **Drag окна за край экрана** | Потянуть вправо/влево/вверх за границу монитора → окно не теряется, можно вернуть | — |
| 1.15 | **Green button long-press → Tile** | Зажать 🟢 → меню Tile Left / Tile Right (macOS Sequoia+) → окно занимает половину | Проверить что titlebar не ломается в tiled mode |
| 1.16 | **Resize до минимального размера** | Потянуть углы до минимума → UI не ломается, кнопки не обрезаются, нет overflow | — |
| 1.17 | **Filename click → rename** (macOS) | Клик по имени файла в тайтлбаре → inline rename поле | — |
| 1.18 | **Unsaved indicator** | Набрать текст → красная точка рядом с именем файла в тайтлбаре | — |

---

## ГРУППА 2: Редактор — базовые функции

| # | Тест | Фронт | Бэк |
|---|------|-------|----|
| 2.1 | Пустой редактор | "Type @ to insert", курсор мигает | — |
| 2.2 | Ввод текста | Печатаем абзац → текст появляется | — |
| 2.3 | Скролл при длинном тексте | Вставить 100+ строк → скролл работает, окно не растёт | — |
| 2.4 | Заголовки H1-H6 | `# H1` → крупный, `###### H6` → мелкий | — |
| 2.5 | Списки | `- item`, `1. item`, `- [ ] task` → рендерятся правильно | — |
| 2.6 | Code fence | ` ```js ` → подсветка синтаксиса | — |
| 2.7 | Blockquote | `> text` → стилизованная цитата | — |
| 2.8 | Таблица | Через меню Paragraph → Table → задать 3×3 → таблица | — |
| 2.9 | Горизонтальная линия | `---` → горизонтальная черта | — |
| 2.10 | Ссылка | `[text](url)` → кликабельная ссылка с попапом | — |
| 2.11 | Изображение | `![alt](path)` → картинка рендерится | — |
| 2.12 | Inline code | `` `code` `` → моноширинный стиль | — |
| 2.13 | Bold / Italic | `**bold**`, `*italic*` → форматирование | — |
| 2.14 | Math block | `$$\sum$$` → формула рендерится | — |
| 2.15 | Mermaid diagram | ` ```mermaid ` → SVG диаграмма | — |
| 2.16 | Front matter | `---\ntitle: x\n---` → стилизованный блок | — |
| 2.17 | Unsaved indicator | Набрать текст → точка в табе | — |
| 2.18 | Undo / Redo | Cmd+Z / Cmd+Shift+Z | — |
| 2.19 | **Duplicate paragraph** | Cmd+Shift+D (или edit.duplicate) → строка дублируется | — |
| 2.20 | **@ quick insert** | Набрать `@` → выпадающий список блоков (paragraph, table, code, math...) | — |

---

## ГРУППА 3: Табы

| # | Тест | Фронт | Бэк |
|---|------|-------|----|
| 3.1 | Новый таб (Cmd+N) | "Untitled-2" появляется | — |
| 3.2 | Переключение табов | Клик по табу → контент меняется | — |
| 3.3 | Закрытие таба (Cmd+W) | Таб исчезает, фокус на соседний | — |
| 3.4 | Закрытие несохранённого таба | Диалог "Save / Don't Save / Cancel" | `mt::ask-for-close` event |
| 3.5 | Middle-click close | Средняя кнопка мыши → таб закрывается | — |
| 3.6 | Скролл табов | 10+ табов → горизонтальный скролл (wheel + touchpad) | — |
| 3.7 | Drag-and-drop перестановка | Перетащить таб → порядок меняется (dragula) | — |
| 3.8 | Контекстное меню таба (ПКМ) | **7 пунктов:** Close This, Close Others, Close Saved, Close All, ―, Rename, Copy Path, Show in Folder | Rename/Copy Path/Show in Folder disabled если Untitled |
| 3.9 | "+" кнопка | Кнопка в конце tab bar → новый таб (opacity: 0 → hover) | — |
| 3.10 | Tab bar toggle | view.toggle-tabbar → tab bar скрывается/появляется | — |
| 3.11 | Cycle tabs | Ctrl+Tab / Ctrl+Shift+Tab → next/prev tab | — |
| 3.12 | **Tab unsaved indicator** | Несохранённый таб → красная точка, hover → X для закрытия | — |
| 3.13 | **Закрытие последнего таба** | Cmd+W на единственном табе → поведение (новый пустой или пустое окно) | — |

---

## ГРУППА 4: Сайдбар

| # | Тест | Фронт | Бэк |
|---|------|-------|----|
| 4.1 | Toggle sidebar | Кнопка sidebar в тайтлбаре → панель слева | — |
| 4.2 | Files panel | Кнопка folder → файловое дерево или CTA "Open Folder" | — |
| 4.3 | Open folder | CTA или Cmd+Shift+O → диалог → дерево файлов | `mt_cmd_open_folder` |
| 4.4 | Навигация по дереву | Клик по файлу → открывается в табе | `mt_fs_read` |
| 4.5 | Развернуть/свернуть папку | Клик по стрелке → содержимое показывается | — |
| 4.6 | TOC panel | Кнопка TOC → список заголовков текущего документа | — |
| 4.7 | TOC → навигация | Клик по заголовку в TOC → скролл к нему в редакторе | — |
| 4.8 | Opened Files секция | Список открытых табов, Save All, Close All | — |
| 4.9 | Ресайз сайдбара | Перетащить правый край (3px drag bar) → ширина меняется (min 220px) | — |
| 4.10 | File context menu (ПКМ) | **9 пунктов:** New File, New Directory, ―, Copy, Cut, Paste, ―, Rename, Move to Trash, ―, Show in Folder | Paste disabled если clipboard пуст |
| 4.11 | Create file in sidebar | ПКМ → New File → ввод имени → файл создаётся | `mt_fs_write` |
| 4.12 | **Create directory** | ПКМ → New Directory → ввод имени → папка создаётся | — |
| 4.13 | Rename file | ПКМ → Rename → ввод нового имени | — |
| 4.14 | Delete file | ПКМ → Move to Trash → подтверждение | `mt_fs_unlink` |
| 4.15 | File watcher | Изменить файл извне → дерево обновляется | `mt::watch::event` |
| 4.16 | **Copy / Cut / Paste** | ПКМ → Copy → перейти в другую папку → Paste → файл скопирован | — |
| 4.17 | **Exclude patterns** | Настройка treePathExcludePatterns → файлы фильтруются в дереве | `mt_prefs_set` |

---

## ГРУППА 5: Поиск

| # | Тест | Фронт | Бэк |
|---|------|-------|----|
| 5.1 | Find (Cmd+F) | Панель поиска появляется | — |
| 5.2 | Поиск текста | Ввести слово → подсветка совпадений, счётчик "1/N" | — |
| 5.3 | Next / Previous | Enter / Shift+Enter → навигация по совпадениям | — |
| 5.4 | Case Sensitive | Кнопка Aa → поиск регистрозависимый | — |
| 5.5 | Whole Word | Кнопка \b → только целые слова | — |
| 5.6 | Regex | Кнопка .* → regex-поиск, ошибка при невалидном regex | — |
| 5.7 | Replace (Cmd+H) | Поле замены появляется | — |
| 5.8 | Replace one | Кнопка → одна замена | — |
| 5.9 | Replace all | Кнопка → все замены, счётчик обновляется | — |
| 5.10 | Find in Folder (Cmd+Shift+F) | Поиск в сайдбаре по всем файлам проекта | `mt_search_spawn` |
| 5.11 | Search results | Список файлов с количеством совпадений | `mt::search-event` |
| 5.12 | Cancel search | Кнопка Cancel → поиск прерывается | `mt_search_cancel` |
| 5.13 | Close find bar | Escape → панель закрывается | — |

---

## ГРУППА 6: Режимы редактора

| # | Тест | Фронт | Бэк |
|---|------|-------|----|
| 6.1 | Source Code Mode (Cmd+Alt+S) | CodeMirror вместо WYSIWYG, raw markdown | — |
| 6.2 | Source → назад | Повторно Cmd+Alt+S → обратно WYSIWYG | — |
| 6.3 | Focus Mode | Только текущий абзац яркий, остальные приглушены | — |
| 6.4 | Typewriter Mode | Курсор всегда по центру экрана, авто-скролл | — |
| 6.5 | Комбинация Focus + Typewriter | Оба режима одновременно | — |
| 6.6 | Diff View | Включить → side-by-side diff vs git HEAD | `mt_diff_baseline` |
| 6.7 | Diff для Untitled | Ошибка "No baseline for untitled" | — |
| 6.8 | **Diff: inline toggle** | Переключение side-by-side ↔ inline в diff view | — |
| 6.9 | **Text direction toggle** | view.text-direction-ltr / view.text-direction-rtl → текст меняет направление | — |

---

## ГРУППА 7: Темы (34 шт.)

| # | Тест | Фронт | Бэк |
|---|------|-------|----|
| 7.1 | Quick theme toggle (🌙 кнопка) | Клик → переключение light ↔ dark | `mt_prefs_set` |
| 7.2 | Фон редактора после переключения | Тёмный фон при dark, светлый при light | CSS переменные |
| 7.3 | Тайтлбар цвет при dark | Тайтлбар принимает цвет темы (не остаётся белым) | — |
| 7.4 | Сайдбар цвет при dark | Сайдбар принимает цвет темы | — |
| 7.5 | Preferences → Theme | Карточки тем, клик → применяется мгновенно | — |
| 7.6 | Каждая из 34 тем | Применить → проверить что рендерится без артефактов | — |
| 7.7 | Custom CSS | Ввести `body { font-size: 20px }` → шрифт увеличивается | — |
| 7.8 | **Тема через нативное меню** | View → Theme → выбрать из submenu → применяется | — |

**Список тем для полного прогона:**
Light (10): ayu-light, light, catppuccin-latte, everforest-light, graphite, gruvbox-light, rose-pine-dawn, solarized-light, tokyo-night-light, ulysses
Dark (23): ayu-dark, ayu-mirage, dark, catppuccin-mocha, cyberdream, dracula, everforest-dark, gruvbox-dark, horizon-dark, kanagawa, material-dark, monokai-pro, nightfox, nord, one-dark, oxocarbon-dark, palenight, rose-pine, rose-pine-moon, solarized-dark, synthwave-84, tokyo-night, tokyo-night-storm

---

## ГРУППА 8: Файловые операции

| # | Тест | Фронт | Бэк |
|---|------|-------|----|
| 8.1 | Save (Cmd+S) новый файл | Диалог Save As → выбрать путь → файл создаётся | `mt_response_file_save` |
| 8.2 | Save существующий | Сохранение без диалога, точка unsaved исчезает | `mt_response_file_save` |
| 8.3 | Save As (Cmd+Shift+S) | Диалог → новый путь → файл копируется | `mt_response_file_save_as` |
| 8.4 | Open File (Cmd+O) | Диалог → выбрать .md → открывается в новом табе | `mt_cmd_open_file` + `mt_fs_read` |
| 8.5 | Open Folder (Cmd+Shift+O) | Диалог → сайдбар показывает дерево | `mt_cmd_open_folder` |
| 8.6 | Drag-and-drop файла | Перетащить .md в окно → открывается в табе | `onDragDropEvent` |
| 8.7 | Export HTML | File → Export HTML → файл .html создаётся | — |
| 8.8 | Export PDF | File → Export PDF → файл .pdf создаётся | `mt_pandoc_export` или `mt_print_to_pdf` |
| 8.9 | Auto-save | Включить в настройках → изменить текст → файл сохраняется через 5с | `mt_prefs_set` + `mt_response_file_save` |
| 8.10 | Rename file | Клик по имени в тайтлбаре → ввод нового имени | — |
| 8.11 | File encoding | Status bar → encoding → изменить → перечитать | — |
| 8.12 | Line endings | LF / CRLF → изменить → проверить при сохранении | — |
| 8.13 | Open Recent | File → Open Recent → список файлов | `mt_recent_list` |
| 8.14 | **Import file** | file.import-file → выбрать файл → импортируется | — |
| 8.15 | **Move file** | file.move-file → диалог → файл перемещён, таб обновлён | — |
| 8.16 | **Print** | file.print → системный диалог печати | — |

---

## ГРУППА 9: Настройки (Preferences)

### 9A. General

| # | Настройка | Включить | Проверить | Выключить | Проверить |
|---|-----------|----------|-----------|-----------|-----------|
| 9A.1 | Auto-save | ✓ toggle | Изменить текст → файл сохраняется | ✗ toggle | Файл НЕ сохраняется сам |
| 9A.2 | Auto-save delay | 1000ms | Сохранение через ~1с | 10000ms | Сохранение через ~10с |
| 9A.3 | Hide scrollbar | ✓ | Скроллбар исчезает | ✗ | Скроллбар виден |
| 9A.4 | Zoom | 0.5 | Всё мелкое | 2.0 | Всё крупное |
| 9A.5 | Word wrap in TOC | ✓ | Длинные заголовки переносятся | ✗ | Обрезаются |
| 9A.6 | File sort | "title" | Алфавитный порядок | "modified" | По дате |
| 9A.7 | Restore layout | ✓ | Закрыть/открыть → то же состояние | ✗ | Пустой при старте |
| 9A.8 | Startup action | "blank" | Пустой таб | "openLastFolder" | Предыдущая папка |
| 9A.9 | Language | "ru" | UI на русском | "en" | UI на английском |
| 9A.10 | **Open files in new window** | ✓ | Open File → новое окно | ✗ | Тот же окне |
| 9A.11 | **Open folder in new window** | ✓ | Open Folder → новое окно | ✗ | Тот же окне |
| 9A.12 | **Tree path exclude patterns** | `["node_modules","*.log"]` | Эти файлы скрыты в дереве | `[]` | Все видны |

### 9B. Editor

| # | Настройка | Значение 1 | Проверить | Значение 2 | Проверить |
|---|-----------|-----------|-----------|-----------|-----------|
| 9B.1 | Font size | 12px | Мелкий шрифт | 32px | Крупный шрифт |
| 9B.2 | Line height | 1.2 | Плотные строки | 2.0 | Разреженные |
| 9B.3 | Font family | "Open Sans" | Шрифт меняется | "Arial" | Другой шрифт |
| 9B.4 | Editor line width | "80ch" | Узкая колонка | "" (пусто) | Во всю ширину |
| 9B.5 | Code font size | 12px | Мелкий код | 28px | Крупный код |
| 9B.6 | Code font family | "Menlo" | Шрифт кода | "Courier" | Другой |
| 9B.7 | Code line numbers | ✓ | Номера строк в code fence | ✗ | Нет номеров |
| 9B.8 | Wrap code blocks | ✓ | Длинные строки переносятся | ✗ | Горизонтальный скролл |
| 9B.9 | Auto-pair brackets | ✓ | `(` → `()` автоматом | ✗ | Только `(` |
| 9B.10 | Auto-pair quotes | ✓ | `"` → `""` автоматом | ✗ | Только `"` |
| 9B.11 | Tab size | 2 | 2 пробела отступ | 4 | 4 пробела |
| 9B.12 | End of line | "lf" | LF при сохранении | "crlf" | CRLF при сохранении |
| 9B.13 | Text direction | "rtl" | Текст справа налево | "ltr" | Нормально |
| 9B.14 | Default encoding | "utf8" | UTF-8 по умолчанию | "latin1" | Latin-1 |
| 9B.15 | Auto-guess encoding | ✓ | Файл в CP1251 → определяется | ✗ | Читается как UTF-8 (кракозябры) |
| 9B.16 | Hide quick insert | ✓ | Нет хинта "Type @" | ✗ | Хинт виден |
| 9B.17 | Hide link popup | ✓ | Hover → нет попапа | ✗ | Hover → попап |
| 9B.18 | **Auto-pair markdown syntax** | ✓ | `**` → `****` с курсором внутри | ✗ | Только `**` |
| 9B.19 | **Trim unnecessary code block empty lines** | ✓ | Пустые строки в code fence убираются | ✗ | Остаются |
| 9B.20 | **Auto-normalize line endings** | ✓ | Смешанные LF/CRLF → нормализуются | ✗ | Оставляются как есть |
| 9B.21 | **Trim trailing newline** | 0 | Не трогать | 2 | Один \n в конце |
| 9B.22 | **Auto-check (task lists)** | ✓ | Клик по чекбоксу → ✓ сохраняется | ✗ | — |

### 9C. Markdown

| # | Настройка | Значение 1 | Проверить | Значение 2 | Проверить |
|---|-----------|-----------|-----------|-----------|-----------|
| 9C.1 | Bullet list marker | "-" | Дефис | "*" | Звёздочка |
| 9C.2 | Order list delimiter | "." | `1.` | ")" | `1)` |
| 9C.3 | List indentation | 2 | 2-пробельный отступ | 4 | 4-пробельный |
| 9C.4 | Frontmatter type | "-" (YAML) | `---` | "+" (TOML) | `+++` |
| 9C.5 | Superscript/subscript | ✓ | `^sup^` рендерится | ✗ | Как текст |
| 9C.6 | Footnotes | ✓ | `[^1]` рендерится | ✗ | Как текст |
| 9C.7 | HTML enabled | ✓ | `<b>bold</b>` рендерится | ✗ | Как текст |
| 9C.8 | GitLab compat | ✓ | GitLab расширения работают | ✗ | Стандартный markdown |
| 9C.9 | Sequence theme | "hand" | Рукописный стиль | "simple" | Чистый стиль |
| 9C.10 | **Prefer loose list item** | ✓ | Списки с пробелами между элементами | ✗ | Плотные списки |
| 9C.11 | **Heading style** | "atx" | `# Heading` | "setext" | `Heading\n===` |

### 9D. Theme

| # | Тест | Проверить |
|---|------|-----------|
| 9D.1 | Выбор темы | Клик по карточке → тема применяется мгновенно |
| 9D.2 | Custom CSS | Ввести CSS → применяется к редактору |
| 9D.3 | Очистить Custom CSS | Удалить текст → стиль по умолчанию |

### 9E. Spelling

| # | Настройка | Включить | Проверить | Выключить | Проверить |
|---|-----------|----------|-----------|-----------|-----------|
| 9E.1 | Spellchecker | ✓ | Ошибки подчёркиваются | ✗ | Нет подчёркиваний |
| 9E.2 | No underline | ✓ | Подчёркивание скрыто | ✗ | Подчёркивание видно |
| 9E.3 | **Spellchecker language** | "en-US" | Английские ошибки | "ru" | Русские ошибки |

### 9F. Image

| # | Настройка | Значение | Проверить |
|---|-----------|---------|-----------|
| 9F.1 | Image insert action | "path" | Вставка по абсолютному пути |
| 9F.2 | Image insert action | "folder" | Копирование в папку |
| 9F.3 | Image folder path | Задать путь | Картинки сохраняются туда |
| 9F.4 | Relative directory | ✓ + "images" | Путь относительный |
| 9F.5 | **Image insert action** | "upload" | Настройки image bed (github token и т.д.) |

### 9G. Keybindings

| # | Тест | Проверить |
|---|------|-----------|
| 9G.1 | Таблица шорткатов | Все команды показываются с текущими привязками |
| 9G.2 | Изменить шорткат | Клик → ввод нового → сохранить → работает |
| 9G.3 | Сброс шортката | Reset → дефолтное значение |
| 9G.4 | Unbind | Удалить привязку → команда не вызывается по клавише |

---

## ГРУППА 10: Меню (нативное)

### 10A. Mark menu (macOS only)

| # | Пункт | Проверить |
|---|-------|-----------|
| 10A.1 | Mark → About Mark | Диалог с версией приложения |
| 10A.2 | Mark → Preferences (Cmd+,) | Окно настроек открывается |
| 10A.3 | Mark → Quit (Cmd+Q) | Приложение закрывается (с диалогом если unsaved) |

### 10B. File menu

| # | Пункт | Проверить |
|---|-------|-----------|
| 10B.1 | File → New Tab (Cmd+N) | Новый таб создаётся |
| 10B.2 | File → Open File (Cmd+O) | Диалог открытия файла |
| 10B.3 | File → Open Folder (Cmd+Shift+O) | Диалог открытия папки |
| 10B.4 | File → Open Recent | Динамическое подменю → список недавних файлов | `mt_recent_list` |
| 10B.5 | File → Save (Cmd+S) | Файл сохраняется |
| 10B.6 | File → Save As (Cmd+Shift+S) | Диалог "сохранить как" |
| 10B.7 | File → Close Tab (Cmd+W) | Таб закрывается |
| 10B.8 | File → Export PDF | PDF создаётся |
| 10B.9 | File → Export HTML | HTML создаётся |

### 10C. Edit menu

| # | Пункт | Проверить |
|---|-------|-----------|
| 10C.1 | Edit → Undo (Cmd+Z) | Отмена последнего действия в webview |
| 10C.2 | Edit → Redo (Cmd+Shift+Z) | Повтор отменённого |
| 10C.3 | Edit → Cut (Cmd+X) | Вырезать выделенное |
| 10C.4 | Edit → Copy (Cmd+C) | Копировать выделенное |
| 10C.5 | Edit → Paste (Cmd+V) | Вставить из буфера |
| 10C.6 | Edit → Select All (Cmd+A) | Выделить всё |
| 10C.7 | Edit → Find (Cmd+F) | Панель поиска |
| 10C.8 | Edit → Replace (Cmd+H) | Панель замены |
| 10C.9 | Edit → Find in Folder (Cmd+Shift+F) | Поиск по проекту |

### 10D. View menu

| # | Пункт | Проверить |
|---|-------|-----------|
| 10D.1 | View → Toggle Sidebar (Cmd+B) | Сайдбар |
| 10D.2 | View → Source Code Mode (Cmd+Alt+S) | Режим исходного кода |
| 10D.3 | View → Theme → (submenu) | Подменю: light, dark, graphite, material-dark, one-dark, ulysses → тема применяется |

### 10E. Help menu

| # | Пункт | Проверить |
|---|-------|-----------|
| 10E.1 | Help → Documentation | Открывается внешняя ссылка на GitHub docs |
| 10E.2 | Help → Check for Updates | Проверка обновлений | `mt_updater_check` |

---

## ГРУППА 11: Специальные сценарии

| # | Сценарий | Проверить фронт | Проверить бэк |
|---|----------|-----------------|---------------|
| 11.1 | Большой файл (10K+ строк) | Скролл плавный, нет зависания | Память < 500MB |
| 11.2 | Файл с нестандартной кодировкой | CP1251/Shift-JIS → текст читается | `mt_fs_read` с auto-guess |
| 11.3 | Файл без расширения | Открывается как plain text | — |
| 11.4 | Одновременно 20+ табов | Все рендерятся, переключение < 100ms | — |
| 11.5 | Внешнее изменение файла | Файл обновляется в редакторе | `mt::watch::event` |
| 11.6 | Удаление открытого файла | Уведомление, таб помечается | `mt::watch::event` |
| 11.7 | Cmd+Q с несохранёнными | Диалог "Save before quit?" | `mt::ask-for-close` |
| 11.8 | Два окна (если поддерживается) | File → New Window | — |
| 11.9 | Dev server падает (debug only) | Белый экран, но не краш | — |
| 11.10 | Пустая папка | Sidebar показывает пустое дерево | — |
| 11.11 | **Открытие .md из Finder** | Двойной клик по .md → Mark открывает файл | `mt_drain_pending_opens` |
| 11.12 | **Открытие .md из CLI** | `./mark file.md` → файл открывается в табе | `mt_drain_pending_opens` |
| 11.13 | **Mark уже запущен + открыть .md** | Второй экземпляр передаёт файл первому, не создаёт новое окно | — |
| 11.14 | **Batch save & close** | Несколько несохранённых табов → Cmd+Q → диалог для каждого/всех | `mt_save_and_close_tabs` |
| 11.15 | **Zoom via Cmd+Scroll** | Cmd+прокрутка → zoom от 62.5% до 200% (12 уровней) | — |
| 11.16 | **Always on Top** | window.toggle-always-on-top → окно поверх всех | — |

---

## ГРУППА 12: IPC бэкенд-валидация

Тесты подтверждают что бэкенд отвечает корректно.

### 12A. Preferences & Config

| # | Команда | Тест |
|---|---------|------|
| 12A.1 | `mt_prefs_get_all` | Возвращает все настройки с дефолтами |
| 12A.2 | `mt_prefs_set` + `mt_prefs_get` | Set → Get → значение совпадает |
| 12A.3 | `mt_workspace_set` | Устанавливает workspace root |

### 12B. Fonts & Menu

| # | Команда | Тест |
|---|---------|------|
| 12B.1 | `mt_fonts_list` | Список > 10 шрифтов |
| 12B.2 | `mt_menu_taxonomy` | JSON со всеми пунктами меню |

### 12C. File System

| # | Команда | Тест |
|---|---------|------|
| 12C.1 | `mt_fs_read` / `mt_fs_write` | Запись → чтение → контент совпадает |
| 12C.2 | `mt_fs_stat` | Размер, время модификации корректны |
| 12C.3 | `mt_fs_readdir` | Список файлов в директории |
| 12C.4 | `mt_fs_unlink` | Файл удаляется |
| 12C.5 | `mt_walk_project` | Рекурсивный обход → все файлы найдены |

### 12D. Search

| # | Команда | Тест |
|---|---------|------|
| 12D.1 | `mt_search_spawn` | Поиск находит известный текст |
| 12D.2 | `mt_search_cancel` | Поиск прерывается без ошибки |

### 12E. File Watch

| # | Команда | Тест |
|---|---------|------|
| 12E.1 | `mt_watch_subscribe` | Подписка на файл → event при изменении |
| 12E.2 | `mt_watch_unsubscribe` | Отписка → event больше не приходит |

### 12F. Recent Files

| # | Команда | Тест |
|---|---------|------|
| 12F.1 | `mt_recent_add` + `mt_recent_list` | Добавить → список содержит |
| 12F.2 | `mt_recent_clear` | Очистить → список пуст |

### 12G. Shortcuts

| # | Команда | Тест |
|---|---------|------|
| 12G.1 | `mt_shortcut_list` | Список шорткатов непустой |
| 12G.2 | `mt_shortcut_register` / `_unregister` | Регистрация → shortcut работает → отмена |

### 12H. Spellcheck

| # | Команда | Тест |
|---|---------|------|
| 12H.1 | `mt_spell_get_config` | Возвращает enabled, language, noUnderline |
| 12H.2 | `mt_spell_set_enabled` | Включить/выключить → config обновился |
| 12H.3 | `mt_spell_set_lang` | Сменить язык → config обновился |

### 12I. Export & Tools

| # | Команда | Тест |
|---|---------|------|
| 12I.1 | `mt_updater_check` | Не крашится, возвращает результат |
| 12I.2 | `mt_pandoc_status` | Возвращает наличие Pandoc |
| 12I.3 | `mt_screenshot_capture` | macOS: захват экрана возвращает путь |
| 12I.4 | `mt_diff_baseline` | Возвращает git HEAD версию файла |

### 12J. Keychain (Secrets)

| # | Команда | Тест |
|---|---------|------|
| 12J.1 | `mt_secret_set` + `mt_secret_get` | Set → Get → совпадает |
| 12J.2 | `mt_secret_delete` | Delete → Get → ошибка |

### 12K. Default Handler (macOS)

| # | Команда | Тест |
|---|---------|------|
| 12K.1 | `mt_get_default_md_handler` | Возвращает {isDefault: bool} |
| 12K.2 | `mt_set_default_md_handler` | Установить → get → isDefault: true |
| 12K.3 | `mt_unset_default_md_handler` | Снять → get → isDefault: false |

---

## ГРУППА 13: Форматирование (paragraph + format команды)

### 13A. Paragraph commands (структурные блоки)

| # | Команда | Ввод/действие | Результат |
|---|---------|---------------|-----------|
| 13A.1 | paragraph.heading-1 | Cmd на абзаце | Абзац → `# Heading 1` |
| 13A.2 | paragraph.heading-2 | Cmd на абзаце | Абзац → `## Heading 2` |
| 13A.3 | paragraph.heading-3 | Cmd на абзаце | Абзац → `### Heading 3` |
| 13A.4 | paragraph.heading-4 | — | `#### Heading 4` |
| 13A.5 | paragraph.heading-5 | — | `##### Heading 5` |
| 13A.6 | paragraph.heading-6 | — | `###### Heading 6` |
| 13A.7 | paragraph.upgrade-heading | На H3 → Upgrade | H3 → H2 |
| 13A.8 | paragraph.degrade-heading | На H2 → Degrade | H2 → H3 |
| 13A.9 | paragraph.table | Команда | Вставить таблицу (диалог rows/cols) |
| 13A.10 | paragraph.code-fence | Команда | Вставить ` ``` ` блок |
| 13A.11 | paragraph.quote-block | Команда | Вставить `> ` цитату |
| 13A.12 | paragraph.math-formula | Команда | Вставить `$$ $$` блок |
| 13A.13 | paragraph.html-block | Команда | Вставить HTML-блок |
| 13A.14 | paragraph.order-list | Команда | Вставить нумерованный список |
| 13A.15 | paragraph.bullet-list | Команда | Вставить маркированный список |
| 13A.16 | paragraph.task-list | Команда | Вставить `- [ ] ` чеклист |
| 13A.17 | paragraph.horizontal-line | Команда | Вставить `---` |
| 13A.18 | paragraph.front-matter | Команда | Вставить YAML front matter |
| 13A.19 | paragraph.reset-paragraph | На heading → Reset | Сброс к обычному параграфу |

### 13B. Format commands (inline форматирование)

| # | Команда | Действие | Результат |
|---|---------|----------|-----------|
| 13B.1 | format.strong | Выделить текст → Cmd+B | `**text**` |
| 13B.2 | format.emphasis | Выделить текст → Cmd+I | `*text*` |
| 13B.3 | format.underline | Выделить текст → Cmd+U | `<u>text</u>` |
| 13B.4 | format.highlight | Выделить текст → команда | `==text==` |
| 13B.5 | format.superscript | Выделить → команда | `^text^` |
| 13B.6 | format.subscript | Выделить → команда | `~text~` |
| 13B.7 | format.inline-code | Выделить → Cmd+E | `` `text` `` |
| 13B.8 | format.inline-math | Выделить → команда | `$text$` |
| 13B.9 | format.strike | Выделить → команда | `~~text~~` |
| 13B.10 | format.hyperlink | Выделить → Cmd+K | `[text](url)` диалог |
| 13B.11 | format.image | Команда | `![alt](url)` диалог |
| 13B.12 | format.clear-format | Выделить → команда | Весь inline-формат снимается |

### 13C. Edit commands (структурные)

| # | Команда | Действие | Результат |
|---|---------|----------|-----------|
| 13C.1 | edit.duplicate | Cmd+Shift+D | Текущая строка дублируется |
| 13C.2 | edit.create-paragraph | Enter | Новый абзац после курсора |
| 13C.3 | edit.delete-paragraph | Cmd+Shift+Backspace | Текущий абзац удаляется |

---

## ГРУППА 14: macOS Integration

| # | Тест | Фронт | Бэк |
|---|------|-------|----|
| 14.1 | Settings → Set as default | Кнопка "Set Mark as default for .md" → подтверждение | `mt_set_default_md_handler` |
| 14.2 | Verify default | После set → файлы .md ассоциированы с Mark | `mt_get_default_md_handler` → isDefault: true |
| 14.3 | Remove default | Кнопка "Remove as default" → подтверждение | `mt_unset_default_md_handler` |
| 14.4 | Open via Finder | Двойной клик .md в Finder → Mark открывает файл | `mt_drain_pending_opens` |
| 14.5 | Open via CLI | `./target/debug/mark /path/to/file.md` → файл открывается | `mt_drain_pending_opens` |
| 14.6 | Already running | Mark запущен + открыть .md из Finder → файл в существующем окне | Single-instance lock |
| 14.7 | **Preview mode on Finder open** | previewModeOnFinderOpen=true → файл открывается в preview mode | `mt_prefs_get` |
| 14.8 | **Screenshot** | edit.screenshot → screencapture → изображение вставлено | `mt_screenshot_capture` |

---

## ГРУППА 15: Окно настроек (Settings Window)

| # | Тест | Фронт | Бэк |
|---|------|-------|----|
| 15.1 | Открыть настройки | Cmd+, или Mark → Preferences → отдельное окно | `mt_open_setting_window` |
| 15.2 | Навигация по панелям | Клик: General, Editor, Markdown, Theme, Spelling, Image, Keybindings | — |
| 15.3 | Drag за titlebar | Перетаскивание окна настроек работает | webkit-app-region: drag |
| 15.4 | Закрыть (X) | Кнопка X → окно закрывается | — |
| 15.5 | Закрыть (Cmd+W) | Шорткат → окно закрывается | — |
| 15.6 | Изменения в реальном времени | Изменить тему в Settings → основное окно обновляется мгновенно | broadcast event |
| 15.7 | Font picker | General → Font → список системных шрифтов | `mt_fonts_list` |
| 15.8 | Theme cards | Theme → карточки с превью → клик → применяется | — |
| 15.9 | Custom CSS textarea | Ввести CSS → применяется → удалить → откат | — |
| 15.10 | Keybindings table | Таблица всех команд с текущими привязками, фильтрация | — |

---

## Порядок прогона

**Quick smoke (5 мин):** 1.1–1.3, 2.1–2.3, 3.1–3.3, 4.1–4.2, 7.1, 8.1–8.2
**Standard (40 мин):** Группы 1–6 полностью + 7.1–7.5 + 8.1–8.5 + 15.1–15.6
**Full regression (3 ч):** Все группы 1–15
**Theme marathon (20 мин):** 7.6 — все 33 темы
**Formatting pass (30 мин):** Группа 13 полностью
**macOS integration (15 мин):** Группа 14 полностью

---

## Автоматизация

Что уже автоматизировано (Playwright + Tauri):
- Группа 2 (рендеринг markdown элементов) — частично покрыта e2e
- Группа 3 (табы) — `new-tab.spec.ts`
- Группа 5 (поиск) — `search.spec.ts`
- Группа 6 (режимы) — `view-modes.spec.ts`
- Группа 12 (IPC) — можно автоматизировать через vitest с invoke mocks

Что требует ручной проверки:
- Группа 1 (тайтлбар, drag, traffic lights, tile) — нативные элементы вне Playwright
- Группа 7.6 (все 33 темы) — визуальный diff, можно screenshot-compare
- Группа 9 (настройки) — toggle/input, нужен UI automation
- Группа 11 (edge cases) — специальные условия
- Группа 13 (форматирование) — можно частично автоматизировать через e2e
- Группа 14 (macOS integration) — нативные API, ручная проверка
- Группа 15 (окно настроек) — отдельное webview окно

## Статистика

| Группа | Тестов | Описание |
|--------|--------|----------|
| 1. Окно и тайтлбар | 18 | Размер, drag, resize, fullscreen, tile, traffic lights |
| 2. Редактор | 20 | Ввод, скролл, markdown элементы, undo |
| 3. Табы | 13 | Создание, закрытие, drag, контекст меню, cycle |
| 4. Сайдбар | 17 | Дерево, TOC, resize, контекст меню, watch |
| 5. Поиск | 13 | Find, replace, regex, find-in-folder |
| 6. Режимы | 9 | Source, focus, typewriter, diff, RTL |
| 7. Темы | 8 + 33 | Toggle, custom CSS + все 33 темы отдельно |
| 8. Файловые операции | 16 | Save, open, export, drag-drop, recent, import |
| 9. Настройки | 56 | 7 панелей × ~8 настроек каждая |
| 10. Меню | 24 | 5 меню × ~5 пунктов |
| 11. Спец. сценарии | 16 | Edge cases, lifecycle, zoom |
| 12. IPC бэкенд | 30 | 11 подгрупп, все IPC команды |
| 13. Форматирование | 34 | Paragraph + format + edit команды |
| 14. macOS Integration | 8 | Default handler, Apple Events, screenshot |
| 15. Окно настроек | 10 | Навигация, drag, realtime apply |
| **ИТОГО** | **~295** | |
