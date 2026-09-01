export interface ItemReordenacao {
  id: string
  ordem: number
}

export interface ReordenarPaginasDto {
  itens: ItemReordenacao[]
}
