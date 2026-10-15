# Guia do Mark

Um passeio curto que você pode editar — esta página é um documento normal do Mark. Nada aqui é gravado nos seus arquivos, a menos que você escolha Salvar como.

## Conecte seu agente

Dê isto ao Claude Code, Codex, Cursor ou qualquer agente, uma única vez. Cole no arquivo de instruções dele (por exemplo `CLAUDE.md` ou `AGENTS.md`) ou direto no chat. O botão de copiar está no bloco.

````text
@@AGENT_PROMPT@@
````

1. **Ele escreve um arquivo** — planos e relatórios longos viram um arquivo `.md` e abrem no Mark.
2. **O Mark acompanha** — cada salvamento recarrega a página e mantém o seu lugar.
3. **Você dá o formato** — edite a página pronta: corrija passos, acrescente notas, corte o que estiver errado.
4. **Ele lê você de volta** — o agente relê o arquivo; as suas edições são a próxima instrução dele.

## O que o Mark renderiza

Tudo o que o seu agente pode pôr num documento, renderizado ao vivo. Primeiro os diagramas:

```mermaid
flowchart LR
  A[Ideia] --> B[Rascunho]
  B --> C{Revisão}
  C --> B
```

```mermaid
sequenceDiagram
  Alice->>Bob: Rascunho pronto?
  Bob-->>Alice: Uma observação
```

```mermaid
pie title Tipos de conteúdo
  "Diagramas" : 3
  "Texto" : 1
```

```mermaid
gantt
  dateFormat YYYY-MM-DD
  section Escrever
  Rascunho :a1, 2026-01-01, 3d
  Polimento :after a1, 2d
```

```mermaid
mindmap
  root((Mark))
    Diagramas
    Tabelas
    Fórmulas
```

Gráficos a partir de dados e os blocos rápidos:

```vega-lite
{"data":{"values":[{"kind":"A","count":3},{"kind":"B","count":5}]},"mark":"bar","encoding":{"x":{"field":"kind","type":"nominal"},"y":{"field":"count","type":"quantitative"}}}
```

```flowchart
st=>start: Início
op=>operation: Escrever
e=>end: Pronto
st->op->e
```

```sequence
Title: Verificação rápida
A->B: Ping?
B-->A: Pong
```

Avisos — um com título e outro dobrável:

> [!NOTE] Onde entra o título
> Um título após a tag; o restante da citação é o corpo.

> [!TIP]- Dobrável
> Clique no título para dobrar e expandir esta nota.

Uma checklist, matemática nas duas formas, uma nota de rodapé e um emoji:

- [x] Escrever o rascunho
- [ ] Revisá-lo

Matemática inline $a^2 + b^2 = c^2$ e um bloco:

$$
\int_0^1 x^2\,dx = \tfrac13
$$

Uma nota de rodapé[^1] e um emoji :tada:.

[^1]: Notas de rodapé guardam fontes e apartes.

E uma tabela com alinhamento:

| Esquerda | Centro | Direita |
| :--- | :----: | ----: |
| ideia | notas | pronto |
| plano | passos | entrega |

## Experimente: tabelas

Tabelas são texto puro, estilizadas enquanto você digita. Adicione ou remova linhas pela barra quando o cursor estiver dentro.

| Recurso | Atalho |
| --- | --- |
| Visualização dividida | ⌘/Ctrl+Alt+\ |
| Diff | ⌘/Ctrl+D |

## Experimente: avisos

Um aviso destaca uma nota. Digite `> [!TIP]` na primeira linha de uma citação.

> [!TIP]
> Cinco sabores: NOTE, TIP, IMPORTANT, WARNING, CAUTION.

## Experimente: um diagrama Mermaid

Os diagramas são renderizados enquanto você os edita.

```mermaid
graph LR
  A[O agente escreve] --> B[O Mark recarrega]
  B --> C[Você edita]
  C --> A
```

## Experimente: matemática

Um bloco `$$` é renderizado com KaTeX.

$$
e^{i\pi} + 1 = 0
$$

## Experimente: visualização dividida

⌘/Ctrl+Alt+\ mostra fonte e pré-visualização lado a lado. Pressione de novo para fechar.

## Experimente: copiar como texto estruturado

Editar › Copiar como texto estruturado copia o documento como texto limpo que mantém listas, links e tabelas — pronto para colar em qualquer chat.

## Experimente: diff

⌘/Ctrl+D alterna a visualização de diferenças e mostra o que mudou desde o último salvamento.

## Experimente: zoom

⌘/Ctrl+= maior, ⌘/Ctrl+- menor, ⌘/Ctrl+0 de volta a 100%.

## Experimente: o visualizador em tela cheia

⌘/Ctrl-clique num diagrama, ou ⤢ num diagrama ou tabela, abre em tela cheia — dê zoom dentro, Esc fecha.
