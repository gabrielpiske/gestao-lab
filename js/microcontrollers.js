// js/microcontrollers.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import {
  listMicrocontrollers,
  getMicrocontroller,
  createMicrocontroller,
  updateMicrocontroller,
  deleteMicrocontroller,
  createMicrocontrollerLoan,
  returnMicrocontrollerLoan,
} from "./data.js";
import {
  escapeHtml,
  debounce,
  showSuccess,
  showError,
  formatDate,
  TOOL_CONDITIONS,
  MICROCONTROLLER_FAMILIES,
  MICROCONTROLLER_CONNECTIVITY,
  MICROCONTROLLER_STATUS_LABELS,
} from "./utils.js";

const user = await requireAuth();
renderLayout(user, "microcontrollers");

const canWrite = ["ADMIN", "DOCENTE"].includes(user.role);
if (canWrite) {
  document.getElementById("new-micro-btn").classList.remove("d-none");
}

// Preencher selects de opções
const familyFilterSelect = document.getElementById("filter-family");
const microFamilySelect = document.getElementById("micro-family");
const microConnSelect = document.getElementById("micro-connectivity");
const microCondSelect = document.getElementById("micro-condition");

familyFilterSelect.innerHTML =
  `<option value="">Todas as famílias/arquiteturas</option>` +
  MICROCONTROLLER_FAMILIES.map((f) => `<option value="${f.value}">${escapeHtml(f.label)}</option>`).join("");

microFamilySelect.innerHTML =
  `<option value="">Selecione a família...</option>` +
  MICROCONTROLLER_FAMILIES.map((f) => `<option value="${f.value}">${escapeHtml(f.label)}</option>`).join("");

microConnSelect.innerHTML =
  `<option value="">Selecione a conectividade...</option>` +
  MICROCONTROLLER_CONNECTIVITY.map((c) => `<option value="${c.value}">${escapeHtml(c.label)}</option>`).join("");

microCondSelect.innerHTML = TOOL_CONDITIONS.map(
  (c) => `<option value="${c.value}">${escapeHtml(c.label)}</option>`
).join("");

const searchInput = document.getElementById("filter-search");
const statusSelect = document.getElementById("filter-status");
const grid = document.getElementById("micro-grid");

let microModal, loanModal;
let loanTargetMicroId = null;

await loadMicrocontrollers();

searchInput.addEventListener("input", debounce(loadMicrocontrollers, 250));
statusSelect.addEventListener("change", loadMicrocontrollers);
familyFilterSelect.addEventListener("change", loadMicrocontrollers);
document.getElementById("micro-form").addEventListener("submit", onSaveMicrocontroller);
document.getElementById("micro-loan-form").addEventListener("submit", onConfirmLoan);
document.getElementById("new-micro-btn").addEventListener("click", openNewMicroModal);

