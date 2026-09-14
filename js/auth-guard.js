// js/auth-guard.js
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

/**
 * Garante que existe um usuário logado e retorna o perfil dele (de users/{uid}).
 * Se não houver sessão, redireciona para login.html.
 * Se options.requireAdmin for true e o papel não for ADMIN, redireciona para index.html.
 * Se options.requireWrite for true e o papel não for ADMIN/DOCENTE, redireciona para index.html.
 */
export function requireAuth(options = {}) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        window.location.href = "login.html";
        return;
      }

      let profile = await loadUserProfile(firebaseUser.uid);

      if (!profile) {
        // Primeiro login após cadastro: cria o perfil com papel padrão VISITANTE.
        profile = {
          name: firebaseUser.displayName || firebaseUser.email.split("@")[0],
          email: firebaseUser.email,
          role: "VISITANTE",
          active: true,
          createdAt: serverTimestamp(),
        };
        await setDoc(doc(db, "users", firebaseUser.uid), profile);
      }

      if (profile.active === false) {
        alert("Sua conta foi desativada. Fale com um administrador do laboratório.");
        await signOut(auth);
        window.location.href = "login.html";
        return;
      }

      if (options.requireAdmin && profile.role !== "ADMIN") {
        alert("Apenas administradores podem acessar esta página.");
        window.location.href = "index.html";
        return;
      }

      if (options.requireWrite && !["ADMIN", "DOCENTE"].includes(profile.role)) {
        alert("Sua conta não tem permissão de edição. Fale com um administrador.");
        window.location.href = "index.html";
        return;
      }

      resolve({ uid: firebaseUser.uid, ...profile });
    });
  });
}

export async function loadUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}
