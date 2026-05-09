import { auth, db } from './firebase';
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs, 
    deleteDoc, 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp, 
    Timestamp,
    writeBatch
} from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface ChatTurn {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: number;
    duration?: number;
    sessionId?: string;
}

const HISTORY_COLLECTION = 'chat_history';
const PROFILE_COLLECTION = 'user_profiles';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days exactly

export const ConversationStore = {
    saveTurn: async (userId: string, turn: Omit<ChatTurn, 'id'>) => {
        try {
            await addDoc(collection(db, HISTORY_COLLECTION), {
                userId,
                ...turn,
                serverTime: serverTimestamp()
            });
            // Rolling cleanup
            await ConversationStore.cleanup(userId);
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, HISTORY_COLLECTION);
        }
    },

    getHistory: async (userId: string): Promise<ChatTurn[]> => {
        try {
            const thirtyDaysAgo = Date.now() - MAX_AGE_MS;
            const q = query(
                collection(db, HISTORY_COLLECTION),
                where('userId', '==', userId),
                where('timestamp', '>', thirtyDaysAgo),
                orderBy('timestamp', 'asc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as ChatTurn));
        } catch (e) {
            handleFirestoreError(e, OperationType.LIST, HISTORY_COLLECTION);
            return [];
        }
    },

    cleanup: async (userId: string) => {
        try {
            // Rolling deletion: Remove documents older than 30 days
            const thirtyDaysAgo = Date.now() - MAX_AGE_MS;
            const qOld = query(
                collection(db, HISTORY_COLLECTION),
                where('userId', '==', userId),
                where('timestamp', '<', thirtyDaysAgo)
            );
            const oldSnapshot = await getDocs(qOld);
            
            if (oldSnapshot.empty) return;

            const batch = writeBatch(db);
            oldSnapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, "cleanup_batch");
        }
    },

    clear: async (userId: string) => {
        try {
            const q = query(collection(db, HISTORY_COLLECTION), where('userId', '==', userId));
            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        } catch (e) {
           handleFirestoreError(e, OperationType.DELETE, HISTORY_COLLECTION);
        }
    }
};

export const UserProfileStore = {
    saveProfile: async (userId: string, data: { name?: string, voice?: string }) => {
        try {
            await setDoc(doc(db, PROFILE_COLLECTION, userId), data, { merge: true });
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, PROFILE_COLLECTION);
        }
    },

    getProfile: async (userId: string) => {
        try {
            const docRef = doc(db, PROFILE_COLLECTION, userId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data() : null;
        } catch (e) {
            handleFirestoreError(e, OperationType.GET, PROFILE_COLLECTION);
            return null;
        }
    }
};
