export * from './config';
export * from './provider';
export * from './hooks';

import { getApps, getApp, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

export const initializeFirebase = () => {
  const apps = getApps();
  const app = apps.length > 0 ? getApp() : initializeApp(firebaseConfig);
  const firestore = getFirestore(app);
  const auth = getAuth(app);
  const storage = getStorage(app);

  return { app, firestore, auth, storage };
};
