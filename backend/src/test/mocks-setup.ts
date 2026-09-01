import { vi } from 'vitest'

// Mocks de fronteira aplicados globalmente (setupFiles) para todo spec que
// importe estes dois módulos, independentemente do caminho relativo usado —
// vi.mock intercepta pelo caminho absoluto resolvido (sempre
// src/data-source.ts / src/lib/supabaseAdmin.ts), então tanto specs em
// src/modules/**/*.spec.ts quanto specs em src/*.spec.ts recebem a mesma
// versão mockada. Nenhuma conexão real a Postgres/Supabase é feita em nenhum
// teste desta suíte.
vi.mock('../data-source', () => ({
  AppDataSource: { getRepository: vi.fn() },
}))

vi.mock('../lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
      admin: {
        createUser: vi.fn(),
        deleteUser: vi.fn(),
      },
      resetPasswordForEmail: vi.fn(),
    },
  },
}))
