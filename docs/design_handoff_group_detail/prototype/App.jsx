/* eslint-disable */
// Kupa · App — click-thru prototype.
// Flow: login → groups list → group detail (feed + FAB) → add expense (modal).
// Bottom tab: Groups · Activity · Profile.

const SAFE_TOP = 62;     // accounts for iOS status bar overlay from IOSDevice
const SAFE_BOTTOM = 28;  // accounts for home indicator + bottom inset

function Frame({ children, withTabBar = false, tab, onTabChange }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ height: SAFE_TOP, flexShrink: 0 }} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>{children}</div>
      {withTabBar && <BottomTabBar active={tab} onChange={onTabChange} />}
      <div style={{ height: SAFE_BOTTOM, background: '#fff', flexShrink: 0 }} />
    </div>
  );
}

function App() {
  const [authed, setAuthed] = React.useState(false);
  const [tab, setTab] = React.useState('groups');
  const [openGroupId, setOpenGroupId] = React.useState(null);
  const [showAddExpense, setShowAddExpense] = React.useState(false);
  const [groups] = React.useState(window.KUPA_DATA.groups);
  const [expenses, setExpenses] = React.useState(window.KUPA_DATA.expenses);

  const data = window.KUPA_DATA;
  const openGroup = openGroupId ? groups.find(g => g.id === openGroupId) : null;

  const friends = React.useMemo(() => {
    return data.members
      .filter(m => m.id !== data.currentUser.id)
      .map((m, i) => ({
        ...m,
        subtitle: i % 2 === 0 ? '2 shared groups' : '1 shared group',
        net: [42.00, -18.50, 0, 4.20][i] ?? 0,
        currency: 'USD',
      }));
  }, [data]);

  const groupMembers = openGroup
    ? openGroup.memberIds.map(id => data.members.find(m => m.id === id)).filter(Boolean)
    : [];

  if (!authed) {
    return <Frame><LoginScreen onSignIn={() => setAuthed(true)} /></Frame>;
  }

  if (showAddExpense && openGroup) {
    return (
      <Frame>
        <AddExpenseScreen
          group={openGroup}
          members={groupMembers}
          onCancel={() => setShowAddExpense(false)}
          onSave={(e) => {
            const newExp = {
              id: `e${Date.now()}`, groupId: openGroup.id,
              desc: e.desc, amount: e.amount, currency: openGroup.defaultCurrency,
              payerId: e.payerId, category: e.category, date: 'Today',
            };
            setExpenses(prev => ({ ...prev, [openGroup.id]: [newExp, ...(prev[openGroup.id] || [])] }));
            setShowAddExpense(false);
          }}
        />
      </Frame>
    );
  }

  if (openGroup) {
    return (
      <Frame>
        <GroupDetailScreen
          group={openGroup}
          members={groupMembers}
          expenses={expenses[openGroup.id] || []}
          messages={data.messages[openGroup.id] || []}
          onBack={() => setOpenGroupId(null)}
          onAddExpense={() => setShowAddExpense(true)}
          onMessage={() => {}}
        />
      </Frame>
    );
  }

  let content;
  if (tab === 'groups') {
    content = <GroupsListScreen groups={groups} onOpenGroup={(id) => setOpenGroupId(id)} onCreateGroup={() => {}} />;
  } else if (tab === 'activity') {
    content = <ActivityScreen activity={data.activity} members={data.members} groups={data.groups} />;
  } else {
    content = (
      <ProfileScreen
        currentUser={{ ...data.currentUser, name: 'Sam Levy' }}
        balanceSummary={data.balanceSummary}
        groupsCount={data.groups.filter(g => !g.archived && Math.abs(g.net) >= 0.01).length}
        settledCount={data.groups.filter(g => Math.abs(g.net) < 0.01).length}
        friends={friends}
        onSettings={() => {}}
        onSignOut={() => setAuthed(false)}
      />
    );
  }

  return (
    <Frame withTabBar tab={tab} onTabChange={setTab}>{content}</Frame>
  );
}

window.App = App;
