---
name: backend-anonimizacao-respostas
description: Use sempre que implementar ou alterar qualquer endpoint que leia respostas, ciclos, relacionamentos de avaliação ou envios em apps/api. Define o padrão obrigatório para não expor identidade de avaliadores de pares/subordinado ao avaliado.
---

# Padrão de anonimização de respostas

Esta é a regra de negócio mais sensível do projeto. Qualquer endpoint que
retorna dados de resposta precisa seguir este padrão.

## Regra

- Respostas do tipo `autoavaliacao`, `gestor` e `externo` PODEM ser retornadas
  identificadas (com `avaliador_id`) para quem tem permissão (RH/admin) e,
  quando aplicável, para o próprio avaliado.
- Respostas do tipo `pares` e `subordinado` NUNCA podem ser retornadas
  identificadas para o avaliado. Só o agregado (médias/contagens) pode ser
  exposto, e apenas quando o número de respondentes daquele tipo atingir
  `ciclos_avaliacao.minimo_respostas_pares` (padrão 3) para aquele
  avaliado+ciclo+tipo.
- RH e admin sempre têm acesso à visão completa e identificada, para fins de
  gestão e auditoria.

## Como implementar

1. Nunca faça uma query que junte `itens_resposta` diretamente com
   `relacionamentos_avaliacao.avaliador_id` em um endpoint acessível ao papel
   `colaborador`. Use as views `respostas_identificadas` (self/gestor/externo)
   e `respostas_pares_agregadas` (pares/subordinado) do schema como base, ou
   replique a mesma separação na camada de service se preferir fazer em
   TypeScript em vez de SQL.
2. Ao consultar `respostas_pares_agregadas`, sempre confira se o número de
   respondentes atingiu o mínimo do ciclo antes de retornar qualquer valor —
   abaixo do mínimo, retorne um estado explícito (ex.:
   `{ liberado: false, motivo: "aguardando_minimo_respondentes" }`), nunca um
   array vazio ou parcial que possa ser interpretado incorretamente.
3. Escreva um teste (ou peça ao `test-engineer` para escrever) cobrindo os
   dois casos: abaixo do mínimo e no mínimo exato.
4. Deixe um comentário no código indicando claramente se aquele bloco lida com
   dados "identificados" ou "agregados/anônimos" — isso ajuda o
   `backend-codereviewer` a revisar rápido.

## Sinal de alerta

Se você (agente) perceber que está prestes a escrever uma query que retorna
`avaliador_id` junto com `tipo_relacionamento IN ('pares', 'subordinado')` em
um caminho de código acessível pelo avaliado, PARE — isso é exatamente o que
essa regra proíbe.
