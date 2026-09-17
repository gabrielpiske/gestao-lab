// js/dashboard.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import { dashboardSummary, listCriticalComponents, listRecentMovements, listActiveAndOverdueLoans } from "./data.js";
import { escapeHtml, timeAgo, formatDate, STOCK_MOVEMENT_REASONS } from "./utils.js";

const user = await requireAuth();
renderLayout(user, "dashboard");

loadSummary();
loadActiveLoans();
loadCritical();
loadRecentMovements();

async function loadSummary() {
  try {
    const summary = await dashboardSummary();
    document.getElementById("stat-critical").textContent = summary.componentsCriticalCount;
    if (document.getElementById("stat-micro-borrowed")) {
      document.getElementById("stat-micro-borrowed").textContent =
        `${summary.microcontrollersBorrowedCount} de ${summary.microcontrollersTotalCount}`;
    }
    document.getElementById("stat-tools-borrowed").textContent =
      `${summary.toolsBorrowedCount} de ${summary.toolsTotalCount}`;
    document.getElementById("stat-components-total").textContent = summary.componentsTotalCount;
    document.getElementById("stat-movements-7d").textContent = summary.movementsLast7Days;
  } catch (err) {
    console.error(err);
  }
}

async function loadActiveLoans() {
  const container = document.getElementById("active-loans-list");
  const overdueAlertContainer = document.getElementById("overdue-alert-container");
  const overdueAlertTitle = document.getElementById("overdue-alert-title");
  const overdueAlertDesc = document.getElementById("overdue-alert-desc");
  const overdueAlertLink = document.getElementById("overdue-alert-link");

  try {
    const items = await listActiveAndOverdueLoans();
    const overdueItems = items.filter((i) => i.isOverdue);

    // 1. Alerta de atraso no topo
    if (overdueItems.length > 0) {
      overdueAlertContainer.classList.remove("d-none");
      overdueAlertTitle.textContent = `Atenção: ${overdueItems.length} item(ns) com devolução em atraso!`;
      const namesList = overdueItems.slice(0, 3).map((i) => `${i.name} (com ${i.userName})`).join(", ");
      overdueAlertDesc.textContent = `Itens vencidos: ${namesList}${overdueItems.length > 3 ? ` e mais ${overdueItems.length - 3}...` : ""}.`;
      if (user.role === "ADMIN") {
        overdueAlertLink.href = "admin-history.html";
        overdueAlertLink.innerHTML = `Ver na Auditoria <i class="bi bi-arrow-right ms-1"></i>`;
      } else {
        overdueAlertLink.href = "tools.html";
        overdueAlertLink.innerHTML = `Ver Equipamentos <i class="bi bi-arrow-right ms-1"></i>`;
      }
    } else {
      overdueAlertContainer.classList.add("d-none");
    }

    // 2. Card de Empréstimos em Aberto
    if (items.length === 0) {
      container.innerHTML = `<p class="text-body-secondary small mb-0">Nenhum equipamento emprestado no momento.</p>`;
      return;
    }

    container.innerHTML = items
      .slice(0, 8)
      .map(
        (i) => `
        <div class="d-flex justify-content-between align-items-center small border-bottom pb-2">
          <div>
            <div class="d-flex align-items-center gap-1">
              <i class="bi ${i.icon} text-primary"></i>
              <span class="fw-medium">${escapeHtml(i.name)}</span>
            </div>
            <div class="text-body-secondary" style="font-size: 0.75rem;">
              Com ${escapeHtml(i.userName)}
            </div>
          </div>
          <div class="text-end">
            ${
              i.isOverdue
                ? `<span class="badge text-bg-danger" style="font-size: 0.7rem;">Atrasado (${formatDate(i.expectedReturnAt)})</span>`
                : `<span class="badge text-bg-secondary" style="font-size: 0.7rem;">Previsto: ${formatDate(i.expectedReturnAt)}</span>`
            }
          </div>
        </div>`
      )
      .join("");
  } catch (err) {
    console.error("Erro ao carregar empréstimos no dashboard:", err);
    container.innerHTML = `<p class="text-danger small mb-0">Não foi possível carregar os empréstimos ativos.</p>`;
  }
}

async function loadCritical() {
  const container = document.getElementById("critical-list");
  try {
    const items = await listCriticalComponents(8);
    if (items.length === 0) {
      container.innerHTML = `<p class="text-body-secondary small mb-0">Nenhum item em estoque crítico.</p>`;
      return;
    }
    container.innerHTML = items
      .map(
        (c) => `
        <div class="d-flex justify-content-between small border-bottom pb-2">
          <span>${escapeHtml(c.componentTypeName)}${c.internalCode ? ` (${escapeHtml(c.internalCode)})` : ""}</span>
          <span class="text-danger">${c.quantity} / mín. ${c.minQuantity}</span>
        </div>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<p class="text-danger small mb-0">Não foi possível carregar o estoque crítico.</p>`;
  }
}

async function loadRecentMovements() {
  const container = document.getElementById("recent-movements-list");
  try {
    const reasonLabels = Object.fromEntries(STOCK_MOVEMENT_REASONS.map((r) => [r.value, r.label]));
    const items = await listRecentMovements(8);
    if (items.length === 0) {
      container.innerHTML = `<p class="text-body-secondary small mb-0">Nenhuma movimentação registrada ainda.</p>`;
      return;
    }
    container.innerHTML = items
      .map(
        (m) => `
        <div class="d-flex justify-content-between small border-bottom pb-2">
          <span>
            <i class="bi ${m.type === "ENTRADA" ? "bi-arrow-down-circle text-success" : "bi-arrow-up-circle text-danger"}"></i>
            ${escapeHtml(m.componentTypeName)} — ${m.quantity}un — ${escapeHtml(reasonLabels[m.reason] || m.reason)}
          </span>
          <span class="text-body-secondary">${timeAgo(m.occurredAt)}</span>
        </div>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<p class="text-danger small mb-0">Não foi possível carregar as movimentações.</p>`;
  }
}

