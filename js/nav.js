// js/nav.js
import { logout } from "./auth-guard.js";
import { escapeHtml } from "./utils.js";

const NAV_ITEMS = [
  { key: "dashboard", href: "index.html", label: "Dashboard", icon: "bi-speedometer2" },
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
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill" style="font-size: 0.65rem;">v1.2</span>
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
          <button id="theme-toggle-btn" class="btn btn-sm btn-outline-secondary ms-auto" title="Alternar tema">
            <i class="bi bi-moon-stars"></i>
          </button>
        </header>

        <main class="flex-grow-1 overflow-auto p-4">
          ${existingContent}
        </main>
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