export default function PanelToggleIcon({ open }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10" y1="2.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
      {open && <rect x="11" y="3.3" width="2.6" height="9.4" rx="0.6" fill="currentColor" />}
    </svg>
  );
}
