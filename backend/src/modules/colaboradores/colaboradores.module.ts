import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import {
  atualizarColaborador,
  atualizarStatusColaborador,
  buscarColaboradorPorId,
  criarColaborador,
  listarColaboradores,
} from './colaboradores.controller'

const router = Router()

router.use(autenticar)

router.post('/', asyncHandler(criarColaborador))
router.get('/', asyncHandler(listarColaboradores))
router.get('/:id', asyncHandler(buscarColaboradorPorId))
router.put('/:id', asyncHandler(atualizarColaborador))
router.patch('/:id/status', asyncHandler(atualizarStatusColaborador))

export { router as colaboradoresRouter }
