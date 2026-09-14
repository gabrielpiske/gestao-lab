// js/components.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import { listComponents, listComponentTypes } from "./data.js";
import { escapeHtml, debounce } from "./utils.js";

const user = await requireAuth();
renderLayout(user, "components");

if (["ADMIN", "DOCENTE"].includes(user.role)) {
  document.getElementById("new-component-link").classList.remove("d-none");
}

const searchInput = document.getElementById("filter-search");
const typeSelect = document.getElementById("filter-type");
const availabilitySelect = document.getElementById("filter-availability");
const tbody = document.getElementById("components-tbody");

await loadTypeOptions();
await loadComponents();

searchInput.addEventListener("input", debounce(loadComponents, 250));
typeSelect.addEventListener("change", loadComponents);
availabilitySelect.addEventListener("change", loadComponents);

async function loadTypeOptions() {
  try {
    const types = await listComponentTypes();
    typeSelect.insertAdjacentHTML(
      "beforeend",
      types.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")
    );
  } catch (err) {
    console.error(err);
  }
}

async function loadComponents() {
  tbody.innerHTML = `<tr><td class="ps-3 py-3 text-body-secondary small" colspan="5">Carregando...</td></tr>`;
  try {
    const items = await listComponents({
      typeId: typeSelect.value || undefined,
      availability: availabilitySelect.value || undefined,
      q: searchInput.value.trim() || undefined,
    });

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td class="ps-3 py-3 text-body-secondary small" colspan="5">Nenhum componente encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map(
        (c) => `
        <tr class="lt-clickable-row" onclick="window.location.href='component-form.html?id=${c.id}'">
          <td class="ps-3">${escapeHtml(c.componentTypeName)}</td>
          <td class="text-body-secondary">${escapeHtml(c.internalCode) || "—"}</td>
          <td class="${c.critical ? "text-danger fw-semibold" : ""}">${c.quantity}</td>
          <td class="text-body-secondary">${escapeHtml(c.location) || "—"}</td>
          <td class="text-body-secondary">${escapeHtml(c.manufacturer) || "—"}</td>
        </tr>`
      )
      .join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td class="ps-3 py-3 text-danger small" colspan="5">Erro ao carregar componentes: ${escapeHtml(err.message)}</td></tr>`;
  }
}
