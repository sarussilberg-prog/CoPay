// Kupay mobile · fake data (groups, members, expenses, activity)
// All amounts in 2-decimal money; currency codes are prefixes.

window.KUPAY_DATA = {
  currentUser: {
    id: 'u1',
    name: 'You',
    initials: 'YO',
    email: 'you@kupa.pro',
  },
  members: [
    { id: 'u1', name: 'You',    initials: 'YO' },
    { id: 'u2', name: 'Sarah',  initials: 'S'  },
    { id: 'u3', name: 'David',  initials: 'D'  },
    { id: 'u4', name: 'Maya',   initials: 'M'  },
    { id: 'u5', name: 'Jonah',  initials: 'J'  },
  ],
  groups: [
    {
      id: 'g1', name: 'Weekend in Tel Aviv', type: 'trip',
      memberIds: ['u1','u2','u3','u4'],
      defaultCurrency: 'USD',
      net: 42.00, netCurrency: 'USD',
      totalSpent: 480.00, leftToSettle: 142.00,
      archived: false,
      hasNote: true,
      imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&auto=format&fit=crop',
    },
    {
      id: 'g2', name: 'Apartment 4B', type: 'home',
      memberIds: ['u1','u3','u5'],
      defaultCurrency: 'ILS',
      net: -78.50, netCurrency: 'ILS',
      totalSpent: 1240.00, leftToSettle: 78.50,
      archived: false,
    },
    {
      id: 'g3', name: 'Brunch Crew', type: 'friends',
      memberIds: ['u1','u2','u4','u5'],
      defaultCurrency: 'USD',
      net: 0, netCurrency: 'USD',
      totalSpent: 86.00, leftToSettle: 0,
      archived: false,
    },
    {
      id: 'g4', name: 'Birthday Dinner', type: 'event',
      memberIds: ['u1','u2','u3','u4','u5'],
      defaultCurrency: 'USD',
      net: 0, netCurrency: 'USD',
      totalSpent: 312.00, leftToSettle: 0,
      archived: true,
    },
  ],
  expenses: {
    g1: [
      { id: 'e1', groupId: 'g1', desc: 'Sushi on Friday',   amount: 84.20,  currency: 'USD', payerId: 'u2', category: 'food',         date: 'Aug 14', userShare: 21.05, receiptUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=120&h=120&fit=crop' },
      { id: 'e2', groupId: 'g1', desc: 'Taxi to airport',   amount: 42.00,  currency: 'USD', payerId: 'u1', category: 'transport',    date: 'Aug 12', userShare: 10.50 },
      { id: 'e3', groupId: 'g1', desc: 'Airbnb · 2 nights', amount: 320.00, currency: 'USD', payerId: 'u3', category: 'accommodation', date: 'Aug 10', userShare: 80.00 },
      { id: 'e4', groupId: 'g1', desc: 'Beach drinks',      amount: 33.80,  currency: 'USD', payerId: 'u4', category: 'entertainment', date: 'Aug 11', userShare: 8.45 },
    ],
    g2: [
      { id: 'e5', groupId: 'g2', desc: 'Electric bill', amount: 380.00, currency: 'ILS', payerId: 'u3', category: 'utilities', date: 'Aug 1', userShare: 126.67 },
      { id: 'e6', groupId: 'g2', desc: 'Groceries',     amount: 215.50, currency: 'ILS', payerId: 'u1', category: 'food',      date: 'Aug 6', userShare: 71.83 },
      { id: 'e7', groupId: 'g2', desc: 'Plumber',       amount: 644.50, currency: 'ILS', payerId: 'u5', category: 'utilities', date: 'Aug 9', userShare: 214.83 },
    ],
    g3: [
      { id: 'e8', groupId: 'g3', desc: 'Pancakes @ Benedict', amount: 86.00, currency: 'USD', payerId: 'u2', category: 'food', date: 'Jul 30' },
    ],
    g4: [],
  },
  messages: {
    g1: [
      { id: 'm1', authorId: 'u2', text: "We're all in for the airport taxi tomorrow at 9?", time: '9:14 AM' },
      { id: 'm2', authorId: 'u1', text: 'Yep, downstairs at 9 sharp.', time: '9:18 AM' },
    ],
    g2: [],
    g3: [],
    g4: [],
  },
  activity: [
    { id: 'a1', kind: 'expense',    actorId: 'u2', groupId: 'g1', desc: 'Sushi on Friday', amount: 84.20, currency: 'USD', when: 'Aug 14 · 8:42 PM' },
    { id: 'a2', kind: 'message',    actorId: 'u1', groupId: 'g1', desc: 'Yep, downstairs at 9 sharp.', when: 'Aug 14 · 9:18 AM' },
    { id: 'a3', kind: 'settlement', actorId: 'u3', groupId: 'g1', desc: 'David paid you',  amount: 18.00, currency: 'USD', when: 'Aug 13 · 6:10 PM' },
    { id: 'a4', kind: 'expense',    actorId: 'u1', groupId: 'g2', desc: 'Groceries',        amount: 215.50, currency: 'ILS', when: 'Aug 6 · 7:25 PM' },
    { id: 'a5', kind: 'expense',    actorId: 'u5', groupId: 'g2', desc: 'Plumber',          amount: 644.50, currency: 'ILS', when: 'Aug 9 · 3:00 PM' },
  ],
  balanceSummary: {
    defaultCurrency: 'USD',
    totalOwed: 78.50,        // you owe this much
    totalOwedToUser: 120.50, // owed to you
    net: 42.00,
    byCurrency: [
      { currency: 'USD', owed: 0,     owedToUser: 120.50 },
      { currency: 'ILS', owed: 78.50, owedToUser: 0 },
    ],
  },
};
