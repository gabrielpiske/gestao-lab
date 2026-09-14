# ⚡ LabTrack — Sistema de Gestão de Laboratório Didático

<p align="center">
  <img src="https://img.shields.io/badge/Versão-1.2-blue.svg" alt="Versão 1.2" />
  <img src="https://img.shields.io/badge/Front--End-HTML5%20%7C%20CSS3%20%7C%20JS%20ES6+-yellow.svg" alt="Stack" />
  <img src="https://img.shields.io/badge/UI-Bootstrap%205.3-7952b3.svg" alt="Bootstrap 5" />
  <img src="https://img.shields.io/badge/Back--End-Firebase%20Auth%20%2B%20Firestore-FFA611.svg" alt="Firebase" />
  <img src="https://img.shields.io/badge/Deploy-Vercel%20%7C%20Firebase%20Hosting-000000.svg" alt="Deploy" />
</p>

O **LabTrack** é uma aplicação web moderna e eficiente para o gerenciamento de componentes eletrônicos, placas de desenvolvimento (Arduino, ESP32, Raspberry Pi Pico) e ferramentas em laboratórios didáticos de cursos técnicos e de engenharia (como SENAI e universidades).

Projetado sob uma arquitetura leve e direta: **sem etapa de build, sem frameworks pesados e sem servidor próprio** — apenas JavaScript modular nativo (ES Modules), Bootstrap 5 via CDN, Cloud Firestore para persistência de dados em tempo real e Firebase Authentication para controle de acesso.

---

## 🧭 Índice

