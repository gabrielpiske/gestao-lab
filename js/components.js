// js/components.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import {
  listComponents,
  listComponentTypes,
  listComponentKits,
  createComponentKit,
  deleteComponentKit,
  createComponentLoan,
} from "./data.js";
import { escapeHtml, debounce, showSuccess, showError } from "./utils.js";

const user = await requireAuth();
renderLayout(user, "components");

const isStaff = ["ADMIN", "DOCENTE", "ALUNO"].includes(user.role);
const canManageKits = ["ADMIN", "DOCENTE"].includes(user.role);

if (isStaff) {
  document.getElementById("new-component-link").classList.remove("d-none");
  document.getElementById("reserve-components-btn").classList.remove("d-none");
}
if (canManageKits) {
  document.getElementById("manage-kits-btn").classList.remove("d-none");
}

const searchInput = document.getElementById("filter-search");
const typeSelect = document.getElementById("filter-type");
const availabilitySelect = document.getElementById("filter-availability");
const tbody = document.getElementById("components-tbody");

// Modais Bootstrap
const resModalEl = document.getElementById("component-reservation-modal");
const kitsModalEl = document.getElementById("manage-kits-modal");

let resModalInstance = resModalEl && window.bootstrap?.Modal ? new bootstrap.Modal(resModalEl) : null;
let kitsModalInstance = kitsModalEl && window.bootstrap?.Modal ? new bootstrap.Modal(kitsModalEl) : null;

// Cache local de componentes e kits
let loadedComponents = [];
let loadedKits = [];
let cartItems = []; // [{ componentId, componentTypeName, quantity, available }]
let newKitItems = []; // [{ componentId, componentTypeName, quantity }]

await loadTypeOptions();
await loadComponents();

searchInput.addEventListener("input", debounce(loadComponents, 250));
typeSelect.addEventListener("change", loadComponents);
availabilitySelect.addEventListener("change", loadComponents);

