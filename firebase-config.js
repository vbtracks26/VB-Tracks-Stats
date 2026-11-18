
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBYSemElbIDgW_uKQywA_1SbS7FinzAA-M",
  authDomain: "vb-tracks.firebaseapp.com",
  projectId: "vb-tracks",
  storageBucket: "vb-tracks.firebasestorage.app",
  messagingSenderId: "168455947035",
  appId: "1:168455947035:web:5394bfe7ff0e912d8d89be",
  measurementId: "G-21T3Q2QPPH"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
