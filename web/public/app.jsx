const { useState, useEffect, useCallback, useRef } = React;

// ============================================================
// i18n
// ============================================================
const langLabels = { en: "EN", "zh-TW": "繁中", "zh-CN": "简中" };

function useI18n() {
  const [lang, setLang] = useState(localStorage.getItem("sc-lang") || "zh-TW");
  const [strings, setStrings] = useState({});
  useEffect(() => {
    const file = lang === "zh-TW" ? "zh-TW" : lang === "zh-CN" ? "zh-CN" : "en";
    fetch(`/i18n/${file}.json`).then((r) => r.json()).then(setStrings);
    localStorage.setItem("sc-lang", lang);
  }, [lang]);
  const t = useCallback((key, vars) => {
    let s = strings[key] || key;
    if (vars) Object.entries(vars).forEach(([k, v]) => (s = s.replace(`{${k}}`, v)));
    return s;
  }, [strings]);
  return { lang, setLang, t };
}

// ============================================================
// Pipeline stage definitions
// ============================================================
const STAGES = [
  { id: "collect",   num: 1, color: "#8b5cf6", icon: "📥", labelKey: "stage_collect",   descKey: "stage_collect_desc", briefKey: "stage_collect_brief" },
  { id: "distill",   num: 2, color: "#06b6d4", icon: "🧪", labelKey: "stage_distill",   descKey: "stage_distill_desc", briefKey: "stage_distill_brief" },
  { id: "traitcard", num: 3, color: "#f59e0b", icon: "🃏", labelKey: "stage_traitcard", descKey: "stage_traitcard_desc", briefKey: "stage_traitcard_brief" },
  { id: "configure", num: 4, color: "#3b82f6", icon: "⚙️", labelKey: "stage_configure", descKey: "stage_configure_desc", briefKey: "stage_configure_brief" },
  { id: "analyze",   num: 5, color: "#f97316", icon: "🔥", labelKey: "stage_analyze",   descKey: "stage_analyze_desc", briefKey: "stage_analyze_brief" },
  { id: "compile",   num: 6, color: "#22c55e", icon: "🧬", labelKey: "stage_compile",   descKey: "stage_compile_desc", briefKey: "stage_compile_brief" },
];

