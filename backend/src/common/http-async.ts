import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Wrapper padrão para os controllers não precisarem de try/catch repetido —
 * encaminha rejeições da Promise para next(err), que cai no tratadorErros.
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