/* ============================== RENDERIZAÇÃO DA TABELA ============================== */

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
  tbody.innerHTML = `<tr><td class="ps-3 py-3 text-body-secondary small" colspan="6">Carregando...</td></tr>`;
  try {
    const items = await listComponents({
      typeId: typeSelect.value || undefined,
      availability: availabilitySelect.value || undefined,
      q: searchInput.value.trim() || undefined,
    });
    loadedComponents = items;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td class="ps-3 py-3 text-body-secondary small" colspan="6">Nenhum componente encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map((c) => {
        const reserved = c.reservedQuantity || 0;
        const available = Math.max(0, c.quantity - reserved);
        const hasReserved = reserved > 0;

        let qtyBadgeHtml = "";
        if (hasReserved) {
          qtyBadgeHtml = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1" style="font-size:0.7rem;">${reserved} em uso</span>`;
        }

        const availClass = available === 0 ? "text-danger fw-semibold" : c.critical ? "text-warning fw-semibold" : "";

        return `
        <tr>
          <td class="ps-3 fw-medium">
            <a href="component-form.html?id=${c.id}" class="text-body text-decoration-none hover-underline">
              ${escapeHtml(c.componentTypeName)}
            </a>
          </td>
          <td class="text-body-secondary">${escapeHtml(c.internalCode) || "—"}</td>
          <td>
            <span class="${availClass}">${available} disp. / ${c.quantity} total</span>
            ${qtyBadgeHtml}
          </td>
          <td class="text-body-secondary">${escapeHtml(c.location) || "—"}</td>
          <td class="text-body-secondary">${escapeHtml(c.manufacturer) || "—"}</td>
          <td class="text-end pe-3">
            ${
              isStaff && available > 0
                ? `<button class="btn btn-sm btn-outline-primary py-0 px-2 quick-reserve-btn" data-id="${c.id}" style="font-size: 0.75rem;">
                     <i class="bi bi-box-seam me-1"></i>Reservar
                   </button>`
                : `<span class="text-body-secondary extra-small">Indisponível</span>`
            }
          </td>
        </tr>`;
      })
      .join("");

    // Botões de reserva rápida na linha
    tbody.querySelectorAll(".quick-reserve-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const compId = btn.dataset.id;
        openReservationModalWithComponent(compId);
      });
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td class="ps-3 py-3 text-danger small" colspan="6">Erro ao carregar componentes: ${escapeHtml(err.message)}</td></tr>`;
  }
}

/* ============================== MODAL DE RESERVA / RETIRADA ============================== */

const reserveMainBtn = document.getElementById("reserve-components-btn");
const compSelectEl = document.getElementById("res-comp-select");
const kitSelectEl = document.getElementById("res-kit-select");
const loadKitBtn = document.getElementById("load-kit-btn");
const addToCartBtn = document.getElementById("add-to-cart-btn");
const cartTbody = document.getElementById("res-cart-tbody");
const cartCountSpan = document.getElementById("cart-items-count");
const resForm = document.getElementById("component-reservation-form");

if (reserveMainBtn) {
  reserveMainBtn.addEventListener("click", () => {
    openReservationModalWithComponent();
  });
}

function openReservationModalWithComponent(preselectedId = null) {
  cartItems = [];
  renderCart();
  populateReservationDropdowns();

  // Data padrão = hoje
  const dateInput = document.getElementById("res-date-input");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }

  if (preselectedId) {
    const comp = loadedComponents.find((c) => c.id === preselectedId);
    if (comp) {
      const available = Math.max(0, comp.quantity - (comp.reservedQuantity || 0));
      if (available > 0) {
        cartItems.push({
          componentId: comp.id,
          componentTypeName: comp.componentTypeName,
          quantity: 1,
          available,
        });
        renderCart();
      }
    }
  }

  resModalInstance?.show();
}

async function populateReservationDropdowns() {
  // Popula componentes
  compSelectEl.innerHTML = `<option value="">Selecione o componente...</option>` +
    loadedComponents
      .map((c) => {
        const available = Math.max(0, c.quantity - (c.reservedQuantity || 0));
        const disabled = available === 0 ? "disabled" : "";
        return `<option value="${c.id}" ${disabled}>${escapeHtml(c.componentTypeName)} (Disp: ${available})</option>`;
      })
      .join("");

  // Popula kits
  try {
    loadedKits = await listComponentKits();
    kitSelectEl.innerHTML = `<option value="">Selecione um kit didático cadastrado...</option>` +
      loadedKits.map((k) => `<option value="${k.id}">${escapeHtml(k.name)} (${k.items?.length || 0} itens)</option>`).join("");
  } catch (err) {
    console.error("Erro ao carregar kits:", err);
  }
}

addToCartBtn?.addEventListener("click", () => {
  const compId = compSelectEl.value;
  const qty = parseInt(document.getElementById("res-comp-qty").value, 10) || 1;

  if (!compId) {
    showError("Selecione um componente para adicionar.");
    return;
  }

  const comp = loadedComponents.find((c) => c.id === compId);
  if (!comp) return;

  const available = Math.max(0, comp.quantity - (comp.reservedQuantity || 0));
  const existingIndex = cartItems.findIndex((item) => item.componentId === compId);

  const currentCartQty = existingIndex >= 0 ? cartItems[existingIndex].quantity : 0;
  const newTotalQty = currentCartQty + qty;

  if (newTotalQty > available) {
    showError(`Quantidade solicitada (${newTotalQty}) excede o disponível em estoque (${available}).`);
    return;
  }

  if (existingIndex >= 0) {
    cartItems[existingIndex].quantity = newTotalQty;
  } else {
    cartItems.push({
      componentId: comp.id,
      componentTypeName: comp.componentTypeName,
      quantity: qty,
      available,
    });
  }

  renderCart();
  compSelectEl.value = "";
  document.getElementById("res-comp-qty").value = "1";
});

loadKitBtn?.addEventListener("click", () => {
  const kitId = kitSelectEl.value;
  if (!kitId) {
    showError("Selecione um kit para carregar.");
    return;
  }

  const kit = loadedKits.find((k) => k.id === kitId);
  if (!kit || !kit.items) return;

  let addedCount = 0;

  for (const item of kit.items) {
    const comp = loadedComponents.find((c) => c.id === item.componentId);
    if (!comp) continue;

    const available = Math.max(0, comp.quantity - (comp.reservedQuantity || 0));
    const requested = item.quantity || 1;

    const existingIndex = cartItems.findIndex((cItem) => cItem.componentId === item.componentId);
    const currentQty = existingIndex >= 0 ? cartItems[existingIndex].quantity : 0;
    const finalQty = Math.min(available, currentQty + requested);

    if (finalQty > 0) {
      if (existingIndex >= 0) {
        cartItems[existingIndex].quantity = finalQty;
      } else {
        cartItems.push({
          componentId: comp.id,
          componentTypeName: comp.componentTypeName,
          quantity: finalQty,
          available,
        });
      }
      addedCount++;
    }
  }

  renderCart();
  showSuccess(`${addedCount} item(ns) do kit '${kit.name}' foram adicionados ao carrinho!`);
});

function renderCart() {
  cartCountSpan.textContent = cartItems.length;

  if (cartItems.length === 0) {
    cartTbody.innerHTML = `<tr><td colspan="3" class="text-center text-body-secondary py-3">Nenhum componente adicionado à reserva.</td></tr>`;
    return;
  }

  cartTbody.innerHTML = cartItems
    .map(
      (item, idx) => `
    <tr>
      <td class="ps-2 fw-medium">${escapeHtml(item.componentTypeName)}</td>
      <td class="text-center">
        <input
          type="number"
          class="form-control form-control-sm text-center cart-qty-input ms-auto me-auto"
          style="max-width: 80px;"
          data-idx="${idx}"
          value="${item.quantity}"
          min="1"
          max="${item.available}"
        />
      </td>
      <td class="text-end pe-3">
        <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 remove-cart-btn" data-idx="${idx}">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`
    )
    .join("");

  cartTbody.querySelectorAll(".cart-qty-input").forEach((input) => {
    input.addEventListener("change", () => {
      const idx = parseInt(input.dataset.idx, 10);
      let val = parseInt(input.value, 10) || 1;
      const max = cartItems[idx].available;
      if (val > max) val = max;
      if (val < 1) val = 1;
      cartItems[idx].quantity = val;
      input.value = val;
    });
  });

  cartTbody.querySelectorAll(".remove-cart-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      cartItems.splice(idx, 1);
      renderCart();
    });
  });
}

resForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (cartItems.length === 0) {
    showError("Adicione ao menos um componente ao carrinho da reserva.");
    return;
  }

  const benchOrClass = document.getElementById("res-bench-input").value.trim();
  const expectedReturnAt = document.getElementById("res-date-input").value;
  const notes = document.getElementById("res-notes-input").value.trim();

  const confirmBtn = document.getElementById("confirm-reservation-btn");
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Gravando...`;

  try {
    await createComponentLoan(
      {
        benchOrClass,
        expectedReturnAt,
        notes,
        items: cartItems.map((i) => ({ componentId: i.componentId, quantity: i.quantity })),
      },
      user
    );

    showSuccess("Reserva de componentes registrada com sucesso!");
    resModalInstance?.hide();
    resForm.reset();
    cartItems = [];
    await loadComponents();
  } catch (err) {
    console.error(err);
    showError("Erro ao registrar reserva: " + err.message);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `<i class="bi bi-check2-circle me-1"></i> Finalizar Reserva`;
  }
});

/* ============================== MODAL DE GERENCIAMENTO DE KITS ============================== */

const manageKitsBtn = document.getElementById("manage-kits-btn");
const kitsContainer = document.getElementById("kits-list-container");
const showNewKitBtn = document.getElementById("show-new-kit-form-btn");
const newKitCard = document.getElementById("new-kit-form-card");
const kitCompSelect = document.getElementById("kit-comp-select");
const addKitItemBtn = document.getElementById("add-kit-item-btn");
const kitBuilderTbody = document.getElementById("kit-builder-tbody");
const saveKitBtn = document.getElementById("save-kit-btn");
const cancelKitBtn = document.getElementById("cancel-kit-btn");

if (manageKitsBtn) {
  manageKitsBtn.addEventListener("click", () => {
    openManageKitsModal();
  });
}

async function openManageKitsModal() {
  newKitCard.classList.add("d-none");
  newKitItems = [];
  renderKitBuilder();

  kitCompSelect.innerHTML = `<option value="">Selecione o componente...</option>` +
    loadedComponents.map((c) => `<option value="${c.id}">${escapeHtml(c.componentTypeName)}</option>`).join("");

  await renderKitsList();
  kitsModalInstance?.show();
}

showNewKitBtn?.addEventListener("click", () => {
  newKitCard.classList.toggle("d-none");
});

cancelKitBtn?.addEventListener("click", () => {
  newKitCard.classList.add("d-none");
  newKitItems = [];
  renderKitBuilder();
});

addKitItemBtn?.addEventListener("click", () => {
  const compId = kitCompSelect.value;
  const qty = parseInt(document.getElementById("kit-comp-qty").value, 10) || 1;

  if (!compId) {
    showError("Selecione um componente para o kit.");
    return;
  }

  const comp = loadedComponents.find((c) => c.id === compId);
  if (!comp) return;

  const existing = newKitItems.find((i) => i.componentId === compId);
  if (existing) {
    existing.quantity += qty;
  } else {
    newKitItems.push({
      componentId: comp.id,
      componentTypeName: comp.componentTypeName,
      quantity: qty,
    });
  }

  renderKitBuilder();
  kitCompSelect.value = "";
  document.getElementById("kit-comp-qty").value = "1";
});

function renderKitBuilder() {
  if (newKitItems.length === 0) {
    kitBuilderTbody.innerHTML = `<tr><td colspan="3" class="text-center text-body-secondary py-2">Nenhum item adicionado ao kit.</td></tr>`;
    return;
  }

  kitBuilderTbody.innerHTML = newKitItems
    .map(
      (item, idx) => `
    <tr>
      <td>${escapeHtml(item.componentTypeName)}</td>
      <td class="text-center font-bold">${item.quantity}</td>
      <td class="text-end pe-2">
        <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 remove-kit-item-btn" data-idx="${idx}">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`
    )
    .join("");

  kitBuilderTbody.querySelectorAll(".remove-kit-item-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      newKitItems.splice(idx, 1);
      renderKitBuilder();
    });
  });
}

