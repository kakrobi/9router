"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, Button, Input, Modal, Toggle } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { getCurrentLocale, onLocaleChange } from "@/i18n/runtime";
import {
  WENYAN_LOCALES,
  CAVEMAN_LEVELS,
  PONYTAIL_LEVELS,
} from "../endpoint/endpointConstants";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Helper to format large numbers
const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;

export default function TokenSaverClient() {
  const [rtkEnabled, setRtkEnabledState] = useState(true);
  const [headroomEnabled, setHeadroomEnabled] = useState(false);
  const [headroomUrl, setHeadroomUrl] = useState("http://localhost:8787");
  const [headroomStatus, setHeadroomStatus] = useState({
    installed: false,
    running: false,
    python: null,
    loading: true,
    latencyMs: null,
  });
  const [showHeadroomInstallModal, setShowHeadroomInstallModal] =
    useState(false);
  const [headroomActionLoading, setHeadroomActionLoading] = useState(false);
  const [headroomActionError, setHeadroomActionError] = useState("");
  const [cavemanEnabled, setCavemanEnabled] = useState(false);
  const [cavemanLevel, setCavemanLevel] = useState("full");
  const [ponytailEnabled, setPonytailEnabled] = useState(false);
  const [ponytailLevel, setPonytailLevel] = useState("full");
  const [locale, setLocale] = useState("en");

  // GitHub Auto-Update States
  const [githubUsername, setGithubUsername] = useState("kakrobi");
  const [githubToken, setGithubToken] = useState("");
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateStep, setUpdateStep] = useState("idle"); // "idle", "syncing", "building", "apply_ready", "applying", "complete", "failed"
  const [updateError, setUpdateError] = useState("");
  const [buildStatus, setBuildStatus] = useState(null);
  const [buildTime, setBuildTime] = useState(0);

  // Dashboard Stats States
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [chartViewMode, setChartViewMode] = useState("tokens"); // "tokens" or "cost"
  const [expandedDetail, setExpandedDetail] = useState(null); // "rtk", "headroom", "caveman", "ponytail" or null

  // Playground States
  const [playgroundText, setPlaygroundText] = useState("git diff --git a/src/index.js b/src/index.js\nindex e69de29..7a5e954 100\n--- a/src/index.js\n+++ b/src/index.js\n@@ -0,0 +1,5 @@\n+const express = require('express');\n+const app = express();\n+app.listen(3000, () => {\n+  console.log('Server is running on port 3000');\n+});");
  const [playgroundMode, setPlaygroundMode] = useState("rtk"); // "rtk" or "caveman"
  const [playgroundResult, setPlaygroundResult] = useState(null);
  const [playgroundLoading, setPlaygroundLoading] = useState(false);

  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    setLocale(getCurrentLocale());
    return onLocaleChange(() => setLocale(getCurrentLocale()));
  }, []);

  const isWenyanLocale = WENYAN_LOCALES.includes(locale);
  const visibleCavemanLevels = isWenyanLocale
    ? CAVEMAN_LEVELS
    : CAVEMAN_LEVELS.filter((lvl) => !lvl.wenyan);

  useEffect(() => {
    const current = CAVEMAN_LEVELS.find((lvl) => lvl.id === cavemanLevel);
    if (current?.wenyan && !isWenyanLocale) {
      setCavemanLevel("ultra");
      patchSetting({ cavemanLevel: "ultra" });
    }
  }, [isWenyanLocale, cavemanLevel]);

  const patchSetting = async (patch) => {
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (error) {
      console.log("Error updating setting:", error);
    }
  };

  const handleRtkEnabled = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtkEnabled: value }),
      });
      if (res.ok) {
        setRtkEnabledState(value);
        fetchStats();
      }
    } catch (error) {
      console.log("Error updating rtkEnabled:", error);
    }
  };

  const handleCavemanEnabled = (value) => {
    setCavemanEnabled(value);
    patchSetting({ cavemanEnabled: value });
    setTimeout(fetchStats, 500);
  };

  const handleHeadroomEnabled = (value) => {
    const nextUrl = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(nextUrl);
    setHeadroomEnabled(value);
    patchSetting({ headroomEnabled: value, headroomUrl: nextUrl });
    setTimeout(fetchStats, 500);
  };

  const handleHeadroomUrlBlur = async () => {
    const next = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(next);
    await patchSetting({ headroomUrl: next });
    refreshHeadroomStatus();
  };

  const refreshHeadroomStatus = useCallback(async () => {
    setHeadroomStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/headroom/status", {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      setHeadroomStatus({ ...data, loading: false });
    } catch {
      setHeadroomStatus({
        installed: false,
        running: false,
        python: null,
        loading: false,
        latencyMs: null,
      });
    }
  }, []);

  const handleHeadroomStart = useCallback(async () => {
    setHeadroomActionError("");
    setHeadroomActionLoading(true);
    try {
      const res = await fetch("/api/headroom/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start proxy");
      await refreshHeadroomStatus();
    } catch (e) {
      setHeadroomActionError(e.message);
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const handleHeadroomStop = useCallback(async () => {
    setHeadroomActionLoading(true);
    try {
      await fetch("/api/headroom/stop", { method: "POST" });
      await refreshHeadroomStatus();
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const handleCavemanLevel = (level) => {
    setCavemanLevel(level);
    patchSetting({ cavemanLevel: level });
    setTimeout(fetchStats, 500);
  };

  const handlePonytailEnabled = (value) => {
    setPonytailEnabled(value);
    patchSetting({ ponytailEnabled: value });
    setTimeout(fetchStats, 500);
  };

  const handlePonytailLevel = (level) => {
    setPonytailLevel(level);
    patchSetting({ ponytailLevel: level });
    setTimeout(fetchStats, 500);
  };

  // Trigger update flow
  const handleStartUpdate = async () => {
    setUpdateModalOpen(true);
    setUpdateStep("syncing");
    setUpdateError("");
    setBuildStatus(null);
    setBuildTime(0);

    try {
      const res = await fetch("/api/token-saver/update/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal melakukan sinkronisasi dengan GitHub.");
      }
      setUpdateStep("building");
    } catch (e) {
      setUpdateStep("failed");
      setUpdateError(e.message);
    }
  };

  // Poll for GitHub Actions build status
  useEffect(() => {
    if (updateStep !== "building") return;

    let timer;
    let secondsCounter;
    
    secondsCounter = setInterval(() => {
      setBuildTime((t) => t + 1);
    }, 1000);

    const checkBuildStatus = async () => {
      try {
        const res = await fetch("/api/token-saver/update/status");
        if (res.ok) {
          const data = await res.json();
          setBuildStatus(data);

          if (data.status === "completed") {
            clearInterval(secondsCounter);
            if (data.conclusion === "success") {
              setUpdateStep("apply_ready");
            } else {
              setUpdateStep("failed");
              setUpdateError("GitHub Actions build failed. Silakan periksa log workflow di repositori Anda.");
            }
          }
        }
      } catch (e) {
        console.error("Gagal memeriksa status build:", e);
      }
    };

    checkBuildStatus();
    timer = setInterval(checkBuildStatus, 6000);

    return () => {
      clearInterval(timer);
      clearInterval(secondsCounter);
    };
  }, [updateStep]);

  // Apply update via Watchtower
  const handleApplyUpdate = async () => {
    setUpdateStep("applying");
    setUpdateError("");

    try {
      const res = await fetch("/api/token-saver/update/apply", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memicu Watchtower.");
      }

      setTimeout(checkSystemOnline, 5000);
    } catch (e) {
      setUpdateStep("failed");
      setUpdateError(e.message);
    }
  };

  // Poll version endpoint until it returns 200 OK
  const checkSystemOnline = async (retries = 30) => {
    if (retries <= 0) {
      setUpdateStep("failed");
      setUpdateError("Sistem memakan waktu terlalu lama untuk restart. Silakan periksa status kontainer Anda secara manual.");
      return;
    }

    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHasUpdate(!!data.hasUpdate);
        setUpdateStep("complete");
      } else {
        setTimeout(() => checkSystemOnline(retries - 1), 3000);
      }
    } catch {
      setTimeout(() => checkSystemOnline(retries - 1), 3000);
    }
  };

  // Fetch Dashboard statistics
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/token-saver/stats", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Failed to fetch Token Saver stats:", e);
    } finally {
      setStatsLoading(false);
    }
  };

  // Run Playground Simulator
  const handlePlaygroundSimulate = async () => {
    if (!playgroundText.trim()) return;
    setPlaygroundLoading(true);
    try {
      const res = await fetch("/api/token-saver/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: playgroundText, mode: playgroundMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setPlaygroundResult(data);
      }
    } catch (e) {
      console.error("Simulation error:", e);
    } finally {
      setPlaygroundLoading(false);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setRtkEnabledState(data.rtkEnabled !== false);
          setHeadroomEnabled(!!data.headroomEnabled);
          setHeadroomUrl(data.headroomUrl || "http://localhost:8787");
          setCavemanEnabled(!!data.cavemanEnabled);
          setCavemanLevel(data.cavemanLevel || "full");
          setPonytailEnabled(!!data.ponytailEnabled);
          setPonytailLevel(data.ponytailLevel || "full");
          setGithubUsername(data.githubUsername || "kakrobi");
          setGithubToken(data.githubToken || "");
          refreshHeadroomStatus();
        }
      } catch {}
      
      try {
        const verRes = await fetch("/api/version");
        if (verRes.ok) {
          const verData = await verRes.json();
          setHasUpdate(!!verData.hasUpdate);
        }
      } catch {}
    };
    loadSettings();
    fetchStats();
  }, [refreshHeadroomStatus]);

  // Heatmap generation
  const heatmapData = useMemo(() => {
    if (!stats?.dailyHistory) return [];
    const items = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const match = stats.dailyHistory.find((item) => item.date === dateStr);
      items.push({
        date: dateStr,
        dayNum: d.getDate(),
        month: d.toLocaleDateString("en-US", { month: "short" }),
        savedTokens: (match?.promptSaved || 0) + (match?.completionSaved || 0),
        costSaved: match?.costSaved || 0,
      });
    }
    return items;
  }, [stats]);

  const headroomRunning = !!headroomStatus.running;
  const headroomStatusLabel = headroomStatus.loading
    ? "Checking…"
    : headroomRunning
      ? "Running"
      : headroomStatus.localUrl !== false && !headroomStatus.installed
        ? "Not installed"
        : headroomStatus.localUrl !== false
          ? "Stopped"
          : "External";
  const headroomLocalUrl = headroomStatus.localUrl !== false;
  const headroomCanStart = !!headroomStatus.canStart;
  const headroomManaged =
    headroomLocalUrl && !!headroomStatus.managedPid;

  // Active toggles count
  const activeModesCount = [
    rtkEnabled,
    headroomEnabled && headroomRunning,
    cavemanEnabled,
    ponytailEnabled,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 p-6">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-indigo-500 to-purple-500 bg-clip-text text-transparent flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-primary animate-pulse">
              bolt
            </span>
            Token Saver Dashboard
          </h1>
          <p className="text-text-muted mt-1 text-sm">
            Monitor and configure real-time context and LLM prompt optimization techniques.
          </p>
        </div>

        {/* Headroom health connection latency widget */}
        <div className="flex items-center gap-3 bg-surface-2 p-3 rounded-lg border border-border">
          <div className="relative flex h-3 w-3">
            {headroomRunning ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-3 w-3 bg-warning"></span>
            )}
          </div>
          <div className="text-xs">
            <p className="font-semibold flex items-center gap-1.5">
              Headroom Proxy
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${headroomRunning ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                {headroomStatusLabel}
              </span>
            </p>
            <p className="text-text-muted mt-0.5">
              {headroomRunning
                ? `Latency: ${headroomStatus.latencyMs !== null ? `${headroomStatus.latencyMs}ms` : "Active"}`
                : "Docker container offline"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refreshHeadroomStatus()}
            className="material-symbols-outlined text-base text-text-muted hover:text-primary transition-colors cursor-pointer select-none"
            title="Refresh Status"
          >
            refresh
          </button>
        </div>
      </div>

      {/* Update Notification Banner */}
      {hasUpdate && (
        <Card className="p-4 border border-primary/20 bg-primary/5 flex items-center justify-between flex-wrap gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-2xl">info</span>
            <div>
              <p className="font-semibold text-sm">Pembaruan Sistem Tersedia!</p>
              <p className="text-xs text-text-muted">Versi baru 9Router telah dirilis di upstream resmi.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => handleStartUpdate()}>
            Perbarui Sekarang
          </Button>
        </Card>
      )}

      {/* Stats Loading State */}
      {statsLoading && !stats ? (
        <div className="h-64 flex items-center justify-center bg-surface p-6 rounded-lg border border-border text-text-muted gap-2">
          <span className="animate-spin material-symbols-outlined text-primary">progress_activity</span>
          Analyzing database transaction logs...
        </div>
      ) : (
        <>
          {/* Key Metrics Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Savings Card */}
            <Card className="p-4 border-l-4 border-l-primary relative overflow-hidden group hover:shadow-lg transition-all">
              <div className="absolute right-2 -bottom-2 text-primary opacity-5 text-7xl font-bold select-none group-hover:scale-110 transition-transform">
                %
              </div>
              <p className="text-text-muted text-xs font-semibold uppercase tracking-wider">Total Savings</p>
              <h3 className="text-2xl font-bold mt-2 text-primary">
                {fmtTokens(stats?.summary?.totalSavedTokens || 0)}
              </h3>
              <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1.5">
                <span className="text-success font-semibold">
                  {stats?.summary?.totalActualTokens
                    ? ((stats.summary.totalSavedTokens / (stats.summary.totalActualTokens + stats.summary.totalSavedTokens)) * 100).toFixed(1)
                    : "0"}%
                </span>
                fewer total tokens used
              </p>
            </Card>

            {/* Prompt Savings Card */}
            <Card className="p-4 border-l-4 border-l-indigo-500 relative overflow-hidden group hover:shadow-lg transition-all">
              <div className="absolute right-2 -bottom-2 text-indigo-500 opacity-5 text-7xl font-bold select-none group-hover:scale-110 transition-transform">
                in
              </div>
              <p className="text-text-muted text-xs font-semibold uppercase tracking-wider">Prompt Saved (RTK & HR)</p>
              <h3 className="text-2xl font-bold mt-2 text-indigo-400">
                {fmtTokens(stats?.summary?.totalSavedPromptTokens || 0)}
              </h3>
              <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1.5">
                <span className="text-success font-semibold">
                  {stats?.summary?.totalActualPromptTokens
                    ? ((stats.summary.totalSavedPromptTokens / (stats.summary.totalActualPromptTokens + stats.summary.totalSavedPromptTokens)) * 100).toFixed(1)
                    : "0"}%
                </span>
                input prompt reduction
              </p>
            </Card>

            {/* Completion Savings Card */}
            <Card className="p-4 border-l-4 border-l-purple-500 relative overflow-hidden group hover:shadow-lg transition-all">
              <div className="absolute right-2 -bottom-2 text-purple-500 opacity-5 text-7xl font-bold select-none group-hover:scale-110 transition-transform">
                out
              </div>
              <p className="text-text-muted text-xs font-semibold uppercase tracking-wider">Completion Saved (CM & PT)</p>
              <h3 className="text-2xl font-bold mt-2 text-purple-400">
                {fmtTokens(stats?.summary?.totalSavedCompletionTokens || 0)}
              </h3>
              <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1.5">
                <span className="text-success font-semibold">
                  {stats?.summary?.totalActualCompletionTokens
                    ? ((stats.summary.totalSavedCompletionTokens / (stats.summary.totalActualCompletionTokens + stats.summary.totalSavedCompletionTokens)) * 100).toFixed(1)
                    : "0"}%
                </span>
                shorter LLM answers
              </p>
            </Card>

            {/* Financial Savings Card */}
            <Card className="p-4 border-l-4 border-l-warning relative overflow-hidden group hover:shadow-lg transition-all">
              <div className="absolute right-2 -bottom-2 text-warning opacity-5 text-7xl font-bold select-none group-hover:scale-110 transition-transform">
                $
              </div>
              <p className="text-text-muted text-xs font-semibold uppercase tracking-wider">Estimated Cost Saved</p>
              <h3 className="text-2xl font-bold mt-2 text-warning">
                {fmtCost(stats?.summary?.totalSavedCost || 0)}
              </h3>
              <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1.5">
                <span className="text-warning font-semibold">
                  {fmtCost(stats?.summary?.totalActualCost || 0)}
                </span>
                actual LLM spend
              </p>
            </Card>
          </div>

          {/* Interactive Chart and Heatmap Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Chart Area */}
            <Card className="p-4 xl:col-span-2 flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Optimization Savings Trend</h3>
                  <p className="text-xs text-text-muted">Daily token and expense reductions.</p>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-bg-subtle p-1">
                  <button
                    onClick={() => setChartViewMode("tokens")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartViewMode === "tokens" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
                  >
                    Tokens Saved
                  </button>
                  <button
                    onClick={() => setChartViewMode("cost")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartViewMode === "cost" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
                  >
                    Cost Saved (USD)
                  </button>
                </div>
              </div>

              <div className="h-60 w-full">
                {stats?.dailyHistory?.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-text-muted text-xs">
                    No savings recorded yet. Execute requests through 9Router.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats?.dailyHistory || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradPrompt" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradCompletion" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradCostSim" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.05} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 9 }}
                        tickLine={false}
                        tickFormatter={chartViewMode === "tokens" ? fmtTokens : fmtCost}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-bg)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "8px",
                          fontSize: "11px",
                        }}
                        formatter={(value, name) => {
                          if (chartViewMode === "cost") return [fmtCost(value), "Cost Saved"];
                          return [fmtTokens(value), name === "promptSaved" ? "Prompt Saved" : "Completion Saved"];
                        }}
                      />
                      {chartViewMode === "tokens" ? (
                        <>
                          <Area
                            type="monotone"
                            dataKey="promptSaved"
                            name="promptSaved"
                            stroke="#4f46e5"
                            strokeWidth={2}
                            fill="url(#gradPrompt)"
                            stackId="1"
                          />
                          <Area
                            type="monotone"
                            dataKey="completionSaved"
                            name="completionSaved"
                            stroke="#a855f7"
                            strokeWidth={2}
                            fill="url(#gradCompletion)"
                            stackId="1"
                          />
                        </>
                      ) : (
                        <Area
                          type="monotone"
                          dataKey="costSaved"
                          name="costSaved"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          fill="url(#gradCostSim)"
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Heatmap & Configurations Summary */}
            <Card className="p-4 flex flex-col gap-4 justify-between">
              <div>
                <h3 className="text-sm font-semibold">Savings Heatmap (30 Days)</h3>
                <p className="text-xs text-text-muted mb-3">Daily activity savings grid.</p>

                {/* Heatmap Grid */}
                <div className="grid grid-cols-6 gap-2">
                  {heatmapData.map((day, idx) => {
                    let bg = "bg-surface-2 border border-border/40";
                    let titleText = `${day.month} ${day.dayNum}: No savings`;
                    
                    if (day.savedTokens > 0) {
                      titleText = `${day.month} ${day.dayNum}: ${fmtTokens(day.savedTokens)} saved (${fmtCost(day.costSaved)})`;
                      if (day.savedTokens < 2000) bg = "bg-emerald-950/60 border border-emerald-900/50 text-emerald-300";
                      else if (day.savedTokens < 10000) bg = "bg-emerald-800/80 border border-emerald-700/50 text-emerald-100";
                      else if (day.savedTokens < 50000) bg = "bg-emerald-600 text-white";
                      else bg = "bg-emerald-400 text-black font-semibold";
                    }

                    return (
                      <div
                        key={idx}
                        className={`h-9 rounded flex items-center justify-center text-[10px] cursor-default transition-all hover:scale-105 ${bg}`}
                        title={titleText}
                      >
                        {day.dayNum}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Info */}
              <div className="border-t border-border pt-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-muted">Optimizations Active:</span>
                  <span className="font-semibold text-primary">{activeModesCount} / 4</span>
                </div>
                <div className="flex justify-between items-center text-xs mt-1">
                  <span className="text-text-muted">Analyzed Dataset:</span>
                  <span className="font-semibold text-text">{stats?.summary?.totalRequests || 0} API Calls</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Interactive Playground & Detail Expanders */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Token Saver Simulator (Playground) */}
            <Card className="p-4 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-semibold">Token Saver Simulator</h3>
                <p className="text-xs text-text-muted">Test optimization rules against mock payloads.</p>
              </div>

              <div className="flex gap-2 p-1 bg-bg-subtle rounded border border-border">
                <button
                  type="button"
                  onClick={() => setPlaygroundMode("rtk")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${playgroundMode === "rtk" ? "bg-surface text-primary shadow-sm" : "text-text-muted hover:text-text"}`}
                >
                  RTK (Tool Output)
                </button>
                <button
                  type="button"
                  onClick={() => setPlaygroundMode("caveman")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${playgroundMode === "caveman" ? "bg-surface text-primary shadow-sm" : "text-text-muted hover:text-text"}`}
                >
                  Caveman (Terse Text)
                </button>
              </div>

              <textarea
                value={playgroundText}
                onChange={(e) => setPlaygroundText(e.target.value)}
                className="w-full h-24 rounded border border-border p-2 bg-surface text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Enter text to compress..."
              />

              <Button
                onClick={handlePlaygroundSimulate}
                disabled={playgroundLoading}
                size="sm"
                fullWidth
              >
                {playgroundLoading ? "Running..." : "Simulate Compression"}
              </Button>

              {playgroundResult && (
                <div className="rounded border border-border bg-surface-2 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold border-b border-border pb-1">
                    <span className="text-primary flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">auto_awesome</span>
                      Results ({playgroundResult.filterName})
                    </span>
                    <span className="text-success">
                      Saved: {((playgroundResult.ratio || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-text-muted">
                    <p>Original: {playgroundResult.originalSize} chars</p>
                    <p className="text-right">Compressed: {playgroundResult.compressedSize} chars</p>
                  </div>
                  <div className="max-h-24 overflow-y-auto font-mono text-[10px] p-2 bg-black/5 dark:bg-white/5 rounded border border-border">
                    {playgroundResult.text}
                  </div>
                </div>
              )}
            </Card>

            {/* Optimization Mode Detail Explander */}
            <Card className="p-4 flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold">Tactic Detailed Metrics</h3>
                <p className="text-xs text-text-muted">Breakdown statistics for each method.</p>
              </div>

              <div className="space-y-3">
                {/* RTK details */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedDetail(expandedDetail === "rtk" ? null : "rtk")}
                    className="w-full p-3 bg-surface-2 hover:bg-bg-hover flex items-center justify-between text-xs font-semibold transition-colors"
                  >
                    <span className="flex items-center gap-2 text-indigo-400">
                      <span className="material-symbols-outlined text-sm">build_circle</span>
                      RTK Tool Output Compression
                    </span>
                    <span className="material-symbols-outlined text-base">
                      {expandedDetail === "rtk" ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                  {expandedDetail === "rtk" && (
                    <div className="p-3 bg-surface space-y-2 text-xs border-t border-border">
                      <div className="flex justify-between">
                        <span className="text-text-muted">Total Detections:</span>
                        <span className="font-semibold">{stats?.distribution?.rtk?.count || 0} hits</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Saved Tokens:</span>
                        <span className="font-semibold text-success">{fmtTokens(stats?.distribution?.rtk?.savedTokens || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Avg Compression:</span>
                        <span className="font-semibold text-primary">
                          {stats?.distribution?.rtk?.bytesBefore
                            ? `${(100 - (stats.distribution.rtk.bytesAfter / stats.distribution.rtk.bytesBefore) * 100).toFixed(1)}% characters`
                            : "0%"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Headroom details */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedDetail(expandedDetail === "headroom" ? null : "headroom")}
                    className="w-full p-3 bg-surface-2 hover:bg-bg-hover flex items-center justify-between text-xs font-semibold transition-colors"
                  >
                    <span className="flex items-center gap-2 text-primary">
                      <span className="material-symbols-outlined text-sm">layers</span>
                      Headroom Context Compressor
                    </span>
                    <span className="material-symbols-outlined text-base">
                      {expandedDetail === "headroom" ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                  {expandedDetail === "headroom" && (
                    <div className="p-3 bg-surface space-y-2 text-xs border-t border-border">
                      <div className="flex justify-between">
                        <span className="text-text-muted">Total Compressions:</span>
                        <span className="font-semibold">{stats?.distribution?.headroom?.count || 0} hits</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Saved Tokens:</span>
                        <span className="font-semibold text-success">{fmtTokens(stats?.distribution?.headroom?.savedTokens || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Phantom Savings Alerts:</span>
                        <span className={`font-semibold ${stats?.distribution?.headroom?.phantomCount > 0 ? "text-warning" : "text-success"}`}>
                          {stats?.distribution?.headroom?.phantomCount || 0} occurrences
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Caveman details */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedDetail(expandedDetail === "caveman" ? null : "caveman")}
                    className="w-full p-3 bg-surface-2 hover:bg-bg-hover flex items-center justify-between text-xs font-semibold transition-colors"
                  >
                    <span className="flex items-center gap-2 text-purple-400">
                      <span className="material-symbols-outlined text-sm">chat_bubble</span>
                      Caveman Output Minimizer
                    </span>
                    <span className="material-symbols-outlined text-base">
                      {expandedDetail === "caveman" ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                  {expandedDetail === "caveman" && (
                    <div className="p-3 bg-surface space-y-2 text-xs border-t border-border">
                      <div className="flex justify-between">
                        <span className="text-text-muted">Injections Injected:</span>
                        <span className="font-semibold">{stats?.distribution?.caveman?.count || 0} times</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Tokens Saved:</span>
                        <span className="font-semibold text-success">{fmtTokens(stats?.distribution?.caveman?.savedTokens || 0)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ponytail details */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedDetail(expandedDetail === "ponytail" ? null : "ponytail")}
                    className="w-full p-3 bg-surface-2 hover:bg-bg-hover flex items-center justify-between text-xs font-semibold transition-colors"
                  >
                    <span className="flex items-center gap-2 text-pink-400">
                      <span className="material-symbols-outlined text-sm">code</span>
                      Ponytail Senior Dev Prompt
                    </span>
                    <span className="material-symbols-outlined text-base">
                      {expandedDetail === "ponytail" ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                  {expandedDetail === "ponytail" && (
                    <div className="p-3 bg-surface space-y-2 text-xs border-t border-border">
                      <div className="flex justify-between">
                        <span className="text-text-muted">Injections Injected:</span>
                        <span className="font-semibold">{stats?.distribution?.ponytail?.count || 0} times</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Tokens Saved:</span>
                        <span className="font-semibold text-success">{fmtTokens(stats?.distribution?.ponytail?.savedTokens || 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Model Optimization Breakdown */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Optimization Efficiency by Model</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border text-text-muted font-semibold">
                    <th className="py-2">Model / Provider</th>
                    <th className="py-2 text-center">Requests</th>
                    <th className="py-2 text-right">Actual Tokens</th>
                    <th className="py-2 text-right">Saved Tokens</th>
                    <th className="py-2 text-right">Savings %</th>
                    <th className="py-2 text-right">Saved Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {stats?.modelBreakdown?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-text-muted">No model data found.</td>
                    </tr>
                  ) : (
                    stats?.modelBreakdown?.map((m, idx) => {
                      const savingsPct = m.actualTokens + m.savedTokens > 0
                        ? (m.savedTokens / (m.actualTokens + m.savedTokens) * 100).toFixed(1)
                        : "0.0";
                      return (
                        <tr key={idx} className="hover:bg-bg-hover">
                          <td className="py-2.5 font-medium">
                            {m.model}
                            <span className="text-[10px] text-text-muted ml-1.5 block md:inline font-normal">({m.provider})</span>
                          </td>
                          <td className="py-2.5 text-center">{m.requests}</td>
                          <td className="py-2.5 text-right text-text-muted">{fmtTokens(m.actualTokens)}</td>
                          <td className="py-2.5 text-right text-success font-medium">+{fmtTokens(m.savedTokens)}</td>
                          <td className="py-2.5 text-right text-primary font-semibold">{savingsPct}%</td>
                          <td className="py-2.5 text-right text-warning">{fmtCost(m.savedCost)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Recent Optimized Requests Log */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Recent Optimized Requests</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border text-text-muted font-semibold">
                    <th className="py-2">Time</th>
                    <th className="py-2">Model</th>
                    <th className="py-2">Active Optimizations</th>
                    <th className="py-2 text-right">Prompt Savings</th>
                    <th className="py-2 text-right">Completion Savings</th>
                    <th className="py-2 text-right">Estimated Cost Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {stats?.recentLogs?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-text-muted">No recent optimized requests.</td>
                    </tr>
                  ) : (
                    stats?.recentLogs?.map((log, idx) => {
                      const date = new Date(log.timestamp);
                      const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
                      return (
                        <tr key={idx} className="hover:bg-bg-hover">
                          <td className="py-2.5 text-text-muted">{timeStr}</td>
                          <td className="py-2.5 font-medium">{log.model}</td>
                          <td className="py-2.5">
                            <div className="flex gap-1.5 flex-wrap">
                              {log.activeModes.length === 0 ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-medium border bg-zinc-900/40 text-zinc-400 border-zinc-800/30">
                                  None
                                </span>
                              ) : (
                                log.activeModes.map((mode, i) => (
                                  <span
                                    key={i}
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                                      mode === "RTK"
                                        ? "bg-indigo-950/40 text-indigo-300 border-indigo-800/30"
                                        : mode === "Headroom"
                                          ? "bg-blue-950/40 text-blue-300 border-blue-800/30"
                                          : mode === "Caveman"
                                            ? "bg-purple-950/40 text-purple-300 border-purple-800/30"
                                            : "bg-pink-950/40 text-pink-300 border-pink-800/30"
                                    }`}
                                  >
                                    {mode}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 text-right text-indigo-400">
                            {log.promptTokensSaved > 0 ? `+${fmtTokens(log.promptTokensSaved)}` : "—"}
                          </td>
                          <td className="py-2.5 text-right text-purple-400">
                            {log.completionTokensSaved > 0 ? `+${fmtTokens(log.completionTokensSaved)}` : "—"}
                          </td>
                          <td className="py-2.5 text-right text-warning font-semibold">{fmtCost(log.costSaved)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Main Configuration Card (Preserved original toggles and start/stop headroom setup modal) */}
      <Card id="rtk" className="p-6">
        <h2 className="text-lg font-bold border-b border-border pb-3 mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">settings</span>
          Optimizations Configuration
        </h2>

        {/* RTK Toggle */}
        <div className="flex items-center justify-between pt-2 pb-4 border-b border-border gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">
              Compress tool output{" "}
              <a
                href="https://github.com/rtk-ai/rtk"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-normal text-primary underline hover:opacity-80"
              >
                (RTK)
              </a>
            </p>
            <p className="text-xs text-text-muted">
              git/grep/ls/tree/logs → 60-90% fewer input tokens
            </p>
          </div>
          <Toggle
            checked={rtkEnabled}
            onChange={() => handleRtkEnabled(!rtkEnabled)}
          />
        </div>

        {/* Headroom Toggle */}
        <div className="flex items-center justify-between py-4 border-b border-border gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="font-medium text-sm">
                Compress context{" "}
                <a
                  href="https://github.com/chopratejas/headroom"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-normal text-primary underline hover:opacity-80"
                >
                  (Headroom)
                </a>
              </p>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${headroomRunning ? "bg-success/15 text-success border border-success/35" : "bg-warning/15 text-warning border border-warning/35"}`}
              >
                {headroomStatusLabel}
              </span>
              <button
                type="button"
                onClick={() => setShowHeadroomInstallModal(true)}
                className="text-xs text-primary underline hover:opacity-80 font-semibold"
              >
                {headroomRunning ? "Manage" : "Setup"}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Compress prompts via /v1/compress before routing to the model
            </p>
          </div>
          <Toggle
            checked={headroomEnabled && headroomRunning}
            disabled={!headroomRunning}
            onChange={() => handleHeadroomEnabled(!headroomEnabled)}
          />
        </div>

        {/* Caveman Toggle */}
        <div className="flex items-center justify-between py-4 border-b border-border gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">
              Compress LLM output{" "}
              <a
                href="https://github.com/JuliusBrussee/caveman"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-normal text-primary underline hover:opacity-80"
              >
                (Caveman)
              </a>
            </p>
            <p className="text-xs text-text-muted">
              Terse-style system prompt → ~65% fewer output tokens (up to 87%)
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {cavemanEnabled && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  {visibleCavemanLevels.map((lvl) => (
                    <button
                      key={lvl.id}
                      onClick={() => handleCavemanLevel(lvl.id)}
                      className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                        cavemanLevel === lvl.id
                          ? "bg-primary text-white border-primary"
                          : "bg-transparent border-border text-text-muted hover:bg-bg-hover"
                      }`}
                      title={lvl.desc}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-primary">
                  {
                    CAVEMAN_LEVELS.find((lvl) => lvl.id === cavemanLevel)
                      ?.desc
                  }
                </p>
              </div>
            )}
            <Toggle
              checked={cavemanEnabled}
              onChange={() => handleCavemanEnabled(!cavemanEnabled)}
            />
          </div>
        </div>

        {/* Ponytail Toggle */}
        <div className="flex items-center justify-between pt-4 gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">
              Lazy senior dev{" "}
              <a
                href="https://github.com/DietrichGebert/ponytail"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-normal text-primary underline hover:opacity-80"
              >
                (Ponytail)
              </a>
            </p>
            <p className="text-xs text-text-muted">
              Bias the model toward minimal code: YAGNI, reuse stdlib, deletion over addition
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {ponytailEnabled && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  {PONYTAIL_LEVELS.map((lvl) => (
                    <button
                      key={lvl.id}
                      onClick={() => handlePonytailLevel(lvl.id)}
                      className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                        ponytailLevel === lvl.id
                          ? "bg-primary text-white border-primary"
                          : "bg-transparent border-border text-text-muted hover:bg-bg-hover"
                      }`}
                      title={lvl.desc}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-primary">
                  {
                    PONYTAIL_LEVELS.find((lvl) => lvl.id === ponytailLevel)
                      ?.desc
                  }
                </p>
              </div>
            )}
            <Toggle
              checked={ponytailEnabled}
              onChange={() => handlePonytailEnabled(!ponytailEnabled)}
            />
          </div>
        </div>

        {/* GitHub Credentials Section */}
        <div className="pt-6 mt-6 border-t border-border">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">key</span>
            Auto-Update GitHub Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">GitHub Username</label>
              <Input
                value={githubUsername}
                onChange={(e) => {
                  setGithubUsername(e.target.value);
                  patchSetting({ githubUsername: e.target.value });
                }}
                placeholder="kakrobi"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Personal Access Token (PAT)</label>
              <Input
                type="password"
                value={githubToken}
                onChange={(e) => {
                  setGithubToken(e.target.value);
                  patchSetting({ githubToken: e.target.value });
                }}
                placeholder="ghp_xxxxxxxxxxxx"
              />
            </div>
          </div>
          <p className="text-[10px] text-text-muted mt-2">
            Dibutuhkan untuk melakukan sinkronisasi otomatis fork Anda dengan repositori resmi 9Router.
          </p>
        </div>
      </Card>

      {/* Headroom Install Setup Modal */}
      <Modal
        isOpen={showHeadroomInstallModal}
        title={headroomRunning ? "Headroom Setup" : "Setup Headroom"}
        onClose={() => setShowHeadroomInstallModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span>Status</span>
            <span
              className={headroomRunning ? "text-success font-semibold" : "text-warning font-semibold"}
            >
              {headroomStatusLabel}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Proxy URL</p>
            <Input
              value={headroomUrl}
              onChange={(e) => setHeadroomUrl(e.target.value)}
              onBlur={handleHeadroomUrlBlur}
              placeholder="http://localhost:8787"
              className="font-mono text-sm"
            />
            <p className="text-xs text-text-muted">
              Use a local proxy for Start/Stop, or an external Docker sidecar
              like http://headroom:8787.
            </p>
          </div>
          {headroomManaged ? (
            <Button
              onClick={handleHeadroomStop}
              variant="ghost"
              fullWidth
              disabled={headroomActionLoading}
            >
              {headroomActionLoading ? "Stopping…" : "Stop Headroom"}
            </Button>
          ) : headroomRunning ? (
            <p className="text-sm text-success">
              Headroom proxy is reachable. You can enable the token saver.
            </p>
          ) : headroomCanStart ? (
            <Button
              onClick={handleHeadroomStart}
              fullWidth
              disabled={headroomActionLoading}
            >
              {headroomActionLoading ? "Starting…" : "Start Headroom"}
            </Button>
          ) : !headroomLocalUrl ? (
            <p className="text-sm text-warning">
              Start Headroom separately at the configured URL, then recheck.
            </p>
          ) : !headroomStatus.python ? (
            <p className="text-sm text-warning">
              Python ≥ 3.10 required for local managed mode. Install Python
              first, or use an external proxy URL.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Install then click Start:</p>
              <div className="flex items-center gap-2">
                <pre className="flex-1 rounded bg-black/5 dark:bg-white/5 p-2 text-xs font-mono overflow-x-auto">
                  {`pip install "headroom-ai[proxy]"`}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    copy(`pip install "headroom-ai[proxy]"`)
                  }
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}
          {headroomActionError && (
            <p className="text-sm text-warning">{headroomActionError}</p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => refreshHeadroomStatus()}
              variant="ghost"
              fullWidth
            >
              Recheck
            </Button>
            <Button
              onClick={() => setShowHeadroomInstallModal(false)}
              fullWidth
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Auto-Update Modal */}
      <Modal
        isOpen={updateModalOpen}
        title="Pembaruan Sistem Otomatis"
        onClose={
          updateStep === "syncing" || updateStep === "building" || updateStep === "applying"
            ? undefined
            : () => setUpdateModalOpen(false)
        }
      >
        <div className="flex flex-col gap-4 py-2">
          {/* Step 1: Syncing */}
          {updateStep === "syncing" && (
            <div className="flex flex-col items-center justify-center py-6 gap-4 text-center">
              <span className="animate-spin material-symbols-outlined text-primary text-4xl">sync</span>
              <div>
                <p className="font-semibold text-sm">Menghubungkan ke GitHub...</p>
                <p className="text-xs text-text-muted mt-1">Menggabungkan kode resmi ke repositori fork Anda.</p>
              </div>
            </div>
          )}

          {/* Step 2: Building */}
          {updateStep === "building" && (
            <div className="flex flex-col items-center justify-center py-6 gap-4 text-center">
              <span className="animate-spin material-symbols-outlined text-primary text-4xl text-indigo-500">progress_activity</span>
              <div className="w-full">
                <p className="font-semibold text-sm">GitHub sedang mem-build sistem baru...</p>
                <p className="text-xs text-text-muted mt-1">
                  Kompilasi Docker image di GitHub Actions sedang berjalan.
                </p>
                <div className="bg-surface-2 border border-border rounded p-3 mt-4 text-left font-mono text-xs max-h-32 overflow-y-auto space-y-1">
                  <p>• Status: {buildStatus?.status || "queued"}</p>
                  <p>• Waktu berjalan: {buildTime}s</p>
                  <p className="text-text-muted">• Estimasi total build: ~3 menit.</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Apply Ready */}
          {updateStep === "apply_ready" && (
            <div className="flex flex-col gap-4 text-center py-4">
              <div className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-success text-5xl">check_circle</span>
                <h4 className="font-bold text-base">Build Selesai & Siap Di-update!</h4>
              </div>
              <p className="text-xs text-text-muted">
                Docker image terbaru telah siap di GitHub Container Registry. Klik tombol di bawah untuk menerapkannya di VPS.
              </p>
              <Button onClick={handleApplyUpdate} fullWidth variant="success">
                Terapkan & Restart 9Router
              </Button>
            </div>
          )}

          {/* Step 4: Applying (Restarting) */}
          {updateStep === "applying" && (
            <div className="flex flex-col items-center justify-center py-6 gap-4 text-center">
              <span className="animate-bounce material-symbols-outlined text-success text-4xl">cloud_download</span>
              <div>
                <p className="font-semibold text-sm">Sedang Menerapkan Update di VPS...</p>
                <p className="text-xs text-text-muted mt-1">
                  Watchtower sedang menarik image baru dan merekonstruksi kontainer 9Router Anda.
                </p>
                <p className="text-xs text-warning mt-3 font-medium animate-pulse">
                  Proses ini memakan waktu ~10-15 detik. Sistem akan online kembali secara otomatis.
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {updateStep === "complete" && (
            <div className="flex flex-col gap-4 text-center py-4">
              <div className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-success text-5xl">celebration</span>
                <h4 className="font-bold text-base">Sistem Berhasil Diperbarui!</h4>
              </div>
              <p className="text-xs text-text-muted">
                9Router Anda telah diperbarui ke versi terbaru dan berjalan dengan mulus.
              </p>
              <Button
                onClick={() => {
                  setUpdateModalOpen(false);
                  window.location.reload();
                }}
                fullWidth
              >
                Selesai
              </Button>
            </div>
          )}

          {/* Step 6: Failed */}
          {updateStep === "failed" && (
            <div className="flex flex-col gap-4 text-center py-4">
              <div className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-danger text-5xl">error</span>
                <h4 className="font-bold text-base">Gagal Memperbarui Sistem</h4>
              </div>
              <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded p-3 font-medium text-left">
                {updateError || "Terjadi kesalahan tidak diketahui."}
              </p>
              <div className="flex gap-2">
                <Button onClick={handleStartUpdate} variant="ghost" fullWidth>
                  Coba Lagi
                </Button>
                <Button onClick={() => setUpdateModalOpen(false)} fullWidth>
                  Tutup
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
