// js/component-form.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import {
  listComponentTypes,
  getComponentType,
  getComponent,
  createComponent,
  updateComponent,
  listMovementsByComponent,
  registerMovement,
} from "./data.js";
import { escapeHtml, getQueryParam, showSuccess, showError, timeAgo, STOCK_MOVEMENT_REASONS } from "./utils.js";

const user = await requireAuth({ requireWrite: true });
renderLayout(user, "components");

const componentId = getQueryParam("id");
const isEditing = !!componentId;

const typeSelect = document.getElementById("component-type-select");
const attributesContainer = document.getElementById("attributes-container");
const form = document.getElementById("component-form");
const formError = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");

let componentTypes = [];
let selectedType = null;
let existingComponent = null;

await init();

async function init() {
  componentTypes = await listComponentTypes();
  typeSelect.innerHTML =
    `<option value="">Selecione...</option>` +
    componentTypes.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");

  if (isEditing) {
    document.getElementById("page-title").textContent = "Editar componente";
    submitBtn.textContent = "Salvar alterações";
    document.getElementById("stock-section").classList.remove("d-none");
    setupMovementReasonOptions();
    await loadExistingComponent();
    await loadMovements();
  }

  typeSelect.addEventListener("change", onTypeChange);
  form.addEventListener("submit", onSubmit);
  document.getElementById("movement-form").addEventListener("submit", onRegisterMovement);
}

async function loadExistingComponent() {
  existingComponent = await getComponent(componentId);
  if (!existingComponent) {
    showError("Componente não encontrado.");
    window.location.href = "components.html";
    return;
  }

  typeSelect.value = existingComponent.componentTypeId;
  typeSelect.disabled = true; // trocar o tipo depois de criado invalidaria os atributos já preenchidos
  await onTypeChange();

  document.getElementById("internal-code").value = existingComponent.internalCode || "";
  document.getElementById("location").value = existingComponent.location || "";
  document.getElementById("quantity").value = existingComponent.quantity;
  document.getElementById("quantity").disabled = true; // quantidade só muda via movimentação de estoque
  document.getElementById("min-quantity").value = existingComponent.minQuantity;
  document.getElementById("supplier").value = existingComponent.supplier || "";
  document.getElementById("manufacturer").value = existingComponent.manufacturer || "";
  document.getElementById("acquisition-date").value = existingComponent.acquisitionDate || "";
  document.getElementById("price").value = existingComponent.price ?? "";
  document.getElementById("notes").value = existingComponent.notes || "";

  for (const [attrId, value] of Object.entries(existingComponent.attributes || {})) {
    const field = document.getElementById(`attr-${attrId}`);
    if (field) field.value = value;
  }
}

async function onTypeChange() {
  const typeId = typeSelect.value;
  selectedType = typeId ? await getComponentType(typeId) : null;
  renderAttributeFields();
}

function renderAttributeFields() {
  if (!selectedType || selectedType.attributes.length === 0) {
    attributesContainer.innerHTML = "";
    return;
  }

  const sorted = [...selectedType.attributes].sort((a, b) => a.sortOrder - b.sortOrder);

  attributesContainer.innerHTML = sorted
    .map((attr) => {
      const requiredMark = attr.required ? '<span class="text-danger">*</span>' : "";
      const label = `${escapeHtml(attr.name)}${attr.unit ? ` (${escapeHtml(attr.unit)})` : ""} ${requiredMark}`;

      if (attr.dataType === "SELECT") {
        const options = [...attr.options]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((o) => `<option value="${o.id}">${escapeHtml(o.label)}</option>`)
          .join("");
        return `
          <div class="col-6">
            <label class="form-label small text-body-secondary">${label}</label>
            <select id="attr-${attr.id}" class="form-select" ${attr.required ? "required" : ""}>
              <option value="">Selecione...</option>
              ${options}
            </select>
          </div>`;
      }

      if (attr.dataType === "BOOLEAN") {
        return `
          <div class="col-6">
            <label class="form-label small text-body-secondary">${label}</label>
            <select id="attr-${attr.id}" class="form-select" ${attr.required ? "required" : ""}>
              <option value="">Selecione...</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>`;
      }

      return `
        <div class="col-6">
          <label class="form-label small text-body-secondary">${label}</label>
          <input id="attr-${attr.id}" type="${attr.dataType === "NUMBER" ? "number" : "text"}"
                 class="form-control" ${attr.required ? "required" : ""}>
        </div>`;
    })
    .join("");
}

