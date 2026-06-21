import { Fragment, useEffect, useMemo, useState } from "react";
import logoUrl from "@repo-assets/mcprainforest-logo.svg";
import { api } from "@/lib/api";
import type {
  AppSection,
  DashboardCreateToolGroupInput,
  DashboardData,
  DashboardMarketplaceResponse,
  DashboardMarketplaceServer,
  DashboardOAuthAuthorizationRequired,
  DashboardPrompt,
  DashboardRegisterServerInput,
  DashboardResource,
  DashboardServer,
  DashboardToolGroup,
  DashboardTool,
} from "@/lib/types";
import { applyPreviewData } from "@/lib/previewData";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
import { Announcer, useAnnounce } from "@/components/Announcer";
import { CopyButton } from "@/components/CopyButton";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { NavSidebar } from "@/components/NavSidebar";
import { SectionCard } from "@/components/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 16 16" width="18">
      <path
        d="M2.75 4.25h10.5M6.25 2.75h3.5m-5.75 1.5.44 7.04A1.5 1.5 0 0 0 5.94 12.75h4.12a1.5 1.5 0 0 0 1.5-1.46L12 4.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path d="M6.5 6.5v3.5M9.5 6.5v3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M12.75 5.25A5 5 0 1 0 13 8M12.75 5.25V2.75M12.75 5.25h-2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

type LoadState = "idle" | "loading" | "ready" | "error";
type FeedbackTone = "success" | "error";
type ThemeMode = "light" | "dark" | "system";
type RegisterDraftMode = "manual" | "marketplace_add" | "marketplace_update_review";

interface FeedbackMessage {
  tone: FeedbackTone;
  message: string;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

interface KeyValueRow {
  key: string;
  value: string;
}

interface RegisterServerFormState {
  name: string;
  description: string;
  transport: "stdio" | "streamable_http" | "sse";
  session_mode: "stateless" | "stateful";
  command: string;
  args_text: string;
  env_rows: KeyValueRow[];
  url: string;
  bearer_token: string;
  header_rows: KeyValueRow[];
  marketplace_source_id?: string;
  marketplace_entry_id?: string;
}

interface RegisterOAuthState {
  authorization: DashboardOAuthAuthorizationRequired;
  hasOpenedBrowser: boolean;
  error: string;
}

interface ToolGroupFormState {
  name: string;
  description: string;
  selectedTools: string[];
}

interface SchemaFieldSummary {
  path: string;
  type: string;
  required: boolean;
  description?: string;
  enumValues?: string[];
  defaultValue?: string;
  note?: string;
}

const sectionMeta: Record<AppSection, { title: string; subtitle: string }> = {
  servers: {
    title: "Servers",
    subtitle: "Registered upstream MCP servers and connection state.",
  },
  marketplace: {
    title: "Marketplace",
    subtitle: "Discover MCP servers and create reviewed registration drafts.",
  },
  tools: {
    title: "Tools",
    subtitle: "Search, inspect, copy, enable, and disable discovered tools.",
  },
  tool_groups: {
    title: "Tool Groups",
    subtitle: "Curated MCP endpoints for focused client access.",
  },
  prompts: {
    title: "Prompts",
    subtitle: "Prompt templates currently exposed through the gateway.",
  },
  resources: {
    title: "Resources",
    subtitle: "Registered resources and canonical gateway URIs.",
  },
  diagnostics: {
    title: "System Info",
    subtitle: "Runtime, version, endpoint, and transport details.",
  },
};

function shortVersion(version?: string) {
  if (!version) {
    return "";
  }
  const match = version.match(/v?\d+\.\d+\.\d+/);
  if (match) {
    return match[0];
  }
  return version.length > 16 ? version.slice(0, 16) : version;
}

function transportLabel(value?: string) {
  return value ? value.split("_").join(" ") : "unknown";
}

function marketplaceStatusLabel(value?: string) {
  return value ? value.split("_").join(" ") : "unknown";
}

function marketplaceStatusTone(value?: string) {
  if (value === "installable") {
    return "good" as const;
  }
  if (value === "blocked") {
    return "bad" as const;
  }
  if (value === "review_required" || value === "external") {
    return "warn" as const;
  }
  return "muted" as const;
}

function marketplaceUpdateLabel(value?: string) {
  switch (value) {
    case "not_installed":
      return "not installed";
    case "current":
      return "current";
    case "update_available":
      return "update available";
    case "local_changes":
      return "local changes";
    case "unknown":
      return "update unknown";
    default:
      return "update unknown";
  }
}

function marketplaceUpdateTone(value?: string) {
  if (value === "current") {
    return "good" as const;
  }
  if (value === "update_available" || value === "local_changes") {
    return "warn" as const;
  }
  if (value === "unknown") {
    return "muted" as const;
  }
  return "muted" as const;
}

function marketplaceSourceStatusLabel(value?: string) {
  switch (value) {
    case "loaded":
      return "loaded";
    case "error":
      return "error";
    case "metadata_only":
      return "metadata only";
    case "local":
      return "local";
    default:
      return "unknown";
  }
}

function marketplaceSourceStatusTone(value?: string) {
  if (value === "loaded" || value === "local") {
    return "good" as const;
  }
  if (value === "error") {
    return "bad" as const;
  }
  if (value === "metadata_only") {
    return "muted" as const;
  }
  return "muted" as const;
}

function marketplaceDisplayName(server: DashboardMarketplaceServer) {
  return server.display_name || server.name;
}

function toolDescription(tool: DashboardTool) {
  return tool.description || "No description";
}

const annotationLabels: Record<string, { label: string; tone: "good" | "warn" | "muted" }> = {
  readOnlyHint: { label: "Read-only", tone: "good" },
  destructiveHint: { label: "Destructive", tone: "warn" },
  idempotentHint: { label: "Idempotent", tone: "muted" },
  openWorldHint: { label: "Open-world", tone: "muted" },
};

function annotationBadge(key: string): { label: string; tone: "good" | "warn" | "muted" } {
  return annotationLabels[key] ?? { label: key, tone: "muted" };
}

function promptDescription(prompt: DashboardPrompt) {
  return prompt.description || "No description";
}

function resourceDescription(resource: DashboardResource) {
  return resource.description || "No description";
}

function prettyJSON(value?: Record<string, unknown>) {
  if (!value) {
    return "No schema available.";
  }
  return JSON.stringify(value, null, 2);
}

function prettyPromptArguments(value?: Array<Record<string, unknown>>) {
  if (!value || value.length === 0) {
    return "No arguments";
  }
  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaTypeLabel(schema: Record<string, unknown>) {
  const type = schema.type;
  if (typeof type === "string") {
    return type;
  }
  if (Array.isArray(type) && type.every((item) => typeof item === "string")) {
    return type.join(" | ");
  }
  if (isRecord(schema.properties)) {
    return "object";
  }
  if (schema.items) {
    return "array";
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return "enum";
  }
  return "unknown";
}

function formatSchemaValue(value: unknown) {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function schemaNote(schema: Record<string, unknown>) {
  const notes: string[] = [];
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    notes.push(`${schema.oneOf.length} oneOf variants`);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    notes.push(`${schema.anyOf.length} anyOf variants`);
  }
  if (schema.additionalProperties === true) {
    notes.push("additional properties allowed");
  }
  return notes.join(", ");
}

function collectSchemaFields(
  schema: Record<string, unknown>,
  path: string,
  required: boolean,
  fields: SchemaFieldSummary[],
) {
  const entry: SchemaFieldSummary = {
    path,
    type: schemaTypeLabel(schema),
    required,
  };

  if (typeof schema.description === "string" && schema.description.trim()) {
    entry.description = schema.description;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    entry.enumValues = schema.enum.map((value) => formatSchemaValue(value));
  }
  if (schema.default !== undefined) {
    entry.defaultValue = formatSchemaValue(schema.default);
  }
  const note = schemaNote(schema);
  if (note) {
    entry.note = note;
  }
  fields.push(entry);

  if (isRecord(schema.properties)) {
    const requiredFields = new Set(
      Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === "string") : [],
    );
    Object.entries(schema.properties).forEach(([key, value]) => {
      if (!isRecord(value)) {
        return;
      }
      const childPath = path ? `${path}.${key}` : key;
      collectSchemaFields(value, childPath, requiredFields.has(key), fields);
    });
  }

  if (schema.items && isRecord(schema.items)) {
    collectSchemaFields(schema.items, `${path}[]`, true, fields);
  }
}

function parseToolSchemaFields(schema?: Record<string, unknown>) {
  if (!schema) {
    return [] as SchemaFieldSummary[];
  }

  const fields: SchemaFieldSummary[] = [];
  if (isRecord(schema.properties)) {
    const requiredFields = new Set(
      Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === "string") : [],
    );
    Object.entries(schema.properties).forEach(([key, value]) => {
      if (!isRecord(value)) {
        return;
      }
      collectSchemaFields(value, key, requiredFields.has(key), fields);
    });
    return fields;
  }

  collectSchemaFields(schema, "(root)", true, fields);
  return fields;
}

function parsePromptArgumentFields(argumentsValue?: Array<Record<string, unknown>>) {
  if (!argumentsValue || argumentsValue.length === 0) {
    return [] as SchemaFieldSummary[];
  }

  const fields: SchemaFieldSummary[] = [];

  argumentsValue.forEach((argument, index) => {
    const name =
      (typeof argument.name === "string" && argument.name) ||
      (typeof argument.title === "string" && argument.title) ||
      `arg${index + 1}`;

    const entry: SchemaFieldSummary = {
      path: name,
      // Prompt arguments are string-like by default unless the backend explicitly provides a schema type.
      type: (() => {
        const explicitType = schemaTypeLabel(argument);
        return explicitType === "unknown" ? "string" : explicitType;
      })(),
      required: Boolean(argument.required),
    };

    if (typeof argument.description === "string" && argument.description.trim()) {
      entry.description = argument.description;
    }
    if (Array.isArray(argument.enum) && argument.enum.length > 0) {
      entry.enumValues = argument.enum.map((value) => formatSchemaValue(value));
    }
    if (argument.default !== undefined) {
      entry.defaultValue = formatSchemaValue(argument.default);
    }
    const note = schemaNote(argument);
    if (note) {
      entry.note = note;
    }
    fields.push(entry);

    if (isRecord(argument.properties)) {
      const requiredFields = new Set(
        Array.isArray(argument.required)
          ? argument.required.filter((value): value is string => typeof value === "string")
          : [],
      );
      Object.entries(argument.properties).forEach(([key, value]) => {
        if (!isRecord(value)) {
          return;
        }
        collectSchemaFields(value, `${name}.${key}`, requiredFields.has(key), fields);
      });
    }

    if (argument.items && isRecord(argument.items)) {
      collectSchemaFields(argument.items, `${name}[]`, true, fields);
    }
  });

  return fields;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`row-chevron ${expanded ? "is-expanded" : ""}`}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="m5.5 3.75 4.25 4.25-4.25 4.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function createEmptyPair(): KeyValueRow {
  return { key: "", value: "" };
}

function createInitialRegisterForm(): RegisterServerFormState {
  return {
    name: "",
    description: "",
    transport: "streamable_http",
    session_mode: "stateless",
    command: "",
    args_text: "",
    env_rows: [createEmptyPair()],
    url: "",
    bearer_token: "",
    header_rows: [createEmptyPair()],
  };
}

function keyedRows(values?: Record<string, string>, requiredKeys?: string[]) {
  const rows = Object.entries(values ?? {}).map(([key, value]) => ({ key, value }));
  (requiredKeys ?? []).forEach((key) => {
    if (!rows.some((row) => row.key === key)) {
      rows.push({ key, value: "" });
    }
  });
  return rows.length > 0 ? rows : [createEmptyPair()];
}

function marketplaceDraftToRegisterForm(entry: DashboardMarketplaceServer): RegisterServerFormState {
  const draft = entry.install;
  const initial = createInitialRegisterForm();
  if (!draft) {
    return initial;
  }
  return {
    ...initial,
    name: draft.name || entry.name,
    description: draft.description || entry.description,
    transport: draft.transport,
    session_mode: draft.session_mode ?? "stateless",
    command: draft.command ?? "",
    args_text: (draft.args ?? []).join("\n"),
    env_rows: keyedRows(draft.env, draft.required_env_keys),
    url: draft.url ?? "",
    header_rows: keyedRows(draft.headers, draft.required_header_keys),
    marketplace_source_id: entry.source_id,
    marketplace_entry_id: entry.id,
  };
}

