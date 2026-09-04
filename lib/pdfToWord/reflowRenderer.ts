import { BorderStyle, HeightRule, HeadingLevel, ImageRun, Paragraph, Table, TableCell, TableLayoutType, TableRow, TabStopType, TextRun, VerticalAlign, WidthType } from "docx";
import { compatibleWordFont, splitTextByScript, wordFontSlots, wordLanguageForText } from "./unicode";
import { classifyDocumentRegions, LayoutLine, StructuredRegion, VisualRow } from "./layoutAnalyzer";

type ReflowItem = {
  text: string;
  x?: number;
  width?: number;
  fontSize: number;
  fontFamily: string;
  sourceFontFamily?: string;
  sourceIsSystemFont?: boolean;
  fontName?: string;
  bold: boolean;
  italic: boolean;
};

type ReflowLine = { items: ReflowItem[]; x: number; top: number; width: number; height: number; centered: boolean; color: string };
type ReflowImage = { data: Uint8Array; x?: number; width: number; height: number; top: number; background?: boolean };
type ReflowShape = { kind: "rectangle" | "line" | "path"; x: number; top: number; width: number; height: number; strokeWidth: number; strokeColor?: string; fillColor?: string };

export type ReliableTable = { x: number; top: number; xs: number[]; ys: number[]; color: string; strokeWidth: number };

function textRuns(item: ReflowItem, color: string) {
  return splitTextByScript(item.text).map((segment) => {
    const font = compatibleWordFont(item.sourceFontFamily ?? item.fontFamily, item.fontName ?? item.fontFamily, segment.text, item.sourceIsSystemFont ?? true);
    return new TextRun({
      text: segment.text,
      font: wordFontSlots(font, segment.text),
      size: Math.max(2, Math.round(item.fontSize * 2)),
      sizeComplexScript: Math.max(2, Math.round(item.fontSize * 2)),
      bold: item.bold,
      boldComplexScript: item.bold,
      italics: item.italic,
      italicsComplexScript: item.italic,
      color,
      language: { value: wordLanguageForText(segment.text), eastAsia: wordLanguageForText(segment.text), bidirectional: wordLanguageForText(segment.text) },
      noProof: true,
    });
  });
}

function uniqueCoordinates(values: number[], tolerance = 2) {
  return values.sort((a, b) => a - b).filter((value, index, sorted) => index === 0 || value - sorted[index - 1] > tolerance);
}

function tableEdges(shapes: ReflowShape[]): ReflowShape[] {
  return shapes.flatMap<ReflowShape>((shape) => {
    const color = shape.strokeColor ?? shape.fillColor;
    if (!color) return [];
    if (shape.kind === "line") return [{ ...shape, strokeColor: color }];
    if (shape.kind === "rectangle" && !shape.strokeColor && shape.fillColor) {
      if (shape.width >= 20 && shape.height <= 2.5) return [{ ...shape, kind: "line" as const, height: 0, strokeColor: color, strokeWidth: Math.max(shape.strokeWidth, shape.height) }];
      if (shape.height >= 10 && shape.width <= 2.5) return [{ ...shape, kind: "line" as const, width: 0, strokeColor: color, strokeWidth: Math.max(shape.strokeWidth, shape.width) }];
    }
    if (shape.kind !== "rectangle" || shape.width < 20 || shape.height < 10) return [];
    if (!shape.strokeColor) return [];
    return [
      { ...shape, kind: "line" as const, height: 0, strokeColor: color },
      { ...shape, kind: "line" as const, top: shape.top + shape.height, height: 0, strokeColor: color },
      { ...shape, kind: "line" as const, width: 0, strokeColor: color },
      { ...shape, kind: "line" as const, x: shape.x + shape.width, width: 0, strokeColor: color },
    ];
  });
}

function spansCoordinate(start: number, length: number, coordinate: number, tolerance = 2.5) {
  return start <= coordinate + tolerance && start + length >= coordinate - tolerance;
}

