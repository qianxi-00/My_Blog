/**
 * 文件上传相关 API
 */
import api from './config';

export interface UploadedImage {
    id: number;
    article_id?: number;
    filename: string;
    stored_name: string;
    file_path: string;
    file_size: number;
    mime_type: string;
    url: string;
    created_at: string;
}

export interface MarkdownUploadResult {
    title: string;
    content: string;
    filename: string;
    images_processed?: number;
}

// 上传图片
export const uploadImage = async (file: File, articleId?: number): Promise<UploadedImage> => {
    const formData = new FormData();
    formData.append('file', file);
    if (articleId) {
        formData.append('article_id', articleId.toString());
    }

    const response = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

// 上传 Markdown 文件
export const uploadMarkdown = async (file: File): Promise<MarkdownUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/upload/markdown', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

// 上传 Markdown ZIP 文件（包含图片）
export const uploadMarkdownZip = async (file: File): Promise<MarkdownUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/upload/markdown-zip', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

// 获取上传的图片列表
export const getImages = async (articleId?: number): Promise<UploadedImage[]> => {
    const response = await api.get('/upload/images', {
        params: { article_id: articleId },
    });
    return response.data;
};

// 删除图片
export const deleteImage = async (id: number): Promise<void> => {
    await api.delete(`/upload/images/${id}`);
};
