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

// --- Funciones activas ---
checkFormReady(); // habilitar botones cuando ambos campos estén rellenos
checkTiempoRealEmail(); // validación en tiempo real del email
checkTiempoRealPassword(); // validación en tiempo real de la contraseña
capsOn(); // advertencia de mayúsculas activadas

// --- Mostrar / ocultar contraseña ---
toggleBtn?.addEventListener('click', () => {    // al hacer clic en el botón
  const isHidden = passEl.type === "password";
  passEl.type = isHidden ? "text" : "password";

  // Cambia el icono según el estado
  const eyeIcon = document.getElementById("eyeIcon");  // el icono del ojo
  eyeIcon.src = isHidden ? "res/open-eye.png" : "res/close-eye.png";
});

// --- Login (submit del formulario) ---
form?.addEventListener('submit', async (e) => {     // al enviar el formulario
    e.preventDefault();                    // evita recargar la página
    setBusy(true);                     // pone todo en modo "busy"

    try {
        // EMAIL.
        const email = emailEl.value.trim();     // obtiene el email

        // CONTRASEÑA.
        const pass = passEl.value;                // obtiene la contraseña
        const passwordCheck = validatePassword(pass);  // Validar la contraseña antes de intentar iniciar sesión
          if (passwordCheck !== true) {
            throw new Error(passwordCheck); // Lanza excepcion si la contraseña no es válida -> bloque catch.
          }

        // INTENTO DE LOGIN.
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
        // EMAIL.
        const email = emailEl.value.trim();    // obtiene el email

        // CONTRASEÑA.
        const pass = passEl.value;             // obtiene la contraseña
        const passwordCheck = validatePassword(pass);  // Validar la contraseña antes de intentar iniciar sesión
          if (passwordCheck !== true) {
            throw new Error(passwordCheck); // Lanza excepcion si la contraseña no es válida -> bloque catch.
          }
        
        // INTENTO DE REGISTRO.
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

// Función que valida la contraseña.
function validatePassword(password) {
    if (password.length < 8) {
        return "La contraseña debe tener al menos 8 caracteres.";
    }
    // Comprueba que haya al menos una letra.
    if (!/[a-zA-Z]/.test(password)) {
        return "La contraseña debe contener letras.";
    }
    // Comprueba que haya al menos un número. 
    if (!/\d/.test(password)) {
        return "La contraseña debe contener números.";
    }
    // Comprueba que haya al menos un carácter especial.
    // El ^ marca negación, así que busca cualquier cosa que NO sea letra, número o espacio.
    if (!/[^a-zA-Z0-9\s]/.test(password)) {
        return "La contraseña debe contener un carácter especial (ej: !, #, $).";
    }
    return true; // La contraseña es válida.
}

// Función para habilitar boton inicio sesión y registro cuando estén los dos campos rellenos.
function checkFormReady() {
  const emailFilled = emailEl.value.trim() !== "";
  const passwordFilled = passEl.value.trim() !== "";
  const isReady = emailFilled && passwordFilled;

  const loginBtn = $('.login-buton');
  const registerBtn = $('.register-buton');

  if (loginBtn) loginBtn.disabled = !isReady;
  if (registerBtn) registerBtn.disabled = !isReady;
}
// Función para validación en tiempo real del email 
function checkTiempoRealEmail() { 
  emailEl.addEventListener("input", () => { 
    const value = emailEl.value; 
    const isValid = value.includes("@") && value.includes("."); 
    emailEl.classList.toggle("valid", isValid); 
    emailEl.classList.toggle("invalid", !isValid); 
    checkFormReady(); 
  }); 
}

// Función para validación en tiempo real de la contraseña 
function checkTiempoRealPassword() { 
  passEl.addEventListener("input", () => { 
    const value = passEl.value; 
    const isValid = value.length >= 8; 
    passEl.classList.toggle("valid", isValid); 
    passEl.classList.toggle("invalid", !isValid); 
    checkFormReady(); 
  }); 
}

// Función para crear advertencia de mayúsculas activadas
function capsOn() {
  const capsWarning = document.getElementById("capsWarning");
  if (!capsWarning) return;

  function verificarCaps(e) {
    const capsOn = e.getModifierState && e.getModifierState("CapsLock");
    capsWarning.textContent = capsOn ? "¡Mayúsculas activadas!" : "";
  }

  emailEl.addEventListener("keyup", verificarCaps);
  passEl.addEventListener("keyup", verificarCaps);
}