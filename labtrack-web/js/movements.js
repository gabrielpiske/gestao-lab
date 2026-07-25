// js/movements.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import { listRecentMovements } from "./data.js";
import { escapeHtml, formatDateTime, STOCK_MOVEMENT_REASONS } from "./utils.js";

const user = await requireAuth();
renderLayout(user, "movements");

const reasonLabels = Object.fromEntries(STOCK_MOVEMENT_REASONS.map((r) => [r.value, r.label]));
const tbody = document.getElementById("movements-tbody");

try {
  const movements = await listRecentMovements(100);
  if (movements.length === 0) {
    tbody.innerHTML = `<tr><td class="ps-3 py-3 text-body-secondary small" colspan="6">Nenhuma movimentação registrada ainda.</td></tr>`;
  } else {
    tbody.innerHTML = movements
      .map(
        (m) => `
        <tr>
          <td class="ps-3">${escapeHtml(m.componentTypeName)}${m.componentInternalCode ? ` (${escapeHtml(m.componentInternalCode)})` : ""}</td>
          <td>
            <span class="badge text-bg-${m.type === "ENTRADA" ? "success" : "danger"}">
              ${m.type === "ENTRADA" ? "Entrada" : "Saída"}
            </span>
          </td>
          <td class="text-body-secondary">${escapeHtml(reasonLabels[m.reason] || m.reason)}</td>
          <td>${m.quantity}</td>
          <td class="text-body-secondary">${escapeHtml(m.userName)}</td>
          <td class="pe-3 text-body-secondary">${formatDateTime(m.occurredAt)}</td>
        </tr>`
      )
      .join("");
  }
} catch (err) {
  console.error(err);
  tbody.innerHTML = `<tr><td class="ps-3 py-3 text-danger small" colspan="6">Erro ao carregar movimentações.</td></tr>`;
}
