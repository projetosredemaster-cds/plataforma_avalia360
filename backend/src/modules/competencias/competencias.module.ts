import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import { listarCompetencias } from './competencias.controller'

const router = Router()

router.use(autenticar)

router.get('/', asyncHandler(listarCompetencias))

export { router as competenciasRouter }
