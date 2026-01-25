import { useEffect, useState, useCallback } from 'react';
import { getArc, Arc } from '../api/client';
import ErrorDisplay from '../components/ErrorDisplay';

function ArcView() {
  const [arc, setArc] = useState<Arc | null>(null);
  const [dayInArc, setDayInArc] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadArc = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getArc();
      setArc(response.arc);
      setDayInArc(response.dayInArc);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArc();
  }, [loadArc]);

  if (loading) {
    return <div className="loading">Loading arc</div>;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={loadArc} />;
  }

  if (!arc) {
    return (
      <div className="arc-view">
        <h1>No Active Arc</h1>
        <p>Create an arc in Firestore to begin.</p>
      </div>
    );
  }

  return (
    <div className="arc-view">
      <header className="arc-header">
        <h1>{arc.theme}</h1>
        <p className="arc-phase">Day {dayInArc} of {arc.targetDurationDays}</p>
      </header>

      {arc.description && (
        <p className="arc-description">{arc.description}</p>
      )}
    </div>
  );
}

export default ArcView;
