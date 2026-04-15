import { useEffect, useState } from 'react';
import Tooltip from '../../ui/Tooltip';

export default function InventoryImage({
  imageUrl,
  alt,
  sizeClass,
  fallbackIcon,
  fallbackIconClass = 'text-xl',
  wrapperClassName = '',
  imageClassName = '',
  tooltipContent = null,
  tooltipDelay = 300,
}) {
  const [isLoading, setIsLoading] = useState(Boolean(imageUrl));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    setIsLoading(Boolean(imageUrl));
  }, [imageUrl]);

  const fallbackNode = (
    <div className={`relative ${sizeClass} ${wrapperClassName}`}>
      <span
        className={`material-symbols-outlined ${fallbackIconClass} text-on-surface-variant/80`}
        style={{ fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
      >
        {fallbackIcon}
      </span>
    </div>
  );

  const imageNode = (!imageUrl || hasError) ? fallbackNode : (
    <div className={`relative ${sizeClass} ${wrapperClassName}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-surface-container-highest/80 rounded-sm flex items-center justify-center z-10">
          <span className="material-symbols-outlined text-base text-primary-dim animate-spin">progress_activity</span>
        </div>
      )}
      <img
        src={imageUrl}
        alt={alt}
        className={`w-full h-full rounded-sm object-cover border border-outline-variant/15 ${imageClassName} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </div>
  );

  if (!tooltipContent) return imageNode;
  return (
    <Tooltip content={tooltipContent} delay={tooltipDelay} tooltipClassName="!max-w-none !p-3">
      {imageNode}
    </Tooltip>
  );
}
