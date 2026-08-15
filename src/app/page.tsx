"use client";

import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronRight,
  Cloud,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Link2,
  Moon,
  Plus,
  Save,
  Sigma,
  SlidersHorizontal,
  Sun,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  analyzeRowsWordCloud,
  analyzeTextCorpus,
  applyColumnEdits,
  ColumnEdits,
  exportRows,
  filterTables,
  FilterRule,
  getColumnAvailability,
  getColumnExamples,
  getRuleTermImpacts,
  ImportedTable,
  importWorkbook,
  splitTerms,
} from "@/lib/excel";

type FileEntry = FileSystemFileEntry & { file: (callback: (file: File) => void) => void };
type DirectoryEntry = FileSystemDirectoryEntry & {
  createReader: () => { readEntries: (callback: (entries: FileSystemEntry[]) => void) => void };
};

type AppMode = "tri" | "analyse";
type ThemeMode = "day" | "night";

interface ImportProgress {
  loaded: number;
  total: number;
  currentFile: string;
  failed: string[];
}

interface AnalysisRequest {
  columns: string[];
  caseSensitive: boolean;
  minLength: number;
  topN: number;
  revision: number;
}

interface SavedFilterConfig {
  id: string;
  name: string;
  createdAt: string;
  rules: FilterRule[];
}

interface SavedColumnConfig {
  id: string;
  name: string;
  createdAt: string;
  edits: ColumnEdits;
}

const FILTER_CONFIG_STORAGE = "datart.filterConfigs.v1";
const COLUMN_CONFIG_STORAGE = "datart.columnConfigs.v1";

const createRule = (): FilterRule => ({
  id: crypto.randomUUID(),
  column: "",
  terms: "",
  caseSensitive: false,
  matchDerivatives: true,
});

