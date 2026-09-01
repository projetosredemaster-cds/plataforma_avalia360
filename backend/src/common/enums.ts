// Reaproveitado por outros módulos futuros que precisem checar papel
// (equipes, colaboradores e, futuramente, ciclos/pesquisas/etc.).
export type PapelColaborador = 'admin' | 'gestor_rh' | 'colaborador'

export const PAPEL_COLABORADOR_VALORES: PapelColaborador[] = [
  'admin',
  'gestor_rh',
  'colaborador',
]