function mergeCollinearEdges(edges: ReflowShape[], orientation: "horizontal" | "vertical") {
  const merged: ReflowShape[] = [];
  const pending = [...edges].sort((left, right) => {
    const leftAxis = orientation === "horizontal" ? left.top : left.x;
    const rightAxis = orientation === "horizontal" ? right.top : right.x;
    if (Math.abs(leftAxis - rightAxis) > 2) return leftAxis - rightAxis;
    return orientation === "horizontal" ? left.x - right.x : left.top - right.top;
  });
  for (const edge of pending) {
    const axis = orientation === "horizontal" ? edge.top : edge.x;
    const start = orientation === "horizontal" ? edge.x : edge.top;
    const length = orientation === "horizontal" ? edge.width : edge.height;
    const previous = merged.at(-1);
    const previousAxis = previous ? orientation === "horizontal" ? previous.top : previous.x : Number.NaN;
    const previousStart = previous ? orientation === "horizontal" ? previous.x : previous.top : 0;
    const previousLength = previous ? orientation === "horizontal" ? previous.width : previous.height : 0;
    if (previous && previous.strokeColor === edge.strokeColor && Math.abs(previousAxis - axis) <= 2.5
      && start <= previousStart + previousLength + 3) {
      const end = Math.max(previousStart + previousLength, start + length);
      if (orientation === "horizontal") previous.width = end - previousStart;
      else previous.height = end - previousStart;
      previous.strokeWidth = Math.max(previous.strokeWidth, edge.strokeWidth);
    } else merged.push({ ...edge });
  }
  return merged;
}

export function detectReliableTables(lines: ReflowLine[], shapes: ReflowShape[]): ReliableTable[] {
  const edges = tableEdges(shapes);
  const horizontal = mergeCollinearEdges(edges.filter((shape) => shape.width >= 30 && shape.height <= 2.5), "horizontal");
  const vertical = mergeCollinearEdges(edges.filter((shape) => shape.height >= 18 && shape.width <= 2.5), "vertical");
  const candidates: ReliableTable[] = [];
  for (const color of [...new Set(horizontal.map((shape) => shape.strokeColor!))]) {
    const sameHorizontal = horizontal.filter((shape) => shape.strokeColor === color);
    const sameVertical = vertical.filter((shape) => shape.strokeColor === color);
    for (const seed of sameHorizontal) {
      const crossingVerticals = sameVertical.filter((shape) => spansCoordinate(seed.x, seed.width, shape.x)
        && spansCoordinate(shape.top, shape.height, seed.top));
      if (crossingVerticals.length < 2) continue;
      const provisionalXs = uniqueCoordinates(crossingVerticals.map((shape) => shape.x));
      const minX = provisionalXs[0];
      const maxX = provisionalXs.at(-1)!;
      const crossingHorizontals = sameHorizontal.filter((shape) => shape.x <= minX + 2.5 && shape.x + shape.width >= maxX - 2.5
        && crossingVerticals.some((verticalLine) => spansCoordinate(verticalLine.top, verticalLine.height, shape.top)));
      const ys = uniqueCoordinates(crossingHorizontals.map((shape) => shape.top));
      if (provisionalXs.length < 2 || ys.length < 2) continue;
      const minY = ys[0];
      const maxY = ys.at(-1)!;
      const xs = uniqueCoordinates(sameVertical
        .filter((shape) => shape.x >= minX - 2.5 && shape.x <= maxX + 2.5 && shape.top <= minY + 2.5 && shape.top + shape.height >= maxY - 2.5)
        .map((shape) => shape.x));
      if (xs.length < 2) continue;
      const cellCount = (xs.length - 1) * (ys.length - 1);
      if (cellCount < 2) continue;
      const populatedCells = lines.filter((line) => {
        const centerX = line.x + line.width / 2;
        const centerY = line.top + line.height / 2;
        return centerX > xs[0] && centerX < xs.at(-1)! && centerY > minY && centerY < maxY;
      }).length;
      // A complete geometric grid is still a reliable table when its text had
      // to be withheld because the PDF's character mapping was unsafe. Keeping
      // the editable cell geometry over the visual fallback preserves both
      // fidelity and useful structure without inventing cell text.
      if (populatedCells < Math.min(2, cellCount) && cellCount < 4) continue;
      const relevant = [...crossingHorizontals, ...crossingVerticals];
      candidates.push({ x: xs[0], top: minY, xs, ys, color, strokeWidth: relevant.reduce((sum, shape) => sum + shape.strokeWidth, 0) / relevant.length });
    }
  }
  return candidates
    .sort((a, b) => (b.xs.at(-1)! - b.x) * (b.ys.at(-1)! - b.top) - (a.xs.at(-1)! - a.x) * (a.ys.at(-1)! - a.top))
    .filter((candidate, index, selected) => !selected.slice(0, index).some((table) => Math.abs(table.x - candidate.x) <= 3
      && Math.abs(table.top - candidate.top) <= 3
      && Math.abs(table.xs.at(-1)! - candidate.xs.at(-1)!) <= 3
      && Math.abs(table.ys.at(-1)! - candidate.ys.at(-1)!) <= 3))
    .sort((a, b) => a.top - b.top || a.x - b.x);
}

