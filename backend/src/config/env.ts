import 'dotenv/config'

interface Env {
  port: number
  databaseUrl: string
  supabaseUrl: string
  supabaseServiceRoleKey: string
  corsOrigin: string
  frontendUrl: string
  sessaoRespostaTtlMinutos: number
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

// Igual a exigirVariavel, mas para variáveis opcionais: trata ausente E
// string vazia/só-espaços (ex.: "CORS_ORIGIN=" no .env) como "não definida",
// caindo no padrão informado.
function variavelComPadrao(nome: string, padrao: string): string {
  const valor = process.env[nome]
  if (!valor || valor.trim().length === 0) {
    return padrao
  }
  return valor
}

// Igual a variavelComPadrao, mas faz parsing numérico com fallback seguro
// para valor ausente/vazio/não numérico/<= 0.
function numeroComPadrao(nome: string, padrao: number): number {
  const bruto = process.env[nome]
  if (!bruto || bruto.trim().length === 0) return padrao
  const numero = Number(bruto)
  return Number.isFinite(numero) && numero > 0 ? numero : padrao
}

// Fail fast: se alguma variável obrigatória faltar, o processo derruba no boot
// em vez de subir um servidor "quebrado" (ver src/server.ts).
export const env: Env = {
  port: process.env.PORT ? Number(process.env.PORT) : 3333,
  databaseUrl: exigirVariavel('DATABASE_URL'),
  supabaseUrl: exigirVariavel('SUPABASE_URL'),
  supabaseServiceRoleKey: exigirVariavel('SUPABASE_SERVICE_ROLE_KEY'),
  // Não é uma credencial sensível (apenas controla CORS) — mantém default
  // seguro para dev local do frontend Vite caso não esteja definida (ou
  // definida como string vazia). Em produção, basta setar CORS_ORIGIN.
  corsOrigin: variavelComPadrao('CORS_ORIGIN', 'http://localhost:5173'),
  // Usada para montar links absolutos que apontam pro frontend (ex.:
  // redirectTo de e-mails do Supabase Auth) — mesmo tratamento de "opcional
  // com padrão seguro para dev local" do corsOrigin acima.
  frontendUrl: variavelComPadrao('FRONTEND_URL', 'http://localhost:5173'),
  // TTL da sessão temporária emitida após confirmação de CPF no fluxo
  // público `/responder` (ver coleta-respostas-publica.service.ts) — padrão
  // de 45 minutos, dentro da faixa 30-60min pedida pela spec.
  sessaoRespostaTtlMinutos: numeroComPadrao('SESSAO_RESPOSTA_TTL_MINUTOS', 45),
}
