/* eslint-disable */
// Kupa · GroupDetailScreen
//
// Layout (top → bottom):
//   1. App bar (back · "Group" · share · menu)
//   2. Summary card — one card containing:
//        a. Image cover with title + members overlaid
//        b. Middle strip · M1 — "You have USD 42.00 to your credit ›"
//        c. Footer row — "N payments to settle · Settle up →"
//   3. Activity feed (expenses + chat messages)
//   4. FAB pair (Message · Add expense)

function GroupDetailScreen({ group, members, expenses, messages, onBack, onAddExpense, onMessage, onOpenBreakdown, onOpenSettle, onOpenNote }) {
  const visual = GROUP_VISUAL[group.type] || GROUP_VISUAL.general;
  const memberById = React.useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);

  const feed = React.useMemo(() => {
    const out = [];
    for (const e of expenses) out.push({ kind: 'expense', item: e });
    for (const m of messages) out.push({ kind: 'message', item: m });
    return out;
  }, [expenses, messages]);

  const settled = Math.abs(group.net) < 0.01;
  const owed = group.net > 0;
  const amountStr = `${group.netCurrency} ${Math.abs(group.net).toFixed(2)}`;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', height: '100%', position: 'relative' }}>

      {/* App bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 8px 6px 8px', background: '#fff', flexShrink: 0,
      }}>
        <IconButton name="chevron-back" onClick={onBack} size={24} color="var(--gray-700)" />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Group</div>
        <div style={{ display: 'flex', gap: 0 }}>
          <IconButton name="share-outline" size={22} color="var(--gray-700)" />
          <IconButton name="ellipsis-vertical" size={22} color="var(--gray-700)" />
        </div>
      </div>

      {/* Summary card */}
      <div style={{ padding: '6px 16px 12px 16px', background: '#fff', flexShrink: 0 }}>
        <div style={{
          borderRadius: 20, overflow: 'hidden',
          border: '1px solid var(--border-card)',
          boxShadow: 'var(--shadow-sm)', background: '#fff',
        }}>
          {/* Cover image + title overlay */}
          <div style={{ height: 150, position: 'relative', background: visual.grad }}>
            {group.imageUrl ? (
              <img src={group.imageUrl} alt=""
                   style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={visual.icon} size={72} color="rgba(255,255,255,0.45)" />
              </div>
            )}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)',
            }} />
            <span style={{
              position: 'absolute', top: 10, left: 10,
              padding: '4px 10px', borderRadius: 9999,
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              fontSize: 11, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <Icon name={visual.icon} size={12} color="#fff" />
              {capitalize(group.type)}
            </span>
            <div style={{
              position: 'absolute', left: 14, right: 14, bottom: 10,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: '#fff',
                  textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{group.name}</div>
                <div style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.92)', marginTop: 2,
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}>
                  {members.length} {members.length === 1 ? 'person' : 'people'}
                </div>
              </div>
              <MemberStack members={members} />
            </div>
          </div>

          {/* Middle strip · M1 — sentence with the amount inline, tappable */}
          <button
            onClick={onOpenBreakdown}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', boxSizing: 'border-box',
              padding: '14px 16px', background: 'transparent',
              border: 0, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 15, color: 'var(--text-primary)', textAlign: 'left' }}>
              {settled ? (
                <>You're all settled in this group</>
              ) : (
                <>
                  You {owed ? 'have' : 'owe'}{' '}
                  <strong style={{
                    color: owed ? 'var(--success)' : 'var(--error)',
                    fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                  }}>{amountStr}</strong>
                  {owed ? ' to your credit' : ''}
                </>
              )}
            </span>
            <Icon name="chevron-forward" size={18} color="var(--gray-400)" />
          </button>

          {/* Footer row — Note + Settle up */}
          <div style={{
            margin: '0 16px', padding: '12px 0 14px 0',
            borderTop: '1px solid var(--border-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {settled ? 'No open payments' : '1 payment to settle everyone'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={onOpenNote}
                style={{
                  background: '#fff', color: 'var(--gray-700)',
                  border: '1px solid var(--border-card)', borderRadius: 9999,
                  padding: '7px 12px',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                  position: 'relative',
                }}
              >
                <Icon name="receipt-outline" size={13} color="var(--gray-700)" />
                Note
                {group.hasNote && (
                  <span style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--warning)', border: '1.5px solid #fff',
                  }} />
                )}
              </button>
              <button
                onClick={onOpenSettle}
                disabled={settled}
                style={{
                  background: settled ? 'var(--gray-100)' : 'var(--primary-extra-light)',
                  color: settled ? 'var(--gray-400)' : 'var(--primary-dark)',
                  border: 0, borderRadius: 9999, padding: '7px 14px',
                  fontSize: 12, fontWeight: 600,
                  cursor: settled ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                }}
              >Settle up →</button>
            </div>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 100px 16px' }}>
        <div className="text-eyebrow" style={{ padding: '6px 4px' }}>Activity</div>
        {feed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-secondary)' }}>
            <Icon name="time-outline" size={48} color="var(--gray-300)" />
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--gray-800)', marginTop: 12 }}>Nothing here yet</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>Add the first expense or send the first message.</div>
          </div>
        )}
        {feed.map((f, i) => f.kind === 'expense'
          ? <ExpenseRow key={`e${i}`} expense={f.item} payerName={(memberById[f.item.payerId] || {}).name} />
          : <MessageRow key={`m${i}`} message={f.item} authorName={(memberById[f.item.authorId] || {}).name} authorInitials={(memberById[f.item.authorId] || {}).initials} />)}
      </div>

      <FabPair onMessage={onMessage} onExpense={onAddExpense} />
    </div>
  );
}

