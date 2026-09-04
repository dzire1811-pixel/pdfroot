export type StructuredRegionKind =
  | "normal-paragraph"
  | "label-value-rows"
  | "table"
  | "form-fields"
  | "header"
  | "section-heading"
  | "rules"
  | "image"
  | "multi-column"
  | "floating-object";

export type LayoutItem = {
  text: string;
  x?: number;
  width?: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fontFamily: string;
  sourceFontFamily?: string;
  sourceIsSystemFont?: boolean;
  fontName?: string;
};

export type LayoutLine = {
  items: LayoutItem[];
  x: number;
  top: number;
  width: number;
  height: number;
  centered: boolean;
  color: string;
};

export type LayoutShape = {
  kind: "rectangle" | "line" | "path";
  x: number;
  top: number;
  width: number;
  height: number;
  strokeWidth: number;
  strokeColor?: string;
  fillColor?: string;
};

export type LayoutImage = { x?: number; top: number; width: number; height: number; background?: boolean };
export type KnownTableBounds = { x: number; top: number; right: number; bottom: number };

export type VisualRow = {
  lines: LayoutLine[];
  items: LayoutItem[];
  text: string;
  x: number;
  top: number;
  right: number;
  bottom: number;
  height: number;
  centered: boolean;
  colonX?: number;
  label?: string;
  value?: string;
};

export type StructuredRegion = {
  kind: StructuredRegionKind;
  rows: VisualRow[];
  x: number;
  top: number;
  right: number;
  bottom: number;
  relatedShapeIndexes?: number[];
  relatedImageIndexes?: number[];
};

export type StructuredLayoutAnalysis = {
  rows: VisualRow[];
  regions: StructuredRegion[];
  medianFontSize: number;
};

function lineText(line: LayoutLine) {
  return line.items.map((item) => item.text.replace(/\s+/gu, " ")).join("");
}

function mergeVisualRows(lines: LayoutLine[]) {
  const rows: VisualRow[] = [];
  for (const line of [...lines].sort((a, b) => a.top - b.top || a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.top - line.top) <= Math.max(2, Math.min(candidate.height, line.height) * 0.32));
    if (row) row.lines.push(line);
    else rows.push({ lines: [line], items: [], text: "", x: line.x, top: line.top, right: line.x + line.width, bottom: line.top + line.height, height: line.height, centered: line.centered });
  }
  for (const row of rows) {
    row.lines.sort((a, b) => a.x - b.x);
    row.items = row.lines.flatMap((line) => line.items).sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    row.text = row.lines.map(lineText).join("").trim();
    row.x = Math.min(...row.lines.map((line) => line.x));
    row.top = Math.min(...row.lines.map((line) => line.top));
    row.right = Math.max(...row.lines.map((line) => line.x + line.width));
    row.bottom = Math.max(...row.lines.map((line) => line.top + line.height));
    row.height = row.bottom - row.top;
    row.centered = row.lines.length === 1 && row.lines[0].centered;
    const colonItem = row.items.find((item) => item.text.includes(":"));
    const separator = row.text.indexOf(":");
    if (separator >= 0) {
      const label = row.text.slice(0, separator).trim();
      const value = row.text.slice(separator + 1).trim();
      if (label.length >= 1 && label.length <= 48 && !/@|https?:\/\//i.test(label)) {
        row.label = label;
        row.value = value;
        const colonOffset = colonItem && colonItem.x !== undefined && colonItem.width !== undefined
          ? colonItem.x + colonItem.width * (colonItem.text.indexOf(":") / Math.max(1, colonItem.text.length))
          : undefined;
        row.colonX = colonOffset ?? row.lines[1]?.x ?? row.x + Math.min(row.right - row.x, Math.max(48, label.length * 5.5));
      }
    }
  }
  return rows.sort((a, b) => a.top - b.top || a.x - b.x);
}

function rowInsideTable(row: VisualRow, table: KnownTableBounds) {
  const centerX = (row.x + row.right) / 2;
  const centerY = (row.top + row.bottom) / 2;
  return centerX > table.x && centerX < table.right && centerY > table.top && centerY < table.bottom;
}

