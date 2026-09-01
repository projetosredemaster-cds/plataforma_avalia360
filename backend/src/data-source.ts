import 'reflect-metadata'
import path from 'node:path'
import { DataSource } from 'typeorm'
import { env } from './config/env'

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  ssl: { rejectUnauthorized: false },
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: [path.join(__dirname, 'modules/**/*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations/*.{ts,js}')],
})
