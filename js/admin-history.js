// js/admin-history.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import { adminAuditSummary, loadUnifiedAuditData } from "./data.js";
import {
  escapeHtml,
  formatDateTime,
  formatDate,
  timeAgo,
  debounce,
  normalizeSearch,
  showError,
  showSuccess,
  STOCK_MOVEMENT_REASONS,
} from "./utils.js";

const user = await requireAuth({ requireAdmin: true });
renderLayout(user, "admin-history");

const reasonLabels = Object.fromEntries(
  STOCK_MOVEMENT_REASONS.map((r) => [r.value, r.label])
);

// Elementos da UI - KPIs
const kpiMovements = document.getElementById("kpi-movements");
const kpiLoans = document.getElementById("kpi-loans");
const kpiActiveLoans = document.getElementById("kpi-active-loans");
const kpiUsers = document.getElementById("kpi-users");

// Elementos da UI - Filtros da Trilha
const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search-btn");
const filterSource = document.getElementById("filter-source");
const filterStatus = document.getElementById("filter-status");
const filterPeriod = document.getElementById("filter-period");
const activeUserFilterBadge = document.getElementById("active-user-filter-badge");
const filterUserNameEl = document.getElementById("filter-user-name");
const removeUserFilterBtn = document.getElementById("remove-user-filter-btn");

// Elementos da UI - Tabela de Auditoria
const auditTbody = document.getElementById("audit-tbody");
const auditResultsCount = document.getElementById("audit-results-count");
const prevPageBtn = document.getElementById("prev-page-btn");
const nextPageBtn = document.getElementById("next-page-btn");
const pageIndicator = document.getElementById("page-indicator");

// Elementos da UI - Hub de Usuários
const hubUsersTbody = document.getElementById("hub-users-tbody");
const searchHubUser = document.getElementById("search-hub-user");

// Elementos da UI - Ações Globais e Modal
const refreshBtn = document.getElementById("refresh-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
const recordModalTitle = document.getElementById("record-modal-title");
const recordModalBody = document.getElementById("record-modal-body");
let recordModalInstance = null;

// Estado local
let fullHistory = [];
let userStatsList = [];
let filteredHistory = [];
let selectedUserId = null;
let selectedUserName = "";
let currentPage = 1;
const PAGE_SIZE = 25;

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
  const modalEl = document.getElementById("record-detail-modal");
  if (modalEl && window.bootstrap?.Modal) {
    recordModalInstance = new bootstrap.Modal(modalEl);
  }
});

// Event Listeners
refreshBtn.addEventListener("click", () => loadData(true));
exportCsvBtn.addEventListener("click", exportFilteredHistoryCsv);

searchInput.addEventListener("input", () => {
  if (searchInput.value.trim()) {
    clearSearchBtn.classList.remove("d-none");
  } else {
    clearSearchBtn.classList.add("d-none");
  }
  debounceApplyFilters();
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearSearchBtn.classList.add("d-none");
  applyFilters();
});

filterSource.addEventListener("change", applyFilters);
filterStatus.addEventListener("change", applyFilters);
filterPeriod.addEventListener("change", applyFilters);

removeUserFilterBtn.addEventListener("click", () => {
  clearUserFilter();
});

searchHubUser.addEventListener("input", debounce(renderHubUsersTable, 200));

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderAuditTablePage();
  }
});

nextPageBtn.addEventListener("click", () => {
  const totalPages = Math.ceil(filteredHistory.length / PAGE_SIZE) || 1;
  if (currentPage < totalPages) {
    currentPage++;
    renderAuditTablePage();
  }
});

const debounceApplyFilters = debounce(applyFilters, 250);

// Carregamento principal
await loadData();

