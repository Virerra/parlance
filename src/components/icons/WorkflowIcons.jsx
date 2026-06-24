// All icons use 16×16 viewBox, stroke="currentColor", strokeWidth="1.2",
// matching the existing PanelToggleIcon convention.
// Use with currentColor so they inherit text color from their context.

const S = 1.2; // standard stroke width

export function AgentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth={S} />
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function OverseerIcon() {
  // Diamond shape — distinct from round agents, signals authority/evaluation
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L14.5 8L8 14.5L1.5 8Z" stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
      <path d="M8 5L11 8L8 11L5 8Z" fill="currentColor" />
    </svg>
  );
}

export function FileImportIcon() {
  // Arrow pointing up into a box from below — importing
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth={S} />
      <line x1="8" y1="14.5" x2="8" y2="7.5" stroke="currentColor" strokeWidth={S} />
      <path d="M5.5 10L8 7.5L10.5 10" stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
    </svg>
  );
}

export function OutputIcon() {
  // Box with arrow exiting downward — delivery/output
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth={S} />
      <line x1="8" y1="10" x2="8" y2="14.5" stroke="currentColor" strokeWidth={S} />
      <path d="M5.5 12L8 14.5L10.5 12" stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
    </svg>
  );
}

export function ChainIcon() {
  // Two interlocked rings — chain/link
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="5.5" cy="8" r="3.5" stroke="currentColor" strokeWidth={S} />
      <circle cx="10.5" cy="8" r="3.5" stroke="currentColor" strokeWidth={S} />
      <rect x="7" y="5.5" width="2" height="5" fill="var(--bg, #161718)" />
    </svg>
  );
}

export function TidyUpIcon() {
  // Grid arrangement — layout/organize
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth={S} />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth={S} />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth={S} />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth={S} />
    </svg>
  );
}

export function FitViewIcon() {
  // Four corner arrows pointing outward — fit/expand
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 6V2H6" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 2H14V6" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 10V14H10" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 14H2V10" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ConditionsIcon() {
  // Circle with checkmark inside — success criteria
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth={S} />
      <path d="M5.5 8L7 9.5L10.5 6" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EditIcon() {
  // Pencil
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M10.5 2.5L13.5 5.5L6 13H3V10L10.5 2.5Z" stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
      <line x1="8.5" y1="4.5" x2="11.5" y2="7.5" stroke="currentColor" strokeWidth={S} />
    </svg>
  );
}

export function DeleteIcon() {
  // Trash can
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 5H13" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
      <path d="M6 5V3.5H10V5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth={S} />
      <line x1="7" y1="8" x2="7" y2="11" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
      <line x1="9.5" y1="8" x2="9.5" y2="11" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function CacheIcon() {
  // Cylinder / data storage — represents saved/cached data
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="4.5" rx="5" ry="2" stroke="currentColor" strokeWidth={S} />
      <path d="M3 4.5V11.5" stroke="currentColor" strokeWidth={S} />
      <path d="M13 4.5V11.5" stroke="currentColor" strokeWidth={S} />
      <ellipse cx="8" cy="11.5" rx="5" ry="2" stroke="currentColor" strokeWidth={S} />
    </svg>
  );
}

export function ChainConnectedIcon() {
  // Two circles connected by a line — indicates live chain connection
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="8" r="2.5" stroke="currentColor" strokeWidth={S} />
      <line x1="6.5" y1="8" x2="9.5" y2="8" stroke="currentColor" strokeWidth={S} />
      <circle cx="12" cy="8" r="2.5" stroke="currentColor" strokeWidth={S} />
    </svg>
  );
}

export function DeleteConnectionIcon() {
  // X between two nodes — delete a connection
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="8" x2="5.5" y2="8" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
      <line x1="10.5" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
      <path d="M6.5 6L9.5 10M9.5 6L6.5 10" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}
