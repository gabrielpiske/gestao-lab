// js/kits.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import {
  listKits,
  getKit,
  createKit,
  updateKit,
  deleteKit,
  borrowKit,
  returnKitLoan,
  listComponents,
  getMyActiveKitLoans,
  listAllKitLoans,
} from "./data.js";
import {
  escapeHtml,
  formatDate,
  formatDateTime,
  showSuccess,
  showError,
  debounce,
  normalizeSearch,
} from "./utils.js";

const user = await requireAuth();
renderLayout(user, "kits");

const isStaff = ["ADMIN", "DOCENTE"].includes(user.role);

// Elementos da UI
const newKitBtn = document.getElementById("new-kit-btn");
const tabManageLi = document.getElementById("tab-manage-li");
const catalogSearch = document.getElementById("catalog-search");
const kitsCatalogGrid = document.getElementById("kits-catalog-grid");
const myKitsList = document.getElementById("my-kits-list");
const myKitsBadge = document.getElementById("my-kits-badge");
const manageKitsTbody = document.getElementById("manage-kits-tbody");
const kitHistoryTbody = document.getElementById("kit-history-tbody");

// Form do Modal Criar/Editar Kit
const kitModalEl = document.getElementById("kit-modal");
const kitForm = document.getElementById("kit-form");
const kitModalTitle = document.getElementById("kit-modal-title");
const kitIdInput = document.getElementById("kit-id");
const kitNameInput = document.getElementById("kit-name");
const kitTargetClassInput = document.getElementById("kit-target-class");
const kitDescriptionInput = document.getElementById("kit-description");
const selectComponentEl = document.getElementById("select-component");
const selectComponentQtyEl = document.getElementById("select-component-qty");
const addComponentBtn = document.getElementById("add-component-btn");
const kitItemsTbody = document.getElementById("kit-items-tbody");
const kitComponentsCountEl = document.getElementById("kit-components-count");
const kitFormError = document.getElementById("kit-form-error");
const saveKitBtn = document.getElementById("save-kit-btn");

// Form do Modal Retirar Kit (1-Clique)
const borrowKitModalEl = document.getElementById("borrow-kit-modal");
const borrowKitForm = document.getElementById("borrow-kit-form");
const borrowKitIdInput = document.getElementById("borrow-kit-id");
const borrowKitTitle = document.getElementById("borrow-kit-title");
const borrowKitClass = document.getElementById("borrow-kit-class");
const borrowKitDesc = document.getElementById("borrow-kit-desc");
const borrowKitItemsList = document.getElementById("borrow-kit-items-list");
const borrowKitReturnDate = document.getElementById("borrow-kit-return-date");
const borrowKitNotes = document.getElementById("borrow-kit-notes");
const borrowKitError = document.getElementById("borrow-kit-error");
const confirmBorrowBtn = document.getElementById("confirm-borrow-btn");

function getKitModal() {
  if (kitModalEl && window.bootstrap?.Modal) {
    return bootstrap.Modal.getOrCreateInstance(kitModalEl);
  }
  return null;
}

function getBorrowKitModal() {
  if (borrowKitModalEl && window.bootstrap?.Modal) {
    return bootstrap.Modal.getOrCreateInstance(borrowKitModalEl);
  }
  return null;
}

// Exibir controles de docente se for STAFF
if (isStaff) {
  newKitBtn?.classList.remove("d-none");
  tabManageLi?.classList.remove("d-none");
}

// Event Listeners
catalogSearch.addEventListener("input", debounce(renderCatalog, 200));

addComponentBtn.addEventListener("click", () => {
  const componentId = selectComponentEl.value;
  const qty = Number(selectComponentQtyEl.value || 1);

  if (!componentId) {
    showError("Selecione um componente da lista.");
    return;
  }

  const comp = allComponents.find((c) => c.id === componentId);
  if (!comp) return;

  const existingIdx = draftKitItems.findIndex((i) => i.componentId === componentId);
  if (existingIdx >= 0) {
    draftKitItems[existingIdx].quantity += qty;
  } else {
    draftKitItems.push({
      componentId: comp.id,
      componentTypeName: comp.componentTypeName || "Componente",
      internalCode: comp.internalCode || "",
      quantity: qty,
    });
  }

  renderDraftKitItems();
  selectComponentEl.value = "";
  selectComponentQtyEl.value = 1;
});

kitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  kitFormError.classList.add("d-none");

  const name = kitNameInput.value.trim();
  const targetClass = kitTargetClassInput.value.trim();
  const description = kitDescriptionInput.value.trim();
  const id = kitIdInput.value;

  if (!name) {
    showFormError(kitFormError, "O nome do kit é obrigatório.");
    return;
  }

  if (draftKitItems.length === 0) {
    showFormError(kitFormError, "Adicione pelo menos um componente ao kit.");
    return;
  }

  saveKitBtn.disabled = true;
  saveKitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Salvando...`;

  try {
    if (id) {
      await updateKit(id, { name, targetClass, description, items: draftKitItems });
      showSuccess("Kit atualizado com sucesso!");
    } else {
      await createKit({ name, targetClass, description, items: draftKitItems }, user);
      showSuccess("Kit de aula criado com sucesso!");
    }

    getKitModal()?.hide();
    resetKitForm();
    await loadInitialData();
  } catch (err) {
    console.error("Erro ao salvar kit:", err);
    showFormError(kitFormError, "Erro ao salvar kit: " + err.message);
  } finally {
    saveKitBtn.disabled = false;
    saveKitBtn.textContent = "Salvar Kit";
  }
});

borrowKitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  borrowKitError.classList.add("d-none");

  const kitId = borrowKitIdInput.value;
  const expectedReturnAt = borrowKitReturnDate.value;
  const notes = borrowKitNotes.value.trim();

  if (!kitId) return;

  confirmBorrowBtn.disabled = true;
  confirmBorrowBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Processando...`;

  try {
    await borrowKit(kitId, { expectedReturnAt, notes }, user);
    showSuccess("Kit retirado com sucesso! Todos os componentes foram baixados do estoque em 1-clique.");
    getBorrowKitModal()?.hide();
    await loadInitialData();
  } catch (err) {
    console.error("Erro ao retirar kit:", err);
    showFormError(borrowKitError, err.message);
  } finally {
    confirmBorrowBtn.disabled = false;
    confirmBorrowBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i> Confirmar Retirada em 1-Clique`;
  }
});

// Inicialização de dados
await loadInitialData();

async function loadInitialData() {
  try {
    const [kits, components] = await Promise.all([listKits(), listComponents()]);
    allKits = kits;
    allComponents = components;

    populateComponentSelectOptions();
    renderCatalog();
    await renderMyKits();
    if (isStaff) renderManageTable();
    await renderHistoryTable();
  } catch (err) {
    console.error("Erro ao carregar dados dos kits:", err);
    showError("Erro ao carregar dados: " + err.message);
  }
}

function populateComponentSelectOptions() {
  selectComponentEl.innerHTML = `<option value="">Selecione um componente...</option>` +
    allComponents
      .map((c) => {
        const code = c.internalCode ? ` [${c.internalCode}]` : "";
        const qtyInfo = ` (Disponível: ${c.quantity})`;
        return `<option value="${c.id}">${escapeHtml(c.componentTypeName)}${escapeHtml(code)}${qtyInfo}</option>`;
      })
      .join("");
}

/* =========================== CATÁLOGO DE KITS =========================== */

function renderCatalog() {
  const q = normalizeSearch(catalogSearch.value.trim());

  let list = allKits;
  if (q) {
    list = list.filter(
      (k) =>
        normalizeSearch(k.name).includes(q) ||
        normalizeSearch(k.targetClass).includes(q) ||
        normalizeSearch(k.description).includes(q) ||
        (k.items && k.items.some((i) => normalizeSearch(i.componentTypeName).includes(q)))
    );
  }

  if (list.length === 0) {
    kitsCatalogGrid.innerHTML = `
      <div class="col-12">
        <div class="lt-card p-4 text-center text-body-secondary">
          <i class="bi bi-box-seam fs-2 d-block mb-2"></i>
          <p class="mb-0 fw-medium">Nenhum kit de aula encontrado.</p>
          ${isStaff ? `<p class="small text-body-secondary mt-1">Clique em "Criar Novo Kit" para cadastrar o primeiro kit de aula.</p>` : ""}
        </div>
      </div>`;
    return;
  }

  const compMap = new Map(allComponents.map((c) => [c.id, c]));

  kitsCatalogGrid.innerHTML = list
    .map((kit) => {
      let isAvailable = true;
      const itemsListHtml = (kit.items || [])
        .map((item) => {
          const comp = compMap.get(item.componentId);
          const currentQty = comp ? comp.quantity : 0;
          const hasEnough = currentQty >= item.quantity;
          if (!hasEnough) isAvailable = false;

          return `
            <li class="d-flex justify-content-between align-items-center mb-1 pb-1 border-bottom border-light-subtle">
              <span>
                <i class="bi bi-cpu text-secondary me-1"></i>
                ${escapeHtml(item.componentTypeName)}
                ${item.internalCode ? `<small class="text-body-secondary">(${escapeHtml(item.internalCode)})</small>` : ""}
              </span>
              <span>
                <span class="badge ${hasEnough ? "bg-primary-subtle text-primary" : "bg-danger-subtle text-danger"}">
                  ${item.quantity} un.
                </span>
                <small class="text-body-secondary ms-1">(Estoque: ${currentQty})</small>
              </span>
            </li>`;
        })
        .join("");

      return `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="lt-card h-100 d-flex flex-column p-3">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <h6 class="fw-bold mb-0 text-body">${escapeHtml(kit.name)}</h6>
                ${
                  kit.targetClass
                    ? `<span class="badge bg-secondary-subtle text-body border mt-1" style="font-size: 0.7rem;">${escapeHtml(kit.targetClass)}</span>`
                    : ""
                }
              </div>
              <span class="badge ${isAvailable ? "bg-success-subtle text-success border border-success-subtle" : "bg-warning-subtle text-warning border border-warning-subtle"}">
                <i class="bi ${isAvailable ? "bi-check-circle" : "bi-exclamation-triangle"} me-1"></i>
                ${isAvailable ? "Estoque ok" : "Estoque baixo"}
              </span>
            </div>

            ${kit.description ? `<p class="small text-body-secondary mb-3">${escapeHtml(kit.description)}</p>` : ""}

            <div class="border rounded p-2 bg-body-tertiary mb-3 flex-grow-1">
              <div class="small fw-semibold text-body-secondary mb-1">Componentes inclusos (${kit.items ? kit.items.length : 0}):</div>
              <ul class="list-unstyled small mb-0">
                ${itemsListHtml || `<li class="text-body-secondary small">Nenhum componente vinculado.</li>`}
              </ul>
            </div>

            <button
              class="btn btn-sm ${isAvailable ? "btn-primary" : "btn-outline-warning"} w-100 borrow-kit-btn mt-auto"
              data-id="${kit.id}"
            >
              <i class="bi bi-box-arrow-right me-1"></i> Retirar Kit em 1-Clique
            </button>
          </div>
        </div>`;
    })
    .join("");

  kitsCatalogGrid.querySelectorAll(".borrow-kit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const kit = allKits.find((k) => k.id === id);
      if (kit) openBorrowModal(kit);
    });
  });
}

function openBorrowModal(kit) {
  selectedKitForBorrow = kit;
  borrowKitIdInput.value = kit.id;
  borrowKitTitle.textContent = kit.name;
  borrowKitClass.textContent = kit.targetClass || "Aula prática";
  borrowKitDesc.textContent = kit.description || "Sem descrição disponível.";

  const compMap = new Map(allComponents.map((c) => [c.id, c]));

  borrowKitItemsList.innerHTML = (kit.items || [])
    .map((item) => {
      const comp = compMap.get(item.componentId);
      const currentQty = comp ? comp.quantity : 0;
      const hasEnough = currentQty >= item.quantity;
      return `
        <li class="d-flex justify-content-between align-items-center py-1 border-bottom">
          <span>${escapeHtml(item.componentTypeName)} ${item.internalCode ? `(${escapeHtml(item.internalCode)})` : ""}</span>
          <span>
            <strong>${item.quantity} un.</strong>
            ${!hasEnough ? `<span class="badge bg-danger ms-1">Indisponível (Estoque: ${currentQty})</span>` : ""}
          </span>
        </li>`;
    })
    .join("");

  borrowKitReturnDate.value = "";
  borrowKitNotes.value = "";
  borrowKitError.classList.add("d-none");

  getBorrowKitModal()?.show();
}

/* =========================== MEUS KITS RETIRADOS =========================== */

async function renderMyKits() {
  try {
    const myLoans = await getMyActiveKitLoans(user.uid);
    const count = myLoans.length;

    if (count > 0) {
      myKitsBadge.textContent = count;
      myKitsBadge.classList.remove("d-none");
    } else {
      myKitsBadge.classList.add("d-none");
    }

    if (count === 0) {
      myKitsList.innerHTML = `
        <div class="text-center py-4 text-body-secondary">
          <i class="bi bi-check2-circle fs-3 text-success d-block mb-2"></i>
          <p class="mb-0 fw-medium">Você não possui nenhum kit de aula pendente de devolução.</p>
        </div>`;
      return;
    }

    myKitsList.innerHTML = `
      <div class="list-group gap-2">
        ${myLoans
          .map((loan) => {
            const itemsCount = loan.items ? loan.items.reduce((acc, i) => acc + Number(i.quantity || 1), 0) : 0;
            return `
            <div class="list-group-item d-flex justify-content-between align-items-center p-3 rounded-3 border">
              <div>
                <div class="d-flex align-items-center gap-2 mb-1">
                  <i class="bi bi-box-seam-fill text-primary"></i>
                  <span class="fw-bold">${escapeHtml(loan.kitName)}</span>
                  ${loan.targetClass ? `<span class="badge bg-secondary-subtle text-body border" style="font-size: 0.7rem;">${escapeHtml(loan.targetClass)}</span>` : ""}
                </div>
                <div class="small text-body-secondary mb-1">
                  Componentes retirados: <strong>${itemsCount} un.</strong> ${loan.notes ? `| Observação: ${escapeHtml(loan.notes)}` : ""}
                </div>
                <div class="small text-body-secondary">
                  Retirado em: ${formatDateTime(loan.borrowedAt)}
                </div>
              </div>
              <div>
                <button
                  class="btn btn-sm btn-outline-primary return-kit-btn d-flex align-items-center gap-1"
                  data-loan-id="${loan.id}"
                >
                  <i class="bi bi-box-arrow-in-left"></i> Devolver Kit em 1-Clique
                </button>
              </div>
            </div>`;
          })
          .join("")}
      </div>`;

    myKitsList.querySelectorAll(".return-kit-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const loanId = btn.dataset.loanId;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Devolvendo...`;

        try {
          await returnKitLoan(loanId);
          showSuccess("Kit devolvido com sucesso! Todos os componentes retornaram ao estoque.");
          await loadInitialData();
        } catch (err) {
          console.error("Erro ao devolver kit:", err);
          showError("Erro ao devolver kit: " + err.message);
          btn.disabled = false;
          btn.innerHTML = `<i class="bi bi-box-arrow-in-left"></i> Devolver Kit em 1-Clique`;
        }
      });
    });
  } catch (err) {
    console.error("Erro ao renderizar meus kits:", err);
  }
}