function rowsToMap(rows: KeyValueRow[]) {
  const output: Record<string, string> = {};
  rows.forEach((row) => {
    const key = row.key.trim();
    if (!key) {
      return;
    }
    output[key] = row.value;
  });
  return output;
}

function splitArgs(input: string) {
  return input
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getRegisterValidationError(form: RegisterServerFormState) {
  if (!form.name.trim()) {
    return "Server name is required.";
  }
  if (form.transport === "stdio" && !form.command.trim()) {
    return "Command is required for stdio servers.";
  }
  if ((form.transport === "streamable_http" || form.transport === "sse") && !form.url.trim()) {
    return "Target URL is required for HTTP and SSE servers.";
  }
  return "";
}

function buildRegisterPayload(form: RegisterServerFormState): DashboardRegisterServerInput {
  const payload: DashboardRegisterServerInput = {
    name: form.name.trim(),
    description: form.description.trim(),
    transport: form.transport,
    session_mode: form.session_mode,
  };
  if (form.marketplace_entry_id) {
    payload.marketplace_source_id = form.marketplace_source_id;
    payload.marketplace_entry_id = form.marketplace_entry_id;
  }

  if (form.transport === "stdio") {
    payload.command = form.command.trim();
    payload.args = splitArgs(form.args_text);
    const env = rowsToMap(form.env_rows);
    if (Object.keys(env).length > 0) {
      payload.env = env;
    }
    return payload;
  }

  payload.url = form.url.trim();
  if (form.bearer_token.trim()) {
    payload.bearer_token = form.bearer_token.trim();
  }
  if (form.transport === "streamable_http") {
    const headers = rowsToMap(form.header_rows);
    if (Object.keys(headers).length > 0) {
      payload.headers = headers;
    }
  }
  return payload;
}

function createInitialToolGroupForm(): ToolGroupFormState {
  return {
    name: "",
    description: "",
    selectedTools: [],
  };
}

const themeModes: ThemeMode[] = ["light", "dark", "system"];
const dashboardThemeKey = "mcprainforest-dashboard-theme";
const legacyDashboardThemeKey = "mcpjungle-dashboard-theme";
const dashboardSectionKey = "mcprainforest-dashboard-section";
const legacyDashboardSectionKey = "mcpjungle-dashboard-section";

function isAppSection(value: string | null): value is AppSection {
  return (
    value === "servers" ||
    value === "marketplace" ||
    value === "tools" ||
    value === "tool_groups" ||
    value === "prompts" ||
    value === "resources" ||
    value === "diagnostics"
  );
}

function initialSection(): AppSection {
  if (typeof window === "undefined") {
    return "servers";
  }
  const stored = window.localStorage.getItem(dashboardSectionKey) ?? window.localStorage.getItem(legacyDashboardSectionKey);
  return isAppSection(stored) ? stored : "servers";
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function initialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }
  const stored = window.localStorage.getItem(dashboardThemeKey) ?? window.localStorage.getItem(legacyDashboardThemeKey);
  return isThemeMode(stored) ? stored : "system";
}