function headingFrame(row: VisualRow, shapes: LayoutShape[], pageWidth: number) {
  const rectangles = shapes.map((shape, index) => ({ shape, index })).filter(({ shape }) => {
    // Only claim a source border when it is one reliable rectangle. Composite
    // line/path frames remain source drawing objects; consuming only their
    // horizontal members produced duplicate black Word boxes plus stray sides.
    if (shape.kind !== "rectangle") return false;
    const encloses = shape.kind === "rectangle" && shape.x <= row.x + 6 && shape.x + shape.width >= row.right - 6
      && shape.top <= row.top + row.height / 2 && shape.top + shape.height >= row.top + row.height / 2;
    // A heading frame is local to the row. Page borders and large form panels
    // may enclose the same text, but substituting those for a native heading
    // table creates an unrelated box and consumes the wrong source object.
    const localHeight = shape.height <= Math.max(30, row.height * 2.75);
    return encloses && localHeight && shape.width >= Math.min(pageWidth * 0.35, row.right - row.x);
  }).map(({ index }) => index);
  if (rectangles.length) return rectangles;

  // PDF producers frequently encode a visible rectangle as four independent
  // strokes. Claim the frame only when all four sides form one coherent local
  // box; consuming a partial pair would leave stray sides in the DOCX.
  const centerY = row.top + row.height / 2;
  const horizontal = shapes.map((shape, index) => ({ shape, index })).filter(({ shape }) =>
    (shape.kind === "line" || shape.kind === "rectangle")
    && shape.width >= Math.min(pageWidth * 0.35, row.right - row.x)
    && shape.height <= 3
    && shape.x <= row.x + 8
    && shape.x + shape.width >= row.right - 8
    && Math.abs(shape.top - centerY) <= Math.max(24, row.height * 2.25));
  for (const top of horizontal) {
    for (const bottom of horizontal) {
      if (bottom.shape.top <= top.shape.top + Math.max(4, row.height * 0.45)) continue;
      if (bottom.shape.top - top.shape.top > Math.max(30, row.height * 2.75)) continue;
      if (top.shape.top > centerY + 2 || bottom.shape.top < centerY - 2) continue;
      const topRight = top.shape.x + top.shape.width;
      const bottomRight = bottom.shape.x + bottom.shape.width;
      if (Math.abs(top.shape.x - bottom.shape.x) > 4 || Math.abs(topRight - bottomRight) > 4) continue;
      const vertical = shapes.map((shape, index) => ({ shape, index })).filter(({ shape }) =>
        (shape.kind === "line" || shape.kind === "rectangle")
        && shape.width <= 3
        && shape.height >= bottom.shape.top - top.shape.top - 4
        && shape.top <= top.shape.top + 3
        && shape.top + shape.height >= bottom.shape.top - 3);
      const left = vertical.find(({ shape }) => Math.abs(shape.x - top.shape.x) <= 4);
      const right = vertical.find(({ shape }) => Math.abs(shape.x - topRight) <= 4);
      if (left && right) return [top.index, bottom.index, left.index, right.index];
    }
  }
  return [];
}

function region(kind: StructuredRegionKind, rows: VisualRow[], extra: Partial<StructuredRegion> = {}): StructuredRegion {
  return {
    kind,
    rows,
    x: rows.length ? Math.min(...rows.map((row) => row.x)) : Number(extra.x ?? 0),
    top: rows.length ? Math.min(...rows.map((row) => row.top)) : Number(extra.top ?? 0),
    right: rows.length ? Math.max(...rows.map((row) => row.right)) : Number(extra.right ?? 0),
    bottom: rows.length ? Math.max(...rows.map((row) => row.bottom)) : Number(extra.bottom ?? 0),
    ...extra,
  };
}

function isSectionHeading(row: VisualRow, medianSize: number, frameIndexes: number[]) {
  const upper = row.text.toLocaleUpperCase() === row.text && /\p{Letter}/u.test(row.text);
  const bold = row.items.some((item) => item.bold);
  const size = Math.max(...row.items.map((item) => item.fontSize), 0);
  return row.text.length <= 90 && bold && (frameIndexes.length > 0 || upper || size >= medianSize * 1.22);
}

