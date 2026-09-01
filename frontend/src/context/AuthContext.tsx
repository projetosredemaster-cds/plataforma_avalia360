import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { apiFetch, ApiError } from '../lib/apiClient'
import type { Papel } from '../types/colaborador'

export interface ColaboradorAutenticado {
  id: string
  nomeCompleto: string
  email: string
  papel: Papel
}

type AuthStatus = 'carregando' | 'autenticado' | 'nao_autenticado' | 'erro'

interface AuthContextValue {
  status: AuthStatus
  colaborador: ColaboradorAutenticado | null
  erro: string | null
  /** Refaz a resolução de sessão/papel — usado pelo botão "Tentar novamente" do guard de rota. */
  tentarNovamente: () => void
  sair: () => Promise<void>
}

interface PerfilAutenticado {
  id: string
  nomeCompleto: string
  email: string
  papel: Papel
  ativo: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Fonte única do papel do usuário logado. Resolve a sessão do Supabase e,
 * se houver, confirma o papel chamando `GET /api/auth/me` no backend — a
 * árvore nunca deve ser tratada como autenticada sem o papel confirmado
 * pelo servidor (por isso não usamos apenas o JWT/sessão do Supabase).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('carregando')
  const [colaborador, setColaborador] = useState<ColaboradorAutenticado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const versaoRef = useRef(0)

  const resolverColaborador = useCallback(() => {
    const versaoAtual = versaoRef.current + 1
    versaoRef.current = versaoAtual
    setStatus('carregando')
    setErro(null)

    void (async () => {
      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        if (versaoRef.current === versaoAtual) {
          setColaborador(null)
          setStatus('nao_autenticado')
        }
        return
      }

      try {
        const perfil = await apiFetch<PerfilAutenticado>('/api/auth/me')
        if (versaoRef.current !== versaoAtual) return

        setColaborador({
          id: perfil.id,
          nomeCompleto: perfil.nomeCompleto,
          email: perfil.email,
          papel: perfil.papel,
        })
        setStatus('autenticado')
      } catch (err) {
        if (versaoRef.current !== versaoAtual) return
        setColaborador(null)
        setErro(err instanceof ApiError ? err.message : 'Não foi possível confirmar sua sessão.')
        setStatus('erro')
      }
    })()
  }, [])

  useEffect(() => {
    // Resolve a sessão atual no mount e assina mudanças futuras (login/logout em
    // outra aba, expiração de sessão) — é exatamente o padrão de "assinar um
    // sistema externo" descrito pela própria regra `set-state-in-effect`;
    // o disable cobre só a chamada inicial imperativa de sincronização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resolverColaborador()

    const { data: assinatura } = supabase.auth.onAuthStateChange(() => {
      resolverColaborador()
    })

    return () => {
      assinatura.subscription.unsubscribe()
    }
  }, [resolverColaborador])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ status, colaborador, erro, tentarNovamente: resolverColaborador, sair }}>
      {children}
    </AuthContext.Provider>
  )
}

// Hook mantido junto do Provider/Context de propósito (separar em outro
// arquivo só para satisfazer o Fast Refresh adicionaria indireção sem
// benefício real neste projeto).
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
