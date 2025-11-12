// --- Firebase imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

// --- Carga config desde Hosting ---
const res = await fetch('/__/firebase/init.json');
const firebaseConfig = await res.json();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- Comprueba el estado antes de mostrar nada ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        // No hay sesión → redirige antes de mostrar la página
        window.location.replace("/login/login.html");
    } else {
        console.log("Usuario autenticado:", user.email);
        document.getElementById("loader")?.remove();
        document.body.style.visibility = "visible";
    }
});

// --- Accion para cerrar sesión ---
const logoutBtn = document.getElementById("logoutButton");
logoutBtn.addEventListener("click", async () => {
    const auth = getAuth(app);
    await auth.signOut();
    window.location.replace("/login/login.html");
});
