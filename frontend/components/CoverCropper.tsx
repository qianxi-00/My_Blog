/**
 * 封面图片裁剪组件
 * 支持缩放、拖动、框选区域后裁剪上传
 */
import React, { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Icons } from './Icons';

interface CoverCropperProps {
  /** 原始图片的 object URL 或 base64 */
  imageSrc: string;
  /** 裁剪完成后回调，传递裁剪后的 Blob */
  onCropComplete: (croppedBlob: Blob) => void;
  /** 取消裁剪 */
  onCancel: () => void;
  /** 目标宽高比，默认 16:9 */
  aspect?: number;
}

/**
 * 将裁剪区域应用到图片上，生成裁剪后的 Blob
 */
const createCroppedImage = (imageSrc: string, cropArea: Area): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = cropArea.width;
      canvas.height = cropArea.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法获取 Canvas 上下文'));
        return;
      }

      ctx.drawImage(
        image,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        cropArea.width,
        cropArea.height,
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('裁剪失败'));
          }
        },
        'image/jpeg',
        0.92,
      );
    };
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = imageSrc;
  });
};

const CoverCropper: React.FC<CoverCropperProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
  aspect = 16 / 9,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await createCroppedImage(imageSrc, croppedAreaPixels);
      onCropComplete(blob);
    } catch (error) {
      console.error('裁剪失败:', error);
      alert('裁剪失败，请重试');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col backdrop-blur-sm">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-700">
        <h3 className="text-white font-bold text-lg">裁剪封面图片</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors font-medium"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={processing}
            className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 transition-all disabled:opacity-50 font-medium shadow-lg shadow-cyan-500/20"
          >
            {processing ? '处理中...' : '确认裁剪'}
          </button>
        </div>
      </div>

      {/* 裁剪区域 */}
      <div className="flex-1 relative">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
          showGrid={true}
          style={{
            containerStyle: { background: '#0f172a' },
            cropAreaStyle: { border: '2px solid #06b6d4', color: 'rgba(0,0,0,0.6)' },
          }}
        />
      </div>

      {/* 底部缩放控制栏 */}
      <div className="flex items-center justify-center gap-4 px-6 py-4 bg-slate-900/90 border-t border-slate-700">
        <Icons.ZoomOut className="w-5 h-5 text-slate-400" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-64 h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
        />
        <Icons.ZoomIn className="w-5 h-5 text-slate-400" />
        <span className="text-slate-400 text-sm font-mono ml-2 min-w-[3rem]">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
};

export default CoverCropper;
