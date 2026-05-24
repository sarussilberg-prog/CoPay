/* eslint-disable */
// Kupa · ActivityScreen — chronological feed across groups (expense, message, settlement).

function ActivityScreen({ activity, members, groups }) {
  const memberById = React.useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);
  const groupById = React.useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px 16px', background: '#fff' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Activity</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <IconButton name="search-outline" color="var(--gray-600)" />
          <IconButton name="filter-outline" color="var(--gray-600)" />
        </div>
      </div>

      <div style={{ padding: '4px 16px 12px 16px', background: '#fff', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{
          display: 'flex', gap: 6, padding: '4px 0',
          overflowX: 'auto',
        }}>
          {['All', 'Expenses', 'Settlements', 'Messages'].map((t, i) => (
            <span key={t} style={{
              padding: '6px 12px', borderRadius: 9999,
              background: i === 0 ? 'var(--primary)' : 'var(--gray-100)',
              color: i === 0 ? '#fff' : 'var(--gray-700)',
              fontSize: 12, fontWeight: 600,
            }}>{t}</span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px 16px' }}>
        {activity.map((a) => {
          const actor = memberById[a.actorId] || { name: 'Someone', initials: '?' };
          const group = groupById[a.groupId];
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <MemberAvatar name={actor.name} initials={actor.initials} size="xs" />
              <div style={{
                flex: 1, background: '#fff', borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--gray-100)', padding: '10px 12px',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{a.desc}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {actor.name}
                    {a.kind === 'message' ? ' · Message' : a.kind === 'settlement' ? ' · Settlement' : ' · Expense'}
                    {' · '}{group && group.name}
                    {' · '}{a.when}
                  </div>
                </div>
                {a.amount && (
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: a.kind === 'settlement' ? 'var(--success)' : 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}>
                    {a.currency} {a.amount.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.ActivityScreen = ActivityScreen;
