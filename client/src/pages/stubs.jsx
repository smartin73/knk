// ── Placeholder component factory ────────────────────────
function Stub({ title, icon }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{icon} {title}</div>
          <div className="page-subtitle">Coming soon — this module will be built next</div>
        </div>
      </div>
      <div className="card">
        <div className="empty-state">
          <div style={{fontSize: 48}}>{icon}</div>
          <p>This module is scaffolded and ready to build.</p>
        </div>
      </div>
    </div>
  );
}

export function RecipesPage()     { return <Stub title="Recipes"      icon="📖" />; }
export function ItemBuilderPage() { return <Stub title="Item Builder" icon="🧁" />; }
export function EventsPage()      { return <Stub title="Events"       icon="📅" />; }
export function DonationsPage()   { return <Stub title="Donations"    icon="💛" />; }
