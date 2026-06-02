/* eslint-disable */
// Kupay · GroupsListScreen — wordmark header, search row, list of GroupCards.

function GroupsListScreen({ groups, onOpenGroup, onCreateGroup, onSearch }) {
  const [query, setQuery] = React.useState('');
  const filtered = React.useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px 16px', background: '#fff' }}>
        <div className="brand-wordmark" style={{ fontSize: 26 }}>kupa</div>
        <IconButton name="search-outline" color="var(--gray-600)" />
      </div>

      {/* Search row */}
      <div style={{ padding: '4px 16px 12px 16px', background: '#fff', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--gray-100)', borderRadius: 12, padding: '10px 12px',
        }}>
          <Icon name="search-outline" size={18} color="var(--gray-400)" />
          <input
            placeholder="Search groups or members"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none',
              fontSize: 14, fontFamily: 'var(--font-sans)', color: 'var(--text-primary)',
            }}
          />
          <Icon name="filter-outline" size={18} color="var(--gray-400)" />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, padding: '0 4px 8px 4px' }}>
          Your groups · {filtered.filter(g => !g.archived).length}
        </div>

        {filtered.filter(g => !g.archived).map(g => (
          <GroupRow key={g.id} group={g} onClick={() => onOpenGroup(g.id)} />
        ))}

        {filtered.some(g => g.archived) && (
          <>
            <div style={{ fontSize: 11, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, padding: '14px 4px 8px 4px' }}>
              Archived
            </div>
            {filtered.filter(g => g.archived).map(g => (
              <GroupRow key={g.id} group={g} onClick={() => onOpenGroup(g.id)} archived />
            ))}
          </>
        )}
      </div>

      {/* Create FAB */}
      <button
        onClick={onCreateGroup}
        style={{
          position: 'absolute', right: 16, bottom: 76, zIndex: 10,
          background: 'var(--primary)', color: '#fff', border: 0,
          borderRadius: 28, padding: '12px 18px',
          fontSize: 15, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          boxShadow: 'var(--shadow-fab)', cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <Icon name="add" size={22} color="#fff" /> Create group
      </button>
    </div>
  );
}

function GroupRow({ group, onClick, archived = false }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: archived ? 'var(--slate-50)' : '#fff',
        borderRadius: 'var(--radius-2xl)',
        border: archived ? '1px dashed var(--gray-300)' : '1px solid var(--gray-100)',
        padding: 16,
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 10,
        cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <GroupAvatar type={group.type} size="sm" style={{ opacity: archived ? 0.6 : 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontSize: 16, fontWeight: 600,
            color: archived ? 'var(--gray-600)' : 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{group.name}</div>
          {archived && (
            <span style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--gray-200)', color: 'var(--gray-600)', fontSize: 10, fontWeight: 500, letterSpacing: 0.5 }}>
              ARCHIVED
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {capitalize(group.type)} · {group.memberIds.length} {group.memberIds.length === 1 ? 'person' : 'people'}
        </div>
      </div>
      <BalanceChip net={group.net} currency={group.netCurrency} />
      <Icon name="chevron-forward" size={20} color="var(--gray-300)" />
    </div>
  );
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

window.GroupsListScreen = GroupsListScreen;
