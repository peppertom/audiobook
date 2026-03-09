interface Props {
  paragraphs: string[];
  pageHeight: number;
  maxWidth: number;
}

export default function PageView({ paragraphs, pageHeight, maxWidth }: Props) {
  return (
    <div
      style={{
        height: `${pageHeight}px`,
        overflow: "hidden",
      }}
      className="w-full"
    >
      <div
        style={{
          maxWidth: `${maxWidth}px`,
          fontFamily: "var(--reading-font, Georgia, serif)",
          fontSize: "var(--reading-size, 18px)",
          lineHeight: "var(--reading-line-height, 1.7)",
          wordSpacing: "var(--reading-word-spacing, 0em)",
          letterSpacing: "var(--reading-letter-spacing, 0em)",
        }}
        className="mx-auto px-6 py-8"
      >
        {paragraphs.map((para, i) => (
          <p key={i} className="mb-[1.2em]">
            {para}
          </p>
        ))}
      </div>
    </div>
  );
}
