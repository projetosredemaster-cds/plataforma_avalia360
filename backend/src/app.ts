import cors from 'cors'
import express from 'express'
import { env } from './config/env'
import { authRouter } from './modules/auth/auth.module'
import { ciclosAvaliacaoRouter } from './modules/ciclos-avaliacao/ciclos-avaliacao.module'
import { coletaRespostasPublicaRouter } from './modules/coleta-respostas-publica/coleta-respostas-publica.module'
import { colaboradoresRouter } from './modules/colaboradores/colaboradores.module'
import { competenciasRouter } from './modules/competencias/competencias.module'
import { equipesRouter } from './modules/equipes/equipes.module'
import { pesquisasRouter } from './modules/pesquisas/pesquisas.module'
import { tratadorErros } from './middlewares/tratadorErros'

const app = express()

app.use(
  cors({
    origin: env.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/equipes', equipesRouter)
app.use('/api/colaboradores', colaboradoresRouter)
app.use('/api/pesquisas', pesquisasRouter)
app.use('/api/competencias', competenciasRouter)
app.use('/api/ciclos', ciclosAvaliacaoRouter)

// ROTA PÚBLICA (sem `autenticar`) — colaborador comum responde pesquisas via
// link + CPF, sem conta no Supabase Auth. Autorização por posse de
// token/sessaoToken + CPF, validada manualmente dentro do service. NUNCA
// adicionar `autenticar` a este router (ver
// coleta-respostas-publica.module.ts).
app.use('/api/publico', coletaRespostasPublicaRouter)

// Middleware de erro (4 args) precisa ser o último app.use.
app.use(tratadorErros)

export { app }
