// public/res/app.js
// Ejecuta esto servido por Firebase Hosting (emulador o deploy),
// porque /__/firebase/init.json solo existe ahí.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

// --- Helpers UI ---
const $ = (sel) => document.querySelector(sel);
const setBusy = (busy) => {
    $('.login-buton')?.toggleAttribute('disabled', busy);
    $('.register-buton')?.toggleAttribute('disabled', busy);
};

// --- Carga config desde Hosting ---
const res = await fetch('/__/firebase/init.json');  // Descarga la config
if (!res.ok) throw new Error('No se pudo cargar /__/firebase/init.json');  // Error si no va bien
const firebaseConfig = await res.json();               // Parsea JSON

// --- Firebase ---
const app = initializeApp(firebaseConfig);  // Inicializa Firebase
const auth = getAuth(app);                   // Inicializa Auth

// --- DOM ---
const form = document.querySelector('form');    // el formulario
const emailEl = $('#user');                  // el input email
const passEl = $('#password');             // el input contraseña
const registerBtn = $('.register-buton');   // el botón registrar
const toggleBtn = $('#togglePassword');              // el botón mostrar/ocultar
const forgotLink = $('.forgot-password');   // el enlace "olvidé contraseña"

// --- Mostrar / ocultar contraseña ---
toggleBtn?.addEventListener('click', () => {    // al hacer clic en el botón
    const isPass = passEl.type === 'password';  // si está en modo "password"
    passEl.type = isPass ? 'text' : 'password'; // cambia a "text" o "password"
    toggleBtn.textContent = isPass ? 'Ocultar contraseña' : 'Mostrar contraseña';   // cambia el texto
});

// --- Login (submit del formulario) ---
form?.addEventListener('submit', async (e) => {     // al enviar el formulario
    e.preventDefault();                    // evita recargar la página
    setBusy(true);                     // pone todo en modo "busy"
    try {
        const email = emailEl.value.trim();     // obtiene el email
        const pass = passEl.value;                // obtiene la contraseña
        const cred = await signInWithEmailAndPassword(auth, email, pass);   // intenta loguear
        alert(`Sesión iniciada. UID: ${cred.user.uid}`);    // muestra el UID SOLO DEBUG
        // A partir de aquí, redireccion a pagina privada.
    } catch (err) {
        alert(msgFromAuthError(err));   // muestra error amigable SOLO DEBUG
        console.error(err);               // loguea el error completo
    } finally {
        setBusy(false);                  // quita el modo "busy"
    }
});

// --- Registro (botón "Registrarse") ---
registerBtn?.addEventListener('click', async () => {  // al hacer clic en el botón
    setBusy(true);                   // pone todo en modo "busy"
    try {
        const email = emailEl.value.trim();    // obtiene el email
        const pass = passEl.value;             // obtiene la contraseña
        const cred = await createUserWithEmailAndPassword(auth, email, pass);   // intenta registrar
        alert(`Usuario creado. UID: ${cred.user.uid}`); // muestra el UID SOLO DEBUG
    } catch (err) {
        alert(msgFromAuthError(err));   // muestra error amigable SOLO DEBUG
        console.error(err);               // loguea el error completo
    } finally {
        setBusy(false);                  // quita el modo "busy"
    }
});

// --- Reset contraseña ---
forgotLink?.addEventListener('click', async (e) => {    // al hacer clic en el enlace
    e.preventDefault();                    // evita recargar la página
    const email = (emailEl.value || prompt('Introduce tu email para recuperar la contraseña') || '').trim();    // pide el email
    if (!email) return;                    // si no hay email, no hace nada
    try {
        await sendPasswordResetEmail(auth, email);  // intenta enviar el email
        alert('Te hemos enviado un email para restablecer la contraseña.'); // confirma envío SOLO DEBUG
    } catch (err) {
        alert(msgFromAuthError(err));   // muestra error amigable SOLO DEBUG
        console.error(err);               // loguea el error completo
    }
});

// --- Traductor de errores comunes --- 
function msgFromAuthError(err) {    // recibe un error de Firebase Auth
    const code = err?.code || '';   // obtiene el código de error
    switch (code) {               // según el código
        case 'auth/invalid-email': return 'Email inválido.';    // email mal formado
        case 'auth/missing-password': return 'Falta la contraseña.';    // sin contraseña
        case 'auth/weak-password': return 'Contraseña débil (mín. 6 caracteres).';  // contraseña débil
        case 'auth/email-already-in-use': return 'Ese email ya tiene cuenta.';  // email ya usado
        case 'auth/invalid-credential': // credencial inválida
        case 'auth/wrong-password': // contraseña incorrecta
        case 'auth/user-not-found': return 'Email o contraseña incorrectos.'; // no da pistas
        case 'auth/too-many-requests': return 'Demasiados intentos. Prueba más tarde.'; // muchos intentos
        default: return `Error: ${code || err}`; // mensaje genérico
    }
}
