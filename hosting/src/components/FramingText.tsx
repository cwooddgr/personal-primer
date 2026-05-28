import Markdown from 'react-markdown';

interface FramingTextProps {
  text: string;
}

function FramingText({ text }: FramingTextProps) {
  return (
    <section className="framing-text">
      <Markdown>{text}</Markdown>
    </section>
  );
}

export default FramingText;
