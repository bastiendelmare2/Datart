import * as XLSX from "xlsx";

export type CellValue = string | number | boolean | Date | null;
export type DataRow = Record<string, CellValue>;

export interface ImportedTable {
  id: string;
  fileName: string;
  sheetName: string;
  columns: string[];
  rows: DataRow[];
}

export interface FilterRule {
  id: string;
  column: string;
  terms: string;
  caseSensitive: boolean;
  matchDerivatives: boolean;
}

export interface ColumnAvailability {
  column: string;
  missingFrom: string[];
  presentIn: number;
}

export interface WordStat {
  word: string;
  count: number;
}

export interface ColumnExample {
  column: string;
  examples: string[];
}

export interface ColumnCorpusStat {
  column: string;
  rowsWithValues: number;
  nonEmptyCells: number;
  tokenCount: number;
}

export interface WordCorrelation {
  left: string;
  right: string;
  count: number;
}

export interface VariableCorrelation {
  left: string;
  right: string;
  sharedRows: number;
  overlap: number;
  jaccard: number;
  score: number;
}

export interface CorpusAnalysis {
  words: WordStat[];
  bigrams: WordStat[];
  wordCorrelations: WordCorrelation[];
  variableCorrelations: VariableCorrelation[];
  columnStats: ColumnCorpusStat[];
  maxCount: number;
  totalOccurrences: number;
  uniqueWordCount: number;
  rowsWithAnyColumn: number;
  nonEmptyCells: number;
}

export interface ColumnEdit {
  name: string;
  removed: boolean;
}

export type ColumnEdits = Record<string, ColumnEdit>;

export interface TermImpact {
  term: string;
  removedCount: number;
}

export interface TextCorpusOptions {
  caseSensitive?: boolean;
  minLength?: number;
  topN?: number;
  topBigrams?: number;
  topWordCorrelations?: number;
  excludeStopWords?: boolean;
}

export interface RowWordCloudOptions {
  caseSensitive?: boolean;
  minLength?: number;
  topN?: number;
  excludeStopWords?: boolean;
}

const SOURCE_FILE = "_Fichier";
const SOURCE_SHEET = "_Feuille";

const FRENCH_STOP_WORDS = new Set([
  "a", "ai", "ait", "avec", "au", "aux", "ce", "cet", "cette", "ces", "dans", "de", "des",
  "du", "elle", "en", "et", "eux", "il", "ils", "je", "la", "le", "les", "leur", "leurs", "lui",
  "ma", "mais", "mes", "mon", "moi", "ne", "nos", "notre", "nous", "on", "ou", "par", "pas",
  "plus", "pour", "qu", "que", "qui", "sa", "sans", "se", "ses", "son", "sur", "ta", "te",
  "tes", "toi", "ton", "tu", "un", "une", "vos", "votre", "vous", "y", "d", "l", "c", "n",
  "est", "sont", "etre", "ete", "été", "étées", "être", "comme", "dont", "ainsi", "car", "donc",
  "or", "ni", "si", "afin", "chez", "depuis", "entre", "hors", "jusque", "malgre", "malgré",
]);

export async function importWorkbook(file: File): Promise<ImportedTable[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });

  return workbook.SheetNames.map((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<DataRow>(sheet, { defval: null, raw: true });
    const columns = collectColumns(rows);

    return {
      id: `${file.name}-${index}-${sheetName}`,
      fileName: file.name,
      sheetName,
      columns,
      rows,
    };
  });
}

export function getColumnAvailability(tables: ImportedTable[]): ColumnAvailability[] {
  const allColumns = Array.from(new Set(tables.flatMap((table) => table.columns))).sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  return allColumns.map((column) => {
    const missingFrom = tables
      .filter((table) => !table.columns.includes(column))
      .map((table) => `${table.fileName} / ${table.sheetName}`);
    return { column, missingFrom, presentIn: tables.length - missingFrom.length };
  });
}

