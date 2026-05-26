import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "../../components/useI18n";
import {
  Plus,
  Trash2 as Trash,
  RefreshCw as Refresh,
  Search,
  Clock,
  Zap,
  X,
  AlertTriangle as Alert,
  User,
  Brain,
  Globe,
  Loader2 as Spinner,
  CheckCircle,
  ChevronRight,
  Database,
  Info
} from "lucide-react";

interface MemoryEntry {
  index: number;
  content: string;
}

interface MemoryData {
  memory: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    entries: MemoryEntry[];
    charCount: number;
    charLimit: number;
  };
  user: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    charCount: number;
    charLimit: number;
  };
  stats: { totalSessions: number; totalMessages: number };
}

interface TimelineEntry {
  id: number;
  session_id: string;
  type: string;
  title: string;
  content: string;
  tool_name?: string;
  project?: string;
  scope: string;
  topic_key?: string;
  revision_count: number;
  duplicate_count: number;
  last_seen_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  is_focus?: boolean;
}

interface TimelineResult {
  focus: {
    id: number;
    title: string;
    content: string;
    type: string;
    created_at: string;
  };
  before: TimelineEntry[];
  after: TimelineEntry[];
  total_in_range: number;
}

interface ConflictRelation {
  id: number;
  sync_id: string;
  relation: string;
  judgment_status: string;
  source_id: string;
  source_title: string;
  target_id: string;
  target_title: string;
  created_at: string;
  updated_at: string;
}

interface ConflictsData {
  total: number;
  relations: ConflictRelation[];
}

interface SyncStatusData {
  enabled: boolean;
  connected_nodes?: number;
  last_sync?: string;
  address?: string;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Memory({ profile }: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"facts" | "profile" | "conflicts" | "sync">(
    "facts"
  );
  const [error, setError] = useState("");

  // FTS5 Fuzzy Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Timeline Drawer
  const [selectedTimelineObs, setSelectedTimelineObs] = useState<number | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineResult | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Conflicts Auditor
  const [conflictsData, setConflictsData] = useState<ConflictsData | null>(null);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [judgingId, setJudgingId] = useState<string | null>(null);
  const [conflictReason, setConflictReason] = useState<{ [key: string]: string }>({});

  // Sync Dashboard
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);
  const [loadingSync, setLoadingSync] = useState(false);
  const [syncActionMsg, setSyncActionMsg] = useState("");
  const [syncActionError, setSyncActionError] = useState("");

