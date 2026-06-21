import type { AppSection } from "@/lib/types";

const items: Array<{ key: AppSection; label: string }> = [
  { key: "servers", label: "Servers" },
  { key: "tools", label: "Tools" },
  { key: "tool_groups", label: "Tool Groups" },
  { key: "prompts", label: "Prompts" },
  { key: "resources", label: "Resources" },
  { key: "diagnostics", label: "System Info" },
];

function SectionIcon({ section }: { section: AppSection }) {
  switch (section) {
    case "servers":
      return (
        <svg aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 16 16">
          <path d="M3.25 3.25h9.5v3.5h-9.5zM3.25 9.25h9.5v3.5h-9.5z" stroke="currentColor" strokeLinejoin="round" />
          <path d="M5.25 5h.01M5.25 11h.01" stroke="currentColor" strokeLinecap="round" />
        </svg>
      );
    case "tools":
      return (
        <svg aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 16 16">
          <path d="m9.75 2.75 3.5 3.5-7 7H2.75v-3.5z" stroke="currentColor" strokeLinejoin="round" />
          <path d="m8.5 4 3.5 3.5" stroke="currentColor" strokeLinecap="round" />
        </svg>
      );
    case "tool_groups":
      return (
        <svg aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 16 16">
          <path d="M2.75 4.25h4.5v4.5h-4.5zM8.75 2.75h4.5v4.5h-4.5zM8.75 8.75h4.5v4.5h-4.5z" stroke="currentColor" strokeLinejoin="round" />
        </svg>
      );
    case "prompts":
      return (
        <svg aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 16 16">
          <path d="M3.25 3.25h9.5v6.5h-4L6 12.75V9.75H3.25z" stroke="currentColor" strokeLinejoin="round" />
          <path d="M5.25 5.5h5.5M5.25 7.5h3" stroke="currentColor" strokeLinecap="round" />
        </svg>
      );
    case "resources":
      return (
        <svg aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 16 16">
          <path d="M4.25 2.75h4.75l2.75 2.75v7.75h-7.5z" stroke="currentColor" strokeLinejoin="round" />
          <path d="M8.75 2.75v3h3M5.75 8.25h4.5M5.75 10.25h3" stroke="currentColor" strokeLinecap="round" />
        </svg>
      );
    case "diagnostics":
      return (
        <svg aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 16 16">
          <path d="M8 2.75v2M8 11.25v2M13.25 8h-2M4.75 8h-2M11.7 4.3l-1.4 1.4M5.7 10.3l-1.4 1.4M11.7 11.7l-1.4-1.4M5.7 5.7 4.3 4.3" stroke="currentColor" strokeLinecap="round" />
          <circle cx="8" cy="8" r="2.25" stroke="currentColor" />
        </svg>
      );
  }
}

export function NavSidebar({
  active,
  onSelect,
  logoUrl,
  counts,
}: {
  active: AppSection;
  onSelect: (section: AppSection) => void;
  logoUrl: string;
  counts?: Partial<Record<AppSection, number>>;
}) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <img alt="MCPRainforest logo" className="brand-logo" src={logoUrl} />
        <div className="brand-title-row">
          <p className="brand-title">MCPRainforest</p>
          <span className="brand-beta" title="Dashboard frontend is currently in Beta">
            Beta
          </span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Dashboard sections">
        {items.map((item) => (
          <button
            className={`nav-item ${active === item.key ? "is-active" : ""}`}
            key={item.key}
            onClick={() => onSelect(item.key)}
            type="button"
          >
            <span className="nav-item-main">
              <SectionIcon section={item.key} />
              <span>{item.label}</span>
            </span>
            {typeof counts?.[item.key] === "number" ? (
              <span className="nav-count">{counts[item.key]}</span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="sidebar-actions">
        <a
          className="sidebar-link"
          href="https://github.com/andrewseago/MCPRainforest/issues"
          rel="noopener noreferrer"
          target="_blank"
        >
          <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
            <path
              d="M8 2.25a2 2 0 0 0-2 2v.6a3.5 3.5 0 0 0-1.75 3.03v.62l-.94.94a.75.75 0 0 0 .53 1.28h8.32a.75.75 0 0 0 .53-1.28l-.94-.94v-.62A3.5 3.5 0 0 0 10 4.85v-.6a2 2 0 0 0-2-2Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d="M6.5 11.75a1.5 1.5 0 0 0 3 0"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.2"
            />
          </svg>
          <span>Report Bugs</span>
        </a>
        <a
          aria-label="Open upstream MCPJungle documentation"
          className="sidebar-link"
          href="https://docs.mcpjungle.com/"
          rel="noopener noreferrer"
          target="_blank"
          title="Open upstream MCPJungle documentation"
        >
          <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
            <path
              d="M4 2.75h6.25A1.75 1.75 0 0 1 12 4.5v8.25a.5.5 0 0 1-.78.41A3.25 3.25 0 0 0 9.5 12.5H4.75A1.75 1.75 0 0 1 3 10.75V3.75A1 1 0 0 1 4 2.75Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d="M5.25 5h4.5M5.25 7h4.5M5.25 9h2.75"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.2"
            />
          </svg>
          <span>Documentation</span>
        </a>
      </div>
    </aside>
  );
}
