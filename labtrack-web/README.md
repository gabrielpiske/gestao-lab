# LabTrack — versão HTML/CSS/JS + Bootstrap + Firebase

Sistema de gestão de componentes eletrônicos e ferramentas de laboratório didático, em arquitetura simples: **sem
build, sem framework, sem servidor próprio** — apenas HTML/CSS/JavaScript puro (módulos ES nativos), Bootstrap 5 via
CDN e Firebase (Authentication + Firestore) como back-end.

## Por que essa arquitetura

- **Zero build step**: não precisa de Node, webpack, npm install para rodar. Abra os arquivos num servidor estático e funciona.
- **Firebase Authentication** cuida de login/senha, tokens, sessão.
- **Firestore** é o banco de dados (NoSQL, documentos), com regras de segurança (`firestore.rules`) controlando quem pode ler/escrever cada coleção — a "autorização por papel" roda no próprio banco, não depende de um servidor de aplicação.
- **Bootstrap 5 + Bootstrap Icons** via CDN cuidam da UI, com um `css/styles.css` pequeno por cima para o visual mais limpo (dark mode, sidebar).

Trocas conscientes em relação a uma arquitetura com backend próprio: buscas textuais e agregações do dashboard são
feitas no navegador (client-side), o que é perfeitamente adequado para o volume de dados de um laboratório didático
(centenas a poucos milhares de itens), mas não escalaria para milhões de registros.

## Passo a passo para colocar no ar

### 1. Criar o projeto no Firebase
1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um projeto novo.
2. Em **Build > Authentication**, ative o provedor **Email/senha**.
3. Em **Build > Firestore Database**, crie o banco (modo produção).
4. Em **Configurações do projeto > Seus apps**, crie um app Web e copie o objeto `firebaseConfig`.

### 2. Configurar o código
Abra `js/firebase-config.js` e substitua o objeto `firebaseConfig` pelos dados do seu projeto.

### 3. Publicar as regras de segurança e os índices
Com a [Firebase CLI](https://firebase.google.com/docs/cli) instalada:
```bash
npm install -g firebase-tools
firebase login
firebase use --add        # selecione o projeto criado no passo 1
firebase deploy --only firestore:rules,firestore:indexes
```

> Sem isso, o Firestore roda com as regras padrão (tudo bloqueado ou tudo liberado, dependendo do modo escolhido) — **as regras deste repositório são o que de fato aplica o controle ADMIN / DOCENTE / VISITANTE**, então não pule este passo.

### 4. Rodar localmente
Como o projeto usa módulos ES (`import`/`export`), os arquivos precisam ser servidos por HTTP (abrir o `.html` direto com `file://` não funciona). Qualquer servidor estático resolve:
```bash
npx serve .
# ou
python3 -m http.server 8000
```
Acesse `http://localhost:3000` (ou porta equivalente).

### 5. Criar o primeiro administrador (passo manual único)
Por segurança, o cadastro público (`register.html`) **sempre** cria contas com papel `VISITANTE` — ninguém consegue
virar administrador sozinho pela tela. Para criar o primeiro admin:
1. Cadastre-se normalmente pela tela de login (`register.html`).
2. No Firebase Console, vá em **Firestore Database > coleção `users`**, abra o documento com o seu UID.
3. Edite o campo `role` de `VISITANTE` para `ADMIN` e salve.
4. Atualize a página do sistema — você já terá acesso ao menu **Administração**, de onde pode promover os próximos usuários normalmente.

### 6. Deploy em produção (Firebase Hosting)
```bash
firebase deploy --only hosting
```
A URL pública aparece no final do comando (algo como `https://seu-projeto.web.app`).

## Estrutura do projeto

```
labtrack-web/
├── firebase.json            # configuração do Hosting/Firestore para a Firebase CLI
├── firestore.rules          # regras de segurança (autorização por papel)
├── firestore.indexes.json   # índices compostos exigidos pelas consultas com filtro + ordenação
├── login.html / register.html
├── index.html                # dashboard
├── components.html / component-form.html
├── tools.html
├── movements.html
├── search.html
├── admin-types.html          # criação de tipos de componente e atributos dinâmicos
├── admin-users.html          # gestão de usuários e papéis
├── css/styles.css
└── js/
    ├── firebase-config.js    # inicialização do Firebase (troque pelas suas chaves)
    ├── auth-guard.js         # proteção de rotas + carregamento do perfil do usuário
    ├── data.js                # TODA a lógica de acesso ao Firestore fica centralizada aqui
    ├── nav.js                 # sidebar/topbar compartilhados
    ├── utils.js                # formatação, toasts, debounce etc.
    └── *.js                    # um arquivo de lógica por página
```

## Modelo de dados (Firestore)

Diferente de um banco relacional, o Firestore é orientado a documentos. As principais decisões de modelagem:

- **`componentTypes/{id}`**: cada tipo (Resistor, LED, etc.) guarda seus **atributos e as opções de cada atributo
  embutidos no próprio documento** (array `attributes: [{ id, name, dataType, unit, required, options: [...] }]`).
  Isso evita sub-coleções e mantém a leitura de um tipo inteiro em uma única consulta — perfeitamente dentro do
  limite de 1MB por documento do Firestore para o volume de atributos que um tipo de componente teria.
- **`components/{id}`**: os valores de atributo ficam num mapa `attributes: { attributeId: valor }`. Um campo
  `critical` (booleano) é recalculado a cada gravação (`quantity <= minQuantity`) porque o Firestore **não permite
  comparar dois campos entre si numa consulta** — esse é o motivo prático de guardar o booleano já calculado.
- **`stockMovements/{id}`** e **`toolLoans/{id}`**: coleções de auditoria, imutáveis após criadas (as regras
  bloqueiam `update`, exceto a devolução de empréstimo, que só altera `returnedAt`).
- **`tools/{id}`**: guarda um resumo do empréstimo ativo em `currentLoan` (desnormalizado) para não precisar de uma
  segunda consulta só para saber quem está com a ferramenta.
- **`users/{uid}`**: o documento usa o mesmo UID do Firebase Authentication como ID, então `users/{uid}` é sempre o
  perfil de quem está logado.

## O que está implementado

- Autenticação (login, auto-cadastro com papel padrão Visitante, logout)
- Tipos de componente com atributos e listas de valores 100% editáveis pela UI (`admin-types.html`) — o coração do requisito de "sem lista fixa de tipos"
- Cadastro de componente com formulário gerado dinamicamente a partir do tipo escolhido
- Estoque: registro de entrada/saída com atualização atômica da quantidade (via transação do Firestore) e histórico por componente
- Ferramentas: cadastro, empréstimo e devolução em um clique, com status visível para todos
- Dashboard com indicadores (estoque crítico, ferramentas emprestadas, últimas movimentações)
- Busca global (componentes + ferramentas)
- Administração de usuários (papéis ADMIN/DOCENTE/VISITANTE, ativar/desativar, criação direta pelo admin)
- Dark mode
- Regras de segurança do Firestore aplicando o controle de acesso por papel no próprio banco

## Limitações conhecidas / próximos passos

- Buscas e agregações (mais usados, gráfico de consumo) são feitas no navegador; para milhares de componentes isso
  ainda é rápido, mas para um volume muito maior valeria mover para Cloud Functions.
- Não há edição de ferramenta pela UI ainda (só criação) — seguir o mesmo padrão do `component-form.html`.
- Sem testes automatizados (não há framework de build neste projeto; dá para adicionar Playwright rodando contra os arquivos estáticos).
- Sem exportação de relatórios, QR Code, notificações — ver o backlog completo no documento de arquitetura original.