function createEditableTable(table: ReliableTable, lines: ReflowLine[], leftBoundary = table.x) {
  const border = { style: BorderStyle.SINGLE, color: table.color, size: Math.max(1, Math.round(table.strokeWidth * 8)) };
  const columnWidths = table.xs.slice(1).map((x, index) => Math.max(1, Math.round((x - table.xs[index]) * 20)));
  return new Table({
    width: { size: columnWidths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
    indent: { size: Math.max(0, Math.round((table.x - leftBoundary) * 20)), type: WidthType.DXA },
    columnWidths,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: table.ys.slice(1).map((bottom, rowIndex) => new TableRow({
      height: { value: Math.max(1, Math.round((bottom - table.ys[rowIndex]) * 20)), rule: HeightRule.EXACT },
      children: table.xs.slice(1).map((right, columnIndex) => {
        const left = table.xs[columnIndex];
        const top = table.ys[rowIndex];
        const cellLines = lines.filter((line) => {
          const centerX = line.x + line.width / 2;
          const centerY = line.top + line.height / 2;
          return centerX > left && centerX < right && centerY > top && centerY < bottom;
        }).sort((a, b) => a.top - b.top || a.x - b.x);
        return new TableCell({
          width: { size: columnWidths[columnIndex], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 0, right: 40, bottom: 0, left: 40 },
          children: cellLines.length ? cellLines.map((line) => new Paragraph({
            alignment: line.centered ? "center" : "left",
            spacing: { before: 0, after: 0, line: Math.max(1, Math.round(line.height * 20)), lineRule: "exact" },
            children: line.items.flatMap((item) => textRuns(item, line.color)),
          })) : [new Paragraph({ spacing: { before: 0, after: 0 } })],
        });
      }),
    })),
  });
}

const noBorder = { style: BorderStyle.NONE, color: "FFFFFF", size: 0 };

function itemWithText(row: VisualRow, text: string, fallbackIndex = 0): ReflowItem {
  const source = row.items[Math.min(fallbackIndex, Math.max(0, row.items.length - 1))] as ReflowItem | undefined;
  return {
    text,
    fontSize: source?.fontSize ?? 11,
    fontFamily: source?.fontFamily ?? "Arial",
    sourceFontFamily: source?.sourceFontFamily,
    sourceIsSystemFont: source?.sourceIsSystemFont,
    fontName: source?.fontName,
    bold: source?.bold ?? false,
    italic: source?.italic ?? false,
  };
}

function compactParagraph(row: VisualRow, text: string, color = "000000", alignment: "left" | "center" | "right" = "left") {
  return new Paragraph({
    alignment,
    spacing: { before: 0, after: 0, line: Math.max(200, Math.round(row.height * 20)), lineRule: "atLeast" },
    children: textRuns(itemWithText(row, text), color),
  });
}

function createLabelValueTable(region: StructuredRegion, leftBoundary: number, pageRight: number) {
  const labelX = Math.min(...region.rows.map((row) => row.x));
  const colonXs = region.rows.map((row) => row.colonX).filter((value): value is number => value !== undefined).sort((a, b) => a - b);
  const colonX = colonXs[Math.floor(colonXs.length / 2)] ?? labelX + 90;
  const right = Math.max(...region.rows.map((row) => row.right));
  const estimatedLabelPoints = Math.max(...region.rows.map((row) => {
    const glyphCount = [...(row.label ?? "")].filter((character) => !/\p{Mark}/u.test(character)).length;
    const fontSize = Math.max(...row.items.map((item) => item.fontSize), 10);
    return glyphCount * fontSize * 0.6 + 12;
  }));
  const labelWidth = Math.max(720, Math.round((colonX - labelX - 3) * 20), Math.round(estimatedLabelPoints * 20));
  const colonWidth = 180;
  // Keep the measured relationship for the first two columns, but let the value
  // cell use the remaining page width. Metric differences between PDF and Word
  // fonts must not wrap a source value that fitted on one source row.
  const valueWidth = Math.max(1440, Math.round((Math.max(right, pageRight) - colonX - 7) * 20));
  const columnWidths = [labelWidth, colonWidth, valueWidth];
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: columnWidths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
    indent: { size: Math.max(0, Math.round((labelX - leftBoundary) * 20)), type: WidthType.DXA },
    columnWidths,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: region.rows.map((row, index) => {
      const nextTop = region.rows[index + 1]?.top;
      const rowHeight = Math.max(row.height, nextTop === undefined ? row.height : nextTop - row.top);
      return new TableRow({
        height: { value: Math.max(180, Math.round(rowHeight * 20)), rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: [row.label ?? "", ":", row.value ?? ""].map((text, cellIndex) => new TableCell({
          width: { size: columnWidths[cellIndex], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 0, right: cellIndex === 0 ? 40 : 0, bottom: 0, left: cellIndex === 2 ? 40 : 0 },
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
          children: [compactParagraph(row, text, row.lines[0]?.color ?? "000000")],
        })),
      });
    }),
  });
}

