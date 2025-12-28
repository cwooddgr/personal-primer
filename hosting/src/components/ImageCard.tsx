interface ImageCardProps {
  title: string;
  artist?: string;
  year?: string;
  sourceUrl: string;
  imageUrl: string;
}

function ImageCard({ title, artist, year, sourceUrl, imageUrl }: ImageCardProps) {
  return (
    <div className="artifact-card image-card">
      <div className="artifact-type">Image</div>
      {imageUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          <img src={imageUrl} alt={title} className="artwork-image" />
        </a>
      ) : (
        <div className="image-placeholder">
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            View artwork
          </a>
        </div>
      )}
      <h3 className="artifact-title">{title}</h3>
      {artist && <p className="artifact-artist">{artist}</p>}
      {year && <p className="artifact-year">{year}</p>}
    </div>
  );
}

export default ImageCard;
