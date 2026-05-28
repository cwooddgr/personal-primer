interface MusicCardProps {
  title: string;
  artist: string;
  youtubeUrl: string;
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
    if (u.hostname.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts') {
        return parts[1] || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function MusicCard({ title, artist, youtubeUrl }: MusicCardProps) {
  const videoId = youtubeUrl ? extractYouTubeId(youtubeUrl) : null;

  return (
    <div className="artifact-card music-card">
      <div className="artifact-type">Music</div>
      <h3 className="artifact-title">{title}</h3>
      <p className="artifact-artist">{artist}</p>
      {videoId && (
        <div className="youtube-embed">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title={`${title} — ${artist}`}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
      <div className="music-links">
        {youtubeUrl ? (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="music-link"
          >
            Open on YouTube
          </a>
        ) : (
          <span className="no-link">Recording unavailable</span>
        )}
      </div>
    </div>
  );
}

export default MusicCard;
