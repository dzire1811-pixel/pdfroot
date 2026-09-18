import type { EditObject, ImageAsset } from "@/lib/editPdf/model";
import { fontKey, textLines, type EditorFonts } from "@/lib/editPdf/text";

export function ObjectGraphic({ object: o, assets, fonts }: { object: EditObject; assets: Map<string, ImageAsset>; fonts: EditorFonts }) {
  const stroke = { stroke: o.color, strokeWidth: o.strokeWidth, strokeDasharray: o.dashed ? "6 4" : undefined, fill: "none" };
  let content;
  if (o.assetId) content = <image href={assets.get(o.assetId)?.data} width={o.width} height={o.height} preserveAspectRatio="none" />;
  else if (o.type === "text") {
    try {
      const lines = textLines(o, fonts[fontKey(o)]);
      content = <svg width={o.width} height={o.height} overflow="hidden"><g fontFamily={o.font === "Times" ? "Times New Roman, serif" : o.font === "Courier" ? "Courier New, monospace" : "Arial, Helvetica, sans-serif"} fontSize={o.fontSize} fontWeight={o.bold ? "bold" : "normal"} fontStyle={o.italic ? "italic" : "normal"} fill={o.color}>
        {lines.map((line, i) => <g key={i}><text x={line.x} y={line.baseline} textLength={line.width || undefined} lengthAdjust="spacingAndGlyphs" xmlSpace="preserve">{line.text}</text>{o.underline && <line x1={line.x} x2={line.x + line.width} y1={line.baseline + 2} y2={line.baseline + 2} stroke={o.color} strokeWidth={o.strokeWidth} />}</g>)}
      </g></svg>;
    } catch { content = <text x={4} y={18} fill="#b91c1c" fontSize={12}>Unsupported text — use Latin characters</text>; }
  } else if (o.type === "drawing") content = <polyline points={o.points?.map(([x, y]) => `${x * o.width},${y * o.height}`).join(" ")} {...stroke} />;
  else if (o.type === "shape" && ["line", "arrow"].includes(o.shape)) {
    const [start, end] = (o.points ?? [[0, 0], [1, 1]]).map(([x, y]) => [x * o.width, y * o.height]);
    const a = Math.atan2(end[1] - start[1], end[0] - start[0]), length = Math.min(15, Math.hypot(o.width, o.height) / 3);
    content = <g {...stroke}><line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} />{o.shape === "arrow" && [-.5, .5].map(offset => <line key={offset} x1={end[0]} y1={end[1]} x2={end[0] - length * Math.cos(a + offset)} y2={end[1] - length * Math.sin(a + offset)} />)}</g>;
  } else if (o.type === "shape" && o.shape === "circle") content = <ellipse cx={o.width / 2} cy={o.height / 2} rx={o.width / 2} ry={o.height / 2} {...stroke} fill={o.fill} />;
  else content = <rect width={o.width} height={o.height} {...(o.type === "shape" ? stroke : {})} fill={o.fill} />;
  return <g opacity={o.opacity}>{content}</g>;
}
