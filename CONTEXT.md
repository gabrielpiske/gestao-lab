# Contexto da aplicação — LabTrack

> Referência operacional para novas sessões. Atualize este arquivo junto com alterações relevantes de arquitetura, dados, segurança ou execução. Não inclua segredos.

## Identidade e escopo

- **Nome:** LabTrack — Gestão de Laboratório Didático.
- **Objetivo:** controlar inventário de componentes, ferramentas e microcontroladores; registrar movimentações de estoque e empréstimos; aplicar perfis de acesso.
- **Pasta do projeto:** `gestao-lab/`. Não depende nem deve alterar projetos vizinhos.
- **Arquitetura:** aplicação web estática, sem framework nem compilação. Cada página carrega o seu módulo JavaScript ES Module, que usa a camada comum `js/data.js` para acessar Firebase Authentication e Cloud Firestore.

## Tecnologias e execução

| Área | Implementação |
| --- | --- |
| Interface | HTML5, CSS3, Bootstrap 5.3.3 e Bootstrap Icons via CDN |
| Lógica | JavaScript moderno, ES Modules, sem `package.json` |
| Identidade | Firebase Authentication |
| Dados | Cloud Firestore |
| Configuração no deploy | função Vercel `api/firebase-config.js` + variáveis de ambiente |
| Hospedagem | Vercel; alternativa Firebase Hosting |
| Regras e índices | `firestore.rules`, `firestore.indexes.json`, Firebase CLI |

Sirva a pasta por HTTP para testes locais. Para configuração real no `vercel dev` ou produção, defina as variáveis listadas em `.env.example`; elas não devem ser versionadas. O navegador chama `GET /api/firebase-config` antes de inicializar o Firebase. Para desenvolvimento com emuladores, defina `window.USE_FIREBASE_EMULATOR = true` antes do carregamento de `js/firebase-config.js`.

## Estrutura e páginas

```text
gestao-lab/
├── index.html                 # Dashboard
├── login.html / register.html # Entrada e cadastro Firebase
├── kits.html                  # Kits de aulas práticas (retirada e devolução 1-clique)
├── components.html            # Catálogo de componentes
├── component-form.html        # Criar/editar componente
├── movements.html             # Entradas e saídas de estoque
├── tools.html                 # Ferramentas e empréstimos
├── microcontrollers.html      # Placas e empréstimos
├── search.html                # Busca global
├── admin-users.html           # Administração de usuários
├── admin-types.html           # Tipos e atributos de componentes
├── admin-history.html         # Histórico global, auditoria e hub de reservas
├── js/
│   ├── firebase-config.js     # Inicialização Firebase e emuladores
│   ├── auth-guard.js          # Sessão, perfil e redirecionamentos
│   ├── data.js                # Única camada de dados Firestore
│   ├── nav.js                 # Navegação e tema persistente
│   ├── utils.js               # Escape HTML, datas, toasts e constantes
│   └── <página>.js            # Comportamento de cada tela
├── css/styles.css             # Estilos próprios globais
├── api/firebase-config.js     # Endpoint Vercel de configuração pública
├── firestore.rules            # Autorização definitiva no banco
├── firestore.indexes.json     # Índices compostos requeridos
├── firebase.json              # Hosting e caminhos de regras/índices
└── vercel.json                # URLs limpas e cabeçalhos de segurança
```

## Domínio e coleções Firestore

| Coleção | Função e campos-chave |
| --- | --- |
| `users` | Perfil: `name`, `email`, `role`, `active`, `createdAt`; ID é o UID do Auth. |
| `componentTypes` | Tipos configuráveis: `name`, `description`, `icon`, `attributes[]`; cada atributo contém opções embutidas. |
| `components` | Inventário: tipo, código, localização, fabricante, quantidade, mínimo e `critical`. |
| `stockMovements` | Auditoria de entradas/saídas: componente, tipo, motivo, quantidade, usuário e `occurredAt`. |
| `tools` | Ferramentas: dados descritivos, `status` e `currentLoan`. |
| `toolLoans` | Histórico de empréstimos de ferramentas. |
| `microcontrollers` | Placas: família, conectividade, `status` e `currentLoan`. |
| `microcontrollerLoans` | Histórico de empréstimos de microcontroladores. |
| `kits` | Kits de aulas práticas: `name`, `description`, `targetClass`, `items[]` (componentes e quantidades), `createdBy`. |
| `kitLoans` | Empréstimos de kits: `kitId`, `kitName`, `userId`, `userName`, `items[]`, `status` (`ATIVO`/`DEVOLVIDO`), `borrowedAt`, `returnedAt`. |

