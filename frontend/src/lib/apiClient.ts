import { supabase } from './supabaseClient'

const API_URL = import.meta.env.VITE_API_URL

/**
 * Erro tipado lançado por `apiFetch` para respostas não-2xx da API do
 * backend. `codigo` é o código de erro semântico retornado pela API (ex.:
 * `CPF_DUPLICADO`, `EMAIL_JA_REGISTRADO_AUTH`), usado pelas telas para
 * associar o erro a um campo específico do formulário em vez de um alerta
 * genérico.
 */
export class ApiError extends Error {
  status: number
  codigo?: string

  constructor(status: number, mensagem: string, codigo?: string) {
    super(mensagem)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
  }
}

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /**
   * Quando `true`, pula por completo `supabase.auth.getSession()` e nunca
   * monta o header `Authorization` — usado pelas rotas verdadeiramente
   * públicas (`/api/publico/**`), que não devem depender de nem enviar
   * nenhuma credencial de sessão, mesmo quando a mesma aba tiver um
   * admin/gestor_rh logado. Default `false`: nenhum call-site existente
   * muda de comportamento.
   */
  semAutenticacao?: boolean
}

function extrairErro(corpo: unknown): { codigo?: string; mensagem?: string } {
  if (!corpo || typeof corpo !== 'object') return {}

  const objeto = corpo as Record<string, unknown>
  // O contrato documentado em task-backend.md envelopa o erro em `{ erro: { codigo, mensagem } }`,
  // mas o resumo de contrato repassado ao frontend descreve `{ codigo, mensagem }` na raiz.
  // Tratamos os dois formatos defensivamente para não depender de qual versão do backend está no ar.
  const aninhado =
    objeto.erro && typeof objeto.erro === 'object' ? (objeto.erro as Record<string, unknown>) : undefined

  const codigo = (aninhado?.codigo ?? objeto.codigo) as string | undefined
  const mensagem = (aninhado?.mensagem ?? objeto.mensagem) as string | undefined
  return { codigo, mensagem }
}

/**
 * Wrapper de `fetch` para a API REST do backend. Só faz transporte HTTP:
 * injeta o token de sessão do Supabase, serializa o corpo em JSON e traduz
 * respostas de erro num `ApiError` tipado. Nenhuma lógica de negócio
 * (agregação, anonimização, etc.) vive aqui.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const token = options.semAutenticacao
    ? undefined
    : (await supabase.auth.getSession()).data.session?.access_token

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.')
  }

  if (response.status === 204) {
    return undefined as T
  }

  let corpo: unknown
  try {
    corpo = await response.json()
  } catch {
    corpo = null
  }

  if (!response.ok) {
    const { codigo, mensagem } = extrairErro(corpo)
    throw new ApiError(response.status, mensagem ?? 'Erro inesperado ao comunicar com o servidor.', codigo)
  }

  return corpo as T
}
