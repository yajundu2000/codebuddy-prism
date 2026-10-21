/** Brand lockup: prism monogram + wordmark, one accent dot.
 *  `big` sizes the wordmark up for the login/consent cards; the header
 *  default matches the bar's control height. */
export default function Brand({ big }: { big?: boolean }) {
  return (
    <span className={`brand${big ? ' brand--big' : ''}`}>
      <span className="brand__mark" aria-hidden="true">
        {/* A prism: one ray in, two refracted out — geometry only, one stroke. */}
        <svg width="17" height="16" viewBox="0 0 17 16" fill="none">
          <path d="M7.6 2.4 13.9 13H1.3L7.6 2.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M0 7.2h3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="m12.4 6.9 4.1-1.8M12.5 8.3l4 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </span>
      {/* `home__brand` is the e2e hook for "the brand lockup is on screen". */}
      <span className="brand__name home__brand">codebuddy-prism<em>.</em></span>
    </span>
  );
}
