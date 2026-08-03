import type {
  CellKeyDownEvent,
  CellRange,
  FullWidthCellKeyDownEvent,
  IRowNode,
  RowPinnedType,
} from 'ag-grid-community';

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const getPinnedRowRank = (rowPinned: RowPinnedType | null | undefined) => {
  if (rowPinned === 'top') return 0;
  if (rowPinned == null) return 1;
  return 2;
};

const compareRowPositions = (
  left: { rowIndex: number; rowPinned: RowPinnedType | null | undefined },
  right: { rowIndex: number; rowPinned: RowPinnedType | null | undefined },
) => {
  const pinnedRankDifference = getPinnedRowRank(left.rowPinned) - getPinnedRowRank(right.rowPinned);
  if (pinnedRankDifference !== 0) return pinnedRankDifference;
  return left.rowIndex - right.rowIndex;
};

const getRangeRowNodes = (
  event: CellKeyDownEvent | FullWidthCellKeyDownEvent,
  range: CellRange,
) => {
  const startRow = range.startRow;
  const endRow = range.endRow;

  if (!startRow || !endRow) return [];

  const [fromRow, toRow] =
    compareRowPositions(startRow, endRow) <= 0
      ? [startRow, endRow]
      : [endRow, startRow];

  const rowNodes: IRowNode[] = [];
  const pinnedTopCount = event.api.getPinnedTopRowCount();
  const pinnedBottomCount = event.api.getPinnedBottomRowCount();
  const lastBodyRowIndex = Math.max(event.api.getDisplayedRowCount() - 1, -1);

  if (fromRow.rowPinned === 'top') {
    const topEndIndex = toRow.rowPinned === 'top' ? toRow.rowIndex : pinnedTopCount - 1;
    for (let rowIndex = fromRow.rowIndex; rowIndex <= topEndIndex; rowIndex += 1) {
      const rowNode = event.api.getPinnedTopRow(rowIndex);
      if (rowNode) rowNodes.push(rowNode);
    }
  }

  if (fromRow.rowPinned !== 'bottom' && toRow.rowPinned !== 'top') {
    const bodyStartIndex = fromRow.rowPinned === 'top' ? 0 : fromRow.rowIndex;
    const bodyEndIndex = toRow.rowPinned === 'bottom' ? lastBodyRowIndex : toRow.rowIndex;

    for (let rowIndex = bodyStartIndex; rowIndex <= bodyEndIndex; rowIndex += 1) {
      const rowNode = event.api.getDisplayedRowAtIndex(rowIndex);
      if (rowNode) rowNodes.push(rowNode);
    }
  }

  if (toRow.rowPinned === 'bottom') {
    const bottomStartIndex = fromRow.rowPinned === 'bottom' ? fromRow.rowIndex : 0;
    for (let rowIndex = bottomStartIndex; rowIndex <= toRow.rowIndex && rowIndex < pinnedBottomCount; rowIndex += 1) {
      const rowNode = event.api.getPinnedBottomRow(rowIndex);
      if (rowNode) rowNodes.push(rowNode);
    }
  }

  return rowNodes;
};

const getRangeText = (
  event: CellKeyDownEvent | FullWidthCellKeyDownEvent,
  range: CellRange,
) => {
  const columns = range.columns;
  const rowNodes = getRangeRowNodes(event, range);

  if (!columns.length || !rowNodes.length) return '';

  return rowNodes
    .map((rowNode) =>
      columns
        .map((column) => {
          const value = event.api.getCellValue({ rowNode, colKey: column, useFormatter: true });
          return String(value ?? '');
        })
        .join('\t'),
    )
    .join('\n');
};

export const handleGridCellCopy = async (
  event: CellKeyDownEvent | FullWidthCellKeyDownEvent,
) => {
  const keyboardEvent = event.event as KeyboardEvent | undefined;
  if (!keyboardEvent) return;

  const selectedText = window.getSelection?.()?.toString().trim();
  if (selectedText) return;

  const isCopyShortcut =
    keyboardEvent.key.toLowerCase() === 'c' && (keyboardEvent.ctrlKey || keyboardEvent.metaKey);

  if (!isCopyShortcut) return;

  const ranges = event.api.getCellRanges?.() ?? [];
  const rangeText = ranges
    .map((range) => getRangeText(event, range))
    .filter(Boolean)
    .join('\n');

  if (rangeText) {
    keyboardEvent.preventDefault();
    await copyText(rangeText);
    return;
  }

  const target = keyboardEvent.target as HTMLElement | null;
  const cellElement = target?.closest('.ag-cell') as HTMLElement | null;
  const fallbackValue = 'value' in event ? event.value : '';
  const text = cellElement?.innerText?.trim() || String(fallbackValue ?? '');

  if (!text) return;

  keyboardEvent.preventDefault();
  await copyText(text);
};
