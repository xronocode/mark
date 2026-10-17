// One example per Pele diagram type — a single story: Mark, agents and the docs they write.
export const EXAMPLES = [
{ id: 'flowchart', name: 'Flowchart', group: 'Process', code: `flowchart LR
  A[Agent drafts plan.md] --> B{Human review}
  B -->|changes| A
  B -->|approved| C[Build]
  C --> D[QA] --> E((Ship))` },
{ id: 'sequence', name: 'Sequence', group: 'Process', code: `sequenceDiagram
  participant You
  participant Agent
  participant Mark
  You->>Agent: Draft the launch plan
  Agent->>Mark: Write plan.md
  Mark-->>You: Rendered page, live
  You->>Agent: Add the risks
  Agent->>Mark: Update plan.md
  Note over Mark: ⌘D shows what changed` },
{ id: 'state', name: 'State', group: 'Process', code: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review: agent saves
  Review --> Draft: changes
  Review --> Approved
  Approved --> Shipped
  Shipped --> [*]` },
{ id: 'swimlane', name: 'Swimlane', group: 'Process', code: `swimlane-beta LR
  subgraph You
    ask[Ask for a spec]
    read[Read in Mark]
  end
  subgraph Agent
    draft[Draft spec.md]
    revise[Revise]
  end
  subgraph CI
    lint[Lint docs]
    publish[Publish]
  end
  ask --> draft --> read
  read -->|comments| revise --> lint --> publish` },
{ id: 'agentflow', name: 'Agentflow', group: 'Process', code: `agentflow-beta TB
  flow intake["Intake"]
    issue["Issue arrives"]@{ shape: input }
  end
  flow work["Agent run"]
    plan["Plan"]@{ shape: task }
    write["Write docs"]@{ shape: task }
    plan --> write
  end
  flow out["Review"]
    open["Open in Mark"]@{ shape: action }
  end
  issue --> plan
  write --> open` },
{ id: 'usecase', name: 'Use case', group: 'Process', code: `usecase-beta
direction LR
actor Writer
actor Agent
Read("Read a rendered doc")
Diff("See what changed")
Write("Write Markdown")
Writer --> Read
Writer --> Diff
Agent --> Write` },
{ id: 'eventmodeling', name: 'Event modeling', group: 'Process', code: `eventmodeling

timeframe 01 ui Editor
timeframe 02 command SaveFile [[Save01]]
timeframe 03 event FileSaved [[FileSaved]]
timeframe 04 command Reload [[Reload01]]
timeframe 05 event PageRendered [[PageRendered]]

data Save01 {
  path: 'plan.md'
  by: 'agent'
}

data Reload01 {
  path: 'plan.md'
  keepScroll: true
}

data FileSaved {
  path: string
  bytes: number
}

data PageRendered {
  blocks: number
}` },
{ id: 'class', name: 'Class', group: 'Structure', code: `classDiagram
  class Document {
    +path: string
    +markdown: string
    +render()
  }
  class Block {
    +type: string
    +source: string
  }
  class Diagram {
    +engine: Pele
    +toSvg()
  }
  Document "1" *-- "many" Block
  Block <|-- Diagram` },
{ id: 'er', name: 'Entity relationship', group: 'Structure', code: `erDiagram
  WORKSPACE ||--o{ DOCUMENT : contains
  DOCUMENT ||--|{ BLOCK : "is made of"
  AGENT }o--o{ DOCUMENT : edits
  DOCUMENT {
    string path
    datetime saved
  }
  BLOCK {
    string kind
    int line
  }` },
{ id: 'requirement', name: 'Requirement', group: 'Structure', code: `requirementDiagram
  requirement live_reload {
    id: 1
    text: "A saved file re-renders in place"
    risk: medium
    verifymethod: test
  }
  functionalRequirement keep_scroll {
    id: 1.1
    text: "Scroll position survives the reload"
    risk: low
    verifymethod: test
  }
  element file_watcher {
    type: service
  }
  live_reload - contains -> keep_scroll
  file_watcher - satisfies -> live_reload` },
{ id: 'c4', name: 'C4', group: 'Structure', code: `C4Context
  title Mark in context
  Person(writer, "Writer", "Reads and edits docs")
  System(mark, "Mark", "WYSIWYG Markdown editor")
  System_Ext(agent, "Coding agent", "Writes Markdown")
  System_Ext(fs, "File system", "plan.md, spec.md")
  Rel(agent, fs, "Writes")
  Rel(mark, fs, "Watches")
  Rel(writer, mark, "Reads")` },
{ id: 'architecture', name: 'Architecture', group: 'Structure', code: `architecture-beta
  group app(cloud)[Mark]
  service ui(server)[Editor UI] in app
  service engine(server)[Pele engine] in app
  service watcher(disk)[File watcher] in app
  service agent(internet)[Agent]
  agent:R --> L:watcher
  watcher:T --> B:ui
  ui:R --> L:engine` },
{ id: 'block', name: 'Block', group: 'Structure', code: `block
  columns 3
  md["Markdown"] arrow1<["parse"]>(right) ast["Blocks"]
  space space arrow2<["render"]>(down)
  page["Page"] arrow3<["show"]>(left) svg["SVG + HTML"]` },
{ id: 'treeview', name: 'Tree view', group: 'Structure', code: `treeView-beta
    docs/
        plan.md
        spec.md
        decisions/
            0001-engine.md
            0002-themes.md
    README.md
    CHANGELOG.md` },
{ id: 'mindmap', name: 'Mindmap', group: 'Ideas', code: `mindmap
  root((Launch))
    Copy
      Landing
      Help center
    Product
      Onboarding
      Pricing
    Rollout
      Staff
      10%
      Everyone` },
{ id: 'ishikawa', name: 'Ishikawa', group: 'Ideas', code: `ishikawa-beta
    Docs nobody reads
    Format
        Raw Markdown in a terminal
        Tables collapse
    Content
        Diagrams left as code
        No outline
    Process
        Agent rewrites, nobody diffs
    Tools
        Preview pane only` },
{ id: 'cynefin', name: 'Cynefin', group: 'Ideas', code: `cynefin-beta
  title Where agent work fits

  complex
    "New product spec"

  complicated
    "Refactor plan"

  clear
    "Changelog entry"

  chaotic
    "Incident write-up"

  complex --> complicated : "Pattern found"
  complicated --> clear : "Template made"
  chaotic --> complex : "Stabilized"` },
{ id: 'quadrant', name: 'Quadrant chart', group: 'Ideas', code: `quadrantChart
  title Effort vs impact
  x-axis Low effort --> High effort
  y-axis Low impact --> High impact
  quadrant-1 Plan it
  quadrant-2 Do it now
  quadrant-3 Drop it
  quadrant-4 Delegate
  Onboarding: [0.3, 0.85]
  Pricing page: [0.7, 0.8]
  Dark mode: [0.25, 0.4]
  Export to PDF: [0.75, 0.3]
  Shortcuts: [0.15, 0.62]` },
{ id: 'wardley', name: 'Wardley map', group: 'Ideas', code: `wardley-beta
title Agent docs value chain

anchor Reader [0.95, 0.60]
component Readable doc [0.80, 0.55]
component Markdown [0.62, 0.85]
component Renderer [0.50, 0.45]
component Diagram engine [0.35, 0.30]
component File system [0.12, 0.92]

Reader -> Readable doc
Readable doc -> Markdown
Readable doc -> Renderer
Renderer -> Diagram engine
Markdown -> File system

evolve Diagram engine 0.62` },
{ id: 'kanban', name: 'Kanban', group: 'Plans', code: `kanban
  todo[To do]
    t1[Copy as image]@{ ticket: C-56, priority: 'High' }
    t2[Diagram gallery]@{ ticket: C-57 }
  doing[In progress]
    t3[App Store preview]@{ ticket: v5, assigned: 'agent' }
  done[Done]
    t4[Pele engine]@{ ticket: C-55 }` },
{ id: 'gantt', name: 'Gantt', group: 'Plans', code: `gantt
  dateFormat YYYY-MM-DD
  axisFormat %b %d
  section Plan
  Draft      :a1, 2026-10-01, 5d
  Review     :a2, after a1, 4d
  section Build
  Build      :b1, after a2, 7d
  QA         :b2, after b1, 4d
  section Ship
  Staff      :c1, after b2, 2d
  Everyone   :c2, after c1, 3d` },
{ id: 'timeline', name: 'Timeline', group: 'Plans', code: `timeline
  title Road to 2.4
  Jul : Paper and Ink themes
  Aug : Title bar card : Outline rail
  Sep : 22 diagram types
  Oct : Fullscreen viewer : Pele engine` },
{ id: 'journey', name: 'User journey', group: 'Plans', code: `journey
  title Opening a doc from the agent
  section Agent
    Writes plan.md: 5: Agent
  section You
    Opens Mark: 4: You
    Reads the diagram: 5: You
    Leaves a note: 3: You` },
{ id: 'git', name: 'Git graph', group: 'Plans', code: `gitGraph
  commit id: "plan"
  branch draft
  commit id: "agent"
  commit id: "risks"
  checkout main
  merge draft
  branch fix
  commit id: "pricing"
  checkout main
  merge fix
  commit id: "v2.4"` },
{ id: 'pie', name: 'Pie', group: 'Data', code: `pie title Where the time went
  "Writing" : 42
  "Review" : 26
  "Build" : 20
  "QA" : 12` },
{ id: 'xychart', name: 'XY chart', group: 'Data', code: `xychart-beta
  title "Weekly active writers"
  x-axis [W1, W2, W3, W4, W5, W6, W7, W8]
  y-axis "Writers" 0 --> 900
  bar [220, 310, 360, 420, 510, 600, 690, 780]
  line [220, 310, 360, 420, 510, 600, 690, 780]` },
{ id: 'sankey', name: 'Sankey', group: 'Data', code: `sankey-beta
Search,Visitors,520
Ads,Visitors,340
Referrals,Visitors,240
Visitors,Signed up,690
Visitors,Bounced,410
Signed up,Activated,470
Signed up,Dormant,220
Activated,Pro,180
Activated,Free,290` },
{ id: 'radar', name: 'Radar', group: 'Data', code: `radar-beta
  title Markdown editors
  axis render["Rendering"], diagrams["Diagrams"], speed["Speed"]
  axis agents["Agent-ready"], size["Small app"]
  curve mark["Mark"]{5, 5, 4, 5, 5}
  curve other["Typical editor"]{4, 2, 3, 2, 2}
  max 5` },
{ id: 'treemap', name: 'Treemap', group: 'Data', code: `treemap-beta
"Bundle"
    "Editor"
        "Muya": 320
        "Vue UI": 210
    "Rendering"
        "Pele": 253
        "KaTeX": 120
        "Prism": 60
    "Shell"
        "Tauri": 140` },
{ id: 'venn', name: 'Venn', group: 'Data', code: `venn-beta
  title Why Mark
  set Readable
  set Editable
  set Agent-ready
  union Readable,Editable["WYSIWYG"]
  union Editable,Agent-ready["Live reload"]
  union Readable,Agent-ready["Diagrams"]
  union Readable,Editable,Agent-ready["Mark"]` },
{ id: 'packet', name: 'Packet', group: 'Data', code: `packet
0-15: "Magic"
16-31: "Version"
32-63: "Document length"
64-95: "Block count"
96-127: "Theme id"
128-191: "Checksum"` },
{ id: 'railroad', name: 'Railroad', group: 'Data', code: `railroad-ebnf-beta
title "Mermaid fence"

fence = "\`\`\`" "mermaid" newline diagram newline "\`\`\`" ;
diagram = type { line } ;
type = "flowchart" | "sequenceDiagram" | "pie" | "gantt" ;` },
];
