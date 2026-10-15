# Guia do Mark

Um passeio curto que você pode editar — esta página é um documento normal do Mark. Nada aqui é gravado nos seus arquivos, a menos que você escolha Salvar como.

## Conecte seu agente

Dê isto ao Claude Code, Codex, Cursor ou qualquer agente, uma única vez. Cole no arquivo de instruções dele (por exemplo `CLAUDE.md` ou `AGENTS.md`) ou direto no chat. O botão de copiar está no bloco.

```text
@@AGENT_PROMPT@@
```

1. **Ele escreve um arquivo** — planos e relatórios longos viram um arquivo `.md` e abrem no Mark.
2. **O Mark acompanha** — cada salvamento recarrega a página e mantém o seu lugar.
3. **Você dá o formato** — edite a página pronta: corrija passos, acrescente notas, corte o que estiver errado.
4. **Ele lê você de volta** — o agente relê o arquivo; as suas edições são a próxima instrução dele.

Quer isso automático? Configuração avançada do agente — em breve.

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

⌘/Ctrl-clique num diagrama ou tabela abre em tela cheia ⤢ — dê zoom dentro, Esc fecha.
