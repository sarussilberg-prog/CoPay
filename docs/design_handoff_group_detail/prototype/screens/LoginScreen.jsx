/* eslint-disable */
// CoPay · LoginScreen — wordmark, subtitle, Continue with Google button.
// Mirrors screens/auth/LoginScreen.tsx — minus the language sheet (kept simple).

function LoginScreen({ onSignIn }) {
  const [loading, setLoading] = React.useState(false);
  const handle = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); onSignIn(); }, 700);
  };
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: '#fff', padding: '0 32px', height: '100%',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
        <IconButton name="language-outline" color="var(--primary)" size={26} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <img src="../../assets/logo.png" alt="CoPay" style={{ width: 128, height: 128, marginBottom: 24 }} />
        <div className="brand-wordmark" style={{ marginBottom: 8 }}>CoPay</div>
        <div style={{ fontSize: 16, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 48 }}>
          Split expenses with friends
        </div>
        <Button
          title="Continue with Google"
          onClick={handle}
          loading={loading}
          leftIcon={
            <span style={{
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--primary-dark)', fontSize: 12, fontWeight: 700,
              marginRight: 4,
            }}>G</span>
          }
        />
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

window.LoginScreen = LoginScreen;
