/**
 * Lista fixa de cargos válidos para o campo `cargo` do colaborador.
 * Espelha `CARGO_COLABORADOR_VALORES` de `backend/src/common/enums.ts`
 * (ver `.claude/tasks/colaboradores-cargo-gestor-email/task-backend.md`) —
 * qualquer mudança nessa lista precisa ser replicada nos dois lados.
 */
export const CARGO_OPCOES = [
  'Auxiliar de Escritório',
  'Auxiliar Administrativo',
  'Assistente Administrativo',
  'Recepcionista',
  'Atendente',
  'Auxiliar Financeiro',
  'Analista Financeiro',
  'Contador',
  'Assistente de RH',
  'Analista de RH',
  'Gerente de RH',
  'Coordenador',
  'Supervisor',
  'Gerente',
  'Diretor',
  'Gestor',
] as const