async function loadMicrocontrollers() {
  grid.innerHTML = `<div class="col-12"><p class="text-body-secondary small">Carregando...</p></div>`;
  try {
    const list = await listMicrocontrollers({
      status: statusSelect.value || undefined,
      family: familyFilterSelect.value || undefined,
      q: searchInput.value.trim() || undefined,
    });

    if (list.length === 0) {
      grid.innerHTML = `<div class="col-12"><p class="text-body-secondary small">Nenhum microcontrolador encontrado com os filtros atuais.</p></div>`;
      return;
    }

    grid.innerHTML = list.map((m) => renderMicroCard(m, canWrite, user.role === "ADMIN")).join("");

    grid.querySelectorAll("[data-action='borrow']").forEach((btn) =>
      btn.addEventListener("click", () => openLoanModal(btn.dataset.id, btn.dataset.name))
    );
    grid.querySelectorAll("[data-action='return']").forEach((btn) =>
      btn.addEventListener("click", () => onReturnLoan(btn.dataset.id, btn.dataset.loanId))
    );
    grid.querySelectorAll("[data-action='edit']").forEach((btn) =>
      btn.addEventListener("click", () => onEditMicro(btn.dataset.id))
    );
    grid.querySelectorAll("[data-action='delete']").forEach((btn) =>
      btn.addEventListener("click", () => onDeleteMicro(btn.dataset.id, btn.dataset.name))
    );
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="col-12"><p class="text-danger small">Erro ao carregar microcontroladores: ${escapeHtml(err.message)}</p></div>`;
  }
}

function renderMicroCard(micro, canWrite, isAdmin) {
  const statusInfo = MICROCONTROLLER_STATUS_LABELS[micro.status] || { label: micro.status, badge: "secondary" };
  const familyInfo = MICROCONTROLLER_FAMILIES.find((f) => f.value === micro.family)?.label || micro.family || "Geral";
  const conditionInfo = TOOL_CONDITIONS.find((c) => c.value === micro.condition)?.label || micro.condition || "Não informado";

  const loanInfo = micro.currentLoan
    ? `<div class="p-2 my-2 rounded bg-body-tertiary border border-subtle">
         <p class="small text-body mb-0">
           <i class="bi bi-person-fill text-primary me-1"></i><strong>Emprestado para:</strong> ${escapeHtml(micro.currentLoan.userName)}
         </p>
         <p class="small text-body-secondary mb-0">
           Retirado em: ${formatDate(micro.currentLoan.borrowedAt)}
           ${micro.currentLoan.expectedReturnAt ? ` · Devolução prevista: <strong>${formatDate(micro.currentLoan.expectedReturnAt)}</strong>` : ""}
         </p>
       </div>`
    : "";

  let actionBtns = [];

  if (canWrite) {
    if (micro.status === "DISPONIVEL") {
      actionBtns.push(
        `<button class="btn btn-sm btn-primary" data-action="borrow" data-id="${micro.id}" data-name="${escapeHtml(micro.name)}">
          <i class="bi bi-box-arrow-up-right me-1"></i> Emprestar
        </button>`
      );
    } else if (micro.status === "EMPRESTADA" && micro.currentLoan) {
      actionBtns.push(
        `<button class="btn btn-sm btn-outline-success" data-action="return" data-id="${micro.id}" data-loan-id="${micro.currentLoan.loanId}">
          <i class="bi bi-check2-circle me-1"></i> Registrar devolução
        </button>`
      );
    }

    actionBtns.push(
      `<button class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${micro.id}" title="Editar microcontrolador">
        <i class="bi bi-pencil"></i>
      </button>`
    );
  }

  if (isAdmin) {
    actionBtns.push(
      `<button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${micro.id}" data-name="${escapeHtml(micro.name)}" title="Excluir">
        <i class="bi bi-trash"></i>
      </button>`
    );
  }

  const tags = [];
  if (micro.patrimonio) tags.push(`<span class="badge bg-secondary-subtle text-body border">${escapeHtml(micro.patrimonio)}</span>`);
  tags.push(`<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle"><i class="bi bi-shield-check me-1"></i>${escapeHtml(conditionInfo)}</span>`);
  if (micro.location) tags.push(`<span class="badge bg-light text-body-secondary border"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(micro.location)}</span>`);

  return `
    <div class="col-12 col-md-6">
      <div class="lt-card p-3 h-100 d-flex flex-column justify-content-between">
        <div>
          <div class="d-flex justify-content-between align-items-start mb-2 gap-2">
            <div>
              <p class="fw-semibold small mb-0 text-body fs-6">${escapeHtml(micro.name)}</p>
              <p class="small text-body-secondary mb-0"><i class="bi bi-motherboard me-1"></i>${escapeHtml(familyInfo)}</p>
            </div>
            <span class="badge text-bg-${statusInfo.badge}">${statusInfo.label}</span>
          </div>

          <div class="d-flex flex-wrap gap-1 mb-2">
            ${tags.join("")}
          </div>

          ${micro.notes ? `<p class="small text-body-secondary mb-2 fst-italic"><i class="bi bi-info-circle me-1"></i>${escapeHtml(micro.notes)}</p>` : ""}
          ${loanInfo}
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3 pt-2 border-top">
          ${actionBtns.join("")}
        </div>
      </div>
    </div>`;
}

function openNewMicroModal() {
  document.getElementById("micro-form").reset();
  document.getElementById("micro-id").value = "";
  document.getElementById("micro-modal-title").textContent = "Novo microcontrolador";
  document.getElementById("micro-submit-btn").textContent = "Salvar microcontrolador";
  document.getElementById("micro-form-error").classList.add("d-none");
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("micro-modal"));
  modal.show();
}

