// js/data.js
//
// Camada única de acesso ao Firestore. Mantém as páginas HTML/JS simples,
// concentrando aqui as regras de como os dados são lidos e gravados.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
  runTransaction,
  getCountFromServer,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

function uid() {
  return crypto.randomUUID();
}

/* ============================== TIPOS DE COMPONENTE ============================== */
// Cada tipo guarda seus atributos e as opções de cada atributo embutidos no
// próprio documento (array). Para um laboratório didático isso é bem mais
// simples de operar do que sub-coleções, e o documento nunca chega perto do
// limite de 1MB do Firestore.

const componentTypesCol = collection(db, "componentTypes");

export async function listComponentTypes() {
  const snap = await getDocs(query(componentTypesCol, orderBy("name")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getComponentType(id) {
  const snap = await getDoc(doc(db, "componentTypes", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createComponentType({ name, description, icon }, user) {
  return addDoc(componentTypesCol, {
    name,
    description: description || "",
    icon: icon || "bi-box-seam",
    attributes: [],
    createdBy: user.uid,
    createdByName: user.name,
    createdAt: serverTimestamp(),
  });
}

export async function updateComponentType(id, patch) {
  await updateDoc(doc(db, "componentTypes", id), patch);
}

export async function deleteComponentType(id) {
  await deleteDoc(doc(db, "componentTypes", id));
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
  return attribute;
}

export async function updateAttribute(typeId, attributeId, patch) {
  const type = await getComponentType(typeId);
  const attributes = type.attributes.map((a) => (a.id === attributeId ? { ...a, ...patch } : a));
  await updateDoc(doc(db, "componentTypes", typeId), { attributes });
}

export async function deleteAttribute(typeId, attributeId) {
  const type = await getComponentType(typeId);
  const attributes = type.attributes.filter((a) => a.id !== attributeId);
  await updateDoc(doc(db, "componentTypes", typeId), { attributes });
}

export async function addOption(typeId, attributeId, { value, label }) {
  const type = await getComponentType(typeId);
  const attributes = type.attributes.map((a) => {
    if (a.id !== attributeId) return a;
    const option = { id: uid(), value, label, sortOrder: a.options.length };
    return { ...a, options: [...a.options, option] };
  });
  await updateDoc(doc(db, "componentTypes", typeId), { attributes });
}

export async function deleteOption(typeId, attributeId, optionId) {
  const type = await getComponentType(typeId);
  const attributes = type.attributes.map((a) => {
    if (a.id !== attributeId) return a;
    return { ...a, options: a.options.filter((o) => o.id !== optionId) };
  });
  await updateDoc(doc(db, "componentTypes", typeId), { attributes });
}

/* ============================== COMPONENTES ============================== */

const componentsCol = collection(db, "components");

/** O Firestore não filtra texto livre nativamente; para o volume típico de um
 *  laboratório (algumas centenas/milhares de itens), carregamos e filtramos
 *  no cliente — simples e rápido o suficiente para este caso de uso. */
export async function listComponents({ typeId, availability, q } = {}) {
  let constraints = [orderBy("componentTypeName")];
  if (typeId) constraints = [where("componentTypeId", "==", typeId), ...constraints];
  const snap = await getDocs(query(componentsCol, ...constraints));
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (availability === "CRITICAL") items = items.filter((c) => c.critical);
  if (availability === "OUT_OF_STOCK") items = items.filter((c) => c.quantity === 0);
  if (availability === "IN_STOCK") items = items.filter((c) => c.quantity > 0);

  if (q) {
    const needle = normalize(q);
    items = items.filter((c) =>
      [c.componentTypeName, c.internalCode, c.location, c.manufacturer, c.supplier]
        .filter(Boolean)
        .some((field) => normalize(field).includes(needle))
    );
  }

  return items;
}

export async function getComponent(id) {
  const snap = await getDoc(doc(db, "components", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createComponent(data) {
  const critical = data.quantity <= data.minQuantity;
  return addDoc(componentsCol, {
    ...data,
    critical,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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
}

export async function deleteComponent(id) {
  await deleteDoc(doc(db, "components", id));
}

/* ============================== ESTOQUE (MOVIMENTAÇÕES) ============================== */

const movementsCol = collection(db, "stockMovements");

export async function listMovementsByComponent(componentId, max = 30) {
  const snap = await getDocs(
    query(movementsCol, where("componentId", "==", componentId), orderBy("occurredAt", "desc"), fsLimit(max))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listRecentMovements(max = 30) {
  const snap = await getDocs(query(movementsCol, orderBy("occurredAt", "desc"), fsLimit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Registra a movimentação e atualiza a quantidade do componente de forma
 *  atômica usando uma transação — evita corrida entre dois docentes dando
 *  baixa no mesmo componente ao mesmo tempo. */
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
}

/* ============================== FERRAMENTAS ============================== */

const toolsCol = collection(db, "tools");
const toolLoansCol = collection(db, "toolLoans");

export async function listTools({ status, q } = {}) {
  let constraints = [orderBy("name")];
  if (status) constraints = [where("status", "==", status), ...constraints];
  const snap = await getDocs(query(toolsCol, ...constraints));
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (q) {
    const needle = normalize(q);
    items = items.filter((t) =>
      [t.name, t.manufacturer, t.model, t.patrimonio].filter(Boolean).some((f) => normalize(f).includes(needle))
    );
  }

  return items;
}

export async function getTool(id) {
  const snap = await getDoc(doc(db, "tools", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createTool(data) {
  return addDoc(toolsCol, {
    ...data,
    status: "DISPONIVEL",
    currentLoan: null,
    createdAt: serverTimestamp(),
  });
}

export async function updateTool(id, patch) {
  await updateDoc(doc(db, "tools", id), patch);
}

export async function deleteTool(id) {
  await deleteDoc(doc(db, "tools", id));
}

export async function listLoanHistory(toolId, max = 20) {
  const snap = await getDocs(
    query(toolLoansCol, where("toolId", "==", toolId), orderBy("borrowedAt", "desc"), fsLimit(max))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

    const expectedReturnTimestamp = expectedReturnAt ? Timestamp.fromDate(new Date(expectedReturnAt)) : null;

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
}

export async function returnLoan(toolId, loanId) {
  const toolRef = doc(db, "tools", toolId);
  const loanRef = doc(db, "toolLoans", loanId);

  await runTransaction(db, async (tx) => {
    const loanSnap = await tx.get(loanRef);
    if (!loanSnap.exists()) throw new Error("Empréstimo não encontrado.");
    if (loanSnap.data().returnedAt) throw new Error("Este empréstimo já foi devolvido.");

    tx.update(loanRef, { returnedAt: serverTimestamp() });
    tx.update(toolRef, { status: "DISPONIVEL", currentLoan: null });
  });
}

/* ============================== MICROCONTROLADORES ============================== */

const microcontrollersCol = collection(db, "microcontrollers");
const microcontrollerLoansCol = collection(db, "microcontrollerLoans");

export async function listMicrocontrollers({ status, family, q } = {}) {
  let constraints = [orderBy("name")];
  if (status) constraints = [where("status", "==", status), ...constraints];
  if (family) constraints = [where("family", "==", family), ...constraints];
  const snap = await getDocs(query(microcontrollersCol, ...constraints));
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (q) {
    const needle = normalize(q);
    items = items.filter((m) =>
      [m.name, m.family, m.connectivity, m.patrimonio, m.model, m.manufacturer, m.location]
        .filter(Boolean)
        .some((f) => normalize(f).includes(needle))
    );
  }

  return items;
}

export async function getMicrocontroller(id) {
  const snap = await getDoc(doc(db, "microcontrollers", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createMicrocontroller(data) {
  return addDoc(microcontrollersCol, {
    ...data,
    status: "DISPONIVEL",
    currentLoan: null,
    createdAt: serverTimestamp(),
  });
}

export async function updateMicrocontroller(id, patch) {
  await updateDoc(doc(db, "microcontrollers", id), patch);
}

export async function deleteMicrocontroller(id) {
  await deleteDoc(doc(db, "microcontrollers", id));
}

export async function listMicrocontrollerLoanHistory(microcontrollerId, max = 20) {
  const snap = await getDocs(
    query(
      microcontrollerLoansCol,
      where("microcontrollerId", "==", microcontrollerId),
      orderBy("borrowedAt", "desc"),
      fsLimit(max)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createMicrocontrollerLoan(microcontrollerId, { expectedReturnAt, notes }, user) {
  const microcontrollerRef = doc(db, "microcontrollers", microcontrollerId);
  const loanRef = doc(microcontrollerLoansCol);

  await runTransaction(db, async (tx) => {
    const microSnap = await tx.get(microcontrollerRef);
    if (!microSnap.exists()) throw new Error("Microcontrolador não encontrado.");
    const micro = microSnap.data();

    if (micro.status !== "DISPONIVEL") {
      throw new Error(`Microcontrolador não está disponível (status atual: ${micro.status}).`);
    }

    const expectedReturnTimestamp = expectedReturnAt ? Timestamp.fromDate(new Date(expectedReturnAt)) : null;

    const loanData = {
      microcontrollerId,
      microcontrollerName: micro.name,
      userId: user.uid,
      userName: user.name,
      borrowedAt: serverTimestamp(),
      expectedReturnAt: expectedReturnTimestamp,
      returnedAt: null,
      notes: notes || "",
    };

    tx.set(loanRef, loanData);
    tx.update(microcontrollerRef, {
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
}

export async function returnMicrocontrollerLoan(microcontrollerId, loanId) {
  const microcontrollerRef = doc(db, "microcontrollers", microcontrollerId);
  const loanRef = doc(db, "microcontrollerLoans", loanId);

  await runTransaction(db, async (tx) => {
    const loanSnap = await tx.get(loanRef);
    if (!loanSnap.exists()) throw new Error("Empréstimo não encontrado.");
    if (loanSnap.data().returnedAt) throw new Error("Este empréstimo já foi devolvido.");

    tx.update(loanRef, { returnedAt: serverTimestamp() });
    tx.update(microcontrollerRef, { status: "DISPONIVEL", currentLoan: null });
  });
}

/* ============================== USUÁRIOS ============================== */

const usersCol = collection(db, "users");

export async function listUsers() {
  const snap = await getDocs(query(usersCol, orderBy("name")));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function updateUser(uidToUpdate, patch) {
  await updateDoc(doc(db, "users", uidToUpdate), patch);
}

/* ============================== DASHBOARD ============================== */

export async function dashboardSummary() {
  const [
    criticalCount,
    outOfStockCount,
    totalComponents,
    totalTools,
    borrowedTools,
    totalMicrocontrollers,
    borrowedMicrocontrollers,
    movements7d,
  ] = await Promise.all([
    getCountFromServer(query(componentsCol, where("critical", "==", true))),
    getCountFromServer(query(componentsCol, where("quantity", "==", 0))),
    getCountFromServer(componentsCol),
    getCountFromServer(toolsCol),
    getCountFromServer(query(toolsCol, where("status", "==", "EMPRESTADA"))),
    getCountFromServer(microcontrollersCol),
    getCountFromServer(query(microcontrollersCol, where("status", "==", "EMPRESTADA"))),
    getCountFromServer(query(movementsCol, where("occurredAt", ">=", sevenDaysAgoTimestamp()))),
  ]);

  return {
    componentsCriticalCount: criticalCount.data().count,
    componentsOutOfStockCount: outOfStockCount.data().count,
    componentsTotalCount: totalComponents.data().count,
    toolsTotalCount: totalTools.data().count,
    toolsBorrowedCount: borrowedTools.data().count,
    microcontrollersTotalCount: totalMicrocontrollers.data().count,
    microcontrollersBorrowedCount: borrowedMicrocontrollers.data().count,
    movementsLast7Days: movements7d.data().count,
  };
}

export async function listCriticalComponents(max = 8) {
  const snap = await getDocs(query(componentsCol, where("critical", "==", true), fsLimit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function sevenDaysAgoTimestamp() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return Timestamp.fromDate(date);
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

