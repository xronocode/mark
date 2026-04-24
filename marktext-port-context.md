# Mark Text — Контекст для портирования

Дата: 2026-04-24  
Цель: облегчить Mark Text, сохранив функционал и включив накопленные PR-ы от комьюнити.

---

## Что такое Mark Text

Open source WYSIWYG Markdown редактор. 55 тыс. звёзд на GitHub, MIT лицензия.  
Репо: https://github.com/marktext/marktext  
Последний официальный релиз: **0.17.1** (2022 год). Проект фактически брошен авторами, но комьюнити активно шлёт PR-ы.

Ветка разработки: `develop`

---

## Текущий стек (проблемы)

| Слой | Технология | Проблема |
|---|---|---|
| Shell | **Electron 18** | ~150-200 MB, тащит весь Chromium |
| UI | **Vue 2** + Vuex + Vue Router | Vue 2 deprecated |
| Сборка | **electron-builder** + webpack | Медленная, устаревшая |
| Редактор | **muya** (собственный движок) | Monorepo внутри репо, src/muya/ |
| Рендеринг диаграмм | Mermaid, Vega, flowchart.js, KaTeX | Актуальные |
| Нативные функции | keytar, native-keymap, fontmanager-redux | Нативные Node.js модули |

**Почему не работает на macOS Apple Silicon:**  
Apple требует code signing для arm64 бинарей. Официальная подпись = $99/год Apple Developer аккаунт. Авторы отказались платить. Workaround: `sudo xattr -r -d com.apple.quarantine /Applications/MarkText.app`

---

## Варианты портирования

### Вариант 1: Electron → Tauri (рекомендуется)
- **Tauri** использует системный WebView (WKWebView на macOS) вместо встроенного Chromium
- Размер: ~10-20 MB вместо 150-200 MB
- Backend: Rust вместо Node.js
- Frontend: Vue 3 / React — без изменений, тот же веб-стек
- Нативные модули (keytar, native-keymap) нужно заменить на Tauri плагины или Rust аналоги
- Подписание: Tauri поддерживает code signing из коробки через CI (бесплатно с ad-hoc подписью для macOS)

### Вариант 2: Electron → electron-vite (минимальные изменения)
- PR #4001 уже сделал это: Vue 2→3, electron-vite, размер -100MB
- Проще реализовать, но Electron остаётся
- Не решает проблему с Gatekeeper принципиально

### Вариант 3: Нативный Swift/AppKit (только macOS)
- Максимальная нативность, минимальный размер
- Потребует полного переписывания UI
- Нереалистично в разумные сроки

**Рекомендация: Tauri + Vue 3**

---

## Архитектура Mark Text (src/)

```
src/
├── main/           # Electron main process (Node.js)
│   ├── app/        # Управление окнами, lifecycle
│   ├── filesystem/ # Чтение/запись файлов, watchers (chokidar)
│   ├── spell/      # Проверка орфографии
│   ├── keyboard/   # Нативные хоткеи
│   └── preferences/# Настройки (electron-store)
│
├── renderer/       # Electron renderer process (Vue 2)
│   ├── components/ # Vue компоненты UI
│   ├── store/      # Vuex state management
│   └── router/     # Vue Router
│
├── muya/           # Собственный WYSIWYG движок (ключевой компонент!)
│   ├── lib/
│   │   ├── block/  # Блочные элементы (параграф, заголовок, список...)
│   │   ├── inline/ # Инлайн элементы (bold, italic, link, code...)
│   │   └── parser/ # Markdown парсер
│   └── index.js    # Точка входа
│
└── common/         # Общие утилиты (main + renderer)
```

**Muya — самый важный компонент.** Это сердце редактора: собственный WYSIWYG движок на чистом JS, не зависящий от Electron. При портировании на Tauri muya переносится практически без изменений — он работает в WebView.

---

## Ключевые функции для сохранения

1. **WYSIWYG редактирование** — muya движок
2. **Source Code mode** — переключение между WYSIWYG и сырым markdown
3. **Темы оформления** — dark/light/sépia + кастомные
4. **Диаграммы** — Mermaid, Vega-lite, flowchart, KaTex math
5. **Таблицы** — визуальное редактирование
6. **Поиск** — в файле и по папке (ripgrep)
7. **Drag & drop изображений**
8. **Мультивкладочность**
9. **Сайдбар с деревом файлов**
10. **Экспорт** — HTML, PDF
11. **Пользовательские темы CSS**
12. **Проверка орфографии**

---

## Открытые PR-ы (приоритет включения)

### Критические баги

