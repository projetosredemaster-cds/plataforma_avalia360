import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import {
  adicionarParticipantesIndividual,
  adicionarParticipantesPorEquipe,
  listarParticipantes,
  removerParticipante,
} from './ciclo-participantes.controller'

// mergeParams: true — path final montado como sub-router de ciclos-avaliacao,
// precisa herdar `cicloId` do router pai.
const router = Router({ mergeParams: true })

// Montado aqui de novo (mesmo já autenticado pelo router pai) — nenhuma rota
// deste módulo é acessível por `colaborador`, defesa em profundidade
// explícita pedida pelo plano da task.
router.use(autenticar)

router.get('/', asyncHandler(listarParticipantes))
router.post('/', asyncHandler(adicionarParticipantesIndividual))
router.post('/por-equipe', asyncHandler(adicionarParticipantesPorEquipe))
router.delete('/:colaboradorId', asyncHandler(removerParticipante))

export { router as cicloParticipantesRouter }