async function loadData(isRefresh = false) {
  setLoadingState(true);
  try {
    // 1. Carregar resumo e contagens agregadas (Firestore getCountFromServer)
    const summary = await adminAuditSummary();
    renderKpiSummary(summary);

    // 2. Carregar dados unificados (movimentações + reservas + usuários)
    const data = await loadUnifiedAuditData(250);
    fullHistory = data.history;
    userStatsList = data.userStats;

    // Se o total de usuários com registros for maior, ajustar KPI
    const activeUsersCount = userStatsList.filter(
      (u) => u.totalLoansCount > 0 || u.movementsCount > 0
    ).length;
    kpiUsers.textContent = activeUsersCount || summary.totalUsersCount;

    // 3. Renderizar Hub e Trilha
    renderHubUsersTable();
    applyFilters();

    if (isRefresh) {
      showSuccess("Histórico e métricas atualizados!");
    }
  } catch (err) {
    console.error("Erro ao carregar auditoria:", err);
    showError("Erro ao carregar histórico: " + err.message);
    auditTbody.innerHTML = `
      <tr>
        <td class="ps-3 py-4 text-danger small" colspan="6">
          <i class="bi bi-exclamation-triangle me-1"></i> Erro ao carregar dados: ${escapeHtml(err.message)}
        </td>
      </tr>`;
    hubUsersTbody.innerHTML = `
      <tr>
        <td class="ps-3 py-4 text-danger small" colspan="7">
          <i class="bi bi-exclamation-triangle me-1"></i> Erro ao carregar usuários: ${escapeHtml(err.message)}
        </td>
      </tr>`;
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(loading) {
  if (loading) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Carregando...`;
  } else {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = `<i class="bi bi-arrow-clockwise"></i> Atualizar`;
  }
}

function renderKpiSummary(summary) {
  kpiMovements.textContent = Number(summary.totalMovementsCount || 0).toLocaleString("pt-BR");
  kpiLoans.textContent = Number(summary.totalLoansCount || 0).toLocaleString("pt-BR");
  kpiActiveLoans.textContent = Number(summary.activeLoansCount || 0).toLocaleString("pt-BR");
  kpiUsers.textContent = Number(summary.totalUsersCount || 0).toLocaleString("pt-BR");
}

/* =========================== HUB DE USUÁRIOS =========================== */

function renderHubUsersTable() {
  const filterText = normalizeSearch(searchHubUser.value.trim());

  let list = userStatsList;
  if (filterText) {
    list = list.filter(
      (u) =>
        normalizeSearch(u.name).includes(filterText) ||
        normalizeSearch(u.email).includes(filterText) ||
        normalizeSearch(u.role).includes(filterText)
    );
  }

  if (list.length === 0) {
    hubUsersTbody.innerHTML = `
      <tr>
        <td class="ps-3 py-4 text-body-secondary small text-center" colspan="7">
          Nenhum usuário encontrado para a busca informada.
        </td>
      </tr>`;
    return;
  }

  hubUsersTbody.innerHTML = list
    .map((u) => {
      const isSelected = selectedUserId === u.uid;
      const roleBadge = getRoleBadge(u.role);
      const activeBadge = u.active
        ? ""
        : `<span class="badge bg-secondary ms-1">Inativo</span>`;

      return `
      <tr class="${isSelected ? "table-primary" : ""}">
        <td class="ps-3 py-2">
          <div class="d-flex align-items-center gap-2">
            <div class="avatar-circle bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width: 32px; height: 32px; font-size: 0.8rem;">
              ${escapeHtml((u.name || "U")[0].toUpperCase())}
            </div>
            <div>
              <div class="fw-semibold small mb-0">${escapeHtml(u.name)} ${activeBadge}</div>
              <div class="text-body-secondary" style="font-size: 0.75rem;">${escapeHtml(u.email || "Sem email")}</div>
            </div>
          </div>
        </td>
        <td class="py-2">${roleBadge}</td>
        <td class="py-2 text-center">
          <span class="badge bg-secondary-subtle text-body border fw-bold">${u.totalLoansCount}</span>
        </td>
        <td class="py-2 text-center">
          ${
            u.activeLoansCount > 0
              ? `<span class="badge bg-primary">${u.activeLoansCount} ativos ${
                  u.overdueLoansCount > 0 ? `(${u.overdueLoansCount} atrasados)` : ""
                }</span>`
              : `<span class="text-body-secondary small">0</span>`
          }
        </td>
        <td class="py-2 text-center">
          <span class="text-body-secondary small">${u.returnedLoansCount}</span>
        </td>
        <td class="py-2 text-center">
          <span class="badge bg-light text-dark border">${u.movementsCount}</span>
        </td>
        <td class="pe-3 py-2 text-end">
          <button
            class="btn btn-sm btn-outline-primary py-1 px-2 filter-user-btn"
            data-uid="${escapeHtml(u.uid)}"
            data-name="${escapeHtml(u.name)}"
            title="Filtrar histórico deste usuário"
          >
            <i class="bi bi-filter me-1"></i> Ver Histórico
          </button>
        </td>
      </tr>`;
    })
    .join("");

  hubUsersTbody.querySelectorAll(".filter-user-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const uid = btn.dataset.uid;
      const name = btn.dataset.name;
      setUserFilter(uid, name);
    });
  });
}

function getRoleBadge(role) {
  const map = {
    ADMIN: '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Admin</span>',
    DOCENTE: '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Docente</span>',
    ALUNO: '<span class="badge bg-info-subtle text-info border border-info-subtle">Aluno</span>',
    VISITANTE: '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Visitante</span>',
  };
  return map[role] || `<span class="badge bg-secondary">${escapeHtml(role)}</span>`;
}

function setUserFilter(uid, name) {
  selectedUserId = uid;
  selectedUserName = name;

  filterUserNameEl.textContent = name;
  activeUserFilterBadge.classList.remove("d-none");

  // Trocar para a aba da Trilha
  const timelineTabBtn = document.getElementById("tab-timeline-btn");
  if (timelineTabBtn && window.bootstrap?.Tab) {
    const tabInstance = new bootstrap.Tab(timelineTabBtn);
    tabInstance.show();
  }

  renderHubUsersTable();
  applyFilters();
}

function clearUserFilter() {
  selectedUserId = null;
  selectedUserName = "";
  activeUserFilterBadge.classList.add("d-none");
  renderHubUsersTable();
  applyFilters();
}

/* =========================== FILTROS E AUDITORIA =========================== */

function applyFilters() {
  const q = normalizeSearch(searchInput.value.trim());
  const source = filterSource.value;
  const status = filterStatus.value;
  const period = filterPeriod.value;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  filteredHistory = fullHistory.filter((item) => {
    // 1. Filtro de Usuário Específico (Hub)
    if (selectedUserId && item.userId !== selectedUserId) {
      return false;
    }

    // 2. Filtro de Origem / Tipo
    if (source && item.sourceType !== source) {
      return false;
    }

    // 3. Filtro de Status
    if (status && item.status !== status) {
      return false;
    }

    // 4. Filtro de Período
    if (period && item.eventDate) {
      if (period === "TODAY" && item.eventDate < todayStart) return false;
      if (period === "7D" && item.eventDate < sevenDaysAgo) return false;
      if (period === "30D" && item.eventDate < thirtyDaysAgo) return false;
    }

    // 5. Busca textual livre (usuário, item, código, notas, motivo)
    if (q) {
      const matchSearch =
        normalizeSearch(item.userName).includes(q) ||
        normalizeSearch(item.itemTitle).includes(q) ||
        normalizeSearch(item.itemSubtitle).includes(q) ||
        normalizeSearch(item.reason).includes(q) ||
        normalizeSearch(item.notes).includes(q) ||
        normalizeSearch(item.actionLabel).includes(q);

      if (!matchSearch) return false;
    }

    return true;
  });

  currentPage = 1;
  renderAuditTablePage();
}

function renderAuditTablePage() {
  const total = filteredHistory.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredHistory.slice(startIndex, startIndex + PAGE_SIZE);

  auditResultsCount.textContent = total === 0
    ? "Nenhum registro encontrado"
    : `Exibindo ${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, total)} de ${total} registros`;

  pageIndicator.textContent = `${currentPage} / ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;

  if (pageItems.length === 0) {
    auditTbody.innerHTML = `
      <tr>
        <td class="ps-3 py-4 text-body-secondary small text-center" colspan="6">
          <i class="bi bi-inbox fs-4 d-block mb-1"></i>
          Nenhum registro encontrado para os filtros selecionados.
        </td>
      </tr>`;
    return;
  }

  auditTbody.innerHTML = pageItems
    .map((item, idx) => {
      const indexInList = startIndex + idx;
      return `
      <tr class="audit-row" style="cursor: pointer;" data-index="${indexInList}" title="Clique para ver todos os detalhes">
        <td class="ps-3 py-2">
          <div class="d-flex align-items-center gap-2">
            <span class="p-1 rounded-2 bg-${item.badgeClass}-subtle text-${item.badgeClass}">
              <i class="bi ${item.icon}"></i>
            </span>
            <div>
              <span class="fw-semibold small d-block">${escapeHtml(item.sourceLabel)}</span>
              <span class="text-body-secondary" style="font-size: 0.75rem;">ID: ${escapeHtml(item.id.slice(0, 8))}...</span>
            </div>
          </div>
        </td>
        <td class="py-2">
          <div class="fw-medium small">${escapeHtml(item.itemTitle)}</div>
          ${
            item.itemSubtitle
              ? `<div class="text-body-secondary" style="font-size: 0.75rem;">${escapeHtml(item.itemSubtitle)}</div>`
              : ""
          }
        </td>
        <td class="py-2">
          <span class="badge text-bg-${item.statusBadge}">${escapeHtml(item.statusLabel)}</span>
        </td>
        <td class="py-2">
          <div class="small">
            ${
              item.sourceType === "MOVEMENT"
                ? `<strong>${item.quantity} un.</strong> <span class="text-body-secondary">(${escapeHtml(reasonLabels[item.reason] || item.reason)})</span>`
                : item.status === "DEVOLVIDO"
                ? `<span class="text-success"><i class="bi bi-check2 me-1"></i>Devolvido${item.returnedAt ? ` em ${formatDate(item.returnedAt)}` : ""}</span>`
                : item.isOverdue
                ? `<span class="text-danger"><i class="bi bi-exclamation-octagon me-1"></i>Previsto p/ ${formatDate(item.expectedReturnAt)}</span>`
                : `<span class="text-primary">Previsto p/ ${formatDate(item.expectedReturnAt)}</span>`
            }
          </div>
          ${
            item.notes
              ? `<div class="text-body-secondary text-truncate" style="max-width: 220px; font-size: 0.75rem;" title="${escapeHtml(item.notes)}">${escapeHtml(item.notes)}</div>`
              : ""
          }
        </td>
        <td class="py-2">
          <div class="small fw-medium">${escapeHtml(item.userName)}</div>
        </td>
        <td class="pe-3 py-2 text-end">
          <div class="small">${formatDateTime(item.eventDate)}</div>
          <div class="text-body-secondary" style="font-size: 0.75rem;">${timeAgo(item.eventDate)}</div>
        </td>
      </tr>`;
    })
    .join("");

  auditTbody.querySelectorAll(".audit-row").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = Number(row.dataset.index);
      const record = filteredHistory[idx];
      if (record) openRecordModal(record);
    });
  });
}