export default function Home() {
  const [theme, setTheme] = useState<ThemeMode>("day");
  const [mode, setMode] = useState<AppMode>("tri");
  const [sourceTables, setSourceTables] = useState<ImportedTable[]>([]);
  const [columnEdits, setColumnEdits] = useState<ColumnEdits>({});
  const [rules, setRules] = useState<FilterRule[]>([createRule()]);
  const [pendingTerms, setPendingTerms] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showDifferences, setShowDifferences] = useState(false);
  const [error, setError] = useState("");
  const [dataRevision, setDataRevision] = useState(0);

  const [analysisColumns, setAnalysisColumns] = useState<string[]>([]);
  const [analysisColumnCandidate, setAnalysisColumnCandidate] = useState("");
  const [analysisCaseSensitive, setAnalysisCaseSensitive] = useState(false);
  const [analysisMinLength, setAnalysisMinLength] = useState(3);
  const [analysisTopN, setAnalysisTopN] = useState(50);
  const [analysisRequest, setAnalysisRequest] = useState<AnalysisRequest | null>(null);

  const [filterConfigName, setFilterConfigName] = useState("");
  const [columnConfigName, setColumnConfigName] = useState("");
  const [filterConfigs, setFilterConfigs] = useState<SavedFilterConfig[]>([]);
  const [columnConfigs, setColumnConfigs] = useState<SavedColumnConfig[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const storedFilterConfigs = localStorage.getItem(FILTER_CONFIG_STORAGE);
      if (storedFilterConfigs) setFilterConfigs(JSON.parse(storedFilterConfigs));
      const storedColumnConfigs = localStorage.getItem(COLUMN_CONFIG_STORAGE);
      if (storedColumnConfigs) setColumnConfigs(JSON.parse(storedColumnConfigs));
    } catch {
      // Ignore corrupted localStorage data and keep defaults.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FILTER_CONFIG_STORAGE, JSON.stringify(filterConfigs));
  }, [filterConfigs]);

  useEffect(() => {
    localStorage.setItem(COLUMN_CONFIG_STORAGE, JSON.stringify(columnConfigs));
  }, [columnConfigs]);

  const triTables = useMemo(() => applyColumnEdits(sourceTables, columnEdits), [sourceTables, columnEdits]);
  const triAvailability = useMemo(() => getColumnAvailability(triTables), [triTables]);
  const analysisAvailability = useMemo(() => getColumnAvailability(sourceTables), [sourceTables]);

  const missingColumns = (mode === "tri" ? triAvailability : analysisAvailability).filter(
    (item) => item.missingFrom.length > 0,
  );

  const result = useMemo(() => filterTables(triTables, rules), [triTables, rules]);

  const analysis = useMemo(() => {
    if (!analysisRequest) return null;
    return analyzeTextCorpus(sourceTables, analysisRequest.columns, {
      caseSensitive: analysisRequest.caseSensitive,
      minLength: analysisRequest.minLength,
      topN: analysisRequest.topN,
      excludeStopWords: true,
    });
  }, [sourceTables, analysisRequest]);

  const normalizedSelectedColumns = [...analysisColumns].sort();
  const normalizedRequestColumns = analysisRequest ? [...analysisRequest.columns].sort() : [];
  const sameColumns =
    normalizedSelectedColumns.length === normalizedRequestColumns.length &&
    normalizedSelectedColumns.every((col, index) => col === normalizedRequestColumns[index]);

  const analysisNeedsRun =
    !analysisRequest ||
    analysisRequest.revision !== dataRevision ||
    !sameColumns ||
    analysisRequest.caseSensitive !== analysisCaseSensitive ||
    analysisRequest.minLength !== analysisMinLength ||
    analysisRequest.topN !== analysisTopN;

  const ruleTermImpacts = useMemo(() => {
    const impacts = new Map<string, ReturnType<typeof getRuleTermImpacts>>();
    for (const rule of rules) impacts.set(rule.id, getRuleTermImpacts(triTables, rule));
    return impacts;
  }, [triTables, rules]);

  const ruleExamples = useMemo(() => {
    const examples = new Map<string, string[]>();
    for (const rule of rules) examples.set(rule.id, getColumnExamples(triTables, rule.column, 3));
    return examples;
  }, [triTables, rules]);

  const postFilterColumns = useMemo(
    () => Array.from(new Set(rules.map((rule) => rule.column).filter(Boolean))),
    [rules],
  );

  const postFilterWords = useMemo(
    () =>
      analyzeRowsWordCloud(result.rows, postFilterColumns, {
        minLength: 3,
        topN: 45,
        excludeStopWords: true,
      }),
    [result.rows, postFilterColumns],
  );

  const sourceColumns = useMemo(
    () =>
      Array.from(new Set(sourceTables.flatMap((table) => table.columns))).sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [sourceTables],
  );

  const sourceFileNames = useMemo(
    () => Array.from(new Set(sourceTables.map((table) => table.fileName))),
    [sourceTables],
  );

  async function addFiles(files: File[]) {
    const excelFiles = files.filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    if (!excelFiles.length) {
      setError("Aucun fichier Excel .xlsx ou .xls n’a été trouvé.");
      return;
    }

    setError("");
    setIsImporting(true);
    setImportProgress({ loaded: 0, total: excelFiles.length, currentFile: excelFiles[0].name, failed: [] });

    const imported: ImportedTable[] = [];
    const failed: string[] = [];

    for (let index = 0; index < excelFiles.length; index += 1) {
      const file = excelFiles[index];
      setImportProgress({ loaded: index, total: excelFiles.length, currentFile: file.name, failed: [...failed] });

      try {
        imported.push(...(await importWorkbook(file)));
      } catch {
        failed.push(file.name);
      }

      setImportProgress({ loaded: index + 1, total: excelFiles.length, currentFile: file.name, failed: [...failed] });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    const combined = [...sourceTables, ...imported];
    setSourceTables(combined);
    setDataRevision((current) => current + 1);

    const hasDifferences = getColumnAvailability(
      mode === "tri" ? applyColumnEdits(combined, columnEdits) : combined,
    ).some((column) => column.missingFrom.length);
    if (hasDifferences) setShowDifferences(true);

    if (failed.length) {
      setError(`${failed.length} fichier(s) n’ont pas pu être lus : ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}.`);
    }

    setIsImporting(false);
    setImportProgress(null);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const entries = Array.from(event.dataTransfer.items)
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => Boolean(entry));
    const files = entries.length
      ? (await Promise.all(entries.map(readEntry))).flat()
      : Array.from(event.dataTransfer.files);
    await addFiles(files);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function updateRule(id: string, patch: Partial<FilterRule>) {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  }

  function setRuleTerms(ruleId: string, terms: string[]) {
    updateRule(ruleId, { terms: terms.join("\n") });
  }

  function addRuleTerm(ruleId: string) {
    const value = (pendingTerms[ruleId] ?? "").trim();
    if (!value) return;
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) return;

    const nextTerms = [...splitTerms(rule.terms), value];
    setRuleTerms(ruleId, nextTerms);
    setPendingTerms((current) => ({ ...current, [ruleId]: "" }));
  }

  function removeRuleTerm(ruleId: string, termIndex: number) {
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) return;
    const nextTerms = splitTerms(rule.terms).filter((_, index) => index !== termIndex);
    setRuleTerms(ruleId, nextTerms);
  }

  function onRuleTermKeyDown(event: KeyboardEvent<HTMLInputElement>, ruleId: string) {
    if (event.key === "Enter" || event.key === "," || event.key === ";") {
      event.preventDefault();
      addRuleTerm(ruleId);
    }
  }

  function removeFile(fileName: string) {
    setSourceTables((current) => current.filter((table) => table.fileName !== fileName));
    setDataRevision((current) => current + 1);
  }

  function updateColumnName(sourceColumn: string, nextName: string) {
    const trimmed = nextName.trim();

    setColumnEdits((current) => {
      const previous = current[sourceColumn] ?? { name: sourceColumn, removed: false };
      const next = {
        ...current,
        [sourceColumn]: { name: trimmed || sourceColumn, removed: previous.removed },
      };

      if ((trimmed || sourceColumn) === sourceColumn && !previous.removed) delete next[sourceColumn];
      return next;
    });

    setRules((current) =>
      current.map((rule) =>
        rule.column === sourceColumn
          ? { ...rule, column: trimmed || sourceColumn }
          : rule,
      ),
    );

    setDataRevision((current) => current + 1);
  }

  function toggleColumnRemoval(sourceColumn: string) {
    setColumnEdits((current) => {
      const previous = current[sourceColumn] ?? { name: sourceColumn, removed: false };
      const nextRemoved = !previous.removed;
      const next = {
        ...current,
        [sourceColumn]: {
          name: previous.name || sourceColumn,
          removed: nextRemoved,
        },
      };

      if (!nextRemoved && (previous.name || sourceColumn) === sourceColumn) delete next[sourceColumn];
      return next;
    });

    setDataRevision((current) => current + 1);
  }

  function addAnalysisColumn() {
    const column = analysisColumnCandidate.trim();
    if (!column) return;
    setAnalysisColumns((current) => (current.includes(column) ? current : [...current, column]));
    setAnalysisColumnCandidate("");
  }

  function removeAnalysisColumn(column: string) {
    setAnalysisColumns((current) => current.filter((item) => item !== column));
  }

  function saveFilterConfig() {
    const name = filterConfigName.trim();
    if (!name) return;

    setFilterConfigs((current) => [
      {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        rules,
      },
      ...current,
    ]);
    setFilterConfigName("");
  }

  function loadFilterConfig(id: string) {
    const config = filterConfigs.find((item) => item.id === id);
    if (!config) return;
    setRules(config.rules.map((rule) => ({ ...rule, id: crypto.randomUUID() })));
  }

  function deleteFilterConfig(id: string) {
    setFilterConfigs((current) => current.filter((item) => item.id !== id));
  }

  function saveColumnConfig() {
    const name = columnConfigName.trim();
    if (!name) return;

    setColumnConfigs((current) => [
      {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        edits: columnEdits,
      },
      ...current,
    ]);
    setColumnConfigName("");
  }

  function loadColumnConfig(id: string) {
    const config = columnConfigs.find((item) => item.id === id);
    if (!config) return;
    setColumnEdits(config.edits);
    setDataRevision((current) => current + 1);
  }

  function deleteColumnConfig(id: string) {
    setColumnConfigs((current) => current.filter((item) => item.id !== id));
  }

  function resetAll() {
    setSourceTables([]);
    setColumnEdits({});
    setRules([createRule()]);
    setPendingTerms({});
    setAnalysisColumns([]);
    setAnalysisColumnCandidate("");
    setAnalysisRequest(null);
    setDataRevision((current) => current + 1);
  }

  function runAnalysis() {
    if (!analysisColumns.length) return;
    setAnalysisRequest({
      columns: analysisColumns,
      caseSensitive: analysisCaseSensitive,
      minLength: analysisMinLength,
      topN: analysisTopN,
      revision: dataRevision,
    });
  }

  return (
    <main data-theme={theme}>
      <header className="app-header">
        <div className="brand-mark"><SlidersHorizontal size={18} /></div>
        <div><strong>Datart</strong><span>Atelier Excel local</span></div>
        <div className="header-actions">
          <button
            className="theme-button"
            onClick={() => setTheme((current) => (current === "day" ? "night" : "day"))}
            aria-label="Basculer le thème"
          >
            {theme === "day" ? <Moon size={16} /> : <Sun size={16} />}
            {theme === "day" ? "Mode Nuit" : "Mode Jour"}
          </button>
          <div className="local-badge"><span /> Données sur cet appareil</div>
        </div>
      </header>

      <div className="mode-switch" role="tablist" aria-label="Mode de travail">
        <button role="tab" aria-selected={mode === "tri"} className={mode === "tri" ? "active" : ""} onClick={() => setMode("tri")}>Mode Tri / Nettoyage</button>
        <button role="tab" aria-selected={mode === "analyse"} className={mode === "analyse" ? "active" : ""} onClick={() => setMode("analyse")}>Mode Analyse Textuelle</button>
      </div>

      <div className="workspace">
        <aside className="steps" aria-label="Progression">
          <p className="eyebrow">{mode === "tri" ? "TRAITEMENT" : "ANALYSE"}</p>
          <Step number="01" title="Importer" active={!sourceTables.length} done={sourceTables.length > 0} />
          {mode === "tri" ? (
            <>
              <Step number="02" title="Filtrer" active={sourceTables.length > 0} done={Boolean(rules.some((r) => r.column && splitTerms(r.terms).length))} />
              <Step number="03" title="Exporter" active={sourceTables.length > 0} done={false} />
            </>
          ) : (
            <>
              <Step number="02" title="Choisir variables" active={sourceTables.length > 0} done={analysisColumns.length > 0} />
              <Step number="03" title="Corrélations" active={analysisColumns.length > 0} done={Boolean(analysisRequest && !analysisNeedsRun)} />
            </>
          )}
          <div className="privacy-note">
            <Check size={16} />
            <p><strong>Traitement privé</strong><br />Aucun fichier ne quitte votre ordinateur.</p>
          </div>
        </aside>

        <section className="content">
          <div className="title-row">
            <div>
              <p className="eyebrow">{mode === "tri" ? "NOUVEAU TRAITEMENT" : "EXPLORATION"}</p>
              <h1>{mode === "tri" ? "Préparer les données" : "Analyser les textes"}</h1>
            </div>
            {sourceTables.length > 0 && <button className="text-button" onClick={resetAll}>Tout effacer</button>}
          </div>

          <section className="panel import-section">
            <div className="section-heading"><span>1</span><div><h2>Fichiers sources</h2><p>Classeurs Excel au format .xlsx ou .xls</p></div></div>
            <div
              className={`drop-zone ${isDragging ? "dragging" : ""}`}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <UploadCloud size={30} />
              <strong>{isImporting ? "Import en cours…" : "Déposez fichiers ou dossiers ici"}</strong>
              <span>ou</span>
              <button onClick={() => inputRef.current?.click()} disabled={isImporting}><FolderOpen size={17} /> Parcourir les fichiers</button>
              <input ref={inputRef} hidden multiple type="file" accept=".xlsx,.xls" onChange={handleInput} />
            </div>

            {importProgress && (
              <div className="import-progress">
                <strong>{importProgress.loaded}/{importProgress.total} fichiers importés</strong>
                <span>{importProgress.currentFile}</span>
                <progress value={importProgress.loaded} max={importProgress.total} />
                <small>Pour de gros volumes, l’import peut prendre quelques minutes.</small>
              </div>
            )}

            {error && <p className="error"><AlertTriangle size={16} />{error}</p>}

            {sourceTables.length > 0 && (
              <div className="file-list">
                {sourceFileNames.length > 5 ? (
                  <details className="source-dropdown">
                    <summary>{sourceFileNames.length} fichiers chargés. Afficher la liste détaillée</summary>
                    <div className="source-dropdown-list">
                      {sourceFileNames.map((fileName) => {
                        const fileTables = sourceTables.filter((table) => table.fileName === fileName);
                        const rowCount = fileTables.reduce((sum, table) => sum + table.rows.length, 0);
                        return (
                          <div className="file-row" key={fileName}>
                            <FileSpreadsheet size={20} />
                            <div>
                              <strong>{fileName}</strong>
                              <span>{fileTables.length} feuille{fileTables.length > 1 ? "s" : ""} · {rowCount.toLocaleString("fr-FR")} lignes</span>
                            </div>
                            <button className="icon-button" title="Retirer le fichier" onClick={() => removeFile(fileName)}><Trash2 size={17} /></button>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ) : (
                  sourceFileNames.map((fileName) => {
                    const fileTables = sourceTables.filter((table) => table.fileName === fileName);
                    const rowCount = fileTables.reduce((sum, table) => sum + table.rows.length, 0);
                    return (
                      <div className="file-row" key={fileName}>
                        <FileSpreadsheet size={20} />
                        <div>
                          <strong>{fileName}</strong>
                          <span>{fileTables.length} feuille{fileTables.length > 1 ? "s" : ""} · {rowCount.toLocaleString("fr-FR")} lignes</span>
                        </div>
                        <button className="icon-button" title="Retirer le fichier" onClick={() => removeFile(fileName)}><Trash2 size={17} /></button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>

          {mode === "tri" && (
            <section className={`panel columns-section ${!sourceTables.length ? "disabled" : ""}`}>
              <details className="columns-dropdown" open>
                <summary>
                  <span>Colonnes (renommage / suppression)</span>
                  <small>{sourceColumns.length} variable{sourceColumns.length > 1 ? "s" : ""}</small>
                </summary>

                <div className="config-box">
                  <label>
                    Enregistrer config colonnes
                    <div className="config-row">
                      <input
                        type="text"
                        value={columnConfigName}
                        placeholder="Nom de configuration"
                        onChange={(event) => setColumnConfigName(event.target.value)}
                      />
                      <button onClick={saveColumnConfig}><Save size={14} /> Enregistrer</button>
                    </div>
                  </label>
                  {columnConfigs.length > 0 && (
                    <div className="saved-configs">
                      {columnConfigs.map((config) => (
                        <div key={config.id}>
                          <span>{config.name}</span>
                          <div>
                            <button onClick={() => loadColumnConfig(config.id)}>Charger</button>
                            <button onClick={() => deleteColumnConfig(config.id)}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="columns-list">
                  {sourceColumns.length === 0 && <p className="analysis-empty">Importez des fichiers pour gérer les colonnes.</p>}
                  {sourceColumns.map((column) => {
                    const edit = columnEdits[column] ?? { name: column, removed: false };
                    return (
                      <div className="column-row" key={column}>
                        <div>
                          <strong>{column}</strong>
                          <span>Nom d’origine</span>
                        </div>
                        <label>
                          Renommer en
                          <input type="text" value={edit.name} onChange={(event) => updateColumnName(column, event.target.value)} />
                        </label>
                        <button className={`column-toggle ${edit.removed ? "removed" : ""}`} onClick={() => toggleColumnRemoval(column)}>
                          {edit.removed ? "Colonne masquée" : "Colonne visible"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </details>
            </section>
          )}

          {mode === "tri" ? (
            <>
              <section className={`panel filter-section ${!triTables.length ? "disabled" : ""}`}>
                <div className="section-heading"><span>2</span><div><h2>Règles de filtrage</h2><p>Les lignes correspondantes seront supprimées</p></div></div>

                {triTables.length > 0 && missingColumns.length > 0 && (
                  <button className="warning-banner" onClick={() => setShowDifferences(true)}>
                    <AlertTriangle size={18} />
                    <span><strong>{missingColumns.length} variable{missingColumns.length > 1 ? "s" : ""} non commune{missingColumns.length > 1 ? "s" : ""}</strong><small>Consulter le détail des écarts entre feuilles</small></span>
                    <ChevronRight size={18} />
                  </button>
                )}

                <div className="config-box">
                  <label>
                    Enregistrer config de filtres
                    <div className="config-row">
                      <input
                        type="text"
                        value={filterConfigName}
                        placeholder="Nom de configuration"
                        onChange={(event) => setFilterConfigName(event.target.value)}
                      />
                      <button onClick={saveFilterConfig}><Save size={14} /> Enregistrer</button>
                    </div>
                  </label>
                  {filterConfigs.length > 0 && (
                    <div className="saved-configs">
                      {filterConfigs.map((config) => (
                        <div key={config.id}>
                          <span>{config.name}</span>
                          <div>
                            <button onClick={() => loadFilterConfig(config.id)}>Charger</button>
                            <button onClick={() => deleteFilterConfig(config.id)}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rules">
                  {rules.map((rule, index) => {
                    const terms = splitTerms(rule.terms);
                    const impacts = ruleTermImpacts.get(rule.id) ?? [];
                    const examples = ruleExamples.get(rule.id) ?? [];

                    return (
                      <div className="rule" key={rule.id}>
                        <div className="rule-top">
                          <strong>Règle {index + 1}</strong>
                          {rules.length > 1 && <button className="icon-button" title="Supprimer la règle" onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))}><X size={17} /></button>}
                        </div>

                        <div className="rule-fields">
                          <label>
                            Variable
                            <select value={rule.column} onChange={(event) => updateRule(rule.id, { column: event.target.value })}>
                              <option value="">Choisir une variable…</option>
                              {triAvailability.map((item) => (
                                <option key={item.column} value={item.column}>
                                  {item.column}{item.missingFrom.length ? ` (${item.presentIn}/${triTables.length})` : ""}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Ajouter un mot-clé à supprimer
                            <div className="term-input-row">
                              <input
                                type="text"
                                value={pendingTerms[rule.id] ?? ""}
                                placeholder="ex. paysage"
                                onChange={(event) => setPendingTerms((current) => ({ ...current, [rule.id]: event.target.value }))}
                                onKeyDown={(event) => onRuleTermKeyDown(event, rule.id)}
                              />
                              <button type="button" onClick={() => addRuleTerm(rule.id)}><Plus size={14} /> Ajouter</button>
                            </div>
                          </label>
                        </div>

                        {rule.column && (
                          <div className="rule-examples">
                            <small>Exemples dans la base :</small>
                            <div>
                              {examples.length > 0 ? examples.map((example) => <span key={example}>{example}</span>) : <span>Aucun exemple non vide trouvé</span>}
                            </div>
                          </div>
                        )}

                        <div className="term-chips">
                          {terms.length === 0 && <span className="chip-empty">Aucun mot ajouté pour l’instant.</span>}
                          {terms.map((term, termIndex) => {
                            const removedCount = impacts[termIndex]?.removedCount ?? 0;
                            return (
                              <button key={`${term}-${termIndex}`} className="term-chip" onClick={() => removeRuleTerm(rule.id, termIndex)} title="Retirer ce mot">
                                <span>{term}</span>
                                <small>{removedCount.toLocaleString("fr-FR")} ligne{removedCount > 1 ? "s" : ""}</small>
                                <X size={13} />
                              </button>
                            );
                          })}
                        </div>

                        <div className="toggles">
                          <Toggle label="Ignorer la casse" checked={!rule.caseSensitive} onChange={(checked) => updateRule(rule.id, { caseSensitive: !checked })} />
                          <Toggle label="Inclure les mots dérivés" checked={rule.matchDerivatives} onChange={(checked) => updateRule(rule.id, { matchDerivatives: checked })} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button className="add-rule" disabled={!triTables.length} onClick={() => setRules((current) => [...current, createRule()])}><Plus size={17} /> Ajouter une règle</button>
              </section>

              <section className={`export-band ${!triTables.length ? "disabled" : ""}`}>
                <div>
                  <p className="eyebrow">RÉSULTAT</p>
                  <strong>{result.rows.length.toLocaleString("fr-FR")} lignes conservées</strong>
                  <span>{result.removedCount.toLocaleString("fr-FR")} retirées sur {result.totalCount.toLocaleString("fr-FR")} · {sourceFileNames.length} fichier{sourceFileNames.length > 1 ? "s" : ""}</span>
                </div>
                <button className="export-button" disabled={!triTables.length} onClick={() => exportRows(result.rows)}><Download size={19} /> Télécharger le fichier .xlsx</button>
              </section>

              <section className={`panel post-filter-section ${!triTables.length ? "disabled" : ""}`}>
                <div className="section-heading"><span>3</span><div><h2>Mots encore présents après filtrage</h2><p>Focus sur les variables ciblées par vos règles</p></div></div>
                {postFilterColumns.length === 0 ? (
                  <p className="analysis-empty">Ajoutez au moins une règle avec une variable pour afficher ce nuage.</p>
                ) : (
                  <div className="word-cloud fancy-cloud" aria-label="Nuage de mots post-filtre">
                    {postFilterWords.map((item, index) => {
                      const max = postFilterWords[0]?.count ?? 1;
                      const ratio = item.count / max;
                      const size = 12 + ratio * 30;
                      const rotate = (index % 2 === 0 ? 1 : -1) * (index % 5);
                      return (
                        <span
                          key={item.word}
                          style={{
                            fontSize: `${size.toFixed(0)}px`,
                            opacity: 0.54 + ratio * 0.46,
                            transform: `rotate(${rotate}deg)`,
                          }}
                          title={`${item.word} (${item.count})`}
                        >
                          {item.word}
                        </span>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className={`panel analysis-section ${!sourceTables.length ? "disabled" : ""}`}>
              <div className="section-heading"><span>2</span><div><h2>Analyse textuelle</h2><p>Corpus multi-variables avec corrélations et visualisations enrichies</p></div></div>

              {sourceTables.length > 0 && missingColumns.length > 0 && (
                <button className="warning-banner" onClick={() => setShowDifferences(true)}>
                  <AlertTriangle size={18} />
                  <span><strong>{missingColumns.length} variable{missingColumns.length > 1 ? "s" : ""} non commune{missingColumns.length > 1 ? "s" : ""}</strong><small>Certaines variables peuvent être absentes selon les feuilles</small></span>
                  <ChevronRight size={18} />
                </button>
              )}

              <div className="analysis-controls">
                <label>
                  Variable à ajouter au corpus
                  <div className="term-input-row">
                    <select value={analysisColumnCandidate} onChange={(event) => setAnalysisColumnCandidate(event.target.value)}>
                      <option value="">Choisir une variable…</option>
                      {analysisAvailability.map((item) => (
                        <option key={item.column} value={item.column}>
                          {item.column}{item.missingFrom.length ? ` (${item.presentIn}/${sourceTables.length})` : ""}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={addAnalysisColumn}><Plus size={14} /> Ajouter</button>
                  </div>
                </label>

                <label>
                  Taille minimale des mots
                  <input type="number" min={1} max={20} value={analysisMinLength} onChange={(event) => setAnalysisMinLength(Math.max(1, Number(event.target.value) || 1))} />
                </label>

                <label>
                  Nombre de mots max
                  <input type="number" min={5} max={250} value={analysisTopN} onChange={(event) => setAnalysisTopN(Math.max(5, Number(event.target.value) || 5))} />
                </label>

                <div className="analysis-toggle">
                  <Toggle label="Sensibilité à la casse" checked={analysisCaseSensitive} onChange={(checked) => setAnalysisCaseSensitive(checked)} />
                </div>
              </div>

              <div className="term-chips analysis-chips">
                {analysisColumns.length === 0 && <span className="chip-empty">Aucune variable sélectionnée pour le corpus.</span>}
                {analysisColumns.map((column) => (
                  <button key={column} className="term-chip" onClick={() => removeAnalysisColumn(column)} title="Retirer la variable">
                    <span>{column}</span>
                    <X size={13} />
                  </button>
                ))}
              </div>

              <div className="analysis-actions">
                <button className="analysis-run" disabled={!sourceTables.length || analysisColumns.length === 0} onClick={runAnalysis}>Lancer l’analyse</button>
                <small>Les stop words français sont automatiquement exclus des résultats.</small>
              </div>

              {analysisNeedsRun && <p className="analysis-empty">Cliquez sur « Lancer l’analyse » pour calculer les visualisations et corrélations.</p>}

              {!analysisNeedsRun && analysis && analysis.words.length > 0 && (
                <>
                  <div className="analysis-kpis">
                    <div><small>Lignes analysées</small><strong>{analysis.rowsWithAnyColumn.toLocaleString("fr-FR")}</strong></div>
                    <div><small>Cellules non vides</small><strong>{analysis.nonEmptyCells.toLocaleString("fr-FR")}</strong></div>
                    <div><small>Occurrences (top mots)</small><strong>{analysis.totalOccurrences.toLocaleString("fr-FR")}</strong></div>
                    <div><small>Vocabulaire total</small><strong>{analysis.uniqueWordCount.toLocaleString("fr-FR")}</strong></div>
                  </div>

                  <div className="analysis-grid analysis-grid-rich">
                    <article className="viz-card">
                      <h3><Cloud size={18} /> Nuage de mots pondéré</h3>
                      <div className="word-cloud fancy-cloud" aria-label="Nuage de mots">
                        {analysis.words.map((item, index) => {
                          const ratio = analysis.maxCount ? item.count / analysis.maxCount : 0;
                          const size = 13 + ratio * 32;
                          const rotate = (index % 2 === 0 ? 1 : -1) * (index % 6);
                          return (
                            <span
                              key={item.word}
                              style={{
                                fontSize: `${size.toFixed(0)}px`,
                                opacity: 0.52 + ratio * 0.48,
                                transform: `rotate(${rotate}deg)`,
                              }}
                              title={`${item.word} (${item.count})`}
                            >
                              {item.word}
                            </span>
                          );
                        })}
                      </div>
                    </article>

                    <article className="viz-card">
                      <h3><BarChart3 size={18} /> Top mots (fréquence)</h3>
                      <div className="bars" aria-label="Histogramme des mots">
                        {analysis.words.slice(0, 18).map((item) => {
                          const width = analysis.maxCount ? (item.count / analysis.maxCount) * 100 : 0;
                          return (
                            <div className="bar-row" key={item.word}>
                              <span>{item.word}</span>
                              <div className="bar-track"><div className="bar-fill" style={{ width: `${width}%` }} /></div>
                              <strong>{item.count.toLocaleString("fr-FR")}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </article>

                    <article className="viz-card">
                      <h3><Sigma size={18} /> Bigrams les plus fréquents</h3>
                      <div className="mini-list">
                        {analysis.bigrams.length === 0 && <p>Aucun bigram détecté.</p>}
                        {analysis.bigrams.map((item) => <div key={item.word}><span>{item.word}</span><strong>{item.count}</strong></div>)}
                      </div>
                    </article>

                    <article className="viz-card">
                      <h3><Link2 size={18} /> Corrélations de mots</h3>
                      <div className="mini-list">
                        {analysis.wordCorrelations.length === 0 && <p>Pas assez de cooccurrences mesurables.</p>}
                        {analysis.wordCorrelations.map((pair) => <div key={`${pair.left}-${pair.right}`}><span>{pair.left} + {pair.right}</span><strong>{pair.count}</strong></div>)}
                      </div>
                    </article>
                  </div>

                  <div className="analysis-grid">
                    <article className="viz-card">
                      <h3>Contribution par variable du corpus</h3>
                      <div className="mini-list">
                        {analysis.columnStats.map((stat) => (
                          <div key={stat.column}>
                            <span>{stat.column}</span>
                            <strong>{stat.tokenCount.toLocaleString("fr-FR")} tokens</strong>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="viz-card">
                      <h3>Corrélation entre variables</h3>
                      <div className="mini-list">
                        {analysis.variableCorrelations.length === 0 && <p>Sélectionnez au moins 2 variables avec du texte.</p>}
                        {analysis.variableCorrelations.map((corr) => (
                          <div key={`${corr.left}-${corr.right}`}>
                            <span>{corr.left} ↔ {corr.right}</span>
                            <strong>{corr.score}%</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>
                </>
              )}

              {!analysisNeedsRun && analysis && analysis.words.length === 0 && (
                <p className="analysis-empty">Aucun mot exploitable trouvé. Vérifiez les variables choisies ou la longueur minimale des mots.</p>
              )}
            </section>
          )}
        </section>
      </div>

      {showDifferences && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowDifferences(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="differences-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">CONTRÔLE DES COLONNES</p>
                <h2 id="differences-title">Variables non communes</h2>
              </div>
              <button className="icon-button" title="Fermer" onClick={() => setShowDifferences(false)}><X size={20} /></button>
            </div>
            <p>Ces variables ne sont pas présentes dans toutes les feuilles importées.</p>
            <div className="differences-list">
              {missingColumns.map((item) => (
                <details key={item.column}>
                  <summary><span>{item.column}</span><small>{item.presentIn} sur {mode === "tri" ? triTables.length : sourceTables.length} feuilles</small></summary>
                  <ul>{item.missingFrom.map((source) => <li key={source}>{source}</li>)}</ul>
                </details>
              ))}
            </div>
            <button className="modal-action" onClick={() => setShowDifferences(false)}>J’ai compris</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Step({ number, title, active, done }: { number: string; title: string; active: boolean; done: boolean }) {
  return <div className={`step ${active ? "active" : ""}`}><span>{done ? <Check size={15} /> : number}</span><strong>{title}</strong></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" /><strong>{label}</strong></label>;
}

async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return new Promise((resolve) => (entry as FileEntry).file((file) => resolve([file])));
  if (!entry.isDirectory) return [];
  const reader = (entry as DirectoryEntry).createReader();
  const entries: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve));
    if (!batch.length) break;
    entries.push(...batch);
  }
  return (await Promise.all(entries.map(readEntry))).flat();
}