- [Por que essa arquitetura?](#-por-que-essa-arquitetura)
- [Funcionalidades Principais](#-funcionalidades-principais)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Modelo de Dados (Cloud Firestore)](#-modelo-de-dados-cloud-firestore)
- [Controle de Acesso e Papéis (RBAC)](#-controle-de-acesso-e-papéis-rbac)
- [Guia de Instalação e Configuração Local](#-guia-de-instalação-e-configuração-local)
- [Deploy em Produção (Vercel & Firebase Hosting)](#-deploy-em-produção)
- [Como Criar o Primeiro Administrador](#-como-criar-o-primeiro-administrador)
- [Licença e Autoria](#-licença-e-autoria)

---

## 💡 Por que essa arquitetura?

- **Zero Build Step:** Não exige Node.js, Webpack, Vite ou npm install para rodar a aplicação. Qualquer servidor HTTP estático serve o projeto instantaneamente.
- **Segurança no Banco de Dados:** A autorização por papel roda diretamente no Firestore através de regras declarativas (`firestore.rules`), impedindo acessos indevidos mesmo com chamadas diretas de API no cliente.
- **Transações Atômicas:** Entradas/saídas de estoque e fluxos de empréstimo utilizam `runTransaction` no Firestore, garantindo consistência estrita contra acessos concorrentes.
- **Deploy Universal:** Pronto para hospedagem estática direta tanto na **Vercel** quanto no **Firebase Hosting**.

---

## ✨ Funcionalidades Principais

### 1. 🔌 Microcontroladores e Placas de Desenvolvimento
- Seção dedicada para controle de Arduinos, ESP32, ESP8266, Raspberry Pi Pico, ARM/STM32, PIC, etc.
- Atributos técnicos especializados: Família/Arquitetura, Conectividade (USB, Wi-Fi, Bluetooth, LoRa), Tensão de operação, Patrimônio/Kit e Localização.
- Fluxo de empréstimo e devolução em 1 clique com registro de data prevista e responsável.

### 2. 🧩 Tipos de Componentes Dinâmicos e Cadastro Flexível
- Criação de novos tipos de componentes (ex.: Resistor, Capacitor, Circuito Integrado, Sensor) diretamente pela UI (`admin-types.html`).
- Adição dinâmica de atributos customizados por tipo (Texto, Número, Seleção de Lista de Valores, Booleano, Unidades de Medida).
- Formulário inteligente (`component-form.html`) gerado dinamicamente com base no tipo escolhido.

### 3. 📦 Estoque e Auditoria Imutável
- Quantidade em estoque manipulada exclusivamente via registro de movimentações (Compra, Aula Prática, Descarte, Ajuste de Inventário).
- Cálculo automático de **Estoque Crítico** (`quantity <= minQuantity`).
- Trilha de auditoria imutável (`stockMovements`) registrando autor, data, motivo e observações.

### 4. 🛠️ Equipamentos e Ferramentas
- Cadastro com patrimônio, fabricante, modelo, número de série e estado de conservação (Novo, Bom, Desgastado, Danificado).
- Empréstimo e devolução ágeis com identificação imediata do responsável.

### 5. 📊 Dashboard e Busca Global
- Contadores em tempo real de estoque crítico, microcontroladores e ferramentas emprestadas, total de componentes e movimentações dos últimos 7 dias.
- Busca unificada no topo da aplicação com normalização de acentos e *debounce* para digitação suave.

### 6. 👤 Gestão de Usuários e Permissões
- Papéis definidos: `ADMIN`, `DOCENTE`, `ALUNO`, `VISITANTE`.
- Painel administrativo (`admin-users.html`) com ativação/desativação e criação direta de usuários com instâncias seguras (`secondaryAuth`).

### 7. 🌓 Dark / Light Mode Nativo
- Alternância rápida com persistência no `localStorage` e renderização suave com Bootstrap 5.

---

## 📂 Estrutura do Projeto

```text
gestao-lab/
├── index.html                # Painel principal / Dashboard com indicadores
├── login.html                # Tela de autenticação por e-mail e senha
├── register.html             # Cadastro público inicial (papel padrão: Visitante)
├── components.html           # Listagem e filtros do inventário de componentes
├── component-form.html       # Criação/edição dinâmica de componentes e histórico de estoque
├── microcontrollers.html     # Gestão dedicada e empréstimo de microcontroladores/placas
├── tools.html                # Gestão e empréstimo de ferramentas e instrumentos
├── movements.html            # Trilha completa de auditoria de movimentações de estoque
├── search.html               # Resultados da busca global
├── admin-types.html          # Administração de tipos de componentes e atributos
├── admin-users.html          # Gestão e promoção de usuários e papéis
├── firebase.json             # Configuração do Firebase Hosting e Firestore
├── firestore.rules           # Regras de segurança e autorização (RBAC) do Firestore
├── firestore.indexes.json    # Índices compostos para consultas e ordenações
├── vercel.json               # Configuração de rotas limpas e headers para Vercel
├── .gitignore                # Arquivos ignorados pelo Git
├── api/
│   └── firebase-config.js    # Endpoint Vercel que lê variáveis de ambiente
├── .env.example              # Nomes das variáveis exigidas (sem valores)
├── css/
│   └── styles.css            # Estilos personalizados, variáveis de tema e layout
└── js/
    ├── firebase-config.js    # Inicialização do Firebase sem valores versionados
    ├── auth-guard.js         # Guarda de rotas, verificação de sessão e perfil
    ├── data.js               # Camada centralizada de acesso e transações do Firestore
    ├── nav.js                # Renderização da sidebar, topbar e limpeza de modais
    ├── utils.js              # Helpers de formatação, debounce, escape de HTML e constantes
    ├── dashboard.js          # Lógica do painel de controle
    ├── components.js         # Lógica da listagem de componentes
    ├── component-form.js     # Lógica do formulário dinâmico de componentes
    ├── microcontrollers.js   # Lógica do módulo de microcontroladores
    ├── tools.js              # Lógica do módulo de ferramentas
    ├── movements.js          # Lógica da página de movimentações
    ├── search.js             # Lógica da busca global
    ├── admin-types.js        # Lógica de criação de tipos e atributos dinâmicos
    └── admin-users.js        # Lógica da administração de usuários
```

---

## 🗄️ Modelo de Dados (Cloud Firestore)

| Coleção | Propósito | Estrutura Principal |
| :--- | :--- | :--- |
| `componentTypes/{id}` | Definição dos tipos e esquemas de atributos | `name, description, attributes: [{ id, name, dataType, unit, required, options: [...] }]` |
| `components/{id}` | Componentes em estoque | `componentTypeId, componentTypeName, quantity, minQuantity, critical, location, attributes: { attrId: value }` |
| `stockMovements/{id}` | Trilha imutável de movimentação | `componentId, type (ENTRADA/SAIDA), reason, quantity, userId, userName, occurredAt` |
| `microcontrollers/{id}`| Placas e microcontroladores | `name, family, connectivity, voltage, patrimonio, condition, status, currentLoan: { userId, userName, borrowedAt, expectedReturnAt }` |
| `microcontrollerLoans/{id}` | Histórico de empréstimos de placas | `microcontrollerId, userId, userName, borrowedAt, expectedReturnAt, returnedAt, notes` |
| `tools/{id}` | Ferramentas e equipamentos | `name, patrimonio, condition, status, currentLoan: { userId, userName, borrowedAt, expectedReturnAt }` |
| `toolLoans/{id}` | Histórico de empréstimos de ferramentas | `toolId, userId, userName, borrowedAt, expectedReturnAt, returnedAt, notes` |
| `users/{uid}` | Perfil e autorização do usuário | `name, email, role (ADMIN / DOCENTE / ALUNO / VISITANTE), active (boolean), createdAt` |

---

## 🛡️ Controle de Acesso e Papéis (RBAC)

| Papel | Permissões |
| :--- | :--- |
| **`ADMIN`** | Acesso irrestrito a todo o sistema, promoção de papéis, ativação/desativação de contas e criação de tipos de componentes. |
| **`DOCENTE`** | Cadastro/edição de componentes, registro de movimentações de estoque, cadastro e empréstimo de ferramentas e microcontroladores. |
| **`ALUNO`** | Consulta de inventário, disponibilidade de placas/ferramentas e histórico de movimentações. |
| **`VISITANTE`** | Acesso somente leitura ao catálogo e disponibilidade do laboratório (papel inicial de todo novo cadastro). |

---

## 🚀 Guia de Instalação e Configuração Local

### 1. Clonar o Repositório
```bash
git clone https://github.com/gabrielpiske/gestao-lab.git
cd gestao-lab
```

### 2. Configurar o Firebase e as variáveis de ambiente
1. Acesse o [Firebase Console](https://console.firebase.google.com/) e crie um novo projeto.
2. Em **Build > Authentication**, ative o provedor **Email/senha**.
3. Em **Build > Firestore Database**, crie o banco de dados em **Modo Produção**.
4. Em **Configurações do Projeto > Seus apps**, adicione um App Web e copie as credenciais.
5. Para desenvolvimento local com `vercel dev`, copie `.env.example` para `.env.local` e preencha os valores. Nunca versione esse arquivo.

> A configuração de um app Web Firebase (inclusive `apiKey`) é entregue ao navegador pelo próprio SDK e não é um segredo de servidor. Ela foi retirada do Git para evitar exposição desnecessária no código-fonte. A proteção real vem das regras do Firestore, do Firebase Authentication e das restrições da chave no Google Cloud.

### 3. Publicar Regras de Segurança e Índices
Com a [Firebase CLI](https://firebase.google.com/docs/cli) instalada:
```bash
npm install -g firebase-tools
firebase login
firebase use --add  # Selecione o seu projeto Firebase criado
firebase deploy --only firestore:rules,firestore:indexes
```

### 4. Executar Localmente
Como o projeto utiliza ES Modules nativos (`import`/`export`), utilize qualquer servidor HTTP local:
```bash
# Opção 1: Via Node.js (npx)
npx serve .

# Opção 2: Via Python 3
python -m http.server 8000
```
Acesse `http://localhost:8000` (ou a porta informada).

---

## 🌐 Deploy em Produção

### Deploy na Vercel
O projeto já está configurado para deploy na raiz da Vercel. Antes do primeiro deploy, em **Project Settings > Environment Variables**, cadastre as variáveis abaixo para os ambientes **Production**, **Preview** e **Development**:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
FIREBASE_MEASUREMENT_ID   # opcional
```

Use os valores do objeto de configuração do seu app Web no Firebase. A Vercel entrega esses valores em tempo de execução por `/api/firebase-config`; nenhum valor de produção deve ser adicionado a arquivos Git.

1. Conecte o repositório na [Vercel](https://vercel.com).
2. O framework preset será detectado como **Other** (servidor estático).
3. O arquivo [`vercel.json`](./vercel.json) já aplica rotas limpas e cabeçalhos de segurança automaticamente.
4. Clique em **Deploy**.

### Deploy no Firebase Hosting
O fluxo de configuração acima usa uma Function da Vercel e, portanto, o deploy recomendado é pela Vercel. Para Firebase Hosting, implemente um endpoint equivalente no Cloud Functions/Cloud Run antes de publicar; não recoloque a configuração de produção em `js/firebase-config.js`.

Para publicar apenas regras e índices do Firestore:
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 👑 Como Criar o Primeiro Administrador

Por segurança, todo novo cadastro público via tela de registro (`register.html`) recebe o papel `VISITANTE`. Para promover sua conta ao primeiro `ADMIN`:

1. Cadastre-se normalmente na tela de registro do sistema.
2. No [Firebase Console](https://console.firebase.google.com/), acesse **Firestore Database > coleção `users`**.
3. Localize o documento correspondente ao seu UID de usuário.
4. Altere o valor do campo `role` de `"VISITANTE"` para `"ADMIN"` e salve.
5. Recarregue a página da aplicação. O menu **Administração** estará liberado e você poderá gerenciar e promover novos usuários diretamente pela interface.

---

## 👨‍🏫 Autoria e Contribuições

- **Autor:** Gabriel Piske
- **Instituição:** SENAI
- **Propósito:** Gestão de laboratórios didáticos, automação e controle educacional.

Contribuições, sugestões e melhorias são sempre bem-vindas! Sinta-se à vontade para abrir uma *Issue* ou enviar um *Pull Request*.
