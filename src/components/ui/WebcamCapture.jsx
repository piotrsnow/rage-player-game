import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const MAX_SIZE = 1024;
const ASPECT_RATIO = 3 / 4;

function resizeAndCrop(video, canvas) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const targetH = Math.min(vh, vw / ASPECT_RATIO);
  const targetW = targetH * ASPECT_RATIO;

  const sx = (vw - targetW) / 2;
  const sy = (vh - targetH) / 2;

  const outW = Math.min(targetW, MAX_SIZE * ASPECT_RATIO);
  const outH = Math.min(targetH, MAX_SIZE);

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, sx, sy, targetW, targetH, 0, 0, outW, outH);
}

function resizeFile(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const vw = img.naturalWidth;
      const vh = img.naturalHeight;

      const targetH = Math.min(vh, vw / ASPECT_RATIO);
      const targetW = targetH * ASPECT_RATIO;
      const sx = (vw - targetW) / 2;
      const sy = (vh - targetH) / 2;

      const outW = Math.min(targetW, MAX_SIZE * ASPECT_RATIO);
      const outH = Math.min(targetH, MAX_SIZE);

      canvas.width = outW;
      canvas.height = outH;
      canvas.getContext('2d').drawImage(img, sx, sy, targetW, targetH, 0, 0, outW, outH);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(img.src);
        resolve(blob);
      }, 'image/jpeg', 0.9);
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function WebcamCapture({ onCapture, onCancel }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  const [mode, setMode] = useState(null); // null | 'camera' | 'preview'
  const [previewUrl, setPreviewUrl] = useState(null);
  const [cameraError, setCameraError] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [stopCamera, previewUrl]);

  const startCamera = useCallback(async () => {
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1024 }, height: { ideal: 1365 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setMode('camera');
    } catch {
      setCameraError(true);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    resizeAndCrop(video, canvas);
    stopCamera();

    canvas.toBlob((blob) => {
      if (!blob) return;
      setPreviewUrl(URL.createObjectURL(blob));
      setMode('preview');
      onCapture(blob);
    }, 'image/jpeg', 0.9);
  }, [onCapture, stopCamera]);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await resizeFile(file);
    setPreviewUrl(URL.createObjectURL(blob));
    setMode('preview');
    onCapture(blob);
  }, [onCapture]);

  const retake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setMode(null);
  }, [previewUrl]);

  if (mode === 'preview' && previewUrl) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full max-w-[220px] aspect-[3/4] rounded-sm overflow-hidden border border-outline-variant/20">
          <img src={previewUrl} alt="Captured" className="w-full h-full object-cover" />
        </div>
        <button
          type="button"
          onClick={retake}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-label text-tertiary hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10"
        >
          <span className="material-symbols-outlined text-sm">restart_alt</span>
          {t('charCreator.retakePhoto')}
        </button>
      </div>
    );
  }

  if (mode === 'camera') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full max-w-[220px] aspect-[3/4] rounded-sm overflow-hidden border border-primary/30 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover mirror"
            style={{ transform: 'scaleX(-1)' }}
          />
          <div className="absolute inset-0 border-2 border-primary/20 rounded-sm pointer-events-none" />
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={capturePhoto}
            className="flex items-center gap-1.5 px-4 py-2 bg-surface-tint text-on-primary text-xs font-label font-bold rounded-sm border border-primary shadow-[0_0_15px_rgba(197,154,255,0.3)] hover:shadow-[0_0_25px_rgba(197,154,255,0.5)] transition-all"
          >
            <span className="material-symbols-outlined text-sm">photo_camera</span>
            {t('charCreator.capturePhoto')}
          </button>
          <button
            type="button"
            onClick={() => { stopCamera(); setMode(null); }}
            className="px-3 py-2 text-xs font-label text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-[220px] aspect-[3/4] rounded-sm border border-dashed border-outline-variant/30 bg-surface-container-high/20 flex flex-col items-center justify-center gap-3">
        <span className="material-symbols-outlined text-4xl text-outline/30">photo_camera</span>
        {cameraError && (
          <p className="text-[11px] text-error text-center px-3">{t('charCreator.cameraError')}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={startCamera}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-label text-tertiary hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10"
        >
          <span className="material-symbols-outlined text-sm">videocam</span>
          {t('charCreator.openCamera')}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-label text-tertiary hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10"
        >
          <span className="material-symbols-outlined text-sm">upload_file</span>
          {t('charCreator.uploadPhoto')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-outline hover:text-on-surface-variant transition-colors"
        >
          {t('common.cancel')}
        </button>
      )}
    </div>
  );
}
