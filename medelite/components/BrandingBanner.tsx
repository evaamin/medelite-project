// CRITICAL BRANDING GUARDRAIL
// "INFINITE" is the static internal platform brand. It is NEVER replaced with
// the facility name from the CMS API or the user's manual override. The facility
// name lives only inside the report body under "Name of Facility".
// The `state` prop is the only dynamic part of this banner.

export function BrandingBanner({ state }: { state?: string }) {
  return (
    <header className="brand-banner">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden />
        <span className="brand-infinite">INFINITE</span>
        <span className="brand-managed">Managed by MEDELITE</span>
      </div>
      <div className="brand-rule" />
      <h1 className="brand-title">FACILITY ASSESSMENT SNAPSHOT</h1>
      {state ? <div className="brand-state">{state}</div> : null}
    </header>
  );
}