Estados de item emprestável: `DISPONIVEL`, `EMPRESTADA`, `MANUTENCAO`, `INDISPONIVEL`. Um componente é crítico quando `quantity <= minQuantity`.

## Fluxos importantes

### Estoque e Kits de Aulas Práticas

`registerMovement()` em `js/data.js` executa uma transação para movimentação manual de estoque. Para aulas práticas, os docentes criam kits em `kits.html`. A retirada com 1-clique (`borrowKit()`) baixa atomicamente todos os componentes do kit no Firestore e gera os registros de saída em `stockMovements`. A devolução com 1-clique (`returnKitLoan()`) restaura a quantidade de cada componente e registra as entradas em `stockMovements`, evitando que devoluções sejam esquecidas ou feitas em duplicidade.

### Empréstimos

Ferramentas e microcontroladores usam o mesmo padrão transacional: o item precisa estar `DISPONIVEL`; a transação cria o empréstimo e atualiza o item para `EMPRESTADA` com `currentLoan`. A devolução marca `returnedAt` e limpa `currentLoan`, restaurando `DISPONIVEL`. Qualquer usuário pode consultar seus empréstimos ativos e registrar devoluções diretamente pelo modal global **Meus Empréstimos** na barra de navegação (`nav.js`), pelo **Dashboard** (`dashboard.js` com banner de alertas de atraso) ou pelo painel de **Histórico & Auditoria** (`admin-history.js`).

### Autenticação e perfis

`requireAuth()` em `js/auth-guard.js` aguarda Firebase Auth, lê `users/{uid}` e cria o primeiro perfil como `VISITANTE` ativo quando necessário. Páginas podem exigir escrita ou administração. Isto melhora a UX, mas `firestore.rules` é a camada que realmente autoriza acesso.

| Papel | Permissão |
| --- | --- |
| `ADMIN` | Administração e acesso completo. |
| `DOCENTE` | Inventário, movimentações e empréstimos. |
| `ALUNO` | Operações permitidas; devolve apenas seus empréstimos. |
| `VISITANTE` | Somente consulta. |

## Segurança e configuração

- `api/firebase-config.js` aceita apenas `GET`, valida variáveis necessárias e responde sem cache. As chaves de configuração do Firebase chegam ao cliente por design; a proteção de dados depende de Auth e `firestore.rules`.
- As regras exigem usuário ativo para leitura do acervo. Tipos são administrados apenas por `ADMIN`. Movimentações não podem ser alteradas. Usuários comuns não podem mudar seu próprio papel ou status.
- `vercel.json` configura cabeçalhos de segurança e URLs sem extensão. Não remova-os sem motivo e validação.
- Índices compostos estão versionados em `firestore.indexes.json`. Consultas combinando filtros e ordenação devem ter índice correspondente.

## Convenções de manutenção

- Sempre use `escapeHtml()` antes de inserir texto externo via `innerHTML`.
- Use `showToast`, `showSuccess` e `showError` em `js/utils.js` para feedback.
- Evite acesso direto ao Firestore por módulos de página: acrescente operações em `js/data.js`.
- Mantenha `serverTimestamp()` para eventos e `runTransaction()` para mudanças que precisam ser atômicas.
- Para novo status, papel, coleção ou campo sensível, atualize em conjunto UI, `data.js`, regras, índices quando aplicável e esta documentação.

## Verificação e publicação

Para testar localmente, use um servidor HTTP na pasta. Para publicar regras e índices (somente com autorização):

```powershell
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

Valide fluxos de cadastro, leitura, escrita, empréstimo/devolução e os quatro perfis após mudanças em autorização. O projeto não possui suíte de testes automatizados ou etapa de build declarada.
