import { useNavigate } from 'react-router-dom';

interface AboutViewProps {
  isFirstTime?: boolean;
  onGetStarted?: () => void;
}

function AboutView({ isFirstTime = false, onGetStarted }: AboutViewProps) {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (onGetStarted) {
      onGetStarted();
    }
    navigate('/');
  };

  return (
    <div className="about-view">
      <h1>Welcome to Primer</h1>

      <section className="about-section">
        <h2>What is this?</h2>
        <p>
          Primer delivers one thoughtful intellectual encounter each day.
          Rather than overwhelming you with content, it offers a single, curated
          moment of engagement with ideas, art, and music.
        </p>
        <p>
          Think of it as a daily invitation to pause, reflect, and explore something
          meaningful—without the pressure of tests, grades, or streaks.
        </p>
      </section>

      <section className="about-section">
        <h2>How it works</h2>

        <div className="about-subsection">
          <h3>Arcs</h3>
          <p>
            Your experience is organized into "arcs"—roughly week-long thematic
            journeys that explore a single idea, question, or theme from multiple
            angles. Each arc builds on itself, creating a coherent intellectual
            experience rather than disconnected daily snippets.
          </p>
        </div>

        <div className="about-subsection">
          <h3>Daily Encounters</h3>
          <p>
            Each day within an arc presents four carefully chosen artifacts that
            work together:
          </p>
          <ul>
            <li><strong>Music</strong> — A piece to listen to, chosen for its connection to the day's theme</li>
            <li><strong>Image</strong> — A work of visual art to contemplate</li>
            <li><strong>Text</strong> — A quote, poem, or literary excerpt to consider</li>
            <li><strong>Framing</strong> — A brief introduction that ties everything together and connects to previous days</li>
          </ul>
        </div>

        <div className="about-subsection">
          <h3>Conversation</h3>
          <p>
            After exploring the day's artifacts, you're invited to engage in
            conversation. This isn't a quiz or a lecture—it's a dialogue with a
            curious companion who can help you think through what you've encountered,
            make connections, and explore your own responses.
          </p>
        </div>
      </section>

      <section className="about-section">
        <h2>The Philosophy</h2>
        <p>
          Primer is built on the idea of <em>formation over education</em>.
          It's not about accumulating facts or completing courses. It's about
          developing the habit of thoughtful engagement with ideas—one day at a time.
        </p>
        <p>
          There's no rush. Skip a day if you need to—the arc will wait for you.
          The goal is depth, not speed; reflection, not consumption.
        </p>
      </section>

      <section className="about-section">
        <h2>Getting Around</h2>
        <ul>
          <li><strong>Today</strong> — Your current day's encounter</li>
          <li><strong>Arc</strong> — Information about your current thematic journey</li>
          <li><strong>History</strong> — Review past encounters and conversations</li>
        </ul>
      </section>

      {isFirstTime && (
        <section className="about-cta">
          <button className="get-started-button" onClick={handleGetStarted}>
            Let's begin your first arc
          </button>
        </section>
      )}
    </div>
  );
}

export default AboutView;
