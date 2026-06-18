import React, { useState, useEffect } from 'react';

/**
 * Renders an account's logo with a graceful fallback to its name.
 *
 * Why this exists: a chunk of accounts have a `logo_url` pointing to a file
 * that no longer exists on disk (older uploads, broken paths). The previous
 * `<img>` with no error handler left the browser's default broken-image icon
 * visible, which looks terrible. This component swaps in the name-text
 * fallback on the very first `onError` event.
 */
export default function AccountLogoTile({ logoUrl, name, className = 'w-full h-full object-contain p-1' }) {
  const [failed, setFailed] = useState(false);

  // Reset when the logo url changes (e.g. user uploads a new one).
  useEffect(() => { setFailed(false); }, [logoUrl]);

  const showImage = !!logoUrl && !failed;

  return showImage ? (
    <img
      src={`${process.env.REACT_APP_BACKEND_URL}${logoUrl}`}
      alt={name}
      className={className}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center p-1 bg-gradient-to-br from-gray-50 to-gray-100">
      <p className="text-[8px] font-medium text-gray-500 text-center leading-tight line-clamp-3 px-1">
        {name}
      </p>
    </div>
  );
}
