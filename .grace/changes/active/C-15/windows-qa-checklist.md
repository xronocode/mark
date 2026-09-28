# Windows QA checklist — C-15 Phase W (ручной смоук перед WINDOWS_RELEASE)

Артефакт: workflow run → **mark-windows-x64-release** (zip: `Mark_<ver>_x64-setup.exe` + `.sha256`).
Запуск сухого билда: Actions → release → Run workflow → tag `v2.1.15-beta`, publish = НЕ ставить.

Установка: запустить `.exe`. NSIS ставит per-user (без админа) в `%LOCALAPPDATA%\Mark`.
Ожидаемо: SmartScreen «Windows защитила ваш компьютер» → **Подробнее → Выполнить в любом случае** (сборка не подписана — решение зафиксировано в C-15 Amendment #2).

## Чеклист

1. **Установка и первый запуск** — приложение стартует, пустой Untitled-таб, редактор печатает.
2. **Титлбар** — кастомный (без нативного дубликата): drag за свободные зоны, двойной клик по титлбару = maximize/restore, кластер ─ □ ✕ справа работает, hamburger-меню слева открывает полное меню.
3. **Навигация** — кластер слева (sidebar/Files/TOC/Settings) без сдвига под traffic lights; тайтл-крошки с `\`-разделителем.
4. **Открытие файлов** — двойной клик по `.md` в Проводнике; «Открыть с помощью → Mark» при уже запущенном приложении — файл открывается В ТОМ ЖЕ окне (single-instance), окно фокусируется, второго процесса в Диспетчере нет.
5. **Шорткаты** — Ctrl+S (сохранение), Ctrl+G (поиск), Ctrl+T (Go-to-Heading), Ctrl+Shift+M (глобальный show-window), метки в меню/palette показывают **Ctrl**, не Cmd.
6. **Настройки** — окно преференсов с нативным chrome, без меню-бара; секции «macOS Integration» и titleBarStyle-селект скрыты.
7. **Поиск по папке** — Open Folder → Ctrl+Shift+F: работает без установленного ripgrep (in-process fallback, в логе `BLOCK_RIPGREP_FALLBACK`).
8. **Экспорт** — при установленном pandoc: Export PDF/DOCX работает (pandoc находится в `%PROGRAMFILES%\Pandoc` / `%LOCALAPPDATA%\Pandoc`); без pandoc — честный статус недоступно.
9. **Обновлялка** — Settings → Check for updates: текущая версия = нет обновлений (feed ещё mac-only — это норма до публикации).
10. **Темы/типографика** — светлая/тёмная, шрифты рендерятся (bundled Open Sans / DejaVu Sans Mono).
11. **Скринкаст/печать/дефолтный обработчик** — отсутствуют в UI (macOS-only, скрыты через buildCapabilities).

## Известные отложенные (не баги)

spellcheck (hunspell-embedding F-SPELL-HUNSPELL-EMBED), print/screenshot/share, «сделать редактором по умолчанию» (registry — будущая задача), подпись кода (SmartScreen click-through задокументирован).

## После успешного QA

`gh variable set WINDOWS_RELEASE --body true -R xronocode/mark` → следующий тег публикует Windows-ассеты + `windows-x86_64` в latest.json (план: v2.2.0-beta, бамп 6 мест + preflight-fixture).
