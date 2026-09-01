import 'dotenv/config'

interface Env {
  port: number
  databaseUrl: string
  supabaseUrl: string
  supabaseServiceRoleKey: string
  corsOrigin: string
}

function exigirVariavel(nome: string): string {
  const valor = process.env[nome]
  if (!valor || valor.trim().length === 0) {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${nome}. Confira o arquivo .env (veja .env.example).`,
    )
  }
  return valor
}

// Fail fast: se alguma variável obrigatória faltar, o processo derruba no boot
// em vez de subir um servidor "quebrado" (ver src/server.ts).
export const env: Env = {
  port: process.env.PORT ? Number(process.env.PORT) : 3333,
  databaseUrl: exigirVariavel('DATABASE_URL'),
  supabaseUrl: exigirVariavel('SUPABASE_URL'),
  supabaseServiceRoleKey: exigirVariavel('SUPABASE_SERVICE_ROLE_KEY'),
  // Não é uma credencial sensível (apenas controla CORS) — mantém default
  // seguro para dev local do frontend Vite caso não esteja definida.
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
}
