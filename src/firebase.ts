import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  disableNetwork,
  enableNetwork,
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

// Phones freeze pages in the background, which can leave Firestore's live connection silently dead:
// saves still work, but updates stop arriving. Reopen the connection whenever the app comes back.
let hiddenSince = 0
async function reconnect() {
  try {
    await disableNetwork(db)
    await enableNetwork(db)
  } catch (e) {
    console.warn('Reconnect failed', e)
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenSince = Date.now()
  else if (hiddenSince && Date.now() - hiddenSince > 3000) {
    hiddenSince = 0
    void reconnect()
  }
})
window.addEventListener('online', () => void reconnect())
window.addEventListener('pageshow', (e) => e.persisted && void reconnect())
