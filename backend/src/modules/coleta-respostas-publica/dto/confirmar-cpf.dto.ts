/** Validação real (normalização + comparação) acontece no service — o DTO só
 * documenta o formato de entrada esperado (body cru, não tipado pelo Express). */
export interface ConfirmarCpfDto {
  cpf: unknown
}
