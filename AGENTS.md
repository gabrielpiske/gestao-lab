# Instruções persistentes — LabTrack

## Escopo

Esta sessão refere-se exclusivamente à aplicação **LabTrack**, localizada nesta pasta (`gestao-lab/`). Ignore projetos, exercícios e materiais localizados fora dela, salvo solicitação explícita do usuário.

## Contexto obrigatório

Antes de responder perguntas técnicas, investigar problemas, testar ou modificar a aplicação, leia integralmente [`CONTEXT.md`](CONTEXT.md). Esse arquivo é o contexto oficial e atualizado do projeto.

Quando uma mudança alterar arquitetura, fluxo, modelo de dados, configuração, regras de segurança ou execução, atualize também o `CONTEXT.md`. Nunca grave credenciais, tokens, IDs de projeto ou dados pessoais no contexto.

## Cuidados essenciais

- Mantenha a aplicação sem etapa de build: HTML, CSS e JavaScript ES Modules no navegador.
- Centralize leituras e gravações no Firestore em `js/data.js`; preserve transações para movimentações e empréstimos.
- Alterações de acesso devem atualizar e validar `firestore.rules`; a proteção do navegador não substitui as regras do Firestore.
- Preserve a configuração Firebase fora do repositório, por variáveis de ambiente e pelo endpoint `api/firebase-config.js`.
- Antes de publicar regras, índices ou fazer deploy, confirme a autorização explícita do usuário.
