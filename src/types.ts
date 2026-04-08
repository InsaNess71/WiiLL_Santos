export interface Confession {
  id: string;
  text: string;
  category: string;
  age?: number;
  gender?: string;
  likes: number;
  commentCount: number;
  createdAt: any; // Firestore Timestamp
  authorId: string;
}

export interface Comment {
  id: string;
  confessionId: string;
  text: string;
  createdAt: any; // Firestore Timestamp
  authorId: string;
}

export interface UserProfile {
  id: string;
  nickname: string;
  createdAt: any;
  lastActive?: any;
  gender?: string;
  maritalStatus?: string;
  bio?: string;
  avatar?: string;
}

export interface Chat {
  id: string;
  participants: string[];
  expiresAt: any;
  durationMode: '1h' | '24h';
  updatedAt: any;
  unreadCount?: Record<string, number>;
  lastMessage?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: any;
  isSystem: boolean;
}

export const CATEGORIES = [
  'Relacionamentos',
  'Segredos',
  'Família',
  'Sexo',
  'Vida',
  'Arrependimentos'
];

export const AVATARS = [
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=1&head=short1&backgroundColor=ffffff", // Menino
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=2&head=mediumStraight&backgroundColor=ffffff", // Menina
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=3&head=hatHipHop&backgroundColor=ffffff", // Menino de boné
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=4&head=winterHat1&backgroundColor=ffffff", // Menina de toca
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=5&head=bun&backgroundColor=ffffff", // Cabelo preso
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=6&head=short2&backgroundColor=ffffff", // Menino 2
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=7&head=short3&facialHair=beard&backgroundColor=ffffff", // Barba
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=8&head=dreads1&backgroundColor=ffffff", // Dreads
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=9&head=medium1&backgroundColor=ffffff", // Cacheado
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=10&head=hijab&backgroundColor=ffffff", // Hijab
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=11&head=turban&backgroundColor=ffffff", // Turbante
  "https://api.dicebear.com/7.x/open-peeps/svg?seed=12&head=longBangs&backgroundColor=ffffff" // Franja
];
