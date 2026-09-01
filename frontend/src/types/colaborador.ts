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
  email: string
  cpf: string
  papel: Papel
  cargo: string | null
  ativo: boolean
  equipe: { id: string; nome: string } | null
  gestor: { id: string; nomeCompleto: string } | null
  usuarioAuthId: string | null
  criadoEm: string
  atualizadoEm: string
}
