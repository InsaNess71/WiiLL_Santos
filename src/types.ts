import { Timestamp } from 'firebase/firestore';

export interface Confession {
  id: string;
  text: string;
  category: string;
  age?: number;
  gender?: string;
  likes: number;
  commentCount: number;
  judgement?: { right: number, wrong: number };
  createdAt: Timestamp | any; // Firestore Timestamp or FieldValue during creation
  authorId: string;
}

export interface Comment {
  id: string;
  confessionId: string;
  text: string;
  likes?: number;
  createdAt: Timestamp | any;
  authorId: string;
}

export interface UserProfile {
  id: string;
  nickname: string;
  createdAt: Timestamp | any;
  lastActive?: Timestamp | any;
  gender?: string;
  maritalStatus?: string;
  bio?: string;
  avatar?: string;
}

export interface Chat {
  id: string;
  participants: string[];
  expiresAt: Timestamp | any;
  durationMode: '1h' | '24h';
  updatedAt: Timestamp | any;
  unreadCount?: Record<string, number>;
  lastMessage?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: Timestamp | any;
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
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Felix&backgroundColor=transparent", // Menino
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Aneka&backgroundColor=transparent", // Menina
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Jack&backgroundColor=transparent", // Menino estiloso
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Jocelyn&backgroundColor=transparent", // Menina de óculos
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Aidan&backgroundColor=transparent", // Menino sorrindo
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Sophia&backgroundColor=transparent", // Menina cabelo longo
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Brian&backgroundColor=transparent", // Menino com barba
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Liliana&backgroundColor=transparent", // Menina cabelo curto
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Christian&backgroundColor=transparent", // Menino sério
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Destiny&backgroundColor=transparent", // Menina cacheada
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Mason&backgroundColor=transparent", // Menino descolado
  "https://api.dicebear.com/9.x/avataaars/svg?seed=Avery&backgroundColor=transparent" // Menina moderna
];
