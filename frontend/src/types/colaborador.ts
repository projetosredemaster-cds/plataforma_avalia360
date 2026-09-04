export type Papel = 'admin' | 'gestor_rh' | 'colaborador'

export interface Equipe {
  id: string
  nome: string
  criadoEm?: string
  atualizadoEm?: string
}

export interface Colaborador {
  id: string
  nomeCompleto: string
  email: string | null
  cpf: string
  papel: Papel
  cargo: string | null
  ehGestor: boolean
  ativo: boolean
  equipe: { id: string; nome: string } | null
  gestor: { id: string; nomeCompleto: string } | null
  usuarioAuthId: string | null
  criadoEm: string
  atualizadoEm: string
}
