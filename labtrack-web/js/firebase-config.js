// js/firebase-config.js
//
// Configuração central do Firebase. Troque os valores abaixo pelos do SEU
// projeto Firebase (Console > Configurações do projeto > Seus apps > SDK setup).
// Este arquivo é seguro para ficar público no front-end: a chave "apiKey" do
// Firebase não é secreta, quem protege os dados de verdade são as regras do
// Firestore (arquivo firestore.rules) e as regras do Firebase Authentication.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { enableIndexedDbPersistence } from "firebase/firestore";
enableIndexedDbPersistence(db).catch((err) => console.warn(err));

export const firebaseConfig = {
  apiKey: "AIzaSyCGObFHc5czbqtfcTSJ2FhrBL9Rx4GSuLk",
  authDomain: "labtrack-web.firebaseapp.com",
  projectId: "labtrack-web",
  storageBucket: "labtrack-web.firebasestorage.app",
  messagingSenderId: "73423277128",
  appId: "1:73423277128:web:715d360bc5220a91385c7d",
  measurementId: "G-V9K80ETS8F"
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
