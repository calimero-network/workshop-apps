# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: capture.spec.ts >> capture the surfaces the build agent authors
- Location: design-capture/capture.spec.ts:37:1

# Error details

```
Error: admin-api POST /admin-api/contexts → 500: {"error":"Internal server error"}
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - img [ref=e7]
        - generic [ref=e11]: split-circle
      - navigation [ref=e12]:
        - link "How it works" [ref=e13] [cursor=pointer]:
          - /url: "#how"
        - link "Features" [ref=e14] [cursor=pointer]:
          - /url: "#features"
        - link "FAQ" [ref=e15] [cursor=pointer]:
          - /url: "#faq"
        - link "Docs ↗" [ref=e16] [cursor=pointer]:
          - /url: https://docs.calimero.network
        - link "GitHub ↗" [ref=e17] [cursor=pointer]:
          - /url: https://github.com/calimero-network
      - button "Connect" [ref=e20] [cursor=pointer]:
        - img [ref=e21]
        - text: Connect
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]:
          - img [ref=e28]
          - text: Powered by Calimero
        - heading "split-circle" [level=1] [ref=e32]
        - paragraph [ref=e33]: Shared group expense tracker with flexible splitting, settle-up, and a live spending dashboard
        - generic [ref=e34]:
          - button "Connect" [ref=e36] [cursor=pointer]:
            - img [ref=e37]
            - text: Connect
          - button "Learn more" [ref=e41] [cursor=pointer]
        - generic [ref=e42]:
          - generic [ref=e43]: Private by design
          - generic [ref=e45]: Real-time sync
          - generic [ref=e47]: Peer-to-peer
      - generic [ref=e49]:
        - generic [ref=e50]:
          - generic [ref=e54]:
            - img [ref=e55]
            - text: split-circle · your node
          - emphasis [ref=e59]: ● live
        - generic [ref=e61]:
          - generic [ref=e62]: R
          - generic [ref=e63]: S
          - generic [ref=e64]: M
          - generic [ref=e65]: + you
    - generic [ref=e67]:
      - generic [ref=e68]:
        - generic [ref=e69]: How it works
        - heading "From a shared bill to a settled balance in four moves" [level=2] [ref=e70]
        - paragraph [ref=e71]: No accounts, no spreadsheets, no "who owes what" thread. Connect a node and start splitting.
      - generic [ref=e72]:
        - generic [ref=e76]:
          - generic [ref=e78]: "01"
          - heading "Create a group" [level=4] [ref=e79]
          - paragraph [ref=e80]: Name it and invite the people who share the cost — a trip, a flat, a running tab with friends.
        - generic [ref=e82]:
          - generic [ref=e84]: "02"
          - heading "Add expenses" [level=4] [ref=e85]
          - paragraph [ref=e86]: Log what was paid, by whom, and how it splits — equally among a few people, or fully on one person.
        - generic [ref=e88]:
          - generic [ref=e90]: "03"
          - heading "Watch balances update" [level=4] [ref=e91]
          - paragraph [ref=e92]: Every member sees who owes whom, live, synced peer-to-peer as soon as an expense lands.
        - generic [ref=e94]:
          - generic [ref=e96]: "04"
          - heading "Settle up" [level=4] [ref=e97]
          - paragraph [ref=e98]: Record a repayment when it happens and the dashboard reflects it for the whole group instantly.
    - generic [ref=e100]:
      - generic [ref=e101]:
        - generic [ref=e102]: Why it’s different
        - heading "Group money, without the awkward math" [level=2] [ref=e103]
      - generic [ref=e104]:
        - generic [ref=e106]:
          - img [ref=e108]
          - heading "Split it your way" [level=3] [ref=e113]
          - paragraph [ref=e114]: Divide a bill equally among the people who were there, or point the whole cost at one person. You pick, per expense.
        - generic [ref=e116]:
          - img [ref=e118]
          - heading "Balances that stay live" [level=3] [ref=e120]
          - paragraph [ref=e121]: Every expense and settlement recomputes who owes whom instantly, synced to the whole group through Calimero’s CRDT state — no refresh, no spreadsheet.
        - generic [ref=e123]:
          - img [ref=e125]
          - heading "Settle up, not just track" [level=3] [ref=e129]
          - paragraph [ref=e130]: Record a repayment the moment it happens and watch the balances move. Nothing is ever double-counted, and nothing needs a central server to trust.
    - generic [ref=e132]:
      - generic [ref=e133]:
        - generic [ref=e134]: FAQ
        - heading "Groups, splits & your data" [level=2] [ref=e135]
      - generic [ref=e136]:
        - generic [ref=e138]:
          - button "How does splitting actually work?" [ref=e139] [cursor=pointer]:
            - generic [ref=e140]: How does splitting actually work?
            - generic [ref=e141]: +
          - paragraph [ref=e142]: "Every expense you add has a payer and a split: either shared equally among the members you tick, or owed in full by one person. Split Circle does the arithmetic and keeps a running net balance per member automatically."
        - generic [ref=e144]:
          - button "Where do our group’s expenses live?" [ref=e145] [cursor=pointer]:
            - generic [ref=e146]: Where do our group’s expenses live?
            - generic [ref=e147]: +
          - paragraph [ref=e148]: On the nodes of the people in the group, as CRDT state that merges conflict-free across everyone’s device. There is no central ledger server holding your group’s spending.
        - generic [ref=e150]:
          - button "What is a context, here?" [ref=e151] [cursor=pointer]:
            - generic [ref=e152]: What is a context, here?
            - generic [ref=e153]: +
          - paragraph [ref=e154]: Each group is its own encrypted context. Only the people you invite into that group see its expenses, balances and settlements — other groups you’re in stay completely separate.
        - generic [ref=e156]:
          - button "How do my friends join a group?" [ref=e157] [cursor=pointer]:
            - generic [ref=e158]: How do my friends join a group?
            - generic [ref=e159]: +
          - paragraph [ref=e160]: Create the group, then share an invite link from the top bar. Anyone you invite lands straight in the group’s expense list and dashboard, live. No accounts, no sign-up.
        - generic [ref=e162]:
          - button "What happens when someone pays me back?" [ref=e163] [cursor=pointer]:
            - generic [ref=e164]: What happens when someone pays me back?
            - generic [ref=e165]: +
          - paragraph [ref=e166]: Record the settlement between the two people involved and the balances view updates for everyone within seconds — it’s netted against the underlying expenses, not just noted separately.
        - generic [ref=e168]:
          - button "Is it really decentralized?" [ref=e169] [cursor=pointer]:
            - generic [ref=e170]: Is it really decentralized?
            - generic [ref=e171]: +
          - paragraph [ref=e172]: Yes. Expenses, splits and settlements are peer-to-peer CRDT data on the nodes that participate. Take your node offline and your group’s data goes with it; bring it back and it re-syncs.
    - generic [ref=e174]:
      - heading "Connect your node to get started." [level=2] [ref=e175]
      - paragraph [ref=e176]: It takes seconds, and your data never leaves your control.
      - button "Connect" [ref=e179] [cursor=pointer]:
        - img [ref=e180]
        - text: Connect
    - contentinfo [ref=e184]:
      - generic [ref=e185]:
        - generic [ref=e186]:
          - generic [ref=e187]:
            - img [ref=e189]
            - text: split-circle
          - paragraph [ref=e193]: Private. Real-time. Yours.
        - generic [ref=e194]:
          - generic [ref=e195]:
            - heading "App" [level=5] [ref=e196]
            - link "How it works" [ref=e197] [cursor=pointer]:
              - /url: "#how"
            - link "Features" [ref=e198] [cursor=pointer]:
              - /url: "#features"
            - link "FAQ" [ref=e199] [cursor=pointer]:
              - /url: "#faq"
          - generic [ref=e200]:
            - heading "Calimero" [level=5] [ref=e201]
            - link "Website" [ref=e202] [cursor=pointer]:
              - /url: https://calimero.network
            - link "Docs" [ref=e203] [cursor=pointer]:
              - /url: https://docs.calimero.network
            - link "Core node" [ref=e204] [cursor=pointer]:
              - /url: https://github.com/calimero-network/core
          - generic [ref=e205]:
            - heading "Community" [level=5] [ref=e206]
            - link "GitHub" [ref=e207] [cursor=pointer]:
              - /url: https://github.com/calimero-network
            - link "X / Twitter" [ref=e208] [cursor=pointer]:
              - /url: https://x.com/CalimeroNetwork
            - link "Discord" [ref=e209] [cursor=pointer]:
              - /url: https://discord.gg/calimero
      - generic [ref=e210]:
        - generic [ref=e211]: Built on Calimero
        - generic [ref=e212]: Self-sovereign by design
  - status [ref=e213]
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