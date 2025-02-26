import { auth, db, storage } from "./firebase";
import {
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  DocumentData
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Task } from '@/lib/types';

// Auth functions
export const logoutUser = () => signOut(auth);

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

// Firestore functions
export const addDocument = (collectionName: string, data: any) =>
  addDoc(collection(db, collectionName), data);

export const getDocuments = async (collectionName: string) => {
  const querySnapshot = await getDocs(collection(db, collectionName));
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

export const updateDocument = (collectionName: string, id: string, data: any) =>
  updateDoc(doc(db, collectionName, id), data);

export const deleteDocument = (collectionName: string, id: string) =>
  deleteDoc(doc(db, collectionName, id));

// Storage functions
export const uploadFile = async (file: File, path: string) => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
};

// Collection references
const tasksCollection = collection(db, 'tasks');

// Types
interface FirebaseTask extends Omit<Task, 'id' | 'metadata'> {
  userId: string;
  metadata?: {
    duration?: number;
    priority?: 'low' | 'medium' | 'high';
    energy?: 'low' | 'medium' | 'high';
    tags?: string[];
    date?: Timestamp;
  };
}

// Convert Firestore data to Task
const convertFirebaseTask = (doc: DocumentData): Task => {
  const data = doc.data() as FirebaseTask;
  return {
    id: doc.id,
    title: data.title,
    completed: data.completed,
    userId: data.userId,
    createdAt: data.createdAt || Date.now(),
    updatedAt: data.updatedAt || Date.now(),
    metadata: {
      ...data.metadata,
      dueDate: data.metadata?.date ? data.metadata.date.toDate().toISOString() : undefined,
    },
  };
};

// Get all tasks for a user
export const getUserTasks = async (userId: string): Promise<Task[]> => {
  const q = query(
    tasksCollection,
    where('userId', '==', userId)
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(convertFirebaseTask);
};

// Get a single task
export const getTask = async (taskId: string): Promise<Task | null> => {
  const taskDoc = await getDoc(doc(tasksCollection, taskId));
  if (!taskDoc.exists()) return null;
  return convertFirebaseTask(taskDoc);
};

// Add a new task
export const addTask = async (task: Omit<Task, 'id'>): Promise<string> => {
  const taskData: any = {
    ...task,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {
      ...task.metadata,
    },
  };
  
  const docRef = await addDoc(tasksCollection, taskData);
  return docRef.id;
};

// Update a task
export const updateTask = async (taskId: string, updates: Partial<Omit<Task, 'id'>>): Promise<void> => {
  const taskRef = doc(tasksCollection, taskId);
  const updateData: any = {
    ...updates,
    updatedAt: Date.now(),
  };
  
  await updateDoc(taskRef, updateData);
};

// Delete a task
export const deleteTask = async (taskId: string): Promise<void> => {
  await deleteDoc(doc(tasksCollection, taskId));
};

// Toggle task completion
export const toggleTaskCompletion = async (taskId: string, completed: boolean): Promise<void> => {
  const taskRef = doc(tasksCollection, taskId);
  await updateDoc(taskRef, { 
    completed,
    updatedAt: Date.now()
  });
};

// Update task metadata
export const updateTaskMetadata = async (
  taskId: string,
  metadata: Task['metadata']
): Promise<void> => {
  const taskRef = doc(tasksCollection, taskId);
  const updateData = {
    metadata: {
      ...metadata,
      date: metadata?.date ? Timestamp.fromDate(metadata.date) : undefined,
    },
  };
  
  await updateDoc(taskRef, updateData);
};
