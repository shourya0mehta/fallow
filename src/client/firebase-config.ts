/**
 * Fallow's Firebase web app (free Spark plan).
 *
 * These values are public by design: every Firebase site ships them in its
 * page. Access is enforced by the Firestore security rules (each person can
 * read and write only users/{their uid}) and by the list of domains allowed to
 * sign in, not by keeping this config secret.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDyjVY484OfWvymmWuBH6_OaqtT5aPR238",
  authDomain: "fallow-e9693.firebaseapp.com",
  projectId: "fallow-e9693",
  storageBucket: "fallow-e9693.firebasestorage.app",
  messagingSenderId: "845579745181",
  appId: "1:845579745181:web:adfd9acaaa2c00568ee174",
};

/** For tests: point at the local Auth and Firestore emulators instead. */
export const FIREBASE_EMULATOR = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";

export const EMULATOR_CONFIG = {
  apiKey: "demo-key",
  authDomain: "127.0.0.1",
  projectId: "demo-fallow",
  appId: "demo-app",
};

/** Sync can be switched off for a build with NEXT_PUBLIC_FALLOW_SYNC=0. */
export const SYNC_ENABLED = process.env.NEXT_PUBLIC_FALLOW_SYNC !== "0";
