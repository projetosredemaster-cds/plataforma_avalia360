import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import { obterMeuPerfil } from './auth.controller'

const router = Router()

router.use(autenticar)

// GET /api/auth/me — exclusivamente o registro do próprio chamador (ver
// justificativa em auth.service.ts). Não recebe :id, não lista terceiros.
router.get('/me', asyncHandler(obterMeuPerfil))

export { router as authRouter }
