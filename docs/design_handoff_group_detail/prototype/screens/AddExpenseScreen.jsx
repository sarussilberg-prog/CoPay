/* eslint-disable */
// CoPay · AddExpenseScreen — modal-style sheet with description, amount, payer, splits.

function AddExpenseScreen({ group, members, onCancel, onSave }) {
  const [desc, setDesc] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [payerId, setPayerId] = React.useState(members[0]?.id);
  const [category, setCategory] = React.useState('food');

  const canSave = desc.trim() && parseFloat(amount) > 0;
  const handleSave = () => { if (canSave) onSave({ desc, amount: parseFloat(amount), payerId, category }); };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', height: '100%' }}>
      <AppBar
        title="Add expense"
        left={<IconButton name="close" onClick={onCancel} color="var(--gray-600)" />}
        right={
          <button onClick={handleSave} disabled={!canSave} style={{
            background: 'transparent', border: 0,
            color: canSave ? 'var(--primary-dark)' : 'var(--gray-400)',
            fontSize: 15, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-sans)',
          }}>Save</button>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <Input label="Description" placeholder="What was this for?" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Input label="Amount" type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)', marginBottom: 8 }}>Category</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries({ food: '🍕 Food', transport: '🚗 Transport', accommodation: '🏨 Stay', utilities: '💡 Utilities', entertainment: '🎬 Fun', shopping: '🛍️ Shopping' }).map(([k, label]) => (
              <button key={k} onClick={() => setCategory(k)} style={{
                padding: '8px 12px', borderRadius: 9999,
                background: category === k ? 'var(--primary-extra-light)' : '#fff',
                color: category === k ? 'var(--primary-dark)' : 'var(--gray-700)',
                border: `1px solid ${category === k ? 'var(--primary-light)' : 'var(--border-strong)'}`,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)', marginBottom: 8 }}>Paid by</div>
          <div style={{
            background: '#fff', border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-xl)', overflow: 'hidden',
          }}>
            {members.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setPayerId(m.id)}
                style={{
                  width: '100%', padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: payerId === m.id ? 'var(--primary-extra-light)' : '#fff',
                  border: 0,
                  borderBottom: i === members.length - 1 ? 'none' : '1px solid var(--border-soft)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}
              >
                <MemberAvatar name={m.name} initials={m.initials} size="sm" />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 15, color: 'var(--text-primary)' }}>
                  {m.name}{m.id === 'u1' ? ' (You)' : ''}
                </span>
                {payerId === m.id && <Icon name="checkmark-circle" size={22} color="var(--primary)" />}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)', marginBottom: 8 }}>Split between</div>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-xl)', padding: 12,
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button style={{
                flex: 1, padding: 10, borderRadius: 9999,
                background: 'var(--primary)', color: '#fff', border: 0,
                fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer',
              }}>Equal</button>
              <button style={{
                flex: 1, padding: 10, borderRadius: 9999,
                background: '#fff', color: 'var(--gray-700)',
                border: '1px solid var(--border-strong)',
                fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer',
              }}>Custom</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {group.memberIds.length} people · each pays {amount && parseFloat(amount) > 0 ? `${group.defaultCurrency} ${(parseFloat(amount) / group.memberIds.length).toFixed(2)}` : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.AddExpenseScreen = AddExpenseScreen;
