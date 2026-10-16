import React, { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

// <img> that shows a fallback (and logs the failing URL) instead of a broken-image icon.
export default function SafeImage({ src, alt = "", className = "", fallback = null, ...rest }) {
  const [failed, setFailed] = useState(!src);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setFailed(!src); setLoaded(false); }, [src]);

  if (failed) {
    return fallback ?? (
      <div className={`${className} flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-slate-400`} data-testid="image-fallback">
        <ImageOff className="w-1/3 h-1/3 max-w-6 max-h-6" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`${className} object-cover object-center transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      onLoad={() => setLoaded(true)}
      onError={() => { console.warn("Image failed to load:", src); setFailed(true); }}
      {...rest}
    />
  );
}
