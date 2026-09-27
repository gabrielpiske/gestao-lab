// js/nav.js
import { logout } from "./auth-guard.js";
import { escapeHtml, formatDate, showSuccess, showError } from "./utils.js";
import { getMyActiveLoans, returnLoan, returnMicrocontrollerLoan, returnKitLoan } from "./data.js";

const NAV_ITEMS = [
  { key: "dashboard", href: "index.html", label: "Dashboard", icon: "bi-speedometer2" },
  { key: "kits", href: "kits.html", label: "Kits de Aulas", icon: "bi-box-seam-fill" },
  { key: "components", href: "components.html", label: "Componentes", icon: "bi-cpu" },
  { key: "microcontrollers", href: "microcontrollers.html", label: "Microcontroladores", icon: "bi-motherboard" },
  { key: "tools", href: "tools.html", label: "Equipamentos e Ferramentas", icon: "bi-tools" },
  { key: "movements", href: "movements.html", label: "Movimentações", icon: "bi-clock-history" },
];

const ADMIN_ITEM = { key: "admin", href: "admin-types.html", label: "Administração", icon: "bi-gear" };

/**
 * Monta a casca da aplicação (sidebar + topbar) dentro do elemento #app-shell
 * e move o conteúdo original da página para dentro de <main>.
 */