async function onEditMicro(id) {
  try {
    const micro = await getMicrocontroller(id);
    if (!micro) {
      showError("Microcontrolador não encontrado.");
      return;
    }

    document.getElementById("micro-id").value = id;
    document.getElementById("micro-name").value = micro.name || "";
    document.getElementById("micro-family").value = micro.family || "";
    document.getElementById("micro-connectivity").value = micro.connectivity || "";
    document.getElementById("micro-patrimonio").value = micro.patrimonio || "";
    document.getElementById("micro-condition").value = micro.condition || "BOM";
    document.getElementById("micro-manufacturer").value = micro.manufacturer || "";
    document.getElementById("micro-voltage").value = micro.voltage || "";
    document.getElementById("micro-location").value = micro.location || "";
    document.getElementById("micro-notes").value = micro.notes || "";

    document.getElementById("micro-modal-title").textContent = "Editar microcontrolador";
    document.getElementById("micro-submit-btn").textContent = "Salvar alterações";
    document.getElementById("micro-form-error").classList.add("d-none");

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("micro-modal"));
    modal.show();
  } catch (err) {
    showError(err.message || "Erro ao carregar dados do microcontrolador.");
  }
}

async function onSaveMicrocontroller(e) {
  e.preventDefault();
  const errorBox = document.getElementById("micro-form-error");
  errorBox.classList.add("d-none");

  const id = document.getElementById("micro-id").value;
  const isEditing = !!id;

  const data = {
    name: document.getElementById("micro-name").value.trim(),
    family: document.getElementById("micro-family").value,
    connectivity: document.getElementById("micro-connectivity").value || null,
    patrimonio: document.getElementById("micro-patrimonio").value.trim() || null,
    condition: document.getElementById("micro-condition").value,
    manufacturer: document.getElementById("micro-manufacturer").value.trim() || null,
    voltage: document.getElementById("micro-voltage").value.trim() || null,
    location: document.getElementById("micro-location").value.trim() || null,
    notes: document.getElementById("micro-notes").value.trim() || null,
  };

  try {
    if (isEditing) {
      await updateMicrocontroller(id, data);
      showSuccess("Microcontrolador atualizado com sucesso.");
    } else {
      await createMicrocontroller(data);
      showSuccess("Microcontrolador cadastrado com sucesso.");
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById("micro-modal")).hide();
    await loadMicrocontrollers();
  } catch (err) {
    errorBox.textContent = err.message || "Não foi possível salvar o microcontrolador.";
    errorBox.classList.remove("d-none");
  }
}

async function onDeleteMicro(id, name) {
  if (!confirm(`Tem certeza que deseja excluir o microcontrolador "${name}"?`)) return;
  try {
    await deleteMicrocontroller(id);
    showSuccess("Microcontrolador excluído com sucesso.");
    await loadMicrocontrollers();
  } catch (err) {
    showError(err.message || "Não foi possível excluir o microcontrolador.");
  }
}

function openLoanModal(microId, microName) {
  loanTargetMicroId = microId;
  document.getElementById("micro-loan-item-name").innerHTML = `<i class="bi bi-motherboard me-1 text-primary"></i> ${escapeHtml(microName)}`;
  document.getElementById("micro-loan-form").reset();
  document.getElementById("micro-loan-form-error").classList.add("d-none");
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("micro-loan-modal"));
  modal.show();
}

async function onConfirmLoan(e) {
  e.preventDefault();
  const errorBox = document.getElementById("micro-loan-form-error");
  errorBox.classList.add("d-none");

  const expectedReturnAt = document.getElementById("micro-loan-expected-return").value || null;
  const notes = document.getElementById("micro-loan-notes").value.trim();

  try {
    await createMicrocontrollerLoan(loanTargetMicroId, { expectedReturnAt, notes }, user);
    showSuccess("Empréstimo de microcontrolador registrado.");
    bootstrap.Modal.getOrCreateInstance(document.getElementById("micro-loan-modal")).hide();
    await loadMicrocontrollers();
  } catch (err) {
    errorBox.textContent = err.message || "Não foi possível registrar o empréstimo.";
    errorBox.classList.remove("d-none");
  }
}

async function onReturnLoan(microId, loanId) {
  if (!confirm("Confirmar a devolução deste microcontrolador ao laboratório?")) return;
  try {
    await returnMicrocontrollerLoan(microId, loanId);
    showSuccess("Devolução registrada com sucesso.");
    await loadMicrocontrollers();
  } catch (err) {
    showError(err.message || "Não foi possível registrar a devolução.");
  }
}
