import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Read configuration from Vite environment variables.
const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || '',
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || '',
  // measurementId is optional
  measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);
