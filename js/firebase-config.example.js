// js/firebase-config.example.js
//
// Template de configuração do Firebase.
// 1. Crie um projeto no console do Firebase: https://console.firebase.google.com
// 2. Copie este arquivo para js/firebase-config.js
// 3. Substitua os valores abaixo pelos dados do seu app Web (Configurações do Projeto > Seus apps).

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.firebasestorage.app",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID",
  measurementId: "SEU_MEASUREMENT_ID"
};

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
