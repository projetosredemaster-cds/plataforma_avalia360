---
name: backend-modulo-crud
description: Use sempre que for necessário criar um módulo novo (ou o CRUD completo de uma entidade) em apps/api. Define a estrutura esperada — entidade TypeORM, migration, service, controller — seguindo a nomenclatura em português do schema_avaliacao360_pt.sql.
---

# Padrão de módulo backend (apps/api)

## Estrutura de pastas

```
src/modules/<nome>/
  <nome>.entity.ts
  <nome>.service.ts
  <nome>.controller.ts
  <nome>.module.ts
  dto/
    criar-<nome>.dto.ts
    atualizar-<nome>.dto.ts
```

## 1. Entidade

- O nome da classe TypeORM pode ser em inglês ou português conforme o restante
  do projeto já estabelecer, mas o `@Entity('<nome_tabela>')` DEVE usar
  exatamente o nome de tabela em português definido em
  `schema_avaliacao360_pt.sql` (ex.: `colaboradores`, `ciclos_avaliacao`,
  `relacionamentos_avaliacao`).
- Os nomes de coluna (`@Column()`) devem bater com as colunas do schema —
  nunca traduza de volta para inglês nem invente nomes novos sem atualizar o
  schema primeiro.
- Enums do Postgres (`papel_colaborador`, `status_ciclo`, `tipo_pergunta`,
  `tipo_relacionamento`, `status_envio`, `status_pesquisa`) devem ser mapeados
  como enum do TypeORM com os mesmos valores em português já definidos no SQL.

## 2. Migration

- Toda mudança de schema precisa de uma migration correspondente — nunca
  confie em `synchronize: true` para alterar tabelas em produção.
- Migrations devem ser reversíveis (implementar `up` e `down`) sempre que
  possível.

## 3. Service

- Regras de autorização por papel (`admin`, `gestor_rh`, `colaborador`) devem
  ficar centralizadas — não duplique a checagem de papel em múltiplos lugares.
- Nunca faça join direto em `itens_resposta` para retornar dados a um
  `colaborador` sem passar pela skill `backend-anonimizacao-respostas`.

## 4. Controller

- Toda rota declara explicitamente quais papéis podem acessá-la (via guard ou
  decorator, conforme o padrão já estabelecido no projeto).
- Valide toda entrada (DTOs com class-validator ou zod, conforme o que já
  estiver no projeto).