/* =========================== GERENCIAR KITS (DOCENTE) =========================== */

function renderManageTable() {
  if (allKits.length === 0) {
    manageKitsTbody.innerHTML = `
      <tr>
        <td class="ps-3 py-3 text-body-secondary small" colspan="5">Nenhum kit cadastrado até o momento.</td>
      </tr>`;
    return;
  }

  manageKitsTbody.innerHTML = allKits
    .map((kit) => {
      const count = kit.items ? kit.items.length : 0;
      return `
      <tr>
        <td class="ps-3 py-2 fw-semibold">${escapeHtml(kit.name)}</td>
        <td class="py-2 small">${escapeHtml(kit.targetClass || "-")}</td>
        <td class="py-2">
          <span class="badge bg-secondary-subtle text-body border">${count} componente(s)</span>
        </td>
        <td class="py-2 small text-body-secondary">${escapeHtml(kit.createdByName || "Docente")}</td>
        <td class="pe-3 py-2 text-end">
          <button class="btn btn-sm btn-outline-secondary edit-kit-btn me-1" data-id="${kit.id}" title="Editar Kit">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-kit-btn" data-id="${kit.id}" title="Excluir Kit">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
    })
    .join("");

  manageKitsTbody.querySelectorAll(".edit-kit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kit = allKits.find((k) => k.id === btn.dataset.id);
      if (kit) openEditModal(kit);
    });
  });

  manageKitsTbody.querySelectorAll(".delete-kit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (confirm("Tem certeza que deseja excluir este kit de aula?")) {
        try {
          await deleteKit(id);
          showSuccess("Kit excluído com sucesso.");
          await loadInitialData();
        } catch (err) {
          console.error("Erro ao excluir kit:", err);
          showError("Erro ao excluir kit: " + err.message);
        }
      }
    });
  });
}

function openEditModal(kit) {
  kitIdInput.value = kit.id;
  kitNameInput.value = kit.name;
  kitTargetClassInput.value = kit.targetClass || "";
  kitDescriptionInput.value = kit.description || "";
  draftKitItems = Array.from(kit.items || []);

  kitModalTitle.innerHTML = `<i class="bi bi-pencil text-primary me-1"></i> Editar Kit de Aula Prática`;
  renderDraftKitItems();
  getKitModal()?.show();
}

function resetKitForm() {
  kitIdInput.value = "";
  kitNameInput.value = "";
  kitTargetClassInput.value = "";
  kitDescriptionInput.value = "";
  draftKitItems = [];
  kitFormError.classList.add("d-none");
  kitModalTitle.innerHTML = `<i class="bi bi-box-seam-fill text-primary me-1"></i> Criar Kit de Aula Prática`;
  renderDraftKitItems();
}

function renderDraftKitItems() {
  kitComponentsCountEl.textContent = `${draftKitItems.length} componente(s)`;

  if (draftKitItems.length === 0) {
    kitItemsTbody.innerHTML = `
      <tr>
        <td colspan="4" class="ps-2 py-3 text-body-secondary small text-center">Nenhum componente adicionado ainda.</td>
      </tr>`;
    return;
  }

  kitItemsTbody.innerHTML = draftKitItems
    .map((item, idx) => `
      <tr>
        <td class="ps-2 py-1 fw-medium small">${escapeHtml(item.componentTypeName)}</td>
        <td class="py-1 small text-body-secondary">${escapeHtml(item.internalCode || "-")}</td>
        <td class="py-1">
          <input
            type="number"
            class="form-control form-control-sm py-0 qty-input"
            style="width: 70px;"
            min="1"
            value="${item.quantity}"
            data-index="${idx}"
          >
        </td>
        <td class="pe-2 py-1 text-end">
          <button type="button" class="btn btn-sm btn-link text-danger p-0 remove-item-btn" data-index="${idx}">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`)
    .join("");

  kitItemsTbody.querySelectorAll(".qty-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const idx = Number(input.dataset.index);
      const val = Number(input.value);
      if (val > 0 && draftKitItems[idx]) {
        draftKitItems[idx].quantity = val;
      }
    });
  });

  kitItemsTbody.querySelectorAll(".remove-item-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      draftKitItems.splice(idx, 1);
      renderDraftKitItems();
    });
  });
}

/* =========================== HISTÓRICO GERAL =========================== */

async function renderHistoryTable() {
  try {
    const history = await listAllKitLoans(50);
    if (history.length === 0) {
      kitHistoryTbody.innerHTML = `
        <tr>
          <td class="ps-3 py-3 text-body-secondary small" colspan="5">Nenhuma movimentação de kit registrada ainda.</td>
        </tr>`;
      return;
    }

    kitHistoryTbody.innerHTML = history
      .map((item) => {
        const isReturned = item.status === "DEVOLVIDO" || item.returnedAt;
        return `
        <tr>
          <td class="ps-3 py-2 fw-semibold">${escapeHtml(item.kitName)}</td>
          <td class="py-2 small">${escapeHtml(item.userName)}</td>
          <td class="py-2">
            <span class="badge ${isReturned ? "bg-secondary-subtle text-body border" : "bg-primary-subtle text-primary border border-primary-subtle"}">
              ${isReturned ? "Devolvido" : "Ativo (Em posse)"}
            </span>
          </td>
          <td class="py-2 small text-body-secondary">${formatDateTime(item.borrowedAt)}</td>
          <td class="pe-3 py-2 small text-body-secondary">${isReturned ? formatDateTime(item.returnedAt) : "-"}</td>
        </tr>`;
      })
      .join("");
  } catch (err) {
    console.error("Erro ao carregar histórico de kits:", err);
  }
}

function showFormError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none");
}
