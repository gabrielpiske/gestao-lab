// js/tools.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import { listTools, createTool, createLoan, returnLoan } from "./data.js";
import { escapeHtml, debounce, showSuccess, showError, formatDate, TOOL_CONDITIONS, TOOL_STATUS_LABELS } from "./utils.js";

const user = await requireAuth();
renderLayout(user, "tools");

const canWrite = ["ADMIN", "DOCENTE", "ALUNO"].includes(user.role);
if (canWrite) document.getElementById("new-tool-btn").classList.remove("d-none");

document.getElementById("tool-condition").innerHTML = TOOL_CONDITIONS.map(
  (c) => `<option value="${c.value}">${c.label}</option>`
).join("");

const searchInput = document.getElementById("filter-search");
const statusSelect = document.getElementById("filter-status");
const grid = document.getElementById("tools-grid");

let toolModal, loanModal;
let loanTargetToolId = null;

await loadTools();

searchInput.addEventListener("input", debounce(loadTools, 250));
statusSelect.addEventListener("change", loadTools);
document.getElementById("tool-form").addEventListener("submit", onCreateTool);
document.getElementById("loan-form").addEventListener("submit", onConfirmLoan);

async function loadTools() {
  grid.innerHTML = `<p class="text-body-secondary small">Carregando...</p>`;
  try {
    const tools = await listTools({ status: statusSelect.value || undefined, q: searchInput.value.trim() || undefined });

    if (tools.length === 0) {
      grid.innerHTML = `<p class="text-body-secondary small">Nenhuma ferramenta encontrada.</p>`;
      return;
    }

    grid.innerHTML = tools.map((tool) => renderToolCard(tool, canWrite)).join("");

    grid.querySelectorAll("[data-action='borrow']").forEach((btn) =>
      btn.addEventListener("click", () => openLoanModal(btn.dataset.id, btn.dataset.name))
    );
    grid.querySelectorAll("[data-action='return']").forEach((btn) =>
      btn.addEventListener("click", () => onReturnLoan(btn.dataset.id, btn.dataset.loanId))
    );
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="text-danger small">Erro ao carregar ferramentas: ${escapeHtml(err.message)}</p>`;
  }
}

function renderToolCard(tool, canWrite) {
  const statusInfo = TOOL_STATUS_LABELS[tool.status] || { label: tool.status, badge: "secondary" };
  const loanInfo = tool.currentLoan
    ? `<p class="small text-body-secondary mb-2">
         Com ${escapeHtml(tool.currentLoan.userName)} desde ${formatDate(tool.currentLoan.borrowedAt)}
         ${tool.currentLoan.expectedReturnAt ? ` — devolução prevista: ${formatDate(tool.currentLoan.expectedReturnAt)}` : ""}
       </p>`
    : "";

  let actionBtn = "";
  if (canWrite) {
    if (tool.status === "DISPONIVEL") {
      actionBtn = `<button class="btn btn-sm btn-primary" data-action="borrow" data-id="${tool.id}" data-name="${escapeHtml(tool.name)}">Emprestar</button>`;
    } else if (tool.status === "EMPRESTADA" && tool.currentLoan) {
      actionBtn = `<button class="btn btn-sm btn-outline-secondary" data-action="return" data-id="${tool.id}" data-loan-id="${tool.currentLoan.loanId}">Registrar devolução</button>`;
    }
  }

  return `
    <div class="col-12 col-md-6">
      <div class="lt-card p-3 h-100">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <p class="fw-medium small mb-0">${escapeHtml(tool.name)}</p>
            <p class="small text-body-secondary mb-0">${escapeHtml(tool.manufacturer) || ""} ${escapeHtml(tool.model) || ""}</p>
          </div>
          <span class="badge text-bg-${statusInfo.badge}">${statusInfo.label}</span>
        </div>
        ${loanInfo}
        <div class="d-flex justify-content-end">${actionBtn}</div>
      </div>
    </div>`;
}

async function onCreateTool(e) {
  e.preventDefault();
  const errorBox = document.getElementById("tool-form-error");
  errorBox.classList.add("d-none");

  const data = {
    name: document.getElementById("tool-name").value.trim(),
    patrimonio: document.getElementById("tool-patrimonio").value.trim() || null,
    condition: document.getElementById("tool-condition").value,
    manufacturer: document.getElementById("tool-manufacturer").value.trim() || null,
    model: document.getElementById("tool-model").value.trim() || null,
    serialNumber: document.getElementById("tool-serial").value.trim() || null,
    location: document.getElementById("tool-location").value.trim() || null,
    notes: document.getElementById("tool-notes").value.trim() || null,
  };

  try {
    await createTool(data);
    showSuccess("Ferramenta cadastrada.");
    document.getElementById("tool-form").reset();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("tool-modal")).hide();
    await loadTools();
  } catch (err) {
    errorBox.textContent = err.message || "Não foi possível cadastrar a ferramenta.";
    errorBox.classList.remove("d-none");
  }
}

function openLoanModal(toolId, toolName) {
  loanTargetToolId = toolId;
  document.getElementById("loan-tool-name").textContent = toolName;
  document.getElementById("loan-form").reset();
  document.getElementById("loan-form-error").classList.add("d-none");
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("loan-modal"));
  modal.show();
}

async function onConfirmLoan(e) {
  e.preventDefault();
  const errorBox = document.getElementById("loan-form-error");
  errorBox.classList.add("d-none");

  const expectedReturnAt = document.getElementById("loan-expected-return").value || null;
  const notes = document.getElementById("loan-notes").value.trim();

  try {
    await createLoan(loanTargetToolId, { expectedReturnAt, notes }, user);
    showSuccess("Empréstimo registrado.");
    bootstrap.Modal.getOrCreateInstance(document.getElementById("loan-modal")).hide();
    await loadTools();
  } catch (err) {
    errorBox.textContent = err.message || "Não foi possível registrar o empréstimo.";
    errorBox.classList.remove("d-none");
  }
}

async function onReturnLoan(toolId, loanId) {
  if (!confirm("Confirmar a devolução desta ferramenta?")) return;
  try {
    await returnLoan(toolId, loanId);
    showSuccess("Devolução registrada.");
    await loadTools();
  } catch (err) {
    showError(err.message || "Não foi possível registrar a devolução.");
  }
}
