import { useState } from 'react';

interface ImageCardProps {
  title: string;
  artist?: string;
  year?: string;
  sourceUrl: string;
  imageUrl: string;
}

function ImageCard({ title, artist, year, sourceUrl, imageUrl }: ImageCardProps) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    console.error(`[ImageCard] Failed to load image: ${imageUrl}`);
    setImageError(true);
  };

  const showImage = imageUrl && !imageError;

  return (
    <div className="artifact-card image-card">
      <div className="artifact-type">Image</div>
      {showImage ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={imageUrl}
            alt={title}
            className="artwork-image"
            onError={handleImageError}
          />
        </a>
      ) : (
        <div className="image-placeholder">
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
              View artwork
            </a>
          ) : (
            <span className="no-link">Image unavailable</span>
          )}
        </div>
      )}
      <h3 className="artifact-title">{title}</h3>
      {artist && <p className="artifact-artist">{artist}</p>}
      {year && <p className="artifact-year">{year}</p>}
    </div>
  );
}

export default ImageCard;
