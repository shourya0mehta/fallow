import type { Auth, User } from "firebase/auth";
import type { Firestore } from "firebase/firestore/lite";
import { EMULATOR_CONFIG, FIREBASE_CONFIG, FIREBASE_EMULATOR } from "./firebase-config";

/**
 * Google sign-in through Firebase Auth, loaded only when someone signs in (or
 * was signed in last time), so visitors who never sync never download it.
 */

export interface AccountUser {
  uid: string;
  name: string | null;
  email: string | null;
  photo: string | null;
}

export interface FirebaseKit {
  auth: Auth;
  db: Firestore;
  a: typeof import("firebase/auth");
  f: typeof import("firebase/firestore/lite");
}

let kit: Promise<FirebaseKit> | null = null;

export function firebase(): Promise<FirebaseKit> {
  kit ??= (async () => {
    const [{ initializeApp, getApps }, a, f] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore/lite")]);
    const app = getApps()[0] ?? initializeApp(FIREBASE_EMULATOR ? EMULATOR_CONFIG : FIREBASE_CONFIG);
    const auth = a.getAuth(app);
    const db = f.getFirestore(app);
    if (FIREBASE_EMULATOR) {
      a.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      f.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    return { auth, db, a, f };
  })();
  return kit;
}

/** Start the download early (on hover or when a sign-in prompt appears) so the popup opens right away. */
export function prefetchFirebase(): void {
  void firebase().catch(() => undefined);
}

export function toUser(u: User): AccountUser {
  return { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL };
}

export async function signInWithGoogle(): Promise<AccountUser> {
  const { auth, a } = await firebase();
  const provider = new a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await a.signInWithPopup(auth, provider);
  return toUser(cred.user);
}

export async function signOutOfGoogle(): Promise<void> {
  const { auth, a } = await firebase();
  await a.signOut(auth);
}

/** The signed-in person after Firebase restores the saved session, or null. */
export async function restoredUser(): Promise<AccountUser | null> {
  const { auth } = await firebase();
  await auth.authStateReady();
  return auth.currentUser ? toUser(auth.currentUser) : null;
}

/** Sign-in errors worth showing; a closed popup is not one of them. */
export function signInErrorText(e: unknown): string | null {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled") return null;
  if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  if (code === "auth/unauthorized-domain") return "Sign-in isn't set up for this web address yet.";
  if (code === "auth/network-request-failed") return "No connection. Try again when you're online.";
  return "Sign-in didn't work. Try again in a moment.";
}

/** Remembered between visits so a returning, signed-in person gets their garden without a click. */
const FLAG = "fallow.account";
export function rememberSignedIn(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(FLAG, "1");
    else window.localStorage.removeItem(FLAG);
  } catch {
    /* storage is optional */
  }
}
export function wasSignedIn(): boolean {
  try {
    return window.localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}
