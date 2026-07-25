// js/admin-types.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import {
  listComponentTypes,
  createComponentType,
  deleteComponentType,
  addAttribute,
  deleteAttribute,
  addOption,
  deleteOption,
} from "./data.js";
import { escapeHtml, showSuccess, showError } from "./utils.js";

const user = await requireAuth({ requireAdmin: true });
renderLayout(user, "admin");

const container = document.getElementById("types-accordion");
let expandedTypeId = null;

document.getElementById("new-type-form").addEventListener("submit", onCreateType);

await renderTypes();

async function renderTypes() {
  container.innerHTML = `<p class="text-body-secondary small">Carregando...</p>`;
  try {
    const types = await listComponentTypes();
    if (types.length === 0) {
      container.innerHTML = `<p class="text-body-secondary small">Nenhum tipo cadastrado ainda.</p>`;
      return;
    }
    container.innerHTML = types.map((t) => renderTypeCard(t)).join("");
    wireTypeCardEvents(types);
  } catch (err) {
    container.innerHTML = `<p class="text-danger small">Erro ao carregar tipos: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTypeCard(type) {
  const isExpanded = expandedTypeId === type.id;
  const attributes = [...type.attributes].sort((a, b) => a.sortOrder - b.sortOrder);

  return `
    <div class="lt-card p-3" data-type-id="${type.id}">
      <div class="d-flex justify-content-between align-items-center">
        <button class="btn btn-sm btn-link text-decoration-none p-0 text-start flex-grow-1 type-toggle" data-id="${type.id}">
          <span class="fw-medium">${escapeHtml(type.name)}</span>
          <span class="text-body-secondary small ms-2">${attributes.length} atributo(s)</span>
        </button>
        <button class="btn btn-sm btn-outline-danger delete-type-btn" data-id="${type.id}" title="Excluir tipo">
          <i class="bi bi-trash"></i>
        </button>
      </div>

      ${isExpanded ? renderAttributesPanel(type, attributes) : ""}
    </div>`;
}

function renderAttributesPanel(type, attributes) {
  return `
    <div class="border-top mt-3 pt-3">
      <div class="d-flex flex-column gap-2 mb-3">
        ${
          attributes.length
            ? attributes.map((attr) => renderAttributeRow(type.id, attr)).join("")
            : `<p class="text-body-secondary small mb-0">Nenhum atributo cadastrado ainda.</p>`
        }
      </div>

      <form class="row g-2 bg-body-tertiary p-2 rounded new-attribute-form" data-type-id="${type.id}">
        <div class="col-12 col-md-4">
          <input type="text" class="form-control form-control-sm attr-name" placeholder="Nome (ex.: Valor)" required>
        </div>
        <div class="col-6 col-md-3">
          <select class="form-select form-select-sm attr-datatype">
            <option value="SELECT">Lista de valores</option>
            <option value="TEXT">Texto livre</option>
            <option value="NUMBER">Número</option>
            <option value="BOOLEAN">Sim/Não</option>
          </select>
        </div>
        <div class="col-6 col-md-3">
          <input type="text" class="form-control form-control-sm attr-unit" placeholder="Unidade (ex.: Ω)">
        </div>
        <div class="col-8 col-md-1 d-flex align-items-center">
          <div class="form-check">
            <input type="checkbox" class="form-check-input attr-required" checked>
            <label class="form-check-label small">Obrig.</label>
          </div>
        </div>
        <div class="col-4 col-md-1">
          <button type="submit" class="btn btn-sm btn-primary w-100"><i class="bi bi-plus"></i></button>
        </div>
      </form>
    </div>`;
}

function renderAttributeRow(typeId, attr) {
  const options = [...attr.options].sort((a, b) => a.sortOrder - b.sortOrder);
  return `
    <div class="border rounded p-2">
      <div class="d-flex justify-content-between align-items-center">
        <span class="small">
          <strong>${escapeHtml(attr.name)}</strong>
          ${attr.unit ? `(${escapeHtml(attr.unit)})` : ""}
          <span class="text-body-secondary ms-1">${attr.dataType}${attr.required ? " · obrigatório" : ""}</span>
        </span>
        <button class="btn btn-sm btn-outline-danger delete-attribute-btn" data-type-id="${typeId}" data-attr-id="${attr.id}" title="Excluir atributo">
          <i class="bi bi-trash"></i>
        </button>
      </div>

      ${attr.dataType === "SELECT" ? renderOptionsEditor(typeId, attr, options) : ""}
    </div>`;
}

function renderOptionsEditor(typeId, attr, options) {
  return `
    <div class="mt-2 ps-2 border-start">
      <div class="d-flex flex-wrap gap-1 mb-2">
        ${
          options.length
            ? options
                .map(
                  (o) => `
              <span class="badge text-bg-secondary d-inline-flex align-items-center gap-1">
                ${escapeHtml(o.label)}
                <i class="bi bi-x-lg delete-option-btn" role="button"
                   data-type-id="${typeId}" data-attr-id="${attr.id}" data-option-id="${o.id}"></i>
              </span>`
                )
                .join("")
            : `<span class="text-body-secondary small">Nenhuma opção cadastrada ainda.</span>`
        }
      </div>
      <form class="d-flex gap-1 new-option-form" data-type-id="${typeId}" data-attr-id="${attr.id}">
        <input type="text" class="form-control form-control-sm option-value" placeholder="Valor (ex.: 220)" required style="max-width: 140px;">
        <input type="text" class="form-control form-control-sm option-label" placeholder="Rótulo (ex.: 220 Ω)" required style="max-width: 160px;">
        <button type="submit" class="btn btn-sm btn-outline-primary">Adicionar</button>
      </form>
    </div>`;
}

function wireTypeCardEvents() {
  container.querySelectorAll(".type-toggle").forEach((btn) =>
    btn.addEventListener("click", () => {
      expandedTypeId = expandedTypeId === btn.dataset.id ? null : btn.dataset.id;
      renderTypes();
    })
  );

  container.querySelectorAll(".delete-type-btn").forEach((btn) =>
    btn.addEventListener("click", () => onDeleteType(btn.dataset.id))
  );

  container.querySelectorAll(".new-attribute-form").forEach((form) =>
    form.addEventListener("submit", (e) => onCreateAttribute(e, form))
  );

  container.querySelectorAll(".delete-attribute-btn").forEach((btn) =>
    btn.addEventListener("click", () => onDeleteAttribute(btn.dataset.typeId, btn.dataset.attrId))
  );

  container.querySelectorAll(".new-option-form").forEach((form) =>
    form.addEventListener("submit", (e) => onCreateOption(e, form))
  );

  container.querySelectorAll(".delete-option-btn").forEach((el) =>
    el.addEventListener("click", () => onDeleteOption(el.dataset.typeId, el.dataset.attrId, el.dataset.optionId))
  );
}

async function onCreateType(e) {
  e.preventDefault();
  const input = document.getElementById("new-type-name");
  const name = input.value.trim();
  if (!name) return;

  try {
    await createComponentType({ name }, user);
    input.value = "";
    showSuccess(`Tipo "${name}" criado.`);
    await renderTypes();
  } catch (err) {
    showError(err.message || "Não foi possível criar o tipo.");
  }
}

async function onDeleteType(typeId) {
  if (!confirm("Excluir este tipo de componente? Componentes já cadastrados com este tipo não serão afetados, mas o tipo não poderá mais ser selecionado.")) return;
  try {
    await deleteComponentType(typeId);
    showSuccess("Tipo excluído.");
    expandedTypeId = null;
    await renderTypes();
  } catch (err) {
    showError(err.message || "Não foi possível excluir o tipo.");
  }
}

async function onCreateAttribute(e, form) {
  e.preventDefault();
  const typeId = form.dataset.typeId;
  const name = form.querySelector(".attr-name").value.trim();
  const dataType = form.querySelector(".attr-datatype").value;
  const unit = form.querySelector(".attr-unit").value.trim();
  const required = form.querySelector(".attr-required").checked;
  if (!name) return;

  try {
    await addAttribute(typeId, { name, dataType, unit, required });
    showSuccess(`Atributo "${name}" adicionado.`);
    await renderTypes();
  } catch (err) {
    showError(err.message || "Não foi possível adicionar o atributo.");
  }
}

async function onDeleteAttribute(typeId, attrId) {
  if (!confirm("Excluir este atributo? Componentes que já usam este atributo manterão o valor salvo, mas ele deixará de aparecer no formulário.")) return;
  try {
    await deleteAttribute(typeId, attrId);
    showSuccess("Atributo excluído.");
    await renderTypes();
  } catch (err) {
    showError(err.message || "Não foi possível excluir o atributo.");
  }
}

async function onCreateOption(e, form) {
  e.preventDefault();
  const typeId = form.dataset.typeId;
  const attrId = form.dataset.attrId;
  const value = form.querySelector(".option-value").value.trim();
  const label = form.querySelector(".option-label").value.trim();
  if (!value || !label) return;

  try {
    await addOption(typeId, attrId, { value, label });
    await renderTypes();
  } catch (err) {
    showError(err.message || "Não foi possível adicionar a opção.");
  }
}

async function onDeleteOption(typeId, attrId, optionId) {
  try {
    await deleteOption(typeId, attrId, optionId);
    await renderTypes();
  } catch (err) {
    showError(err.message || "Não foi possível remover a opção.");
  }
}
