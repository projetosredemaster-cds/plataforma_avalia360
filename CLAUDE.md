# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Plataforma de Avaliação 360° — a single-tenant 360° performance review platform.
Two independent npm projects, no workspace/monorepo tooling tying them together:

- `frontend/` — React 19 + Vite + TypeScript. Currently the only side with real code.
- `backend/` — Node.js + Express + TypeORM + Postgres (Supabase), intended to hold
  entities/migrations/routes. As of now it has no `src/` yet — only `package.json`
  and `tsconfig.json` exist; treat any backend work as greenfield.

The repo's own agents/skills (`.claude/agents/*.md`, `.claude/skills/*.md`) refer to
these as `apps/web` and `apps/api` — that naming doesn't exist on disk, the real
directories are `frontend/` and `backend/`. Read the agent/skill files with that
substitution in mind.

There is no `schema_avaliacao360_pt.sql` file in the repo yet, even though agents/skills
treat it as the source of truth for table/column names. If it's genuinely missing when
you need it, ask the user rather than inventing table/column names.

## Commands

Frontend (`frontend/`):
```
npm run dev       # Vite dev server
npm run build      # tsc -b && vite build
npm run lint       # eslint .
npm run preview    # preview a production build
```

Backend (`backend/`): no build/lint/test scripts are wired up yet (`npm test` is the
default CRA-style placeholder). Don't assume a script exists — check `package.json`
before running one, and set up the real scripts as part of whatever backend work is
requested.

## Multi-agent development workflow

This repo drives feature work through a fixed pipeline of subagents defined in
`.claude/agents/`, coordinated by `orquestrador`, with per-domain conventions captured
as skills in `.claude/skills/`. When asked to implement a feature (as opposed to a
one-off question), follow this pipeline rather than editing code directly:

1. **spec** (only if the request is ambiguous) → writes `.claude/tasks/<slug>/spec.md`.
2. **planejamento-backend** / **planejamento-frontend** (whichever side is touched) →
   writes `.claude/tasks/<slug>/task-backend.md` and/or `task-frontend.md` with
   numbered steps.
3. **backend-developer** / **frontend-developer** → implements step 1 of the relevant
   task file. Backend may only touch `backend/**`; frontend may only touch `frontend/**`
   (plus `.claude/tasks/**` to update status). Neither crosses into the other's tree.
4. **backend-codereviewer** / **frontend-codereviewer** → review-only (never fixes
   code directly), appends a "## Revisão" section to the task file with Crítico /
   Deveria corrigir / Sugestão findings. Critical findings send the task back to the
   developer step.
5. **test-engineer** → runs last, once reviewers report no critical findings. Writes
   automated tests, prioritizing the anonymization rule and role-based access control.

Task state lives under `.claude/tasks/<slug>/` — check there before starting new work
on a feature to see if a spec/plan/review already exists (see `.claude/tasks/tela-login/`
for a worked example of the full task-file format).

## Core business rules (apply across both sides)

**Anonymization (the most sensitive rule in the project, detailed in the
`backend-anonimizacao-respostas` skill):** answers of relationship type `pares` and
`subordinado` must never be exposed identified (no `avaliador_id`) to the person being
evaluated — only aggregated (averages/counts), and only once the respondent count for
that evaluated person + cycle + type reaches `ciclos_avaliacao.minimo_respostas_pares`
(default 3). Answers of type `autoavaliacao`, `gestor`, and `externo` may be identified.
RH/admin always get the full identified view. Never write a query/endpoint reachable by
`colaborador` that joins `itens_resposta` with `relacionamentos_avaliacao.avaliador_id`
for `pares`/`subordinado` rows — use (or replicate the separation of) the
`respostas_identificadas` and `respostas_pares_agregadas` views. Below the minimum,
return an explicit state (e.g. `{ liberado: false, motivo: "aguardando_minimo_respondentes" }`),
never an empty/partial array.

**Roles:** `admin`, `gestor_rh`, `colaborador`. Every protected backend route must check
the authenticated user's role (Supabase Auth JWT); every frontend screen/action must
adapt to or hide based on role.

**Question types:** exactly 4 — `likert`, `texto_aberto`, `matriz`, `pessoa`. Other types
(CSAT, NPS, KPI, CES, NVS, Imagem, Indicação) were deliberately removed from MVP scope;
don't reintroduce one without explicit confirmation already recorded in a spec.

**Single-tenant:** never introduce `organization_id` or any multi-tenant isolation.

**Survey creation is always manual** — no auto-generation/AI/template shortcuts.

## Backend conventions (`backend/`, per `backend-modulo-crud` skill)

Module layout once modules exist:
```
src/modules/<nome>/
  <nome>.entity.ts
  <nome>.service.ts
  <nome>.controller.ts
  <nome>.module.ts
  dto/
    criar-<nome>.dto.ts
    atualizar-<nome>.dto.ts
```
- `@Entity('<nome_tabela>')` and `@Column()` names must match the Portuguese table/column
  names from the schema exactly (e.g. `colaboradores`, `ciclos_avaliacao`,
  `relacionamentos_avaliacao`) — never translate back to English or invent names.
- Postgres enums (`papel_colaborador`, `status_ciclo`, `tipo_pergunta`,
  `tipo_relacionamento`, `status_envio`, `status_pesquisa`) map to TypeORM enums with the
  same Portuguese values.
- Never rely on `synchronize: true` for schema changes — every schema change needs a
  migration with `up`/`down`.
- Role-authorization checks live centralized in the service layer, not duplicated per
  route.

## Frontend conventions (`frontend/`)

- **Styling: Tailwind CSS + MUI, no plain CSS.** Tailwind for layout/spacing/utility
  colors, MUI components (`TextField`, `Button`, `Dialog`, etc.) for actual UI controls.
  Where MUI and Tailwind would compete on the same property, MUI wins — customize via
  the MUI `theme` (`createTheme`, `sx` prop), not Tailwind classes overriding a MUI
  component. The project migrated off plain CSS files early on (see the "Refatoração...
  Tailwind + MUI" note in `.claude/tasks/tela-login/task-frontend.md`); don't add new
  `.css` files or large inline `style={{}}` blocks.
- Question components (construtor de pesquisas / question rendering), per
  `frontend-componente-pergunta` skill: one editor + one response component per type,
  under `components/perguntas/Pergunta<Tipo>/`. Response components receive `valor` +
  `onChange` via props and never call the API directly — the parent page/form persists.
  Response components must block submission when `obrigatoria` is unmet.
- Static assets referenced by URL (`/logo.jpg`, `/imagem-tela-login.jpg`) belong in
  `public/`, not imported from `src/assets`.
- No sensitive business logic (aggregation, anonymization) in the frontend — it must
  come pre-computed from the API. If a results screen's data source isn't clearly
  identified-vs-aggregated in the task, that's a stop-and-ask, not an assumption.
- Supabase client lives at `frontend/src/lib/supabaseClient.ts`, reads
  `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — never hardcode these.
  `frontend/.env.example` is intentionally versioned (with empty placeholders); `.env`
  itself stays gitignored.
