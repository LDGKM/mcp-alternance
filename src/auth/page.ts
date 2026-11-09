/** Page HTML d'autorisation : la seule interface du serveur visible dans un navigateur. */

export function echapperHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const STYLE = `
  :root { color-scheme: light dark; --fond:#f6f5f2; --carte:#fff; --texte:#1d1d1b; --doux:#5f5e5a; --bord:#d9d7d0; --accent:#1f5f8b; --erreur:#a42a2a; }
  @media (prefers-color-scheme: dark) { :root { --fond:#151515; --carte:#1f1f1e; --texte:#ecebe7; --doux:#a8a7a2; --bord:#3a3a38; --accent:#7db4dc; --erreur:#f08a8a; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--fond); color:var(--texte);
         font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding:16px; }
  main { width:100%; max-width:420px; background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:28px; }
  h1 { font-size:1.25rem; margin:0 0 4px; }
  p { margin:0 0 16px; color:var(--doux); font-size:.95rem; }
  label { display:block; font-weight:600; margin-bottom:6px; }
  input[type=password] { width:100%; padding:10px 12px; border:1px solid var(--bord); border-radius:8px; background:transparent; color:inherit; font:inherit; }
  button { margin-top:16px; width:100%; padding:10px 12px; border:0; border-radius:8px; background:var(--accent); color:#fff; font:inherit; font-weight:600; cursor:pointer; }
  .erreur { color:var(--erreur); font-weight:600; }
  code { font-size:.85rem; }
`;

function gabarit(titre: string, corps: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${echapperHtml(titre)}</title><style>${STYLE}</style></head><body><main>${corps}</main></body></html>`;
}

export function pageAutorisation(options: { client: string; redirection: string; requete: string; erreur?: string }): string {
  return gabarit(
    "Autoriser l'accès",
    `<h1>Recherche d'alternance — accès privé</h1>
<p><strong>${echapperHtml(options.client)}</strong> demande l'accès à vos outils. Après validation, vous serez renvoyé vers <code>${echapperHtml(options.redirection)}</code>.</p>
${options.erreur ? `<p class="erreur" role="alert">${echapperHtml(options.erreur)}</p>` : ""}
<form method="post" action="/authorize">
  <input type="hidden" name="requete" value="${echapperHtml(options.requete)}">
  <label for="cle">Clé d'accès</label>
  <input id="cle" name="cle" type="password" autocomplete="current-password" required autofocus>
  <button type="submit">Autoriser</button>
</form>`,
  );
}

export function pageMessage(titre: string, message: string): string {
  return gabarit(titre, `<h1>${echapperHtml(titre)}</h1><p>${echapperHtml(message)}</p>`);
}

export function reponseHtml(html: string, statut = 200): Response {
  return new Response(html, {
    status: statut,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
