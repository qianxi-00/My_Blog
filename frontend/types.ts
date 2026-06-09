import React from 'react';

export interface Article {
  id: number;
  title: string;
  summary: string;
  category: string;
  date: string;
  readTime: string;
  imageUrl: string;
  tags: string[];
}

export interface Prompt {
  id: number;
  title: string;
  description: string;
  content: string;
  category: 'Dev' | 'Writing' | 'Business' | 'Academic';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
}

export interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  icon: React.ReactNode;
}

export interface Comment {
  id: number;
  user: string;
  avatar?: string;
  content: string;
  date: string;
  replies?: Comment[];
}