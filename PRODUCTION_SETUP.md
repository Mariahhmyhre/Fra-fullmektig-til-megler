# Produksjonsoppsett

Den offentlige siden fortsetter å fungere på GitHub Pages mens dette oppsettet kobles til.

## Hva løsningen gjør

- Redaktøren logger inn med e-post og passord gjennom Supabase Auth.
- GitHub-tokenet lagres bare som en Supabase-secret og sendes aldri til nettleseren.
- `editor.html`, `index.html` og nye mediefiler publiseres i samme GitHub-commit.
- Bare e-postadresser i `ADMIN_EMAILS` får publisere.

## Koble til Supabase

1. Opprett et Supabase-prosjekt i EU-regionen.
2. Opprett redaktørbrukeren under Authentication → Users.
3. Installer Supabase CLI og koble repoet til prosjektet.
4. Sett disse function-secrets:

   - `GITHUB_TOKEN`: et kortlevd, fine-grained token med Contents: Read and write kun for dette repoet
   - `GITHUB_OWNER=Mariahhmyhre`
   - `GITHUB_REPO=Fra-fullmektig-til-megler`
   - `ALLOWED_ORIGIN=https://mariahhmyhre.github.io`
   - `ADMIN_EMAILS`: kommaseparert liste over godkjente redaktører

5. Deploy funksjonen `publish-site`.
6. Fyll inn Project URL og publishable key i `production-config.js`, og sett `enabled: true`.

`production-config.js` skal bare inneholde Project URL og publishable key. Disse er offentlige klientverdier. Secret key, service-role key og GitHub-token skal aldri legges i repoet.

## Før lansering

- Tilbakekall det gamle GitHub-tokenet som tidligere lå i historikken.
- Flytt editoren til et eget admin-domene eller beskytt den med ordentlig tilgangskontroll.
- Ferdigstill tomme quiz-/fasitfelt.
- Rydd foreldreløse mediefiler etter at en sikkerhetskopi er tatt.
- Test mobil, tastaturnavigasjon, ytelse, SEO og personvern/analyse.
