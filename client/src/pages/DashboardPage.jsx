import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/events?limit=5'),
      api.get('/recipes'),
      api.get('/items'),
      api.get('/ingredients'),
    ]).then(([events, recipes, items, ingredients]) => {
      setStats({ events, recipes, items, ingredients });
    }).catch(console.error);
  }, []);

  const upcoming = stats?.events?.filter(e => e.event_date >= new Date().toISOString().slice(0,10)) || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Welcome back to Knife & Knead</div>
        </div>
      </div>

      <div className="stats-grid">
        {[
          { label: 'Recipes',      value: stats?.recipes?.length     ?? '…' },
          { label: 'Items',        value: stats?.items?.length        ?? '…' },
          { label: 'Ingredients',  value: stats?.ingredients?.length  ?? '…' },
          { label: 'Upcoming Events', value: upcoming.length          ?? '…' },
        ].map(s => (
          <div className="card" key={s.label}>
            <div className="card-title">{s.label}</div>
            <div className="card-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title" style={{marginBottom: 16}}>Upcoming Events</div>
        {upcoming.length === 0 ? (
          <div className="empty-state"><p>No upcoming events</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Event</th><th>Date</th><th>Location</th><th>Status</th>
              </tr></thead>
              <tbody>
                {upcoming.slice(0,5).map(e => (
                  <tr key={e.id}>
                    <td>{e.event_name}</td>
                    <td>{e.event_date}</td>
                    <td className="text-muted">{e.location}</td>
                    <td><span className={`badge badge-${e.status === 'published' ? 'green' : e.status === 'cancelled' ? 'red' : 'yellow'}`}>{e.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
