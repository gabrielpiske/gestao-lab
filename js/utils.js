// js/utils.js

/** Escapa texto para uso seguro dentro de innerHTML (evita XSS). */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Formata uma data (Firestore Timestamp, Date ou string ISO) como dd/mm/aaaa. */
export function formatDate(value) {
  if (!value) return "—";
  const date = toJsDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR");
}

/** Formata data e hora como dd/mm/aaaa HH:MM. */
export function formatDateTime(value) {
  if (!value) return "—";
  const date = toJsDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR") + " " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Converte "há quanto tempo" de forma simples, estilo Linear/Notion. */
export function timeAgo(value) {
  const date = toJsDate(value);
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ontem";
  if (diffD < 30) return `há ${diffD} dias`;
  return formatDate(value);
}

function toJsDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate(); // Firestore Timestamp
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Exibe um toast Bootstrap no canto da tela. Cria o container se não existir. */
export function showToast(message, variant = "primary") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container position-fixed bottom-0 end-0 p-3";
    container.style.zIndex = "1080";
    document.body.appendChild(container);
  }

  const toastEl = document.createElement("div");
  toastEl.className = `toast align-items-center text-bg-${variant} border-0`;
  toastEl.setAttribute("role", "alert");
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escapeHtml(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  container.appendChild(toastEl);

  const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
  toast.show();
  toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
}

export function showError(message) {
  showToast(message, "danger");
}

export function showSuccess(message) {
  showToast(message, "success");
}

/** Debounce simples para campos de busca. */
export function debounce(fn, delayMs = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

/** Lê parâmetros da querystring da página atual. */
export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** Normaliza texto para comparação de busca (minúsculas, sem acento). */
export function normalizeSearch(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const STOCK_MOVEMENT_REASONS = [
  { value: "COMPRA", label: "Compra" },
  { value: "AULA_PRATICA", label: "Aula prática" },
  { value: "DESCARTE", label: "Descarte" },
  { value: "AJUSTE_INVENTARIO", label: "Ajuste de inventário" },
];

export const TOOL_CONDITIONS = [
  { value: "NOVO", label: "Novo" },
  { value: "BOM", label: "Bom" },
  { value: "DESGASTADO", label: "Desgastado" },
  { value: "DANIFICADO", label: "Danificado" },
];

export const TOOL_STATUS_LABELS = {
  DISPONIVEL: { label: "Disponível", badge: "success" },
  EMPRESTADA: { label: "Emprestada", badge: "primary" },
  MANUTENCAO: { label: "Manutenção", badge: "warning" },
  INDISPONIVEL: { label: "Indisponível", badge: "secondary" },
};

export const MICROCONTROLLER_FAMILIES = [
  { value: "ARDUINO_AVR", label: "Arduino / AVR (ATmega328, Nano, Mega)" },
  { value: "ESP32_ESP8266", label: "Espressif (ESP32, ESP8266, NodeMCU)" },
  { value: "RPI_PICO", label: "Raspberry Pi (Pico, RP2040, RP2350)" },
  { value: "ARM_STM32", label: "ARM / STM32 (BluePill, Nucleo)" },
  { value: "PIC_MICROCHIP", label: "Microchip PIC / dsPIC" },
  { value: "MICROBIT", label: "BBC micro:bit" },
  { value: "OUTROS", label: "Outros / Kits Didáticos" },
];

export const MICROCONTROLLER_CONNECTIVITY = [
  { value: "USB_APENAS", label: "Apenas USB" },
  { value: "WIFI_BLUETOOTH", label: "Wi-Fi + Bluetooth" },
  { value: "WIFI", label: "Wi-Fi" },
  { value: "BLUETOOTH", label: "Bluetooth / BLE" },
  { value: "LORA_ZIGBEE", label: "LoRa / Zigbee / RF" },
  { value: "SEM_WIRELESS", label: "Sem conectividade sem fio" },
];

export const MICROCONTROLLER_STATUS_LABELS = {
  DISPONIVEL: { label: "Disponível", badge: "success" },
  EMPRESTADA: { label: "Emprestado", badge: "primary" },
  MANUTENCAO: { label: "Manutenção", badge: "warning" },
  INDISPONIVEL: { label: "Indisponível", badge: "secondary" },
};

