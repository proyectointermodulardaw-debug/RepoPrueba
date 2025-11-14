// --- Firebase imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { showSnackbar } from "../js/modules/snackbar.js";

// --- Carga config desde Hosting ---
const res = await fetch('/__/firebase/init.json');
const firebaseConfig = await res.json();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const emailInput = document.getElementById('email');
    const email = emailInput.value;
    const savedEmail = localStorage.getItem('resetEmail');
    if (savedEmail) {
        emailInput.value = savedEmail;
        localStorage.removeItem('resetEmail');
    }
const botonEnviar = document.getElementById('enviarEnlaceRec');

botonEnviar.addEventListener('click', async (e) => {
    e.preventDefault(); // Evita el envío del formulario por defecto
    const email = emailInput.value.trim();
    try {
        await sendPasswordResetEmail(auth, email);
        showSnackbar('Enlace de restablecimiento enviado. Revisa tu correo.', 'success', 3000);
    } catch (error) {
        console.error('Error al enviar el correo de restablecimiento de contraseña:', error);
        showSnackbar('Error al enviar el enlace de restablecimiento. Inténtalo de nuevo.', 'error', 3000);
    }
});