  // Legacy Entry management
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editOriginalContent, setEditOriginalContent] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // User profile editing
  const [userContent, setUserContent] = useState("");
  const [userEditing, setUserEditing] = useState(false);
  const [userSaved, setUserSaved] = useState(false);

  // Load Main Data
  const loadData = useCallback(async () => {
    try {
      const d = await window.omniworkerAPI.readMemory(profile);
      setData(d as MemoryData);
      setUserContent(d.user.content);
      setLoading(false);
    } catch (err: any) {
      setError("Failed to load memory data");
      setLoading(false);
    }
  }, [profile]);

  // Load Conflicts Data
  const loadConflicts = useCallback(async () => {
    setLoadingConflicts(true);
    try {
      const res = await window.omniworkerAPI.getConflicts();
      setConflictsData(res as ConflictsData);
    } catch (err) {
      console.error("Failed to load conflicts:", err);
    } finally {
      setLoadingConflicts(false);
    }
  }, []);

  // Load Sync Status
  const loadSyncStatus = useCallback(async () => {
    setLoadingSync(true);
    try {
      const res = await window.omniworkerAPI.getSyncStatus();
      setSyncStatus(res as SyncStatusData);
    } catch (err) {
      console.error("Failed to load sync status:", err);
    } finally {
      setLoadingSync(false);
    }
  }, []);

  // Event listener refresh ref to avoid stale closure conflicts
  const isEditingRef = useRef(false);
  useEffect(() => {
    isEditingRef.current = editingIndex !== null || userEditing || showAdd;
  }, [editingIndex, userEditing, showAdd]);

  // Initial Load
  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // Tab change reactions
  useEffect(() => {
    if (tab === "conflicts") {
      void loadConflicts();
    } else if (tab === "sync") {
      void loadSyncStatus();
    }
  }, [tab, loadConflicts, loadSyncStatus]);

  // Subscribe to real-time engram changes
  useEffect(() => {
    return window.omniworkerAPI.subscribeMemoryChanges(profile, () => {
      if (isEditingRef.current) return;
      void loadData();
      if (tab === "conflicts") void loadConflicts();
      if (tab === "sync") void loadSyncStatus();
    });
  }, [loadData, loadConflicts, loadSyncStatus, profile, tab]);

  // Debounced search logic for FTS5
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await window.omniworkerAPI.searchObservations(searchQuery);
        setSearchResults(results || []);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Legacy Add Entry
  async function handleAddEntry(): Promise<void> {
    if (!newEntry.trim()) return;
    setError("");
    const result = await window.omniworkerAPI.addMemoryEntry(
      newEntry.trim(),
      profile
    );
    if (result.success) {
      setNewEntry("");
      setShowAdd(false);
      await loadData();
    } else {
      setError(result.error || t("memory.addFailed"));
    }
  }

  // Legacy Update Entry
  async function handleSaveEdit(): Promise<void> {
    if (editingIndex === null) return;
    setError("");

    const latest = (await window.omniworkerAPI.readMemory(profile)) as MemoryData;
    const currentEntry = latest.memory.entries.find(
      (entry) => entry.index === editingIndex
    );
    if (!currentEntry || currentEntry.content !== editOriginalContent) {
      setError(`${t("memory.updateFailed")}: memory changed in the background`);
      setEditingIndex(null);
      setEditContent("");
      setEditOriginalContent("");
      setData(latest);
      setUserContent(latest.user.content);
      return;
    }

    const result = await window.omniworkerAPI.updateMemoryEntry(
      editingIndex,
      editContent.trim(),
      profile
    );
    if (result.success) {
      setEditingIndex(null);
      setEditContent("");
      setEditOriginalContent("");
      await loadData();
    } else {
      setError(result.error || t("memory.updateFailed"));
    }
  }

  // Legacy Delete Entry
  async function handleDeleteEntry(index: number): Promise<void> {
    await window.omniworkerAPI.removeMemoryEntry(index, profile);
    setConfirmDelete(null);
    await loadData();
  }

  // Legacy Save User Profile
  async function handleSaveUserProfile(): Promise<void> {
    setError("");
    const result = await window.omniworkerAPI.writeUserProfile(
      userContent,
      profile
    );
    if (result.success) {
      setUserEditing(false);
      setUserSaved(true);
      setTimeout(() => setUserSaved(false), 2000);
      await loadData();
    } else {
      setError(result.error || t("memory.saveFailed"));
    }
  }

  // Timeline inspect logic
  async function handleViewTimeline(id: number): Promise<void> {
    setSelectedTimelineObs(id);
    setLoadingTimeline(true);
    setTimelineData(null);
    try {
      const res = await window.omniworkerAPI.getTimeline(id, 5, 5);
      setTimelineData(res as TimelineResult);
    } catch (err) {
      console.error("Failed to load timeline:", err);
    } finally {
      setLoadingTimeline(false);
    }
  }

  // Conflict judgment postback
  async function handleJudgeConflict(
    syncId: string,
    relation: string
  ): Promise<void> {
    setJudgingId(syncId);
    setError("");
    try {
      const reason = conflictReason[syncId] || "User resolved conflict in dashboard";
      const res = await window.omniworkerAPI.judgeConflict(syncId, relation, reason, 1.0);
      if (res && res.success !== false) {
        // Success
        setConflictReason((prev) => {
          const next = { ...prev };
          delete next[syncId];
          return next;
        });
        await loadConflicts();
        await loadData();
      } else {
        setError("Failed to record conflict judgment.");
      }
    } catch (err: any) {
      setError(err.message || "Conflict judgment failed");
    } finally {
      setJudgingId(null);
    }
  }

  // Trigger peer-to-peer sync replay
  async function handleTriggerSync(): Promise<void> {
    setSyncActionMsg("Initiating synchronization network...");
    setSyncActionError("");
    try {
      const res = await window.omniworkerAPI.triggerSync();
      if (res && res.success !== false) {
        setSyncActionMsg("Sync finalized! All deferred transactions and conflict mutations replayed.");
        await loadSyncStatus();
      } else {
        setSyncActionError("Sync completed with errors. One or more peer connections were rejected.");
      }
    } catch (err: any) {
      setSyncActionError(err.message || "Peer synchronization failed.");
    } finally {
      setTimeout(() => setSyncActionMsg(""), 5000);
    }
  }

  if (loading || !data) {
    return (
      <div className="settings-container">
        <h1 className="settings-header">{t("memory.title")}</h1>
        <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  // Choose entries source based on search query
  const displayedEntries = searchQuery.trim()
    ? searchResults.map((r) => ({ index: r.id, content: r.content }))
    : data.memory.entries;

  return (
    <div className="settings-container" style={{ position: "relative" }}>
      {/* Custom Premium Styles Inject */}
      <style>{`
        .engram-glass-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: engramFadeIn 0.3s ease-out;
        }
        @keyframes engramFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .engram-glass-card {
          background: var(--panel-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .engram-glass-card:hover {
          border-color: var(--border-bright);
          box-shadow: var(--panel-glow), var(--glass-shadow);
        }
        .engram-glass-tabs {
          display: flex;
          gap: 6px;
          background: var(--bg-secondary);
          padding: 4px;
          border-radius: 10px;
          border: 1px solid var(--border);
          margin-bottom: 8px;
        }
        .engram-glass-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .engram-glass-tab:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        .engram-glass-tab.active {
          color: var(--accent-btn-text);
          background: var(--accent);
          box-shadow: 0 4px 12px var(--accent-subtle);
        }
        .search-row {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
        }
        .engram-search-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          flex: 1;
        }
        .engram-search-icon {
          position: absolute;
          left: 12px;
          color: var(--text-muted);
          pointer-events: none;
        }
        .engram-search-input {
          width: 100%;
          padding: 10px 16px 10px 38px;
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          transition: all 0.2s ease;
        }
        .engram-search-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-subtle);
        }
        .engram-observation-card {
          position: relative;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all 0.2s ease;
        }
        .engram-observation-card:hover {
          background: var(--bg-hover);
          border-color: var(--border-bright);
        }
        .timeline-inspect-drawer {
          position: absolute;
          top: 0;
          right: 0;
          width: 420px;
          height: 100%;
          min-height: 500px;
          background: var(--bg-elevated);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-left: 1px solid var(--border);
          border-radius: 0 12px 12px 0;
          box-shadow: var(--glass-shadow);
          z-index: 100;
          display: flex;
          flex-direction: column;
          animation: drawerSlide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes drawerSlide {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .timeline-drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: relative;
        }
        .timeline-line {
          position: absolute;
          left: 27px;
          top: 20px;
          bottom: 20px;
          width: 2px;
          background: var(--border);
          z-index: 1;
        }
        .timeline-entry-node {
          display: flex;
          gap: 16px;
          position: relative;
          z-index: 2;
        }
        .timeline-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--border);
          border: 2px solid var(--bg-primary);
          margin-top: 14px;
          flex-shrink: 0;
        }
        .timeline-dot.focus {
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          transform: scale(1.2);
        }
        .timeline-card {
          flex: 1;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
        }
        .timeline-card.focus {
          background: var(--accent-subtle);
          border-color: var(--accent);
        }
        .conflict-grid-item {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .conflict-vs-pill {
          padding: 4px 10px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.15);
          color: #ef4444;
          font-weight: 600;
          font-size: 11px;
          border-radius: 20px;
          align-self: center;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .conflict-box {
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          flex: 1;
        }
        .conflict-box-title {
          font-size: 11px;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 4px;
          font-weight: 600;
        }
        .conflict-actions-bar {
          display: flex;
          flex-direction: column;
          gap: 8px;
          border-top: 1px solid var(--border);
          padding-top: 12px;
        }
        .conflict-btn-group {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .conflict-btn {
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .conflict-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .conflict-btn.compatible:hover {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.08);
          color: #10b981;
        }
        .conflict-btn.related:hover {
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.08);
          color: #3b82f6;
        }
        .conflict-btn.conflicts:hover {
          border-color: #f97316;
          background: rgba(249, 115, 22, 0.08);
          color: #f97316;
        }
        .conflict-btn.supersedes:hover {
          border-color: #a855f7;
          background: rgba(168, 85, 247, 0.08);
          color: #a855f7;
        }
        .conflict-btn.not-conflict:hover {
          border-color: var(--text-muted);
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-primary);
        }
        .sync-pulse {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
          animation: syncIndicatorPulse 2s infinite;
          margin-right: 6px;
        }
        @keyframes syncIndicatorPulse {
          0% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }
        .sync-huge-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 28px;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          background: var(--accent);
          color: var(--accent-btn-text);
          box-shadow: var(--glass-shadow);
          transition: all 0.2s ease;
        }
        .sync-huge-btn:hover {
          transform: translateY(-2px);
          background: var(--accent-hover);
          box-shadow: var(--panel-glow);
        }
        .sync-huge-btn:disabled {
          background: var(--text-muted);
          box-shadow: none;
          cursor: not-allowed;
          transform: none;
        }
      `}</style>

      {/* Header */}
      <div className="memory-header" style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 className="settings-header" style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
            <Brain size={24} style={{ color: "var(--accent)" }} />
            {t("memory.title") || "Memory & Engrams"}
          </h1>
          <p className="memory-subtitle" style={{ fontSize: "12px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
            {t("memory.subtitle") || "System Observations & P2P Sync Hub"}
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={loadData}
          style={{ borderRadius: "50%", padding: "8px", background: "rgba(255,255,255,0.03)" }}
          title="Reload Memory Daemon"
        >
          <Refresh size={13} />
        </button>
      </div>

      {/* Split Layout Container */}
      <div className="ow-split-layout" style={{ flex: 1, minHeight: 0, display: "grid", gap: "24px" }}>
        
        {/* Left Column: Diagnostics, Stats & Storage Capacity */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", paddingRight: "4px" }}>
          
          {/* Quick Telemetry Card */}
          <div className="engram-glass-card" style={{ padding: "18px" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 14px 0", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <Database size={15} style={{ color: "var(--accent)" }} />
              Telemetry Overview
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)" }}>{data.stats.totalSessions}</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Sessions</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)" }}>{data.stats.totalMessages}</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Messages</div>
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px", padding: "12px", textAlign: "center", marginTop: "12px" }}>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--accent)" }}>{data.memory.entries.length}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Active Observations (Engrams)</div>
            </div>
          </div>

          {/* Storage capacity with modern neon progress bars */}
          <div className="engram-glass-card" style={{ padding: "18px" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 14px 0", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <Zap size={15} style={{ color: "var(--accent)" }} />
              Storage Limits
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Agent Capacity */}
              <div className="ow-capacity-widget" style={{ margin: 0, padding: 0, background: "transparent", border: "none" }}>
                <div className="ow-capacity-header" style={{ marginBottom: "6px" }}>
                  <span className="ow-capacity-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{t("memory.agentMemory")}</span>
                  <span className="ow-capacity-value" style={{ fontSize: "11px", fontWeight: "bold", color: "var(--accent)" }}>
                    {Math.min(100, Math.round((data.memory.charCount / data.memory.charLimit) * 100))}%
                  </span>
                </div>
                <div className="ow-capacity-bar-container">
                  <div
                    className="ow-capacity-bar-fill"
                    style={{
                      width: `${Math.min(100, (data.memory.charCount / data.memory.charLimit) * 100)}%`,
                      backgroundColor: "var(--accent)",
                    }}
                  />
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {data.memory.charCount.toLocaleString()} / {data.memory.charLimit.toLocaleString()} chars
                </div>
              </div>

              {/* User Profile Capacity */}
              <div className="ow-capacity-widget" style={{ margin: 0, padding: 0, background: "transparent", border: "none" }}>
                <div className="ow-capacity-header" style={{ marginBottom: "6px" }}>
                  <span className="ow-capacity-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{t("memory.userProfile")}</span>
                  <span className="ow-capacity-value" style={{ fontSize: "11px", fontWeight: "bold", color: "#a855f7" }}>
                    {Math.min(100, Math.round((data.user.charCount / data.user.charLimit) * 100))}%
                  </span>
                </div>
                <div className="ow-capacity-bar-container">
                  <div
                    className="ow-capacity-bar-fill"
                    style={{
                      width: `${Math.min(100, (data.user.charCount / data.user.charLimit) * 100)}%`,
                      backgroundColor: "#a855f7",
                      boxShadow: "0 0 8px rgba(168, 85, 247, 0.4)",
                    }}
                  />
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {data.user.charCount.toLocaleString()} / {data.user.charLimit.toLocaleString()} chars
                </div>
              </div>
            </div>
          </div>

          {/* Peer Sync Telemetry Card */}
          <div className="engram-glass-card" style={{ padding: "18px" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 12px 0", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <Globe size={15} style={{ color: "var(--accent)" }} />
              P2P Sync Telemetry
            </h3>

            {syncStatus ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div className="sync-pulse" />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {syncStatus.enabled ? "P2P Gateway Active" : "Standalone Local Mode"}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Connected Peers:</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{syncStatus.connected_nodes ?? 0} active</span>
                  </div>
                  {syncStatus.address && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "2px" }}>
                      <span style={{ color: "var(--text-muted)" }}>Node Address:</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", background: "rgba(0,0,0,0.15)", padding: "4px 6px", borderRadius: "4px", overflowX: "auto", wordBreak: "break-all" }}>{syncStatus.address}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                    <span style={{ color: "var(--text-muted)" }}>Last Cloud Sync:</span>
                    <span style={{ color: "var(--text-primary)" }}>{syncStatus.last_sync ? timeAgo(Math.floor(new Date(syncStatus.last_sync).getTime() / 1000)) : "Never"}</span>
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleTriggerSync}
                  disabled={loadingSync}
                  style={{
                    width: "100%",
                    marginTop: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "8px",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px var(--accent-subtle)"
                  }}
                >
                  <Refresh size={12} className={loadingSync ? "animate-spin" : ""} />
                  Re-Sync & Replay Queue
                </button>

                {syncActionMsg && (
                  <p style={{ fontSize: "11px", color: "var(--success)", margin: "4px 0 0 0", textAlign: "center", fontFamily: "var(--font-mono)" }}>
                    {syncActionMsg}
                  </p>
                )}
                {syncActionError && (
                  <p style={{ fontSize: "11px", color: "var(--error)", margin: "4px 0 0 0", textAlign: "center", fontFamily: "var(--font-mono)" }}>
                    {syncActionError}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", padding: "10px 0" }}>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>Daemon telemetry offline</p>
                <button className="btn btn-secondary btn-sm" onClick={loadSyncStatus} style={{ width: "100%", fontSize: "11px" }}>
                  Connect Telemetry
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Search + Glass Tabs + Active Tab Workspace */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          
          {/* Glass Tabs Selector */}
          <div className="engram-glass-tabs" style={{ marginBottom: "16px", flexShrink: 0 }}>
            <button
              className={`engram-glass-tab ${tab === "facts" ? "active" : ""}`}
              onClick={() => setTab("facts")}
            >
              <Brain size={14} />
              {t("memory.agentMemory") || "Observations"}
            </button>
            <button
              className={`engram-glass-tab ${tab === "profile" ? "active" : ""}`}
              onClick={() => setTab("profile")}
            >
              <User size={14} />
              {t("memory.userProfile") || "User Profile"}
            </button>
            <button
              className={`engram-glass-tab ${tab === "conflicts" ? "active" : ""}`}
              onClick={() => setTab("conflicts")}
            >
              <Alert size={14} />
              Conflicts Auditor
            </button>
            <button
              className={`engram-glass-tab ${tab === "sync" ? "active" : ""}`}
              onClick={() => setTab("sync")}
            >
              <Globe size={14} />
              Reconciliation
            </button>
          </div>

          {error && <div className="memory-error" style={{ marginBottom: 16, flexShrink: 0 }}>{error}</div>}

          {/* Main workspace panels with scroll containment */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: "4px" }}>
            
            {/* Facts Tab */}
            {tab === "facts" && (
              <div className="engram-glass-container">
                <div className="search-row">
                  <div className="engram-search-wrapper">
                    <Search className="engram-search-icon" size={16} />
                    <input
                      type="text"
                      className="engram-search-input"
                      placeholder="FTS5 Fuzzy Search observations in memory..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {isSearching && (
                      <div style={{ position: "absolute", right: 14 }}>
                        <Spinner className="animate-spin" size={14} />
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                    onClick={() => setShowAdd(!showAdd)}
                  >
                    <Plus size={14} />
                    {t("memory.addMemory")}
                  </button>
                </div>

                {/* Add Observation Form */}
                {showAdd && (
                  <div className="engram-glass-card">
                    <div className="memory-profile-header" style={{ marginBottom: 8 }}>
                      <span className="memory-profile-hint">Add structured observation to database</span>
                    </div>
                    <textarea
                      className="memory-entry-textarea"
                      value={newEntry}
                      onChange={(e) => setNewEntry(e.target.value)}
                      placeholder="Enter facts or parameters (e.g. User prefers Python for microservices)"
                      rows={3}
                      autoFocus
                    />
                    <div className="memory-entry-form-actions" style={{ marginTop: 12 }}>
                      <span className="memory-entry-chars">{newEntry.length} chars</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setShowAdd(false);
                            setNewEntry("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleAddEntry}
                          disabled={!newEntry.trim()}
                        >
                          Save Observation
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grid of Observations */}
                <div className="observations-grid">
                  {displayedEntries.length === 0 ? (
                    <div className="memory-empty" style={{ padding: 40 }}>
                      <Info size={24} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
                      <p>No matching observations found.</p>
                      <p className="memory-empty-hint">Try typing a different keyword or create an observation manually.</p>
                    </div>
                  ) : (
                    displayedEntries.map((entry) => (
                      <div key={entry.index} className="engram-observation-card">
                        {editingIndex === entry.index ? (
                          <div className="memory-entry-form" style={{ width: "100%" }}>
                            <textarea
                              className="memory-entry-textarea"
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={3}
                              autoFocus
                            />
                            <div className="memory-entry-form-actions" style={{ marginTop: 12 }}>
                              <span className="memory-entry-chars">
                                {editContent.length} chars
                              </span>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    setEditingIndex(null);
                                    setEditOriginalContent("");
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={handleSaveEdit}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="observation-card-header">
                              <span className="observation-badge badge-fact">FACT</span>
                              <span className="observation-id">ID: {entry.index}</span>
                            </div>
                            <div className="observation-content">{entry.content}</div>

                            <div className="observation-actions">
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "4px 8px",
                                  height: "auto",
                                  background: "transparent",
                                  borderColor: "rgba(255,255,255,0.08)"
                                }}
                                onClick={() => handleViewTimeline(entry.index)}
                              >
                                <Clock size={12} />
                                Timeline
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "4px 8px",
                                  height: "auto",
                                  background: "transparent",
                                  borderColor: "rgba(255,255,255,0.08)"
                                }}
                                onClick={() => {
                                  setEditingIndex(entry.index);
                                  setEditContent(entry.content);
                                  setEditOriginalContent(entry.content);
                                }}
                              >
                                Edit
                              </button>

                              {confirmDelete === entry.index ? (
                                <span className="memory-entry-confirm" style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
                                  <span style={{ fontSize: 12 }}>Confirm?</span>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    style={{ background: "var(--error)", color: "white", padding: "2px 6px", height: "auto" }}
                                    onClick={() => handleDeleteEntry(entry.index)}
                                  >
                                    Yes
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: "2px 6px", height: "auto" }}
                                    onClick={() => setConfirmDelete(null)}
                                  >
                                    No
                                  </button>
                                </span>
                              ) : (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "4px 8px",
                                    height: "auto",
                                    background: "transparent",
                                    borderColor: "rgba(255,255,255,0.08)",
                                    color: "var(--error)"
                                  }}
                                  onClick={() => setConfirmDelete(entry.index)}
                                >
                                  <Trash size={12} />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* User Profile Tab */}
            {tab === "profile" && (
              <div className="engram-glass-container">
                <div className="engram-glass-card">
                  <div className="memory-profile-header" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="memory-profile-hint">
                      {t("memory.userProfileHint") || "Structured memory of user profile and parameters"}
                    </span>
                    {userSaved && (
                      <span
                        style={{
                          color: "var(--success)",
                          fontSize: 12,
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 4
                        }}
                      >
                        <CheckCircle size={12} />
                        {t("common.saved") || "Saved"}
                      </span>
                    )}
                  </div>
                  <textarea
                    className="memory-profile-textarea"
                    value={userContent}
                    onChange={(e) => {
                      setUserContent(e.target.value);
                      setUserEditing(true);
                    }}
                    placeholder={t("memory.userProfilePlaceholder") || "Explain your technical stack or other instructions here..."}
                    rows={12}
                    style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px", padding: "12px", color: "var(--text-primary)", fontFamily: "inherit" }}
                  />
                  <div className="memory-profile-footer" style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="memory-entry-chars" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {userContent.length} / {data.user.charLimit} chars
                    </span>
                    {userEditing && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleSaveUserProfile}
                      >
                        {t("memory.saveProfile") || "Save Profile"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Conflicts Auditor Tab */}
            {tab === "conflicts" && (
              <div className="engram-glass-container">
                <div className="engram-glass-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Conflicts & Contradictions Auditor</h3>
                      <span className="memory-profile-hint">Reconcile semantic anomalies flagged by local FTS5 heuristic scanning.</span>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={loadConflicts} disabled={loadingConflicts}>
                      {loadingConflicts ? <Spinner className="animate-spin" size={12} /> : <Refresh size={12} />}
                    </button>
                  </div>

                  {loadingConflicts ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                      <Spinner className="animate-spin" size={24} style={{ color: "#6366f1" }} />
                    </div>
                  ) : !conflictsData || conflictsData.relations.length === 0 ? (
                    <div className="memory-empty" style={{ padding: 40 }}>
                      <CheckCircle size={24} style={{ color: "var(--success)", marginBottom: 8 }} />
                      <p>Zero active memory conflicts.</p>
                      <p className="memory-empty-hint">Your local observation relations are consolidated and consistent.</p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                        Pending relations: {conflictsData.total}
                      </div>
                      {conflictsData.relations.map((relation) => (
                        <div key={relation.id} className="conflict-grid-item">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)" }}>Relation ID: {relation.sync_id}</span>
                            <span className="conflict-vs-pill">{relation.relation}</span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "row", gap: 12, width: "100%" }}>
                            <div className="conflict-box">
                              <div className="conflict-box-title">Observation A</div>
                              <div style={{ fontSize: 13, lineHeight: 1.4 }}>{relation.source_title || "..."}</div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontFamily: "monospace" }}>UUID: {relation.source_id.substring(0,8)}...</div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
                            </div>

                            <div className="conflict-box">
                              <div className="conflict-box-title">Observation B</div>
                              <div style={{ fontSize: 13, lineHeight: 1.4 }}>{relation.target_title || "..."}</div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontFamily: "monospace" }}>UUID: {relation.target_id.substring(0,8)}...</div>
                            </div>
                          </div>

                          {/* Judge Actions panel */}
                          <div className="conflict-actions-bar">
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", marginBottom: 4 }}>
                              State a judgment relation to consolidate:
                            </div>

                            <input
                              type="text"
                              className="engram-search-input"
                              style={{ padding: "6px 12px", fontSize: 12, marginBottom: 8 }}
                              placeholder="Provide judgment rationale (optional)..."
                              value={conflictReason[relation.sync_id] || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setConflictReason((prev) => ({ ...prev, [relation.sync_id]: val }));
                              }}
                            />

                            <div className="conflict-btn-group">
                              <button
                                className="conflict-btn compatible"
                                onClick={() => handleJudgeConflict(relation.sync_id, "compatible")}
                                disabled={judgingId === relation.sync_id}
                              >
                                Compatible
                              </button>
                              <button
                                className="conflict-btn related"
                                onClick={() => handleJudgeConflict(relation.sync_id, "related")}
                                disabled={judgingId === relation.sync_id}
                              >
                                Related
                              </button>
                              <button
                                className="conflict-btn conflicts"
                                onClick={() => handleJudgeConflict(relation.sync_id, "conflicts_with")}
                                disabled={judgingId === relation.sync_id}
                              >
                                Conflicts With
                              </button>
                              <button
                                className="conflict-btn supersedes"
                                onClick={() => handleJudgeConflict(relation.sync_id, "supersedes")}
                                disabled={judgingId === relation.sync_id}
                              >
                                Supersedes
                              </button>
                              <button
                                className="conflict-btn not-conflict"
                                onClick={() => handleJudgeConflict(relation.sync_id, "not_conflict")}
                                disabled={judgingId === relation.sync_id}
                              >
                                Not a Conflict
                              </button>
                              {judgingId === relation.sync_id && (
                                <Spinner className="animate-spin" size={14} style={{ marginLeft: 8 }} />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sync Tab (Detailed reconciliation panel) */}
            {tab === "sync" && (
              <div className="engram-glass-container">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }} className="sync-grid">
                  
                  {/* Local nodes and synckey settings */}
                  <div className="engram-glass-card">
                    <h3 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 12px 0" }}>Local Sync Daemon</h3>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 16px 0", lineHeight: 1.4 }}>
                      Your local database utilizes transaction logging to synchronizeobservations securely among multiple workspace clients and backends.
                    </p>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div className="ow-stat-row-modern" style={{ padding: "8px 0" }}>
                        <span className="ow-stat-label-modern" style={{ fontSize: "12px" }}>Sync Status</span>
                        <span className="ow-stat-value-modern" style={{ color: "var(--success)" }}>Enabled</span>
                      </div>
                      <div className="ow-stat-row-modern" style={{ padding: "8px 0" }}>
                        <span className="ow-stat-label-modern" style={{ fontSize: "12px" }}>Replication Port</span>
                        <span className="ow-stat-value-modern">7437</span>
                      </div>
                      <div className="ow-stat-row-modern" style={{ padding: "8px 0" }}>
                        <span className="ow-stat-label-modern" style={{ fontSize: "12px" }}>Engine Engine</span>
                        <span className="ow-stat-value-modern">sqlite_fts5</span>
                      </div>
                    </div>
                  </div>

                  {/* Network parameters / peer connectivity */}
                  <div className="engram-glass-card">
                    <h3 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 12px 0" }}>Sync Broker Daemon</h3>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 16px 0", lineHeight: 1.4 }}>
                      Replay and reconcile mutations securely to guarantee eventual consistency across the connected agent network.
                    </p>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleTriggerSync}
                      disabled={loadingSync}
                      style={{ width: "100%", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                      <Refresh size={12} className={loadingSync ? "animate-spin" : ""} />
                      Trigger Manual Replay
                    </button>

                    {syncActionMsg && (
                      <p style={{ fontSize: "11px", color: "var(--success)", margin: "10px 0 0 0", fontFamily: "var(--font-mono)" }}>
                        {syncActionMsg}
                      </p>
                    )}
                  </div>

                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Slide-out Timeline inspect drawer */}
      {selectedTimelineObs !== null && (
        <div className="timeline-inspect-drawer">
          <div className="timeline-drawer-header" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={16} style={{ color: "var(--accent)" }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Observation Timeline</span>
            </div>
            <button
              className="btn-ghost"
              style={{ padding: 4, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
              onClick={() => {
                setSelectedTimelineObs(null);
                setTimelineData(null);
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="timeline-drawer-body">
            <div className="timeline-line" />

            {loadingTimeline ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Spinner className="animate-spin" size={24} style={{ color: "var(--accent)" }} />
              </div>
            ) : !timelineData ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                Failed to retrieve chronological context for observation ID: {selectedTimelineObs}
              </div>
            ) : (
              <>
                {/* 1. Older items (Timeline Result Before list) */}
                {timelineData.before &&
                  [...timelineData.before].reverse().map((entry) => (
                    <div key={entry.id} className="timeline-entry-node">
                      <div className="timeline-dot" />
                      <div className="timeline-card">
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                          <span>ID: {entry.id}</span>
                          <span>{entry.created_at ? timeAgo(Math.floor(new Date(entry.created_at).getTime() / 1000)) : ""}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{entry.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, whiteSpace: "pre-wrap" }}>{entry.content}</div>
                      </div>
                    </div>
                  ))}

                {/* 2. Anchor focus item */}
                {timelineData.focus && (
                  <div className="timeline-entry-node">
                    <div className="timeline-dot focus" />
                    <div className="timeline-card focus">
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--accent)", marginBottom: 4, fontWeight: 600 }}>
                        <span>CURRENT FOCUS (ID: {timelineData.focus.id})</span>
                        <span>Active Anchor</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>{timelineData.focus.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4, whiteSpace: "pre-wrap" }}>{timelineData.focus.content}</div>
                    </div>
                  </div>
                )}

                {/* 3. Newer items (Timeline Result After list) */}
                {timelineData.after &&
                  timelineData.after.map((entry) => (
                    <div key={entry.id} className="timeline-entry-node">
                      <div className="timeline-dot" />
                      <div className="timeline-card">
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                          <span>ID: {entry.id}</span>
                          <span>{entry.created_at ? timeAgo(Math.floor(new Date(entry.created_at).getTime() / 1000)) : ""}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{entry.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, whiteSpace: "pre-wrap" }}>{entry.content}</div>
                      </div>
                    </div>
                  ))}

                {(!timelineData.before || timelineData.before.length === 0) &&
                  (!timelineData.after || timelineData.after.length === 0) && (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                      No adjacent observations recorded in this session timeline.
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Memory;
