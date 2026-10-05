import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/**
 * Same Firebase project as the original web app (the client-side config is public by design; access is governed by
 * Firestore rules). Can be overridden with VITE_FIREBASE_* variables in a `.env.local` file.
 */
const env = import.meta.env ?? {};
const FIREBASE_PROJECT_ID = 'ssjeeva-f5679';
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyAHrsyRqHvPROtRCfMpb_TRH8XhXGR83DE',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'ssjeeva-f5679.firebaseapp.com',
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'ssjeeva-f5679.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '1001926126226',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:1001926126226:web:9fa81b949c20544eccd44b',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-5C6FPVGHQ5',
};

if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID !== FIREBASE_PROJECT_ID) {
  throw new Error(
    `Invalid Firebase project "${env.VITE_FIREBASE_PROJECT_ID}". This application must use "${FIREBASE_PROJECT_ID}".`,
  );
}

let app = null;
let firestore = null;
let analytics = null;

export function getFirebaseApp() {
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAnalytics() {
  if (!analytics) analytics = getAnalytics(getFirebaseApp());
  return analytics;
}

export function getDb() {
  if (firestore) return firestore;
  const a = getFirebaseApp();
  try {
    firestore = initializeFirestore(a, {
      // IndexedDB persistence with multi-tab support (the original app called enablePersistence({ synchronizeTabs })):
      // reads keep working offline and the PWA opens with the last synced data.
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      // Optional fields left `undefined` by the UI are dropped instead of rejecting the write.
      ignoreUndefinedProperties: true,
    });
  } catch {
    // Already initialised (hot reload) — reuse the existing instance.
    firestore = getFirestore(a);
  }
  return firestore;
}
