/**
 * 订阅相关 API
 */
import api from './config';

export interface SubscribeResponse {
    success: boolean;
    message: string;
}

export interface Subscriber {
    id: number;
    email: string;
    is_active: boolean;
    is_frozen: boolean;
    subscribed_at: string;
    unsubscribed_at?: string;
    frozen_at?: string;
}

// 订阅邮件通知
export const subscribe = async (email: string): Promise<SubscribeResponse> => {
    const response = await api.post('/subscribe', { email });
    return response.data;
};

// 取消订阅
export const unsubscribe = async (token: string): Promise<SubscribeResponse> => {
    const response = await api.get(`/unsubscribe/${token}`);
    return response.data;
};

// 冻结/解冻订阅者
export const freezeSubscriber = async (id: number, frozen: boolean): Promise<Subscriber> => {
    const response = await api.put(`/subscribers/${id}/freeze?frozen=${frozen}`);
    return response.data;
};