| PR | Описание | Автор | +/- строк |
|---|---|---|---|
| #4177 | Security: подтверждение перед открытием файлов через shell.openPath() | sebastiondev | +16/-2 |
| #4157 | Fix: Mermaid диаграммы на macOS build | johnhsb | +5441/-6420 |
| #4154 | Fix: EPIPE crash в main process | Wordbe | +5/-0 |
| #4152 | Fix: сброс позиции скролла при внешнем изменении файла | Wordbe | +17/-12 |
| #4146 | Fix: ложный prompt "unsaved" при закрытии файла из поиска | liyongning | +34/-14 |
| #4135 | Fix: crash querySelector на пустом heading slug | Bowl42 | +130/-1 |
| #4134 | Fix: заглавные модификаторы в кастомных хоткеях | Bowl42 | +149/-3 |
| #4093 | Fix: белая вспышка при открытии окна в dark mode | gavdog7 | +31/-73 |
| #3621 | Fix: CVE-2023-2318 XSS уязвимость | Teloshav | +5/-20 |

### Новые фичи

| PR | Описание | Автор | +/- строк |
|---|---|---|---|
| #4145 | **Full WYSIWYG mode** (скрывает весь markdown синтаксис) + live system theme | MyronKoch | +435/-16 |
| #4150 | HTML paste правильно трансформирует изображения в локальные пути | kiliansinger | +71/-2 |
| #4070 | Always Read-Only Mode настройка | valentt | +43/-6 |
| #4025 | Mermaid v10→v11 с расширенной поддержкой диаграмм | lwsinclair | +5790/-1878 |

### Большой рефактор (основа для порта)

| PR | Описание | Автор | Важность |
|---|---|---|---|
| #4001 | **Re-Factor с electron-vite**: Vue 2→3, Composition API, современный toolchain, -100MB размер | Tkaixiang | ⭐⭐⭐ |

**PR #4001 — отличная отправная точка.** Он уже мигрировал на Vue 3 и современный toolchain. При портировании на Tauri можно взять его как базу и заменить Electron на Tauri.

---

## Plan портирования на Tauri

### Фаза 1: Подготовка базы (взять PR #4001)
- Смержить PR #4001 (electron-vite + Vue 3)
- Смержить все bugfix PR-ы (#4177, #4157, #4154, #4152, #4146, #4135, #4134, #4093, #3621)
- Смержить фичи (#4145 WYSIWYG mode, #4025 Mermaid v11, #4070)
- Убедиться что всё собирается и работает

### Фаза 2: Замена Electron → Tauri
- Инициализировать Tauri поверх существующего Vue 3 frontend
- Перенести `src/main/` (Node.js) → Tauri commands (Rust):
  - `filesystem/` → `tauri::command` для чтения/записи файлов
  - `preferences/` → `tauri-plugin-store`
  - `keyboard/` → `tauri-plugin-global-shortcut`
  - `spell/` → `tauri-plugin-shell` или нативный Rust crate
- Убрать зависимости от electron/node: `keytar`, `electron-store`, `chokidar` → аналоги в Tauri

### Фаза 3: macOS code signing
- Настроить Tauri bundler для ad-hoc signing (бесплатно)
- Настроить GitHub Actions CI для автоматической сборки под macOS arm64/x86

### Фаза 4: Нативность
- Проверить работу через системный WKWebView (нет Chromium)
- Тест производительности muya в WebView vs Electron

---

## Нативные зависимости и их замены

| Текущая зависимость | Что делает | Tauri замена |
|---|---|---|
| `keytar` | Хранение паролей в Keychain | `tauri-plugin-stronghold` или `tauri-plugin-store` |
| `native-keymap` | Раскладка клавиатуры | `tauri-plugin-global-shortcut` |
| `fontmanager-redux` | Список системных шрифтов | Rust `font-kit` crate |
| `chokidar` | File watchers | `tauri-plugin-fs` (watch API) |
| `electron-store` | Persistent settings | `tauri-plugin-store` |
| `vscode-ripgrep` | Поиск по файлам | `tauri-plugin-shell` → ripgrep бинарь |

---

## Важные технические детали

### muya движок
- Находится в `src/muya/`
- Чистый JS, не зависит от Electron
- Общается с renderer через события (EventEmitter-like)
- При портировании: просто перенести как есть, адаптировать только IPC

### IPC (Inter-Process Communication)
- Сейчас: Electron `ipcMain` / `ipcRenderer`
- Tauri аналог: `invoke()` в frontend → `#[tauri::command]` в Rust backend
- Это главная работа при портировании

### Сборка
- Сейчас: `electron-builder`
- Tauri: `tauri build` — создаёт `.app` для macOS, `.exe` для Windows, `.deb`/`.AppImage` для Linux

---

## Полезные ссылки

- Репо: https://github.com/marktext/marktext
- PR #4001 (electron-vite рефактор): https://github.com/marktext/marktext/pull/4001
- PR #4145 (Full WYSIWYG): https://github.com/marktext/marktext/pull/4145
- Tauri docs: https://tauri.app/start/
- Tauri migrate from Electron: https://tauri.app/start/migrate/from-electron/
- Tauri plugins list: https://tauri.app/plugin/

---

## Текущее состояние (апрель 2026)

- Репо не заархивирован, принимает PR-ы
- Мейнтейнер (@Jocs) появляется редко, не мержит PR-ы
- Комьюнити активно (15+ открытых PR-ов с фиксами и фичами)
- Brew package deprecated из-за Gatekeeper проблемы
- Последний коммит в develop: март 2026