async function onSubmit(e) {
  e.preventDefault();
  formError.classList.add("d-none");

  const typeId = typeSelect.value;
  if (!typeId) {
    showFormError("Selecione um tipo de componente.");
    return;
  }

  const attributes = {};
  if (selectedType) {
    for (const attr of selectedType.attributes) {
      const field = document.getElementById(`attr-${attr.id}`);
      const value = field?.value ?? "";
      if (attr.required && !value) {
        showFormError(`O atributo "${attr.name}" é obrigatório.`);
        return;
      }
      if (value !== "") attributes[attr.id] = attr.dataType === "BOOLEAN" ? value === "true" : value;
    }
  }

  const payload = {
    componentTypeId: typeId,
    componentTypeName: componentTypes.find((t) => t.id === typeId)?.name || "",
    internalCode: document.getElementById("internal-code").value.trim() || null,
    location: document.getElementById("location").value.trim() || null,
    quantity: Number(document.getElementById("quantity").value),
    minQuantity: Number(document.getElementById("min-quantity").value),
    supplier: document.getElementById("supplier").value.trim() || null,
    manufacturer: document.getElementById("manufacturer").value.trim() || null,
    acquisitionDate: document.getElementById("acquisition-date").value || null,
    price: document.getElementById("price").value ? Number(document.getElementById("price").value) : null,
    notes: document.getElementById("notes").value.trim() || null,
    attributes,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Salvando...";

  try {
    if (isEditing) {
      const { quantity, ...patchWithoutQuantity } = payload; // quantidade não é editada por aqui
      await updateComponent(componentId, patchWithoutQuantity);
      showSuccess("Componente atualizado.");
    } else {
      await createComponent(payload);
      showSuccess("Componente cadastrado.");
    }
    window.location.href = "components.html";
  } catch (err) {
    console.error(err);
    showFormError(err.message || "Não foi possível salvar o componente.");
    submitBtn.disabled = false;
    submitBtn.textContent = isEditing ? "Salvar alterações" : "Salvar componente";
  }
}

function showFormError(message) {
  formError.textContent = message;
  formError.classList.remove("d-none");
}

/* ---------------- Movimentação de estoque (somente ao editar) ---------------- */

function setupMovementReasonOptions() {
  const select = document.getElementById("movement-reason");
  select.innerHTML = STOCK_MOVEMENT_REASONS.map((r) => `<option value="${r.value}">${r.label}</option>`).join("");
}

async function onRegisterMovement(e) {
  e.preventDefault();
  const errorBox = document.getElementById("movement-error");
  errorBox.classList.add("d-none");

  const type = document.getElementById("movement-type").value;
  const reason = document.getElementById("movement-reason").value;
  const quantity = Number(document.getElementById("movement-quantity").value);
  const notes = document.getElementById("movement-notes").value.trim();

  try {
    await registerMovement(componentId, { type, reason, quantity, notes }, user);
    showSuccess("Movimentação registrada.");
    document.getElementById("movement-form").reset();
    document.getElementById("movement-quantity").value = 1;
    existingComponent = await getComponent(componentId);
    document.getElementById("quantity").value = existingComponent.quantity;
    await loadMovements();
  } catch (err) {
    errorBox.textContent = err.message || "Não foi possível registrar a movimentação.";
    errorBox.classList.remove("d-none");
  }
}

async function loadMovements() {
  const container = document.getElementById("movements-list");
  const reasonLabels = Object.fromEntries(STOCK_MOVEMENT_REASONS.map((r) => [r.value, r.label]));
  try {
    const movements = await listMovementsByComponent(componentId, 20);
    if (movements.length === 0) {
      container.innerHTML = `<p class="text-body-secondary small mb-0">Nenhuma movimentação registrada ainda.</p>`;
      return;
    }
    container.innerHTML = movements
      .map(
        (m) => `
        <div class="d-flex justify-content-between small border-bottom pb-2">
          <span>
            <i class="bi ${m.type === "ENTRADA" ? "bi-arrow-down-circle text-success" : "bi-arrow-up-circle text-danger"}"></i>
            ${m.quantity}un — ${escapeHtml(reasonLabels[m.reason] || m.reason)}
            ${m.notes ? `— <span class="text-body-secondary">${escapeHtml(m.notes)}</span>` : ""}
          </span>
          <span class="text-body-secondary">${escapeHtml(m.userName)} · ${timeAgo(m.occurredAt)}</span>
        </div>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<p class="text-danger small mb-0">Erro ao carregar histórico.</p>`;
  }
}
