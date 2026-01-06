import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getHistory, DailyBundle } from '../api/client';

function HistoryView() {
  const [bundles, setBundles] = useState<DailyBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await getHistory(30);
        setBundles(response.bundles);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, []);

  if (loading) {
    return <div className="loading">Loading history...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (bundles.length === 0) {
    return (
      <div className="history-view">
        <h1>History</h1>
        <p className="empty-state">No past encounters yet.</p>
      </div>
    );
  }

  return (
    <div className="history-view">
      <h1>History</h1>

      <ul className="history-list">
        {bundles.map((bundle) => (
          <li key={bundle.id} className="history-item">
            <span className="history-date">{bundle.id}</span>
            <div className="history-summary">
              <p>
                <strong>Music:</strong> {bundle.music.title} by {bundle.music.artist}
              </p>
              <p>
                <strong>Image:</strong> {bundle.image.title}
                {bundle.image.artist && ` by ${bundle.image.artist}`}
              </p>
              <p>
                <strong>Text:</strong> {bundle.text.source} &mdash; {bundle.text.author}
              </p>
              <Link to={`/history/${bundle.id}/conversation`} className="conversation-link">
                View conversation &rarr;
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default HistoryView;