function createSectionHeadingTable(region: StructuredRegion, shapes: ReflowShape[], leftBoundary: number, pageRight: number) {
  const row = region.rows[0];
  const related = (region.relatedShapeIndexes ?? []).map((index) => shapes[index]).filter(Boolean);
  const frame = related.find((shape) => shape.kind === "rectangle") ?? related[0];
  const left = related.length ? Math.min(...related.map((shape) => shape.x)) : frame?.x ?? row.x;
  const right = related.length ? Math.max(...related.map((shape) => shape.x + shape.width)) : frame ? frame.x + frame.width : pageRight;
  const top = related.length ? Math.min(...related.map((shape) => shape.top)) : row.top;
  const bottom = related.length ? Math.max(...related.map((shape) => shape.top + shape.height)) : row.bottom;
  const color = frame?.strokeColor ?? frame?.fillColor ?? row.lines[0]?.color ?? "000000";
  const border = { style: BorderStyle.SINGLE, color, size: Math.max(2, Math.round((frame?.strokeWidth ?? 0.75) * 8)) };
  const width = Math.max(720, Math.round((right - left) * 20));
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: width, type: WidthType.DXA },
    indent: { size: Math.max(0, Math.round((left - leftBoundary) * 20)), type: WidthType.DXA },
    columnWidths: [width],
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({
      height: { value: Math.max(240, Math.round(Math.max(row.height, bottom - top) * 20)), rule: HeightRule.ATLEAST },
      cantSplit: true,
      children: [new TableCell({
        width: { size: width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 0, right: 80, bottom: 0, left: 100 },
        borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
        children: [compactParagraph(row, row.text, row.lines[0]?.color ?? "000000", row.centered ? "center" : "left")],
      })],
    })],
  });
}

function createVisualRowParagraph(row: VisualRow, leftBoundary: number, fixedLayout: boolean) {
  const children: TextRun[] = [];
  const positionedItems = row.lines.flatMap((line, lineIndex) => line.items.map((item) => ({ item: item as ReflowItem, line, lineIndex })))
    .sort((a, b) => (a.item.x ?? a.line.x) - (b.item.x ?? b.line.x));
  const tabs: number[] = [];
  positionedItems.forEach((entry, index) => {
    const x = entry.item.x ?? entry.line.x;
    const previous = positionedItems[index - 1];
    if (previous) {
      const previousX = previous.item.x ?? previous.line.x;
      const glyphs = [...previous.item.text].filter((character) => !/\p{Mark}/u.test(character));
      const estimatedTextWidth = glyphs.reduce((sum, character) => sum + previous.item.fontSize * (/\s/u.test(character) ? 0.32 : 0.56), 0);
      const sourceAdvance = x - previousX;
      const positionalGap = sourceAdvance - estimatedTextWidth;
      const separateColumn = entry.lineIndex !== previous.lineIndex || positionalGap > Math.max(9, previous.item.fontSize * 1.1);
      if (separateColumn) {
        children.push(new TextRun("\t"));
        tabs.push(Math.max(0, Math.round((x - leftBoundary) * 20)));
      }
    }
    children.push(...textRuns(entry.item, entry.line.color));
  });
  const tabStops = tabs.map((position) => ({ type: TabStopType.LEFT, position }));
  return new Paragraph({
    alignment: row.centered ? "center" : "left",
    indent: fixedLayout && !row.centered ? { left: Math.max(0, Math.round((row.x - leftBoundary) * 20)) } : undefined,
    tabStops: tabStops.length ? tabStops : undefined,
    spacing: fixedLayout
      ? { before: 0, after: 0, line: Math.max(200, Math.round(row.height * 20)), lineRule: "atLeast" }
      : { before: 0, after: 60, line: 276, lineRule: "auto" },
    children,
  });
}