function resolvedTheme(mode: ThemeMode) {
  if (mode !== "system") {
    return mode;
  }
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function healthTone(status?: string) {
  if (status === "running" || status === "connected" || status === "reachable") {
    return "good" as const;
  }
  if (status === "failed") {
    return "bad" as const;
  }
  return "warn" as const;
}

function serverStatusLabel(status?: string) {
  if (!status) {
    return "unknown";
  }
  return status.split("_").join(" ");
}

function modeLabel(mode: ThemeMode) {
  if (mode === "system") {
    return "Auto";
  }
  return mode[0].toUpperCase() + mode.slice(1);
}

function compactServerMode(mode?: string) {
  if (mode === "development") {
    return "dev";
  }
  return mode || "unknown";
}

function formatUpdatedAt(value: Date | null) {
  if (!value) {
    return "";
  }
  return value.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function FilterEmptyState({
  actionLabel,
  description,
  onClear,
  title,
}: {
  actionLabel: string;
  description: string;
  onClear: () => void;
  title: string;
}) {
  return (
    <section className="filter-empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
      <button className="secondary-action" onClick={onClear} type="button">
        {actionLabel}
      </button>
    </section>
  );
}

function BasicEmptyState({ description, title }: { description: string; title: string }) {
  return (
    <section className="panel empty-state">
      <div>
        <p className="panel-label">Empty state</p>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </section>
  );
}

function ThemeModeControl({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  return (
    <div className="theme-toggle" aria-label="Color theme">
      {themeModes.map((mode) => (
        <button
          aria-pressed={value === mode}
          className={value === mode ? "is-active" : ""}
          key={mode}
          onClick={() => onChange(mode)}
          type="button"
        >
          {modeLabel(mode)}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [section, setSection] = useState<AppSection>(initialSection);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [data, setData] = useState<DashboardData>({});
  const [usingPreviewData, setUsingPreviewData] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialThemeMode);
  const [marketplaceLoadState, setMarketplaceLoadState] = useState<LoadState>("idle");
  const [marketplaceError, setMarketplaceError] = useState("");
  const [marketplaceData, setMarketplaceData] = useState<DashboardMarketplaceResponse | null>(null);
  const [marketplaceFilter, setMarketplaceFilter] = useState("");
  const [marketplaceSourceFilter, setMarketplaceSourceFilter] = useState("all");
  const [marketplaceTransportFilter, setMarketplaceTransportFilter] = useState("all");
  const [marketplaceStatusFilter, setMarketplaceStatusFilter] = useState("all");
  const [marketplaceUpdateFilter, setMarketplaceUpdateFilter] = useState("all");
  const [serverFilter, setServerFilter] = useState("");
  const [toolFilter, setToolFilter] = useState("");
  const [toolServerFilter, setToolServerFilter] = useState("all");
  const [promptFilter, setPromptFilter] = useState("");
  const [toolGroupToolFilter, setToolGroupToolFilter] = useState("");
  const [toolGroupToolServerFilter, setToolGroupToolServerFilter] = useState("all");
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [expandedMarketplaceEntry, setExpandedMarketplaceEntry] = useState<string | null>(null);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [expandedToolGroup, setExpandedToolGroup] = useState<string | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterServerFormState>(createInitialRegisterForm());
  const [registerError, setRegisterError] = useState("");
  const [registerDraftNotice, setRegisterDraftNotice] = useState("");
  const [registerDraftMode, setRegisterDraftMode] = useState<RegisterDraftMode>("manual");
  const [registerOAuth, setRegisterOAuth] = useState<RegisterOAuthState | null>(null);
  const [toolGroupOpen, setToolGroupOpen] = useState(false);
  const [toolGroupForm, setToolGroupForm] = useState<ToolGroupFormState>(createInitialToolGroupForm());
  const [toolGroupError, setToolGroupError] = useState("");
  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const { message: announcement, announce } = useAnnounce();
  const registerTitleId = "register-server-dialog-title";
  const toolGroupTitleId = "tool-group-dialog-title";

  async function loadDashboardData(silent = false) {
    if (!silent) {
      setLoadState("loading");
    } else {
      setRefreshing(true);
      setFeedback(null);
    }
    if (!silent) {
      setErrorMessage("");
    }
    try {
      const [overview, servers, tools, toolGroups, prompts, resources, diagnostics] = await Promise.all([
        api.overview(),
        api.servers(),
        api.tools(),
        api.toolGroups(),
        api.prompts(),
        api.resources(),
        api.diagnostics(),
      ]);
      const prepared = applyPreviewData({ overview, servers, tools, toolGroups, prompts, resources, diagnostics });
      setData(prepared.data);
      setUsingPreviewData(prepared.usingPreviewData);
      const preparedTools = prepared.data.tools?.tools ?? [];
      const preparedToolGroups = prepared.data.toolGroups?.tool_groups ?? [];
      const preparedPrompts = prepared.data.prompts?.prompts ?? [];
      setExpandedTool((current) =>
        current && preparedTools.some((tool) => tool.canonical_name === current) ? current : null,
      );
      setExpandedToolGroup((current) =>
        current && preparedToolGroups.some((group) => group.name === current) ? current : null,
      );
      setExpandedPrompt((current) =>
        current && preparedPrompts.some((prompt) => prompt.canonical_name === current) ? current : null,
      );
      setLastLoadedAt(new Date());
      setErrorMessage("");
      if (silent) {
        setFeedback(null);
      }
      setLoadState("ready");
      announce(silent ? "Dashboard refreshed." : "Dashboard loaded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (silent) {
        setFeedback({ tone: "error", message: `Refresh failed: ${message}` });
      } else {
        setErrorMessage(message);
        setLoadState("error");
      }
      announce(`Dashboard load failed: ${message}`);
    } finally {
      if (silent) {
        setRefreshing(false);
      }
    }
  }

  async function loadMarketplaceData(silent = false) {
    if (!silent) {
      setMarketplaceLoadState("loading");
    }
    setMarketplaceError("");
    try {
      const marketplace = await api.marketplace();
      setMarketplaceData(marketplace);
      setData((current) => ({ ...current, marketplace }));
      setExpandedMarketplaceEntry((current) =>
        current && marketplace.servers.some((server) => server.id === current) ? current : null,
      );
      setMarketplaceLoadState("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setMarketplaceError(message);
      setMarketplaceLoadState("error");
      if (silent) {
        setFeedback({ tone: "error", message: `Marketplace refresh failed: ${message}` });
      }
    }
  }

  useEffect(() => {
    void loadDashboardData();
    void loadMarketplaceData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(dashboardSectionKey, section);
    window.localStorage.removeItem(legacyDashboardSectionKey);
  }, [section]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme = resolvedTheme(themeMode);
      document.documentElement.dataset.themeMode = themeMode;
      window.localStorage.setItem(dashboardThemeKey, themeMode);
      window.localStorage.removeItem(legacyDashboardThemeKey);
    };

    applyTheme();
    if (themeMode !== "system") {
      return;
    }

    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);

  const filteredServers = useMemo(() => {
    const servers = data.servers?.servers ?? [];
    if (!serverFilter.trim()) {
      return servers;
    }
    const term = serverFilter.toLowerCase();
    return servers.filter(
      (server) =>
        server.name.toLowerCase().includes(term) ||
        server.transport.toLowerCase().includes(term) ||
        server.connection_summary.toLowerCase().includes(term),
    );
  }, [data.servers?.servers, serverFilter]);

  const marketplaceSourceByID = useMemo(() => {
    const sources = marketplaceData?.sources ?? [];
    return new Map(sources.map((source) => [source.id, source]));
  }, [marketplaceData?.sources]);

  const marketplaceSources = useMemo(
    () => [...(marketplaceData?.sources ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [marketplaceData?.sources],
  );

  const marketplaceSourceHealth = useMemo(() => {
    const sources = marketplaceData?.sources ?? [];
    const errorCount = sources.filter((source) => source.status === "error").length;
    const loadedCount = sources.filter((source) => source.status === "loaded" || source.status === "local").length;
    const visibleServerCount = marketplaceData?.pagination?.total ?? marketplaceData?.servers.length ?? 0;
    return { errorCount, loadedCount, visibleServerCount };
  }, [marketplaceData?.pagination?.total, marketplaceData?.servers.length, marketplaceData?.sources]);

  const marketplaceTransports = useMemo(() => {
    const transports = new Set((marketplaceData?.servers ?? []).map((server) => server.transport));
    return Array.from(transports).sort();
  }, [marketplaceData?.servers]);

  const marketplaceStatuses = useMemo(() => {
    const statuses = new Set((marketplaceData?.servers ?? []).map((server) => server.install_status));
    return Array.from(statuses).sort();
  }, [marketplaceData?.servers]);

  const marketplaceUpdateStates = useMemo(() => {
    const states = new Set((marketplaceData?.servers ?? []).map((server) => server.update_state));
    return Array.from(states).sort();
  }, [marketplaceData?.servers]);

  const filteredMarketplaceServers = useMemo(() => {
    let servers = marketplaceData?.servers ?? [];
    if (marketplaceSourceFilter !== "all") {
      servers = servers.filter((server) => server.source_id === marketplaceSourceFilter);
    }
    if (marketplaceTransportFilter !== "all") {
      servers = servers.filter((server) => server.transport === marketplaceTransportFilter);
    }
    if (marketplaceStatusFilter !== "all") {
      servers = servers.filter((server) => server.install_status === marketplaceStatusFilter);
    }
    if (marketplaceUpdateFilter !== "all") {
      servers = servers.filter((server) => server.update_state === marketplaceUpdateFilter);
    }
    if (!marketplaceFilter.trim()) {
      return servers;
    }
    const term = marketplaceFilter.toLowerCase();
    return servers.filter((server) => {
      const source = marketplaceSourceByID.get(server.source_id);
      return (
        marketplaceDisplayName(server).toLowerCase().includes(term) ||
        server.name.toLowerCase().includes(term) ||
        server.description.toLowerCase().includes(term) ||
        server.publisher?.toLowerCase().includes(term) ||
        server.category?.toLowerCase().includes(term) ||
        server.tags?.some((tag) => tag.toLowerCase().includes(term)) ||
        source?.name.toLowerCase().includes(term) ||
        source?.description?.toLowerCase().includes(term) ||
        source?.trust_level?.toLowerCase().includes(term)
      );
    });
  }, [
    marketplaceData?.servers,
    marketplaceFilter,
    marketplaceSourceByID,
    marketplaceSourceFilter,
    marketplaceStatusFilter,
    marketplaceTransportFilter,
    marketplaceUpdateFilter,
  ]);

  const filteredTools = useMemo(() => {
    let tools = data.tools?.tools ?? [];
    if (toolServerFilter !== "all") {
      tools = tools.filter((tool) => tool.server === toolServerFilter);
    }
    if (!toolFilter.trim()) {
      return tools;
    }
    const term = toolFilter.toLowerCase();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(term) ||
        tool.server.toLowerCase().includes(term) ||
        tool.canonical_name.toLowerCase().includes(term) ||
        toolDescription(tool).toLowerCase().includes(term),
    );
  }, [data.tools?.tools, toolFilter, toolServerFilter]);

  const uniqueToolServers = useMemo(() => {
    const servers = new Set((data.tools?.tools ?? []).map((tool) => tool.server));
    return Array.from(servers).sort();
  }, [data.tools?.tools]);

  const availableToolGroupTools = useMemo(() => {
    let tools = data.tools?.tools ?? [];
    if (toolGroupToolServerFilter !== "all") {
      tools = tools.filter((tool) => tool.server === toolGroupToolServerFilter);
    }
    if (!toolGroupToolFilter.trim()) {
      return tools;
    }
    const term = toolGroupToolFilter.toLowerCase();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(term) ||
        tool.canonical_name.toLowerCase().includes(term) ||
        tool.server.toLowerCase().includes(term) ||
        toolDescription(tool).toLowerCase().includes(term),
    );
  }, [data.tools?.tools, toolGroupToolFilter, toolGroupToolServerFilter]);

  const filteredPrompts = useMemo(() => {
    const prompts = data.prompts?.prompts ?? [];
    if (!promptFilter.trim()) {
      return prompts;
    }
    const term = promptFilter.toLowerCase();
    return prompts.filter(
      (prompt) =>
        prompt.name.toLowerCase().includes(term) ||
        prompt.canonical_name.toLowerCase().includes(term) ||
        prompt.server.toLowerCase().includes(term) ||
        promptDescription(prompt).toLowerCase().includes(term),
    );
  }, [data.prompts?.prompts, promptFilter]);

  const hasMarketplaceFilter =
    marketplaceFilter.trim().length > 0 ||
    marketplaceSourceFilter !== "all" ||
    marketplaceTransportFilter !== "all" ||
    marketplaceStatusFilter !== "all" ||
    marketplaceUpdateFilter !== "all";
  const hasServerFilter = serverFilter.trim().length > 0;
  const hasToolFilter = toolFilter.trim().length > 0 || toolServerFilter !== "all";
  const hasPromptFilter = promptFilter.trim().length > 0;
  const hasToolGroupToolFilter = toolGroupToolFilter.trim().length > 0 || toolGroupToolServerFilter !== "all";

  const overview = data.overview;
  const diagnostics = data.diagnostics;
  const currentSectionMeta = sectionMeta[section];
  const serverRows = data.servers?.servers ?? [];
  const primaryEndpoint = overview?.endpoints[0];
  const enabledServerCount = useMemo(
    () => serverRows.filter((server) => server.enabled).length,
    [serverRows],
  );
  const attentionServerCount = useMemo(
    () => serverRows.filter((server) => server.status === "failed" || !server.enabled).length,
    [serverRows],
  );
  const transportSummary = useMemo(() => {
    const transports = new Set(serverRows.map((server) => transportLabel(server.transport)));
    return Array.from(transports).sort().join(", ") || "none";
  }, [serverRows]);
  const recentServers = useMemo(
    () =>
      [...serverRows]
        .sort((left, right) =>
          (right.last_discovered_at ?? right.updated_at ?? "").localeCompare(
            left.last_discovered_at ?? left.updated_at ?? "",
          ),
        )
        .slice(0, 4),
    [serverRows],
  );
  const quickCommands = useMemo(
    () => [
      "mcpjungle list servers",
      "mcpjungle list tools",
      primaryEndpoint?.url
        ? `mcpjungle create mcp-client codex --allow-list ${serverRows
            .filter((server) => server.enabled)
            .slice(0, 2)
            .map((server) => server.name)
            .join(",") || "context7"}`
        : "mcpjungle create mcp-client codex --allow-list context7",
    ],
    [primaryEndpoint?.url, serverRows],
  );
  const navCounts = useMemo<Partial<Record<AppSection, number>>>(
    () => ({
      servers: overview?.server_count,
      marketplace: marketplaceData?.servers.length,
      tools: overview?.tool_count,
      tool_groups: data.toolGroups?.tool_groups.length,
      prompts: overview?.prompt_count,
      resources: overview?.resource_count,
    }),
    [
      data.toolGroups?.tool_groups.length,
      marketplaceData?.servers.length,
      overview?.prompt_count,
      overview?.resource_count,
      overview?.server_count,
      overview?.tool_count,
    ],
  );

  function setBusy(key: string, value: boolean) {
    setBusyKeys((current) => {
      const next = { ...current };
      if (value) {
        next[key] = true;
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function isBusy(key: string) {
    return Boolean(busyKeys[key]);
  }

  async function runMutation(key: string, action: () => Promise<void>, successMessage: string) {
    setFeedback(null);
    setBusy(key, true);
    try {
      await action();
      await Promise.all([
        loadDashboardData(true),
        marketplaceData ? loadMarketplaceData(true) : Promise.resolve(),
      ]);
      setFeedback({ tone: "success", message: successMessage });
      announce(successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setFeedback({ tone: "error", message });
      throw error;
    } finally {
      setBusy(key, false);
    }
  }

  function updateRegisterField<K extends keyof RegisterServerFormState>(field: K, value: RegisterServerFormState[K]) {
    setRegisterForm((current) => ({ ...current, [field]: value }));
  }

  function updateKeyValueRow(
    field: "env_rows" | "header_rows",
    index: number,
    key: "key" | "value",
    value: string,
  ) {
    setRegisterForm((current) => {
      const rows = current[field].map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      );
      return { ...current, [field]: rows };
    });
  }

  function addKeyValueRow(field: "env_rows" | "header_rows") {
    setRegisterForm((current) => ({ ...current, [field]: [...current[field], createEmptyPair()] }));
  }

  function removeKeyValueRow(field: "env_rows" | "header_rows", index: number) {
    setRegisterForm((current) => {
      const rows = current[field].filter((_, rowIndex) => rowIndex !== index);
      return { ...current, [field]: rows.length > 0 ? rows : [createEmptyPair()] };
    });
  }

  function openRegisterModal() {
    setRegisterForm(createInitialRegisterForm());
    setRegisterError("");
    setRegisterDraftNotice("");
    setRegisterDraftMode("manual");
    setRegisterOAuth(null);
    setRegisterOpen(true);
  }

  function openMarketplaceRegistrationDraft(entry: DashboardMarketplaceServer) {
    if (!entry.install || entry.install_status === "blocked" || entry.install_status === "external") {
      return;
    }
    const isUpdateReview = entry.installed && entry.update_state === "update_available";
    const hasLocalChanges = entry.installed && entry.update_state === "local_changes";
    setRegisterForm(marketplaceDraftToRegisterForm(entry));
    setRegisterError("");
    setRegisterDraftNotice(
      isUpdateReview
        ? `${marketplaceDisplayName(entry)} has newer marketplace metadata. Review the catalog draft; automatic replacement is intentionally disabled.`
        : hasLocalChanges
          ? `${marketplaceDisplayName(entry)} was installed from this marketplace entry, but the local registration differs from the catalog draft. Review before changing it.`
          : entry.install_status === "review_required"
        ? `${marketplaceDisplayName(entry)} requires review before registration. Check the command, args, and security notes before submitting.`
        : `${marketplaceDisplayName(entry)} is a marketplace draft. Review the target and submit when ready.`,
    );
    setRegisterDraftMode(isUpdateReview || hasLocalChanges ? "marketplace_update_review" : "marketplace_add");
    setRegisterOAuth(null);
    setRegisterOpen(true);
  }

  function closeRegisterModal() {
    setRegisterOpen(false);
    setRegisterError("");
    setRegisterDraftNotice("");
    setRegisterDraftMode("manual");
    setRegisterOAuth(null);
    setRegisterForm(createInitialRegisterForm());
  }

  function resetRegisterOAuthStep(message = "") {
    setRegisterOAuth(null);
    setRegisterError(message);
  }

  function openToolGroupModal() {
    setToolGroupForm(createInitialToolGroupForm());
    setToolGroupError("");
    setToolGroupToolFilter("");
    setToolGroupToolServerFilter("all");
    setToolGroupOpen(true);
  }

  function closeToolGroupModal() {
    setToolGroupOpen(false);
    setToolGroupForm(createInitialToolGroupForm());
    setToolGroupError("");
  }

  function toggleToolGroupSelection(canonicalName: string) {
    setToolGroupForm((current) => ({
      ...current,
      selectedTools: current.selectedTools.includes(canonicalName)
        ? current.selectedTools.filter((name) => name !== canonicalName)
        : [...current.selectedTools, canonicalName],
    }));
  }

  function removeToolGroupSelection(canonicalName: string) {
    setToolGroupForm((current) => ({
      ...current,
      selectedTools: current.selectedTools.filter((name) => name !== canonicalName),
    }));
  }

  async function submitRegisterServer() {
    const validationError = getRegisterValidationError(registerForm);
    if (validationError) {
      setRegisterError(validationError);
      return;
    }
    if (registerDraftMode === "marketplace_update_review") {
      setRegisterError("Automatic replacement is not enabled. Delete and re-add this server only after reviewing the catalog draft.");
      return;
    }

    setRegisterError("");
    try {
      setFeedback(null);
      setBusy("register-server", true);
      const response = await api.registerServer(buildRegisterPayload(registerForm));
      if (response.authorization_required) {
        setRegisterOAuth({
          authorization: response.authorization_required,
          hasOpenedBrowser: false,
          error: "",
        });
        setFeedback(null);
        return;
      }
      await Promise.all([loadDashboardData(true), loadMarketplaceData(true)]);
      setFeedback({ tone: "success", message: `Server ${registerForm.name.trim()} registered.` });
      closeRegisterModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setRegisterError(message);
      setFeedback({ tone: "error", message });
    } finally {
      setBusy("register-server", false);
    }
  }

  function startRegisterOAuth() {
    if (!registerOAuth) {
      return;
    }
    window.open(registerOAuth.authorization.authorization_url, "_blank", "noopener,noreferrer");
    setRegisterOAuth((current) =>
      current
        ? {
            ...current,
            hasOpenedBrowser: true,
            error: "",
          }
        : current,
    );
  }

  useEffect(() => {
    if (!registerOAuth?.hasOpenedBrowser) {
      return;
    }

    let cancelled = false
    const sessionID = registerOAuth.authorization.session_id

    async function pollOAuthSession() {
      try {
        const response = await api.getOAuthSession(sessionID)
        if (cancelled) {
          return
        }
        if (response.status === "pending") {
          return
        }
        if (response.status === "completed") {
          await Promise.all([loadDashboardData(true), loadMarketplaceData(true)])
          if (cancelled) {
            return
          }
          setFeedback({
            tone: "success",
            message: `Server ${response.server_name ?? registerForm.name.trim()} registered.`,
          })
          closeRegisterModal()
          return
        }

        setRegisterOAuth((current) =>
          current
            ? {
                ...current,
                hasOpenedBrowser: false,
                error: response.error || "OAuth authorization could not be completed. Start registration again.",
              }
            : current,
        )
      } catch (error) {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : "Failed to check OAuth authorization state."
        setRegisterOAuth((current) =>
          current
            ? {
                ...current,
                hasOpenedBrowser: false,
                error: message,
              }
            : current,
        )
      }
    }

    void pollOAuthSession()
    const timer = window.setInterval(() => {
      void pollOAuthSession()
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [registerOAuth?.authorization.session_id, registerOAuth?.hasOpenedBrowser])

  async function toggleServerEnabled(server: DashboardServer) {
    const nextEnabled = !server.enabled;
    await runMutation(
      `server-toggle:${server.name}`,
      async () => {
        await api.setServerEnabled(server.name, nextEnabled);
      },
      `${server.name} ${nextEnabled ? "enabled" : "disabled"}.`,
    );
  }

  function deleteServer(server: DashboardServer) {
    setConfirmState({
      title: `Delete server "${server.name}"?`,
      message:
        "This removes the registration and all discovered tools, prompts, and resources from MCPRainforest.",
      confirmLabel: "Delete server",
      onConfirm: async () => {
        await runMutation(
          `server-delete:${server.name}`,
          async () => {
            await api.deleteServer(server.name);
          },
          `${server.name} deleted.`,
        );
        if (expandedServer === server.name) {
          setExpandedServer(null);
        }
      },
    });
  }

  async function toggleToolEnabled(tool: DashboardTool) {
    const nextEnabled = !tool.enabled;
    await runMutation(
      `tool-toggle:${tool.canonical_name}`,
      async () => {
        await api.setToolEnabled(tool.canonical_name, nextEnabled);
      },
      `${tool.canonical_name} ${nextEnabled ? "enabled" : "disabled"}.`,
    );
  }

  async function togglePromptEnabled(prompt: DashboardPrompt) {
    const nextEnabled = !prompt.enabled;
    await runMutation(
      `prompt-toggle:${prompt.canonical_name}`,
      async () => {
        await api.setPromptEnabled(prompt.canonical_name, nextEnabled);
      },
      `${prompt.canonical_name} ${nextEnabled ? "enabled" : "disabled"}.`,
    );
  }

  async function submitToolGroup() {
    const name = toolGroupForm.name.trim();
    if (!name) {
      setToolGroupError("Group name is required.");
      return;
    }
    if (toolGroupForm.selectedTools.length === 0) {
      setToolGroupError("Select at least one tool.");
      return;
    }
    if ((data.toolGroups?.tool_groups ?? []).some((group) => group.name === name)) {
      setToolGroupError("A tool group with that name already exists.");
      return;
    }

    setToolGroupError("");
    setFeedback(null);
    setBusy("tool-group-create", true);
    try {
      const payload: DashboardCreateToolGroupInput = {
        name,
        description: toolGroupForm.description.trim(),
        tools: toolGroupForm.selectedTools,
      };
      await api.createToolGroup(payload);
      await loadDashboardData(true);
      setFeedback({ tone: "success", message: `Tool group ${name} created.` });
      closeToolGroupModal();
      setSection("tool_groups");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setToolGroupError(message);
      setFeedback({ tone: "error", message });
    } finally {
      setBusy("tool-group-create", false);
    }
  }

  function deleteToolGroup(group: DashboardToolGroup) {
    setConfirmState({
      title: `Delete tool group "${group.name}"?`,
      message: "This removes the tool group and its dedicated MCP endpoints.",
      confirmLabel: "Delete group",
      onConfirm: async () => {
        await runMutation(
          `tool-group-delete:${group.name}`,
          async () => {
            await api.deleteToolGroup(group.name);
          },
          `${group.name} deleted.`,
        );
        if (expandedToolGroup === group.name) {
          setExpandedToolGroup(null);
        }
      },
    });
  }

  function renderMarketplaceAction(entry: DashboardMarketplaceServer) {
    if (entry.installed) {
      if (entry.install && entry.update_state === "update_available") {
        return (
          <button
            className="secondary-action"
            onClick={(event) => {
              event.stopPropagation();
              openMarketplaceRegistrationDraft(entry);
            }}
            type="button"
          >
            Review Update
          </button>
        );
      }
      if (entry.install && entry.update_state === "local_changes") {
        return (
          <button
            className="secondary-action"
            onClick={(event) => {
              event.stopPropagation();
              openMarketplaceRegistrationDraft(entry);
            }}
            type="button"
          >
            Review Draft
          </button>
        );
      }
      return (
        <button className="secondary-action" disabled type="button">
          {entry.update_state === "current" ? "Current" : "Update Unknown"}
        </button>
      );
    }
    if (entry.install && (entry.install_status === "installable" || entry.install_status === "review_required")) {
      return (
        <button
          className={entry.install_status === "installable" ? "primary-action" : "secondary-action"}
          onClick={(event) => {
            event.stopPropagation();
            openMarketplaceRegistrationDraft(entry);
          }}
          type="button"
        >
          {entry.install_status === "installable" ? "Review & Add" : "Review Draft"}
        </button>
      );
    }
    if (entry.install_status === "external" && (entry.homepage_url || entry.package_url)) {
      return (
        <a
          className="secondary-action marketplace-action-link"
          href={entry.homepage_url || entry.package_url}
          onClick={(event) => event.stopPropagation()}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open Source
        </a>
      );
    }
    return (
      <button className="secondary-action" disabled type="button">
        Blocked
      </button>
    );
  }

  return (
    <div className="app-shell">
      <Announcer message={announcement} />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <NavSidebar active={section} counts={navCounts} logoUrl={logoUrl} onSelect={setSection} />
      <main aria-busy={refreshing} className="main-shell" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div>
            <div className="topbar-status-row">
              {overview?.status ? (
                <StatusBadge text={serverStatusLabel(overview.status)} tone={healthTone(overview.status)} />
              ) : null}
              {usingPreviewData ? <span className="preview-chip">Sample data</span> : null}
            </div>
            <h1>{currentSectionMeta.title}</h1>
            {currentSectionMeta.subtitle ? (
              <p className="topbar-subtitle">{currentSectionMeta.subtitle}</p>
            ) : null}
          </div>
          <div className="topbar-meta">
            <ThemeModeControl value={themeMode} onChange={setThemeMode} />
            <button
              aria-label="Refresh dashboard data"
              className="secondary-action refresh-action"
              disabled={refreshing || loadState === "loading"}
              onClick={() => {
                void loadDashboardData(loadState !== "error");
                void loadMarketplaceData(true);
              }}
              type="button"
            >
              <RefreshIcon />
              <span>{refreshing ? "Refreshing" : "Refresh"}</span>
            </button>
            {lastLoadedAt ? (
              <span aria-live="polite" className="version-chip updated-chip">
                {`Updated ${formatUpdatedAt(lastLoadedAt)}`}
              </span>
            ) : null}
            {overview?.version ? (
              <span className="version-chip">{`Server version ${shortVersion(overview.version)}`}</span>
            ) : null}
            {primaryEndpoint ? (
              <div className="topbar-endpoint">
                <span className="topbar-endpoint-label">Endpoint</span>
                <code title={primaryEndpoint.url}>{primaryEndpoint.url}</code>
                <CopyButton ariaLabel="Copy endpoint" title="Copy endpoint" value={primaryEndpoint.url} />
              </div>
            ) : null}
          </div>
        </header>

        {feedback ? (
          <section className={`feedback-banner feedback-${feedback.tone}`} role="status">
            <div className="feedback-banner-text">
              <strong>{feedback.tone === "success" ? "Updated" : "Request failed"}</strong>
              <span>{feedback.message}</span>
            </div>
            <button
              aria-label="Dismiss message"
              className="feedback-dismiss icon-button"
              onClick={() => setFeedback(null)}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
                <path
                  d="m4 4 8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          </section>
        ) : null}

        {loadState === "loading" ? (
          <section aria-hidden="true" className="panel skeleton-panel">
            <div className="skeleton-line skeleton-line-lg" />
            <div className="skeleton-line skeleton-line-md" />
            <div className="skeleton-grid">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line-md" />
          </section>
        ) : null}

        {loadState === "error" ? (
          <section className="loading-screen panel error-screen">
            <h2>Dashboard API unavailable</h2>
            <p>Failed to load dashboard data from the local server.</p>
            <code>{errorMessage}</code>
          </section>
        ) : null}

        {loadState === "ready" ? (
          <div className="content-grid">
            {section === "servers" && data.servers ? (
              <>
                {overview ? (
                  <section className="gateway-overview">
                    <div className="panel gateway-primary-panel">
                      <div className="gateway-primary-copy">
                        <p className="panel-label">Global MCP endpoint</p>
                        <div className="gateway-endpoint-line">
                          <code title={primaryEndpoint?.url}>{primaryEndpoint?.url ?? "Endpoint unavailable"}</code>
                          {primaryEndpoint ? (
                            <CopyButton ariaLabel="Copy gateway endpoint" title="Copy gateway endpoint" value={primaryEndpoint.url} />
                          ) : null}
                        </div>
                        <div className="gateway-meta-grid">
                          <div>
                            <span>Mode</span>
                            <strong>{compactServerMode(overview.mode)}</strong>
                          </div>
                          <div>
                            <span>Transports</span>
                            <strong>{transportSummary}</strong>
                          </div>
                          <div>
                            <span>Version</span>
                            <strong>{shortVersion(overview.version)}</strong>
                          </div>
                        </div>
                      </div>
                      <button className="primary-action gateway-add-button" onClick={openRegisterModal} type="button">
                        + Add Server
                      </button>
                    </div>

                    <div className="gateway-metric-grid">
                      <div className="metric-card compact-metric">
                        <span>Servers</span>
                        <strong>{overview.server_count}</strong>
                      </div>
                      <div className="metric-card compact-metric">
                        <span>Enabled</span>
                        <strong>{enabledServerCount}</strong>
                      </div>
                      <div className="metric-card compact-metric">
                        <span>Attention</span>
                        <strong>{attentionServerCount}</strong>
                      </div>
                      <div className="metric-card compact-metric">
                        <span>Tools</span>
                        <strong>{overview.tool_count}</strong>
                      </div>
                      <div className="metric-card compact-metric">
                        <span>Prompts</span>
                        <strong>{overview.prompt_count}</strong>
                      </div>
                      <div className="metric-card compact-metric">
                        <span>Resources</span>
                        <strong>{overview.resource_count}</strong>
                      </div>
                    </div>
                  </section>
                ) : null}

                {usingPreviewData ? (
                  <section className="preview-callout panel">
                    <strong>Sample inventory</strong>
                    <span>Real registrations will replace these rows automatically.</span>
                  </section>
                ) : null}

                <div className="servers-console-grid">
                  <section className="panel server-inventory-panel">
                    <div className="panel-header inventory-header">
                      <div>
                        <p className="panel-label">Server inventory</p>
                        <h3>Registered MCP servers</h3>
                      </div>
                      <div className="toolbar-cluster">
                        <input
                          className="table-filter compact-filter"
                          onChange={(event) => setServerFilter(event.target.value)}
                          placeholder="Search servers"
                          value={serverFilter}
                        />
                        <button className="primary-action" onClick={openRegisterModal} type="button">
                          + Add Server
                        </button>
                      </div>
                    </div>

                    {filteredServers.length === 0 && hasServerFilter ? (
                      <FilterEmptyState
                        actionLabel="Clear search"
                        description="Clear the current search to show all registered MCP servers."
                        onClear={() => setServerFilter("")}
                        title="No servers match"
                      />
                    ) : filteredServers.length === 0 && data.servers.empty_state ? (
                      <EmptyStateCard emptyState={data.servers.empty_state} />
                    ) : filteredServers.length === 0 ? (
                      <BasicEmptyState
                        description="Register an MCP server to populate this inventory."
                        title="No registered MCP servers"
                      />
                    ) : (
                      <div className="server-console-list">
                        {filteredServers.map((server) => {
                          const expanded = expandedServer === server.name;
                          const target = server.config_summary.target ?? server.config_summary.command ?? "Unknown";
                          return (
                            <article
                              className={`server-console-row ${server.enabled ? "" : "server-row-disabled"}`}
                              key={server.name}
                            >
                              <div className="server-console-summary">
                                <button
                                  className="server-main-button"
                                  onClick={() => setExpandedServer(expanded ? null : server.name)}
                                  type="button"
                                >
                                  <span className={`server-status-dot status-${healthTone(server.status)}`} />
                                  <span className="server-name-stack">
                                    <strong>{server.name}</strong>
                                    <code>{target}</code>
                                  </span>
                                </button>

                                <div className="server-transport-cell">
                                  <span>{transportLabel(server.transport)}</span>
                                  <StatusBadge text={serverStatusLabel(server.status)} tone={healthTone(server.status)} />
                                </div>

                                <div className="server-count-grid">
                                  <div>
                                    <span>Tools</span>
                                    <strong>{server.tool_count}</strong>
                                  </div>
                                  <div>
                                    <span>Prompts</span>
                                    <strong>{server.prompt_count}</strong>
                                  </div>
                                  <div>
                                    <span>Resources</span>
                                    <strong>{server.resource_count}</strong>
                                  </div>
                                </div>

                                <div className="server-action-cluster">
                                  <StatusBadge
                                    text={server.enabled ? "Enabled" : "Disabled"}
                                    tone={server.enabled ? "good" : "muted"}
                                  />
                                  <button
                                    className="secondary-action server-action-button"
                                    disabled={usingPreviewData || isBusy(`server-toggle:${server.name}`)}
                                    onClick={() => void toggleServerEnabled(server)}
                                    title={usingPreviewData ? "Sample servers cannot be modified" : undefined}
                                    type="button"
                                  >
                                    {isBusy(`server-toggle:${server.name}`)
                                      ? "Saving..."
                                      : server.enabled
                                        ? "Disable"
                                        : "Enable"}
                                  </button>
                                  <button
                                    aria-label="Delete server"
                                    className="danger-action server-action-button icon-button danger-icon-button"
                                    disabled={usingPreviewData || isBusy(`server-delete:${server.name}`)}
                                    onClick={() => void deleteServer(server)}
                                    title={usingPreviewData ? "Sample servers cannot be deleted" : "Delete server"}
                                    type="button"
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              </div>

                              {expanded ? (
                                <div className="server-detail">
                                  {!server.enabled ? (
                                    <p className="detail-note">
                                      This server is registered but currently not exposed to MCP clients.
                                    </p>
                                  ) : null}
                                  <dl>
                                    <div>
                                      <dt>Target</dt>
                                      <dd>
                                        <div className="detail-copy-row">
                                          <code className="detail-target-code">{target}</code>
                                          {target !== "Unknown" ? (
                                            <CopyButton ariaLabel="Copy target" title="Copy target" value={target} />
                                          ) : null}
                                        </div>
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Session mode</dt>
                                      <dd>
                                        <code>{server.config_summary.session_mode ?? "Unknown"}</code>
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Header keys</dt>
                                      <dd>
                                        <code>{server.config_summary.header_keys?.join(", ") || "None"}</code>
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Env keys</dt>
                                      <dd>
                                        <code>{server.config_summary.env_keys?.join(", ") || "None"}</code>
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <aside className="ops-rail">
                    <section className="panel ops-panel">
                      <div className="ops-panel-header">
                        <p className="panel-label">Endpoints</p>
                        <strong>{overview?.endpoints.length ?? 0}</strong>
                      </div>
                      <div className="endpoint-list">
                        {(overview?.endpoints ?? []).map((endpoint) => (
                          <div className="endpoint-row compact-endpoint-row" key={`${endpoint.label}-${endpoint.url}`}>
                            <div>
                              <span>{endpoint.label}</span>
                              <code title={endpoint.url}>{endpoint.url}</code>
                            </div>
                            <CopyButton ariaLabel={`Copy ${endpoint.label}`} title={`Copy ${endpoint.label}`} value={endpoint.url} />
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="panel ops-panel">
                      <div className="ops-panel-header">
                        <p className="panel-label">Recent discovery</p>
                      </div>
                      <div className="activity-list">
                        {recentServers.map((server) => (
                          <div className="activity-row" key={server.name}>
                            <span className={`server-status-dot status-${healthTone(server.status)}`} />
                            <div>
                              <strong>{server.name}</strong>
                              <span>
                                {server.tool_count} tools / {server.prompt_count} prompts / {server.resource_count} resources
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="panel ops-panel">
                      <div className="ops-panel-header">
                        <p className="panel-label">Quick commands</p>
                      </div>
                      <div className="command-list">
                        {quickCommands.map((command) => (
                          <div className="command-chip" key={command}>
                            <code>{command}</code>
                            <CopyButton ariaLabel="Copy command" title="Copy command" value={command} />
                          </div>
                        ))}
                      </div>
                    </section>
                  </aside>
                </div>
              </>
            ) : null}

            {section === "marketplace" ? (
              <SectionCard
                title="MCP server marketplace"
                subtitle="Catalog entries are reviewed registration drafts. Submitting a draft uses the normal Add Server flow."
                action={
                  <div className="toolbar-cluster marketplace-toolbar">
                    <input
                      className="table-filter compact-filter"
                      onChange={(event) => setMarketplaceFilter(event.target.value)}
                      placeholder="Search marketplace"
                      value={marketplaceFilter}
                    />
                    <select
                      className="table-filter compact-filter compact-select"
                      onChange={(event) => setMarketplaceSourceFilter(event.target.value)}
                      value={marketplaceSourceFilter}
                    >
                      <option value="all">All sources</option>
                      {marketplaceSources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="table-filter compact-filter compact-select"
                      onChange={(event) => setMarketplaceStatusFilter(event.target.value)}
                      value={marketplaceStatusFilter}
                    >
                      <option value="all">All catalog states</option>
                      {marketplaceStatuses.map((status) => (
                        <option key={status} value={status}>
                          {marketplaceStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="table-filter compact-filter compact-select"
                      onChange={(event) => setMarketplaceUpdateFilter(event.target.value)}
                      value={marketplaceUpdateFilter}
                    >
                      <option value="all">All update states</option>
                      {marketplaceUpdateStates.map((state) => (
                        <option key={state} value={state}>
                          {marketplaceUpdateLabel(state)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="table-filter compact-filter compact-select"
                      onChange={(event) => setMarketplaceTransportFilter(event.target.value)}
                      value={marketplaceTransportFilter}
                    >
                      <option value="all">All transports</option>
                      {marketplaceTransports.map((transport) => (
                        <option key={transport} value={transport}>
                          {transportLabel(transport)}
                        </option>
                      ))}
                    </select>
                    <span className="marketplace-source-health" title="Marketplace source health">
                      {marketplaceSourceHealth.errorCount > 0
                        ? `${marketplaceSourceHealth.errorCount} source errors`
                        : `${marketplaceSourceHealth.loadedCount} sources loaded`}
                    </span>
                  </div>
                }
              >
                {marketplaceLoadState === "loading" || marketplaceLoadState === "idle" ? (
                  <div className="filter-empty-state">
                    <strong>Loading marketplace</strong>
                    <p>Reading local MCP marketplace catalog data.</p>
                  </div>
                ) : marketplaceLoadState === "error" ? (
                  <div className="filter-empty-state">
                    <strong>Marketplace unavailable</strong>
                    <p>{marketplaceError || "The marketplace catalog could not be loaded."}</p>
                    <button className="secondary-action" onClick={() => void loadMarketplaceData()} type="button">
                      Retry
                    </button>
                  </div>
                ) : marketplaceData?.empty_state ? (
                  <EmptyStateCard emptyState={marketplaceData.empty_state} />
                ) : filteredMarketplaceServers.length === 0 && hasMarketplaceFilter ? (
                  <FilterEmptyState
                    actionLabel="Clear filters"
                    description="Clear search, source, state, update, and transport filters to show all catalog entries."
                    onClear={() => {
                      setMarketplaceFilter("");
                      setMarketplaceSourceFilter("all");
                      setMarketplaceStatusFilter("all");
                      setMarketplaceUpdateFilter("all");
                      setMarketplaceTransportFilter("all");
                    }}
                    title="No marketplace entries match"
                  />
                ) : filteredMarketplaceServers.length === 0 ? (
                  <BasicEmptyState
                    description="No MCP servers are currently available in the local marketplace catalog."
                    title="No marketplace entries"
                  />
                ) : (
                  <>
                    {marketplaceSourceHealth.errorCount > 0 ? (
                      <div className="marketplace-source-warning">
                        Some marketplace sources failed; showing loaded entries.
                      </div>
                    ) : null}
                    <div className="tools-table-wrap">
                      <table className="data-table compact-table marketplace-table">
                      <thead>
                        <tr>
                          <th aria-hidden="true" className="expand-column"></th>
                          <th>Server</th>
                          <th>Source</th>
                          <th>Category</th>
                          <th>Transport</th>
                          <th>State</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMarketplaceServers.map((entry) => {
                          const expanded = expandedMarketplaceEntry === entry.id;
                          const source = marketplaceSourceByID.get(entry.source_id);
                          const installCommand =
                            entry.install?.command && entry.install.args?.length
                              ? [entry.install.command, ...entry.install.args].join(" ")
                              : entry.install?.command;
                          return (
                            <Fragment key={entry.id}>
                              <tr
                                aria-expanded={expanded}
                                className={`${expanded ? "is-selected" : ""} ${entry.install_status === "blocked" ? "is-muted" : ""} tool-summary-row`}
                                onClick={() => setExpandedMarketplaceEntry(expanded ? null : entry.id)}
                              >
                                <td className="expand-column">
                                  <ChevronIcon expanded={expanded} />
                                </td>
                                <td>
                                  <div className="table-primary">{marketplaceDisplayName(entry)}</div>
                                  <div className="table-secondary">{entry.publisher || "Unknown publisher"}</div>
                                </td>
                                <td>
                                  <div className="marketplace-source-cell">
                                    <span>{source?.name ?? entry.source_id}</span>
                                    {source?.status && source.status !== "loaded" && source.status !== "local" ? (
                                      <StatusBadge
                                        text={marketplaceSourceStatusLabel(source.status)}
                                        tone={marketplaceSourceStatusTone(source.status)}
                                      />
                                    ) : null}
                                  </div>
                                </td>
                                <td>
                                  <div className="marketplace-category-cell">
                                    <span>{entry.category || "Uncategorized"}</span>
                                  </div>
                                </td>
                                <td>{transportLabel(entry.transport)}</td>
                                <td>
                                  <div className="marketplace-state-stack">
                                    <StatusBadge
                                      text={marketplaceStatusLabel(entry.install_status)}
                                      tone={marketplaceStatusTone(entry.install_status)}
                                    />
                                    {entry.installed ? (
                                      <StatusBadge
                                        text={marketplaceUpdateLabel(entry.update_state)}
                                        tone={marketplaceUpdateTone(entry.update_state)}
                                      />
                                    ) : null}
                                  </div>
                                </td>
                                <td>
                                  <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                                    {renderMarketplaceAction(entry)}
                                  </div>
                                </td>
                              </tr>
                              {expanded ? (
                                <tr className="tool-expanded-row">
                                  <td className="tool-expanded-cell" colSpan={7}>
                                    <div className="tool-detail-panel marketplace-detail-panel">
                                      <div className="tool-detail-header">
                                        <div>
                                          <p className="panel-label">Marketplace entry</p>
                                          <h3>{marketplaceDisplayName(entry)}</h3>
                                        </div>
                                        <div className="row-actions">
                                          {renderMarketplaceAction(entry)}
                                        </div>
                                      </div>

                                      <dl className="tool-detail-meta">
                                        <div className="tool-detail-description">
                                          <dt>Description</dt>
                                          <dd>{entry.description}</dd>
                                        </div>
                                        <div>
                                          <dt>Source</dt>
                                          <dd>
                                            <div className="marketplace-source-detail">
                                              <span>{source?.name ?? entry.source_id}</span>
                                              {source?.status ? (
                                                <StatusBadge
                                                  text={marketplaceSourceStatusLabel(source.status)}
                                                  tone={marketplaceSourceStatusTone(source.status)}
                                                />
                                              ) : null}
                                              <span>{source?.server_count ?? 0} entries</span>
                                              {source?.loaded_at ? <span>Loaded {source.loaded_at}</span> : null}
                                              {source?.error ? <span className="source-error-line">{source.error}</span> : null}
                                            </div>
                                          </dd>
                                        </div>
                                        <div>
                                          <dt>Publisher</dt>
                                          <dd>{entry.publisher || "Unknown"}</dd>
                                        </div>
                                        <div>
                                          <dt>Version</dt>
                                          <dd>
                                            <code>{entry.version || "Unknown"}</code>
                                          </dd>
                                        </div>
                                        <div>
                                          <dt>Digest</dt>
                                          <dd>
                                            <code>{entry.digest || "Unavailable"}</code>
                                          </dd>
                                        </div>
                                        <div>
                                          <dt>Auth</dt>
                                          <dd>{entry.auth_type || "Unknown"}</dd>
                                        </div>
                                        <div>
                                          <dt>Update state</dt>
                                          <dd>
                                            <StatusBadge
                                              text={marketplaceUpdateLabel(entry.update_state)}
                                              tone={marketplaceUpdateTone(entry.update_state)}
                                            />
                                          </dd>
                                        </div>
                                      </dl>

                                      <div className="marketplace-detail-grid">
                                        <section className="marketplace-detail-section">
                                          <h4>Install Draft</h4>
                                          {entry.install ? (
                                            <dl className="schema-field-meta">
                                              <div>
                                                <dt>Name</dt>
                                                <dd>
                                                  <code>{entry.install.name}</code>
                                                </dd>
                                              </div>
                                              <div>
                                                <dt>Transport</dt>
                                                <dd>{transportLabel(entry.install.transport)}</dd>
                                              </div>
                                              {entry.install.url ? (
                                                <div>
                                                  <dt>URL</dt>
                                                  <dd>
                                                    <div className="detail-copy-row">
                                                      <code className="detail-target-code">{entry.install.url}</code>
                                                      <CopyButton ariaLabel="Copy marketplace URL" title="Copy URL" value={entry.install.url} />
                                                    </div>
                                                  </dd>
                                                </div>
                                              ) : null}
                                              {installCommand ? (
                                                <div>
                                                  <dt>Command</dt>
                                                  <dd>
                                                    <div className="detail-copy-row">
                                                      <code className="detail-target-code">{installCommand}</code>
                                                      <CopyButton
                                                        ariaLabel="Copy marketplace command"
                                                        title="Copy command"
                                                        value={installCommand}
                                                      />
                                                    </div>
                                                  </dd>
                                                </div>
                                              ) : null}
                                              <div>
                                                <dt>Session mode</dt>
                                                <dd>{entry.install.session_mode ?? "stateless"}</dd>
                                              </div>
                                              <div>
                                                <dt>Env keys</dt>
                                                <dd>
                                                  <code>{entry.install.required_env_keys?.join(", ") || "None"}</code>
                                                </dd>
                                              </div>
                                              <div>
                                                <dt>Header keys</dt>
                                                <dd>
                                                  <code>{entry.install.required_header_keys?.join(", ") || "None"}</code>
                                                </dd>
                                              </div>
                                            </dl>
                                          ) : (
                                            <p className="empty-inline">This entry cannot create a local registration draft.</p>
                                          )}
                                        </section>

                                        {entry.installed ? (
                                          <section className="marketplace-detail-section">
                                            <h4>Installation</h4>
                                            {entry.installation ? (
                                              <dl className="schema-field-meta">
                                                <div>
                                                  <dt>Server</dt>
                                                  <dd>
                                                    <code>{entry.installation.server_name}</code>
                                                  </dd>
                                                </div>
                                                <div>
                                                  <dt>Installed digest</dt>
                                                  <dd>
                                                    <code>{entry.installation.installed_digest || "Unavailable"}</code>
                                                  </dd>
                                                </div>
                                                <div>
                                                  <dt>Catalog digest</dt>
                                                  <dd>
                                                    <code>{entry.installation.catalog_digest || "Unavailable"}</code>
                                                  </dd>
                                                </div>
                                                <div>
                                                  <dt>Installed at</dt>
                                                  <dd>{entry.installation.installed_at || "Unknown"}</dd>
                                                </div>
                                              </dl>
                                            ) : (
                                              <p className="empty-inline">
                                                This server is installed, but no marketplace provenance was recorded.
                                              </p>
                                            )}
                                          </section>
                                        ) : null}

                                        <section className="marketplace-detail-section">
                                          <h4>Policy</h4>
                                          <div className="marketplace-note-list">
                                            {(entry.review_reasons?.length ? entry.review_reasons : ["No extra review reasons reported."]).map(
                                              (reason) => (
                                                <p key={reason}>{reason}</p>
                                              ),
                                            )}
                                          </div>
                                        </section>

                                        <section className="marketplace-detail-section">
                                          <h4>Security Notes</h4>
                                          <div className="marketplace-note-list">
                                            {(entry.security_notes?.length ? entry.security_notes : ["No security notes reported."]).map(
                                              (note) => (
                                                <p key={note}>{note}</p>
                                              ),
                                            )}
                                          </div>
                                        </section>
                                      </div>

                                      <div className="marketplace-tag-row">
                                        {(entry.tags ?? []).map((tag) => (
                                          <span className="marketplace-tag" key={tag}>
                                            {tag}
                                          </span>
                                        ))}
                                      </div>

                                      <div className="marketplace-link-row">
                                        {source?.url ? (
                                          <a href={source.url} rel="noopener noreferrer" target="_blank">
                                            Source catalog
                                          </a>
                                        ) : null}
                                        {entry.homepage_url ? (
                                          <a href={entry.homepage_url} rel="noopener noreferrer" target="_blank">
                                            Homepage
                                          </a>
                                        ) : null}
                                        {entry.package_url ? (
                                          <a href={entry.package_url} rel="noopener noreferrer" target="_blank">
                                            Package
                                          </a>
                                        ) : null}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                      </table>
                    </div>
                  </>
                )}
              </SectionCard>
            ) : null}

            {section === "tools" && data.tools ? (
              <SectionCard
                title="Tools"
                subtitle="Discovered tools across registered servers"
                action={
                  <div className="toolbar-cluster">
                    <input
                      className="table-filter compact-filter"
                      onChange={(event) => setToolFilter(event.target.value)}
                      placeholder="Search tools"
                      value={toolFilter}
                    />
                    <select
                      className="table-filter compact-filter compact-select"
                      onChange={(event) => setToolServerFilter(event.target.value)}
                      value={toolServerFilter}
                    >
                      <option value="all">All servers</option>
                      {uniqueToolServers.map((server) => (
                        <option key={server} value={server}>
                          {server}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              >
                {filteredTools.length === 0 && hasToolFilter ? (
                  <FilterEmptyState
                    actionLabel="Clear filters"
                    description="Clear search and server filters to show all discovered tools."
                    onClear={() => {
                      setToolFilter("");
                      setToolServerFilter("all");
                    }}
                    title="No tools match"
                  />
                ) : filteredTools.length === 0 && data.tools.empty_state ? (
                  <EmptyStateCard emptyState={data.tools.empty_state} />
                ) : filteredTools.length === 0 ? (
                  <BasicEmptyState
                    description="Register an MCP server with tools to populate this table."
                    title="No discovered tools"
                  />
                ) : (
                  <div className="tools-table-wrap">
                    <table className="data-table compact-table tools-table">
                      <thead>
                        <tr>
                          <th aria-hidden="true" className="expand-column"></th>
                          <th>Tool</th>
                          <th>Canonical name</th>
                          <th>Server</th>
                          <th>Description</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTools.map((tool) => {
                          const muted = !tool.enabled || !tool.server_enabled;
                          const expanded = expandedTool === tool.canonical_name;
                          const fields = parseToolSchemaFields(tool.input_schema);
                          return (
                            <Fragment key={tool.canonical_name}>
                              <tr
                                aria-expanded={expanded}
                                className={`${expanded ? "is-selected" : ""} ${muted ? "is-muted" : ""} tool-summary-row`}
                                onClick={() =>
                                  setExpandedTool(expanded ? null : tool.canonical_name)
                                }
                              >
                                <td className="expand-column">
                                  <ChevronIcon expanded={expanded} />
                                </td>
                                <td>
                                  <div className="table-primary">{tool.name}</div>
                                  {tool.annotation_keys && tool.annotation_keys.length > 0 ? (
                                    <div className="annotation-row">
                                      {tool.annotation_keys.map((key) => {
                                        const badge = annotationBadge(key);
                                        return (
                                          <span className={`annotation-badge tone-${badge.tone}`} key={key}>
                                            {badge.label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </td>
                                <td>
                                  <code className="identifier-code" title={tool.canonical_name}>
                                    {tool.canonical_name}
                                  </code>
                                </td>
                                <td>{tool.server}</td>
                                <td>
                                  <div className="clamped-description" title={toolDescription(tool)}>
                                    {toolDescription(tool)}
                                  </div>
                                </td>
                                <td>
                                  <div className="tool-state-line">
                                    <StatusBadge
                                      text={tool.enabled ? "Enabled" : "Disabled"}
                                      tone={tool.enabled ? "good" : "muted"}
                                    />
                                    {!tool.server_enabled ? (
                                      <StatusBadge text="Server disabled" tone="warn" />
                                    ) : null}
                                  </div>
                                </td>
                                <td>
                                  <div
                                    className="row-actions"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <CopyButton
                                      ariaLabel="Copy canonical name"
                                      title="Copy canonical name"
                                      value={tool.canonical_name}
                                    />
                                    <button
                                      className="secondary-action"
                                      disabled={usingPreviewData || isBusy(`tool-toggle:${tool.canonical_name}`)}
                                      onClick={() => void toggleToolEnabled(tool)}
                                      title={usingPreviewData ? "Sample tools cannot be modified" : undefined}
                                      type="button"
                                    >
                                      {isBusy(`tool-toggle:${tool.canonical_name}`)
                                        ? "Saving..."
                                        : tool.enabled
                                          ? "Disable"
                                          : "Enable"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expanded ? (
                                <tr className="tool-expanded-row">
                                  <td className="tool-expanded-cell" colSpan={7}>
                                    <div className="tool-detail-panel">
                                      <div className="tool-detail-header">
                                        <p className="panel-label">Tool details</p>
                                      </div>

                                      <dl className="tool-detail-meta">
                                        <div className="tool-detail-description">
                                          <dt>Description</dt>
                                          <dd>{toolDescription(tool)}</dd>
                                        </div>
                                      </dl>

                                      {tool.input_preview ? (
                                        <p className="detail-preview">
                                          <span className="detail-preview-label">Signature</span>
                                          <code>{tool.input_preview}</code>
                                        </p>
                                      ) : null}

                                      <div className="tool-schema-section">
                                        <div className="tool-schema-header">
                                          <h4>Input fields</h4>
                                        </div>
                                        {fields.length > 0 ? (
                                          <div className="schema-field-list">
                                            {fields.map((field) => (
                                              <article className="schema-field-card" key={field.path}>
                                                <div className="schema-field-head">
                                                  <code>{field.path}</code>
                                                  <span className="schema-type-pill">
                                                    <code>{field.type}</code>
                                                  </span>
                                                </div>
                                                <dl className="schema-field-meta">
                                                  <div>
                                                    <dt>Required</dt>
                                                    <dd>{field.required ? "yes" : "no"}</dd>
                                                  </div>
                                                  {field.description ? (
                                                    <div>
                                                      <dt>Description</dt>
                                                      <dd>{field.description}</dd>
                                                    </div>
                                                  ) : null}
                                                  {field.enumValues?.length ? (
                                                    <div>
                                                      <dt>Enum</dt>
                                                      <dd>
                                                        <code>{field.enumValues.join(", ")}</code>
                                                      </dd>
                                                    </div>
                                                  ) : null}
                                                  {field.defaultValue ? (
                                                    <div>
                                                      <dt>Default</dt>
                                                      <dd>
                                                        <code>{field.defaultValue}</code>
                                                      </dd>
                                                    </div>
                                                  ) : null}
                                                  {field.note ? (
                                                    <div>
                                                      <dt>Notes</dt>
                                                      <dd>{field.note}</dd>
                                                    </div>
                                                  ) : null}
                                                </dl>
                                              </article>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="empty-inline">No structured input fields were provided.</p>
                                        )}
                                      </div>

                                      <details className="raw-schema-disclosure">
                                        <summary>Raw schema</summary>
                                        <div className="raw-schema-code-wrap">
                                          <CopyButton
                                            ariaLabel="Copy raw schema"
                                            title="Copy raw schema"
                                            value={prettyJSON(tool.input_schema)}
                                          />
                                          <pre className="schema-code">
                                          <code>{prettyJSON(tool.input_schema)}</code>
                                          </pre>
                                        </div>
                                      </details>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            ) : null}

            {section === "tool_groups" && data.toolGroups ? (
              <SectionCard
                title="Configured tool groups"
                subtitle=""
                action={
                  <button
                    className="primary-action"
                    disabled={usingPreviewData}
                    onClick={openToolGroupModal}
                    title={usingPreviewData ? "Sample tool groups cannot be modified" : undefined}
                    type="button"
                  >
                    + Add Tool Group
                  </button>
                }
              >
                {data.toolGroups.empty_state && data.toolGroups.tool_groups.length === 0 ? (
                  <EmptyStateCard emptyState={data.toolGroups.empty_state} />
                ) : (
                  <div className="tools-table-wrap">
                    <table className="data-table compact-table prompts-table">
                      <thead>
                        <tr>
                          <th aria-hidden="true" className="expand-column"></th>
                          <th>Group</th>
                          <th>Tools</th>
                          <th>Description</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.toolGroups.tool_groups.map((group) => {
                          const expanded = expandedToolGroup === group.name;
                          return (
                            <Fragment key={group.name}>
                              <tr
                                aria-expanded={expanded}
                                className={`${expanded ? "is-selected" : ""} tool-summary-row`}
                                onClick={() => setExpandedToolGroup(expanded ? null : group.name)}
                              >
                                <td className="expand-column">
                                  <ChevronIcon expanded={expanded} />
                                </td>
                                <td>
                                  <div className="table-primary">{group.name}</div>
                                </td>
                                <td>
                                  <strong>{group.tool_count}</strong>
                                </td>
                                <td>
                                  <div className="clamped-description" title={group.description || "No description"}>
                                    {group.description || "No description"}
                                  </div>
                                </td>
                                <td>
                                  <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                                    <button
                                      aria-label="Delete tool group"
                                      className="danger-action icon-button danger-icon-button"
                                      disabled={usingPreviewData || isBusy(`tool-group-delete:${group.name}`)}
                                      onClick={() => void deleteToolGroup(group)}
                                      title={usingPreviewData ? "Sample tool groups cannot be deleted" : "Delete tool group"}
                                      type="button"
                                    >
                                      <TrashIcon />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expanded ? (
                                <tr className="tool-expanded-row">
                                  <td className="tool-expanded-cell" colSpan={5}>
                                    <div className="tool-detail-panel">
                                      <div className="tool-detail-header">
                                        <p className="panel-label">Tool group details</p>
                                      </div>
                                      {group.description ? (
                                        <dl className="tool-detail-meta">
                                          <div className="tool-detail-description">
                                            <dt>Description</dt>
                                            <dd>{group.description}</dd>
                                          </div>
                                        </dl>
                                      ) : null}
                                      <div className="tool-schema-section">
                                        <div className="tool-schema-header">
                                          <h4>MCP endpoints</h4>
                                        </div>
                                        <div className="tool-group-endpoints">
                                          <div className="tool-group-endpoint-row">
                                            <span className="tool-group-endpoint-label">Streamable HTTP</span>
                                            <div className="tool-group-endpoint-value">
                                              <code className="detail-target-code" title={group.streamable_http_endpoint}>
                                                {group.streamable_http_endpoint}
                                              </code>
                                              <CopyButton
                                                ariaLabel="Copy Streamable HTTP endpoint"
                                                title="Copy Streamable HTTP endpoint"
                                                value={group.streamable_http_endpoint}
                                              />
                                            </div>
                                          </div>
                                          <div className="tool-group-endpoint-row">
                                            <span className="tool-group-endpoint-label">SSE</span>
                                            <div className="tool-group-endpoint-stack">
                                              <div className="tool-group-endpoint-value">
                                                <code className="detail-target-code" title={group.sse_endpoint}>
                                                  {group.sse_endpoint}
                                                </code>
                                                <CopyButton
                                                  ariaLabel="Copy SSE endpoint"
                                                  title="Copy SSE endpoint"
                                                  value={group.sse_endpoint}
                                                />
                                              </div>
                                              <div className="tool-group-endpoint-value">
                                                <code className="detail-target-code" title={group.sse_message_endpoint}>
                                                  {group.sse_message_endpoint}
                                                </code>
                                                <CopyButton
                                                  ariaLabel="Copy SSE message endpoint"
                                                  title="Copy SSE message endpoint"
                                                  value={group.sse_message_endpoint}
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="tool-schema-section">
                                        <div className="tool-schema-header">
                                          <h4>Included tools</h4>
                                        </div>
                                        {group.tools.length > 0 ? (
                                          <div className="schema-field-list">
                                            {group.tools.map((tool) => (
                                              <article className="schema-field-card" key={tool.canonical_name}>
                                                <div className="schema-field-head">
                                                  <code>{tool.canonical_name}</code>
                                                  <span className="schema-type-pill">
                                                    <code>{tool.server}</code>
                                                  </span>
                                                </div>
                                                <dl className="schema-field-meta">
                                                  {tool.description ? (
                                                    <div>
                                                      <dt>Description</dt>
                                                      <dd>{tool.description}</dd>
                                                    </div>
                                                  ) : null}
                                                </dl>
                                              </article>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="empty-inline">No tools in this group.</p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            ) : null}

            {section === "prompts" && data.prompts ? (
              <SectionCard
                title="Prompts"
                subtitle="Discovered prompt templates"
                action={
                  <div className="toolbar-cluster">
                    <input
                      className="table-filter compact-filter"
                      onChange={(event) => setPromptFilter(event.target.value)}
                      placeholder="Search prompts"
                      value={promptFilter}
                    />
                  </div>
                }
              >
                {filteredPrompts.length === 0 && hasPromptFilter ? (
                  <FilterEmptyState
                    actionLabel="Clear search"
                    description="Clear the current search to show all discovered prompt templates."
                    onClear={() => setPromptFilter("")}
                    title="No prompts match"
                  />
                ) : filteredPrompts.length === 0 && data.prompts.empty_state ? (
                  <EmptyStateCard emptyState={data.prompts.empty_state} />
                ) : filteredPrompts.length === 0 ? (
                  <BasicEmptyState
                    description="Register an MCP server with prompts to populate this table."
                    title="No discovered prompts"
                  />
                ) : (
                  <div className="tools-table-wrap">
                    <table className="data-table compact-table prompts-table">
                      <thead>
                        <tr>
                          <th aria-hidden="true" className="expand-column"></th>
                          <th>Prompt</th>
                          <th>Canonical name</th>
                          <th>Server</th>
                          <th>Description</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPrompts.map((prompt) => {
                          const muted = !prompt.enabled || !prompt.server_enabled;
                          const expanded = expandedPrompt === prompt.canonical_name;
                          const fields = parsePromptArgumentFields(prompt.arguments);
                          return (
                            <Fragment key={prompt.canonical_name}>
                              <tr
                                aria-expanded={expanded}
                                className={`${expanded ? "is-selected" : ""} ${muted ? "is-muted" : ""} tool-summary-row`}
                                onClick={() =>
                                  setExpandedPrompt(expanded ? null : prompt.canonical_name)
                                }
                              >
                                <td className="expand-column">
                                  <ChevronIcon expanded={expanded} />
                                </td>
                                <td>
                                  <div className="table-primary">{prompt.name}</div>
                                </td>
                                <td>
                                  <code className="identifier-code" title={prompt.canonical_name}>
                                    {prompt.canonical_name}
                                  </code>
                                </td>
                                <td>{prompt.server}</td>
                                <td>
                                  <div className="clamped-description" title={promptDescription(prompt)}>
                                    {promptDescription(prompt)}
                                  </div>
                                  {prompt.arguments_preview ? (
                                    <code className="row-preview-code">{prompt.arguments_preview}</code>
                                  ) : null}
                                </td>
                                <td>
                                  <div className="tool-state-line">
                                    <StatusBadge
                                      text={prompt.enabled ? "Enabled" : "Disabled"}
                                      tone={prompt.enabled ? "good" : "muted"}
                                    />
                                    {!prompt.server_enabled ? (
                                      <StatusBadge text="Server disabled" tone="warn" />
                                    ) : null}
                                  </div>
                                </td>
                                <td>
                                  <div
                                    className="row-actions"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <CopyButton
                                      ariaLabel="Copy canonical name"
                                      title="Copy canonical name"
                                      value={prompt.canonical_name}
                                    />
                                    <button
                                      className="secondary-action"
                                      disabled={usingPreviewData || isBusy(`prompt-toggle:${prompt.canonical_name}`)}
                                      onClick={() => void togglePromptEnabled(prompt)}
                                      title={usingPreviewData ? "Sample prompts cannot be modified" : undefined}
                                      type="button"
                                    >
                                      {isBusy(`prompt-toggle:${prompt.canonical_name}`)
                                        ? "Saving..."
                                        : prompt.enabled
                                          ? "Disable"
                                          : "Enable"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expanded ? (
                                <tr className="tool-expanded-row">
                                  <td className="tool-expanded-cell" colSpan={7}>
                                    <div className="tool-detail-panel">
                                      <div className="tool-detail-header">
                                        <p className="panel-label">Prompt details</p>
                                      </div>

                                      <dl className="tool-detail-meta">
                                        <div className="tool-detail-description">
                                          <dt>Description</dt>
                                          <dd>{promptDescription(prompt)}</dd>
                                        </div>
                                      </dl>

                                      <div className="tool-schema-section">
                                        <div className="tool-schema-header">
                                          <h4>Arguments</h4>
                                        </div>
                                        {fields.length > 0 ? (
                                          <div className="schema-field-list">
                                            {fields.map((field) => (
                                              <article className="schema-field-card" key={field.path}>
                                                <div className="schema-field-head">
                                                  <code>{field.path}</code>
                                                  <span className="schema-type-pill">
                                                    <code>{field.type}</code>
                                                  </span>
                                                </div>
                                                <dl className="schema-field-meta">
                                                  <div>
                                                    <dt>Required</dt>
                                                    <dd>{field.required ? "yes" : "no"}</dd>
                                                  </div>
                                                  {field.description ? (
                                                    <div>
                                                      <dt>Description</dt>
                                                      <dd>{field.description}</dd>
                                                    </div>
                                                  ) : null}
                                                  {field.enumValues?.length ? (
                                                    <div>
                                                      <dt>Enum</dt>
                                                      <dd>
                                                        <code>{field.enumValues.join(", ")}</code>
                                                      </dd>
                                                    </div>
                                                  ) : null}
                                                  {field.defaultValue ? (
                                                    <div>
                                                      <dt>Default</dt>
                                                      <dd>
                                                        <code>{field.defaultValue}</code>
                                                      </dd>
                                                    </div>
                                                  ) : null}
                                                  {field.note ? (
                                                    <div>
                                                      <dt>Notes</dt>
                                                      <dd>{field.note}</dd>
                                                    </div>
                                                  ) : null}
                                                </dl>
                                              </article>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="empty-inline">No arguments.</p>
                                        )}
                                      </div>

                                      <details className="raw-schema-disclosure">
                                        <summary>Raw arguments</summary>
                                        <div className="raw-schema-actions">
                                          <CopyButton
                                            ariaLabel="Copy raw arguments"
                                            title="Copy raw arguments"
                                            value={prettyPromptArguments(prompt.arguments)}
                                          />
                                        </div>
                                        <pre className="schema-code">
                                          <code>{prettyPromptArguments(prompt.arguments)}</code>
                                        </pre>
                                      </details>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            ) : null}

            {section === "resources" && data.resources ? (
              <SectionCard title="Resources" subtitle="Discovered MCP resources">
                {data.resources.empty_state && data.resources.resources.length === 0 ? (
                  <EmptyStateCard emptyState={data.resources.empty_state} />
                ) : (
                  <table className="data-table compact-table resources-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>URI</th>
                        <th>Server</th>
                        <th>MIME</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.resources.resources.map((resource) => (
                        <tr key={resource.uri}>
                          <td>{resource.name}</td>
                          <td>
                            <div className="inline-copy resource-uri-cell">
                              <code className="identifier-code" title={resource.uri}>
                                {resource.uri}
                              </code>
                              <CopyButton
                                ariaLabel="Copy resource URI"
                                title="Copy resource URI"
                                value={resource.uri}
                              />
                            </div>
                          </td>
                          <td>{resource.server}</td>
                          <td>
                            <code>{resource.mime_type || "Unknown"}</code>
                          </td>
                          <td>{resourceDescription(resource)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </SectionCard>
            ) : null}

            {section === "diagnostics" && diagnostics ? (
              <>
                <SectionCard title="System Info" subtitle="Runtime details">
                  <div className="diagnostics-grid compact-diagnostics-grid">
                    <div className="diag-card compact-metric">
                      <span>Version</span>
                      <strong>{shortVersion(diagnostics.version)}</strong>
                    </div>
                    <div className="diag-card compact-metric">
                      <span>Mode</span>
                      <strong>{diagnostics.mode}</strong>
                    </div>
                    <div className="diag-card compact-metric">
                      <span>Database</span>
                      <strong>{diagnostics.database}</strong>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Runtime details" subtitle="System information">
                  <dl className="diagnostic-list compact-diagnostic-list">
                    <div>
                      <dt>Full build</dt>
                      <dd>
                        <code>{diagnostics.version}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Global MCP Endpoint</dt>
                      <dd>
                        <code>{diagnostics.primary_endpoint}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Enabled transports</dt>
                      <dd>
                        <code>{diagnostics.enabled_transports.join(", ")}</code>
                      </dd>
                    </div>
                  </dl>
                </SectionCard>
              </>
            ) : null}
          </div>
        ) : null}

        <Dialog onClose={closeToolGroupModal} open={toolGroupOpen} titleId={toolGroupTitleId}>
              <div className="modal-header">
                <div>
                  <p className="panel-label">Tool Groups</p>
                  <h2 id={toolGroupTitleId}>Add Tool Group</h2>
                </div>
                <button className="secondary-action" onClick={closeToolGroupModal} type="button">
                  Close
                </button>
              </div>

              <div className="modal-form">
                <label className="form-field">
                  <span>Group name</span>
                  <input
                    className="table-filter form-input"
                    onChange={(event) => setToolGroupForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="coding"
                    value={toolGroupForm.name}
                  />
                </label>

                <label className="form-field">
                  <span>Description</span>
                  <input
                    className="table-filter form-input"
                    onChange={(event) =>
                      setToolGroupForm((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Tools useful for coding workflows"
                    value={toolGroupForm.description}
                  />
                </label>

                <div className="tool-group-builder">
                  <div className="tool-group-selector panel">
                    <div className="tool-group-selector-header">
                      <strong>Available tools</strong>
                    </div>
                    {(data.tools?.tools.length ?? 0) > 0 ? (
                      <>
                        <div className="toolbar-cluster">
                          <input
                            className="table-filter compact-filter"
                            onChange={(event) => setToolGroupToolFilter(event.target.value)}
                            placeholder="Search tools"
                            value={toolGroupToolFilter}
                          />
                          <select
                            className="table-filter compact-filter compact-select"
                            onChange={(event) => setToolGroupToolServerFilter(event.target.value)}
                            value={toolGroupToolServerFilter}
                          >
                            <option value="all">All servers</option>
                            {uniqueToolServers.map((server) => (
                              <option key={server} value={server}>
                                {server}
                              </option>
                            ))}
                          </select>
                        </div>
                        {availableToolGroupTools.length === 0 && hasToolGroupToolFilter ? (
                          <FilterEmptyState
                            actionLabel="Clear filters"
                            description="Clear search and server filters to show all available tools."
                            onClear={() => {
                              setToolGroupToolFilter("");
                              setToolGroupToolServerFilter("all");
                            }}
                            title="No available tools match"
                          />
                        ) : (
                          <div className="tool-pick-list">
                            {availableToolGroupTools.map((tool) => {
                              const selected = toolGroupForm.selectedTools.includes(tool.canonical_name);
                              return (
                                <button
                                  className={`tool-pick-item ${selected ? "is-selected" : ""}`}
                                  key={tool.canonical_name}
                                  onClick={() => toggleToolGroupSelection(tool.canonical_name)}
                                  type="button"
                                >
                                  <div className="table-primary">{tool.name}</div>
                                  <code className="identifier-code" title={tool.canonical_name}>
                                    {tool.canonical_name}
                                  </code>
                                  <div className="table-secondary">{tool.server}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="empty-inline">Register MCP servers first so tools are available to group.</p>
                    )}
                  </div>

                  <div className="tool-group-selector panel">
                    <div className="tool-group-selector-header">
                      <strong>Selected tools</strong>
                    </div>
                    {toolGroupForm.selectedTools.length > 0 ? (
                      <div className="selected-tool-list">
                        {toolGroupForm.selectedTools.map((toolName) => (
                          <button
                            className="selected-tool-chip"
                            key={toolName}
                            onClick={() => removeToolGroupSelection(toolName)}
                            type="button"
                          >
                            <code>{toolName}</code>
                            <span>Remove</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-inline">Select at least one tool.</p>
                    )}
                  </div>
                </div>

                {toolGroupError ? <p className="form-error">{toolGroupError}</p> : null}
              </div>

              <div className="modal-footer">
                <button className="secondary-action" onClick={closeToolGroupModal} type="button">
                  Cancel
                </button>
                <button
                  className="primary-action"
                  disabled={isBusy("tool-group-create")}
                  onClick={() => void submitToolGroup()}
                  type="button"
                >
                  {isBusy("tool-group-create") ? "Saving..." : "+ Add Tool Group"}
                </button>
              </div>
        </Dialog>

        <Dialog onClose={closeRegisterModal} open={registerOpen} titleId={registerTitleId}>
              <div className="modal-header">
                <div>
                  <p className="panel-label">
                    {registerDraftMode === "marketplace_update_review" ? "Marketplace update" : "Add server"}
                  </p>
                  <h2 id={registerTitleId}>
                    {registerOAuth
                      ? "Complete OAuth authorization"
                      : registerDraftMode === "marketplace_update_review"
                        ? "Review marketplace update"
                        : "Register an MCP server"}
                  </h2>
                </div>
                <button className="secondary-action" onClick={closeRegisterModal} type="button">
                  Close
                </button>
              </div>

              {registerOAuth ? (
                <div className="modal-form oauth-step">
                  <p className="oauth-message">
                    This MCP server requires OAuth authorization. Continue in your browser to complete
                    registration.
                  </p>
                  <div className="oauth-status-card">
                    <div>
                      <span className="oauth-status-label">Status</span>
                      <strong>
                        {registerOAuth.hasOpenedBrowser
                          ? "Waiting for OAuth authorization..."
                          : "Authorization required"}
                      </strong>
                    </div>
                    {registerOAuth.authorization.expires_at ? (
                      <p className="oauth-status-meta">
                        Expires {new Date(registerOAuth.authorization.expires_at).toLocaleTimeString()}
                      </p>
                    ) : null}
                  </div>
                  {registerOAuth.error ? <p className="form-error">{registerOAuth.error}</p> : null}
                </div>
              ) : (
                <>
                  {registerDraftNotice ? (
                    <section className="marketplace-draft-notice">
                      <strong>Marketplace draft</strong>
                      <span>{registerDraftNotice}</span>
                    </section>
                  ) : null}
                  <div className="modal-form">
                    <label className="form-field">
                      <span>Server name</span>
                      <input
                        className="table-filter form-input"
                        onChange={(event) => updateRegisterField("name", event.target.value)}
                        placeholder={registerForm.transport === "streamable_http" ? "context7" : "filesystem"}
                        value={registerForm.name}
                      />
                    </label>

                    <label className="form-field">
                      <span>Description</span>
                      <input
                        className="table-filter form-input"
                        onChange={(event) => updateRegisterField("description", event.target.value)}
                        placeholder={
                          registerForm.transport === "streamable_http"
                            ? "context7 mcp server"
                            : "Local filesystem access"
                        }
                        value={registerForm.description}
                      />
                    </label>

                    <div className="form-grid">
                      <label className="form-field">
                        <span>Transport</span>
                        <select
                          className="table-filter form-input compact-select"
                          onChange={(event) =>
                            updateRegisterField(
                              "transport",
                              event.target.value as RegisterServerFormState["transport"],
                            )
                          }
                          value={registerForm.transport}
                        >
                          <option value="stdio">stdio</option>
                          <option value="streamable_http">streamable_http</option>
                          <option value="sse">sse</option>
                        </select>
                      </label>

                      <label className="form-field">
                        <span>Session mode</span>
                        <select
                          className="table-filter form-input compact-select"
                          onChange={(event) =>
                            updateRegisterField(
                              "session_mode",
                              event.target.value as RegisterServerFormState["session_mode"],
                            )
                          }
                          value={registerForm.session_mode}
                        >
                          <option value="stateless">stateless</option>
                          <option value="stateful">stateful</option>
                        </select>
                      </label>
                    </div>

                    {registerForm.transport === "stdio" ? (
                      <>
                        <label className="form-field">
                          <span>Command</span>
                          <input
                            className="table-filter form-input"
                            onChange={(event) => updateRegisterField("command", event.target.value)}
                            placeholder="npx"
                            value={registerForm.command}
                          />
                        </label>

                        <label className="form-field">
                          <span>Arguments</span>
                          <textarea
                            className="table-filter form-input form-textarea"
                            onChange={(event) => updateRegisterField("args_text", event.target.value)}
                            placeholder="-y&#10;@modelcontextprotocol/server-filesystem"
                            value={registerForm.args_text}
                          />
                        </label>

                        <div className="form-field">
                          <span>Environment variables</span>
                          <div className="key-value-list">
                            {registerForm.env_rows.map((row, index) => (
                              <div className="key-value-row" key={`env-${index}`}>
                                <input
                                  className="table-filter form-input"
                                  onChange={(event) =>
                                    updateKeyValueRow("env_rows", index, "key", event.target.value)
                                  }
                                  placeholder="KEY"
                                  value={row.key}
                                />
                                <input
                                  className="table-filter form-input"
                                  onChange={(event) =>
                                    updateKeyValueRow("env_rows", index, "value", event.target.value)
                                  }
                                  placeholder="value"
                                  value={row.value}
                                />
                                <button
                                  className="secondary-action"
                                  onClick={() => removeKeyValueRow("env_rows", index)}
                                  type="button"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            className="secondary-action inline-action"
                            onClick={() => addKeyValueRow("env_rows")}
                            type="button"
                          >
                            Add env var
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="form-field">
                          <span>Target URL</span>
                          <input
                            className="table-filter form-input"
                            onChange={(event) => updateRegisterField("url", event.target.value)}
                            placeholder={
                              registerForm.transport === "streamable_http"
                                ? "https://mcp.context7.com/mcp"
                                : "http://127.0.0.1:8000/mcp"
                            }
                            value={registerForm.url}
                          />
                        </label>

                        <label className="form-field">
                          <span>Bearer token</span>
                          <input
                            className="table-filter form-input"
                            onChange={(event) => updateRegisterField("bearer_token", event.target.value)}
                            placeholder="Optional"
                            type="password"
                            value={registerForm.bearer_token}
                          />
                        </label>

                        {registerForm.transport === "streamable_http" ? (
                          <div className="form-field">
                            <span>Headers</span>
                            <div className="key-value-list">
                              {registerForm.header_rows.map((row, index) => (
                                <div className="key-value-row" key={`header-${index}`}>
                                  <input
                                    className="table-filter form-input"
                                    onChange={(event) =>
                                      updateKeyValueRow("header_rows", index, "key", event.target.value)
                                    }
                                    placeholder="Header"
                                    value={row.key}
                                  />
                                  <input
                                    className="table-filter form-input"
                                    onChange={(event) =>
                                      updateKeyValueRow("header_rows", index, "value", event.target.value)
                                    }
                                    placeholder="Value"
                                    value={row.value}
                                  />
                                  <button
                                    className="secondary-action"
                                    onClick={() => removeKeyValueRow("header_rows", index)}
                                    type="button"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              className="secondary-action inline-action"
                              onClick={() => addKeyValueRow("header_rows")}
                              type="button"
                            >
                              Add header
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}

                    {registerError ? <p className="form-error">{registerError}</p> : null}
                  </div>
                </>
              )}

              <div className="modal-footer">
                {registerOAuth ? (
                  <>
                    <button
                      className="secondary-action"
                      onClick={() => resetRegisterOAuthStep("Start registration again to retry OAuth.")}
                      type="button"
                    >
                      Start over
                    </button>
                    <button className="primary-action" onClick={startRegisterOAuth} type="button">
                      {registerOAuth.hasOpenedBrowser ? "Open OAuth again" : "Continue OAuth"}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="secondary-action" onClick={closeRegisterModal} type="button">
                      Cancel
                    </button>
                    <button
                      className="primary-action"
                      disabled={isBusy("register-server") || registerDraftMode === "marketplace_update_review"}
                      onClick={() => void submitRegisterServer()}
                      type="button"
                    >
                      {registerDraftMode === "marketplace_update_review"
                        ? "Review Only"
                        : isBusy("register-server")
                          ? "Registering..."
                          : "+ Add Server"}
                    </button>
                  </>
                )}
              </div>
        </Dialog>
        <ConfirmDialog
          busy={confirmBusy}
          confirmLabel={confirmState?.confirmLabel ?? "Confirm"}
          message={confirmState?.message ?? ""}
          onCancel={() => {
            if (confirmBusy) {
              return;
            }
            setConfirmState(null);
          }}
          onConfirm={async () => {
            if (!confirmState) {
              return;
            }
            setConfirmBusy(true);
            try {
              await confirmState.onConfirm();
              setConfirmState(null);
            } catch {
              // runMutation already surfaced the error via feedback; keep dialog open.
            } finally {
              setConfirmBusy(false);
            }
          }}
          open={confirmState !== null}
          title={confirmState?.title ?? ""}
        />
      </main>
    </div>
  );
}
