export interface ItemReordenacao {
  id: string
  ordem: number
}

export interface ReordenarPerguntasDto {
  itens: ItemReordenacao[]
}
