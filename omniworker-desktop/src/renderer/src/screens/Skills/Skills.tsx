import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Download, Trash, Refresh, Plus, Upload } from "../../assets/icons";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { useI18n } from "../../components/useI18n";

interface InstalledSkill {
  name: string;
  category: string;
  description: string;
  path: string;
}

interface BundledSkill {
  name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
}

interface SkillsProps {
  profile?: string;
}

type Tab = "installed" | "browse";

function Skills({ profile }: SkillsProps): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("installed");
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [bundledSkills, setBundledSkills] = useState<BundledSkill[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailSkill, setDetailSkill] = useState<InstalledSkill | null>(null);
  const [detailContent, setDetailContent] = useState("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState("");
  
  // Custom skills state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createError, setCreateError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);


  const loadInstalled = useCallback(async (): Promise<void> => {
    const list = await window.omniworkerAPI.listInstalledSkills(profile);
    setInstalledSkills(list);
  }, [profile]);

  const loadBundled = useCallback(async (): Promise<void> => {
    const list = await window.omniworkerAPI.listBundledSkills();
    setBundledSkills(list);
  }, []);

  const loadAll = useCallback(async (): Promise<void> => {
    setLoading(true);
    await Promise.all([loadInstalled(), loadBundled()]);
    setLoading(false);
  }, [loadInstalled, loadBundled]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleViewDetail(skill: InstalledSkill): Promise<void> {
    setDetailSkill(skill);
    const content = await window.omniworkerAPI.getSkillContent(skill.path);
    setDetailContent(content);
  }

  async function handleInstall(name: string): Promise<void> {
    setActionInProgress(name);
    setError("");
    const result = await window.omniworkerAPI.installSkill(name, profile);
    setActionInProgress(null);
    if (result.success) {
      await loadInstalled();
    } else {
      setError(result.error || t("skills.installFailed"));
    }
  }

  async function handleUninstall(name: string): Promise<void> {
    setActionInProgress(name);
    setError("");
    const result = await window.omniworkerAPI.uninstallSkill(name, profile);
    setActionInProgress(null);
    if (result.success) {
      setDetailSkill(null);
      await loadInstalled();
    } else {
      setError(result.error || t("skills.uninstallFailed"));
    }
  }

  const handleFileContent = (text: string) => {
    let name = "";
    let description = "";
    let content = text;
    
    if (text.startsWith("---")) {
      const endIdx = text.indexOf("---", 3);
      if (endIdx !== -1) {
        const frontmatter = text.slice(3, endIdx);
        content = text.slice(endIdx + 3).trim();
        
        const nameMatch = frontmatter.match(/^\s*name:\s*["']?([^"'\n]+)["']?\s*$/m);
        if (nameMatch) name = nameMatch[1].trim();
        
        const descMatch = frontmatter.match(/^\s*description:\s*["']?([^"'\n]+)["']?\s*$/m);
        if (descMatch) description = descMatch[1].trim();
      }
    } else {
      const headingMatch = text.match(/^#\s+(.+)/m);
      if (headingMatch) {
        name = headingMatch[1].trim();
      }
    }
    
    setCreateName(name);
    setCreateDescription(description);
    setCreateContent(content);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) handleFileContent(text);
    };
    reader.readAsText(file);
  };

  const handleCreateSkillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    
    if (!createName.trim()) {
      setCreateError("El nombre de la skill es obligatorio.");
      return;
    }
    if (!createContent.trim()) {
      setCreateError("Las instrucciones (contenido) de la skill son obligatorias.");
      return;
    }
    
    setActionInProgress("creating-skill");
    const result = await window.omniworkerAPI.createCustomSkill(
      createName,
      createCategory,
      createDescription,
      createContent,
      profile
    );
    setActionInProgress(null);
    
    if (result.success) {
      setIsCreateOpen(false);
      setCreateName("");
      setCreateCategory("");
      setCreateDescription("");
      setCreateContent("");
      await loadInstalled();
    } else {
      setCreateError(result.error || "Ocurrió un error al crear la skill.");
    }
  };


  const installedNames = new Set(
    installedSkills.map((s) => s.name.toLowerCase()),
  );

  // Filter logic
  const filteredInstalled = installedSkills.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredBundled = bundledSkills.filter((s) => {
    let matches = true;
    if (search) {
      const q = search.toLowerCase();
      matches =
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q);
    }
    if (categoryFilter) {
      matches = matches && s.category === categoryFilter;
    }
    return matches;
  });

  const categories = Array.from(
    new Set(bundledSkills.map((s) => s.category)),
  ).sort();

  const allCategories = Array.from(
    new Set([
      ...bundledSkills.map((s) => s.category),
      ...installedSkills.map((s) => s.category)
    ])
  ).filter(Boolean).sort();


  if (loading) {
    return (
      <div className="skills-container">
        <div className="skills-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="skills-container">
      <style>{`
        .skills-upload-dropzone {
          border: 2px dashed var(--border);
          border-radius: var(--radius-md);
          padding: 20px;
          text-align: center;
          background: var(--bg-secondary);
          transition: all var(--transition);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-bottom: 20px;
          position: relative;
        }
        .skills-upload-dropzone.dragover {
          border-color: var(--accent);
          background: var(--accent-subtle);
          transform: scale(1.02);
        }
        .skills-upload-dropzone p {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }
        .skills-upload-dropzone .upload-icon {
          color: var(--text-muted);
          transition: color var(--transition);
        }
        .skills-upload-dropzone:hover .upload-icon {
          color: var(--accent);
        }
        .file-input-hidden {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }
        .skills-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }
        .skills-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .skills-form-group.full-width {
          grid-column: span 2;
        }
        .skills-form-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .skills-form-input, .skills-form-textarea {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 8px 12px;
          font-size: 13px;
          font-family: var(--font-sans);
          color: var(--text-primary);
          outline: none;
          transition: border-color var(--transition);
        }
        .skills-form-input:focus, .skills-form-textarea:focus {
          border-color: var(--border-focus);
        }
        .skills-form-textarea {
          min-height: 140px;
          resize: vertical;
          font-family: var(--font-mono, monospace);
        }
      `}</style>

      {/* Create / Upload Custom Skill Modal */}
      {isCreateOpen && (
        <div className="skills-detail-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="skills-detail" style={{ maxWidth: "680px", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="skills-detail-header">
              <div>
                <div className="skills-detail-name">Crear Nueva Skill</div>
                <div className="skills-detail-category">Añadir instrucciones personalizadas al agente</div>
              </div>
              <button className="btn-ghost" onClick={() => setIsCreateOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateSkillSubmit} className="skills-detail-content" style={{ padding: "20px", overflowY: "auto" }}>
              {createError && (
                <div className="skills-error" style={{ marginBottom: "16px" }}>
                  {createError}
                  <button type="button" className="btn-ghost" onClick={() => setCreateError("")}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Drag & Drop Zone */}
              <div 
                className={`skills-upload-dropzone ${isDragOver ? "dragover" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      const text = evt.target?.result as string;
                      if (text) handleFileContent(text);
                    };
                    reader.readAsText(file);
                  }
                }}
              >
                <Upload size={24} className="upload-icon" />
                <p>Arrastra tu archivo SKILL.md o haz clic para subir</p>
                <input 
                  type="file" 
                  accept=".md,.txt" 
                  onChange={handleFileUpload} 
                  className="file-input-hidden" 
                />
              </div>

              {/* Form Fields */}
              <div className="skills-form-grid">
                <div className="skills-form-group">
                  <label className="skills-form-label">Nombre del Skill *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="ej: mi-nuevo-skill" 
                    className="skills-form-input"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                </div>

                <div className="skills-form-group">
                  <label className="skills-form-label">Categoría</label>
                  <input 
                    type="text" 
                    placeholder="ej: web, system, dev" 
                    className="skills-form-input"
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value)}
                    list="categories-list"
                  />
                  <datalist id="categories-list">
                    {allCategories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div className="skills-form-group full-width">
                  <label className="skills-form-label">Descripción Corta</label>
                  <input 
                    type="text" 
                    placeholder="Una breve explicación de lo que hace este skill..." 
                    className="skills-form-input"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                  />
                </div>

                <div className="skills-form-group full-width">
                  <label className="skills-form-label">Instrucciones del Skill (Markdown) *</label>
                  <textarea 
                    required 
                    placeholder="# Instrucciones del Skill&#10;&#10;Cuando el usuario te pida..." 
                    className="skills-form-textarea"
                    value={createContent}
                    onChange={(e) => setCreateContent(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionInProgress === "creating-skill"}>
                  {actionInProgress === "creating-skill" ? "Guardando..." : "Guardar Skill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {detailSkill && (
        <div
          className="skills-detail-overlay"
          onClick={() => setDetailSkill(null)}
        >
          <div className="skills-detail" onClick={(e) => e.stopPropagation()}>
            <div className="skills-detail-header">
              <div>
                <div className="skills-detail-name">{detailSkill.name}</div>
                <div className="skills-detail-category">
                  {detailSkill.category}
                </div>
              </div>
              <div className="skills-detail-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleUninstall(detailSkill.name)}
                  disabled={actionInProgress === detailSkill.name}
                >
                  {actionInProgress === detailSkill.name ? (
                    t("skills.removing")
                  ) : (
                    <>
                      <Trash size={13} />
                      {t("skills.uninstall")}
                    </>
                  )}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setDetailSkill(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="skills-detail-content">
              <AgentMarkdown>{detailContent}</AgentMarkdown>
            </div>
          </div>
        </div>
      )}

      <div className="skills-header">
        <div>
          <h2 className="skills-title">{t("skills.title")}</h2>
          <p className="skills-subtitle">{t("skills.subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn btn-primary btn-sm" onClick={() => setIsCreateOpen(true)}>
            <Plus size={14} />
            Crear Skill
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setIsCreateOpen(true)}>
            <Upload size={14} />
            Importar Skill
          </button>
          <button className="btn btn-secondary btn-sm" onClick={loadAll}>
            <Refresh size={14} />
            {t("skills.refresh")}
          </button>
        </div>
      </div>


      {error && (
        <div className="skills-error">
          {error}
          <button className="btn-ghost" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="skills-tabs">
        <button
          className={`skills-tab ${tab === "installed" ? "active" : ""}`}
          onClick={() => setTab("installed")}
        >
          {t("skills.installedTab")} ({installedSkills.length})
        </button>
        <button
          className={`skills-tab ${tab === "browse" ? "active" : ""}`}
          onClick={() => setTab("browse")}
        >
          {t("skills.browseTab")} ({bundledSkills.length})
        </button>
      </div>

      {/* Search */}
      <div className="skills-search">
        <Search size={15} />
        <input
          ref={searchRef}
          className="skills-search-input"
          type="text"
          placeholder={
            tab === "installed"
              ? t("skills.filterInstalled")
              : t("skills.search")
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="btn-ghost skills-search-clear"
            onClick={() => {
              setSearch("");
              searchRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category filter pills (browse tab only) */}
      {tab === "browse" && categories.length > 0 && (
        <div className="skills-category-pills">
          <button
            className={`skills-pill ${categoryFilter === null ? "active" : ""}`}
            onClick={() => setCategoryFilter(null)}
          >
            {t("skills.all")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`skills-pill ${categoryFilter === cat ? "active" : ""}`}
              onClick={() =>
                setCategoryFilter(categoryFilter === cat ? null : cat)
              }
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {tab === "installed" ? (
        filteredInstalled.length === 0 ? (
          <div className="skills-empty">
            <p className="skills-empty-text">
              {search
                ? t("skills.noMatchingInstalled")
                : t("skills.noInstalled")}
            </p>
            <p className="skills-empty-hint">
              {search
                ? t("skills.noMatchingHint")
                : t("skills.noInstalledHint")}
            </p>
          </div>
        ) : (
          <div className="skills-grid">
            {filteredInstalled.map((skill) => (
              <button
                key={`${skill.category}/${skill.name}`}
                className="skills-card"
                onClick={() => handleViewDetail(skill)}
              >
                <div className="skills-card-category">{skill.category}</div>
                <div className="skills-card-name">{skill.name}</div>
                {skill.description && (
                  <div className="skills-card-description">
                    {skill.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        )
      ) : filteredBundled.length === 0 ? (
        <div className="skills-empty">
          <p className="skills-empty-text">{t("skills.noBrowseResults")}</p>
          <p className="skills-empty-hint">{t("skills.noBrowseResultsHint")}</p>
        </div>
      ) : (
        <div className="skills-grid">
          {filteredBundled.map((skill) => {
            const isInstalled = installedNames.has(skill.name.toLowerCase());
            const isActioning = actionInProgress === skill.name;
            return (
              <div
                key={`${skill.category}/${skill.name}`}
                className="skills-card"
              >
                <div className="skills-card-category">{skill.category}</div>
                <div className="skills-card-name">{skill.name}</div>
                {skill.description && (
                  <div className="skills-card-description">
                    {skill.description}
                  </div>
                )}
                <div className="skills-card-footer">
                  {isInstalled ? (
                    <span className="skills-card-installed-badge">
                      {t("skills.installedBadge")}
                    </span>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm skills-card-install-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstall(skill.name);
                      }}
                      disabled={isActioning}
                    >
                      {isActioning ? (
                        t("skills.installing")
                      ) : (
                        <>
                          <Download size={13} />
                          {t("skills.install")}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Skills;
