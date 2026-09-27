import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import { listComponents, listTools, listMicrocontrollers, listKits } from "./data.js";
import { escapeHtml, getQueryParam, TOOL_STATUS_LABELS, MICROCONTROLLER_STATUS_LABELS, MICROCONTROLLER_FAMILIES } from "./utils.js";

const user = await requireAuth();
renderLayout(user, "search");

const q = getQueryParam("q") || "";
document.getElementById("search-title").textContent = q ? `Resultados para "${q}"` : "Resultados da busca";

const kitsBox = document.getElementById("search-kits");
const componentsBox = document.getElementById("search-components");
const microcontrollersBox = document.getElementById("search-microcontrollers");
const toolsBox = document.getElementById("search-tools");

if (!q) {
  if (kitsBox) kitsBox.innerHTML = `<p class="text-body-secondary small mb-0">Digite algo na busca para começar.</p>`;
  componentsBox.innerHTML = `<p class="text-body-secondary small mb-0">Digite algo na busca para começar.</p>`;
  if (microcontrollersBox) microcontrollersBox.innerHTML = `<p class="text-body-secondary small mb-0">—</p>`;
  toolsBox.innerHTML = `<p class="text-body-secondary small mb-0">—</p>`;
} else {
  runSearch();
}

async function runSearch() {
  try {
    const kits = await listKits({ q });
    if (kitsBox) {
      kitsBox.innerHTML = kits.length
        ? kits
            .slice(0, 15)
            .map((k) => `
              <div class="d-flex justify-content-between align-items-center small border-bottom pb-2 mb-2">
                <div>
                  <a href="kits.html" class="text-decoration-none fw-medium">${escapeHtml(k.name)}</a>
                  ${k.targetClass ? `<span class="badge bg-secondary-subtle text-body border ms-2">${escapeHtml(k.targetClass)}</span>` : ""}
                </div>
                <span class="text-body-secondary">${k.items ? k.items.length : 0} item(ns)</span>
              </div>`)
            .join("")
        : `<p class="text-body-secondary small mb-0">Nenhum kit de aula encontrado.</p>`;
    }
  } catch (err) {
    if (kitsBox) kitsBox.innerHTML = `<p class="text-danger small mb-0">Erro ao buscar kits de aula.</p>`;
  }

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
    const micros = await listMicrocontrollers({ q });
    if (microcontrollersBox) {
      microcontrollersBox.innerHTML = micros.length
        ? micros
            .slice(0, 15)
            .map((m) => {
              const statusInfo = MICROCONTROLLER_STATUS_LABELS[m.status] || { label: m.status, badge: "secondary" };
              const familyLabel = MICROCONTROLLER_FAMILIES.find((f) => f.value === m.family)?.label || m.family || "";
              return `
                <div class="d-flex justify-content-between align-items-center small border-bottom pb-2 mb-2">
                  <div>
                    <a href="microcontrollers.html" class="text-decoration-none fw-medium">${escapeHtml(m.name)}</a>
                    <span class="text-body-secondary ms-2">(${escapeHtml(familyLabel)})</span>
                  </div>
                  <span class="badge text-bg-${statusInfo.badge}">${statusInfo.label}</span>
                </div>`;
            })
            .join("")
        : `<p class="text-body-secondary small mb-0">Nenhum microcontrolador encontrado.</p>`;
    }
  } catch (err) {
    if (microcontrollersBox) microcontrollersBox.innerHTML = `<p class="text-danger small mb-0">Erro ao buscar microcontroladores.</p>`;
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
