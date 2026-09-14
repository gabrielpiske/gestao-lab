// js/firebase-config.js
//
// Configuração central do Firebase.
//
// Nenhuma configuração de produção fica versionada: no deploy ela vem do
// endpoint /api/firebase-config, alimentado pelas variáveis de ambiente da
// Vercel. Esses identificadores precisam chegar ao navegador para o SDK Web
// funcionar; portanto não substituem as regras do Firestore e do Auth.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const response = await fetch("/api/firebase-config", { cache: "no-store" });
if (!response.ok) {
  throw new Error("Não foi possível carregar a configuração do Firebase.");
}

export const firebaseConfig = await response.json();
const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
if (!requiredConfigKeys.every((key) => typeof firebaseConfig[key] === "string" && firebaseConfig[key])) {
  throw new Error("A configuração do Firebase está incompleta.");
}

// Segundo app do Firebase, usado apenas para o admin criar novos usuários
// sem perder a própria sessão logada (ver js/admin-users.js).
const SECONDARY_APP_NAME = "labtrack-secondary";

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const secondaryApp = getApps().some((a) => a.name === SECONDARY_APP_NAME)
  ? getApp(SECONDARY_APP_NAME)
  : initializeApp(firebaseConfig, SECONDARY_APP_NAME);

export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);
export const db = getFirestore(app);

// Defina window.USE_FIREBASE_EMULATOR = true no console do navegador (ou aqui)
// durante o desenvolvimento local para usar os emuladores em vez do projeto real.
if (window.USE_FIREBASE_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