export function renderLayout(user, activePageKey) {
  const shell = document.getElementById("app-shell");
  if (!shell) return;

  const existingContent = shell.innerHTML;

  const navLinks = NAV_ITEMS.map(
    (item) => `
      <a href="${item.href}" class="nav-link ${item.key === activePageKey ? "active" : ""}">
        <i class="bi ${item.icon}"></i> ${item.label}
      </a>`
  ).join("");

  const adminLink =
    user.role === "ADMIN"
      ? `<a href="${ADMIN_ITEM.href}" class="nav-link ${
          ["admin", "admin-users", "admin-history"].includes(activePageKey) ? "active" : ""
        }"><i class="bi ${ADMIN_ITEM.icon}"></i> ${ADMIN_ITEM.label}</a>`
      : "";

  shell.innerHTML = `
    <div class="d-flex vh-100">
      <aside class="labtrack-sidebar d-flex flex-column p-3">
        <!-- Cabeçalho Superior da Sidebar -->
        <div class="px-1 pb-3 mb-2 border-bottom">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-cpu-fill text-primary fs-4"></i>
              <span class="fw-bold fs-5 tracking-wide">LabTrack</span>
            </div>
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill" style="font-size: 0.65rem;">v1.9</span>
          </div>
          <div class="mt-2 ps-1">
            <p class="small fw-semibold mb-0 text-body" style="font-size: 0.85rem;">Gabriel Piske</p>
            <p class="text-body-secondary mb-0" style="font-size: 0.75rem;"><i class="bi bi-mortarboard-fill me-1"></i>Docente SENAI</p>
          </div>
        </div>

        <nav class="nav flex-column gap-1 flex-grow-1">
          ${navLinks}
          ${adminLink}
        </nav>

        <!-- Rodapé do Usuário Logado -->
        <div class="border-top pt-3 mt-3">
          <p class="small text-body-secondary mb-1 px-1">${escapeHtml(user.name)}</p>
          <p class="small text-body-secondary mb-2 px-1">${roleLabel(user.role)}</p>
          <button id="logout-btn" class="btn btn-sm btn-outline-secondary w-100">
            <i class="bi bi-box-arrow-right"></i> Sair
          </button>
        </div>
      </aside>

      <div class="flex-grow-1 d-flex flex-column overflow-hidden">
        <header class="labtrack-topbar d-flex align-items-center px-3 gap-3">
          <form id="global-search-form" class="flex-grow-1" style="max-width: 420px;">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-transparent border-end-0"><i class="bi bi-search"></i></span>
              <input
                id="global-search-input"
                type="search"
                class="form-control border-start-0"
                placeholder="Buscar: resistor 10k, led vermelho, multímetro..."
              />
            </div>
          </form>

          <!-- Botão Meus Empréstimos -->
          <button id="my-loans-btn" class="btn btn-sm btn-outline-primary ms-auto d-flex align-items-center gap-2" title="Ver meus itens emprestados">
            <i class="bi bi-person-workspace"></i>
            <span class="d-none d-sm-inline">Meus Empréstimos</span>
            <span id="my-loans-badge" class="badge bg-primary rounded-pill d-none" style="font-size: 0.7rem;">0</span>
          </button>

          <button id="theme-toggle-btn" class="btn btn-sm btn-outline-secondary" title="Alternar tema">
            <i class="bi bi-moon-stars"></i>
          </button>
        </header>

        <main class="flex-grow-1 overflow-auto p-4">
          ${existingContent}
        </main>
      </div>
    </div>

    <!-- Modal Global: Meus Empréstimos -->
    <div class="modal fade" id="my-loans-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title h6 d-flex align-items-center gap-2">
              <i class="bi bi-person-workspace text-primary"></i>
              Meus Itens Emprestados
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body small" id="my-loans-body">
            <div class="d-flex align-items-center gap-2 py-3">
              <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
              <span>Carregando seus empréstimos...</span>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("logout-btn").addEventListener("click", logout);

  document.getElementById("global-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("global-search-input").value.trim();
    if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
  });

  const themeBtn = document.getElementById("theme-toggle-btn");
  themeBtn.addEventListener("click", toggleTheme);
  updateThemeIcon(themeBtn);

  // Inicializar Meus Empréstimos
  setupMyLoans(user);
}

function roleLabel(role) {
  return { ADMIN: "Administrador", DOCENTE: "Docente", VISITANTE: "Visitante", ALUNO: "Aluno" }[role] || role;
}

export function applyStoredTheme() {
  const stored = localStorage.getItem("labtrack_theme") || "dark";
  document.documentElement.setAttribute("data-bs-theme", stored);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-bs-theme", current);
  localStorage.setItem("labtrack_theme", current);
  updateThemeIcon(document.getElementById("theme-toggle-btn"));
}

function updateThemeIcon(btn) {
  if (!btn) return;
  const isDark = document.documentElement.getAttribute("data-bs-theme") === "dark";
  btn.innerHTML = isDark ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
}

/**
 * Carrega e controla o modal e badge de "Meus Empréstimos"
 */
async function setupMyLoans(user) {
  const myLoansBtn = document.getElementById("my-loans-btn");
  const myLoansBadge = document.getElementById("my-loans-badge");
  const myLoansBody = document.getElementById("my-loans-body");
  const modalEl = document.getElementById("my-loans-modal");

  let modalInstance = null;
  if (modalEl && window.bootstrap?.Modal) {
    modalInstance = new bootstrap.Modal(modalEl);
  }

  async function refreshLoansList() {
    try {
      const items = await getMyActiveLoans(user.uid);
      const count = items.length;

      if (count > 0) {
        myLoansBadge.textContent = count;
        myLoansBadge.classList.remove("d-none");
        const hasOverdue = items.some((i) => i.isOverdue);
        myLoansBadge.className = `badge rounded-pill ${hasOverdue ? "bg-danger" : "bg-primary"}`;
      } else {
        myLoansBadge.classList.add("d-none");
      }

      if (!myLoansBody) return;

      if (count === 0) {
        myLoansBody.innerHTML = `
          <div class="text-center py-4 text-body-secondary">
            <i class="bi bi-check2-circle fs-3 text-success d-block mb-2"></i>
            <p class="mb-0 fw-medium">Você não possui nenhum equipamento ou placa emprestada no momento.</p>
          </div>`;
        return;
      }

      myLoansBody.innerHTML = `
        <p class="text-body-secondary mb-3">Você possui <strong>${count}</strong> item(ns) sob sua responsabilidade:</p>
        <div class="list-group gap-2">
          ${items
            .map(
              (item) => `
            <div class="list-group-item d-flex justify-content-between align-items-center p-3 rounded-3 border">
              <div>
                <div class="d-flex align-items-center gap-2 mb-1">
                  <i class="bi ${item.icon} text-primary"></i>
                  <span class="fw-semibold">${escapeHtml(item.name)}</span>
                  <span class="badge bg-secondary-subtle text-body border" style="font-size: 0.7rem;">${escapeHtml(item.typeLabel)}</span>
                </div>
                ${item.details ? `<div class="text-body-secondary small mb-1">${escapeHtml(item.details)}</div>` : ""}
                <div class="small">
                  ${
                    item.isOverdue
                      ? `<span class="text-danger fw-medium"><i class="bi bi-exclamation-octagon me-1"></i>Devolução atrasada! Prevista para ${formatDate(item.expectedReturnAt)}</span>`
                      : `<span class="text-body-secondary">Devolução prevista: ${formatDate(item.expectedReturnAt)}</span>`
                  }
                </div>
              </div>
              <div>
                <button
                  class="btn btn-sm btn-outline-primary return-my-loan-btn"
                  data-type="${item.type}"
                  data-id="${item.id}"
                  data-loan-id="${item.loanId}"
                  title="Devolver este item ao laboratório"
                >
                  <i class="bi bi-box-arrow-in-left me-1"></i> Devolver
                </button>
              </div>
            </div>`
            )
            .join("")}
        </div>`;

      myLoansBody.querySelectorAll(".return-my-loan-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const type = btn.dataset.type;
          const id = btn.dataset.id;
          const loanId = btn.dataset.loanId;

          btn.disabled = true;
          btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status"></span>`;

          try {
            if (type === "KIT") {
              await returnKitLoan(loanId);
            } else if (type === "TOOL") {
              await returnLoan(id, loanId);
            } else {
              await returnMicrocontrollerLoan(id, loanId);
            }
            showSuccess("Item/Kit devolvido com sucesso!");
            await refreshLoansList();
          } catch (err) {
            console.error(err);
            showError("Erro ao devolver item: " + err.message);
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-box-arrow-in-left me-1"></i> Devolver`;
          }
        });
      });
    } catch (err) {
      console.error("Erro ao carregar meus empréstimos:", err);
    }
  }

  if (myLoansBtn) {
    myLoansBtn.addEventListener("click", () => {
      refreshLoansList();
      modalInstance?.show();
    });
  }

  // Carregar contagem inicial em segundo plano
  refreshLoansList();
}

// Limpeza de segurança para garantir que nenhum backdrop de modal trave a interface
document.addEventListener("hidden.bs.modal", () => {
  const openModals = document.querySelectorAll(".modal.show");
  if (openModals.length === 0) {
    document.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("padding-right");
  }
});

