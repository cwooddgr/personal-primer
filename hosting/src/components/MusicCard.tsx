interface MusicCardProps {
  title: string;
  artist: string;
  appleMusicUrl: string;
}

function MusicCard({ title, artist, appleMusicUrl }: MusicCardProps) {
  return (
    <div className="artifact-card music-card">
      <div className="artifact-type">Music</div>
      <h3 className="artifact-title">{title}</h3>
      <p className="artifact-artist">{artist}</p>
      {appleMusicUrl ? (
        <a
          href={appleMusicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="music-link"
        >
          Listen on Apple Music
        </a>
      ) : (
        <p className="no-link">Link unavailable</p>
      )}
    </div>
  );
}

export default MusicCard;
