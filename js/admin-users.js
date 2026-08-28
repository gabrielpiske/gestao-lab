// js/admin-users.js
import { requireAuth } from "./auth-guard.js";
import { renderLayout } from "./nav.js";
import { listUsers, updateUser } from "./data.js";
import { escapeHtml, showSuccess, showError } from "./utils.js";
import { createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { secondaryAuth, db } from "./firebase-config.js";

const user = await requireAuth({ requireAdmin: true });
renderLayout(user, "admin-users");

const ROLE_LABELS = { ADMIN: "Administrador", DOCENTE: "Docente", VISITANTE: "Visitante", ALUNO: "Aluno" };
const tbody = document.getElementById("users-tbody");

document.getElementById("new-user-form").addEventListener("submit", onCreateUser);

await renderUsers();

async function renderUsers() {
  tbody.innerHTML = `<tr><td class="ps-3 py-3 text-body-secondary small" colspan="5">Carregando...</td></tr>`;
  try {
    const users = await listUsers();
    tbody.innerHTML = users
      .map(
        (u) => `
        <tr>
          <td class="ps-3">${escapeHtml(u.name)}</td>
          <td class="text-body-secondary">${escapeHtml(u.email)}</td>
          <td>
            <select class="form-select form-select-sm role-select" data-uid="${u.uid}" ${u.uid === user.uid ? "disabled title='Você não pode alterar seu próprio papel'" : ""}>
              ${Object.entries(ROLE_LABELS)
                .map(([value, label]) => `<option value="${value}" ${u.role === value ? "selected" : ""}>${label}</option>`)
                .join("")}
            </select>
          </td>
          <td>
            <span class="badge text-bg-${u.active ? "success" : "secondary"}">${u.active ? "Ativo" : "Inativo"}</span>
          </td>
          <td class="pe-3 text-end">
            <button class="btn btn-sm btn-outline-secondary toggle-active-btn" data-uid="${u.uid}" data-active="${u.active}"
              ${u.uid === user.uid ? "disabled" : ""}>
              ${u.active ? "Desativar" : "Ativar"}
            </button>
          </td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll(".role-select").forEach((select) =>
      select.addEventListener("change", () => onChangeRole(select.dataset.uid, select.value))
    );
    tbody.querySelectorAll(".toggle-active-btn").forEach((btn) =>
      btn.addEventListener("click", () => onToggleActive(btn.dataset.uid, btn.dataset.active === "true"))
    );
  } catch (err) {
    tbody.innerHTML = `<tr><td class="ps-3 py-3 text-danger small" colspan="5">Erro ao carregar usuários: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function onChangeRole(uid, role) {
  try {
    await updateUser(uid, { role });
    showSuccess("Papel atualizado.");
  } catch (err) {
    showError(err.message || "Não foi possível atualizar o papel.");
    await renderUsers();
  }
}

async function onToggleActive(uid, currentlyActive) {
  try {
    await updateUser(uid, { active: !currentlyActive });
    showSuccess(currentlyActive ? "Usuário desativado." : "Usuário ativado.");
    await renderUsers();
  } catch (err) {
    showError(err.message || "Não foi possível alterar o status do usuário.");
  }
}

/**
 * Cria o usuário no Firebase Authentication usando um SEGUNDO app Firebase
 * (secondaryAuth), para que o cadastro não derrube a sessão do admin logado
 * no app principal. Em seguida grava o perfil em Firestore e encerra a
 * sessão do app secundário.
 */
async function onCreateUser(e) {
  e.preventDefault();
  const errorBox = document.getElementById("new-user-error");
  errorBox.classList.add("d-none");

  const name = document.getElementById("new-user-name").value.trim();
  const email = document.getElementById("new-user-email").value.trim();
  const password = document.getElementById("new-user-password").value;
  const role = document.getElementById("new-user-role").value;

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);

    await setDoc(doc(db, "users", credential.user.uid), {
      name,
      email,
      role,
      active: true,
      createdAt: serverTimestamp(),
    });

    await signOut(secondaryAuth);

    showSuccess(`Usuário "${name}" criado. Envie a senha provisória por um canal seguro.`);
    document.getElementById("new-user-form").reset();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("new-user-modal")).hide();
    await renderUsers();
  } catch (err) {
    errorBox.textContent = translateFirebaseError(err.code) || err.message;
    errorBox.classList.remove("d-none");
  }
}

function translateFirebaseError(code) {
  const map = {
    "auth/email-already-in-use": "Já existe uma conta com este email.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "Email inválido.",
  };
  return map[code];
}