function createMultiColumnTable(region: StructuredRegion, leftBoundary: number) {
  const lines = region.rows.flatMap((row) => row.lines);
  const itemAnchors = region.rows.flatMap((row) => row.items.map((item) => item.x).filter((x): x is number => x !== undefined));
  const anchors = [...lines.map((line) => line.x), ...itemAnchors].sort((a, b) => a - b).filter((value, index, sorted) => index === 0 || value - sorted[index - 1] > 24);
  const left = anchors[0] ?? region.x;
  const split = anchors.find((anchor) => anchor - left > Math.max(90, (region.right - left) * 0.25)) ?? left + (region.right - left) / 2;
  const totalWidth = Math.max(1440, Math.round((region.right - left) * 20));
  const firstWidth = Math.max(1440, Math.round((split - left) * 20));
  const columnWidths = [firstWidth, Math.max(1440, totalWidth - firstWidth)];
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: columnWidths[0] + columnWidths[1], type: WidthType.DXA },
    indent: { size: Math.max(0, Math.round((left - leftBoundary) * 20)), type: WidthType.DXA },
    columnWidths,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: region.rows.map((row, index) => {
      const byColumn = [0, 1].map((columnIndex) => row.lines.flatMap((line) => {
        const items = line.items.filter((item) => {
          const x = item.x ?? line.x;
          return columnIndex === 0 ? x < split : x >= split;
        });
        if (!items.length) return [];
        const x = Math.min(...items.map((item) => item.x ?? line.x));
        const right = Math.max(...items.map((item) => (item.x ?? line.x) + (item.width ?? 0)));
        return [{ ...line, items, x, width: Math.max(0, right - x) }];
      }));
      const nextTop = region.rows[index + 1]?.top;
      return new TableRow({
        height: { value: Math.max(200, Math.round((nextTop === undefined ? row.height : nextTop - row.top) * 20)), rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: byColumn.map((columnLines, columnIndex) => new TableCell({
          width: { size: columnWidths[columnIndex], type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 0, right: 80, bottom: 0, left: 0 },
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
          children: columnLines.length ? [createVisualRowParagraph({
            ...row,
            lines: columnLines,
            items: columnLines.flatMap((line) => line.items),
            text: columnLines.map((line) => line.items.map((item) => item.text).join("")).join(""),
            x: Math.min(...columnLines.map((line) => line.x)),
            right: Math.max(...columnLines.map((line) => line.x + line.width)),
          }, columnIndex === 0 ? left : split, true)] : [new Paragraph({ spacing: { before: 0, after: 0 } })],
        })),
      });
    }),
  });
}

function isHeading(line: ReflowLine, medianSize: number) {
  const text = line.items.map((item) => item.text).join("").trim();
  const size = Math.max(...line.items.map((item) => item.fontSize));
  const bold = line.items.some((item) => item.bold);
  return text.length <= 120 && (size >= medianSize * 1.3 || bold && (/^[A-Z\d .&/-]+$/.test(text) || text.length < 45));
}

type StructuredPage = {
  width?: number;
  height?: number;
  lines: ReflowLine[];
  tableLayoutLines?: ReflowLine[];
  images: ReflowImage[];
  shapes: ReflowShape[];
};

function lineInsideTable(line: ReflowLine, table: ReliableTable) {
  const centerX = line.x + line.width / 2;
  const centerY = line.top + line.height / 2;
  return centerX > table.x && centerX < table.xs.at(-1)! && centerY > table.top && centerY < table.ys.at(-1)!;
}

