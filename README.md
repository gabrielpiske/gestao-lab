# LabTrack — Gestão de Laboratório Didático

O LabTrack é uma aplicação web para controlar o inventário de laboratórios didáticos. Centraliza componentes eletrônicos, ferramentas e microcontroladores, mantendo o histórico de estoque e de empréstimos.

## Funcionalidades

- Cadastro e consulta de componentes, ferramentas e microcontroladores.
- Tipos de componentes configuráveis, com atributos específicos para cada tipo.
- Movimentações de entrada e saída de estoque, com atualização automática da quantidade disponível.
- Alerta de estoque crítico conforme a quantidade mínima cadastrada.
- Empréstimo e devolução de ferramentas e placas, com responsável e data prevista de retorno.
- Devolução permitida somente ao responsável pelo empréstimo ou a um administrador.
- Dashboard com indicadores, busca global, filtros e histórico de movimentações.
- Gestão de usuários, perfis e estado de ativação.
- Tema claro/escuro persistido no navegador.

## Tecnologias

| Área | Tecnologia |
| --- | --- |
| Interface | HTML5, CSS3 e Bootstrap 5 |
| Lógica no cliente | JavaScript moderno com ES Modules |
| Autenticação | Firebase Authentication |
| Banco de dados | Cloud Firestore |
| Hospedagem | Vercel |
| Regras e índices | Firebase CLI |

## Arquitetura

O projeto não depende de framework ou etapa de compilação. Cada página HTML carrega apenas o módulo JavaScript responsável por sua funcionalidade.

```text
Interface (HTML + Bootstrap)
          ↓
Módulos de página (js/components.js, js/tools.js, ...)
          ↓
Camada de serviços (js/data.js)
          ↓
Firebase Authentication + Cloud Firestore
          ↓
Regras de segurança (firestore.rules)
```

### Camada de interface

As páginas em HTML exibem tabelas, cards, formulários, filtros e modais. O Bootstrap oferece componentes responsivos e os estilos próprios ficam em `css/styles.css`.

### Camada de aplicação

Os módulos em `js/` organizam o comportamento de cada tela: carregamento de listas, validação de formulários, abertura de modais e mensagens ao usuário. Exemplos: `components.js`, `tools.js` e `microcontrollers.js`.

### Camada de serviços

`js/data.js` concentra as operações com o Firestore. Dessa forma, a interface não acessa o banco diretamente e as regras de negócio ficam reutilizáveis. Os empréstimos e as movimentações usam transações atômicas para gravar o histórico e atualizar o item sem risco de inconsistência em acessos simultâneos.

### Autenticação e autorização

`js/auth-guard.js` valida a sessão e protege rotas no navegador. Já `firestore.rules` é a camada definitiva de segurança: ela valida o usuário autenticado, o perfil ativo e as permissões diretamente no banco.

Os perfis são:

| Perfil | Acesso |
| --- | --- |
| `ADMIN` | Administração completa, inclusive devolução de qualquer empréstimo. |
| `DOCENTE` | Operações de inventário e empréstimos. |
| `ALUNO` | Operações de inventário e empréstimos; só devolve itens retirados por ele. |
| `VISITANTE` | Consulta ao catálogo e à disponibilidade. |

## Práticas adotadas

- **JavaScript modular:** responsabilidades separadas por página e por serviço.
- **Transações no Firestore:** estoque e empréstimos são atualizados de forma atômica.
- **Auditoria:** movimentações de estoque e empréstimos registram usuário, data e observações.
- **Controle de acesso por perfil:** permissões verificadas na interface e reforçadas pelas regras do Firestore.
- **Configuração segura:** dados de configuração do Firebase são fornecidos por variáveis de ambiente no endpoint `api/firebase-config.js`.
- **Validação e segurança de interface:** entradas exibidas são tratadas antes de renderizar HTML.
- **Responsividade:** layout adaptado para desktop e dispositivos móveis com Bootstrap.

## Estrutura principal

```text
gestao-lab/
├── api/                   # Endpoint de configuração em tempo de execução
├── css/                   # Estilos da aplicação
├── js/
│   ├── data.js            # Serviços, consultas e transações do Firestore
│   ├── auth-guard.js      # Sessão e proteção de rotas
│   ├── utils.js           # Utilitários e constantes
│   └── *.js               # Módulos de cada página
├── firestore.rules        # Regras de acesso ao banco
├── firestore.indexes.json # Índices das consultas
├── firebase.json          # Configuração do Firebase
└── vercel.json            # Configuração de deploy na Vercel
```

## Executar e publicar regras

Para testar localmente, sirva a pasta por um servidor HTTP. Para publicar as regras e os índices do Firestore:

```powershell
cd "C:\Users\gabri\Documents\Github\Git - SENAI\gestao-lab"
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

As variáveis de ambiente necessárias para a Vercel estão listadas em `.env.example`.
