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
  background?: string;
  isHidden?: boolean;
  imageUrl?: string;
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
  isAI?: boolean;
  isBest?: boolean;
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
  role?: 'admin' | 'user';
  isVerified?: boolean;
  isShadowBanned?: boolean;
  isPremium?: boolean;
  premiumUntil?: Timestamp | any;
  karma?: number;
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
  imageUrl?: string;
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

export const ADMIN_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="adminGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f472b6" /><stop offset="100%" stop-color="#831843" /></linearGradient><filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter></defs><rect width="100" height="100" fill="url(#adminGrad)" /><g transform="translate(22, 22) scale(2.3)" fill="#ffffff" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" fill-opacity="0.2"/></g></svg>`)}`;

export const REPORT_REASONS = [
  'Conteúdo ofensivo ou discurso de ódio',
  'Spam ou propaganda',
  'Conteúdo sexualmente explícito',
  'Incentivo à violência ou automutilação',
  'Assédio ou bullying'
];