export function filterTables(tables: ImportedTable[], rules: FilterRule[]) {
  const activeRules = rules.filter((rule) => rule.column && splitTerms(rule.terms).length > 0);
  const allColumns = Array.from(new Set(tables.flatMap((table) => table.columns)));
  const keptRows: DataRow[] = [];
  let removedCount = 0;

  for (const table of tables) {
    for (const row of table.rows) {
      const shouldRemove = activeRules.some((rule) => {
        if (!table.columns.includes(rule.column)) return false;
        return matchesRule(row[rule.column], rule);
      });

      if (shouldRemove) {
        removedCount += 1;
      } else {
        const mergedRow: DataRow = { [SOURCE_FILE]: table.fileName, [SOURCE_SHEET]: table.sheetName };
        for (const column of allColumns) mergedRow[column] = row[column] ?? null;
        keptRows.push(mergedRow);
      }
    }
  }

  return { rows: keptRows, removedCount, totalCount: keptRows.length + removedCount };
}

export function applyColumnEdits(tables: ImportedTable[], edits: ColumnEdits): ImportedTable[] {
  return tables.map((table) => {
    const mappedColumns = table.columns
      .filter((column) => !edits[column]?.removed)
      .map((column) => normalizeTargetColumn(column, edits))
      .filter(Boolean) as string[];

    const rows = table.rows.map((row) => {
      const next: DataRow = {};
      for (const [sourceColumn, value] of Object.entries(row)) {
        if (edits[sourceColumn]?.removed) continue;
        const targetColumn = normalizeTargetColumn(sourceColumn, edits);
        if (!targetColumn) continue;
        if (!(targetColumn in next) || next[targetColumn] === null || next[targetColumn] === undefined) {
          next[targetColumn] = value;
        }
      }
      return next;
    });

    return {
      ...table,
      columns: Array.from(new Set([...mappedColumns, ...collectColumns(rows)])),
      rows,
    };
  });
}

export function getRuleTermImpacts(tables: ImportedTable[], rule: FilterRule): TermImpact[] {
  if (!rule.column) return [];
  const terms = splitTerms(rule.terms);
  if (!terms.length) return [];

  return terms.map((term) => {
    let removedCount = 0;
    for (const table of tables) {
      if (!table.columns.includes(rule.column)) continue;
      for (const row of table.rows) {
        if (matchesTerm(row[rule.column], term, rule.caseSensitive, rule.matchDerivatives)) {
          removedCount += 1;
        }
      }
    }
    return { term, removedCount };
  });
}

export function exportRows(rows: DataRow[], fileName = "base_filtree.xlsx") {
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: rows.length ? Object.keys(rows[0]) : [SOURCE_FILE, SOURCE_SHEET],
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Données filtrées");
  XLSX.writeFile(workbook, fileName, { compression: true });
}

