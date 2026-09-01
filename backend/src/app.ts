import cors from 'cors'
import express from 'express'
import { env } from './config/env'
import { authRouter } from './modules/auth/auth.module'
import { colaboradoresRouter } from './modules/colaboradores/colaboradores.module'
import { equipesRouter } from './modules/equipes/equipes.module'
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

// Middleware de erro (4 args) precisa ser o último app.use.
app.use(tratadorErros)

export { app }
