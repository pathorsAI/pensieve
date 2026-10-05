import { dictFor, type Locale } from "@/lib/i18n-dict";
import { ConsentForm } from "./consent-form";

type DetailsProps = Readonly<{
  locale: Locale;
  scopes: string[];
  workspaces: { slug: string; name: string }[];
  clientId: string;
}>;

/**
 * Body of the signed-in consent screen. Plain sections split by rules rather
 * than cards: the shell is already the container, and a card inside it would
 * be card-in-card.
 */
export function ConsentDetails({ locale, scopes, workspaces, clientId }: DetailsProps) {
  const { consent: t } = dictFor(locale);
  return (
    <>
      <section className="auth-section">
        <h2>{t.scopesHeading}</h2>
        <ul className="auth-bullets">
          {scopes.length === 0 && <li>{t.noScopes}</li>}
          {scopes.map((s) => <li key={s}>{t.scopes[s] ?? s}</li>)}
          <li>{t.docsScope}</li>
        </ul>
      </section>
      <hr className="auth-divider" />
      <section className="auth-section">
        <h2>{t.workspacesHeading}</h2>
        {workspaces.length === 0 ? (
          <p className="auth-lead">{t.noWorkspaces}</p>
        ) : (
          <div className="auth-list">
            {workspaces.map((w) => (
              <div key={w.slug}><span>{w.name}</span><span>{w.slug}</span></div>
            ))}
          </div>
        )}
        <p className="auth-fine" style={{ marginTop: 10 }}>{t.workspacesNote}</p>
      </section>
      <ConsentForm locale={locale} />
      <p className="auth-fine mono">client_id: {clientId || "—"}</p>
    </>
  );
}
