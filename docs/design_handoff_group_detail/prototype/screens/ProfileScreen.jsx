/* eslint-disable */
// Kupa · ProfileScreen — header row, BalanceHeroCard, stat tiles, friends list.

function ProfileScreen({ currentUser, balanceSummary, groupsCount, settledCount, friends, onSettings, onSignOut }) {
  const [expanded, setExpanded] = React.useState(false);
  const net = balanceSummary.net;
  const settled = Math.abs(net) < 0.01;
  const owed = net > 0;
  const netLabel = settled ? 'Net balance' : (owed ? 'Net in your favor' : 'Net you owe');
  const netColor = settled ? 'var(--slate-500)' : (owed ? 'var(--success)' : 'var(--error)');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--slate-100)', height: '100%' }}>
      {/* Settings icon row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0 16px' }}>
        <button onClick={onSettings} style={{
          width: 40, height: 40, borderRadius: '50%',
          background: '#fff', border: '1px solid var(--border-card)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
        }}>
          <Icon name="settings-outline" size={22} color="var(--gray-600)" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 16px 16px' }}>
          <MemberAvatar name={currentUser.name} initials={currentUser.initials} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{currentUser.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{currentUser.email}</div>
          </div>
          <button style={{
            padding: '8px 12px', borderRadius: 9999,
            background: 'var(--primary-extra-light)', color: 'var(--primary-dark)',
            border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}>Edit</button>
        </div>

        {/* Balance hero card */}
        <div style={{
          margin: '0 16px 16px 16px', background: '#fff',
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-card)',
          overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ padding: '14px 16px 8px 16px', borderBottom: '1px solid var(--border-soft)', textAlign: 'center' }}>
            <div className="text-eyebrow">Balance overview</div>
          </div>
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--slate-500)', marginBottom: 8 }}>{netLabel}</div>
            <div style={{
              fontSize: settled ? 24 : 30,
              lineHeight: '36px',
              fontWeight: settled ? 600 : 700,
              color: netColor,
              letterSpacing: '-0.01em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {balanceSummary.defaultCurrency} {Math.abs(net).toFixed(2)}
            </div>
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              margin: '0 16px 14px 16px', padding: '10px',
              background: 'var(--slate-50)', border: '1px solid var(--border-soft)',
              borderRadius: 8, color: 'var(--slate-600)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              width: 'calc(100% - 32px)', cursor: 'pointer',
              fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-sans)',
            }}>
            {expanded ? 'Hide breakdown' : 'View per-currency breakdown'}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="var(--gray-500)" />
          </button>
          {expanded && (
            <div style={{
              margin: '0 16px 14px 16px', borderRadius: 8,
              border: '1px solid var(--border-card)', background: 'rgba(248, 250, 252, 0.5)',
              overflow: 'hidden',
            }}>
              {balanceSummary.byCurrency.map((row, i, arr) => (
                <div key={row.currency} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px',
                  borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border-soft)',
                }}>
                  <span style={{
                    padding: '4px 8px', borderRadius: 6,
                    background: 'var(--gray-100)', color: 'var(--gray-700)',
                    fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.4,
                  }}>{row.currency}</span>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    {row.owed >= 0.01
                      ? <AmountChip tone="owe" label={`-${row.currency} ${row.owed.toFixed(2)}`} />
                      : <AmountChip tone="neutral" label={`${row.currency} 0.00`} />}
                    {row.owedToUser >= 0.01
                      ? <AmountChip tone="owed" label={`+${row.currency} ${row.owedToUser.toFixed(2)}`} />
                      : <AmountChip tone="neutral" label={`${row.currency} 0.00`} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stat tiles row */}
        <div style={{
          margin: '0 16px 16px 16px', background: '#fff',
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-card)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
        }}>
          <StatTile label="Unsettled groups" value={groupsCount} />
          <div style={{ width: 1, background: 'var(--border-soft)' }} />
          <StatTile label="Settled groups" value={settledCount} />
        </div>

        {/* Friends row */}
        <div
          style={{
            margin: '0 16px 16px 16px', padding: '12px 16px',
            background: '#fff', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-card)',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
          }}
        >
          <Icon name="people-outline" size={22} color="var(--primary)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>Friends</span>
          <Icon name="chevron-forward" size={18} color="var(--gray-400)" />
        </div>

        {/* Friends list */}
        <div style={{ margin: '0 16px' }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>{friends.length}</div>
            <div className="text-eyebrow">FRIENDS</div>
          </div>
          <div style={{
            background: '#fff', borderRadius: 12,
            border: '1px solid var(--border-card)',
            overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
          }}>
            {friends.map((f, i) => (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px',
                borderBottom: i === friends.length - 1 ? 'none' : '1px solid var(--border-soft)',
              }}>
                <MemberAvatar name={f.name} initials={f.initials} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.subtitle}</div>
                </div>
                <BalanceChip net={f.net} currency={f.currency} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }) {
  return (
    <div style={{ flex: 1, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

window.ProfileScreen = ProfileScreen;
