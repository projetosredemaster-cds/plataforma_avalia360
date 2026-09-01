import 'reflect-metadata'
import { app } from './app'
import { env } from './config/env'
import { AppDataSource } from './data-source'

async function bootstrap(): Promise<void> {
  try {
    await AppDataSource.initialize()
  } catch (erro) {
    console.error('Falha ao conectar ao banco de dados.', erro)
    process.exit(1)
  }

  app.listen(env.port, () => {
    console.log(`API rodando na porta ${env.port}`)
  })
}

bootstrap()
