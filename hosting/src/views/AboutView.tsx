interface AboutViewProps {
  isFirstTime?: boolean;
  onGetStarted?: () => void;
}

function AboutView({ isFirstTime = false, onGetStarted }: AboutViewProps) {
  const handleGetStarted = () => {
    if (onGetStarted) {
      onGetStarted();
    }
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
            This is where the magic happens. After exploring the day's artifacts,
            you're invited to engage in conversation—and this is really why we
            built Primer.
          </p>
          <p>
            It's not a quiz or a lecture. It's a dialogue with a curious companion
            who can help you think through what you've encountered, make unexpected
            connections, and discover what these ideas mean to you. The artifacts
            are just the starting point; the conversation is where real insight
            emerges.
          </p>
          <p>
            We hope you'll take a few minutes each day to share your thoughts,
            questions, and reactions. That's where Primer comes alive.
          </p>
        </div>

        <div className="about-subsection">
          <h3>Your Guide</h3>
          <p>
            You can choose how your guide communicates with you. Some prefer a
            Socratic approach full of questions; others want direct, no-nonsense
            responses. The five voices available are:
          </p>
          <ul>
            <li><strong>The Tutor</strong> — Balanced explanation with gentle questions (default)</li>
            <li><strong>The Listener</strong> — Reflective and emotionally attuned, creating space for you to process</li>
            <li><strong>The Questioner</strong> — Socratic method, drawing out your own thinking through inquiry</li>
            <li><strong>The Craft Mentor</strong> — Practical and concrete, focused on how ideas apply</li>
            <li><strong>The Editor</strong> — Direct and efficient, no hand-holding</li>
          </ul>
          <p>
            You can change your guide anytime in Preferences, or even switch
            mid-conversation if the mood strikes.
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
