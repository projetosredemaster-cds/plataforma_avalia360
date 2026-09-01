export class ErroHttp extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroHttp'
  }
}
