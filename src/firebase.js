import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBntKv5YUjvoDDXsuBxQmzPFRqX99KMbxo",
    authDomain: "schichttagebuch-da2c3.firebaseapp.com",
    projectId: "schichttagebuch-da2c3",
    storageBucket: "schichttagebuch-da2c3.firebasestorage.app",
    messagingSenderId: "683631366023",
    appId: "1:683631366023:web:3d6a5dd3b89752895c4d22"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
