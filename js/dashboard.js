// js/dashboard.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import { dashboardSummary, listCriticalComponents, listRecentMovements } from "./data.js";
import { escapeHtml, timeAgo, STOCK_MOVEMENT_REASONS } from "./utils.js";

const user = await requireAuth();
renderLayout(user, "dashboard");

loadSummary();
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