function sharedLabelAnchor(rows: VisualRow[], index: number, pageWidth: number) {
  const row = rows[index];
  if (row.colonX === undefined) return false;
  const nearby = rows.slice(Math.max(0, index - 2), index + 3).filter((candidate) => candidate.colonX !== undefined);
  return nearby.filter((candidate) => Math.abs((candidate.colonX ?? 0) - row.colonX!) <= Math.max(4, pageWidth * 0.018)).length >= 2;
}

function isMultiColumnRow(row: VisualRow, pageWidth: number) {
  const itemFragments = row.items
    .filter((item) => item.x !== undefined && item.width !== undefined && item.text.trim())
    .sort((left, right) => left.x! - right.x!);
  if (row.lines.length < 2 && itemFragments.length < 2) return false;
  // A normal label/value row is often split into independently positioned
  // label, colon, and value lines. Keep that semantic relationship unless the
  // row contains multiple colon-bearing column labels (for example an
  // ADDRESS: / CONTACT: header row).
  const colonBearingItems = row.items.filter((item) => item.text.includes(":"));
  if (row.label !== undefined && colonBearingItems.length < 2) {
    // A label/value pair can share a baseline with an independent right-side
    // object (for example a form signature/caption). Treat it as columns only
    // when two right-side fragments are themselves separated by a column gap.
    const rightSideLines = row.lines.filter((line) => line.x > (row.colonX ?? row.x));
    const rightSideLineGaps = rightSideLines.slice(1).map((line, index) => line.x - (rightSideLines[index].x + rightSideLines[index].width));
    const rightSideItems = itemFragments.filter((item) => item.x! > (row.colonX ?? row.x));
    const rightSideItemGaps = rightSideItems.slice(1).map((item, index) => item.x! - (rightSideItems[index].x! + rightSideItems[index].width!));
    const distantRightFragment = [...rightSideLines.map((line) => line.x), ...rightSideItems.map((item) => item.x!)]
      .some((x) => x - (row.colonX ?? row.x) >= pageWidth * 0.3);
    if (![...rightSideLineGaps, ...rightSideItemGaps].some((gap) => gap >= pageWidth * 0.12) && !distantRightFragment) return false;
  }
  const gaps = row.lines.slice(1).map((line, index) => line.x - (row.lines[index].x + row.lines[index].width));
  const itemGaps = itemFragments.slice(1).map((item, index) => item.x! - (itemFragments[index].x! + itemFragments[index].width!));
  return [...gaps, ...itemGaps].some((gap) => gap >= pageWidth * 0.12);
}

