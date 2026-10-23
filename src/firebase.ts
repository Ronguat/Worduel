import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig'

// `npm run dev:emu` talks to local emulators instead of the real project.
const emulator = import.meta.env.DEV && import.meta.env.VITE_EMULATOR === '1'

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  localCache: emulator ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

if (emulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  // Lets test scripts sign in as a fake Google user.
  Object.assign(window, {
    testSignIn: (sub: string, name: string) =>
      signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email: `${sub}@example.com`, name }))),
  })
}
