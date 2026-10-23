# The CredAI Story: Presenting the AIOps Architecture

A presentation script, not a reference manual — this document is written
so you can **read it once, then explain it in your own words** to an
instructor, an interviewer, or a teammate. It answers five specific
questions in order, each as a short "chapter" of one continuous story,
and ends with a two-minute spoken version plus the follow-up questions
you're most likely to get.

For implementation-level depth once you've told the story, point to
`AIOps-From-Prometheus-To-AI-Service.md` — that document is the reference;
this one is the narrative.

---

## The one-sentence version

*"CredAI is one small FastAPI Pod that reads the same metrics an engineer
would already check by hand, and turns them into a conversation — it
never invents data, it only explains data that's really there."*

Everything below is that sentence, unpacked into five chapters.

---

## Chapter 1 — How the frontend is configured

The story starts where a user's question starts: a browser.

CredAI is **not a separate app**. It's one more page — `/credai` — bolted
onto the *existing* CredPay React application, next to Dashboard, Add
Card, Pay Bill. The sidebar (`Sidebar.jsx`) has one new entry, "🤖
CredAI," pointing at that route. The page itself
(`frontend-react/src/pages/CredAIPage.jsx`) looks like a ChatGPT window:
a welcome message, Quick Action cards ("Cluster Health", "Payment
Summary", "Root Cause Analysis"...), Suggested Questions, a scrolling
message list, and a text box.

When you type a question and hit send, the page calls one function:
`sendAiChatMessage()` in `frontend-react/src/services/api.js`, which does
a plain `POST /api/ai/chat` through a dedicated `axios` instance called
`aiApi` — same pattern the app already uses for `userApi` (login/cards)
and `paymentApi` (bill pay), just pointed at a different backend path.

The one design choice worth calling out here: `aiApi`'s **base URL is
empty on purpose**. In production the browser calls `/api/ai/chat` as a
*relative* path, and the Kubernetes Ingress — the same one that already
routes `/`, `/api/users`, `/api/payment` — routes `/api/ai` to the
`credai-service` Service internally. The frontend never needs to know an
IP address, a namespace, or that `ai-service` is even a separate Pod.

**The story beat to say out loud:** *"From the user's point of view,
there's no new app to learn — it's the same CredPay they already log
into, with one more tab that happens to talk to an LLM behind the
scenes."*

## Chapter 2 — How ai-service gets data (Prometheus and Azure Monitor)

Here's the part that makes this *AIOps* and not just "a chatbot wired to
an API key": **the LLM never touches raw telemetry directly.** A
dedicated component fetches it first.

`app/services/telemetry_collector.py` owns one client per data source:

- **Prometheus** (`app/clients/prometheus_client.py`) — a plain HTTP call
  to `http://prometheus.monitoring.svc.cluster.local:9090/api/v1/query`,
  the exact same Prometheus every Grafana dashboard already reads from.
  This is the **one source that's always live** in this deployment — pod
  restarts, CPU/memory usage, HPA replica counts, HTTP success rates, all
  come from here.
- **Kubernetes API** (`app/clients/kubernetes_client.py`) — reads live Pod
  and Deployment state directly from the cluster, using a dedicated,
  least-privilege ServiceAccount that can only `get/list/watch`
  Pods/Events/Deployments inside the `credpay` namespace. Nothing more.
- **Azure Monitor** (`app/clients/azure_monitor_client.py`) — this one is
  worth being precise about in a presentation: **it exists in the code,
  authenticates with its own dedicated Azure AD Service Principal, and is
  fully wired up to call Azure's Resource Health and Metrics APIs — but
  that Service Principal was never created for this deployment.** So
  right now it reports `"not_configured"` and contributes nothing. It's
  not broken; it's an intentionally optional, not-yet-turned-on pathway.
  Say this plainly if asked — it's a much stronger answer than pretending
  it's active.

Every one of these clients returns the exact same shape:
`{"source": ..., "label": ..., "value": ...}` — a **normalized fact**.
That normalization is the architectural rule that makes step 3 possible.

**The story beat to say out loud:** *"Prometheus is the one source doing
real work today. Azure Monitor is built and ready — it just needs one
Service Principal to switch on — which is a deliberate 'ship the always-on
source first, make the optional ones pluggable' decision, not an oversight."*

## Chapter 3 — Azure OpenAI's role, and how it's connected

Once facts are collected and normalized, `app/prompt_builder/` assembles
**one plain-text prompt** — a system preamble ("you are CredAI, answer
only from the data given"), the normalized facts as `[source] label =
value` lines, and the user's question. That single string is the entire
input Azure OpenAI ever sees.

**Azure OpenAI's role is deliberately narrow: summarize and reason over
data it's handed, never fetch its own.** It has no credentials to
Prometheus, no Kubernetes access, no network path to anything except the
prompt string it's given. This is the "RAG for operations" pattern —
retrieve real data first, then let the model explain it — and it's the
reason CredAI can't hallucinate a metric that doesn't exist: if the
telemetry collector found nothing, the prompt says so, and the system
prompt instructs the model to say "I don't have that data" rather than
guess.

**The connection itself** (`app/clients/openai_client.py`): a single
`OpenAI` Python SDK client, pointed at Azure AI Foundry's endpoint via
`base_url`, authenticated with an API key — both read from a Kubernetes
Secret (`credai-secrets`), never hardcoded, never committed to git. One
method, `generate(prompt)`, calls `client.responses.create(...)` and
returns the model's text.

**The story beat to say out loud:** *"Azure OpenAI is the explainer, not
the investigator. It's handed a finished case file and asked to summarize
it in plain English — it never goes looking for evidence itself."*

## Chapter 4 — What the model is actually used for

The deployed model is **`gpt-5-mini`**, a reasoning model, chosen for one
job specifically: **turning a handful of normalized metric lines into a
correct, concise, operator-facing paragraph** — not code generation, not
open-ended chat, not general knowledge.

Two model behaviors shaped real configuration decisions worth mentioning
if asked "why does it work the way it does":

- As a *reasoning* model, it spends part of its response budget on
  internal "thinking" tokens before writing the visible answer. For
  CredAI's use case — fast, concise ops answers, not deep multi-step
  problem-solving — reasoning effort is deliberately set to `"low"`, and
  the visible output budget (`max_output_tokens`) was tuned up to 3500 to
  give richer answers (like a full capacity-planning breakdown across
  nine Pods) enough room to finish without being cut off mid-sentence.
- The model is **intent-routed**, not asked one generic question every
  time. `app/services/intent_classifier.py` looks at keywords in the
  question ("bottleneck" → capacity planning, "why" → root cause,
  "payment" → business health) and picks a matching prompt template — so
  the model gets a task-shaped prompt ("compare CPU usage to configured
  requests") instead of a vague one, which is most of why answers stay
  specific and grounded rather than generic.

**The story beat to say out loud:** *"The model isn't doing anything
exotic — it's a small, fast reasoning model doing exactly one job:
reading operational facts and writing the sentence a human would have
written after checking five dashboards themselves."*

## Chapter 5 — What the ai-service Deployment is actually doing

Strip away the AI framing for a moment: `credai-service` is **one more
ordinary Kubernetes Deployment**, built the same way every other
Deployment in this project is — because underneath the LLM call, it's
just a FastAPI web server.

What the Deployment object (`k8s/ai-service/deployment.yaml`) actually
runs: a single container, image `credpayacrs1.azurecr.io/credpay/ai-service:latest`,
listening on port `8010`, serving plain HTTP routes like any other
backend service in this repo (`/api/ai/health`, `/api/ai/chat`,
`/api/ai/cluster-summary`, ...). Its environment comes entirely from a
ConfigMap (non-secret settings) and a Secret (the OpenAI credentials) —
no values are baked into the image. Its health, readiness, and liveness
probes all hit `/api/ai/health`, the same endpoint you'd curl by hand to
check if it's alive.

Three choices distinguish it from the other Deployments, each for a
specific reason:

- **1 replica, not 2** — this cluster is a small, 2-node pool that has
  hit memory ceilings before; a brand-new workload starts conservative
  rather than repeating that incident.
- **`maxSurge: 0`** — a rolling update never briefly runs 2 Pods at once;
  it retires the old one before starting the new one, trading a few
  seconds of unavailability for guaranteed headroom on a tight cluster.
- **A dedicated, least-privilege ServiceAccount** — `credai-service` can
  read Pods/Events/Deployments in `credpay` only; it cannot see other
  namespaces, cannot modify anything, and cannot read Secrets other than
  its own.

**The story beat to say out loud:** *"Take away the word 'AI' and this is
just a small, careful, read-only microservice — the same Deployment
pattern as user-service or payment-service, sized down and locked down
because the one new thing it does is call an external LLM API."*

---

## The two-minute spoken version (all five chapters, condensed)

> "CredAI adds one page to the existing CredPay app — no new app to log
> into. When you ask a question there, it hits a small FastAPI
> microservice running as one more Pod in the cluster. That Pod first
> gathers real facts — mainly from Prometheus, which is the same metrics
> source powering our Grafana dashboards, plus live Kubernetes state; an
> Azure Monitor integration exists in the code but isn't switched on yet.
> It turns those facts into one plain-text prompt and sends *only that* to
> Azure OpenAI — the model never touches our infrastructure directly, it
> just explains data it's handed, using a small reasoning model,
> `gpt-5-mini`, tuned for fast concise answers. The Pod itself is nothing
> exotic — a normal Deployment, sized small and locked down with
> least-privilege access, because that's good practice regardless of
> whether the workload happens to call an LLM."

## Anticipated questions (and the honest answer to each)

- **"Is the AI making decisions on its own?"** No — it only summarizes
  data the telemetry collector already fetched deterministically. It
  cannot query anything itself.
- **"What if Azure OpenAI is down?"** `/api/ai/health` reports it, and
  the chat endpoint returns a clear error rather than a fabricated
  answer — verified live (see `AIOps-From-Prometheus-To-AI-Service.md`
  §7 for the real incidents this was tested against).
- **"Is Azure Monitor actually feeding this right now?"** No, and say so
  plainly — it's built, credentialed-but-not-configured, and degrades
  gracefully. Prometheus and Kubernetes are the two live sources today.
- **"Why gpt-5-mini and not a bigger model?"** The job is summarizing a
  few dozen short fact lines into a paragraph, not open-ended reasoning —
  a smaller, faster, cheaper reasoning model fits the actual task.
- **"Could this see across other students'/teams' clusters?"** No — its
  ServiceAccount is namespace-scoped to `credpay` only, and its
  Prometheus/Azure Monitor queries are all hardcoded to this project's
  own resources.
