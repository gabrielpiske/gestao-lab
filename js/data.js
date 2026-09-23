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

    const parsedDate = parseDateInput(expectedReturnAt);
    const expectedReturnTimestamp = parsedDate ? Timestamp.fromDate(parsedDate) : null;

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

    const parsedDate = parseDateInput(expectedReturnAt);
    const expectedReturnTimestamp = parsedDate ? Timestamp.fromDate(parsedDate) : null;

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

/* ============================== HISTÓRICO & AUDITORIA (ADMIN) ============================== */

export async function listAllToolLoans(max = 100) {
  const snap = await getDocs(
    query(toolLoansCol, orderBy("borrowedAt", "desc"), fsLimit(max))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listAllMicrocontrollerLoans(max = 100) {
  const snap = await getDocs(
    query(microcontrollerLoansCol, orderBy("borrowedAt", "desc"), fsLimit(max))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Retorna contagens agregadas diretamente do Firestore para os KPIs de auditoria,
 * sem baixar documentos inteiros (economia de rede e leituras).
 */
export async function adminAuditSummary() {
  const [
    totalMovements,
    totalToolLoans,
    activeTools,
    totalMicroLoans,
    activeMicros,
    totalUsers,
  ] = await Promise.all([
    getCountFromServer(movementsCol),
    getCountFromServer(toolLoansCol),
    getCountFromServer(query(toolsCol, where("status", "==", "EMPRESTADA"))),
    getCountFromServer(microcontrollerLoansCol),
    getCountFromServer(query(microcontrollersCol, where("status", "==", "EMPRESTADA"))),
    getCountFromServer(usersCol),
  ]);

  const activeToolCount = activeTools.data().count;
  const activeMicroCount = activeMicros.data().count;
  const toolCount = totalToolLoans.data().count;
  const microCount = totalMicroLoans.data().count;

  return {
    totalMovementsCount: totalMovements.data().count,
    totalToolLoansCount: toolCount,
    activeToolLoansCount: activeToolCount,
    totalMicroLoansCount: microCount,
    activeMicroLoansCount: activeMicroCount,
    totalLoansCount: toolCount + microCount,
    activeLoansCount: activeToolCount + activeMicroCount,
    totalUsersCount: totalUsers.data().count,
  };
}

/**
 * Carrega a trilha unificada de auditoria (movimentações, empréstimos de ferramentas
 * e empréstimos de microcontroladores) e compila as estatísticas por usuário.
 */
export async function loadUnifiedAuditData(limitPerType = 150) {
  const [movements, toolLoans, microLoans, users, tools, microcontrollers] = await Promise.all([
    listRecentMovements(limitPerType),
    listAllToolLoans(limitPerType),
    listAllMicrocontrollerLoans(limitPerType),
    listUsers(),
    listTools(),
    listMicrocontrollers(),
  ]);

  const toolsMap = new Map(tools.map((t) => [t.id, t]));
  const microsMap = new Map(microcontrollers.map((m) => [m.id, m]));

  const unifiedList = [];
  const now = new Date();

  // 1. Processar movimentações de estoque
  for (const m of movements) {
    const occurredDate = m.occurredAt?.toDate ? m.occurredAt.toDate() : (m.occurredAt ? new Date(m.occurredAt) : null);
    unifiedList.push({
      id: m.id,
      sourceType: "MOVEMENT",
      sourceLabel: "Movimentação de Estoque",
      icon: "bi-box-seam",
      badgeClass: m.type === "ENTRADA" ? "success" : "danger",
      itemTitle: m.componentTypeName || "Componente",
      itemSubtitle: m.componentInternalCode ? `Cód: ${m.componentInternalCode}` : "",
      userId: m.userId,
      userName: m.userName || "Usuário não identificado",
      eventDate: occurredDate,
      actionLabel: m.type === "ENTRADA" ? "Entrada" : "Saída",
      actionType: m.type,
      status: m.type,
      statusLabel: m.type === "ENTRADA" ? "Entrada" : "Saída",
      statusBadge: m.type === "ENTRADA" ? "success" : "danger",
      quantity: m.quantity || 0,
      reason: m.reason || "",
      notes: m.notes || "",
      expectedReturnAt: null,
      returnedAt: null,
      isOverdue: false,
      raw: m,
    });
  }

  // 2. Processar empréstimos de ferramentas
  for (const tl of toolLoans) {
    const borrowedDate = tl.borrowedAt?.toDate ? tl.borrowedAt.toDate() : (tl.borrowedAt ? new Date(tl.borrowedAt) : null);
    const expectedReturnDate = tl.expectedReturnAt?.toDate ? tl.expectedReturnAt.toDate() : (tl.expectedReturnAt ? new Date(tl.expectedReturnAt) : null);
    const returnedDate = tl.returnedAt?.toDate ? tl.returnedAt.toDate() : (tl.returnedAt ? new Date(tl.returnedAt) : null);

    const correspondingTool = toolsMap.get(tl.toolId);
    // Um empréstimo é considerado ativo se:
    // 1. Não tem data de devolução registrada
    // 2. E a ferramenta correspondente está atualmente marcada como 'EMPRESTADA' com este empréstimo ativo
    const isActuallyActive = !returnedDate && correspondingTool?.status === "EMPRESTADA" && correspondingTool?.currentLoan?.loanId === tl.id;
    const isReturned = !!returnedDate || !isActuallyActive;
    const isOverdue = isActuallyActive && expectedReturnDate && expectedReturnDate < now;

    let statusLabel = "Em aberto";
    let statusBadge = "primary";
    let statusKey = "EM_ABERTO";

    if (isReturned) {
      statusLabel = "Devolvido";
      statusBadge = "secondary";
      statusKey = "DEVOLVIDO";
    } else if (isOverdue) {
      statusLabel = "Em atraso";
      statusBadge = "danger";
      statusKey = "ATRASADO";
    }

    unifiedList.push({
      id: tl.id,
      sourceType: "TOOL_LOAN",
      sourceLabel: "Ferramenta / Equipamento",
      icon: "bi-tools",
      badgeClass: "info",
      itemTitle: tl.toolName || correspondingTool?.name || "Ferramenta",
      itemSubtitle: "Empréstimo de equipamento",
      userId: tl.userId,
      userName: tl.userName || "Usuário não identificado",
      eventDate: borrowedDate,
      actionLabel: isReturned ? "Devolução realizada" : "Empréstimo ativo",
      actionType: "EMPRESTIMO",
      status: statusKey,
      statusLabel,
      statusBadge,
      quantity: 1,
      reason: "Empréstimo",
      notes: tl.notes || "",
      expectedReturnAt: expectedReturnDate,
      returnedAt: returnedDate || (isReturned ? (expectedReturnDate || borrowedDate) : null),
      isOverdue,
      raw: tl,
    });
  }

  // 3. Processar empréstimos de microcontroladores
  for (const ml of microLoans) {
    const borrowedDate = ml.borrowedAt?.toDate ? ml.borrowedAt.toDate() : (ml.borrowedAt ? new Date(ml.borrowedAt) : null);
    const expectedReturnDate = ml.expectedReturnAt?.toDate ? ml.expectedReturnAt.toDate() : (ml.expectedReturnAt ? new Date(ml.expectedReturnAt) : null);
    const returnedDate = ml.returnedAt?.toDate ? ml.returnedAt.toDate() : (ml.returnedAt ? new Date(ml.returnedAt) : null);

    const correspondingMicro = microsMap.get(ml.microcontrollerId);
    // Um empréstimo é considerado ativo se:
    // 1. Não tem data de devolução registrada
    // 2. E o microcontrolador correspondente está atualmente marcado como 'EMPRESTADA' com este empréstimo ativo
    const isActuallyActive = !returnedDate && correspondingMicro?.status === "EMPRESTADA" && correspondingMicro?.currentLoan?.loanId === ml.id;
    const isReturned = !!returnedDate || !isActuallyActive;
    const isOverdue = isActuallyActive && expectedReturnDate && expectedReturnDate < now;

    let statusLabel = "Em aberto";
    let statusBadge = "primary";
    let statusKey = "EM_ABERTO";

    if (isReturned) {
      statusLabel = "Devolvido";
      statusBadge = "secondary";
      statusKey = "DEVOLVIDO";
    } else if (isOverdue) {
      statusLabel = "Em atraso";
      statusBadge = "danger";
      statusKey = "ATRASADO";
    }

    unifiedList.push({
      id: ml.id,
      sourceType: "MICRO_LOAN",
      sourceLabel: "Microcontrolador / Placa",
      icon: "bi-motherboard",
      badgeClass: "warning",
      itemTitle: ml.microcontrollerName || correspondingMicro?.name || "Microcontrolador",
      itemSubtitle: "Empréstimo de placa/kit",
      userId: ml.userId,
      userName: ml.userName || "Usuário não identificado",
      eventDate: borrowedDate,
      actionLabel: isReturned ? "Devolução realizada" : "Empréstimo ativo",
      actionType: "EMPRESTIMO",
      status: statusKey,
      statusLabel,
      statusBadge,
      quantity: 1,
      reason: "Empréstimo",
      notes: ml.notes || "",
      expectedReturnAt: expectedReturnDate,
      returnedAt: returnedDate || (isReturned ? (expectedReturnDate || borrowedDate) : null),
      isOverdue,
      raw: ml,
    });
  }

  // Ordenar tudo por data descrescente (mais recente primeiro)
  unifiedList.sort((a, b) => {
    const timeA = a.eventDate ? a.eventDate.getTime() : 0;
    const timeB = b.eventDate ? b.eventDate.getTime() : 0;
    return timeB - timeA;
  });

  // 4. Compilar estatísticas consolidadas por usuário (Hub)
  const userMap = new Map();

  for (const u of users) {
    userMap.set(u.uid, {
      uid: u.uid,
      name: u.name || "Sem nome",
      email: u.email || "",
      role: u.role || "VISITANTE",
      active: u.active !== false,
      toolLoansCount: 0,
      microLoansCount: 0,
      totalLoansCount: 0,
      activeLoansCount: 0,
      returnedLoansCount: 0,
      overdueLoansCount: 0,
      movementsCount: 0,
      lastActivityAt: null,
    });
  }

  for (const item of unifiedList) {
    if (!item.userId) continue;

    let userStat = userMap.get(item.userId);
    if (!userStat) {
      userStat = {
        uid: item.userId,
        name: item.userName || "Usuário removido",
        email: "",
        role: "VISITANTE",
        active: true,
        toolLoansCount: 0,
        microLoansCount: 0,
        totalLoansCount: 0,
        activeLoansCount: 0,
        returnedLoansCount: 0,
        overdueLoansCount: 0,
        movementsCount: 0,
        lastActivityAt: null,
      };
      userMap.set(item.userId, userStat);
    }

    if (!userStat.lastActivityAt && item.eventDate) {
      userStat.lastActivityAt = item.eventDate;
    }

    if (item.sourceType === "MOVEMENT") {
      userStat.movementsCount += 1;
    } else if (item.sourceType === "TOOL_LOAN") {
      userStat.toolLoansCount += 1;
      userStat.totalLoansCount += 1;
      if (item.status === "DEVOLVIDO") userStat.returnedLoansCount += 1;
      else if (item.status === "ATRASADO") {
        userStat.activeLoansCount += 1;
        userStat.overdueLoansCount += 1;
      } else {
        userStat.activeLoansCount += 1;
      }
    } else if (item.sourceType === "MICRO_LOAN") {
      userStat.microLoansCount += 1;
      userStat.totalLoansCount += 1;
      if (item.status === "DEVOLVIDO") userStat.returnedLoansCount += 1;
      else if (item.status === "ATRASADO") {
        userStat.activeLoansCount += 1;
        userStat.overdueLoansCount += 1;
      } else {
        userStat.activeLoansCount += 1;
      }
    }
  }

  const userStatsList = Array.from(userMap.values());
  // Ordenar usuários por quem tem mais reservas/atividades
  userStatsList.sort((a, b) => {
    if (b.totalLoansCount !== a.totalLoansCount) return b.totalLoansCount - a.totalLoansCount;
    if (b.movementsCount !== a.movementsCount) return b.movementsCount - a.movementsCount;
    return a.name.localeCompare(b.name);
  });

  return {
    history: unifiedList,
    userStats: userStatsList,
    users,
  };
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

/**
 * Retorna todos os empréstimos ativos (ferramentas e microcontroladores)
 * atualmente sob responsabilidade de um determinado usuário.
 */
export async function getMyActiveLoans(userId) {
  if (!userId) return [];
  const [tools, microcontrollers] = await Promise.all([
    listTools({ status: "EMPRESTADA" }),
    listMicrocontrollers({ status: "EMPRESTADA" }),
  ]);

  const now = new Date();
  const myItems = [];

  for (const t of tools) {
    if (t.currentLoan && t.currentLoan.userId === userId) {
      const expDate = t.currentLoan.expectedReturnAt?.toDate
        ? t.currentLoan.expectedReturnAt.toDate()
        : (t.currentLoan.expectedReturnAt ? new Date(t.currentLoan.expectedReturnAt) : null);
      const isOverdue = !!(expDate && expDate < now);
      myItems.push({
        id: t.id,
        loanId: t.currentLoan.loanId,
        type: "TOOL",
        typeLabel: "Ferramenta",
        name: t.name,
        details: [t.manufacturer, t.model].filter(Boolean).join(" "),
        icon: "bi-tools",
        borrowedAt: t.currentLoan.borrowedAt,
        expectedReturnAt: expDate,
        isOverdue,
      });
    }
  }

  for (const m of microcontrollers) {
    if (m.currentLoan && m.currentLoan.userId === userId) {
      const expDate = m.currentLoan.expectedReturnAt?.toDate
        ? m.currentLoan.expectedReturnAt.toDate()
        : (m.currentLoan.expectedReturnAt ? new Date(m.currentLoan.expectedReturnAt) : null);
      const isOverdue = !!(expDate && expDate < now);
      myItems.push({
        id: m.id,
        loanId: m.currentLoan.loanId,
        type: "MICROCONTROLLER",
        typeLabel: "Microcontrolador",
        name: m.name,
        details: [m.family, m.model].filter(Boolean).join(" "),
        icon: "bi-motherboard",
        borrowedAt: m.currentLoan.borrowedAt,
        expectedReturnAt: expDate,
        isOverdue,
      });
    }
  }

  return myItems;
}

/**
 * Retorna todos os empréstimos atualmente ativos no laboratório,
 * identificando quantos e quais estão em atraso.
 */
export async function listActiveAndOverdueLoans() {
  const [tools, microcontrollers] = await Promise.all([
    listTools({ status: "EMPRESTADA" }),
    listMicrocontrollers({ status: "EMPRESTADA" }),
  ]);

  const now = new Date();
  const activeList = [];

  for (const t of tools) {
    if (t.currentLoan) {
      const expDate = t.currentLoan.expectedReturnAt?.toDate
        ? t.currentLoan.expectedReturnAt.toDate()
        : (t.currentLoan.expectedReturnAt ? new Date(t.currentLoan.expectedReturnAt) : null);
      const isOverdue = !!(expDate && expDate < now);
      activeList.push({
        itemId: t.id,
        loanId: t.currentLoan.loanId,
        itemType: "TOOL",
        itemTypeName: "Ferramenta",
        name: t.name,
        icon: "bi-tools",
        userId: t.currentLoan.userId,
        userName: t.currentLoan.userName,
        borrowedAt: t.currentLoan.borrowedAt,
        expectedReturnAt: expDate,
        isOverdue,
      });
    }
  }

  for (const m of microcontrollers) {
    if (m.currentLoan) {
      const expDate = m.currentLoan.expectedReturnAt?.toDate
        ? m.currentLoan.expectedReturnAt.toDate()
        : (m.currentLoan.expectedReturnAt ? new Date(m.currentLoan.expectedReturnAt) : null);
      const isOverdue = !!(expDate && expDate < now);
      activeList.push({
        itemId: m.id,
        loanId: m.currentLoan.loanId,
        itemType: "MICROCONTROLLER",
        itemTypeName: "Microcontrolador",
        name: m.name,
        icon: "bi-motherboard",
        userId: m.currentLoan.userId,
        userName: m.currentLoan.userName,
        borrowedAt: m.currentLoan.borrowedAt,
        expectedReturnAt: expDate,
        isOverdue,
      });
    }
  }

  // Ordenar atrasados primeiro, depois por data mais antiga
  activeList.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    const timeA = a.expectedReturnAt ? a.expectedReturnAt.getTime() : 0;
    const timeB = b.expectedReturnAt ? b.expectedReturnAt.getTime() : 0;
    return timeA - timeB;
  });

  return activeList;
}

function sevenDaysAgoTimestamp() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return Timestamp.fromDate(date);
}

function parseDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, y, m, d] = match;
      return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    }
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


