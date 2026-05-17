interface MusicCardProps {
  title: string;
  artist: string;
  youtubeUrl: string;
}

function MusicCard({ title, artist, youtubeUrl }: MusicCardProps) {
  return (
    <div className="artifact-card music-card">
      <div className="artifact-type">Music</div>
      <h3 className="artifact-title">{title}</h3>
      <p className="artifact-artist">{artist}</p>
      <div className="music-links">
        {youtubeUrl ? (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="music-link"
          >
            Listen on YouTube
          </a>
        ) : (
          <span className="no-link">Recording unavailable</span>
        )}
      </div>
    </div>
  );
}

export default MusicCard;
