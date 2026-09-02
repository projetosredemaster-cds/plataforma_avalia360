import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import { cicloParticipantesRouter } from '../ciclo-participantes/ciclo-participantes.module'
import { enviosPesquisaRouter } from '../envios-pesquisa/envios-pesquisa.module'
import {
  atualizarCiclo,
  atualizarStatusCiclo,
  buscarCicloPorId,
  criarCiclo,
  listarCiclos,
  listarRelacionamentosCiclo,
  removerCiclo,
} from './ciclos-avaliacao.controller'

const router = Router()

router.use(autenticar)

// Sub-router de participantes, montado antes das rotas com :id, path final:
// /api/ciclos/:cicloId/participantes...
router.use('/:cicloId/participantes', cicloParticipantesRouter)
router.use('/:cicloId/envios', enviosPesquisaRouter)

router.post('/', asyncHandler(criarCiclo))
router.get('/', asyncHandler(listarCiclos))
router.get('/:id', asyncHandler(buscarCicloPorId))
router.put('/:id', asyncHandler(atualizarCiclo))
router.delete('/:id', asyncHandler(removerCiclo))
router.patch('/:id/status', asyncHandler(atualizarStatusCiclo))
router.get('/:id/relacionamentos', asyncHandler(listarRelacionamentosCiclo))

export { router as ciclosAvaliacaoRouter }
