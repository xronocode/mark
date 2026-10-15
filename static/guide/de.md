# Mark-Handbuch

Eine kurze Tour, die du bearbeiten kannst — diese Seite ist ein ganz normales Mark-Dokument. Nichts davon wird in deine Dateien geschrieben, außer du wählst Sichern unter.

## Verbinde deinen Agenten

Gib dies einmal an Claude Code, Codex, Cursor oder einen anderen Agenten. Füge es in die Instruktionsdatei ein (z. B. `CLAUDE.md` oder `AGENTS.md`) oder direkt in den Chat. Der Kopieren-Knopf sitzt am Block.

````text
@@AGENT_PROMPT@@
````

1. **Er schreibt eine Datei** — lange Pläne und Berichte landen in einer `.md`-Datei und öffnen sich in Mark.
2. **Mark hält Schritt** — jeder Speichervorgang lädt die Seite neu und merkt sich deine Stelle.
3. **Du formst das Ergebnis** — bearbeite die fertige Seite: Schritte korrigieren, Notizen ergänzen, Falsches streichen.
4. **Er liest dich zurück** — der Agent liest die Datei neu; deine Änderungen sind seine nächste Anweisung.

## Was Mark rendert

Alles, was dein Agent in ein Dokument legen kann, wird live gerendert. Zuerst Diagramme:

```mermaid
flowchart LR
  A[Idee] --> B[Entwurf]
  B --> C{Review}
  C --> B
```

```mermaid
sequenceDiagram
  Alice->>Bob: Entwurf fertig?
  Bob-->>Alice: Eine Anmerkung
```

```mermaid
pie title Arten von Inhalten
  "Diagramme" : 3
  "Text" : 1
```

```mermaid
gantt
  dateFormat YYYY-MM-DD
  section Schreiben
  Entwurf :a1, 2026-01-01, 3d
  Feinschliff :after a1, 2d
```

```mermaid
mindmap
  root((Mark))
    Diagramme
    Tabellen
    Formeln
```

Diagramme aus Daten und die schnellen Blöcke:

```vega-lite
{"data":{"values":[{"kind":"A","count":3},{"kind":"B","count":5}]},"mark":"bar","encoding":{"x":{"field":"kind","type":"nominal"},"y":{"field":"count","type":"quantitative"}}}
```

```flowchart
st=>start: Start
op=>operation: Schreiben
e=>end: Fertig
st->op->e
```

```sequence
Title: Schnelle Abfrage
A->B: Ping?
B-->A: Pong
```

Callouts — eines mit Titel und eines einklappbar:

> [!NOTE] Wohin der Titel kommt
> Ein Titel nach dem Tag; der Rest des Zitats ist der Inhalt.

> [!TIP]- Einklappbar
> Klicke den Titel, um diese Notiz ein- und auszuklappen.

Eine Checkliste, Mathe in beiden Formen, eine Fußnote und ein Emoji:

- [x] Entwurf schreiben
- [ ] Ihn prüfen

Inline-Mathe $a^2 + b^2 = c^2$ und ein Block:

$$
\int_0^1 x^2\,dx = \tfrac13
$$

Eine Fußnote[^1] und ein Emoji :tada:.

[^1]: Fußnoten sammeln Quellen und Randnotizen.

Und eine Tabelle mit Ausrichtung:

| Links | Mitte | Rechts |
| :--- | :----: | ----: |
| Idee | Notizen | fertig |
| Plan | Schritte | ausliefern |

## Probier es: Tabellen

Tabellen sind Klartext und werden beim Tippen formatiert. Zeilen fügst du über die Werkzeugleiste hinzu oder entfernst sie, wenn der Cursor darin steht.

| Funktion | Kurzbefehl |
| --- | --- |
| Geteilte Ansicht | ⌘/Ctrl+Alt+\ |
| Diff | ⌘/Ctrl+D |

## Probier es: Callouts

Ein Callout hebt eine Notiz hervor. Tippe `> [!TIP]` in die erste Zeile eines Zitats.

> [!TIP]
> Fünf Varianten: NOTE, TIP, IMPORTANT, WARNING, CAUTION.

## Probier es: ein Mermaid-Diagramm

Diagramme werden beim Bearbeiten direkt gerendert.

```mermaid
graph LR
  A[Agent schreibt] --> B[Mark lädt neu]
  B --> C[Du bearbeitest]
  C --> A
```

## Probier es: Formeln

Ein `$$`-Block rendert mit KaTeX.

$$
e^{i\pi} + 1 = 0
$$

## Probier es: Geteilte Ansicht

⌘/Ctrl+Alt+\ zeigt Quelle und Vorschau nebeneinander. Nochmal drücken schließt sie.

## Probier es: Strukturiert kopieren

Bearbeiten › Als strukturierten Text kopieren kopiert das Dokument als sauberen Text mit Listen, Links und Tabellen — bereit zum Einfügen in jeden Chat.

## Probier es: Diff

⌘/Ctrl+D schaltet die Diff-Ansicht um und zeigt, was sich seit dem letzten Speichern geändert hat.

## Probier es: Zoom

⌘/Ctrl+= größer, ⌘/Ctrl+- kleiner, ⌘/Ctrl+0 zurück auf 100 %.

## Probier es: Vollbild-Ansicht

⌘/Ctrl-Klick auf ein Diagramm oder ⤢ an einem Diagramm oder einer Tabelle öffnet es im Vollbild — darin zoomen, Esc schließt.
