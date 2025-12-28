interface FramingTextProps {
  text: string;
}

function FramingText({ text }: FramingTextProps) {
  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  return (
    <section className="framing-text">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </section>
  );
}

export default FramingText;
