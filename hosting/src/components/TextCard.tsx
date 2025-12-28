interface TextCardProps {
  content: string;
  source: string;
  author: string;
}

function TextCard({ content, source, author }: TextCardProps) {
  return (
    <div className="artifact-card text-card">
      <div className="artifact-type">Text</div>
      <blockquote className="quote-content">{content}</blockquote>
      <p className="quote-attribution">
        &mdash; {author}, <cite>{source}</cite>
      </p>
    </div>
  );
}

export default TextCard;
