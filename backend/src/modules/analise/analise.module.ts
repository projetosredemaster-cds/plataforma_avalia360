import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import { buscarVisaoGeralAnalise, buscarAvaliacoesAnalise } from './analise.controller'

const router = Router()

router.use(autenticar)

router.get('/visao-geral', asyncHandler(buscarVisaoGeralAnalise))
router.get('/avaliacoes', asyncHandler(buscarAvaliacoesAnalise))

export { router as analiseRouter }
