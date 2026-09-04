export function LivePlaceholder() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 8,
        padding: 40,
        textAlign: 'center',
      }}
    >
      <div className="ds-eyebrow" style={{ fontSize: 16, letterSpacing: '0.3em' }}>
        LIVE
      </div>
      <p className="ds-body" style={{ maxWidth: 420 }}>
        This feature is not currently active. Switch back to MODEL to continue working with the financial planning
        model.
      </p>
    </div>
  );
}
