import api from './config';

export interface SiteSetting {
    key: string;
    value: string;
    type: 'string' | 'json' | 'number' | 'boolean';
    description?: string;
    updated_at?: string;
}

export interface SiteSettingUpdate {
    value: string;
}

export interface ContactInfo {
    email?: string;
    wechat?: string;
    github?: string;
    qq?: string;
    bilibili?: string;
}

export interface PublicSiteSettings {
    site_title: string;
    site_description: string;
    admin_avatar: string;
    admin_bio: string;
    contact: ContactInfo;
}

// Get public settings
export const getPublicSettings = async (): Promise<PublicSiteSettings> => {
    const response = await api.get('/settings/public');
    return response.data;
};

// Get all settings (admin only)
export const getAllSettings = async (): Promise<SiteSetting[]> => {
    const response = await api.get('/settings');
    return response.data;
};

// Update single setting
export const updateSetting = async (key: string, value: string): Promise<SiteSetting> => {
    const response = await api.put(`/settings/${key}`, { value });
    return response.data;
};

// Batch update settings
export const updateSettingsBatch = async (settings: Record<string, string>): Promise<void> => {
    await api.put('/settings/batch', settings);
};
