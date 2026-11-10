"use client";

import { useState, useEffect, useRef } from "react";
import {
  RefreshCw,
  Code2,
  AlertCircle,
  LogOut,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bell,
  Target,
  Plus,
  Check,
  Edit2,
  X,
  Trash2,
  Brain,
  BookOpen,
  Search,
  Car,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  name: string;
  email: string;
  leetcodeUsername: string;
  timezone?: string;
  leetcodeConnected?: boolean;
  notificationTime?: string | null;
  desktopNudge?: boolean | null;
}

interface LeetCodeLog {
  id: number;
  problemTitle: string;
  titleSlug: string;
  difficulty: string;
  problemUrl: string;
  solvedAt: string;
  solvedTimestamp?: number | null;
}

interface RecentSubmission {
  title: string;
  titleSlug: string;
  timestamp: string;
  difficulty?: string | null;
}

interface CalendarQuestion {
  title: string;
  titleSlug: string;
  difficulty?: string | null;
}

interface LeetCodeStats {
  streak: number;
  easy: number;
  medium: number;
  hard: number;
  total: number;
  submissionCalendar?: string;
}

type ViewId = "Overview" | "Problems" | "Calendar" | "Contests";

interface QuestionDetails {
  titleSlug: string;
  frontendId?: string | null;
  difficulty?: string | null;
  tags: string[];
}


interface UpcomingContest {
  title: string;
  titleSlug: string;
  startTime: number;
  duration: number;
  kind: "weekly" | "biweekly";
  url: string;
}

interface ContestHistory {
  summary: { attendedContestsCount: number; rating: number; globalRanking: number; totalParticipants?: number; topPercentage: number } | null;
  history: { title: string; startTime: number; rating: number; ranking: number; problemsSolved: number; totalProblems: number }[];
}

interface FocusTask {
  id: string;
  label: string;
  tag: string;
  done: boolean;
  isDefault?: boolean;
  iconType?: "code" | "brain" | "book" | "target";
}

interface NudgeSchedule {
  time: string;
  channels: string[];
}

// ─── Date Helpers (Timezone-Safe Local Dates) ─────────────────────────────────

function parseLocalDate(dateInput: string | Date): Date {
  if (dateInput instanceof Date) return dateInput;
  if (!dateInput) return new Date();
  const str = String(dateInput).split("T")[0];
  const parts = str.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d, 12, 0, 0); // Noon local time to avoid UTC shifts
  }
  return new Date(dateInput);
}

function getLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DEFAULT_CHART_TIMEZONE = "UTC";

function getDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

function getDateKeyFromEpochSecondsInTimeZone(epochSeconds: string | number, timeZone: string): string {
  const seconds = Number(epochSeconds);
  if (!Number.isFinite(seconds)) return "";
  return getDateKeyInTimeZone(new Date(seconds * 1000), timeZone);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatDateKeyForUi(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));

  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return Promise.resolve(false);
  if (Notification.permission === "granted") return Promise.resolve(true);
  return Notification.requestPermission().then((permission) => permission === "granted");
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.error("Unable to register service worker:", error);
    return null;
  }
}

async function subscribeToPushNotifications(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  const isSecureContext = window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!("PushManager" in window)) {
    console.warn("Push API is not supported in this browser.");
    return false;
  }

  if (!isSecureContext) {
    console.warn("Push notifications require HTTPS or localhost.");
    return false;
  }

  const permissionGranted = await requestNotificationPermission();
  if (!permissionGranted) return false;

  try {
    const registration = await registerServiceWorker();
    if (!registration) return false;

    const response = await fetch(`${API_BASE}/api/v1/push/public-key`);
    if (!response.ok) return false;

    const { publicKey } = await response.json();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const p256dhKey = subscription.getKey("p256dh");
    const authKey = subscription.getKey("auth");

    await fetch(`${API_BASE}/api/v1/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: p256dhKey ? arrayBufferToBase64Url(p256dhKey) : "",
        auth: authKey ? arrayBufferToBase64Url(authKey) : "",
      }),
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Push subscription is unavailable in this browser/session:", message);
    return false;
  }
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, tag: "prep-tracker-nudge" });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).toUpperCase();
}

function getWeekBounds(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon
  const mondayOffset = (day + 6) % 7;
  const mon = new Date(d);
  mon.setDate(d.getDate() - mondayOffset);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { weekStart: mon, weekEnd: sun };
}

function countLogsInRange(logs: LeetCodeLog[], from: Date, to: Date): number {
  return logs.filter((l) => {
    const d = parseLocalDate(l.solvedAt);
    return d >= from && d <= to;
  }).length;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const DAILY_TARGET = 3;
const WEEKLY_TARGET = DAILY_TARGET * 7; // 21

// ─── Default focus tasks ──────────────────────────────────────────────────────

const defaultTasks: FocusTask[] = [
  { id: "t1", label: "Solve 3 LeetCode questions", tag: "LeetCode · Medium", done: false, isDefault: true, iconType: "code" },
  { id: "t2", label: "Review LLD patterns", tag: "Strategy · LLD", done: false, isDefault: true, iconType: "brain" },
  { id: "t3", label: "Study HLD topics", tag: "Coding · HLD", done: false, isDefault: true, iconType: "book" },
];

function TaskIcon({ type }: { type?: string }) {
  switch (type) {
    case "code": return <Code2 size={15} style={{ color: "#f59e0b" }} />;
    case "brain": return <Brain size={15} style={{ color: "#fbbf24" }} />;
    case "book": return <BookOpen size={15} style={{ color: "#f59e0b" }} />;
    default: return <Target size={15} style={{ color: "#f59e0b" }} />;
  }
}

// Counts up to a number with an ease-out, instantly when the viewer prefers reduced motion.
function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = reduce ? 1 : Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown}</>;
}

// Short, stable git-style hash for a solved question (purely decorative).
function shortHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

function relativeDay(dateKey: string, todayKey: string): string {
  const diff = Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${dateKey}T00:00:00Z`)) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 30) return `${diff}d ago`;
  return formatDateKeyForUi(dateKey, { month: "short", day: "numeric", year: diff > 300 ? "numeric" : undefined }).toLowerCase();
}