export function createStructuredPageContent(page: StructuredPage, options: { fixedLayout?: boolean; left?: number; top?: number } = {}) {
    const fixedLayout = Boolean(options.fixedLayout);
    const leftBoundary = options.left ?? Math.min(...page.lines.map((line) => line.x), 36);
    const topBoundary = options.top ?? Math.min(...page.lines.map((line) => line.top), 36);
    const blocks: Array<{ top: number; bottom: number; content: Paragraph | Table }> = [];
    const tables = detectReliableTables(page.tableLayoutLines ?? page.lines, page.shapes);
    tables.forEach((table) => blocks.push({ top: table.top, bottom: table.ys.at(-1)!, content: createEditableTable(table, page.lines, leftBoundary) }));
    const flowingLines = page.lines.filter((line) => !tables.some((table) => lineInsideTable(line, table)));
    const pageWidth = page.width ?? Math.max(...[...page.lines.map((line) => line.x + line.width), ...page.shapes.map((shape) => shape.x + shape.width), 612]);
    const pageHeight = page.height ?? Math.max(...[...page.lines.map((line) => line.top + line.height), ...page.shapes.map((shape) => shape.top + shape.height), 792]);
    const analysis = classifyDocumentRegions({
      lines: flowingLines as LayoutLine[], shapes: page.shapes, images: page.images,
      pageWidth,
      pageHeight,
      tables: tables.map((table) => ({ x: table.x, top: table.top, right: table.xs.at(-1)!, bottom: table.ys.at(-1)! })),
    });
    const textRegions = analysis.regions.filter((region) => region.rows.length && region.kind !== "table");
    for (const region of textRegions) {
      if (fixedLayout && (region.kind === "label-value-rows" || region.kind === "form-fields")) {
        blocks.push({ top: region.top, bottom: region.bottom, content: createLabelValueTable(region, leftBoundary, pageWidth) });
        continue;
      }
      if (fixedLayout && region.kind === "section-heading" && (region.relatedShapeIndexes?.length ?? 0) > 0) {
        blocks.push({ top: region.top, bottom: region.bottom, content: createSectionHeadingTable(region, page.shapes, leftBoundary, Math.max(pageWidth, region.right)) });
        continue;
      }
      if (fixedLayout && region.kind === "multi-column") {
        blocks.push({ top: region.top, bottom: region.bottom, content: createMultiColumnTable(region, leftBoundary) });
        continue;
      }
      for (const row of region.rows) {
        const text = row.text.trim();
        if (!text) continue;
        const heading = !fixedLayout && row.lines.some((line) => isHeading(line, analysis.medianFontSize));
        const bullet = !fixedLayout && /^[•●▪-]\s+/.test(text);
        const paragraph = createVisualRowParagraph(row, leftBoundary, fixedLayout);
        if (heading || bullet) {
          blocks.push({ top: row.top, bottom: row.bottom, content: new Paragraph({
            heading: heading ? HeadingLevel.HEADING_1 : undefined,
            bullet: bullet ? { level: 0 } : undefined,
            alignment: row.centered ? "center" : "left",
            spacing: { before: heading ? 120 : 0, after: heading ? 80 : 60, line: 276, lineRule: "auto" },
            children: row.lines.flatMap((line) => line.items.flatMap((item) => textRuns(item, line.color))),
          }) });
        } else blocks.push({ top: row.top, bottom: row.bottom, content: paragraph });
      }
    }
    if (!fixedLayout) page.images.forEach((image, index) => {
      const scale = Math.min(1, 560 / (image.width * 96 / 72), 740 / (image.height * 96 / 72));
      blocks.push({ top: image.top, bottom: image.top + image.height, content: new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [new ImageRun({
          type: "png",
          data: image.data,
          transformation: { width: image.width * 96 / 72 * scale, height: image.height * 96 / 72 * scale },
          altText: { title: `PDF image ${index + 1}`, description: "Image extracted from the source PDF", name: `PDF image ${index + 1}` },
        })],
      }) });
    });
    blocks.sort((a, b) => a.top - b.top);
    if (!fixedLayout) return blocks.map((block) => block.content);

    const children: Array<Paragraph | Table> = [];
    let cursor = topBoundary;
    for (const block of blocks) {
      const verticalGap = Math.max(0, block.top - cursor);
      if (verticalGap > 1.5) children.push(new Paragraph({ spacing: { before: 0, after: Math.round(verticalGap * 20), line: 1, lineRule: "exact" } }));
      children.push(block.content);
      cursor = Math.max(cursor, block.bottom);
    }
    return children;
}

export function createReflowContent(pages: StructuredPage[]) {
  const children: Array<Paragraph | Table> = [];
  for (const page of pages) {
    children.push(...createStructuredPageContent(page));
  }
  return children;
}
