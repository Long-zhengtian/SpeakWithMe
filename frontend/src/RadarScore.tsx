import type { SessionScore } from "./types";

type RadarScoreProps = {
  score: SessionScore;
  testId?: string;
};

export function RadarScore({ score, testId }: RadarScoreProps) {
  const dims = score.dimensions;
  const caption = `评分 ${score.total}。${dims.map((item) => `${item.label_zh} ${item.score}`).join("，")}`;
  return (
    <svg className="radar" viewBox="0 0 120 120" role="img" aria-label={caption} data-testid={testId}>
      <title>{caption}</title>
      {[1, 0.5].map((scale) => (
        <polygon key={scale} className="radar-ring" points={ring(dims.length, scale)} />
      ))}
      {dims.map((item, index) => {
        const [x, y] = at(index, dims.length, 1);
        return <line key={item.id} className="radar-axis" x1="60" y1="60" x2={x} y2={y} />;
      })}
      <polygon className="radar-fill" points={dims.map((item, index) => at(index, dims.length, item.score / 100).join(",")).join(" ")} />
      {dims.map((item, index) => {
        const [x, y] = at(index, dims.length, 1.28);
        return (
          <text key={item.id} className="radar-label" x={x} y={y} textAnchor="middle" dominantBaseline="middle">
            {item.label_zh}
          </text>
        );
      })}
      <text className="radar-total" x="60" y="64" textAnchor="middle">
        {score.total}
      </text>
    </svg>
  );
}

function at(index: number, count: number, scale: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1);
  const radius = 34 * scale;
  return [60 + Math.cos(angle) * radius, 60 + Math.sin(angle) * radius];
}

function ring(count: number, scale: number) {
  return Array.from({ length: Math.max(count, 1) }, (_, index) => at(index, count, scale).join(",")).join(" ");
}