// Confetti burst from a screen point (skipped when the viewer prefers reduced motion).
function fireConfetti(originX: number, originY: number) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "9999" });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);
  const colors = ["#f2b43c", "#8fd47e", "#74b6ff", "#f0766b", "#c6a0ff", "#ffffff"];
  const pieces = Array.from({ length: 160 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const speed = 6 + Math.random() * 9;
    return {
      x: originX, y: originY,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });
  const start = performance.now();
  const frame = (t: number) => {
    const elapsed = t - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of pieces) {
      p.vy += 0.28; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
      ctx.restore();
    }
    if (elapsed < 2600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}


// ─── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  const [now, setNow] = useState(new Date());
  const today = now;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  // Calendar State
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());

  // Auth
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [leetcodeUsername, setLeetcodeUsername] = useState("");
  const [authError, setAuthError] = useState("");

  // Data
  const [logs, setLogs] = useState<LeetCodeLog[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);
  const [stats, setStats] = useState<LeetCodeStats>({ streak: 0, easy: 0, medium: 0, hard: 0, total: 0, submissionCalendar: "{}" });
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // UI
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<ViewId>("Overview");

  // LeetCode insights: per-question number + tags, tag totals, contests
  const [questionMeta, setQuestionMeta] = useState<Record<string, QuestionDetails>>({});
  const [metaPending, setMetaPending] = useState(0);
  const [contests, setContests] = useState<UpcomingContest[]>([]);
  const [contestHistory, setContestHistory] = useState<ContestHistory | null>(null);
  const [registeredContests, setRegisteredContests] = useState<string[]>([]);
  const [ratingHover, setRatingHover] = useState<number | null>(null);
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(null);

  // Editor-style UI: command search, problems list filters, contribution graph hover
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const [problemQuery, setProblemQuery] = useState("");
  const [problemFilter, setProblemFilter] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [heatHover, setHeatHover] = useState<{ key: string; x: number; y: number; below: boolean } | null>(null);
  const heatWrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);

  // Each "file" opens at the top, like switching editor tabs.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeNav]);

  // Connect LeetCode (full history import)
  const [connectOpen, setConnectOpen] = useState(false);
  const [sessionInput, setSessionInput] = useState("");
  const [csrfInput, setCsrfInput] = useState("");
  const [connectStatus, setConnectStatus] = useState<"idle" | "checking" | "importing" | "done" | "error">("idle");
  const [connectMessage, setConnectMessage] = useState("");
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Focus tasks
  const [tasks, setTasks] = useState<FocusTask[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("preptracker_tasks");
      return saved ? JSON.parse(saved) : defaultTasks;
    }
    return defaultTasks;
  });
  const [newTaskLabel, setNewTaskLabel] = useState("");
  const [newTaskIcon, setNewTaskIcon] = useState<"code" | "brain" | "book" | "target">("target");
  const [addingTask, setAddingTask] = useState(false);

  // Nudge schedule
  const [nudge, setNudge] = useState<NudgeSchedule>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("preptracker_nudge");
      if (saved) {
        const parsed = JSON.parse(saved);
        return { time: parsed?.time || "19:30", channels: parsed?.channels || ["Desktop", "Phone"] };
      }
    }
    return { time: "19:30", channels: ["Desktop", "Phone"] };
  });
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [nudgeDraft, setNudgeDraft] = useState<NudgeSchedule>(nudge);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [notificationError, setNotificationError] = useState<string>("");
  const [notificationSentKey, setNotificationSentKey] = useState<string>("");
  const [desktopNudgeMsg, setDesktopNudgeMsg] = useState("");

  // ── Session restore ──────────────────────────────────────────────────────────
  useEffect(() => {
    const savedUser = localStorage.getItem("preptracker_user");
    if (savedUser) {
      const user = JSON.parse(savedUser);
      setCurrentUser(user);
      loadDashboard(user);
    }
  }, []);

  // ── Ctrl/⌘+K focuses the jump-to search ─────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Persist tasks ────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("preptracker_tasks", JSON.stringify(tasks));
  }, [tasks]);

  // ── Persist nudge ────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("preptracker_nudge", JSON.stringify(nudge));
  }, [nudge]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);

    if ("serviceWorker" in navigator) {
      registerServiceWorker();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      requestNotificationPermission().then((granted) => {
        setNotificationPermission(granted ? "granted" : "denied");
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || notificationPermission !== "granted") return;
    const [hour, minute] = nudge.time.split(":").map(Number);
    const reminderDate = new Date(today);
    reminderDate.setHours(hour, minute, 0, 0);
    const reminderKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    if (reminderDate.getTime() <= now.getTime() && notificationSentKey !== reminderKey) {
      const remainingTargets = tasks.filter((task) => !task.done).length;
      if (remainingTargets > 0) {
        showBrowserNotification(
          "Daily prep nudge",
          remainingTargets === 1
            ? "You have 1 daily target remaining today. Keep your streak alive."
            : `You have ${remainingTargets} daily targets remaining today. Keep your streak alive.`
        );
      }
      setNotificationSentKey(reminderKey);
    }
  }, [now, notificationPermission, notificationSentKey, nudge.time, tasks, today]);

  // ── Click-outside workspace dropdown ─────────────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setWorkspaceOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── API calls ────────────────────────────────────────────────────────────────

  // Loads everything for a signed-in user. If the backend isn't up yet (e.g. restarting), waits and tries again.
  const loadDashboard = async (user: User, attempt = 0) => {
    let up = false;
    try {
      up = (await fetch(`http://localhost:8080/api/v1/users/${user.id}`)).ok;
    } catch { /* not up yet */ }
    if (!up) {
      if (attempt < 36) setTimeout(() => loadDashboard(user, attempt + 1), 5000);
      return;
    }
    fetchLogs(user.leetcodeUsername);
    fetchSubmissionHistory(user.leetcodeUsername);
    fetchStats(user.leetcodeUsername);
    syncInBackground(user.leetcodeUsername);
    refreshUser(user.id);
    loadInsights(user.leetcodeUsername, user.id);
  };

  const fetchLogs = async (username: string) => {
    try {
      const res = await fetch(`http://localhost:8080/api/leetcode/logs/${username}?t=${Date.now()}`);
      if (res.ok) setLogs(await res.json());
    } catch { /* backend may be offline */ }
  };

  // Problem numbers + tags. The backend fills these in the background, so poll while some are pending.
  // Retries when the backend is unreachable (e.g. still starting) and keeps polling while some are pending.
  const fetchQuestionMeta = async (username: string, attempt = 0) => {
    let retry = false;
    try {
      const res = await fetch(`http://localhost:8080/api/leetcode/${username}/questions`);
      if (res.ok) {
        const body: { pending: number; questions: QuestionDetails[] } = await res.json();
        setQuestionMeta(Object.fromEntries(body.questions.map((q) => [q.titleSlug, q])));
        setMetaPending(body.pending);
        retry = body.pending > 0;
      } else {
        retry = true;
      }
    } catch {
      retry = true;
    }
    if (retry && attempt < 40) setTimeout(() => fetchQuestionMeta(username, attempt + 1), attempt < 5 ? 4000 : 12000);
  };

  // Contest schedule, history and registrations. Retries if the backend isn't reachable yet.
  const loadInsights = async (username: string, userId: number, attempt = 0) => {
    fetchQuestionMeta(username);
    try {
      const [upcomingRes, historyRes, regRes] = await Promise.all([
        fetch(`http://localhost:8080/api/leetcode/contests/upcoming`),
        fetch(`http://localhost:8080/api/leetcode/${username}/contests`),
        fetch(`http://localhost:8080/api/v1/users/${userId}/contests/registered`),
      ]);
      if (upcomingRes.ok) setContests(await upcomingRes.json());
      if (historyRes.ok) setContestHistory(await historyRes.json());
      if (regRes.ok) setRegisteredContests(await regRes.json());
      if (!upcomingRes.ok || !historyRes.ok) throw new Error("retry");
    } catch {
      if (attempt < 8) setTimeout(() => loadInsights(username, userId, attempt + 1), 5000);
    }
  };

  const toggleRegistered = async (contest: UpcomingContest, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!currentUser) return;
    const isRegistered = registeredContests.includes(contest.titleSlug);
    const rect = e.currentTarget.getBoundingClientRect();
    setRegisteredContests((list) => isRegistered ? list.filter((s) => s !== contest.titleSlug) : [...list, contest.titleSlug]);
    if (!isRegistered) fireConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
    try {
      await fetch(`http://localhost:8080/api/v1/users/${currentUser.id}/contests/${contest.titleSlug}/registered`, { method: isRegistered ? "DELETE" : "PUT" });
    } catch { /* backend may be offline */ }
  };

  const fetchStats = async (username: string) => {
    try {
      const res = await fetch(`http://localhost:8080/api/leetcode/${username}?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const subs = data?.data?.matchedUser?.submitStats?.acSubmissionNum ?? [];
        const streak = data?.data?.matchedUser?.userCalendar?.streak ?? 0;
        const submissionCalendar = data?.data?.matchedUser?.userCalendar?.submissionCalendar ?? "{}";
        const easy = subs.find((s: { difficulty: string }) => s.difficulty === "Easy")?.count ?? 0;
        const medium = subs.find((s: { difficulty: string }) => s.difficulty === "Medium")?.count ?? 0;
        const hard = subs.find((s: { difficulty: string }) => s.difficulty === "Hard")?.count ?? 0;
        setStats({ streak, easy, medium, hard, total: easy + medium + hard, submissionCalendar });
        setLastSynced("just now");
      }
    } catch { /* backend may be offline */ }
  };

  // Live list of every accepted solve LeetCode exposes (full history if the backend has a LeetCode login, else the last 20).
  const fetchSubmissionHistory = async (username: string) => {
    try {
      const res = await fetch(`http://localhost:8080/api/leetcode/${username}/history?t=${Date.now()}`);
      if (!res.ok) return;
      const history = await res.json();
      const solves: { title: string; titleSlug: string; difficulty?: string | null; timestamp: number | string }[] =
        Array.isArray(history) ? history : [];
      setRecentSubmissions(solves.map((solve) => ({
        title: solve.title,
        titleSlug: solve.titleSlug,
        difficulty: solve.difficulty,
        timestamp: String(solve.timestamp),
      })));
    } catch { /* backend may be offline */ }
  };

  // Saves new solves to the database so older days stay on the calendar, then refreshes the saved list.
  const syncInBackground = async (username: string) => {
    try {
      const res = await fetch(`http://localhost:8080/api/leetcode/${username}/sync`, { method: "POST" });
      if (res.ok) {
        setLogs(await res.json());
        fetchQuestionMeta(username);
      }
    } catch { /* backend may be offline */ }
  };

  const saveUser = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem("preptracker_user", JSON.stringify(user));
  };

  // Picks up server-side changes to the saved user, such as whether LeetCode is connected.
  const refreshUser = async (id: number) => {
    try {
      const res = await fetch(`http://localhost:8080/api/v1/users/${id}`);
      if (!res.ok) return;
      const user: User = await res.json();
      saveUser(user);
      // The backend sends the nudge, so make sure it knows the time set on this dashboard.
      if (user.notificationTime !== nudge.time) saveNudgeToBackend({ time: nudge.time }, user.id);
    } catch { /* backend may be offline */ }
  };

  // Saves the nudge time and/or the desktop car setting on the backend, which fires the nudge.
  const saveNudgeToBackend = async (change: { time?: string; desktop?: boolean }, id = currentUser?.id) => {
    if (!id) return null;
    try {
      const res = await fetch(`http://localhost:8080/api/v1/users/${id}/nudge`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!res.ok) return null;
      const user: User = await res.json();
      saveUser(user);
      return user;
    } catch {
      return null;
    }
  };

  const previewDesktopNudge = async () => {
    if (!currentUser) return;
    setDesktopNudgeMsg("");
    try {
      const res = await fetch(`http://localhost:8080/api/v1/users/${currentUser.id}/nudge/test`, { method: "POST" });
      const body = await res.json().catch(() => null);
      setDesktopNudgeMsg(res.ok ? "// look at the top of your screen →" : body?.error ?? "Could not show the desktop car.");
    } catch {
      setDesktopNudgeMsg("Cannot reach the backend. Is it running?");
    }
  };

  const toggleDesktopNudge = async () => {
    const next = !currentUser?.desktopNudge;
    const saved = await saveNudgeToBackend({ desktop: next, time: nudge.time });
    setDesktopNudgeMsg(saved
      ? next ? `// the car drives across your screen at ${nudge.time} if today's target isn't hit` : "// desktop car off"
      : "Cannot reach the backend. Is it running?");
  };

  const handleConnectLeetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !sessionInput.trim()) return;
    setConnectStatus("checking");
    setConnectMessage("");
    try {
      const res = await fetch(`http://localhost:8080/api/v1/users/${currentUser.id}/leetcode-session`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: sessionInput, csrfToken: csrfInput }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setConnectStatus("error");
        setConnectMessage(body?.error ?? "Could not connect LeetCode.");
        return;
      }
      saveUser(await res.json());
      setSessionInput("");
      setCsrfInput("");
      setConnectStatus("importing");
      const sync = await fetch(`http://localhost:8080/api/leetcode/${currentUser.leetcodeUsername}/sync`, { method: "POST" });
      if (sync.ok) {
        const saved: LeetCodeLog[] = await sync.json();
        setLogs(saved);
        setConnectStatus("done");
        setConnectMessage(`Imported your history: ${saved.length} solves saved.`);
        setConnectOpen(false);
      } else {
        setConnectStatus("error");
        setConnectMessage("Connected, but the import failed. It will retry within the hour.");
      }
    } catch {
      setConnectStatus("error");
      setConnectMessage("Cannot reach the backend. Is it running?");
    }
  };

  const handleDisconnectLeetCode = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`http://localhost:8080/api/v1/users/${currentUser.id}/leetcode-session`, { method: "DELETE" });
      if (res.ok) {
        saveUser(await res.json());
        setConnectStatus("idle");
        setConnectMessage("LeetCode disconnected. Imported titles stay on the calendar.");
      }
    } catch { /* backend may be offline */ }
  };

  const handleSync = async () => {
    if (!currentUser) return;
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await fetch(`http://localhost:8080/api/leetcode/${currentUser.leetcodeUsername}/sync`, { method: "POST" });
      if (res.ok) {
        await fetchLogs(currentUser.leetcodeUsername);
        await fetchSubmissionHistory(currentUser.leetcodeUsername);
        loadInsights(currentUser.leetcodeUsername, currentUser.id);
        await fetchStats(currentUser.leetcodeUsername);
        setSyncMessage("Synced!");
        setLastSynced("just now");
        setTimeout(() => setSyncMessage(""), 3000);
      }
    } catch { setSyncMessage("Connection error"); }
    finally { setSyncing(false); }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!email || !leetcodeUsername) { setAuthError("Please fill in all fields."); return; }
    try {
      const res = await fetch("http://localhost:8080/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || leetcodeUsername, email, leetcodeUsername }),
      });
      if (res.ok) {
        const user: User = await res.json();
        setCurrentUser(user);
        localStorage.setItem("preptracker_user", JSON.stringify(user));
        fetchLogs(user.leetcodeUsername);
        fetchSubmissionHistory(user.leetcodeUsername);
        fetchStats(user.leetcodeUsername);
        syncInBackground(user.leetcodeUsername);
        loadInsights(user.leetcodeUsername, user.id);
      } else {
        setAuthError("Failed to create account. Check your details.");
      }
    } catch { setAuthError("Cannot connect to backend. Is it running?"); }
  };

  const handleLogout = () => {
    localStorage.removeItem("preptracker_user");
    setCurrentUser(null);
    setLogs([]);
    setRecentSubmissions([]);
    setStats({ streak: 0, easy: 0, medium: 0, hard: 0, total: 0 });
    setWorkspaceOpen(false);
  };

  const deleteTask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTasks(ts => ts.filter(t => t.id !== id));
  };

  // ── Week calculations ─────────────────────────────────────────────────────────

  const { weekStart, weekEnd } = getWeekBounds(today);
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart); lastWeekEnd.setDate(weekStart.getDate() - 1);

  const solvedThisWeek = countLogsInRange(logs, weekStart, todayEnd);
  const solvedLastWeek = countLogsInRange(logs, lastWeekStart, lastWeekEnd);

  const thisWeekPct = Math.round((solvedThisWeek / WEEKLY_TARGET) * 100);
  const lastWeekPct = Math.round((solvedLastWeek / WEEKLY_TARGET) * 100);
  const delta = thisWeekPct - lastWeekPct;

  // Today's problems (Timezone-safe)
  const todayLogs = logs.filter((l) => {
    const d = parseLocalDate(l.solvedAt);
    return d >= todayStart && d <= todayEnd;
  });

  const todayEasy = todayLogs.filter(l => l.difficulty?.toLowerCase() === "easy").length;
  const todayMedium = todayLogs.filter(l => l.difficulty?.toLowerCase() === "medium").length;
  const todayHard = todayLogs.filter(l => l.difficulty?.toLowerCase() === "hard").length;

  // Weekly bar chart data
  const chartTimeZone = DEFAULT_CHART_TIMEZONE;
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayChartKey = getDateKeyInTimeZone(new Date(), chartTimeZone);
  const todayChartDate = new Date(`${todayChartKey}T00:00:00Z`);
  const chartWeekday = todayChartDate.getUTCDay(); // 0=Sun, 1=Mon
  const mondayOffset = (chartWeekday + 6) % 7;
  const weekStartKey = addDaysToDateKey(todayChartKey, -mondayOffset);
  const weekDateKeys = Array.from({ length: 7 }, (_, i) => addDaysToDateKey(weekStartKey, i));
  const weekDateLabels = weekDateKeys.map((key) => {
    if (key > todayChartKey) return "";
    return formatDateKeyForUi(key, { day: "2-digit", month: "short" });
  });
  const safeRecentSubmissions = Array.isArray(recentSubmissions) ? recentSubmissions : [];
  const submissionsByDateKey = safeRecentSubmissions.reduce<Record<string, RecentSubmission[]>>((acc, sub) => {
    const key = getDateKeyFromEpochSecondsInTimeZone(sub.timestamp, chartTimeZone);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(sub);
    return acc;
  }, {});
  // Every solved question grouped by day: saved logs from the database plus the live LeetCode list.
  const calendarQuestionsByDateKey: Record<string, CalendarQuestion[]> = {};
  const addCalendarQuestion = (key: string, question: CalendarQuestion) => {
    if (!key || !question.title) return;
    const day = (calendarQuestionsByDateKey[key] ??= []);
    const existing = day.find((q) => (q.titleSlug || q.title) === (question.titleSlug || question.title));
    if (!existing) day.push(question);
    else if (!existing.difficulty && question.difficulty) existing.difficulty = question.difficulty;
  };
  logs.forEach((log) => {
    const key = log.solvedTimestamp
      ? getDateKeyFromEpochSecondsInTimeZone(log.solvedTimestamp, chartTimeZone)
      : String(log.solvedAt).split("T")[0];
    addCalendarQuestion(key, { title: log.problemTitle, titleSlug: log.titleSlug, difficulty: log.difficulty });
  });
  safeRecentSubmissions.forEach((submission) => {
    const key = getDateKeyFromEpochSecondsInTimeZone(submission.timestamp, chartTimeZone);
    addCalendarQuestion(key, { title: submission.title, titleSlug: submission.titleSlug, difficulty: submission.difficulty });
  });
  const allSolvedCount = Object.values(calendarQuestionsByDateKey).reduce((sum, day) => sum + day.length, 0);
  const rangeEndKey = todayChartKey < weekDateKeys[6] ? todayChartKey : weekDateKeys[6];
  const weekRangeLabel = `${formatDateKeyForUi(weekDateKeys[0], { month: "short", day: "numeric" })} - ${formatDateKeyForUi(rangeEndKey, { month: "short", day: "numeric" })}`;
  const questionsByDay = weekDateKeys.map((key) => {
    if (key > todayChartKey) return [];
    return (calendarQuestionsByDateKey[key] ?? []).map((q) => q.title);
  });
  const perDay = questionsByDay.map((questions) => questions.length);
  const solvedThisWeekChart = perDay.reduce((sum, n) => sum + n, 0);
  const maxInPerDay = Math.max(...perDay, 0);
  const chartMax = Math.max(5, Math.ceil((maxInPerDay || DAILY_TARGET) / 5) * 5);
  const step = chartMax / 5;
  const yTicks = [chartMax, Math.round(step * 4), Math.round(step * 3), Math.round(step * 2), Math.round(step * 1), 0];

  // Focus progress
  const doneTasks = tasks.filter(t => t.done).length;
  const taskPct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;

  // Nudge countdown
  const remainingTasks = tasks.filter(task => !task.done).length;
  const [nudgeHour, nudgeMin] = nudge.time.split(":").map(Number);
  const nudgeDate = new Date(today);
  nudgeDate.setHours(nudgeHour, nudgeMin, 0, 0);
  const isReminderDueNow = nudgeDate.getTime() <= now.getTime();
  const displayTargetDate = isReminderDueNow ? new Date(nudgeDate.getTime() + 24 * 60 * 60 * 1000) : nudgeDate;
  const msUntil = displayTargetDate.getTime() - now.getTime();
  const minutesUntil = Math.max(0, Math.floor(msUntil / 60000));
  const nudgeHoursLeft = Math.floor(minutesUntil / 60);
  const nudgeMinsLeft = minutesUntil % 60;
  const nudgeLabel = isReminderDueNow ? "Due now" : `Today · in ${nudgeHoursLeft}h ${nudgeMinsLeft}m`;

  // ── Month Calendar calculations ─────────────────────────────────────────────
  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(y => y - 1);
    } else {
      setCalMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(y => y + 1);
    } else {
      setCalMonth(m => m + 1);
    }
  };

  const monthStart = new Date(Date.UTC(calYear, calMonth, 1));
  const monthEnd = new Date(Date.UTC(calYear, calMonth + 1, 0));
  const startWeekday = monthStart.getUTCDay(); // 0=Sun, 1=Mon
  const adjustedStartWeekday = (startWeekday + 6) % 7; // Mon=0 ... Sun=6

  const monthDays: { date: Date | null, dateKey: string, count: number }[] = [];
  for (let i = 0; i < adjustedStartWeekday; i++) {
    monthDays.push({ date: null, dateKey: "", count: 0 });
  }

  let parsedCalendar = {};
  try {
    parsedCalendar = JSON.parse(stats.submissionCalendar || "{}");
  } catch (e) {
    console.error("Failed to parse submissionCalendar", e);
  }

  const calendarByDateKey = Object.entries(parsedCalendar).reduce((acc, [epochSecs, count]) => {
    const key = getDateKeyFromEpochSecondsInTimeZone(epochSecs, chartTimeZone);
    if (key) acc[key] = (acc[key] || 0) + Number(count);
    return acc;
  }, {} as Record<string, number>);

  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const current = new Date(Date.UTC(calYear, calMonth, d, 12, 0, 0));
    const key = getDateKeyInTimeZone(current, chartTimeZone);
    const count = calendarByDateKey[key] ?? submissionsByDateKey[key]?.length ?? 0;
    monthDays.push({ date: current, dateKey: key, count });
  }

  while (monthDays.length % 7 !== 0) {
    monthDays.push({ date: null, dateKey: "", count: 0 });
  }

  const monthWeeks = [];
  for (let i = 0; i < monthDays.length; i += 7) {
    monthWeeks.push(monthDays.slice(i, i + 7));
  }

  const getHeatmapClass = (count: number) => {
    if (count === 0) return "level-0";
    if (count <= 1) return "level-1";
    if (count <= 3) return "level-2";
    if (count <= 5) return "level-3";
    return "level-4";
  };

  // ── Editor view data ──────────────────────────────────────────────────────────

  const FILES: { id: ViewId; file: string }[] = [
    { id: "Overview", file: "overview.tsx" },
    { id: "Problems", file: "problems.tsx" },
    { id: "Calendar", file: "calendar.tsx" },
    { id: "Contests", file: "contests.tsx" },
  ];

  // Every solved question, newest day first.
  const allSolved = Object.entries(calendarQuestionsByDateKey)
    .flatMap(([dateKey, questions]) => questions.map((q) => ({ ...q, dateKey })))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const diffCounts = allSolved.reduce(
    (acc, p) => {
      const d = (p.difficulty || "").toLowerCase();
      if (d === "easy" || d === "medium" || d === "hard") acc[d]++;
      return acc;
    },
    { easy: 0, medium: 0, hard: 0 }
  );
  const problemNeedle = problemQuery.trim().toLowerCase();
  const filteredProblems = allSolved.filter((p) =>
    (problemFilter === "all" || (p.difficulty || "").toLowerCase() === problemFilter) &&
    (!problemNeedle || p.title.toLowerCase().includes(problemNeedle) || p.dateKey.includes(problemNeedle) ||
      (questionMeta[p.titleSlug]?.frontendId ?? "") === problemNeedle.replace(/^#/, "") ||
      (questionMeta[p.titleSlug]?.tags ?? []).some((t) => t.toLowerCase().includes(problemNeedle)))
  );
  const problemDays: { dateKey: string; items: typeof filteredProblems }[] = [];
  filteredProblems.forEach((p) => {
    const last = problemDays[problemDays.length - 1];
    if (last && last.dateKey === p.dateKey) last.items.push(p);
    else problemDays.push({ dateKey: p.dateKey, items: [p] });
  });

  // Git-style contribution graph: the last 53 weeks, Monday-first columns.
  const heatCountFor = (key: string) => Math.max((calendarQuestionsByDateKey[key] ?? []).length, calendarByDateKey[key] ?? 0);
  const heatEndWeekday = (new Date(`${todayChartKey}T00:00:00Z`).getUTCDay() + 6) % 7;
  const heatStartKey = addDaysToDateKey(todayChartKey, -(52 * 7 + heatEndWeekday));
  const heatWeeks = Array.from({ length: 53 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const key = addDaysToDateKey(heatStartKey, w * 7 + d);
      const future = key > todayChartKey;
      return { key, future, count: future ? 0 : heatCountFor(key) };
    })
  );
  const heatMonthLabels = heatWeeks.map((week, i) => {
    const month = week[0].key.slice(5, 7);
    const prev = i > 0 ? heatWeeks[i - 1][0].key.slice(5, 7) : "";
    return month !== prev ? formatDateKeyForUi(week[0].key, { month: "short" }).toLowerCase() : "";
  });
  const heatDays = heatWeeks.flat().filter((c) => !c.future);
  const activeDaysThisYear = heatDays.filter((c) => c.count > 0).length;

  // Streaks from every day with a submission or a solve (LeetCode counts days in UTC).
  const activeDayKeys = new Set<string>([
    ...Object.keys(calendarByDateKey).filter((k) => (calendarByDateKey[k] ?? 0) > 0),
    ...Object.keys(calendarQuestionsByDateKey).filter((k) => (calendarQuestionsByDateKey[k] ?? []).length > 0),
  ]);
  const activeToday = activeDayKeys.has(todayChartKey);
  // Current streak: consecutive days up to today. Today still counts as "in progress" until it ends,
  // so an unsolved today doesn't break a streak that ran through yesterday.
  let currentStreak = 0;
  for (let key = activeToday ? todayChartKey : addDaysToDateKey(todayChartKey, -1); activeDayKeys.has(key); key = addDaysToDateKey(key, -1)) {
    currentStreak++;
  }
  // Longest streak: the best run anywhere in the history.
  let longestStreak = 0;
  {
    const sorted = [...activeDayKeys].sort();
    let run = 0;
    let prev = "";
    for (const key of sorted) {
      run = prev && addDaysToDateKey(prev, 1) === key ? run + 1 : 1;
      longestStreak = Math.max(longestStreak, run);
      prev = key;
    }
  }
  const streakAtRisk = !activeToday && currentStreak > 0;


  // Contest rating line chart geometry.
  const ratingPoints = contestHistory?.history ?? [];
  const RATING_W = 760;
  const RATING_H = 240;
  const RATING_PAD = { l: 44, r: 16, t: 16, b: 28 };
  const ratingMin = ratingPoints.length ? Math.floor((Math.min(...ratingPoints.map((p) => p.rating)) - 30) / 50) * 50 : 1400;
  const ratingMax = ratingPoints.length ? Math.ceil((Math.max(...ratingPoints.map((p) => p.rating)) + 30) / 50) * 50 : 1600;
  const ratingX = (i: number) => RATING_PAD.l + (ratingPoints.length <= 1 ? (RATING_W - RATING_PAD.l - RATING_PAD.r) / 2 : (i / (ratingPoints.length - 1)) * (RATING_W - RATING_PAD.l - RATING_PAD.r));
  const ratingY = (v: number) => RATING_PAD.t + (1 - (v - ratingMin) / Math.max(1, ratingMax - ratingMin)) * (RATING_H - RATING_PAD.t - RATING_PAD.b);
  const ratingPath = ratingPoints.map((p, i) => `${i === 0 ? "M" : "L"}${ratingX(i).toFixed(1)},${ratingY(p.rating).toFixed(1)}`).join(" ");
  const ratingTicks = Array.from({ length: 5 }, (_, i) => Math.round(ratingMin + ((ratingMax - ratingMin) * i) / 4));
  const nextWeekly = contests.find((c) => c.kind === "weekly");
  const nextBiweekly = contests.find((c) => c.kind === "biweekly");

  const solvedToday = (calendarQuestionsByDateKey[todayChartKey] ?? []).length || todayLogs.length;
  const nextMilestone = Math.max(50, Math.ceil((stats.total + 1) / 50) * 50);
  const milestoneAway = nextMilestone - stats.total;
  const greetingWord = getGreeting().split(" ")[1]?.toLowerCase() ?? "hello";
  const firstName = (currentUser?.name || "you").split(" ")[0].toLowerCase();
  const sessionStamp = `${now.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase()}.${now.toLocaleDateString("en-US", { month: "short" }).toLowerCase()}.${now.getDate()} · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const recentSolves = allSolved.slice(0, 8);

  const openDay = (dateKey: string) => {
    const [y, m] = dateKey.split("-").map(Number);
    setCalYear(y);
    setCalMonth(m - 1);
    setSelectedCalendarDay(dateKey);
    setActiveNav("Calendar");
  };

  // Command search: files, solved problems and dates.
  const searchNeedle = searchQuery.trim().toLowerCase();
  const searchResults: { kind: string; label: string; meta?: string; pick: () => void }[] = searchNeedle
    ? [
        ...FILES.filter((f) => f.file.includes(searchNeedle)).map((f) => ({ kind: "file", label: f.file, pick: () => setActiveNav(f.id) })),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(searchNeedle) ? [{ kind: "day", label: `open ${searchNeedle}`, pick: () => openDay(searchNeedle) }] : []),
        ...allSolved
          .filter((p) => p.title.toLowerCase().includes(searchNeedle))
          .slice(0, 7)
          .map((p) => ({ kind: "solved", label: p.title, meta: relativeDay(p.dateKey, todayChartKey), pick: () => openDay(p.dateKey) })),
      ]
    : [];
  const pickSearchResult = (i: number) => {
    const result = searchResults[i];
    if (!result) return;
    result.pick();
    setSearchQuery("");
    setSearchOpen(false);
    searchRef.current?.blur();
  };

  // Soft spotlight that follows the cursor across panels.
  const handleSpotlight = (e: React.MouseEvent<HTMLElement>) => {
    const panel = (e.target as HTMLElement).closest<HTMLElement>(".panel");
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    panel.style.setProperty("--mx", `${e.clientX - r.left}px`);
    panel.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const showHeatTip = (e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, key: string) => {
    // Placed against the window (position: fixed) so no scroll box can clip it; flips below the square near the top.
    const cell = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(cell.left + cell.width / 2, 135), window.innerWidth - 135);
    const below = cell.top < 190;
    setHeatHover({ key, x, y: below ? cell.bottom : cell.top, below });
  };

  const d = (i: number) => ({ "--d": i } as React.CSSProperties);

  // Weekly/biweekly registration boxes + LeetCode-style rating chart (shown on overview and contests).
  const renderContestPanels = () => (
    <>
      <div className="contest-grid reveal" style={d(1)}>
        {[nextWeekly, nextBiweekly].filter((c): c is UpcomingContest => !!c).map((c) => {
          const registered = registeredContests.includes(c.titleSlug);
          const secs = Math.max(0, Math.floor(c.startTime - now.getTime() / 1000));
          const live = secs === 0;
          const dd = Math.floor(secs / 86400), hh = Math.floor((secs % 86400) / 3600), mm = Math.floor((secs % 3600) / 60), ss = secs % 60;
          const start = new Date(c.startTime * 1000);
          return (
            <div key={c.titleSlug} className={`panel contest-card${registered ? " registered" : ""}`}>
              <div className="contest-top">
                <span className={`contest-kind ${c.kind}`}>{c.kind}</span>
                {registered && <span className="contest-ok"><Check size={12} strokeWidth={3} /> registered</span>}
              </div>
              <p className="contest-title">{c.title}</p>
              <p className="contest-when">
                {start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toLowerCase()} · {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}
              </p>
              <div className="countdown" aria-label="Time until the contest starts">
                {live ? <span className="live">● live now</span> : (
                  <>
                    <span><b>{dd}</b>d</span><span><b>{String(hh).padStart(2, "0")}</b>h</span><span><b>{String(mm).padStart(2, "0")}</b>m</span><span><b>{String(ss).padStart(2, "0")}</b>s</span>
                  </>
                )}
              </div>
              <div className="contest-actions">
                <a className="contest-link" href={c.url} target="_blank" rel="noreferrer">register on leetcode ↗</a>
                <button type="button" className={`contest-check${registered ? " on" : ""}`} onClick={(e) => toggleRegistered(c, e)}>
                  {registered ? "✓ registered" : "i registered"}
                </button>
              </div>
              <p className="contest-note">{registered ? "// reminders off for this one. good luck!" : "// reminder 24h and 2h before, until you tick it off"}</p>
            </div>
          );
        })}
        {contests.length === 0 && <p className="empty-note">{"// "}couldn&apos;t load the contest schedule. is the backend running?</p>}
      </div>

      <div className="panel rating-panel reveal" style={d(2)}>
        <p className="panel-title" style={{ marginBottom: 14 }}>contest<span className="ext">.rating</span> <span className="panel-sub">· from leetcode.com/u/{currentUser?.leetcodeUsername}</span></p>
        <div className="lc-rating-head">
          <div>
            <p className="lc-rating-label">Contest Rating</p>
            <p className="lc-rating-big">
              {contestHistory?.summary?.rating
                ? Math.round(contestHistory.summary.rating).toLocaleString()
                : ratingPoints.length ? Math.round(ratingPoints[ratingPoints.length - 1].rating).toLocaleString() : "—"}
            </p>
          </div>
          <div>
            <p className="lc-rating-label">Global Ranking</p>
            <p className="lc-rating-val">
              {contestHistory?.summary?.globalRanking ? contestHistory.summary.globalRanking.toLocaleString() : "—"}
              {contestHistory?.summary?.totalParticipants ? <span>/{contestHistory.summary.totalParticipants.toLocaleString()}</span> : null}
            </p>
          </div>
          <div>
            <p className="lc-rating-label">Attended</p>
            <p className="lc-rating-val">{contestHistory?.summary?.attendedContestsCount ?? ratingPoints.length}</p>
          </div>
          {contestHistory?.summary?.topPercentage != null && (
            <div>
              <p className="lc-rating-label">Top</p>
              <p className="lc-rating-val">{contestHistory.summary.topPercentage}%</p>
            </div>
          )}
        </div>
        {ratingPoints.length === 0 ? (
          <p className="empty-note">{"// "}no contests yet. your first one sets the baseline.</p>
        ) : (
          <div className="rating-wrap" onMouseLeave={() => setRatingHover(null)}>
            <svg
              className="rating-svg"
              viewBox={`0 0 ${RATING_W} ${RATING_H}`}
              role="img"
              aria-label={`Contest rating over ${ratingPoints.length} contests, latest ${Math.round(ratingPoints[ratingPoints.length - 1].rating)}`}
              onMouseMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - box.left) / box.width) * RATING_W;
                let best = 0;
                ratingPoints.forEach((_, i) => { if (Math.abs(ratingX(i) - x) < Math.abs(ratingX(best) - x)) best = i; });
                setRatingHover(best);
              }}
            >
              {ratingTicks.map((t) => (
                <g key={t}>
                  <line x1={RATING_PAD.l} x2={RATING_W - RATING_PAD.r} y1={ratingY(t)} y2={ratingY(t)} className="r-grid" />
                  <text x={RATING_PAD.l - 8} y={ratingY(t) + 3} textAnchor="end" className="r-axis">{t}</text>
                </g>
              ))}
              <path d={`${ratingPath} L${ratingX(ratingPoints.length - 1)},${RATING_H - RATING_PAD.b} L${ratingX(0)},${RATING_H - RATING_PAD.b} Z`} className="r-area" />
              <path d={ratingPath} className="r-line" pathLength={1} />
              {ratingHover !== null && (
                <line x1={ratingX(ratingHover)} x2={ratingX(ratingHover)} y1={RATING_PAD.t} y2={RATING_H - RATING_PAD.b} className="r-cross" />
              )}
              {ratingPoints.map((p, i) => (
                <circle key={`${p.title}-${i}`} cx={ratingX(i)} cy={ratingY(p.rating)} r={ratingHover === i ? 6 : 4} className={`r-dot${ratingHover === i ? " on" : ""}`} style={{ "--d": i } as React.CSSProperties} />
              ))}
              {ratingHover === null && (() => {
                // Latest rating labelled beside the last point, like LeetCode's profile chart.
                const i = ratingPoints.length - 1;
                const label = Math.round(ratingPoints[i].rating).toLocaleString();
                const w = label.length * 8 + 14;
                const lx = Math.max(RATING_PAD.l, ratingX(i) - w - 12);
                const ly = ratingY(ratingPoints[i].rating) - 10;
                return (
                  <g className="r-last">
                    <rect x={lx} y={ly - 10} width={w} height={22} rx={5} />
                    <text x={lx + w / 2} y={ly + 5} textAnchor="middle">{label}</text>
                  </g>
                );
              })()}
              {[0, ratingPoints.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
                <text key={`x-${i}`} x={ratingX(i)} y={RATING_H - 8} textAnchor={i === 0 && ratingPoints.length > 1 ? "start" : "end"} className="r-axis">
                  {new Date(ratingPoints[i].startTime * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" }).toLowerCase()}
                </text>
              ))}
            </svg>
            {ratingHover !== null && (() => {
              const p = ratingPoints[ratingHover];
              const prev = ratingHover > 0 ? ratingPoints[ratingHover - 1].rating : null;
              const change = prev === null ? null : Math.round(p.rating - prev);
              return (
                <div className="rating-tip" style={{ left: `${(ratingX(ratingHover) / RATING_W) * 100}%` }}>
                  <p className="rating-tip-name">{p.title}</p>
                  <p>{new Date(p.startTime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toLowerCase()}</p>
                  <p><b>{Math.round(p.rating)}</b> rating{change !== null && <span className={change >= 0 ? "ok" : "bad"}> ({change >= 0 ? "+" : ""}{change})</span>}</p>
                  <p>{p.problemsSolved}/{p.totalProblems} solved{p.ranking ? ` · rank ${p.ranking.toLocaleString()}` : ""}</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div className="login-screen">
        <style>{`
          .login-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px; background:
            radial-gradient(900px 500px at 85% -10%, rgba(242,180,60,0.10), transparent 60%),
            radial-gradient(700px 400px at -10% 110%, rgba(116,182,255,0.06), transparent 60%),
            radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px) 0 0 / 22px 22px, #0c0c0b; }
          .term { width: 100%; max-width: 520px; background: rgba(18,18,16,0.92); border: 1px solid #262520; border-radius: 10px; box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(242,180,60,0.04); overflow: hidden; animation: termIn 0.7s cubic-bezier(.2,.8,.2,1) both; backdrop-filter: blur(8px); }
          @keyframes termIn { from { opacity: 0; transform: translateY(16px) scale(.985); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
          .term-bar { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #1c1b18; background: #141412; }
          .term-dot { width: 11px; height: 11px; border-radius: 50%; }
          .term-title { margin-left: 10px; font-size: 12px; color: #8d897f; }
          .term-body { padding: 28px 28px 30px; }
          .t-cm { color: #5f5c55; font-size: 13px; line-height: 1.9; }
          .t-prompt { font-size: 14px; color: #ebe8e1; margin: 4px 0 22px; }
          .t-prompt .a { color: #f2b43c; } .t-prompt .p { color: #f2b43c; } .t-prompt .s { color: #5f5c55; }
          .t-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
          .t-logo-box { font-weight: 800; color: #0c0c0b; background: #f2b43c; border-radius: 5px; padding: 3px 6px; font-size: 13px; }
          .t-logo-text { font-weight: 700; font-size: 18px; color: #ebe8e1; }
          .t-logo-ver { color: #5f5c55; font-size: 12px; }
          .t-field { display: flex; align-items: center; gap: 10px; border: 1px solid #262520; background: #0f0f0d; border-radius: 6px; padding: 0 12px; margin-bottom: 12px; transition: border-color .2s, box-shadow .2s; }
          .t-field:focus-within { border-color: rgba(242,180,60,0.6); box-shadow: 0 0 0 4px rgba(242,180,60,0.08); }
          .t-key { color: #74b6ff; font-size: 13px; white-space: nowrap; }
          .t-key i { color: #5f5c55; font-style: normal; }
          .t-input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: #ebe8e1; font-size: 14px; padding: 12px 0; }
          .t-input::placeholder { color: #4a4843; }
          .t-err { color: #f0766b; font-size: 12.5px; display: flex; align-items: center; gap: 6px; margin: 4px 0 10px; }
          .t-btn { width: 100%; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 10px; background: #f2b43c; color: #0c0c0b; border: none; border-radius: 6px; padding: 13px; font-weight: 800; font-size: 14px; transition: transform .15s, box-shadow .2s, background .2s; }
          .t-btn:hover { background: #f6c25a; box-shadow: 0 10px 30px rgba(242,180,60,0.25); transform: translateY(-1px); }
          .t-caret { display: inline-block; width: 8px; height: 16px; background: #f2b43c; vertical-align: -2px; margin-left: 4px; animation: blink 1.05s steps(1) infinite; }
          @keyframes blink { 50% { opacity: 0; } }
          @media (prefers-reduced-motion: reduce) { .term, .t-caret { animation: none; } }
        `}</style>
        <div className="term">
          <div className="term-bar">
            <span className="term-dot" style={{ background: "#f0766b" }} />
            <span className="term-dot" style={{ background: "#f2b43c" }} />
            <span className="term-dot" style={{ background: "#8fd47e" }} />
            <span className="term-title">~/prepboard — login</span>
          </div>
          <div className="term-body">
            <div className="t-logo">
              <span className="t-logo-box">{"{P}"}</span>
              <span className="t-logo-text">prepboard</span>
              <span className="t-logo-ver">v0.4</span>
            </div>
            <p className="t-cm">{"// "}small reps compound. show up, then look back.</p>
            <p className="t-prompt"><span className="a">➜</span> <span className="p">~/prepboard</span> <span className="s">$</span> ./start-session<span className="t-caret" /></p>
            <form onSubmit={handleAuth}>
              <label className="t-field">
                <span className="t-key">name<i>:</i></span>
                <input className="t-input" type="text" placeholder="Akshita Sahu" value={name} onChange={e => setName(e.target.value)} />
              </label>
              <label className="t-field">
                <span className="t-key">email<i>:</i></span>
                <input className="t-input" type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </label>
              <label className="t-field">
                <span className="t-key">leetcode<i>:</i></span>
                <input className="t-input" type="text" required placeholder="your leetcode username" value={leetcodeUsername} onChange={e => setLeetcodeUsername(e.target.value)} />
              </label>
              {authError && <p className="t-err"><AlertCircle size={14} /> {authError}</p>}
              <button type="submit" className="t-btn">
                open dashboard <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        /* ── Shell ─────────────────────────────────────────── */
        .shell { display: flex; height: 100vh; overflow: hidden; color: var(--text); font-family: var(--font-code); background:
          radial-gradient(1100px 520px at 100% -10%, rgba(242,180,60,0.07), transparent 60%),
          radial-gradient(800px 420px at 30% 120%, rgba(116,182,255,0.04), transparent 60%),
          var(--bg); }

        /* syntax tokens */
        .kw { color: var(--blue); } .fn { color: var(--amber); } .var { color: var(--amber); } .str { color: var(--green); }
        .num { color: var(--amber); } .op, .punct { color: var(--mute); } .cm { color: var(--mute); } .hl { color: var(--text); }
        .ok { color: var(--green); } .bad { color: var(--red); } .flag { color: var(--purple); }

        /* ── Sidebar ───────────────────────────────────────── */
        .sidebar { width: 264px; min-width: 264px; display: flex; flex-direction: column; border-right: 1px solid var(--line-soft); background: rgba(14,14,12,0.86); backdrop-filter: blur(10px); }
        .logo { display: flex; align-items: center; gap: 10px; padding: 20px 18px 18px; border-bottom: 1px solid var(--line-soft); }
        .logo-box { font-weight: 800; font-size: 13px; color: #0c0c0b; background: var(--amber); padding: 3px 6px; border-radius: 4px; box-shadow: 0 0 18px rgba(242,180,60,0.35); }
        .logo-text { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; }
        .logo-ver { font-size: 11.5px; color: var(--mute); margin-left: 2px; }

        .ws { position: relative; padding: 14px 12px; border-bottom: 1px solid var(--line-soft); }
        .ws-card { display: flex; align-items: center; gap: 11px; width: 100%; padding: 9px 10px; background: transparent; border: 1px solid transparent; border-radius: 6px; color: inherit; text-align: left; transition: background .2s, border-color .2s; }
        .ws-card:hover { background: var(--panel-2); border-color: var(--line); }
        .ws-avatar { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid rgba(242,180,60,0.45); color: var(--amber); font-size: 11px; font-weight: 800; border-radius: 4px; background: rgba(242,180,60,0.07); }
        .ws-info { flex: 1; min-width: 0; }
        .ws-label { font-size: 9.5px; letter-spacing: 1.6px; color: var(--mute); text-transform: uppercase; }
        .ws-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-chevron { color: var(--mute); transition: transform .25s; }
        .ws-chevron.open { transform: rotate(180deg); }
        .ws-dropdown { position: absolute; left: 12px; right: 12px; top: calc(100% - 6px); z-index: 60; background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 4px; box-shadow: 0 18px 40px rgba(0,0,0,.55); animation: pop .18s cubic-bezier(.2,.8,.2,1); }
        .ws-dropdown button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; background: transparent; border: none; border-radius: 4px; color: var(--red); font-size: 13px; }
        .ws-dropdown button:hover { background: rgba(240,118,107,0.08); }

        .explorer-head { display: flex; align-items: center; gap: 12px; padding: 18px 18px 8px; font-size: 10px; letter-spacing: 2px; color: var(--mute); }
        .explorer-head::after { content: ""; flex: 1; height: 1px; background: var(--line-soft); }
        .files { display: flex; flex-direction: column; padding: 4px 10px; gap: 2px; flex: 1; }
        .file { position: relative; display: flex; align-items: center; gap: 12px; padding: 9px 12px; border: none; border-radius: 4px; background: transparent; color: var(--dim); font-size: 14px; text-align: left; transition: background .2s, color .2s; }
        .file:hover { background: rgba(255,255,255,0.025); color: var(--text); }
        .file .idx { font-size: 11px; color: var(--mute); width: 16px; }
        .file.active { color: var(--text); background: linear-gradient(90deg, rgba(242,180,60,0.10), rgba(242,180,60,0.02) 70%, transparent); }
        .file.active::before { content: ""; position: absolute; left: -10px; top: 6px; bottom: 6px; width: 2px; background: var(--amber); border-radius: 2px; box-shadow: 0 0 10px var(--amber); }
        .file.active .idx { color: var(--amber); }
        .file-badge { margin-left: auto; font-size: 10.5px; color: var(--mute); border: 1px solid var(--line); border-radius: 99px; padding: 1px 7px; }
        .file.active .file-badge { color: var(--amber); border-color: rgba(242,180,60,0.35); }

        .side-foot { padding: 14px 16px 16px; border-top: 1px solid var(--line-soft); display: flex; flex-direction: column; gap: 10px; }
        .side-stat { font-size: 12px; color: var(--mute); line-height: 1.7; }
        .side-stat b { color: var(--text); font-weight: 600; }
        .logout { display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid var(--line); border-radius: 4px; color: var(--dim); font-size: 12.5px; padding: 8px 10px; transition: color .2s, border-color .2s, background .2s; }
        .logout:hover { color: var(--red); border-color: rgba(240,118,107,.35); background: rgba(240,118,107,.05); }

        /* ── Main ──────────────────────────────────────────── */
        .main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
        .topbar { height: 50px; min-height: 50px; display: flex; align-items: center; gap: 16px; padding: 0 22px 0 28px; border-bottom: 1px solid var(--line-soft); background: rgba(12,12,11,0.6); backdrop-filter: blur(10px); }
        .sync-line { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--mute); flex: 1; min-width: 0; white-space: nowrap; }
        .sync-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 0 rgba(242,180,60,.6); animation: pulse 2.4s infinite; }
        .sync-line .arrow { color: var(--mute); }
        .sync-line .when { color: var(--amber); }
        .sync-msg { color: var(--green); }
        .sync-btn { display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid var(--line); border-radius: 5px; color: var(--dim); font-size: 12.5px; padding: 6px 12px; transition: color .2s, border-color .2s, background .2s; }
        .sync-btn:hover:not(:disabled) { color: var(--amber); border-color: rgba(242,180,60,.45); background: rgba(242,180,60,.05); }
        .sync-btn:disabled { opacity: .6; cursor: progress; }
        .spin { animation: spin 1s linear infinite; }

        .search { position: relative; width: min(380px, 38vw); }
        .search-box { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: 6px; padding: 0 8px 0 12px; height: 34px; background: rgba(255,255,255,0.015); transition: border-color .2s, box-shadow .2s; }
        .search-box:focus-within { border-color: rgba(242,180,60,.5); box-shadow: 0 0 0 4px rgba(242,180,60,.07); }
        .search-box svg { color: var(--mute); flex-shrink: 0; }
        .search-box input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-size: 13px; }
        .search-box input::placeholder { color: var(--mute); }
        .kbd { font-size: 11px; color: var(--mute); border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
        .search-results { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 70; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 6px; box-shadow: 0 24px 60px rgba(0,0,0,.6); animation: pop .16s cubic-bezier(.2,.8,.2,1); }
        .search-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: none; border-radius: 5px; background: transparent; color: var(--text); font-size: 13px; text-align: left; }
        .search-item.on, .search-item:hover { background: rgba(242,180,60,.09); }
        .search-kind { font-size: 10.5px; color: var(--mute); width: 46px; flex-shrink: 0; }
        .search-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .search-meta { font-size: 11px; color: var(--mute); }
        .search-empty { padding: 10px; font-size: 12.5px; color: var(--mute); }

        .tabs { display: flex; border-bottom: 1px solid var(--line-soft); background: rgba(12,12,11,0.4); overflow-x: auto; }
        .tab { position: relative; display: flex; align-items: center; gap: 9px; padding: 11px 22px; min-width: 150px; border: none; border-right: 1px solid var(--line-soft); background: transparent; color: var(--mute); font-size: 13px; white-space: nowrap; transition: color .2s, background .2s; }
        .tab:hover { color: var(--dim); background: rgba(255,255,255,0.015); }
        .tab .tab-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--line); transition: background .2s, box-shadow .2s; }
        .tab.active { color: var(--text); background: rgba(242,180,60,0.035); }
        .tab.active .tab-dot { background: var(--amber); box-shadow: 0 0 8px var(--amber); }
        .tab::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 2px; background: var(--amber); transform: scaleX(0); transform-origin: left; transition: transform .35s cubic-bezier(.2,.8,.2,1); }
        .tab.active::after { transform: scaleX(1); }

        .content { flex: 1; min-height: 0; overflow-y: auto; padding: 44px 46px 70px; scroll-behavior: smooth; }
        /* "backwards" (not "both"): once finished, the animation leaves no transform/filter behind, so fixed tooltips position correctly. */
        .view > .reveal { animation: rise .6s cubic-bezier(.2,.8,.2,1) backwards; animation-delay: calc(var(--d, 0) * 70ms); }

        .statusbar { height: 26px; min-height: 26px; display: flex; align-items: center; gap: 18px; padding: 0 16px; font-size: 11px; color: var(--mute); border-top: 1px solid var(--line-soft); background: #0e0e0c; }
        .statusbar .sb-accent { color: var(--amber); }
        .statusbar .sb-right { margin-left: auto; display: flex; gap: 18px; }

        /* ── Hero ──────────────────────────────────────────── */
        .hero { margin-bottom: 34px; }
        .hero p { font-size: 15px; line-height: 1.9; }
        .prompt { color: var(--text); font-weight: 600; }
        .prompt .arrow, .prompt .path { color: var(--amber); }
        .prompt .dollar { color: var(--mute); }
        .hero-code { font-size: clamp(34px, 5.4vw, 60px); font-weight: 500; letter-spacing: -1px; line-height: 1.15; margin: 22px 0 18px; white-space: nowrap; overflow: hidden; text-overflow: clip; }
        .hero-code .str { color: var(--text); }
        .hero-code .q { color: var(--green); }
        .typed { display: inline-block; vertical-align: bottom; overflow: hidden; white-space: nowrap; width: calc(var(--n) * 1ch); animation: typing calc(var(--n) * 90ms) steps(var(--n)) .35s both; }
        .caret { display: inline-block; width: .5ch; height: .95em; margin-left: .15ch; vertical-align: -.1em; background: var(--amber); animation: blink 1.05s steps(1) infinite; box-shadow: 0 0 14px rgba(242,180,60,.5); }

        /* ── Panels ────────────────────────────────────────── */
        .panel { position: relative; background: linear-gradient(180deg, rgba(23,23,20,0.92), rgba(17,17,15,0.92)); border: 1px solid var(--line-soft); border-radius: 8px; padding: 20px 22px; overflow: hidden; transition: border-color .3s, transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s; }
        .panel::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .35s; background: radial-gradient(380px circle at var(--mx, 50%) var(--my, 50%), rgba(242,180,60,0.07), transparent 45%); }
        .panel:hover { border-color: var(--line); box-shadow: 0 18px 50px rgba(0,0,0,.28); }
        .panel:hover::before { opacity: 1; }
        .panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .panel-title { font-size: 14.5px; font-weight: 700; }
        .panel-title .ext { color: var(--mute); font-weight: 400; }
        .panel-sub { font-size: 12px; color: var(--mute); }

        .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
        /* Stat cards: on hover the border turns amber and a thick amber bar runs down the right edge, top to bottom. */
        .stat { padding: 22px 34px 22px 22px; border-radius: 2px; transition: border-color .35s, transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s; }
        .stat::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; width: 14px; background: var(--amber); transform: scaleY(0); transform-origin: top; transition: transform .55s cubic-bezier(.65,0,.35,1); box-shadow: 0 0 18px rgba(242,180,60,.35); }
        .stat:hover { border-color: var(--amber); transform: translateY(-2px); box-shadow: 0 18px 40px rgba(0,0,0,.35); }
        .stat:hover::after { transform: scaleY(1); }
        .stat .stat-key { display: flex; align-items: center; font-size: 11.5px; color: var(--dim); margin-bottom: 18px; letter-spacing: 1.2px; text-transform: uppercase; }
        .stat .stat-key::before { content: ""; width: 11px; height: 11px; margin-right: 10px; background: var(--amber); flex-shrink: 0; transition: transform .35s; }
        .stat:hover .stat-key::before { transform: rotate(90deg); }
        .stat .stat-key b { color: var(--blue); font-weight: 600; }
        .stat-value { font-size: 46px; font-weight: 800; letter-spacing: -2px; line-height: 1; }
        .stat-value small { font-size: 14px; color: var(--mute); font-weight: 500; margin-left: 6px; letter-spacing: 0; }
        .stat-value.amber { color: var(--amber); }
        .stat-foot { margin-top: 12px; font-size: 12px; color: var(--mute); line-height: 1.6; }
        .meter { height: 4px; border-radius: 4px; background: var(--line-soft); overflow: hidden; margin-top: 14px; display: flex; }
        .meter > span { height: 100%; transform-origin: left; animation: grow 1.1s cubic-bezier(.2,.8,.2,1) .3s both; }

        /* ── Contribution graph ────────────────────────────── */
        .heat-panel { margin-bottom: 16px; }
        .heat-wrap { position: relative; overflow-x: auto; padding: 4px 2px 6px; }
        .heat { display: grid; min-width: 760px; grid-template-columns: 28px repeat(53, minmax(0, 1fr)); grid-template-rows: 16px; grid-auto-rows: auto; gap: 3px; }
        .heat-month { grid-row: 1; font-size: 10.5px; color: var(--mute); white-space: nowrap; }
        .heat-dow { grid-column: 1; font-size: 10px; color: var(--mute); align-self: center; }
        .heat-cell { width: 100%; aspect-ratio: 1; max-width: 22px; border-radius: 3px; border: none; padding: 0; background: rgba(255,255,255,0.045); animation: cellIn .5s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--w) * 9ms + 120ms); transition: transform .15s, box-shadow .2s, outline-color .2s; outline: 1px solid transparent; outline-offset: 1px; }
        .heat-cell.level-1 { background: rgba(242,180,60,0.26); }
        .heat-cell.level-2 { background: rgba(242,180,60,0.48); }
        .heat-cell.level-3 { background: rgba(242,180,60,0.74); }
        .heat-cell.level-4 { background: #f2b43c; box-shadow: 0 0 10px rgba(242,180,60,.35); }
        .heat-cell.future { opacity: 0; pointer-events: none; }
        .heat-cell.today { outline-color: var(--text); }
        .heat-cell:hover { transform: scale(1.35); z-index: 2; box-shadow: 0 0 0 1px rgba(242,180,60,.6), 0 0 14px rgba(242,180,60,.45); }
        .heat-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; font-size: 11.5px; color: var(--mute); flex-wrap: wrap; }
        .legend { display: flex; align-items: center; gap: 4px; }
        .legend .heat-cell { animation: none; width: 11px; height: 11px; aspect-ratio: auto; }
        .heat-tip.below { transform: translate(-50%, 10px) !important; }
        .heat-tip { position: fixed; z-index: 80; transform: translate(-50%, calc(-100% - 10px)); width: 250px; background: #1a1a17; border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px; box-shadow: 0 18px 40px rgba(0,0,0,.6); pointer-events: none; animation: pop .14s ease-out; }
        .heat-tip-date { font-size: 11.5px; color: var(--amber); margin-bottom: 6px; }
        .heat-tip-item { font-size: 12px; color: var(--text); line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .heat-tip-item::before { content: "+ "; color: var(--green); }
        .heat-tip-none { font-size: 12px; color: var(--mute); }

        /* ── Bottom grid ───────────────────────────────────── */
        .bottom-grid { display: grid; grid-template-columns: 1.05fr 1.4fr 0.85fr; gap: 14px; align-items: stretch; margin-bottom: 16px; }
        .focus-box, .weekly-box, .nudge-box { display: flex; flex-direction: column; }
        .focus-ring { position: relative; width: 44px; height: 44px; flex-shrink: 0; }
        .focus-ring-svg { width: 44px; height: 44px; transform: rotate(-90deg); }
        .focus-ring-bg { fill: none; stroke: var(--line); stroke-width: 3.5; }
        .focus-ring-fg { fill: none; stroke: var(--amber); stroke-width: 3.5; stroke-linecap: round; transition: stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1); filter: drop-shadow(0 0 4px rgba(242,180,60,.5)); }
        .focus-ring-label { position: absolute; inset: 0; display: grid; place-items: center; font-size: 10.5px; font-weight: 700; color: var(--amber); }
        .focus-date-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px; color: var(--mute); }

        .task-item { display: flex; align-items: flex-start; gap: 11px; padding: 10px 8px; border-radius: 5px; cursor: pointer; transition: background .2s; }
        .task-item + .task-item { border-top: 1px dashed var(--line-soft); }
        .task-item:hover { background: rgba(255,255,255,0.025); }
        .task-item:hover .task-delete-btn { opacity: 1; }
        .task-cb { width: 17px; height: 17px; margin-top: 1px; border: 1.5px solid var(--mute); border-radius: 4px; display: grid; place-items: center; flex-shrink: 0; transition: background .2s, border-color .2s, transform .2s; }
        .task-cb.done { background: var(--amber); border-color: var(--amber); animation: tick .35s cubic-bezier(.2,.8,.2,1); }
        .task-icon-box { display: none; }
        .task-body { flex: 1; min-width: 0; }
        .task-label { font-size: 13px; line-height: 1.4; transition: color .2s; }
        .task-label.done { color: var(--mute); text-decoration: line-through; text-decoration-color: var(--amber); }
        .task-tag { font-size: 11px; color: var(--mute); margin-top: 3px; }
        .task-tag::before { content: "# "; color: var(--purple); }
        .task-actions { display: flex; align-items: center; gap: 6px; }
        .task-status { font-size: 10.5px; color: var(--mute); }
        .task-status.done { color: var(--green); }
        .task-delete-btn { opacity: 0; background: transparent; border: none; color: var(--mute); padding: 2px; display: grid; place-items: center; transition: opacity .2s, color .2s; }
        .task-delete-btn:hover { color: var(--red); }
        .add-task-row { margin-top: auto; padding-top: 12px; }
        .add-task-btn { width: 100%; display: flex; align-items: center; gap: 8px; background: transparent; border: 1px dashed var(--line); border-radius: 5px; color: var(--mute); font-size: 12.5px; padding: 9px 12px; transition: color .2s, border-color .2s, background .2s; }
        .add-task-btn:hover { color: var(--amber); border-color: rgba(242,180,60,.45); background: rgba(242,180,60,.04); }
        .add-task-form { display: flex; flex-direction: column; gap: 10px; }
        .add-task-input { width: 100%; background: #0f0f0d; border: 1px solid rgba(242,180,60,.5); border-radius: 5px; padding: 9px 12px; color: var(--text); font-size: 13px; outline: none; }
        .add-task-options { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        .icon-selector { display: flex; align-items: center; gap: 5px; }
        .icon-opt { padding: 5px 8px; background: transparent; border: 1px solid var(--line); border-radius: 4px; color: var(--mute); display: grid; place-items: center; }
        .icon-opt.selected { border-color: var(--amber); color: var(--amber); background: rgba(242,180,60,.07); }
        .add-task-confirm { background: var(--amber); border: none; border-radius: 4px; padding: 7px 14px; font-size: 12px; font-weight: 700; color: #0c0c0b; }
        .add-task-cancel { background: transparent; border: 1px solid var(--line); border-radius: 4px; padding: 6px; color: var(--mute); display: grid; place-items: center; }

        .weekly-total { font-size: 12px; color: var(--mute); text-align: right; }
        .weekly-total span { color: var(--amber); font-weight: 700; font-size: 14px; }
        .chart-wrapper { position: relative; width: 100%; height: 210px; margin: 6px 0 12px; }
        .chart-grid { position: absolute; left: 0; top: 0; bottom: 44px; width: 100%; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
        .y-tick-row { display: flex; align-items: center; height: 1px; }
        .y-tick-label { font-size: 10.5px; color: var(--mute); width: 22px; text-align: right; margin-right: 10px; }
        .y-grid-line { flex: 1; height: 1px; background: repeating-linear-gradient(90deg, var(--line-soft) 0 4px, transparent 4px 8px); }
        .chart-bars-area { position: absolute; left: 32px; right: 0; top: 0; bottom: 0; display: flex; justify-content: space-around; align-items: flex-end; }
        .bar-column { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; width: 44px; cursor: pointer; }
        .bar-track { position: relative; width: 22px; height: 158px; display: flex; align-items: flex-end; justify-content: center; }
        .bar-solid { width: 100%; border-radius: 3px 3px 1px 1px; background: linear-gradient(180deg, rgba(242,180,60,.95), rgba(223,148,38,.55)); transform-origin: bottom; animation: barUp .9s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--d, 0) * 70ms + 250ms); transition: height .5s cubic-bezier(.2,.8,.2,1), box-shadow .2s, filter .2s; position: relative; }
        .bar-column:hover .bar-solid { filter: brightness(1.15); box-shadow: 0 0 18px rgba(242,180,60,.45); }
        .bar-solid.today { background: linear-gradient(180deg, #ffd27a, #f2b43c); box-shadow: 0 0 16px rgba(242,180,60,.4); }
        .bar-empty { width: 100%; height: 2px; background: var(--line); border-radius: 2px; }
        .bar-badge { position: absolute; top: -20px; left: 50%; transform: translateX(-50%); font-size: 10.5px; font-weight: 700; color: var(--amber); }
        .bar-day-name { font-size: 11px; color: var(--mute); margin-top: 8px; }
        .bar-day-name.today { color: var(--amber); }
        .bar-day-date { font-size: 10px; color: var(--mute); opacity: .7; margin-top: 1px; }
        .bar-day-date.today { color: var(--amber); opacity: 1; }
        .day-tooltip { position: absolute; bottom: calc(100% + 26px); left: 50%; transform: translateX(-50%); width: 220px; background: #1a1a17; border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px; box-shadow: 0 18px 40px rgba(0,0,0,.6); z-index: 30; text-align: left; animation: pop .14s ease-out; }
        .day-tooltip-title { font-size: 11px; color: var(--amber); margin-bottom: 6px; }
        .day-tooltip-list { display: flex; flex-direction: column; gap: 3px; max-height: 126px; overflow-y: auto; }
        .day-tooltip-item { font-size: 11.5px; color: var(--text); line-height: 1.35; }
        .day-tooltip-empty { font-size: 11.5px; color: var(--mute); }
        .weekly-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--line-soft); font-size: 11.5px; color: var(--mute); margin-top: auto; }
        .weekly-footer b { color: var(--amber); font-weight: 600; }

        .nudge-time-block { margin: 4px 0 14px; }
        .nudge-time { font-size: 40px; font-weight: 700; letter-spacing: -1.5px; line-height: 1; }
        .nudge-cron { font-size: 11.5px; color: var(--mute); margin-top: 8px; }
        .nudge-cron b { color: var(--purple); font-weight: 500; }
        .nudge-time-label { font-size: 12px; color: var(--amber); margin-top: 6px; }
        .nudge-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-top: 1px dashed var(--line-soft); font-size: 12.5px; }
        .nudge-row-label { display: flex; align-items: center; gap: 8px; color: var(--dim); }
        .nudge-row-val { font-weight: 700; }
        .nudge-enable { font-size: 12px; color: var(--amber); background: transparent; border: none; padding: 0; }
        .nudge-car-actions { display: flex; align-items: center; gap: 12px; }
        .nudge-switch { position: relative; width: 30px; height: 17px; border-radius: 99px; border: 1px solid var(--line); background: var(--line-soft); padding: 0; transition: background .25s, border-color .25s; }
        .nudge-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: var(--mute); transition: transform .25s cubic-bezier(.2,.8,.2,1), background .25s; }
        .nudge-switch.on { background: rgba(242,180,60,.2); border-color: rgba(242,180,60,.6); }
        .nudge-switch.on::after { transform: translateX(13px); background: var(--amber); box-shadow: 0 0 8px rgba(242,180,60,.6); }
        .nudge-car-msg { font-size: 11.5px; color: var(--mute); margin-top: 6px; line-height: 1.5; }
        .nudge-error { margin-top: 8px; color: #f3a29a; font-size: 11.5px; line-height: 1.5; }
        .edit-sched-btn { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: auto; background: transparent; border: 1px solid var(--line); border-radius: 5px; padding: 9px 12px; color: var(--dim); font-size: 12.5px; transition: color .2s, border-color .2s; }
        .edit-sched-btn:hover { color: var(--amber); border-color: rgba(242,180,60,.45); }
        .sched-editor { margin-top: 12px; border: 1px solid var(--line); border-radius: 6px; padding: 12px; animation: pop .16s ease-out; }
        .sched-field-label { font-size: 11px; color: var(--mute); margin-bottom: 6px; }
        .sched-input { width: 100%; background: #0f0f0d; border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; color: var(--text); font-size: 13px; outline: none; color-scheme: dark; }
        .sched-input:focus { border-color: var(--amber); }
        .sched-actions { display: flex; gap: 8px; margin-top: 10px; }
        .sched-save { flex: 1; background: var(--amber); color: #0c0c0b; border: none; border-radius: 4px; padding: 8px; font-weight: 700; font-size: 12.5px; }
        .sched-cancel { background: transparent; border: 1px solid var(--line); border-radius: 4px; padding: 8px 12px; color: var(--dim); font-size: 12.5px; }

        /* ── git log rows (overview + problems) ────────────── */
        .log-row { display: grid; grid-template-columns: 16px 74px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 8px 6px; border-radius: 4px; font-size: 13px; transition: background .2s; }
        .log-row:hover { background: rgba(255,255,255,0.025); }
        .log-row .graph { color: var(--amber); text-align: center; }
        .log-row .hash { color: var(--amber); opacity: .85; font-size: 12px; }
        .log-row a { color: var(--text); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color .2s; }
        .log-row a:hover { color: var(--amber); }
        .log-row .when { color: var(--mute); font-size: 11.5px; white-space: nowrap; }
        .diff { font-size: 10.5px; padding: 1px 7px; border-radius: 99px; border: 1px solid currentColor; white-space: nowrap; }
        .diff.easy { color: var(--green); } .diff.medium { color: var(--amber); } .diff.hard { color: var(--red); } .diff.none { color: var(--mute); }
        .link-btn { background: transparent; border: none; color: var(--amber); font-size: 12px; padding: 0; }
        .link-btn:hover { text-decoration: underline; }
        .empty-note { font-size: 13px; color: var(--mute); padding: 10px 6px; }

        /* ── Views: shared heading ─────────────────────────── */
        .view-head { margin-bottom: 26px; }
        .view-head .cm { font-size: 14px; line-height: 1.9; }
        .view-title { font-size: clamp(28px, 4vw, 44px); font-weight: 500; letter-spacing: -1px; margin-top: 10px; }

        /* ── Problems ──────────────────────────────────────── */
        .p-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
        .p-search { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: 6px; padding: 0 12px; height: 38px; background: rgba(255,255,255,0.015); transition: border-color .2s, box-shadow .2s; }
        .p-search:focus-within { border-color: rgba(242,180,60,.5); box-shadow: 0 0 0 4px rgba(242,180,60,.07); }
        .p-search span { color: var(--purple); font-size: 13px; }
        .p-search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-size: 13px; }
        .chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .chip { background: transparent; border: 1px solid var(--line); border-radius: 99px; padding: 6px 12px; color: var(--dim); font-size: 12px; transition: all .2s; }
        .chip:hover { color: var(--text); border-color: var(--mute); }
        .chip.on { color: #0c0c0b; background: var(--amber); border-color: var(--amber); }
        .chip .c { opacity: .6; margin-left: 6px; }
        .p-day { margin-top: 6px; }
        .p-day-head { display: flex; align-items: center; gap: 10px; padding: 14px 6px 6px; font-size: 12px; color: var(--mute); position: sticky; top: -44px; background: linear-gradient(180deg, var(--bg) 70%, transparent); z-index: 2; }
        .p-day-head b { color: var(--text); font-weight: 600; }
        .p-day-head button { margin-left: auto; }
        .p-day .log-row { animation: rise .45s cubic-bezier(.2,.8,.2,1) both; grid-template-columns: 16px 62px minmax(160px, 1.3fr) minmax(0, 1fr) auto auto; }
        .tag-cell { display: flex; gap: 5px; flex-wrap: nowrap; overflow: hidden; min-width: 0; }
        .tag { font-size: 10.5px; color: var(--purple); background: rgba(198,160,255,0.07); border: 1px solid rgba(198,160,255,0.2); border-radius: 3px; padding: 1px 6px; white-space: nowrap; transition: background .2s, border-color .2s; }
        button.tag:hover { background: rgba(198,160,255,0.16); border-color: rgba(198,160,255,0.45); }
        .tag.more { color: var(--mute); background: transparent; border-color: var(--line); }
        .tag-loading { font-size: 10.5px; color: var(--mute); }

        .board-hero { margin-bottom: 30px; padding-top: 6px; }
        .board-kicker { font-size: 12px; letter-spacing: 2.4px; text-transform: uppercase; color: var(--mute); }
        .board-title { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; font-size: clamp(36px, 5.6vw, 64px); font-weight: 500; letter-spacing: -1.5px; line-height: 1.1; margin: 22px 0 16px; }
        .board-count { font-size: .55em; color: var(--amber); font-weight: 600; letter-spacing: -1px; }
        .board-sub { font-size: 14.5px; line-height: 1.7; color: var(--dim); max-width: 560px; }
        .p-hint { font-size: 12.5px; color: var(--mute); margin-top: 16px; }

        /* ── Calendar view ─────────────────────────────────── */
        .lc-connect { margin-bottom: 16px; }
        .lc-connect.connected { border-color: rgba(143,212,126,.25); }
        .lc-connect-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .lc-connect-title { font-size: 14px; font-weight: 600; }
        .lc-connect-title span { color: var(--green); }
        .lc-connect-copy { font-size: 12.5px; color: var(--mute); margin-top: 4px; }
        .lc-connect-primary { background: var(--amber); color: #0c0c0b; border: none; border-radius: 5px; padding: 8px 14px; font-size: 12.5px; font-weight: 700; transition: transform .15s, box-shadow .2s; }
        .lc-connect-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(242,180,60,.22); }
        .lc-connect-primary:disabled { opacity: .6; cursor: progress; }
        .lc-connect-secondary { background: transparent; border: 1px solid var(--line); border-radius: 5px; padding: 7px 12px; color: var(--dim); font-size: 12.5px; }
        .lc-connect-secondary:hover { color: var(--red); border-color: rgba(240,118,107,.4); }
        .lc-connect-form { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--line); max-width: 640px; animation: rise .35s ease-out both; }
        .lc-connect-steps { font-size: 12.5px; line-height: 1.8; padding-left: 18px; color: var(--dim); }
        .lc-connect-steps a { color: var(--amber); }
        .lc-connect-steps b { color: var(--text); font-weight: 600; }
        .lc-connect-label { display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: var(--blue); }
        .lc-connect-label input { background: #0f0f0d; border: 1px solid var(--line); border-radius: 5px; padding: 9px 11px; color: var(--text); font-size: 13px; outline: none; }
        .lc-connect-label input:focus { border-color: var(--amber); }
        .lc-connect-note { font-size: 11.5px; color: var(--mute); line-height: 1.6; }
        .lc-connect-note::before { content: "// "; }
        .lc-connect-form .lc-connect-primary { align-self: flex-start; }
        .lc-connect-status { font-size: 12px; color: var(--green); margin-top: 10px; }
        .lc-connect-status.error { color: var(--red); }

        .planner-shell { padding: 0; }
        .planner-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--line-soft); }
        .planner-month { font-size: 18px; font-weight: 700; letter-spacing: -.3px; }
        .planner-month span { color: var(--mute); font-weight: 400; }
        .planner-actions { display: flex; align-items: center; gap: 6px; }
        .planner-today-btn { background: transparent; border: 1px solid rgba(242,180,60,.4); border-radius: 5px; color: var(--amber); padding: 6px 12px; font-size: 12px; transition: background .2s; }
        .planner-today-btn:hover { background: rgba(242,180,60,.08); }
        .planner-nav { width: 30px; height: 30px; display: grid; place-items: center; background: transparent; border: 1px solid var(--line); border-radius: 5px; color: var(--dim); transition: color .2s, border-color .2s, transform .2s; }
        .planner-nav:hover { color: var(--amber); border-color: rgba(242,180,60,.45); }
        .planner-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
        .planner-weekday { font-size: 10.5px; letter-spacing: 1.4px; color: var(--mute); text-transform: lowercase; padding: 12px 14px 10px; border-bottom: 1px solid var(--line-soft); }
        .planner-day { position: relative; display: block; width: 100%; min-width: 0; min-height: 132px; padding: 10px; text-align: left; font: inherit; color: inherit; background: transparent; border: none; border-right: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); cursor: pointer; transition: background .25s; animation: fadeUp .45s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--d, 0) * 12ms); }
        .planner-day:nth-child(7n) { border-right: none; }
        .planner-day:hover { background: rgba(242,180,60,0.035); }
        .planner-day.muted { cursor: default; background: rgba(0,0,0,0.18); }
        .planner-day.has-questions::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: linear-gradient(180deg, var(--amber), transparent); opacity: .7; }
        .planner-day.selected { background: rgba(242,180,60,0.07); box-shadow: inset 0 0 0 1px rgba(242,180,60,.5); }
        .planner-day-number { display: inline-grid; place-items: center; min-width: 24px; height: 24px; font-size: 12px; color: var(--dim); border-radius: 5px; }
        .planner-day-number.today { color: #0c0c0b; background: var(--amber); font-weight: 700; box-shadow: 0 0 16px rgba(242,180,60,.45); }
        .planner-count { float: right; font-size: 10.5px; color: var(--mute); padding-top: 6px; }
        .planner-questions { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
        .planner-question { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--text); padding: 4px 7px; border-radius: 3px; background: rgba(255,255,255,0.035); border-left: 2px solid var(--mute); transition: background .2s, transform .2s; }
        .planner-question:hover { background: rgba(242,180,60,.1); transform: translateX(2px); }
        .planner-question.diff-easy { border-left-color: var(--green); }
        .planner-question.diff-medium { border-left-color: var(--amber); }
        .planner-question.diff-hard { border-left-color: var(--red); }
        .planner-more { font-size: 10.5px; color: var(--amber); padding-left: 2px; }
        .planner-empty { font-size: 10.5px; color: var(--mute); line-height: 1.4; }
        .planner-detail { padding: 18px 20px; border-top: 1px solid var(--line-soft); background: rgba(0,0,0,0.15); animation: rise .35s ease-out both; }
        .planner-detail-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .planner-detail-title { font-size: 14px; font-weight: 600; }
        .planner-detail-title span { color: var(--mute); font-weight: 400; }
        .planner-detail-close { width: 28px; height: 28px; display: grid; place-items: center; background: transparent; border: 1px solid var(--line); border-radius: 5px; color: var(--dim); font-size: 15px; }
        .planner-detail-close:hover { color: var(--amber); border-color: rgba(242,180,60,.45); }
        .planner-detail-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; list-style: none; }
        .planner-detail-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; padding: 9px 11px; border: 1px solid var(--line-soft); border-radius: 5px; background: rgba(255,255,255,0.02); animation: fadeUp .35s ease-out both; }
        .planner-detail-list a { color: var(--text); font-size: 12.5px; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .planner-detail-list a:hover { color: var(--amber); }
        .planner-note { padding: 12px 20px; font-size: 11.5px; color: var(--mute); border-top: 1px solid var(--line-soft); }
        .planner-note::before { content: "// "; }


        /* ── Contests ──────────────────────────────────────── */
        .contest-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
        .contest-card { padding: 22px 24px; }
        .contest-card.registered { border-color: rgba(143,212,126,.35); }
        .contest-top { display: flex; align-items: center; justify-content: space-between; }
        .contest-kind { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; padding: 3px 8px; border-radius: 3px; border: 1px solid currentColor; }
        .contest-kind.weekly { color: var(--amber); }
        .contest-kind.biweekly { color: var(--blue); }
        .contest-ok { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--green); animation: pop .3s ease-out; }
        .contest-title { font-size: 22px; font-weight: 600; margin: 16px 0 4px; letter-spacing: -.4px; }
        .contest-when { font-size: 12.5px; color: var(--dim); }
        .countdown { display: flex; gap: 14px; margin: 18px 0; font-size: 12px; color: var(--mute); }
        .countdown b { font-size: 26px; color: var(--text); font-weight: 600; margin-right: 2px; font-variant-numeric: tabular-nums; }
        .countdown .live { color: var(--red); font-size: 14px; animation: blink 1.4s steps(1) infinite; }
        .contest-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .contest-link { color: var(--dim); font-size: 12.5px; text-decoration: none; border: 1px solid var(--line); border-radius: 5px; padding: 8px 12px; transition: color .2s, border-color .2s; }
        .contest-link:hover { color: var(--amber); border-color: rgba(242,180,60,.45); }
        .contest-check { background: var(--amber); color: #0c0c0b; border: none; border-radius: 5px; padding: 9px 14px; font-size: 12.5px; font-weight: 700; transition: transform .15s, box-shadow .2s, background .25s, color .25s; }
        .contest-check:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(242,180,60,.25); }
        .contest-check:active { transform: scale(.96); }
        .contest-check.on { background: rgba(143,212,126,.12); color: var(--green); box-shadow: inset 0 0 0 1px rgba(143,212,126,.5); }
        .contest-note { font-size: 11.5px; color: var(--mute); margin-top: 12px; }

        .rating-stats { display: flex; gap: 16px; font-size: 12px; color: var(--mute); flex-wrap: wrap; }
        .rating-stats b { color: var(--text); font-size: 15px; font-weight: 600; }
        .rating-wrap { position: relative; }
        .rating-svg { display: block; width: 100%; height: auto; }
        .r-grid { stroke: var(--line-soft); stroke-width: 1; }
        .r-axis { fill: var(--mute); font-size: 10.5px; font-family: var(--font-code); }
        .r-area { fill: rgba(242,180,60,0.07); animation: fadeUp .8s ease-out .6s both; }
        .r-line { fill: none; stroke: var(--amber); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.4s cubic-bezier(.65,0,.35,1) .2s forwards; }
        .r-cross { stroke: var(--mute); stroke-width: 1; stroke-dasharray: 3 3; }
        .r-dot { fill: var(--bg); stroke: var(--amber); stroke-width: 2; transition: r .15s; animation: cellIn .4s ease-out both; animation-delay: calc(var(--d) * 40ms + 600ms); }
        .r-dot.on { fill: var(--amber); }
        .rating-tip { position: absolute; top: 0; transform: translateX(-50%); background: #1a1a17; border: 1px solid var(--line); border-radius: 7px; padding: 9px 12px; font-size: 12px; line-height: 1.6; color: var(--dim); white-space: nowrap; pointer-events: none; box-shadow: 0 18px 40px rgba(0,0,0,.6); }
        .rating-tip b { color: var(--text); }
        @keyframes draw { to { stroke-dashoffset: 0; } }
        .rating-tip-name { color: var(--amber); font-weight: 600; }
        .lc-rating-head { display: flex; gap: 34px; flex-wrap: wrap; align-items: flex-start; margin-bottom: 8px; font-family: var(--font-sans); }
        .lc-rating-label { font-size: 12.5px; color: var(--dim); margin-bottom: 4px; }
        .lc-rating-big { font-size: 30px; font-weight: 600; color: var(--text); letter-spacing: -.5px; }
        .lc-rating-val { font-size: 15px; font-weight: 700; color: var(--text); padding-top: 2px; }
        .lc-rating-val span { color: var(--mute); font-weight: 500; }
        .r-last rect { fill: #1a1a17; stroke: var(--line); }
        .r-last text { fill: var(--text); font-size: 12px; font-family: var(--font-code); }
        .overview-contests { margin-top: 16px; }

        /* ── Motion ────────────────────────────────────────── */
        @keyframes rise { from { opacity: 0; transform: translateY(12px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes typing { from { width: 0; } }
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(242,180,60,.55); } 70% { box-shadow: 0 0 0 7px rgba(242,180,60,0); } 100% { box-shadow: 0 0 0 0 rgba(242,180,60,0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes grow { from { transform: scaleX(0); } }
        @keyframes barUp { from { transform: scaleY(0); } }
        @keyframes cellIn { from { opacity: 0; transform: scale(.4); } }
        @keyframes tick { 0% { transform: scale(.7); } 60% { transform: scale(1.15); } 100% { transform: none; } }
        .heat-tip { transform: translate(-50%, calc(-100% - 10px)); }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.001ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
          .typed { width: calc(var(--n) * 1ch); }
        }

        /* ── Responsive ────────────────────────────────────── */
        @media (max-width: 1200px) {
          .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .bottom-grid { grid-template-columns: 1fr 1fr; }
          .bottom-grid .weekly-box { grid-column: 1 / -1; order: -1; }
        }
        @media (max-width: 860px) {
          .sidebar { display: none; }
          .content { padding: 28px 16px 60px; }
          .topbar { padding: 0 12px 0 16px; }
          .topbar { gap: 10px; }
          .sync-line { flex: 0 0 auto; }
          .sync-line .label, .sync-line .arrow, .sync-line .when, .sync-msg { display: none; }
          .search { flex: 1; width: auto; }
          .sync-btn .txt { display: none; }
          .kbd { display: none; }
          .tab { min-width: 0; padding: 10px 14px; flex: 0 0 auto; }
          .bottom-grid { grid-template-columns: 1fr; }
          .hero-code { font-size: 30px; white-space: normal; }
          .view-title { font-size: 24px; overflow-wrap: anywhere; }
          .planner-day { min-height: 88px; padding: 6px; }
          .planner-question { font-size: 9.5px; padding: 3px 4px; }
          .planner-count { display: none; }
          .log-row { grid-template-columns: 12px 62px minmax(0, 1fr) auto; }
          .log-row .when, .tag-cell { display: none; }
          .p-day .log-row { grid-template-columns: 12px 54px minmax(0, 1fr) auto; }
          .contest-grid { grid-template-columns: 1fr; }
          .statusbar .sb-right { display: none; }
        }
      `}</style>

      <div className="shell">
        {/* ── Sidebar: explorer ─────────────────────────── */}
        <aside className="sidebar">
          <div className="logo">
            <span className="logo-box">{"{P}"}</span>
            <span className="logo-text">prepboard</span>
            <span className="logo-ver">v0.4</span>
          </div>

          <div className="ws" ref={workspaceRef}>
            <button type="button" className="ws-card" onClick={() => setWorkspaceOpen(o => !o)} aria-expanded={workspaceOpen}>
              <span className="ws-avatar">{getInitials(currentUser.name)}</span>
              <span className="ws-info">
                <span className="ws-label">workspace</span>
                <span className="ws-name" style={{ display: "block" }}>{currentUser.name.split(" ")[0].toLowerCase()}</span>
              </span>
              <ChevronDown size={14} className={`ws-chevron${workspaceOpen ? " open" : ""}`} />
            </button>
            {workspaceOpen && (
              <div className="ws-dropdown">
                <button type="button" onClick={handleLogout}><LogOut size={14} /> logout</button>
              </div>
            )}
          </div>

          <div className="explorer-head">EXPLORER</div>
          <nav className="files">
            {FILES.map((f, i) => (
              <button
                type="button"
                key={f.id}
                className={`file${activeNav === f.id ? " active" : ""}`}
                onClick={() => setActiveNav(f.id)}
              >
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                {f.file}
                {f.id === "Problems" && <span className="file-badge">{allSolved.length}</span>}
              </button>
            ))}
          </nav>

          <div className="side-foot">
            <p className="side-stat">
              <span className="cm">{"// "}</span>leetcode: <b>{currentUser.leetcodeUsername}</b><br />
              <span className="cm">{"// "}</span>active days: <b>{activeDaysThisYear}</b> / yr<br />
              <span className="cm">{"// "}</span>longest run: <b>{longestStreak}d</b>
            </p>
            <button type="button" className="logout" onClick={handleLogout}><LogOut size={13} /> $ logout</button>
          </div>
        </aside>

        {/* ── Main ──────────────────────────────────────── */}
        <div className="main">
          <header className="topbar">
            <div className="sync-line">
              <span className="sync-dot" />
              <span className="label">leetcode.sync</span>
              <span className="arrow">→</span>
              <span className="when">{syncing ? "syncing…" : lastSynced ?? "pending"}</span>
              {syncMessage && <span className="sync-msg">· {syncMessage.toLowerCase()}</span>}
            </div>

            <div className="search">
              <div className="search-box">
                <Search size={14} />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  placeholder="jump.to(problem | day | file)"
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchIndex(0); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setSearchIndex(i => Math.min(i + 1, Math.max(searchResults.length - 1, 0))); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setSearchIndex(i => Math.max(i - 1, 0)); }
                    else if (e.key === "Enter") { e.preventDefault(); pickSearchResult(searchIndex); }
                    else if (e.key === "Escape") { setSearchOpen(false); searchRef.current?.blur(); }
                  }}
                  aria-label="Jump to a problem, day or file"
                />
                <span className="kbd">Ctrl K</span>
              </div>
              {searchOpen && searchNeedle && (
                <div className="search-results" role="listbox">
                  {searchResults.length === 0 ? (
                    <p className="search-empty">{"// "}no match for &quot;{searchQuery}&quot;</p>
                  ) : searchResults.map((r, i) => (
                    <button
                      type="button"
                      key={`${r.kind}-${r.label}-${i}`}
                      className={`search-item${i === searchIndex ? " on" : ""}`}
                      onMouseDown={(e) => { e.preventDefault(); pickSearchResult(i); }}
                      onMouseEnter={() => setSearchIndex(i)}
                    >
                      <span className="search-kind">{r.kind}</span>
                      <span className="search-label">{r.label}</span>
                      {r.meta && <span className="search-meta">{r.meta}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="sync-btn" onClick={handleSync} disabled={syncing} title="Sync with LeetCode">
              <RefreshCw size={13} className={syncing ? "spin" : ""} />
<span className="txt">{syncing ? "pulling…" : "git pull"}</span>
            </button>
          </header>

          <div className="tabs" role="tablist">
            {FILES.map((f) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeNav === f.id}
                key={f.id}
                className={`tab${activeNav === f.id ? " active" : ""}`}
                onClick={() => setActiveNav(f.id)}
              >
                <span className="tab-dot" />
                {f.file}
              </button>
            ))}
          </div>

          <main className="content" ref={contentRef} onMouseMove={handleSpotlight} onScroll={() => heatHover && setHeatHover(null)}>
            {activeNav === "Overview" && (
              <section className="view" key="overview">
                {/* Greeting */}
                <div className="hero reveal" style={d(0)}>
                  <p className="cm">{"// "}session opened @ <span className="hl">{sessionStamp}</span></p>
                  <h1 className="hero-code">
                    <span className="kw">const</span>{" "}
                    <span className="var typed" style={{ "--n": greetingWord.length } as React.CSSProperties}>{greetingWord}</span>{" "}
                    <span className="op">=</span>{" "}
                    <span className="str"><span className="q">&quot;</span>{firstName}<span className="q">&quot;</span></span>
                    <span className="punct">;</span>
                    <span className="caret" aria-hidden="true" />
                  </h1>
                  <p className="cm">
                    {"// "}streak: <span className="num">{currentStreak}d</span> · solved: <span className="num">{stats.total}</span> · today:{" "}
                    <span className={solvedToday >= DAILY_TARGET ? "ok" : "bad"}>{solvedToday}/{DAILY_TARGET}</span>
                  </p>
                  <p className="cm">
                    {"// "}{milestoneAway === 1 ? "one problem" : `${milestoneAway} problems`} away from the next milestone ({nextMilestone}). keep it clean.
                  </p>
                </div>

                {/* Stats */}
                <div className="stats reveal" style={d(1)}>
                  <div className="panel stat">
                    <p className="stat-key"><b>streak</b>.current</p>
                    <div className="stat-value amber"><CountUp value={currentStreak} /><small>days</small></div>
                    <p className="stat-foot">
                      {"// "}longest ever: <span className="hl">{longestStreak}d</span>
                      {streakAtRisk && <><br /><span className="bad">{"// "}solve one today or it resets</span></>}
                      {!streakAtRisk && currentStreak > 0 && currentStreak === longestStreak && <><br /><span className="ok">{"// "}personal best, live</span></>}
                    </p>
                  </div>
                  <div className="panel stat">
                    <p className="stat-key"><b>week</b>.progress</p>
                    <div className="stat-value"><CountUp value={thisWeekPct} /><small>%</small></div>
                    <div className="meter"><span style={{ width: `${Math.min(100, thisWeekPct)}%`, background: "var(--amber)" }} /></div>
                    <p className="stat-foot"><span className={delta >= 0 ? "ok" : "bad"}>{delta >= 0 ? "+" : ""}{delta}%</span> vs last week</p>
                  </div>
                  <div className="panel stat">
                    <p className="stat-key"><b>today</b>.solved</p>
                    <div className="stat-value"><CountUp value={solvedToday} /><small>/ {DAILY_TARGET}</small></div>
                    <div className="meter"><span style={{ width: `${Math.min(100, (solvedToday / DAILY_TARGET) * 100)}%`, background: solvedToday >= DAILY_TARGET ? "var(--green)" : "var(--amber)" }} /></div>
                    <p className="stat-foot">{solvedToday >= DAILY_TARGET ? "// target hit. nice." : `// ${DAILY_TARGET - solvedToday} to go today`}</p>
                  </div>
                  <div className="panel stat">
                    <p className="stat-key"><b>total</b>.solved</p>
                    <div className="stat-value"><CountUp value={stats.total} /></div>
                    <div className="meter">
                      <span style={{ width: `${stats.total ? (stats.easy / stats.total) * 100 : 0}%`, background: "var(--green)" }} />
                      <span style={{ width: `${stats.total ? (stats.medium / stats.total) * 100 : 0}%`, background: "var(--amber)" }} />
                      <span style={{ width: `${stats.total ? (stats.hard / stats.total) * 100 : 0}%`, background: "var(--red)" }} />
                    </div>
                    <p className="stat-foot"><span className="ok">{stats.easy}e</span> · <span className="num">{stats.medium}m</span> · <span className="bad">{stats.hard}h</span></p>
                  </div>
                </div>

                {/* Contribution graph */}
                <div className="panel heat-panel reveal" style={d(2)}>
                  <div className="panel-head">
                    <p className="panel-title">contributions<span className="ext">.log</span></p>
                    <p className="panel-sub">{activeDaysThisYear} active days in the last year · click a day to open it</p>
                  </div>
                  <div className="heat-wrap" ref={heatWrapRef} onMouseLeave={() => setHeatHover(null)}>
                    <div className="heat">
                      {heatMonthLabels.map((label, w) => (
                        <span key={`m-${w}`} className="heat-month" style={{ gridColumn: w + 2 }}>{label}</span>
                      ))}
                      {["mon", "", "wed", "", "fri", "", ""].map((label, i) => (
                        <span key={`dow-${i}`} className="heat-dow" style={{ gridRow: i + 2 }}>{label}</span>
                      ))}
                      {heatWeeks.map((week, w) => week.map((cell, i) => (
                        <button
                          type="button"
                          key={cell.key}
                          className={`heat-cell ${getHeatmapClass(cell.count)}${cell.future ? " future" : ""}${cell.key === todayChartKey ? " today" : ""}`}
                          style={{ gridColumn: w + 2, gridRow: i + 2, "--w": w } as React.CSSProperties}
                          onMouseEnter={(e) => showHeatTip(e, cell.key)}
                          onFocus={(e) => showHeatTip(e, cell.key)}
                          onBlur={() => setHeatHover(null)}
                          onClick={() => openDay(cell.key)}
                          aria-label={`${cell.count} on ${cell.key}`}
                          tabIndex={cell.future ? -1 : 0}
                        />
                      )))}
                    </div>
                    {heatHover && (() => {
                      const questions = calendarQuestionsByDateKey[heatHover.key] ?? [];
                      const subs = calendarByDateKey[heatHover.key] ?? 0;
                      return (
                        <div className={`heat-tip${heatHover.below ? " below" : ""}`} style={{ left: heatHover.x, top: heatHover.y }}>
                          <p className="heat-tip-date">
                            {formatDateKeyForUi(heatHover.key, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).toLowerCase()}
                            {" · "}{questions.length ? `${questions.length} solved` : `${subs} subs`}
                          </p>
                          {questions.length > 0
                            ? questions.slice(0, 5).map((q) => <p key={q.titleSlug || q.title} className="heat-tip-item">{q.title}</p>)
                            : <p className="heat-tip-none">{subs > 0 ? "// titles need a connected leetcode" : "// nothing committed"}</p>}
                          {questions.length > 5 && <p className="heat-tip-none">+{questions.length - 5} more</p>}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="heat-foot">
                    <span>{"// "}longest run {longestStreak}d · current streak {currentStreak}d</span>
                    <span className="legend">
                      less
                      <span className="heat-cell level-0" />
                      <span className="heat-cell level-1" />
                      <span className="heat-cell level-2" />
                      <span className="heat-cell level-3" />
                      <span className="heat-cell level-4" />
                      more
                    </span>
                  </div>
                </div>

                {/* Contests: register for this week + rating */}
                <div className="overview-contests reveal" style={d(3)}>
                  {renderContestPanels()}
                </div>

                {/* Targets · weekly chart · nudge */}
                <div className="bottom-grid reveal" style={d(3)}>
                  <div className="panel focus-box">
                    <div className="panel-head">
                      <p className="panel-title">targets<span className="ext">.todo</span></p>
                      <div className="focus-ring">
                        <svg className="focus-ring-svg" viewBox="0 0 48 48">
                          <circle className="focus-ring-bg" cx="24" cy="24" r="20" />
                          <circle
                            className="focus-ring-fg"
                            cx="24" cy="24" r="20"
                            strokeDasharray={`${2 * Math.PI * 20}`}
                            strokeDashoffset={`${2 * Math.PI * 20 * (1 - taskPct / 100)}`}
                          />
                        </svg>
                        <div className="focus-ring-label">{taskPct}%</div>
                      </div>
                    </div>
                    <p className="focus-date-row">
                      {"// "}{today.toLocaleDateString("en-US", { weekday: "long", day: "2-digit", month: "short" }).toLowerCase()} · {doneTasks}/{tasks.length} done
                    </p>

                    {tasks.map((t) => (
                      <div
                        key={t.id}
                        className="task-item"
                        onClick={() => setTasks(ts => ts.map(x => x.id === t.id ? { ...x, done: !x.done } : x))}
                      >
                        <div className={`task-cb${t.done ? " done" : ""}`}>
                          {t.done && <Check size={11} color="#0c0c0b" strokeWidth={3} />}
                        </div>
                        <div className="task-body">
                          <div className={`task-label${t.done ? " done" : ""}`}>{t.label}</div>
                          <div className="task-tag">{t.tag.toLowerCase()}</div>
                        </div>
                        <div className="task-actions">
                          <span className={`task-status${t.done ? " done" : ""}`}>{t.done ? "done" : "open"}</span>
                          <button className="task-delete-btn" title="Delete target" onClick={(e) => deleteTask(t.id, e)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="add-task-row">
                      {addingTask ? (
                        <div className="add-task-form">
                          <input
                            className="add-task-input"
                            placeholder="e.g. solve 2 tree questions"
                            value={newTaskLabel}
                            onChange={e => setNewTaskLabel(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter" && newTaskLabel.trim()) {
                                setTasks(ts => [...ts, { id: `t${Date.now()}`, label: newTaskLabel.trim(), tag: "Custom Target", done: false, iconType: newTaskIcon }]);
                                setNewTaskLabel("");
                                setAddingTask(false);
                              }
                            }}
                            autoFocus
                          />
                          <div className="add-task-options">
                            <div className="icon-selector">
                              <button type="button" className={`icon-opt${newTaskIcon === "code" ? " selected" : ""}`} onClick={() => setNewTaskIcon("code")} title="Code"><Code2 size={13} /></button>
                              <button type="button" className={`icon-opt${newTaskIcon === "brain" ? " selected" : ""}`} onClick={() => setNewTaskIcon("brain")} title="LLD"><Brain size={13} /></button>
                              <button type="button" className={`icon-opt${newTaskIcon === "book" ? " selected" : ""}`} onClick={() => setNewTaskIcon("book")} title="HLD"><BookOpen size={13} /></button>
                              <button type="button" className={`icon-opt${newTaskIcon === "target" ? " selected" : ""}`} onClick={() => setNewTaskIcon("target")} title="Target"><Target size={13} /></button>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="add-task-confirm" onClick={() => {
                                if (newTaskLabel.trim()) {
                                  setTasks(ts => [...ts, { id: `t${Date.now()}`, label: newTaskLabel.trim(), tag: "Custom Target", done: false, iconType: newTaskIcon }]);
                                  setNewTaskLabel("");
                                }
                                setAddingTask(false);
                              }}>add</button>
                              <button className="add-task-cancel" onClick={() => { setAddingTask(false); setNewTaskLabel(""); }} aria-label="Cancel"><X size={13} /></button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button className="add-task-btn" onClick={() => setAddingTask(true)}><Plus size={13} /> new target</button>
                      )}
                    </div>
                  </div>

                  <div className="panel weekly-box">
                    <div className="panel-head">
                      <div>
                        <p className="panel-title">week<span className="ext">.chart</span></p>
                        <p className="panel-sub">{weekRangeLabel.toLowerCase()}</p>
                      </div>
                      <div className="weekly-total"><span>{solvedThisWeekChart}</span> / {WEEKLY_TARGET}</div>
                    </div>

                    <div className="chart-wrapper">
                      <div className="chart-grid">
                        {yTicks.map((tick, idx) => (
                          <div key={idx} className="y-tick-row">
                            <span className="y-tick-label">{tick}</span>
                            <div className="y-grid-line" />
                          </div>
                        ))}
                      </div>
                      <div className="chart-bars-area">
                        {dayLabels.map((day, i) => {
                          const isFuture = weekDateKeys[i] > todayChartKey;
                          const count = isFuture ? 0 : perDay[i];
                          const isToday = weekDateKeys[i] === todayChartKey;
                          const heightPct = Math.round((count / chartMax) * 100);
                          const dayQuestions = isFuture ? [] : questionsByDay[i];
                          const dayLabel = formatDateKeyForUi(weekDateKeys[i], { weekday: "short", month: "short", day: "numeric" }).toLowerCase();
                          return (
                            <div
                              key={day}
                              className="bar-column"
                              onMouseEnter={() => setHoveredDayIndex(i)}
                              onMouseLeave={() => setHoveredDayIndex((idx) => (idx === i ? null : idx))}
                              onClick={() => !isFuture && openDay(weekDateKeys[i])}
                            >
                              <div className="bar-track">
                                {hoveredDayIndex === i && (
                                  <div className="day-tooltip">
                                    <p className="day-tooltip-title">{dayLabel} · {dayQuestions.length} solved</p>
                                    {dayQuestions.length > 0 ? (
                                      <div className="day-tooltip-list">
                                        {dayQuestions.map((title, idx) => (
                                          <p key={`${day}-${idx}-${title}`} className="day-tooltip-item"><span className="ok">+</span> {title}</p>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="day-tooltip-empty">{"// "}nothing committed</p>
                                    )}
                                  </div>
                                )}
                                {count > 0 ? (
                                  <div className={`bar-solid${isToday ? " today" : ""}`} style={{ height: `${heightPct}%`, "--d": i } as React.CSSProperties}>
                                    <span className="bar-badge">{count}</span>
                                  </div>
                                ) : (
                                  <div className="bar-empty" />
                                )}
                              </div>
                              <span className={`bar-day-name${isToday ? " today" : ""}`}>{day.toLowerCase()}</span>
                              <span className={`bar-day-date${isToday ? " today" : ""}`}>{weekDateLabels[i].toLowerCase()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="weekly-footer">
                      <span>{"// "}target {DAILY_TARGET}/day</span>
                      <span>{solvedThisWeekChart >= WEEKLY_TARGET ? <b>week complete ✓</b> : <><b>{WEEKLY_TARGET - solvedThisWeekChart}</b> left this week</>}</span>
                    </div>
                  </div>

                  <div className="panel nudge-box">
                    <div className="panel-head">
                      <p className="panel-title">nudge<span className="ext">.cron</span></p>
                    </div>
                    <div className="nudge-time-block">
                      <div className="nudge-time">{nudge.time}</div>
                      <p className="nudge-cron"><b>cron</b> {nudgeMin} {nudgeHour} * * *</p>
                      <div className="nudge-time-label">{nudgeLabel.toLowerCase()}</div>
                    </div>
                    <div className="nudge-row">
                      <div className="nudge-row-label"><Target size={13} /> targets left</div>
                      <div className="nudge-row-val">{remainingTasks}</div>
                    </div>
                    <div className="nudge-row">
                      <div className="nudge-row-label"><Bell size={13} /> browser push</div>
                      <button
                        type="button"
                        className="nudge-enable"
                        onClick={async () => {
                          setNotificationError("");
                          const granted = await subscribeToPushNotifications();
                          if (granted) {
                            setNotificationPermission("granted");
                            return;
                          }
                          setNotificationPermission(Notification.permission === "granted" ? "granted" : "denied");
                          setNotificationError("Push notifications are unavailable in this browser session (for example, in Incognito/private mode). Open the app in a normal window or allow notifications in site settings.");
                        }}
                      >
                        {notificationPermission === "granted" ? "enabled ✓" : "enable"}
                      </button>
                    </div>
                    <div className="nudge-row">
                      <div className="nudge-row-label"><Car size={13} /> desktop car</div>
                      <span className="nudge-car-actions">
                        <button type="button" className="nudge-enable" onClick={previewDesktopNudge}>preview</button>
                        <button
                          type="button"
                          className={`nudge-switch${currentUser.desktopNudge ? " on" : ""}`}
                          role="switch"
                          aria-checked={!!currentUser.desktopNudge}
                          aria-label="Show the desktop car at nudge time"
                          onClick={toggleDesktopNudge}
                        />
                      </span>
                    </div>
                    {desktopNudgeMsg && <div className="nudge-car-msg">{desktopNudgeMsg}</div>}
                    {notificationError && <div className="nudge-error">{notificationError}</div>}

                    <button className="edit-sched-btn" onClick={() => { setNudgeDraft(nudge); setEditingSchedule(e => !e); }}>
                      <Edit2 size={13} /> edit schedule
                      <ChevronDown size={13} style={{ marginLeft: "auto", transform: editingSchedule ? "rotate(180deg)" : "none", transition: "transform 0.25s" }} />
                    </button>
                    {editingSchedule && (
                      <div className="sched-editor">
                        <p className="sched-field-label">nudge time</p>
                        <input type="time" className="sched-input" value={nudgeDraft.time} onChange={e => setNudgeDraft(dr => ({ ...dr, time: e.target.value }))} />
                        <div className="sched-actions">
                          <button className="sched-save" onClick={() => { setNudge(nudgeDraft); setEditingSchedule(false); saveNudgeToBackend({ time: nudgeDraft.time }); }}>save</button>
                          <button className="sched-cancel" onClick={() => setEditingSchedule(false)}>cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent solves */}
                <div className="panel reveal" style={d(4)}>
                  <div className="panel-head">
                    <p className="panel-title">recent<span className="ext">.log</span></p>
                    <button type="button" className="link-btn" onClick={() => setActiveNav("Problems")}>view all → problems.tsx</button>
                  </div>
                  {recentSolves.length === 0 ? (
                    <p className="empty-note">{"// "}no solves yet. your first commit is one problem away.</p>
                  ) : recentSolves.map((p) => {
                    const diff = (p.difficulty || "").toLowerCase();
                    return (
                      <div key={`${p.dateKey}-${p.titleSlug || p.title}`} className="log-row">
                        <span className="graph">●</span>
                        <span className="hash">{questionMeta[p.titleSlug]?.frontendId ? `#${questionMeta[p.titleSlug]?.frontendId}` : shortHash(`${p.titleSlug}${p.dateKey}`)}</span>
                        <a href={`https://leetcode.com/problems/${p.titleSlug}/`} target="_blank" rel="noreferrer">{p.title}</a>
                        <span className={`diff ${diff || "none"}`}>{diff || "—"}</span>
                        <span className="when">{relativeDay(p.dateKey, todayChartKey)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {activeNav === "Problems" && (
              <section className="view" key="problems">
                <div className="board-hero reveal" style={d(0)}>
                  <p className="board-kicker">leetcode · {syncing ? "syncing" : "synced"}</p>
                  <h1 className="board-title">
                    <span className="board-count"><CountUp value={stats.total || new Set(allSolved.map((p) => p.titleSlug)).size} /></span>
                    problems, one board.
                  </h1>
                  <p className="board-sub">
                    Every question you&apos;ve solved, with its number and topic tags, grouped by the day you did it.
                    {allSolved.length < stats.total ? ` ${allSolved.length} of them have dates on record so far.` : " No clutter."}
                  </p>
                </div>

                <div className="p-toolbar reveal" style={d(1)}>
                  <label className="p-search">
                    <span>grep</span>
                    <input value={problemQuery} onChange={(e) => setProblemQuery(e.target.value)} placeholder="search title, #number, tag or yyyy-mm-dd" aria-label="Search solved problems" />
                  </label>
                  <div className="chips">
                    {([
                      ["all", allSolved.length],
                      ["easy", diffCounts.easy],
                      ["medium", diffCounts.medium],
                      ["hard", diffCounts.hard],
                    ] as const).map(([key, count]) => (
                      <button type="button" key={key} className={`chip${problemFilter === key ? " on" : ""}`} onClick={() => setProblemFilter(key)}>
                        {key}<span className="c">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="panel reveal" style={d(2)}>
                  {problemDays.length === 0 ? (
                    <p className="empty-note">{allSolved.length === 0 ? "// nothing synced yet. hit git pull above." : "// no matches."}</p>
                  ) : problemDays.map((day) => (
                    <div key={day.dateKey} className="p-day">
                      <div className="p-day-head">
                        <span className="num">●</span>
                        <b>{day.dateKey}</b>
                        <span>{formatDateKeyForUi(day.dateKey, { weekday: "short" }).toLowerCase()} · {day.items.length} {day.items.length === 1 ? "commit" : "commits"}</span>
                        <button type="button" className="link-btn" onClick={() => openDay(day.dateKey)}>open in calendar</button>
                      </div>
                      {day.items.map((p, i) => {
                        const diff = (p.difficulty || "").toLowerCase();
                        return (
                          <div key={`${p.dateKey}-${p.titleSlug || p.title}`} className="log-row" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                            <span className="graph">│</span>
                            <span className="hash">{questionMeta[p.titleSlug]?.frontendId ? `#${questionMeta[p.titleSlug]?.frontendId}` : ""}</span>
                            <a href={`https://leetcode.com/problems/${p.titleSlug}/`} target="_blank" rel="noreferrer">{p.title}</a>
                            <span className="tag-cell">
                              {(() => {
                                const tags = questionMeta[p.titleSlug]?.tags;
                                if (!tags) return metaPending > 0 ? <span className="tag-loading">loading tags…</span> : null;
                                if (tags.length === 0) return <span className="tag-loading">—</span>;
                                return (
                                  <>
                                    {tags.slice(0, 3).map((t) => (
                                      <button type="button" key={t} className="tag" onClick={() => setProblemQuery(t.toLowerCase())} title={`Show all ${t} problems`}>{t.toLowerCase()}</button>
                                    ))}
                                    {tags.length > 3 && <span className="tag more" title={tags.slice(3).join(", ")}>+{tags.length - 3}</span>}
                                  </>
                                );
                              })()}
                            </span>
                            <span className={`diff ${diff || "none"}`}>{diff || "—"}</span>
                            <span className="when">{relativeDay(p.dateKey, todayChartKey)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {!currentUser.leetcodeConnected && (
                  <p className="p-hint reveal" style={d(3)}>
                    {"// "}only your recent solves show without a leetcode login.{" "}
                    <button type="button" className="link-btn" onClick={() => setActiveNav("Calendar")}>connect leetcode in calendar.tsx →</button>
                  </p>
                )}
              </section>
            )}

            {activeNav === "Calendar" && (
              <section className="view" key="calendar">
                <div className="view-head reveal" style={d(0)}>
                  <p className="cm">{"// "}your consistency is a story. use it to choose where tomorrow&apos;s effort goes.</p>
                  <h1 className="view-title"><span className="fn">calendar</span><span className="punct">.</span><span className="kw">render</span><span className="punct">(</span><span className="str">&quot;{new Date(calYear, calMonth).toLocaleString("en-US", { month: "long" }).toLowerCase()} {calYear}&quot;</span><span className="punct">)</span></h1>
                </div>

                <div className={`panel lc-connect reveal${currentUser.leetcodeConnected ? " connected" : ""}`} style={d(1)}>
                  <div className="lc-connect-row">
                    <div>
                      <p className="lc-connect-title">
                        {currentUser.leetcodeConnected
                          ? <>leetcode connected · <span>{currentUser.leetcodeUsername}</span></>
                          : "show every question you've ever solved"}
                      </p>
                      <p className="lc-connect-copy">
                        {currentUser.leetcodeConnected
                          ? "// full submission history imported and kept up to date every hour."
                          : "// without a login, leetcode only shares your last 20 solves. connect to import all of them."}
                      </p>
                    </div>
                    {currentUser.leetcodeConnected ? (
                      <button type="button" className="lc-connect-secondary" onClick={handleDisconnectLeetCode}>disconnect</button>
                    ) : (
                      <button type="button" className="lc-connect-primary" onClick={() => setConnectOpen((o) => !o)}>
                        {connectOpen ? "cancel" : "connect leetcode"}
                      </button>
                    )}
                  </div>

                  {connectOpen && !currentUser.leetcodeConnected && (
                    <form className="lc-connect-form" onSubmit={handleConnectLeetCode}>
                      <ol className="lc-connect-steps">
                        <li>Open <a href="https://leetcode.com" target="_blank" rel="noreferrer">leetcode.com</a> and log in as <b>{currentUser.leetcodeUsername}</b>.</li>
                        <li>Press <b>F12</b> → <b>Application</b> → <b>Cookies</b> → <b>https://leetcode.com</b>.</li>
                        <li>Copy the values of <b>LEETCODE_SESSION</b> and <b>csrftoken</b> into the fields below.</li>
                      </ol>
                      <label className="lc-connect-label">
                        LEETCODE_SESSION
                        <input type="password" autoComplete="off" value={sessionInput} onChange={(e) => setSessionInput(e.target.value)} placeholder="eyJ0eXAiOiJKV1Qi…" required />
                      </label>
                      <label className="lc-connect-label">
                        csrftoken
                        <input type="password" autoComplete="off" value={csrfInput} onChange={(e) => setCsrfInput(e.target.value)} placeholder="recommended" />
                      </label>
                      <p className="lc-connect-note">works like a password for your leetcode account. stored only in this app&apos;s database, used only to read your own submissions, never shown again. only paste your own.</p>
                      <button type="submit" className="lc-connect-primary" disabled={connectStatus === "checking" || connectStatus === "importing"}>
                        {connectStatus === "checking" ? "checking…" : connectStatus === "importing" ? "importing history…" : "connect & import"}
                      </button>
                    </form>
                  )}

                  {connectStatus === "importing" && <p className="lc-connect-status">{"// "}importing your full history. this can take a minute or two for big accounts…</p>}
                  {connectMessage && <p className={`lc-connect-status${connectStatus === "error" ? " error" : ""}`}>{connectMessage}</p>}
                </div>

                <div className="panel planner-shell reveal" style={d(2)}>
                  <div className="planner-toolbar">
                    <div className="planner-month">
                      {new Date(calYear, calMonth).toLocaleString("en-US", { month: "long" }).toLowerCase()} <span>{calYear}</span>
                    </div>
                    <div className="planner-actions">
                      <button className="planner-today-btn" onClick={() => { setCalMonth(today.getMonth()); setCalYear(today.getFullYear()); }}>today</button>
                      <button className="planner-nav" onClick={handlePrevMonth} aria-label="Previous month"><ChevronLeft size={15} /></button>
                      <button className="planner-nav" onClick={handleNextMonth} aria-label="Next month"><ChevronRight size={15} /></button>
                    </div>
                  </div>
                  <div className="planner-grid" key={`${calYear}-${calMonth}`}>
                    {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => <div key={day} className="planner-weekday">{day}</div>)}
                    {monthDays.map((day, index) => {
                      if (!day.date) return <div key={`planner-empty-${index}`} className="planner-day muted" style={d(index)} />;
                      const isToday = day.dateKey === todayChartKey;
                      const questions = calendarQuestionsByDateKey[day.dateKey] ?? [];
                      const isSelected = selectedCalendarDay === day.dateKey;
                      return (
                        <button
                          type="button"
                          key={day.dateKey}
                          className={`planner-day${isSelected ? " selected" : ""}${questions.length > 0 ? " has-questions" : ""}`}
                          style={d(index)}
                          onClick={() => setSelectedCalendarDay(isSelected ? null : day.dateKey)}
                          aria-pressed={isSelected}
                        >
                          <span className={`planner-day-number${isToday ? " today" : ""}`}>{day.date.getDate()}</span>
                          {questions.length > 0
                            ? <span className="planner-count">{questions.length} solved</span>
                            : day.count > 0 && <span className="planner-count">{day.count} subs</span>}
                          <span className="planner-questions">
                            {questions.slice(0, 4).map((question) => (
                              <span key={`${day.dateKey}-${question.titleSlug || question.title}`} className={`planner-question diff-${(question.difficulty || "").toLowerCase()}`} title={question.title}>{question.title}</span>
                            ))}
                            {questions.length > 4 && <span className="planner-more">+{questions.length - 4} more</span>}
                            {questions.length === 0 && day.count > 0 && <span className="planner-empty">{currentUser.leetcodeConnected ? "// titles not available yet" : "// connect leetcode to see titles"}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedCalendarDay && (() => {
                    const questions = calendarQuestionsByDateKey[selectedCalendarDay] ?? [];
                    return (
                      <div className="planner-detail" key={selectedCalendarDay}>
                        <div className="planner-detail-head">
                          <p className="planner-detail-title">
                            {formatDateKeyForUi(selectedCalendarDay, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toLowerCase()}
                            <span> · {questions.length} solved</span>
                          </p>
                          <button type="button" className="planner-detail-close" onClick={() => setSelectedCalendarDay(null)} aria-label="Close day details">×</button>
                        </div>
                        {questions.length > 0 ? (
                          <ol className="planner-detail-list">
                            {questions.map((question, i) => (
                              <li key={question.titleSlug || question.title} style={{ animationDelay: `${i * 35}ms` }}>
                                <a href={`https://leetcode.com/problems/${question.titleSlug}/`} target="_blank" rel="noreferrer">{question.title}</a>
                                {question.difficulty && <span className={`diff ${question.difficulty.toLowerCase()}`}>{question.difficulty.toLowerCase()}</span>}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="planner-empty">{"// "}no solved questions recorded for this day.</p>
                        )}
                      </div>
                    );
                  })()}
                  <p className="planner-note">{allSolvedCount} solved questions on record. click a day to see every question solved on it.</p>
                </div>

              </section>
            )}

            {activeNav === "Contests" && (
              <section className="view" key="contests">
                <div className="view-head reveal" style={d(0)}>
                  <p className="cm">{"// "}weekly: sundays 8:00 am · biweekly: every other saturday 8:00 pm (your time)</p>
                  <h1 className="view-title"><span className="fn">contest</span><span className="punct">.</span><span className="kw">register</span><span className="punct">(</span><span className="str">&quot;before it starts&quot;</span><span className="punct">)</span></h1>
                </div>

                {renderContestPanels()}
              </section>
            )}
          </main>

          <footer className="statusbar">
            <span className="sb-accent">⎇ main</span>
            <span>✓ {activeDaysThisYear} active days</span>
            <span>streak {currentStreak}d</span>
            <span className="sb-right">
              <span>{currentUser.leetcodeUsername}@leetcode</span>
              <span>{FILES.find((f) => f.id === activeNav)?.file}</span>
              <span>utf-8</span>
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}