// Stacked member avatars — first 4, then "+N" if more.
function MemberStack({ members }) {
  const shown = members.slice(0, 4);
  const extra = Math.max(0, members.length - shown.length);
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {shown.map((m, i) => (
        <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, boxShadow: '0 0 0 2px #fff', borderRadius: '50%' }}>
          <MemberAvatar name={m.name} initials={m.initials} size="xs" />
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          marginLeft: -8, width: 32, height: 32, borderRadius: '50%',
          background: 'var(--gray-100)', color: 'var(--gray-700)',
          fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 2px #fff',
        }}>+{extra}</div>
      )}
    </div>
  );
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Category → Ionicon. Used when the expense has no receipt photo.
const CATEGORY_ICON = {
  food: 'restaurant-outline',
  transport: 'car-outline',
  accommodation: 'bed-outline',
  utilities: 'flash-outline',
  entertainment: 'film-outline',
  shopping: 'cart-outline',
  healthcare: 'medkit-outline',
  other: 'pricetag-outline',
};

// User involvement → short sentence ("You lent $X" / "You borrowed $X").
// `expense.userShare` is what the current user owes for this expense.
// If the user paid → user lent (amount - share). Otherwise → user borrowed (share).
function userInvolvementLine(expense, currentUserId = 'u1') {
  const share = expense.userShare ?? 0;
  if (share <= 0) return null;
  const c = expense.currency;
  if (expense.payerId === currentUserId) {
    const lent = expense.amount - share;
    if (lent <= 0) return null;
    return { tone: 'lent',     label: `You lent ${c} ${lent.toFixed(2)}` };
  }
  return   { tone: 'borrowed', label: `You borrowed ${c} ${share.toFixed(2)}` };
}

function ExpenseRow({ expense, payerName }) {
  const involvement = userInvolvementLine(expense);
  const hasReceipt = Boolean(expense.receiptUrl);

  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--gray-100)',
      padding: '12px 14px', marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
    }}>
      {/* Thumbnail: receipt photo if present, otherwise category icon */}
      {hasReceipt ? (
        <img
          src={expense.receiptUrl}
          alt=""
          style={{
            width: 44, height: 44, borderRadius: 10,
            objectFit: 'cover', flexShrink: 0,
            border: '1px solid var(--border-soft)',
          }}
        />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'var(--primary-extra-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name={CATEGORY_ICON[expense.category] || 'pricetag-outline'} size={22} color="var(--primary-dark)" />
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{expense.desc}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {expense.date} · Paid by {payerName || 'Someone'}
        </div>
      </div>

      {/* Amount + involvement */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}>
          {expense.currency} {expense.amount.toFixed(2)}
        </div>
        {involvement && (
          <div style={{
            fontSize: 11, fontWeight: 500,
            color: 'var(--text-secondary)',
            marginTop: 2, whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}>{involvement.label}</div>
        )}
      </div>
    </div>
  );
}

function MessageRow({ message, authorName, authorInitials }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
      <MemberAvatar name={authorName} initials={authorInitials} size="xs" />
      <div style={{
        flex: 1, background: '#fff', borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--gray-100)', padding: '10px 12px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{message.text}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          {authorName} · Message · {message.time}
        </div>
      </div>
    </div>
  );
}

window.GroupDetailScreen = GroupDetailScreen;
