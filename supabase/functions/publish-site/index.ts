import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
function getPublishableKey() {
  const direct = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
  if (direct) return direct
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
    for (const value of Object.values(keys)) if (typeof value === 'string') return value
    return ''
  } catch (_) {
    return ''
  }
}
const publishableKey = getPublishableKey()
const githubToken = Deno.env.get('GITHUB_TOKEN') ?? ''
const githubOwner = Deno.env.get('GITHUB_OWNER') ?? 'Mariahhmyhre'
const githubRepo = Deno.env.get('GITHUB_REPO') ?? 'Fra-fullmektig-til-megler'
const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? ''
const allowedEmails = new Set(
  (Deno.env.get('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function response(origin: string, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

async function github(path: string, init: RequestInit = {}) {
  const result = await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const data = await result.json().catch(() => ({}))
  if (!result.ok) throw new Error(`GitHub ${result.status}: ${data.message ?? 'ukjent feil'}`)
  return data
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? ''
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (request.method !== 'POST') return response(origin, 405, { error: 'Kun POST er tillatt.' })
  if (!allowedOrigin || origin !== allowedOrigin) return response(origin, 403, { error: 'Ukjent opprinnelse.' })
  if (!supabaseUrl || !publishableKey || !githubToken || allowedEmails.size === 0) {
    return response(origin, 503, { error: 'Publiseringstjenesten er ikke ferdig konfigurert.' })
  }

  const authorization = request.headers.get('authorization') ?? ''
  const accessToken = authorization.replace(/^Bearer\s+/i, '')
  if (!accessToken) return response(origin, 401, { error: 'Logg inn på nytt.' })

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
  const email = user?.email?.toLowerCase() ?? ''
  if (authError || !email || !allowedEmails.has(email)) {
    return response(origin, 403, { error: 'Denne brukeren har ikke publiseringstilgang.' })
  }

  const declaredSize = Number(request.headers.get('content-length') ?? 0)
  if (declaredSize > 24 * 1024 * 1024) {
    return response(origin, 413, { error: 'Publiseringen er for stor. Video må lastes via mediebiblioteket.' })
  }

  try {
    const body = await request.json()
    const editorHtml = typeof body.editorHtml === 'string' ? body.editorHtml : ''
    const viewerHtml = typeof body.viewerHtml === 'string' ? body.viewerHtml : ''
    const media = Array.isArray(body.media) ? body.media : []
    if (!editorHtml.startsWith('<!DOCTYPE html>') || !viewerHtml.startsWith('<!DOCTYPE html>')) {
      return response(origin, 400, { error: 'Ugyldige HTML-filer.' })
    }
    if (editorHtml.length > 4_000_000 || viewerHtml.length > 4_000_000 || media.length > 100) {
      return response(origin, 413, { error: 'For mye innhold i én publisering.' })
    }
    for (const item of media) {
      if (!/^media\/[a-zA-Z0-9._-]+$/.test(item?.path ?? '') || !/^[A-Za-z0-9+/=]*$/.test(item?.content ?? '')) {
        return response(origin, 400, { error: 'Ugyldig mediefil.' })
      }
    }

    const ref = await github('/git/ref/heads/main')
    const parentSha = ref.object.sha
    const parentCommit = await github(`/git/commits/${parentSha}`)

    const viewerBlob = await github('/git/blobs', {
      method: 'POST', body: JSON.stringify({ content: viewerHtml, encoding: 'utf-8' }),
    })
    const editorBlob = await github('/git/blobs', {
      method: 'POST', body: JSON.stringify({ content: editorHtml, encoding: 'utf-8' }),
    })
    const tree = [
      { path: 'index.html', mode: '100644', type: 'blob', sha: viewerBlob.sha },
      { path: 'editor.html', mode: '100644', type: 'blob', sha: editorBlob.sha },
    ]
    for (const item of media) {
      const blob = await github('/git/blobs', {
        method: 'POST', body: JSON.stringify({ content: item.content, encoding: 'base64' }),
      })
      tree.push({ path: item.path, mode: '100644', type: 'blob', sha: blob.sha })
    }

    const nextTree = await github('/git/trees', {
      method: 'POST', body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
    })
    const commit = await github('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: `Publiser nettside (${email})`,
        tree: nextTree.sha,
        parents: [parentSha],
      }),
    })
    await github('/git/refs/heads/main', {
      method: 'PATCH', body: JSON.stringify({ sha: commit.sha }),
    })

    return response(origin, 200, { ok: true, commit: commit.sha })
  } catch (error) {
    console.error(error)
    return response(origin, 500, { error: error instanceof Error ? error.message : 'Publisering feilet.' })
  }
})
