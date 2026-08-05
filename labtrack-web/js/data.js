// js/data.js
//
// Camada de acesso ao Firestore otimizada – cache, paginação e deduplicação.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  startAfter,
  serverTimestamp,
  runTransaction,
  getCountFromServer,
  Timestamp,
  DocumentSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

/* ============================== CACHE & UTILITÁRIOS ============================== */
const CACHE_TTL = 300000; // 5 minutos
const cache = new Map();

function uid() {
  return crypto.randomUUID();
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getCacheKey(prefix, params) {
  return `${prefix}:${JSON.stringify(params)}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < CACHE_TTL) {
    return entry.promise;
  }
  cache.delete(key);
  return null;
}

function setCache(key, promise) {
  // remove cache em caso de erro para não guardar promise rejeitada
  promise.catch(() => cache.delete(key));
  cache.set(key, { promise, time: Date.now() });
}

/** Invalida todas as entradas que começam com o prefixo */
function invalidateCache(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Deduplica consultas: evita múltiplas chamadas idênticas em paralelo */
function dedupedQuery(cacheKey, queryFn) {
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const promise = queryFn();
  setCache(cacheKey, promise);
  return promise;
}

/* ============================== TIPOS DE COMPONENTE ============================== */
const componentTypesCol = collection(db, "componentTypes");

export async function listComponentTypes() {
  const cacheKey = getCacheKey("componentTypes", "all");
  return dedupedQuery(cacheKey, async () => {
    const snap = await getDocs(query(componentTypesCol, orderBy("name")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

export async function getComponentType(id) {
  const snap = await getDoc(doc(db, "componentTypes", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createComponentType(data, user) {
  const docRef = await addDoc(componentTypesCol, {
    name: data.name,
    description: data.description || "",
    icon: data.icon || "bi-box-seam",
    attributes: [],
    createdBy: user.uid,
    createdByName: user.name,
    createdAt: serverTimestamp(),
  });
  invalidateCache("componentTypes");
  return docRef;
}

export async function updateComponentType(id, patch) {
  await updateDoc(doc(db, "componentTypes", id), patch);
  invalidateCache("componentTypes");
}

export async function deleteComponentType(id) {
  await deleteDoc(doc(db, "componentTypes", id));
  invalidateCache("componentTypes");
}

export async function addAttribute(typeId, { name, dataType, unit, required }) {
  const type = await getComponentType(typeId);
  const attribute = {
    id: uid(),
    name,
    dataType,
    unit: unit || null,
    required: !!required,
    sortOrder: type.attributes.length,
    options: [],
  };
  const attributes = [...type.attributes, attribute];
  await updateDoc(doc(db, "componentTypes", typeId), { attributes });
  invalidateCache("componentTypes");
  return attribute;
}

export async function updateAttribute(typeId, attributeId, patch) {
  const type = await getComponentType(typeId);
  const attributes = type.attributes.map((a) =>
    a.id === attributeId ? { ...a, ...patch } : a
  );
  await updateDoc(doc(db, "componentTypes", typeId), { attributes });
  invalidateCache("componentTypes");
}

export async function deleteAttribute(typeId, attributeId) {
  const type = await getComponentType(typeId);
  const attributes = type.attributes.filter((a) => a.id !== attributeId);
  await updateDoc(doc(db, "componentTypes", typeId), { attributes });
  invalidateCache("componentTypes");
}

export async function addOption(typeId, attributeId, { value, label }) {
  const type = await getComponentType(typeId);
  const attributes = type.attributes.map((a) => {
    if (a.id !== attributeId) return a;
    const option = { id: uid(), value, label, sortOrder: a.options.length };
    return { ...a, options: [...a.options, option] };
  });
  await updateDoc(doc(db, "componentTypes", typeId), { attributes });
  invalidateCache("componentTypes");
}

export async function deleteOption(typeId, attributeId, optionId) {
  const type = await getComponentType(typeId);
  const attributes = type.attributes.map((a) => {
    if (a.id !== attributeId) return a;
    return { ...a, options: a.options.filter((o) => o.id !== optionId) };
  });
  await updateDoc(doc(db, "componentTypes", typeId), { attributes });
  invalidateCache("componentTypes");
}

/* ============================== COMPONENTES ============================== */
const componentsCol = collection(db, "components");

/**
 * Retorna uma página de componentes (padrão 25, máximo 100).
 * Filtros de disponibilidade são aplicados no Firestore.
 * A busca textual (q) é aplicada no cliente, mas apenas na página carregada.
 */
async function listComponentsPage({
  typeId,
  availability,
  q,
  pageSize = 25,
  startAfterDoc = null,
} = {}) {
  const effectiveSize = Math.min(pageSize, 100);
  const constraints = [];

  if (typeId) constraints.push(where("componentTypeId", "==", typeId));
  if (availability === "CRITICAL") constraints.push(where("critical", "==", true));
  else if (availability === "OUT_OF_STOCK") constraints.push(where("quantity", "==", 0));
  else if (availability === "IN_STOCK") constraints.push(where("quantity", ">", 0));

  constraints.push(orderBy("componentTypeName"));
  constraints.push(fsLimit(effectiveSize));
  if (startAfterDoc) constraints.push(startAfter(startAfterDoc));

  const qFirestore = query(componentsCol, ...constraints);
  const snap = await getDocs(qFirestore);
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (q) {
    const needle = normalize(q);
    items = items.filter((c) =>
      [c.componentTypeName, c.internalCode, c.location, c.manufacturer, c.supplier]
        .filter(Boolean)
        .some((field) => normalize(field).includes(needle))
    );
  }

  const lastDoc = snap.docs[snap.docs.length - 1] || null;
  return { items, lastDoc };
}

/** Versão compatível com o código antigo: retorna apenas o array */
export async function listComponents(options = {}) {
  const cacheKey = getCacheKey("components", { ...options, pageSize: 25, startAfter: null });
  return dedupedQuery(cacheKey, async () => {
    const { items } = await listComponentsPage({ ...options, pageSize: 25 });
    return items;
  });
}

/** Nova função para paginação explícita (quando o frontend precisar) */
export { listComponentsPage };

export async function getComponent(id) {
  const snap = await getDoc(doc(db, "components", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createComponent(data) {
  const critical = data.quantity <= data.minQuantity;
  const docRef = await addDoc(componentsCol, {
    ...data,
    critical,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  invalidateCache("components");
  invalidateCache("dashboard");
  return docRef;
}

export async function updateComponent(id, patch) {
  const current = await getComponent(id);
  const quantity = patch.quantity ?? current.quantity;
  const minQuantity = patch.minQuantity ?? current.minQuantity;
  await updateDoc(doc(db, "components", id), {
    ...patch,
    critical: quantity <= minQuantity,
    updatedAt: serverTimestamp(),
  });
  invalidateCache("components");
  invalidateCache("dashboard");
}

export async function deleteComponent(id) {
  await deleteDoc(doc(db, "components", id));
  invalidateCache("components");
  invalidateCache("dashboard");
}

/* ============================== MOVIMENTAÇÕES ============================== */
const movementsCol = collection(db, "stockMovements");

export async function listMovementsByComponent(componentId, max = 30) {
  const cacheKey = getCacheKey("movementsByComponent", { componentId, max });
  return dedupedQuery(cacheKey, async () => {
    const snap = await getDocs(
      query(
        movementsCol,
        where("componentId", "==", componentId),
        orderBy("occurredAt", "desc"),
        fsLimit(max)
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

export async function listRecentMovements(max = 30) {
  const cacheKey = getCacheKey("recentMovements", { max });
  return dedupedQuery(cacheKey, async () => {
    const snap = await getDocs(
      query(movementsCol, orderBy("occurredAt", "desc"), fsLimit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

export async function registerMovement(componentId, { type, reason, quantity, notes }, user) {
  const componentRef = doc(db, "components", componentId);
  const movementRef = doc(movementsCol);

  await runTransaction(db, async (tx) => {
    const componentSnap = await tx.get(componentRef);
    if (!componentSnap.exists()) throw new Error("Componente não encontrado.");
    const component = componentSnap.data();

    const delta = type === "ENTRADA" ? quantity : -quantity;
    const newQuantity = component.quantity + delta;

    if (newQuantity < 0) {
      throw new Error(`Quantidade em estoque (${component.quantity}) insuficiente para esta saída.`);
    }

    tx.update(componentRef, {
      quantity: newQuantity,
      critical: newQuantity <= component.minQuantity,
      updatedAt: serverTimestamp(),
    });

    tx.set(movementRef, {
      componentId,
      componentTypeName: component.componentTypeName,
      componentInternalCode: component.internalCode || null,
      type,
      reason,
      quantity,
      notes: notes || "",
      userId: user.uid,
      userName: user.name,
      occurredAt: serverTimestamp(),
    });
  });

  // Invalida caches afetados
  invalidateCache("components");
  invalidateCache("movements");
  invalidateCache("dashboard");
}

/* ============================== FERRAMENTAS ============================== */
const toolsCol = collection(db, "tools");
const toolLoansCol = collection(db, "toolLoans");

async function listToolsPage({
  status,
  q,
  pageSize = 25,
  startAfterDoc = null,
} = {}) {
  const effectiveSize = Math.min(pageSize, 100);
  const constraints = [];

  if (status) constraints.push(where("status", "==", status));
  constraints.push(orderBy("name"));
  constraints.push(fsLimit(effectiveSize));
  if (startAfterDoc) constraints.push(startAfter(startAfterDoc));

  const qFirestore = query(toolsCol, ...constraints);
  const snap = await getDocs(qFirestore);
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (q) {
    const needle = normalize(q);
    items = items.filter((t) =>
      [t.name, t.manufacturer, t.model, t.patrimonio]
        .filter(Boolean)
        .some((f) => normalize(f).includes(needle))
    );
  }

  const lastDoc = snap.docs[snap.docs.length - 1] || null;
  return { items, lastDoc };
}

export async function listTools(options = {}) {
  const cacheKey = getCacheKey("tools", { ...options, pageSize: 25, startAfter: null });
  return dedupedQuery(cacheKey, async () => {
    const { items } = await listToolsPage({ ...options, pageSize: 25 });
    return items;
  });
}

export { listToolsPage };

export async function getTool(id) {
  const snap = await getDoc(doc(db, "tools", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createTool(data) {
  const docRef = await addDoc(toolsCol, {
    ...data,
    status: "DISPONIVEL",
    currentLoan: null,
    createdAt: serverTimestamp(),
  });
  invalidateCache("tools");
  invalidateCache("dashboard");
  return docRef;
}

export async function updateTool(id, patch) {
  await updateDoc(doc(db, "tools", id), patch);
  invalidateCache("tools");
  invalidateCache("dashboard");
}

export async function deleteTool(id) {
  await deleteDoc(doc(db, "tools", id));
  invalidateCache("tools");
  invalidateCache("dashboard");
}

export async function listLoanHistory(toolId, max = 20) {
  const cacheKey = getCacheKey("loanHistory", { toolId, max });
  return dedupedQuery(cacheKey, async () => {
    const snap = await getDocs(
      query(
        toolLoansCol,
        where("toolId", "==", toolId),
        orderBy("borrowedAt", "desc"),
        fsLimit(max)
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

export async function createLoan(toolId, { expectedReturnAt, notes }, user) {
  const toolRef = doc(db, "tools", toolId);
  const loanRef = doc(toolLoansCol);

  await runTransaction(db, async (tx) => {
    const toolSnap = await tx.get(toolRef);
    if (!toolSnap.exists()) throw new Error("Ferramenta não encontrada.");
    const tool = toolSnap.data();

    if (tool.status !== "DISPONIVEL") {
      throw new Error(`Ferramenta não está disponível (status atual: ${tool.status}).`);
    }

    const expectedReturnTimestamp = expectedReturnAt
      ? Timestamp.fromDate(new Date(expectedReturnAt))
      : null;

    const loanData = {
      toolId,
      toolName: tool.name,
      userId: user.uid,
      userName: user.name,
      borrowedAt: serverTimestamp(),
      expectedReturnAt: expectedReturnTimestamp,
      returnedAt: null,
      notes: notes || "",
    };

    tx.set(loanRef, loanData);
    tx.update(toolRef, {
      status: "EMPRESTADA",
      currentLoan: {
        loanId: loanRef.id,
        userId: user.uid,
        userName: user.name,
        borrowedAt: Timestamp.now(),
        expectedReturnAt: expectedReturnTimestamp,
      },
    });
  });

  invalidateCache("tools");
  invalidateCache("loanHistory");
  invalidateCache("dashboard");
}

export async function returnLoan(toolId, loanId, user) {
  const toolRef = doc(db, "tools", toolId);
  const loanRef = doc(db, "toolLoans", loanId);

  await runTransaction(db, async (tx) => {
    const loanSnap = await tx.get(loanRef);
    if (!loanSnap.exists()) throw new Error("Empréstimo não encontrado.");
    const loan = loanSnap.data();
    if (loan.returnedAt) throw new Error("Este empréstimo já foi devolvido.");
    if (loan.userId !== user.uid) {
      throw new Error("Apenas o usuário que realizou o empréstimo pode devolvê-lo.");
    }

    tx.update(loanRef, { returnedAt: serverTimestamp() });
    tx.update(toolRef, { status: "DISPONIVEL", currentLoan: null });
  });

  invalidateCache("tools");
  invalidateCache("loanHistory");
  invalidateCache("dashboard");
}

/* ============================== USUÁRIOS ============================== */
const usersCol = collection(db, "users");

export async function listUsers() {
  const cacheKey = getCacheKey("users", "all");
  return dedupedQuery(cacheKey, async () => {
    const snap = await getDocs(query(usersCol, orderBy("name")));
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  });
}

export async function updateUser(uidToUpdate, patch) {
  await updateDoc(doc(db, "users", uidToUpdate), patch);
  invalidateCache("users");
}

/* ============================== DASHBOARD ============================== */
export async function dashboardSummary() {
  const cacheKey = getCacheKey("dashboard", "summary");
  return dedupedQuery(cacheKey, async () => {
    const [
      criticalCount,
      outOfStockCount,
      totalComponents,
      totalTools,
      borrowedTools,
      movements7d,
    ] = await Promise.all([
      getCountFromServer(query(componentsCol, where("critical", "==", true))),
      getCountFromServer(query(componentsCol, where("quantity", "==", 0))),
      getCountFromServer(componentsCol),
      getCountFromServer(toolsCol),
      getCountFromServer(query(toolsCol, where("status", "==", "EMPRESTADA"))),
      getCountFromServer(
        query(movementsCol, where("occurredAt", ">=", sevenDaysAgoTimestamp()))
      ),
    ]);

    return {
      componentsCriticalCount: criticalCount.data().count,
      componentsOutOfStockCount: outOfStockCount.data().count,
      componentsTotalCount: totalComponents.data().count,
      toolsTotalCount: totalTools.data().count,
      toolsBorrowedCount: borrowedTools.data().count,
      movementsLast7Days: movements7d.data().count,
    };
  });
}

export async function listCriticalComponents(max = 8) {
  const cacheKey = getCacheKey("criticalComponents", { max });
  return dedupedQuery(cacheKey, async () => {
    const snap = await getDocs(
      query(componentsCol, where("critical", "==", true), fsLimit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

function sevenDaysAgoTimestamp() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return Timestamp.fromDate(date);
}