// ============================================================
// API
// ============================================================
const api = {
  getAgents: () => fetch("/api/agents").then(r => r.json()),
  getOpenClawAgents: () => fetch("/api/openclaw-agents").then(r => r.json()),
  getAgent: (n) => fetch(`/api/agent/${n}`).then(r => r.json()),
  createAgent: (n) => fetch("/api/agent", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({name:n}) }).then(r => r.json()),
  saveAgent: (n, yaml, inputFiles) => fetch(`/api/agent/${n}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({yaml, inputFiles}) }).then(r => r.json()),
  analyze: (n, agentId) => fetch(`/api/analyze/${n}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({agentId}) }).then(r => r.json()),
  compile: (n, agentId) => fetch(`/api/compile/${n}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({agentId}) }).then(r => r.json()),
  collect: (name, input, type, agentId) => fetch("/api/collect", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({name, input, type, agentId}) }).then(r => r.json()),
  distill: (name, agentId) => fetch(`/api/distill/${name}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({agentId}) }).then(r => r.json()),
  extractTrait: (name, agentId) => fetch(`/api/extract-trait/${name}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({agentId}) }).then(r => r.json()),
  getPipeline: () => fetch("/api/pipeline").then(r => r.json()),
  getSource: (n) => fetch(`/api/source/${n}`).then(r => r.json()),
  getReference: (n) => fetch(`/api/reference/${n}`).then(r => r.json()),
  getTraitCard: (n) => fetch(`/api/trait-card/${n}`).then(r => r.json()),
};

// ============================================================
// YAML helpers
// ============================================================
function parseTraitsFromYaml(yaml) {
  const traits = {};
  for (const name of ["warmth","dominance","openness","emotionality","agreeableness","risk_tolerance","humor","directness","analytical","protectiveness"]) {
    const m = yaml.match(new RegExp(`${name}:\\s*([0-9.]+)`));
    traits[name] = m ? parseFloat(m[1]) : 0.5;
  }
  return traits;
}
function parseDomainIconsFromYaml(yaml) {
  const icons = [];
  const re = /-\s*name:\s*(.+)\n(?:\s*reference:\s*(.+)\n)?\s*aspect:\s*(.+)\n\s*weight:\s*([0-9.]+)/g;
  let m;
  while ((m = re.exec(yaml)) !== null) icons.push({ name: m[1].trim(), reference: (m[2] || "").trim(), aspect: m[3].trim(), weight: parseFloat(m[4]) });
  return icons;
}
function updateTraitInYaml(yaml, k, v) { return yaml.replace(new RegExp(`(${k}:\\s*)[0-9.]+`), `$1${v.toFixed(2)}`); }
function updateIconWeightInYaml(yaml, iconName, v) {
  const lines = yaml.split("\n"); let inIcon = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(new RegExp(`name:\\s*${iconName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*$`))) inIcon = true;
    if (inIcon && lines[i].match(/weight:\s*[0-9.]+/)) { lines[i] = lines[i].replace(/(weight:\s*)[0-9.]+/, `$1${v.toFixed(2)}`); break; }
  }
  return lines.join("\n");
}

const BUDGET_MAX = 15000;
function deterministicScore(traits, icons, yamlLength, inputLengths) {
  const total = yamlLength + Object.values(inputLengths).reduce((a,b) => a+b, 0);
  const budgetRatio = total / BUDGET_MAX;
  const sections = [];
  for (const [file, len] of Object.entries(inputLengths)) {
    const avgW = icons.length > 0 ? icons.reduce((s,ic) => s+ic.weight, 0) / icons.length : 0.5;
    let score = Math.round(avgW * 60 + (1 - budgetRatio) * 40);
    score = Math.max(0, Math.min(100, score));
    sections.push({ id: file, source: "input", filename: file, title: file, content: "", score, status: score < 45 ? "remove" : score <= 55 ? "conflict" : "append", reason: `Budget ${Math.round(budgetRatio*100)}%` });
  }
  return sections;
}

// ============================================================
// Components — Shared
// ============================================================
function Toast({ message }) { return message ? <div className="toast">{message}</div> : null; }

function NewAgentModal({ t, onClose, onCreate }) {
  const [name, setName] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const go = () => { const c = name.trim().toLowerCase(); if (c && /^[a-z0-9_-]+$/.test(c)) onCreate(c); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{t("new_agent")}</h3>
        <input ref={ref} type="text" placeholder={t("agent_name_placeholder")} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key==="Enter" && go()} />
        <div className="modal-actions">
          <button className="btn-save" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-new" onClick={go}>{t("create")}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Pipeline Flow Diagram (HTML/CSS, interactive)
// ============================================================
function PipelineFlow({ t, activeStage, onStageClick, pipeline }) {
  return (
    <div className="pipeline-flow">
      <div className="pipeline-stages">
        {STAGES.map((s, i) => {
          const isActive = activeStage === s.id;
          const count = s.id === "collect" ? pipeline?.sources?.length || 0
            : s.id === "distill" ? pipeline?.references?.length || 0
            : s.id === "traitcard" ? pipeline?.traitCards?.length || 0
            : s.id === "configure" ? pipeline?.agents?.length || 0
            : null;
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <div className="pipeline-arrow">→</div>}
              <div
                className={`pipeline-stage ${isActive ? "active" : ""}`}
                style={{ "--stage-color": s.color }}
                onClick={() => onStageClick(s.id)}
              >
                <div className="stage-num-badge" style={{ background: s.color }}>{s.num}</div>
                <div className="stage-icon">{s.icon}</div>
                <div className="stage-label">{t(s.labelKey)}</div>
                <div className="stage-desc">{t(s.descKey)}</div>
                {count !== null && <div className="stage-count">{count}</div>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="pipeline-formula-visual">
        {STAGES.map((s, i) => (
          <React.Fragment key={s.id}>
            {i > 0 && <span className="formula-arrow">→</span>}
            <span className="formula-node" style={{ "--node-color": s.color }}>
              <span className="formula-node-num">{s.num}</span>
              <span className="formula-node-label">{t(s.labelKey)}</span>
            </span>
          </React.Fragment>
        ))}
        <span className="formula-equals">=</span>
        <span className="formula-result">TRUE_SOUL.md</span>
      </div>
    </div>
  );
}

// ============================================================
// Stage Views — Collect (Sources)
// ============================================================
function SourcesView({ t, pipeline, selectedLLM, onPipelineRefresh }) {
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [collectMode, setCollectMode] = useState("name"); // name | url | paste
  const [collectName, setCollectName] = useState("");
  const [collectInput, setCollectInput] = useState("");
  const [collecting, setCollecting] = useState(false);

  const loadSource = async (name) => {
    setSelected(name);
    const data = await api.getSource(name);
    setDetail(data);
  };

  const handleCollect = async () => {
    if (!collectName.trim() || !collectInput.trim() || !selectedLLM) return;
    setCollecting(true);
    try {
      const res = await api.collect(collectName, collectInput, collectMode, selectedLLM);
      if (res.ok) {
        setCollectName(""); setCollectInput("");
        onPipelineRefresh();
        loadSource(res.name);
      }
    } finally { setCollecting(false); }
  };

  return (
    <div className="stage-view">
      <div className="stage-view-header">
        <h3>{t("stage_collect")} — {t("sources_title")}</h3>
        <span className="stage-view-hint">{t("sources_hint")}</span>
      </div>
      <div className="stage-view-body">
        <div className="item-list">
          {/* Collect form */}
          <div className="collect-form">
            <div className="collect-mode-toggle">
              {["name","url","paste"].map(m => (
                <button key={m} className={collectMode===m?"active":""} onClick={() => setCollectMode(m)}>{t(`collect_${m}`)}</button>
              ))}
            </div>
            <input type="text" className="collect-name-input" placeholder={t("collect_name_placeholder")} value={collectName} onChange={e => setCollectName(e.target.value)} />
            {collectMode === "paste" ? (
              <textarea className="collect-input" placeholder={t("collect_paste_placeholder")} value={collectInput} onChange={e => setCollectInput(e.target.value)} rows={6} />
            ) : (
              <input type="text" className="collect-input-single" placeholder={collectMode === "url" ? t("collect_url_placeholder") : t("collect_search_placeholder")} value={collectInput} onChange={e => setCollectInput(e.target.value)} />
            )}
            <button className="btn-collect" onClick={handleCollect} disabled={collecting || !selectedLLM || !collectName.trim() || !collectInput.trim()}>
              {collecting ? t("collecting") : `📥 ${t("collect_go")}`}
            </button>
            {!selectedLLM && <div className="collect-warn">{t("collect_need_llm")}</div>}
          </div>

          <div className="item-list-divider">{t("existing_sources")}</div>

          {(pipeline?.sources || []).map((s) => (
            <div key={s.name} className={`item-card ${selected === s.name ? "selected" : ""}`} onClick={() => loadSource(s.name)}>
              <span className="item-icon">📥</span>
              <span className="item-name">{s.name}</span>
              <span className="item-meta">{s.files.length} files</span>
            </div>
          ))}
          {(pipeline?.sources || []).length === 0 && <div className="item-empty">{t("no_sources")}</div>}
        </div>
        <div className="item-detail">
          {detail ? (
            <div>
              <h4>{detail.name}</h4>
              {Object.entries(detail.files || {}).map(([f, content]) => (
                <div key={f} className="file-card">
                  <div className="file-card-header"><span className="file-card-name">{f}</span><span className="file-card-size">{content.length.toLocaleString()} chars</span></div>
                  <pre className="source-preview">{content.slice(0, 2000)}{content.length > 2000 ? "\n..." : ""}</pre>
                </div>
              ))}
            </div>
          ) : <div className="item-empty">{t("select_to_view")}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Stage Views — Distill (References)
// ============================================================
function ReferencesView({ t, pipeline, selectedLLM, onPipelineRefresh }) {
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState("");
  const [distilling, setDistilling] = useState(null);

  const loadRef = async (name) => {
    setSelected(name);
    const data = await api.getReference(name);
    setContent(data.content || "");
  };

  const handleDistill = async (sourceName) => {
    if (!selectedLLM) return;
    setDistilling(sourceName);
    try {
      const res = await api.distill(sourceName, selectedLLM);
      if (res.ok) { onPipelineRefresh(); loadRef(res.name); }
    } finally { setDistilling(null); }
  };

  // Sources that don't have a reference yet
  const existingRefNames = (pipeline?.references || []).map(r => r.name);
  const undistilled = (pipeline?.sources || []).filter(s => !existingRefNames.includes(s.name));

  return (
    <div className="stage-view">
      <div className="stage-view-header">
        <h3>{t("stage_distill")} — {t("references_title")}</h3>
        <span className="stage-view-hint">{t("references_hint")}</span>
      </div>
      <div className="stage-view-body">
        <div className="item-list">
          {undistilled.length > 0 && (
            <React.Fragment>
              <div className="item-list-divider">{t("needs_distill")}</div>
              {undistilled.map(s => (
                <div key={s.name} className="item-card pending">
                  <span className="item-icon">⏳</span>
                  <span className="item-name">{s.name}</span>
                  <button className="btn-mini-action" onClick={() => handleDistill(s.name)} disabled={distilling===s.name || !selectedLLM}>
                    {distilling===s.name ? "..." : "🧪"}
                  </button>
                </div>
              ))}
              <div className="item-list-divider">{t("existing_refs")}</div>
            </React.Fragment>
          )}
          {(pipeline?.references || []).map((r) => (
            <div key={r.name} className={`item-card ${selected === r.name ? "selected" : ""}`} onClick={() => loadRef(r.name)}>
              <span className="item-icon">🧪</span>
              <span className="item-name">{r.name}</span>
              <span className="item-meta">{r.lines}L / {r.chars.toLocaleString()}c</span>
            </div>
          ))}
        </div>
        <div className="item-detail">
          {content ? <pre className="source-preview">{content}</pre> : <div className="item-empty">{t("select_to_view")}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Stage Views — Trait Cards
// ============================================================
function TraitCardsView({ t, pipeline, selectedLLM, onPipelineRefresh }) {
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState("");
  const [extracting, setExtracting] = useState(null);

  const loadCard = async (name) => {
    setSelected(name);
    const data = await api.getTraitCard(name);
    setContent(data.content || "");
  };

  const handleExtract = async (refName) => {
    if (!selectedLLM) return;
    setExtracting(refName);
    try {
      const res = await api.extractTrait(refName, selectedLLM);
      if (res.ok) { onPipelineRefresh(); loadCard(res.name); }
    } finally { setExtracting(null); }
  };

  const existingCardNames = (pipeline?.traitCards || []).map(tc => tc.name);
  const unextracted = (pipeline?.references || []).filter(r => !existingCardNames.includes(r.name));

  return (
    <div className="stage-view">
      <div className="stage-view-header">
        <h3>{t("stage_traitcard")} — {t("traitcards_title")}</h3>
        <span className="stage-view-hint">{t("traitcards_hint")}</span>
      </div>
      <div className="stage-view-body">
        <div className="item-list">
          {unextracted.length > 0 && (
            <React.Fragment>
              <div className="item-list-divider">{t("needs_extract")}</div>
              {unextracted.map(r => (
                <div key={r.name} className="item-card pending">
                  <span className="item-icon">⏳</span>
                  <span className="item-name">{r.name}</span>
                  <button className="btn-mini-action" onClick={() => handleExtract(r.name)} disabled={extracting===r.name || !selectedLLM}>
                    {extracting===r.name ? "..." : "🃏"}
                  </button>
                </div>
              ))}
              <div className="item-list-divider">{t("existing_cards")}</div>
            </React.Fragment>
          )}
          {(pipeline?.traitCards || []).map((tc) => (
            <div key={tc.name} className={`item-card ${selected === tc.name ? "selected" : ""}`} onClick={() => loadCard(tc.name)}>
              <span className="item-icon">🃏</span>
              <span className="item-name">{tc.name}</span>
              <span className="item-meta">{tc.chars.toLocaleString()}c</span>
            </div>
          ))}
        </div>
        <div className="item-detail">
          {content ? <pre className="source-preview">{content}</pre> : <div className="item-empty">{t("select_to_view")}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Stage Views — Configure (Sliders + YAML Editor)
// ============================================================
function SliderPanel({ t, traits, icons, onTraitChange, onIconWeightChange }) {
  const traitKeys = ["warmth","dominance","openness","emotionality","agreeableness","risk_tolerance","humor","directness","analytical","protectiveness"];
  return (
    <div className="sidebar">
      <div className="slider-group">
        <h3>{t("traits")}</h3>
        <div className="section-hint">{t("hint_traits")}</div>
        {traitKeys.map(k => (
          <div className="slider-row" key={k}>
            <span className="slider-label">{t(`trait_${k}`)}</span>
            <input type="range" min="0" max="1" step="0.05" value={traits[k]||0.5} onChange={e => onTraitChange(k, parseFloat(e.target.value))} />
            <span className="slider-value">{(traits[k]||0.5).toFixed(2)}</span>
          </div>
        ))}
      </div>
      {icons.length > 0 && (
        <div className="slider-group">
          <h3>{t("domain_icons")}</h3>
          <div className="section-hint">{t("hint_icons")}</div>
          {icons.map((ic, i) => (
            <div className="icon-row" key={i} title={ic.aspect}>
              <span className="icon-name">{ic.name}</span>
              <input type="range" min="0" max="1" step="0.05" value={ic.weight} onChange={e => onIconWeightChange(ic.name, parseFloat(e.target.value))} />
              <span className="slider-value">{ic.weight.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetBar({ t, yaml, inputFiles }) {
  const yamlLen = yaml?.length || 0;
  const inputLen = Object.values(inputFiles || {}).reduce((s,c) => s + c.length, 0);
  const total = yamlLen + inputLen;
  const pct = Math.min((total / BUDGET_MAX) * 100, 100);
  return (
    <div className="budget-bar">
      <span className="budget-label">{t("budget_label")}: {t("budget_chars", { used: total.toLocaleString(), max: BUDGET_MAX.toLocaleString() })}</span>
      <div className="budget-track">
        <div className="budget-fill" style={{ width: `${pct}%`, background: pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--yellow)' : 'var(--green)' }} />
      </div>
      <span className="budget-breakdown">YAML: {yamlLen.toLocaleString()} + Input: {inputLen.toLocaleString()}</span>
    </div>
  );
}

function SectionCard({ section, t, onAccept, onReject }) {
  return (
    <div className={`section-card ${section.status}`}>
      <span className={`section-badge ${section.status}`}>{t(`status_${section.status}`)}</span>
      <span className="section-score">{section.score}</span>
      <div className="section-title">{section.title}</div>
      <div className="section-source">{section.source} {section.filename ? `— ${section.filename}` : ""}</div>
      {section.content && <pre style={{ fontSize: "12px", whiteSpace: "pre-wrap", marginTop: "8px", color: "var(--text)" }}>{section.content.slice(0, 500)}{section.content.length > 500 ? "..." : ""}</pre>}
      {section.reason && <div className="section-reason">{section.reason}</div>}
      {section.status === "conflict" && (
        <div className="section-actions">
          <button className="btn-accept" onClick={() => onAccept(section.id)}>Accept</button>
          <button className="btn-reject" onClick={() => onReject(section.id)}>Reject</button>
        </div>
      )}
    </div>
  );
}

function FileCards({ files, onChange }) {
  const [expanded, setExpanded] = useState({});
  return (
    <div className="file-list">
      {Object.entries(files).map(([filename, content]) => (
        <div className="file-card" key={filename}>
          <div className="file-card-header" onClick={() => setExpanded(p => ({...p, [filename]: !p[filename]}))}>
            <span className="file-card-name">{filename}</span>
            <span className="file-card-size">{content.length.toLocaleString()} chars</span>
            <span className="file-card-toggle">{expanded[filename] ? "▼" : "▶"}</span>
          </div>
          {expanded[filename] && <div className="file-card-body"><textarea value={content} onChange={e => onChange(filename, e.target.value)} /></div>}
        </div>
      ))}
    </div>
  );
}

function ConfigureView({ t, currentAgent, yaml, setYaml, inputFiles, setInputFiles, exampleFiles, setExampleFiles, compiled, traits, icons, sections, setSections, selectedLLM, loading, setLoading, showToast, setCompiled, onTraitChange, onIconWeightChange, onSave }) {
  const [tab, setTab] = useState("yaml");
  const tokenEstimate = Math.round((yaml.length + Object.values(inputFiles).reduce((s,c) => s + c.length, 0)) / 4);

  const handleAnalyze = async () => {
    if (!currentAgent || !selectedLLM) return;
    setLoading("analyze");
    try {
      const res = await api.analyze(currentAgent, selectedLLM);
      const data = Array.isArray(res) ? res : res.sections;
      if (data) { setSections(data); setTab("preview"); }
    } finally { setLoading(""); }
  };

  const handleCompile = async () => {
    if (!currentAgent || !selectedLLM) return;
    setLoading("compile");
    try {
      const res = await api.compile(currentAgent, selectedLLM);
      if (res.compiled) { setCompiled(res.compiled); setTab("compiled"); showToast(t("compiled_success")); }
    } finally { setLoading(""); }
  };

  const tabHints = {
    yaml: t("hint_tab_yaml"), input: t("hint_tab_input"), examples: t("hint_tab_examples"),
    preview: t("hint_tab_preview"), compiled: t("hint_tab_compiled"),
  };

  if (!currentAgent) {
    return <div className="empty-state"><div className="dna-icon">⚙️</div><div>{t("no_agent")}</div></div>;
  }

  return (
    <div className="configure-layout">
      <SliderPanel t={t} traits={traits} icons={icons} onTraitChange={onTraitChange} onIconWeightChange={onIconWeightChange} />
      <div className="editor-area">
        <BudgetBar t={t} yaml={yaml} inputFiles={inputFiles} />
        <div className="tabs">
          {["yaml","input","examples","preview","compiled"].map(id => (
            <div key={id} className={`tab ${tab===id?"active":""}`} onClick={() => setTab(id)} title={tabHints[id]}>{t(`tab_${id}`)}</div>
          ))}
        </div>
        <div className="tab-hint-bar"><span>{tabHints[tab]}</span></div>
        <div className="editor-content">
          {tab === "yaml" && <textarea className="yaml-editor" value={yaml} onChange={e => setYaml(e.target.value)} spellCheck={false} />}
          {tab === "input" && <FileCards files={inputFiles} onChange={(f,c) => setInputFiles(p => ({...p,[f]:c}))} />}
          {tab === "examples" && <FileCards files={exampleFiles} onChange={(f,c) => setExampleFiles(p => ({...p,[f]:c}))} />}
          {tab === "preview" && (
            sections.length === 0
              ? <div className="empty-state"><div className="dna-icon">🔥</div><div>{t("hint_preview_empty")}</div></div>
              : sections.map(s => <SectionCard key={s.id} section={s} t={t} onAccept={id => setSections(p => p.map(x => x.id===id?{...x,status:"append",score:80}:x))} onReject={id => setSections(p => p.map(x => x.id===id?{...x,status:"remove",score:10}:x))} />)
          )}
          {tab === "compiled" && (compiled ? <div className="compiled-view">{compiled}</div> : <div className="empty-state"><div className="dna-icon">🧬</div><div>{t("hint_compiled_empty")}</div></div>)}
        </div>
        <div className="action-bar">
          <button className="btn-save" onClick={onSave}>{t("save")}</button>
          <span className="cost-hint">~{tokenEstimate.toLocaleString()} tokens</span>
          <button className="btn-fire" onClick={handleAnalyze} disabled={!!loading||!selectedLLM}>🔥 {loading==="analyze"?t("analyzing"):t("analyze")}</button>
          <button className="btn-compile" onClick={handleCompile} disabled={!!loading||!selectedLLM}>{loading==="compile"?t("compiling"):t("compile")}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// App
// ============================================================
function App() {
  const { lang, setLang, t } = useI18n();

  const [agents, setAgents] = useState([]);
  const [openclawAgents, setOpenclawAgents] = useState([]);
  const [currentAgent, setCurrentAgent] = useState(null);
  const [selectedLLM, setSelectedLLM] = useState("");
  const [pipeline, setPipeline] = useState(null);

  const [yaml, setYaml] = useState("");
  const [inputFiles, setInputFiles] = useState({});
  const [exampleFiles, setExampleFiles] = useState({});
  const [compiled, setCompiled] = useState("");
  const [traits, setTraits] = useState({});
  const [icons, setIcons] = useState([]);
  const [sections, setSections] = useState([]);

  const [activeStage, setActiveStage] = useState("configure");
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    api.getAgents().then(setAgents);
    api.getOpenClawAgents().then(a => { setOpenclawAgents(a); if (a.length > 0) setSelectedLLM(a[0].id); });
    api.getPipeline().then(setPipeline);
  }, []);

  useEffect(() => {
    if (!yaml) return;
    setTraits(parseTraitsFromYaml(yaml));
    setIcons(parseDomainIconsFromYaml(yaml));
  }, [yaml]);

  useEffect(() => {
    if (!currentAgent) return;
    const lens = {}; Object.entries(inputFiles).forEach(([f,c]) => lens[f] = c.length);
    setSections(deterministicScore(traits, icons, yaml.length, lens));
  }, [traits, icons, yaml, inputFiles, currentAgent]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const loadAgent = async (name) => {
    const data = await api.getAgent(name);
    if (data.error) return;
    setCurrentAgent(name);
    setYaml(data.yamlRaw);
    setInputFiles(data.inputFiles || {});
    setExampleFiles(data.exampleFiles || {});
    setCompiled(data.compiled || "");
    setSections([]);
    setActiveStage("configure");
  };

  const createAgent = async (name) => {
    const res = await api.createAgent(name);
    if (res.ok) { setShowNewModal(false); setAgents(p => [...p, name]); loadAgent(name); }
  };

  const handleTraitChange = (k, v) => { setTraits(p => ({...p,[k]:v})); setYaml(p => updateTraitInYaml(p, k, v)); };
  const handleIconWeightChange = (n, v) => { setIcons(p => p.map(ic => ic.name===n?{...ic,weight:v}:ic)); setYaml(p => updateIconWeightInYaml(p, n, v)); };

  const handleSave = async () => {
    if (!currentAgent) return;
    await api.saveAgent(currentAgent, yaml, inputFiles);
    showToast(t("saved"));
  };

  return (
    <React.Fragment>
      {/* Top Bar — 3 equal panels */}
      <div className="topbar">
        <div className="topbar-panel">
          <div className="topbar-step-label">{t("step1_label")}</div>
          <div className="topbar-row">
            <button className="btn-new" onClick={() => setShowNewModal(true)}>+ {t("new_agent")}</button>
            <select value={currentAgent||""} onChange={e => e.target.value && loadAgent(e.target.value)}>
              <option value="">{t("select_agent")}</option>
              {agents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {currentAgent && <span className="current-agent-badge">{currentAgent}</span>}
          </div>
          <div className="topbar-hint">{t("step1_hint")}</div>
        </div>

        <div className="topbar-panel">
          <div className="topbar-step-label">{t("step2_label")}</div>
          <div className="topbar-row">
            <select value={selectedLLM} onChange={e => setSelectedLLM(e.target.value)}>
              <option value="">{t("select_llm")}</option>
              {openclawAgents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.model})</option>)}
            </select>
          </div>
          <div className="topbar-hint">{t("step2_hint")}</div>
        </div>

        <div className="topbar-panel topbar-brand">
          <span className="app-title">🧬 {t("app_title")}</span>
          <div className="lang-toggle">
            {Object.entries(langLabels).map(([code, label]) => (
              <button key={code} className={lang===code?"active":""} onClick={() => setLang(code)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline Flow */}
      <PipelineFlow t={t} activeStage={activeStage} onStageClick={setActiveStage} pipeline={pipeline} />

      {/* Stage Content */}
      <div className="main">
        {activeStage === "collect" && <SourcesView t={t} pipeline={pipeline} selectedLLM={selectedLLM} onPipelineRefresh={() => api.getPipeline().then(setPipeline)} />}
        {activeStage === "distill" && <ReferencesView t={t} pipeline={pipeline} selectedLLM={selectedLLM} onPipelineRefresh={() => api.getPipeline().then(setPipeline)} />}
        {activeStage === "traitcard" && <TraitCardsView t={t} pipeline={pipeline} selectedLLM={selectedLLM} onPipelineRefresh={() => api.getPipeline().then(setPipeline)} />}
        {(activeStage === "configure" || activeStage === "analyze" || activeStage === "compile") && (
          <ConfigureView
            t={t} currentAgent={currentAgent} yaml={yaml} setYaml={setYaml}
            inputFiles={inputFiles} setInputFiles={setInputFiles}
            exampleFiles={exampleFiles} setExampleFiles={setExampleFiles}
            compiled={compiled} traits={traits} icons={icons}
            sections={sections} setSections={setSections}
            selectedLLM={selectedLLM} loading={loading} setLoading={setLoading}
            showToast={showToast} setCompiled={setCompiled}
            onTraitChange={handleTraitChange}
            onIconWeightChange={handleIconWeightChange} onSave={handleSave}
          />
        )}
      </div>

      {showNewModal && <NewAgentModal t={t} onClose={() => setShowNewModal(false)} onCreate={createAgent} />}
      <Toast message={toast} />
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
