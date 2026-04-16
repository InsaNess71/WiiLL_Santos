import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

// Simple memory cache to prevent N+1 queries for user profiles
const userCache = new Map<string, Promise<UserProfile | null>>();

export const getUserProfile = (userId: string): Promise<UserProfile | null> => {
  if (!userCache.has(userId)) {
    const promise = getDoc(doc(db, 'users', userId))
      .then(snap => {
        if (snap.exists()) {
          return snap.data() as UserProfile;
        }
        return null;
      })
      .catch(err => {
        console.error(`Error fetching user profile for ${userId}:`, err);
        userCache.delete(userId); // Allow retry on failure
        return null;
      });
    userCache.set(userId, promise);
  }
  return userCache.get(userId)!;
};

export const updateUserCache = (userId: string, updatedData: Partial<UserProfile>) => {
  if (userCache.has(userId)) {
    const currentPromise = userCache.get(userId)!;
    const updatedPromise = currentPromise.then(profile => {
      if (profile) {
        return { ...profile, ...updatedData };
      }
      return null;
    });
    userCache.set(userId, updatedPromise);
  }
};