export function classifyDocumentRegions(options: {
  lines: LayoutLine[];
  shapes: LayoutShape[];
  images: LayoutImage[];
  pageWidth: number;
  pageHeight: number;
  tables?: KnownTableBounds[];
}): StructuredLayoutAnalysis {
  const { lines, shapes, images, pageWidth, pageHeight } = options;
  const tables = options.tables ?? [];
  const rows = mergeVisualRows(lines);
  const sizes = rows.flatMap((row) => row.items.map((item) => item.fontSize)).sort((a, b) => a - b);
  const medianFontSize = sizes[Math.floor(sizes.length / 2)] ?? 11;
  const regions: StructuredRegion[] = [];
  let cursor = 0;
  while (cursor < rows.length) {
    const row = rows[cursor];
    const table = tables.find((candidate) => rowInsideTable(row, candidate));
    if (table) {
      const grouped = rows.filter((candidate) => rowInsideTable(candidate, table));
      regions.push(region("table", grouped, { x: table.x, top: table.top, right: table.right, bottom: table.bottom }));
      cursor += grouped.includes(row) ? 1 : 0;
      while (cursor < rows.length && grouped.includes(rows[cursor])) cursor += 1;
      continue;
    }
    const frameIndexes = headingFrame(row, shapes, pageWidth);
    // Preserve independently aligned columns before applying heading
    // heuristics. Bold ADDRESS / CONTACT-style labels on the same visual row
    // are a multi-column block, not one concatenated section heading.
    if (isMultiColumnRow(row, pageWidth)) {
      const grouped = [row];
      const anchors = row.lines.map((line) => line.x);
      let next = cursor + 1;
      while (next < rows.length) {
        const candidate = rows[next];
        const alignedToColumn = candidate.lines.every((line) => anchors.some((anchor) => Math.abs(anchor - line.x) <= pageWidth * 0.05));
        if (isSectionHeading(candidate, medianFontSize, headingFrame(candidate, shapes, pageWidth))
          || !alignedToColumn || candidate.top - grouped.at(-1)!.bottom > medianFontSize * 2) break;
        grouped.push(candidate);
        next += 1;
      }
      regions.push(region("multi-column", grouped));
      cursor = next;
      continue;
    }
    if (isSectionHeading(row, medianFontSize, frameIndexes)) {
      const framedShapes = frameIndexes.map((index) => shapes[index]).filter(Boolean);
      regions.push(region(row.centered && row.top < pageHeight * 0.18 ? "header" : "section-heading", [row], {
        relatedShapeIndexes: frameIndexes,
        ...(framedShapes.length ? {
          x: Math.min(...framedShapes.map((shape) => shape.x)),
          top: Math.min(...framedShapes.map((shape) => shape.top)),
          right: Math.max(...framedShapes.map((shape) => shape.x + shape.width)),
          bottom: Math.max(...framedShapes.map((shape) => shape.top + shape.height)),
        } : {}),
      }));
      cursor += 1;
      continue;
    }
    if (row.label !== undefined && sharedLabelAnchor(rows, cursor, pageWidth)) {
      const grouped: VisualRow[] = [row];
      let next = cursor + 1;
      while (next < rows.length) {
        const candidate = rows[next];
        const gap = candidate.top - grouped.at(-1)!.bottom;
        if (isMultiColumnRow(candidate, pageWidth)
          || candidate.label === undefined || candidate.colonX === undefined || row.colonX === undefined
          || Math.abs(candidate.colonX - row.colonX) > Math.max(4, pageWidth * 0.018)
          || gap > Math.max(12, medianFontSize * 1.5)) break;
        grouped.push(candidate);
        next += 1;
      }
      regions.push(region(grouped.some((candidate) => !candidate.value) ? "form-fields" : "label-value-rows", grouped));
      cursor = next;
      continue;
    }
    const paragraphRows = [row];
    let next = cursor + 1;
    while (next < rows.length) {
      const candidate = rows[next];
      const gap = candidate.top - paragraphRows.at(-1)!.bottom;
      if (candidate.label !== undefined || isMultiColumnRow(candidate, pageWidth)
        || isSectionHeading(candidate, medianFontSize, headingFrame(candidate, shapes, pageWidth))
        || gap > Math.max(8, medianFontSize * 0.9) || Math.abs(candidate.x - row.x) > pageWidth * 0.08) break;
      paragraphRows.push(candidate);
      next += 1;
    }
    regions.push(region("normal-paragraph", paragraphRows));
    cursor = next;
  }

  images.forEach((image, index) => regions.push(region(image.background ? "floating-object" : "image", [], {
    x: image.x ?? 0, top: image.top, right: (image.x ?? 0) + image.width, bottom: image.top + image.height, relatedImageIndexes: [index],
  })));
  shapes.forEach((shape, index) => {
    const used = regions.some((candidate) => candidate.relatedShapeIndexes?.includes(index));
    if (!used && (shape.kind === "line" || shape.kind === "rectangle" && (shape.height <= 3 || shape.width <= 3))) {
      regions.push(region("rules", [], { x: shape.x, top: shape.top, right: shape.x + shape.width, bottom: shape.top + shape.height, relatedShapeIndexes: [index] }));
    }
  });
  return { rows, regions: regions.sort((a, b) => a.top - b.top || a.x - b.x), medianFontSize };
}
