import { useState, useEffect } from 'react';
import { ToneId, ToneDefinition, getTones, setDefaultTone } from '../api/client';
import ToneSelector from '../components/ToneSelector';

interface PreferencesViewProps {
  onBack: () => void;
}

function PreferencesView({ onBack }: PreferencesViewProps) {
  const [tones, setTones] = useState<ToneDefinition[]>([]);
  const [currentTone, setCurrentTone] = useState<ToneId>('guided');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadTones() {
      try {
        const response = await getTones();
        setTones(response.tones);
        setCurrentTone(response.default);
      } catch (err) {
        console.error('Failed to load tones:', err);
        setError('Failed to load preferences');
      } finally {
        setLoading(false);
      }
    }
    loadTones();
  }, []);

  const handleToneSelect = async (tone: ToneId) => {
    if (tone === currentTone) return;

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      await setDefaultTone(tone);
      setCurrentTone(tone);
      setSaveSuccess(true);
      // Clear success message after a moment
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to save tone:', err);
      setError('Failed to save your preference');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="preferences-view">
        <p className="loading">Loading</p>
      </div>
    );
  }

  return (
    <div className="preferences-view">
      <button className="back-button" onClick={onBack}>
        &larr; Back
      </button>

      <h1>Preferences</h1>

      <section className="preferences-section">
        <h2>Guide Voice</h2>
        <p className="preferences-description">
          Choose how your guide engages with you. This affects the tone of daily
          framings and conversations. Changes apply to new conversations.
        </p>

        {error && <p className="error-message">{error}</p>}
        {saveSuccess && <p className="success-message">Preference saved</p>}

        <ToneSelector
          tones={tones}
          currentTone={currentTone}
          onSelect={handleToneSelect}
          disabled={saving}
        />
      </section>
    </div>
  );
}

export default PreferencesView;
