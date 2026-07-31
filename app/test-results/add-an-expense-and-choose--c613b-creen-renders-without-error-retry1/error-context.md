# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: add-an-expense-and-choose-how-to-split-i.spec.ts >> member: add an expense and choose how to split it — equally among selected members, or fully owed by one specific person >> post-auth screen renders without error
- Location: e2e/add-an-expense-and-choose-how-to-split-i.spec.ts:37:3

# Error details

```
Error: admin-api POST /admin-api/contexts → 500: {"error":"Internal server error"}
```

# Test source

```ts
  17  |     return cfg?.metadata?.route || '/';
  18  |   } catch {
  19  |     return '/';
  20  |   }
  21  | }
  22  | 
  23  | // Wire name of the app's primary service (matches PRIMARY_SERVICE in the app);
  24  | // needed to mint a context via the admin-api the way useWorkspace.bootstrap does.
  25  | function primaryServiceName(): string {
  26  |   const cfgPath = path.resolve(__dirname, '..', '..', 'studio.config.json');
  27  |   const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
  28  |   const name = cfg?.services?.[0]?.name;
  29  |   if (!name) throw new Error('studio.config.json has no services[0].name');
  30  |   return name;
  31  | }
  32  | 
  33  | interface NodeState {
  34  |   name: string;
  35  |   adminUrl: string;
  36  |   appId: string;
  37  |   accessToken: string;
  38  |   refreshToken: string;
  39  | }
  40  | 
  41  | interface SetupState {
  42  |   pids: number[];
  43  |   nodes: NodeState[];
  44  | }
  45  | 
  46  | function loadState(): SetupState {
  47  |   if (!existsSync(STATE_FILE)) {
  48  |     throw new Error('No setup state found. Did global-setup run?');
  49  |   }
  50  |   return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  51  | }
  52  | 
  53  | /** Get node state by index (0 = node 1, 1 = node 2). */
  54  | export function getNode(index: number): NodeState {
  55  |   const state = loadState();
  56  |   if (index >= state.nodes.length) {
  57  |     throw new Error(`Node ${index} not found. Only ${state.nodes.length} nodes available.`);
  58  |   }
  59  |   return state.nodes[index];
  60  | }
  61  | 
  62  | // ── Per-spec workspace isolation ───────────────────────────────────────
  63  | //
  64  | // The app is single-context: without isolation every test/retry/spec-file
  65  | // shares ONE persistent board (the app binds namespaces[0] + its first
  66  | // context), so state bleeds across tests and the run is pinned to workers:1.
  67  | //
  68  | // With isolation ON (default; PW_ISOLATION=0 to opt out) each spec FILE gets
  69  | // its own namespace + context, provisioned straight through the node admin-api
  70  | // (mirrors useWorkspace.bootstrap) and injected into the auth hash so the app
  71  | // binds to it (parseAuthCallback reads context_id/context_identity; useWorkspace
  72  | // prefers the callback context over discovery). Peers on other nodes are joined
  73  | // into the SAME context via the admin-api and get the same context_id with their
  74  | // own owned identity, so an isolated board is deterministic across nodes,
  75  | // which is what makes workers > 1 safe.
  76  | 
  77  | interface Injection { contextId: string; contextIdentity: string; }
  78  | interface IsoWorkspace {
  79  |   nsId: string;
  80  |   contextId: string;
  81  |   /** nodeIndex → that node's injection (identity differs per node). */
  82  |   joined: Map<number, Promise<Injection>>;
  83  | }
  84  | 
  85  | const ISOLATION = process.env.PW_ISOLATION !== '0';
  86  | // Memoized per spec file (keyed with the worker slot; each worker is its own
  87  | // process so the map is already per-worker, the key just separates files a
  88  | // worker runs in sequence). A fresh workspace per file, reused across a file's
  89  | // tests + retries.
  90  | const WORKSPACES = new Map<string, Promise<IsoWorkspace>>();
  91  | 
  92  | function specKey(): string {
  93  |   try {
  94  |     const info = test.info();
  95  |     return `${info.parallelIndex}:${info.file}`;
  96  |   } catch {
  97  |     return 'default';
  98  |   }
  99  | }
  100 | 
  101 | async function adminApi(
  102 |   node: NodeState,
  103 |   method: string,
  104 |   apiPath: string,
  105 |   body?: unknown,
  106 | ): Promise<any> {
  107 |   const res = await fetch(`${node.adminUrl}${apiPath}`, {
  108 |     method,
  109 |     headers: {
  110 |       'Content-Type': 'application/json',
  111 |       Authorization: `Bearer ${node.accessToken}`,
  112 |     },
  113 |     body: body === undefined ? undefined : JSON.stringify(body),
  114 |   });
  115 |   const text = await res.text();
  116 |   if (!res.ok) {
> 117 |     throw new Error(`admin-api ${method} ${apiPath} → ${res.status}: ${text.slice(0, 300)}`);
      |           ^ Error: admin-api POST /admin-api/contexts → 500: {"error":"Internal server error"}
  118 |   }
  119 |   let json: any = null;
  120 |   try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  121 |   return json?.data ?? json;
  122 | }
  123 | 
  124 | // Provision the base workspace (namespace + context) on node 0.
  125 | async function provisionBase(): Promise<IsoWorkspace> {
  126 |   const node0 = getNode(0);
  127 |   const ns = await adminApi(node0, 'POST', '/admin-api/namespaces', {
  128 |     applicationId: node0.appId,
  129 |     upgradePolicy: 'Automatic',
  130 |   });
  131 |   await adminApi(
  132 |     node0,
  133 |     'PUT',
  134 |     `/admin-api/groups/${ns.namespaceId}/settings/default-capabilities`,
  135 |     { defaultCapabilities: 3 }, // CAN_CREATE_CONTEXT | CAN_INVITE_MEMBERS
  136 |   );
  137 |   const ctx = await adminApi(node0, 'POST', '/admin-api/contexts', {
  138 |     applicationId: node0.appId,
  139 |     groupId: ns.namespaceId,
  140 |     serviceName: primaryServiceName(),
  141 |     initializationParams: [],
  142 |   });
  143 |   const ws: IsoWorkspace = {
  144 |     nsId: ns.namespaceId,
  145 |     contextId: ctx.contextId,
  146 |     joined: new Map(),
  147 |   };
  148 |   ws.joined.set(0, Promise.resolve({ contextId: ctx.contextId, contextIdentity: ctx.memberPublicKey }));
  149 |   return ws;
  150 | }
  151 | 
  152 | // Join a non-0 node into the workspace and return its injection. The context id
  153 | // is global, so the joiner lands on the SAME context with its own identity.
  154 | async function joinNodeIntoWorkspace(ws: IsoWorkspace, nodeIndex: number): Promise<Injection> {
  155 |   const node0 = getNode(0);
  156 |   const node = getNode(nodeIndex);
  157 |   const inv = await adminApi(node0, 'POST', `/admin-api/namespaces/${ws.nsId}/invite`, {
  158 |     recursive: true,
  159 |   });
  160 |   const invitation = extractInvitation(inv);
  161 |   const joinRes = await adminApi(node, 'POST', `/admin-api/namespaces/${ws.nsId}/join`, {
  162 |     invitation,
  163 |   });
  164 |   // Wait until the joined context + owned identity are live on this node, so
  165 |   // the injected identity is usable the moment the page boots. A silent
  166 |   // timeout here would inject an identity that isn't actually live yet,
  167 |   // turning into a bare "element not found" downstream instead of a clear
  168 |   // cause — so an exhausted poll must throw, not fall through.
  169 |   let identityLive = false;
  170 |   for (let i = 0; i < 30; i++) {
  171 |     const owned = await adminApi(node, 'GET', `/admin-api/contexts/${ws.contextId}/identities-owned`)
  172 |       .catch(() => null);
  173 |     if (owned?.identities?.length > 0) { identityLive = true; break; }
  174 |     await new Promise((r) => setTimeout(r, 500));
  175 |   }
  176 |   if (!identityLive) {
  177 |     throw new Error(`identity for context ${ws.contextId} never became owned on node ${nodeIndex} after 15s`);
  178 |   }
  179 |   return { contextId: ws.contextId, contextIdentity: joinRes.memberIdentity };
  180 | }
  181 | 
  182 | // Resolve (provisioning/joining as needed) the injection for a node in this
  183 | // spec file's isolated workspace. Memoized per spec file and per node.
  184 | async function isolatedInjection(nodeIndex: number): Promise<Injection> {
  185 |   const key = specKey();
  186 |   let wsP = WORKSPACES.get(key);
  187 |   if (!wsP) {
  188 |     wsP = provisionBase();
  189 |     WORKSPACES.set(key, wsP);
  190 |   }
  191 |   const ws = await wsP;
  192 |   let injP = ws.joined.get(nodeIndex);
  193 |   if (!injP) {
  194 |     injP = joinNodeIntoWorkspace(ws, nodeIndex);
  195 |     ws.joined.set(nodeIndex, injP);
  196 |   }
  197 |   return injP;
  198 | }
  199 | 
  200 | // Persistent per-page tally of data-plane + console errors the browser
  201 | // otherwise swallows. Two layers matter and neither surfaces as a Playwright
  202 | // error on its own:
  203 | //   - admin-api (management: `POST /admin-api/namespaces` → 403) — a
  204 | //     node-permission / token-scope mismatch, NOT an app-code bug.
  205 | //   - /jsonrpc (app method calls via mero-js `rpc.execute`) — a mutation or
  206 | //     view that fails server-side (HTTP >= 400, or a JSON-RPC error body on a
  207 | //     2xx). The app just renders nothing, so downstream the test sees a bare
  208 | //     "element not found" with no hint the backend method actually failed.
  209 | //   - console.error — runtime errors logged by the app.
  210 | // We record these for the whole test and (a) emit greppable `[admin-api-error]`
  211 | // / `[rpc-error]` markers into the captured output and (b) fold them into the
  212 | // workspace/invite helper failure messages, so the verify classifier can route
  213 | // each cause correctly (admin-api → infrastructural, rpc → backend) instead of
  214 | // flailing the verifier-writer on correct test code.
  215 | interface PageErrors {
  216 |   adminApi: string[];
  217 |   rpc: string[];
```