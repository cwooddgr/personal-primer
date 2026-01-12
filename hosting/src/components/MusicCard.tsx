interface MusicCardProps {
  title: string;
  artist: string;
  appleMusicUrl: string;
}

function MusicCard({ title, artist, appleMusicUrl }: MusicCardProps) {
  const youtubeMusicUrl = `https://music.youtube.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;

  return (
    <div className="artifact-card music-card">
      <div className="artifact-type">Music</div>
      <h3 className="artifact-title">{title}</h3>
      <p className="artifact-artist">{artist}</p>
      <div className="music-links">
        {appleMusicUrl ? (
          <a
            href={appleMusicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="music-link"
          >
            Apple Music
          </a>
        ) : (
          <span className="no-link">Apple Music unavailable</span>
        )}
        <span className="link-separator">·</span>
        <a
          href={youtubeMusicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="music-link"
        >
          YouTube Music
        </a>
      </div>
    </div>
  );
}

export default MusicCard;
