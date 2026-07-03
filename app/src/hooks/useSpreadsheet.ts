/**
 * useSpreadsheet — shell data hook for the p2p-sheets spreadsheet app.
 *
 * Shell pass: all state is local (no client calls). The wire pass will replace
 * the no-op mutations with real P2psheetsClient calls and wire useSubscription
 * for live sync across peers.
 *
 * Exports the domain types (Sheet, Cell, Cursor, FunctionDef) used by every
 * component so they import from one place.
 */
import { useState, useCallback, useEffect } from 'react';

// ── Domain types ────────────────────────────────────────────────────────────

export interface Sheet {
  id: string;
  name: string;
  position: number;
  created_at: number;
}

export interface Cell {
  id: string;
  sheet_id: string;
  row: number;
  col: number;
  raw_value: string;
  computed_value: string;
  updated_at: number;
}

export interface Cursor {
  id: string;
  author: string;
  sheet_id: string;
  row: number;
  col: number;
  color: string;
  updated_at: number;
}

export interface FunctionDef {
  name: string;
  syntax: string;
  description: string;
  example: string;
}

// ── Built-in functions (static reference data) ──────────────────────────────

export const BUILTIN_FUNCTIONS: FunctionDef[] = [
  {
    name: 'SUM',
    syntax: 'SUM(range)',
    description: 'Adds all numbers in a range',
    example: '=SUM(A1:A10)',
  },
  {
    name: 'AVERAGE',
    syntax: 'AVERAGE(range)',
    description: 'Returns the average of numbers in a range',
    example: '=AVERAGE(B1:B5)',
  },
  {
    name: 'MIN',
    syntax: 'MIN(range)',
    description: 'Returns the smallest number in a range',
    example: '=MIN(C1:C10)',
  },
  {
    name: 'MAX',
    syntax: 'MAX(range)',
    description: 'Returns the largest number in a range',
    example: '=MAX(D1:D10)',
  },
  {
    name: 'COUNT',
    syntax: 'COUNT(range)',
    description: 'Counts the number of cells with numeric values',
    example: '=COUNT(A1:A20)',
  },
  {
    name: 'IF',
    syntax: 'IF(condition, value_if_true, value_if_false)',
    description: 'Returns one value if a condition is true, another if false',
    example: '=IF(A1>10, "High", "Low")',
  },
];

// ── Hook interface ───────────────────────────────────────────────────────────

export interface UseSpreadsheetArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseSpreadsheetReturn {
  sheets: Sheet[];
  cells: Cell[];
  cursors: Cursor[];
  functions: FunctionDef[];
  loading: boolean;
  error: Error | null;
  /** True when contextId + executorPublicKey are resolved. */
  ready: boolean;
  // Sheet mutations
  createSheet: (name: string) => Promise<void>;
  renameSheet: (sheetId: string, newName: string) => Promise<void>;
  deleteSheet: (sheetId: string) => Promise<void>;
  // Cell mutations
  setCell: (sheetId: string, row: number, col: number, rawValue: string) => Promise<void>;
  clearCell: (sheetId: string, row: number, col: number) => Promise<void>;
  // Cursor
  updateCursor: (sheetId: string, row: number, col: number) => Promise<void>;
  // Export
  exportAll: () => Promise<Sheet[]>;
  // Function search (local filter on BUILTIN_FUNCTIONS)
  searchFunctions: (prefix: string) => FunctionDef[];
  refresh: () => Promise<void>;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSpreadsheet({
  contextId,
  executorPublicKey,
}: UseSpreadsheetArgs): UseSpreadsheetReturn {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  // cursors: empty in shell pass — populated in wire pass via get_cursors + subscription
  const [cursors] = useState<Cursor[]>([]);

  const ready = contextId !== null && executorPublicKey !== null;

  // Auto-create a default sheet once the workspace resolves.
  // Wire pass: replaced by get_cells / list_sheets calls.
  useEffect(() => {
    if (ready && sheets.length === 0) {
      setSheets([
        { id: 'sheet-default', name: 'Sheet 1', position: 0, created_at: Date.now() },
      ]);
    }
  }, [ready, sheets.length]);

  const createSheet = useCallback(async (name: string) => {
    const id = `sheet-${Date.now()}`;
    setSheets((prev) => [
      ...prev,
      { id, name, position: prev.length, created_at: Date.now() },
    ]);
  }, []);

  const renameSheet = useCallback(async (sheetId: string, newName: string) => {
    setSheets((prev) =>
      prev.map((s) => (s.id === sheetId ? { ...s, name: newName } : s)),
    );
  }, []);

  const deleteSheet = useCallback(async (sheetId: string) => {
    setSheets((prev) => {
      if (prev.length <= 1) return prev; // cannot delete the last sheet
      return prev.filter((s) => s.id !== sheetId);
    });
    setCells((prev) => prev.filter((c) => c.sheet_id !== sheetId));
  }, []);

  const setCell = useCallback(
    async (sheetId: string, row: number, col: number, rawValue: string) => {
      if (!rawValue.trim()) return;
      const id = `cell-${sheetId}-${row}-${col}`;
      setCells((prev) => {
        const idx = prev.findIndex(
          (c) => c.sheet_id === sheetId && c.row === row && c.col === col,
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            raw_value: rawValue,
            computed_value: rawValue,
            updated_at: Date.now(),
          };
          return next;
        }
        return [
          ...prev,
          {
            id,
            sheet_id: sheetId,
            row,
            col,
            raw_value: rawValue,
            computed_value: rawValue,
            updated_at: Date.now(),
          },
        ];
      });
    },
    [],
  );

  const clearCell = useCallback(async (sheetId: string, row: number, col: number) => {
    setCells((prev) =>
      prev.filter(
        (c) => !(c.sheet_id === sheetId && c.row === row && c.col === col),
      ),
    );
  }, []);

  // shell pass: no-op — wire pass calls client.update_cursor
  const updateCursor = useCallback(
    async (_sheetId: string, _row: number, _col: number) => {},
    [],
  );

  const exportAll = useCallback(async () => sheets, [sheets]);

  const searchFunctions = useCallback((prefix: string): FunctionDef[] => {
    if (!prefix) return BUILTIN_FUNCTIONS;
    const upper = prefix.toUpperCase();
    return BUILTIN_FUNCTIONS.filter((f) => f.name.startsWith(upper));
  }, []);

  // shell pass: no-op — wire pass fetches from client
  const refresh = useCallback(async () => {}, []);

  return {
    sheets,
    cells,
    cursors,
    functions: BUILTIN_FUNCTIONS,
    loading: false,
    error: null,
    ready,
    createSheet,
    renameSheet,
    deleteSheet,
    setCell,
    clearCell,
    updateCursor,
    exportAll,
    searchFunctions,
    refresh,
  };
}
