import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import {
  atualizarEquipe,
  buscarEquipePorId,
  criarEquipe,
  listarColaboradoresDaEquipe,
  listarEquipes,
  removerEquipe,
  vincularColaboradoresEquipe,
} from './equipes.controller'

const router = Router()

router.use(autenticar)

router.post('/', asyncHandler(criarEquipe))
router.get('/', asyncHandler(listarEquipes))
router.get('/:id', asyncHandler(buscarEquipePorId))
router.put('/:id', asyncHandler(atualizarEquipe))
router.delete('/:id', asyncHandler(removerEquipe))
router.get('/:id/colaboradores', asyncHandler(listarColaboradoresDaEquipe))
router.patch('/:id/colaboradores', asyncHandler(vincularColaboradoresEquipe))

export { router as equipesRouter }
