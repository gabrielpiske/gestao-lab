// js/search.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import { listComponents, listTools } from "./data.js";
import { escapeHtml, getQueryParam, TOOL_STATUS_LABELS } from "./utils.js";

const user = await requireAuth();
renderLayout(user, "search");

const q = getQueryParam("q") || "";
document.getElementById("search-title").textContent = q ? `Resultados para "${q}"` : "Resultados da busca";

const componentsBox = document.getElementById("search-components");
const toolsBox = document.getElementById("search-tools");

if (!q) {
  componentsBox.innerHTML = `<p class="text-body-secondary small mb-0">Digite algo na busca para começar.</p>`;
  toolsBox.innerHTML = `<p class="text-body-secondary small mb-0">—</p>`;
} else {
  runSearch();
}

async function runSearch() {
  try {
    const components = await listComponents({ q });
    componentsBox.innerHTML = components.length
      ? components
          .slice(0, 15)
          .map(
            (c) => `
        <a href="component-form.html?id=${c.id}" class="d-flex justify-content-between small text-decoration-none border-bottom pb-2 mb-2 d-block">
          <span>${escapeHtml(c.componentTypeName)} ${c.internalCode ? `(${escapeHtml(c.internalCode)})` : ""}</span>
          <span class="text-body-secondary">${escapeHtml(c.location) || ""}</span>
        </a>`
          )
          .join("")
      : `<p class="text-body-secondary small mb-0">Nenhum componente encontrado.</p>`;
  } catch (err) {
    componentsBox.innerHTML = `<p class="text-danger small mb-0">Erro ao buscar componentes.</p>`;
  }

  try {
    const tools = await listTools({ q });
    toolsBox.innerHTML = tools.length
      ? tools
          .slice(0, 15)
          .map((t) => {
            const statusInfo = TOOL_STATUS_LABELS[t.status] || { label: t.status, badge: "secondary" };
            return `
              <div class="d-flex justify-content-between small border-bottom pb-2 mb-2">
                <span>${escapeHtml(t.name)}</span>
                <span class="badge text-bg-${statusInfo.badge}">${statusInfo.label}</span>
              </div>`;
          })
          .join("")
      : `<p class="text-body-secondary small mb-0">Nenhuma ferramenta encontrada.</p>`;
  } catch (err) {
    toolsBox.innerHTML = `<p class="text-danger small mb-0">Erro ao buscar ferramentas.</p>`;
  }
}
