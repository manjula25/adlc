# Modular Rules Architecture (on-demand context)

Pillar 1 of the framework ("Greenfield Project Planning → Modular Rules Architecture").
Progressive disclosure: keep `CLAUDE.md` (global rules) short and **always loaded**; push
detailed, task-specific guidance into this folder and load it **only when relevant**.

```
CLAUDE.md            ← always in context. Concise. Points here.
.agents/reference/   ← on-demand. Loaded only for matching work.
  components.md      ← when building React/UI components (shadcn/Tailwind patterns)
  api.md             ← when building API routes / server actions
  styles.md          ← when styling (design tokens, theme)
  supabase.md        ← when touching DB / RLS / auth
```

In `CLAUDE.md` add lines like: *"When working on UI components, read
`.agents/reference/components.md`."* The agent pulls them in as needed — context stays lean
(Golden Rule 1: Context is King).

These files are **generated per project** by `/create-rules` + system-evolution edits — they
are intentionally empty in the harness template. The SDIAS pilot (Phase 5) populates them.
