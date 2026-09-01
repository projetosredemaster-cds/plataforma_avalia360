// Executado pelo Vitest (setupFiles) antes de qualquer teste importar
// `src/config/env.ts`. Não há `.env` real nesta sessão (sem Postgres/Supabase
// disponíveis) — estes valores são placeholders só para satisfazer o
// fail-fast de `exigirVariavel` em env.ts. Nenhuma conexão real é feita:
// `data-source.ts` e `lib/supabaseAdmin.ts` são sempre mockados via
// `vi.mock` nos specs que precisam deles, então estes valores nunca chegam a
// ser usados para abrir uma conexão de verdade.
process.env.DATABASE_URL ??= 'postgres://usuario-teste:senha-teste@localhost:5432/banco-teste'
process.env.SUPABASE_URL ??= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'chave-service-role-fake-para-teste'
process.env.CORS_ORIGIN ??= 'http://localhost:5173'