export function analyzeTextCorpus(
  tables: ImportedTable[],
  columns: string[],
  options?: TextCorpusOptions,
): CorpusAnalysis {
  const selectedColumns = Array.from(new Set(columns.filter(Boolean)));
  const caseSensitive = options?.caseSensitive ?? false;
  const minLength = Math.max(1, options?.minLength ?? 3);
  const topN = Math.max(1, options?.topN ?? 40);
  const topBigrams = Math.max(1, options?.topBigrams ?? 25);
  const topWordCorrelations = Math.max(1, options?.topWordCorrelations ?? 20);
  const excludeStopWords = options?.excludeStopWords ?? true;

  const wordCounts = new Map<string, number>();
  const bigramCounts = new Map<string, number>();
  const rowPairCounts = new Map<string, number>();
  const columnPairSharedRows = new Map<string, number>();
  const columnStats = new Map<string, ColumnCorpusStat>();
  const columnWordCounts = new Map<string, Map<string, number>>();

  let rowsWithAnyColumn = 0;
  let nonEmptyCells = 0;

  for (const column of selectedColumns) {
    columnStats.set(column, { column, rowsWithValues: 0, nonEmptyCells: 0, tokenCount: 0 });
    columnWordCounts.set(column, new Map<string, number>());
  }

  for (const table of tables) {
    const tableColumns = selectedColumns.filter((column) => table.columns.includes(column));
    if (!tableColumns.length) continue;

    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex];
      const rowTokens = new Set<string>();
      const presentColumns: string[] = [];

      for (const column of tableColumns) {
        const stat = columnStats.get(column);
        if (!stat) continue;

        stat.rowsWithValues += 1;
        const value = row[column];
        if (value === null || value === undefined) continue;

        const text = String(value).trim();
        if (!text) continue;

        stat.nonEmptyCells += 1;
        nonEmptyCells += 1;
        presentColumns.push(column);

        const tokens = tokenize(text, {
          caseSensitive,
          minLength,
          excludeStopWords,
        });

        if (!tokens.length) continue;

        stat.tokenCount += tokens.length;
        const perColumnCounts = columnWordCounts.get(column);

        for (const token of tokens) {
          wordCounts.set(token, (wordCounts.get(token) ?? 0) + 1);
          rowTokens.add(token);
          if (perColumnCounts) perColumnCounts.set(token, (perColumnCounts.get(token) ?? 0) + 1);
        }

        for (let i = 0; i < tokens.length - 1; i += 1) {
          const key = `${tokens[i]} ${tokens[i + 1]}`;
          bigramCounts.set(key, (bigramCounts.get(key) ?? 0) + 1);
        }
      }

      if (presentColumns.length) rowsWithAnyColumn += 1;

      if (presentColumns.length > 1) {
        const uniqueColumns = Array.from(new Set(presentColumns));
        for (let i = 0; i < uniqueColumns.length; i += 1) {
          for (let j = i + 1; j < uniqueColumns.length; j += 1) {
            const left = uniqueColumns[i];
            const right = uniqueColumns[j];
            const key = left < right ? `${left}|||${right}` : `${right}|||${left}`;
            columnPairSharedRows.set(key, (columnPairSharedRows.get(key) ?? 0) + 1);
          }
        }
      }

      const rowWords = Array.from(rowTokens);
      for (let i = 0; i < rowWords.length; i += 1) {
        for (let j = i + 1; j < rowWords.length; j += 1) {
          const left = rowWords[i];
          const right = rowWords[j];
          const key = left < right ? `${left}|||${right}` : `${right}|||${left}`;
          rowPairCounts.set(key, (rowPairCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const words = toTopWordStats(wordCounts, topN);
  const bigrams = toTopWordStats(bigramCounts, topBigrams);
  const maxCount = words[0]?.count ?? 0;
  const totalOccurrences = words.reduce((sum, item) => sum + item.count, 0);

  const topVocabulary = new Set(words.map((item) => item.word));
  const wordCorrelations = Array.from(rowPairCounts.entries())
    .map(([key, count]) => {
      const [left, right] = key.split("|||");
      return { left, right, count };
    })
    .filter((pair) => topVocabulary.has(pair.left) && topVocabulary.has(pair.right))
    .sort((a, b) => b.count - a.count || a.left.localeCompare(b.left, "fr"))
    .slice(0, topWordCorrelations);

  const variableCorrelations = computeVariableCorrelations(
    selectedColumns,
    columnStats,
    columnWordCounts,
    columnPairSharedRows,
  );

  return {
    words,
    bigrams,
    wordCorrelations,
    variableCorrelations,
    columnStats: selectedColumns
      .map((column) => columnStats.get(column))
      .filter((item): item is ColumnCorpusStat => Boolean(item)),
    maxCount,
    totalOccurrences,
    uniqueWordCount: wordCounts.size,
    rowsWithAnyColumn,
    nonEmptyCells,
  };
}

export function analyzeColumnWords(
  tables: ImportedTable[],
  column: string,
  options?: { caseSensitive?: boolean; minLength?: number; topN?: number },
) {
  const result = analyzeTextCorpus(tables, [column], {
    caseSensitive: options?.caseSensitive,
    minLength: options?.minLength,
    topN: options?.topN,
  });

  return {
    words: result.words,
    maxCount: result.maxCount,
    totalOccurrences: result.totalOccurrences,
    rowsWithColumn: result.rowsWithAnyColumn,
    nonEmptyCells: result.nonEmptyCells,
  };
}

export function getColumnExamples(tables: ImportedTable[], column: string, limit = 3): string[] {
  if (!column) return [];
  const examples: string[] = [];
  const seen = new Set<string>();

  for (const table of tables) {
    if (!table.columns.includes(column)) continue;

    for (const row of table.rows) {
      const value = row[column];
      if (value === null || value === undefined) continue;
      const text = String(value).trim();
      if (!text || seen.has(text)) continue;

      seen.add(text);
      examples.push(text);
      if (examples.length >= limit) return examples;
    }
  }

  return examples;
}

export function analyzeRowsWordCloud(
  rows: DataRow[],
  columns: string[],
  options?: RowWordCloudOptions,
): WordStat[] {
  const selectedColumns = Array.from(new Set(columns.filter(Boolean)));
  if (!rows.length || !selectedColumns.length) return [];

  const caseSensitive = options?.caseSensitive ?? false;
  const minLength = Math.max(1, options?.minLength ?? 3);
  const topN = Math.max(1, options?.topN ?? 40);
  const excludeStopWords = options?.excludeStopWords ?? true;

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const column of selectedColumns) {
      const value = row[column];
      if (value === null || value === undefined) continue;
      const text = String(value).trim();
      if (!text) continue;

      const tokens = tokenize(text, {
        caseSensitive,
        minLength,
        excludeStopWords,
      });

      for (const token of tokens) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
  }

  return toTopWordStats(counts, topN);
}

function collectColumns(rows: DataRow[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

export function splitTerms(terms: string) {
  return terms
    .split(/[\n,;]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function matchesRule(value: CellValue | undefined, rule: FilterRule) {
  if (value === null || value === undefined) return false;
  return splitTerms(rule.terms).some((term) =>
    matchesTerm(value, term, rule.caseSensitive, rule.matchDerivatives),
  );
}

function normalizeTargetColumn(sourceColumn: string, edits: ColumnEdits) {
  const renamed = edits[sourceColumn]?.name?.trim();
  return renamed || sourceColumn;
}

function matchesTerm(
  value: CellValue | undefined,
  rawTerm: string,
  caseSensitive: boolean,
  matchDerivatives: boolean,
) {
  if (value === null || value === undefined) return false;
  const normalize = (text: string) => (caseSensitive ? text : text.toLocaleLowerCase("fr"));
  const tokenizedValue = normalize(String(value)).match(/[\p{L}\p{N}]+/gu) ?? [];
  const term = normalize(rawTerm.trim());
  if (!term) return false;

  return matchDerivatives
    ? tokenizedValue.some((token) => token.startsWith(term))
    : tokenizedValue.some((token) => token === term);
}

function tokenize(
  input: string,
  options: { caseSensitive: boolean; minLength: number; excludeStopWords: boolean },
) {
  const normalize = (text: string) =>
    options.caseSensitive ? text : text.toLocaleLowerCase("fr");

  return (normalize(input).match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => {
    if (token.length < options.minLength) return false;
    if (!options.excludeStopWords) return true;
    return !FRENCH_STOP_WORDS.has(token);
  });
}

function toTopWordStats(counts: Map<string, number>, topN: number): WordStat[] {
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "fr"))
    .slice(0, topN);
}

function computeVariableCorrelations(
  selectedColumns: string[],
  columnStats: Map<string, ColumnCorpusStat>,
  columnWordCounts: Map<string, Map<string, number>>,
  columnPairSharedRows: Map<string, number>,
): VariableCorrelation[] {
  const correlations: VariableCorrelation[] = [];

  for (let i = 0; i < selectedColumns.length; i += 1) {
    for (let j = i + 1; j < selectedColumns.length; j += 1) {
      const left = selectedColumns[i];
      const right = selectedColumns[j];
      const leftStats = columnStats.get(left);
      const rightStats = columnStats.get(right);
      if (!leftStats || !rightStats) continue;

      const pairKey = left < right ? `${left}|||${right}` : `${right}|||${left}`;
      const sharedRows = columnPairSharedRows.get(pairKey) ?? 0;
      const overlapDenominator = Math.max(1, Math.min(leftStats.nonEmptyCells, rightStats.nonEmptyCells));
      const overlap = sharedRows / overlapDenominator;

      const leftTopWords = new Set(toTopWordStats(columnWordCounts.get(left) ?? new Map(), 25).map((w) => w.word));
      const rightTopWords = new Set(toTopWordStats(columnWordCounts.get(right) ?? new Map(), 25).map((w) => w.word));
      const union = new Set([...leftTopWords, ...rightTopWords]);
      let intersection = 0;
      for (const word of leftTopWords) if (rightTopWords.has(word)) intersection += 1;
      const jaccard = union.size ? intersection / union.size : 0;

      const score = Math.round((overlap * 0.6 + jaccard * 0.4) * 100);
      correlations.push({ left, right, sharedRows, overlap, jaccard, score });
    }
  }

  return correlations.sort((a, b) => b.score - a.score || a.left.localeCompare(b.left, "fr"));
}