function openRecordModal(item) {
  if (!recordModalInstance) {
    const modalEl = document.getElementById("record-detail-modal");
    if (modalEl && window.bootstrap?.Modal) {
      recordModalInstance = new bootstrap.Modal(modalEl);
    }
  }

  recordModalTitle.innerHTML = `
    <i class="bi ${item.icon} me-1 text-${item.badgeClass}"></i>
    Detalhes da Alteração — ${escapeHtml(item.sourceLabel)}
  `;

  let detailsHtml = `
    <div class="list-group list-group-flush mb-3">
      <div class="list-group-item d-flex justify-content-between px-0">
        <span class="text-body-secondary">ID do Documento:</span>
        <code class="user-select-all">${escapeHtml(item.id)}</code>
      </div>
      <div class="list-group-item d-flex justify-content-between px-0">
        <span class="text-body-secondary">Item / Recurso:</span>
        <strong>${escapeHtml(item.itemTitle)}</strong>
      </div>
      <div class="list-group-item d-flex justify-content-between px-0">
        <span class="text-body-secondary">Usuário Responsável:</span>
        <span>${escapeHtml(item.userName)} <small class="text-body-secondary">(${escapeHtml(item.userId)})</small></span>
      </div>
      <div class="list-group-item d-flex justify-content-between px-0">
        <span class="text-body-secondary">Ação / Status:</span>
        <span class="badge text-bg-${item.statusBadge}">${escapeHtml(item.statusLabel)}</span>
      </div>
      <div class="list-group-item d-flex justify-content-between px-0">
        <span class="text-body-secondary">Data do Evento:</span>
        <span>${formatDateTime(item.eventDate)} (${timeAgo(item.eventDate)})</span>
      </div>`;

  if (item.sourceType === "MOVEMENT") {
    detailsHtml += `
      <div class="list-group-item d-flex justify-content-between px-0">
        <span class="text-body-secondary">Quantidade:</span>
        <strong>${item.quantity} unidades</strong>
      </div>
      <div class="list-group-item d-flex justify-content-between px-0">
        <span class="text-body-secondary">Motivo da Movimentação:</span>
        <span>${escapeHtml(reasonLabels[item.reason] || item.reason)}</span>
      </div>`;
  } else {
    detailsHtml += `
      <div class="list-group-item d-flex justify-content-between px-0">
        <span class="text-body-secondary">Devolução Prevista:</span>
        <span>${formatDate(item.expectedReturnAt)}</span>
      </div>
      <div class="list-group-item d-flex justify-content-between px-0">
        <span class="text-body-secondary">Devolução Efetiva:</span>
        <span>${item.returnedAt ? formatDateTime(item.returnedAt) : (item.status === "DEVOLVIDO" ? "Devolvido / Concluído" : "Pendente (Em aberto)")}</span>
      </div>`;
  }

  if (item.notes) {
    detailsHtml += `
      <div class="list-group-item px-0">
        <span class="text-body-secondary d-block mb-1">Observações / Notas:</span>
        <div class="p-2 rounded bg-body-tertiary">${escapeHtml(item.notes)}</div>
      </div>`;
  }

  detailsHtml += `</div>`;

  recordModalBody.innerHTML = detailsHtml;
  recordModalInstance?.show();
}