saveKitBtn?.addEventListener("click", async () => {
  const name = document.getElementById("kit-name-input").value.trim();
  const description = document.getElementById("kit-desc-input").value.trim();

  if (!name) {
    showError("Informe o nome do kit.");
    return;
  }
  if (newKitItems.length === 0) {
    showError("Adicione ao menos um componente ao kit.");
    return;
  }

  saveKitBtn.disabled = true;
  saveKitBtn.textContent = "Salvando...";

  try {
    await createComponentKit({ name, description, items: newKitItems }, user);
    showSuccess("Kit didático cadastrado com sucesso!");
    document.getElementById("kit-name-input").value = "";
    document.getElementById("kit-desc-input").value = "";
    newKitItems = [];
    newKitCard.classList.add("d-none");
    renderKitBuilder();
    await renderKitsList();
  } catch (err) {
    console.error(err);
    showError("Erro ao criar kit: " + err.message);
  } finally {
    saveKitBtn.disabled = false;
    saveKitBtn.textContent = "Salvar Kit";
  }
});

async function renderKitsList() {
  kitsContainer.innerHTML = `<div class="text-center py-3 text-body-secondary">Carregando kits...</div>`;
  try {
    const kits = await listComponentKits();
    loadedKits = kits;

    if (kits.length === 0) {
      kitsContainer.innerHTML = `
        <div class="text-center py-4 text-body-secondary border rounded">
          <i class="bi bi-collection fs-3 d-block mb-1"></i>
          Nenhum kit didático cadastrado ainda.
        </div>`;
      return;
    }

    kitsContainer.innerHTML = `
      <div class="list-group gap-2">
        ${kits
          .map(
            (k) => `
          <div class="list-group-item d-flex justify-content-between align-items-center p-3 rounded border">
            <div>
              <div class="fw-bold">${escapeHtml(k.name)}</div>
              ${k.description ? `<div class="text-body-secondary small mb-1">${escapeHtml(k.description)}</div>` : ""}
              <div class="small text-body-secondary">
                Componentes: ${k.items?.map((i) => `${i.quantity}x ${escapeHtml(i.componentTypeName)}`).join(", ") || "Nenhum"}
              </div>
            </div>
            <div>
              <button class="btn btn-sm btn-outline-danger delete-kit-btn" data-id="${k.id}">
                <i class="bi bi-trash"></i> Excluir
              </button>
            </div>
          </div>`
          )
          .join("")}
      </div>`;

    kitsContainer.querySelectorAll(".delete-kit-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Deseja realmente excluir este kit didático?")) return;
        const kitId = btn.dataset.id;
        try {
          await deleteComponentKit(kitId);
          showSuccess("Kit excluído com sucesso!");
          await renderKitsList();
        } catch (err) {
          console.error(err);
          showError("Erro ao excluir kit: " + err.message);
        }
      });
    });
  } catch (err) {
    console.error(err);
    kitsContainer.innerHTML = `<div class="text-danger py-2">Erro ao carregar kits: ${escapeHtml(err.message)}</div>`;
  }
}