/* =========================== EXPORTAÇÃO CSV =========================== */

function exportFilteredHistoryCsv() {
  if (filteredHistory.length === 0) {
    showError("Não há registros para exportar com os filtros atuais.");
    return;
  }

  const headers = [
    "ID",
    "Tipo de Evento",
    "Item/Componente",
    "Ação/Status",
    "Quantidade",
    "Motivo",
    "Usuário",
    "Data do Evento",
    "Devolução Prevista",
    "Devolução Efetiva",
    "Observações",
  ];

  const rows = filteredHistory.map((item) => [
    `"${item.id}"`,
    `"${item.sourceLabel}"`,
    `"${(item.itemTitle || "").replace(/"/g, '""')}"`,
    `"${item.statusLabel}"`,
    item.quantity || 1,
    `"${(reasonLabels[item.reason] || item.reason || "").replace(/"/g, '""')}"`,
    `"${(item.userName || "").replace(/"/g, '""')}"`,
    `"${formatDateTime(item.eventDate)}"`,
    `"${formatDate(item.expectedReturnAt)}"`,
    `"${formatDateTime(item.returnedAt)}"`,
    `"${(item.notes || "").replace(/"/g, '""')}"`,
  ]);

  const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const todayStr = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `labtrack-auditoria-${todayStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showSuccess(`Exportados ${filteredHistory.length} registros com sucesso!`);
}
