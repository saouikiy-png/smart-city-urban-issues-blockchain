import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { Abi } from "viem";
import * as XLSX from "xlsx";
import registryArtifact from "./contracts/UrbanIssueRegistry.json";
import { hardhat } from "./wagmi";

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = "Reported" | "Assigned" | "InProgress" | "Resolved" | "Closed";
type Priority = "Low" | "Medium" | "High" | "Critical";

interface Issue {
  id: bigint;
  issueId: string;
  issueType: string;
  location: string;
  description: string;
  reportDate: string;
  priority: bigint;
  reportedBy: string;
  reporter: string;
  assignedTo: string;
  status: bigint;
  createdAt: bigint;
  updatedAt: bigint;
}

interface HistoryEntry {
  timestamp: bigint;
  status: bigint;
  team: string;
  comment: string;
  actor: string;
}

interface ImportRow {
  issueId: string;
  issueType: string;
  location: string;
  description: string;
  reportDate: string;
  priority: string;
  reportedBy: string;
  assignedTo: string;
  status: string;
  errors: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const abi = registryArtifact.abi as Abi;
const contractAddress = registryArtifact.address as `0x${string}`;

const STATUS_LABELS: Status[] = [
  "Reported",
  "Assigned",
  "InProgress",
  "Resolved",
  "Closed",
];
const STATUS_FR: Record<Status, string> = {
  Reported: "Signalé",
  Assigned: "Affecté",
  InProgress: "En cours",
  Resolved: "Résolu",
  Closed: "Clôturé",
};
const PRIORITY_LABELS: Priority[] = ["Low", "Medium", "High", "Critical"];
const PRIORITY_FR: Record<Priority, string> = {
  Low: "Faible",
  Medium: "Moyen",
  High: "Élevé",
  Critical: "Critique",
};
const REQUIRED_COLUMNS = [
  "issueId",
  "issueType",
  "location",
  "description",
  "reportDate",
  "priority",
  "reportedBy",
  "assignedTo",
  "status",
];

const MAX_LENGTHS: Record<string, number> = {
  issueId: 64,
  issueType: 64,
  location: 200,
  description: 500,
  reportDate: 10,
  reportedBy: 64,
  assignedTo: 64,
};

const KNOWN_TYPES = [
  "StreetLight",
  "Pothole",
  "WaterLeak",
  "WasteCollection",
  "TrafficLight",
  "BrokenSidewalk",
  "Graffiti",
  "NoisePollution",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusFromBigInt(n: bigint): Status {
  return STATUS_LABELS[Number(n)] ?? "Reported";
}

function priorityFromBigInt(n: bigint): Priority {
  return PRIORITY_LABELS[Number(n)] ?? "Low";
}

function statusToBadgeClass(s: Status): string {
  return (
    {
      Reported: "badge-reported",
      Assigned: "badge-assigned",
      InProgress: "badge-inprogress",
      Resolved: "badge-resolved",
      Closed: "badge-closed",
    }[s] ?? "badge-reported"
  );
}

function priorityToBadgeClass(p: Priority): string {
  return (
    {
      Low: "badge-low",
      Medium: "badge-medium",
      High: "badge-high",
      Critical: "badge-critical",
    }[p] ?? "badge-low"
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function formatTimestamp(ts: bigint): string {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function truncateAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function translateError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (
    text.includes("User rejected") ||
    text.includes("user rejected") ||
    text.includes("MetaMask Tx Signature")
  ) {
    return "Transaction annulée par l'utilisateur dans MetaMask.";
  }
  if (
    text.includes("AccessControlUnauthorizedAccount") ||
    text.includes("AccessDenied") ||
    text.includes("NotAdmin")
  ) {
    return "Accès refusé : votre compte n'a pas le rôle Municipalité.";
  }
  if (text.includes("DuplicateIssueId")) {
    return "Doublon : un signalement avec cet identifiant existe déjà sur la blockchain.";
  }
  if (text.includes("InvalidStatusTransition")) {
    return "Transition de statut interdite : l'avancement doit être séquentiel.";
  }
  if (text.includes("BatchTooLarge")) {
    return "Lot trop grand : le maximum est 15 signalements par transaction.";
  }
  if (text.includes("EmptyRequiredField")) {
    return "Champ obligatoire vide : tous les champs marqués * sont requis.";
  }
  if (text.includes("InvalidComment")) {
    return "Le commentaire est obligatoire et ne peut pas être vide.";
  }
  if (text.includes("EmptyBatch")) {
    return "Le lot est vide.";
  }
  if (text.includes("IssueNotFound") || text.includes("IssueRefNotFound")) {
    return "Signalement introuvable.";
  }
  if (text.includes("StringTooLong")) {
    return "Un champ dépasse la longueur maximale autorisée.";
  }
  return text.length > 220 ? text.slice(0, 220) + "…" : text;
}

function generateIssueId(): string {
  const year = new Date().getFullYear();
  const num = Math.floor(100 + Math.random() * 900);
  const suffix = Math.floor(10 + Math.random() * 90);
  return `CITY-${year}-${num}${suffix}`;
}

// ─── App Shell ───────────────────────────────────────────────────────────────

export default function App() {
  const location = useLocation();
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          Smart<span>City</span>
        </Link>
        <nav>
          <Link
            className={
              location.pathname === "/" ||
              location.pathname.startsWith("/issue")
                ? "active"
                : ""
            }
            to="/"
          >
            Signalements
          </Link>
          <Link
            className={location.pathname === "/declare" ? "active" : ""}
            to="/declare"
          >
            Déclarer
          </Link>
          <Link
            className={location.pathname === "/municipality" ? "active" : ""}
            to="/municipality"
          >
            Municipalité
          </Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<PublicListPage />} />
          <Route path="/issue/:id" element={<IssueDetailPage />} />
          <Route path="/declare" element={<DeclarePage />} />
          <Route path="/municipality" element={<MunicipalityPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer>
        Smart City &amp; Blockchain · Réseau Hardhat local (chain ID 31337) ·
        Aucune donnée personnelle
      </footer>
    </div>
  );
}

// ─── Shared components ───────────────────────────────────────────────────────

function NetworkBanner() {
  const { chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!chainId || chainId === hardhat.id) return null;
  return (
    <div className="alert warning">
      Réseau incorrect (chain ID {chainId}). Connectez MetaMask à Hardhat Local
      (31337).{" "}
      <button
        className="button small"
        onClick={() => switchChain({ chainId: hardhat.id })}
        disabled={isPending}
      >
        Changer de réseau
      </button>
    </div>
  );
}

function WalletPanel() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  return (
    <section className="wallet-panel">
      <div>
        <span className={`status-dot ${isConnected ? "online" : ""}`} />
        {isConnected ? (
          <>
            <b>Wallet connecté</b>
            <span className="muted">{address}</span>
            <span className="muted">
              {chain?.name ?? `Chain ${chain?.id}`}
            </span>
          </>
        ) : (
          <>
            <b>Wallet non connecté</b>
            <span className="muted">
              Utilisez MetaMask sur Hardhat local.
            </span>
          </>
        )}
      </div>
      {isConnected ? (
        <button className="button secondary" onClick={() => disconnect()}>
          Déconnexion
        </button>
      ) : (
        <button
          className="button"
          disabled={isPending || !connectors[0]}
          onClick={() =>
            connectors[0] && connect({ connector: connectors[0] })
          }
        >
          {isPending ? "Connexion..." : "Connecter MetaMask"}
        </button>
      )}
      {error && <p className="error-text">{error.message}</p>}
    </section>
  );
}

// ─── 1. Public list page ──────────────────────────────────────────────────────

function PublicListPage() {
  const publicClient = usePublicClient({ chainId: hardhat.id });
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [searchId, setSearchId] = useState("");
  const navigate = useNavigate();

  const isContractReady = contractAddress.length > 10;

  const fetchIssues = useCallback(async () => {
    if (!publicClient || !isContractReady) return;
    setLoading(true);
    setError("");
    try {
      const total = (await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "totalIssues",
      })) as bigint;
      const fetched: Issue[] = [];
      for (let i = 1n; i <= total; i++) {
        const issue = (await publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "getIssue",
          args: [i],
        })) as Issue;
        fetched.push(issue);
      }
      setIssues(fetched);
    } catch (e) {
      setError("Impossible de charger les signalements : " + translateError(e));
    } finally {
      setLoading(false);
    }
  }, [publicClient, isContractReady]);

  useEffect(() => {
    void fetchIssues();
  }, [fetchIssues]);

  const filtered = useMemo(() => {
    return issues.filter((issue) => {
      const s = statusFromBigInt(issue.status);
      const p = priorityFromBigInt(issue.priority);
      if (filterStatus !== "all" && s !== filterStatus) return false;
      if (filterPriority !== "all" && p !== filterPriority) return false;
      if (
        searchId &&
        !issue.issueId.toLowerCase().includes(searchId.toLowerCase())
      )
        return false;
      return true;
    });
  }, [issues, filterStatus, filterPriority, searchId]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchId.trim();
    if (!q || !publicClient || !isContractReady) return;
    try {
      const issue = (await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getIssueByRef",
        args: [q],
      })) as Issue;
      navigate(`/issue/${issue.id}`);
    } catch {
      // fall through — filter the displayed list
    }
  }

  return (
    <section className="page">
      <div className="hero">
        <span className="eyebrow">REGISTRE PUBLIC</span>
        <h1>Signalements urbains.</h1>
        <p>
          Consultation publique des signalements — sans wallet. Filtrez par
          statut, priorité ou identifiant.
        </p>
      </div>

      {!isContractReady && (
        <div className="alert warning">
          Contrat non déployé. Lancez le nœud Hardhat, puis{" "}
          <code>npx hardhat run scripts/deploy.ts --network localhost</code>.
        </div>
      )}
      {error && <div className="alert danger">{error}</div>}

      <div className="filter-bar">
        <form className="search-row" onSubmit={handleSearch}>
          <input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Recherche par issueId (ex. CITY-2026-001)"
          />
          <button className="button" type="submit">
            Rechercher
          </button>
          {searchId && (
            <button
              className="button secondary"
              type="button"
              onClick={() => setSearchId("")}
            >
              ✕
            </button>
          )}
        </form>
        <div className="filters">
          <label className="compact-label">
            Statut&nbsp;
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Tous</option>
              {STATUS_LABELS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_FR[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="compact-label">
            Priorité&nbsp;
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="all">Toutes</option>
              {PRIORITY_LABELS.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_FR[p]}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary small" onClick={fetchIssues}>
            ↺ Actualiser
          </button>
        </div>
      </div>

      {loading && <p className="muted">Chargement…</p>}

      {!loading && filtered.length === 0 && issues.length > 0 && (
        <p className="muted">
          Aucun signalement ne correspond aux filtres.
        </p>
      )}
      {!loading && issues.length === 0 && isContractReady && (
        <p className="muted">
          Aucun signalement enregistré. Lancez{" "}
          <code>
            npx hardhat run scripts/seed.ts --network localhost
          </code>{" "}
          pour ajouter des données de démonstration.
        </p>
      )}

      <div className="issue-grid">
        {filtered.map((issue) => {
          const s = statusFromBigInt(issue.status);
          const p = priorityFromBigInt(issue.priority);
          return (
            <Link
              key={String(issue.id)}
              to={`/issue/${issue.id}`}
              className="issue-card"
            >
              <div className="issue-card-header">
                <code className="issue-ref">{issue.issueId}</code>
                <span className={`badge ${statusToBadgeClass(s)}`}>
                  {STATUS_FR[s]}
                </span>
              </div>
              <h3 className="issue-type">{issue.issueType}</h3>
              <p className="issue-location">📍 {issue.location}</p>
              <div className="issue-meta">
                <span className={`badge small ${priorityToBadgeClass(p)}`}>
                  {PRIORITY_FR[p]}
                </span>
                <span className="muted small">{issue.reportDate}</span>
                {issue.assignedTo && (
                  <span className="muted small">
                    👷 {issue.assignedTo}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── 2. Issue detail page ─────────────────────────────────────────────────────

function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const publicClient = usePublicClient({ chainId: hardhat.id });
  const [issue, setIssue] = useState<Issue | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!id || !publicClient) return;
    setLoading(true);
    setError("");
    Promise.all([
      publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getIssue",
        args: [BigInt(id)],
      }) as Promise<Issue>,
      publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getHistory",
        args: [BigInt(id)],
      }) as Promise<HistoryEntry[]>,
    ])
      .then(([iss, hist]) => {
        setIssue(iss);
        setHistory(hist);
      })
      .catch((e) => setError(translateError(e)))
      .finally(() => setLoading(false));
  }, [id, publicClient]);

  if (loading)
    return (
      <section className="page">
        <p className="muted">Chargement…</p>
      </section>
    );
  if (error)
    return (
      <section className="page">
        <div className="alert danger">{error}</div>
        <button className="button secondary" onClick={() => navigate(-1)}>
          ← Retour
        </button>
      </section>
    );
  if (!issue) return null;

  const s = statusFromBigInt(issue.status);
  const p = priorityFromBigInt(issue.priority);

  return (
    <section className="page detail-page">
      <button
        className="button secondary back-btn"
        onClick={() => navigate(-1)}
      >
        ← Retour
      </button>
      <div className="detail-header">
        <div>
          <code className="issue-ref large">{issue.issueId}</code>
          <h1>{issue.issueType}</h1>
        </div>
        <div className="detail-badges">
          <span className={`badge ${statusToBadgeClass(s)}`}>
            {STATUS_FR[s]}
          </span>
          <span className={`badge ${priorityToBadgeClass(p)}`}>
            {PRIORITY_FR[p]}
          </span>
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <h2>Informations</h2>
          <dl className="details-list">
            <dt>Localisation</dt>
            <dd>📍 {issue.location}</dd>
            <dt>Description</dt>
            <dd>{issue.description}</dd>
            <dt>Date de signalement</dt>
            <dd>{issue.reportDate}</dd>
            <dt>Signalé par (pseudonyme)</dt>
            <dd>{issue.reportedBy}</dd>
            <dt>Équipe assignée</dt>
            <dd>
              {issue.assignedTo || (
                <span className="muted">Non assigné</span>
              )}
            </dd>
            <dt>Adresse reporter</dt>
            <dd>
              <code>{issue.reporter}</code>
            </dd>
            <dt>Créé le</dt>
            <dd>{formatTimestamp(issue.createdAt)}</dd>
            <dt>Mis à jour le</dt>
            <dd>{formatTimestamp(issue.updatedAt)}</dd>
          </dl>
        </div>

        <div className="card">
          <h2>
            Historique ({history.length} entrée
            {history.length > 1 ? "s" : ""})
          </h2>
          <div className="timeline">
            {history.map((entry, i) => {
              const es = statusFromBigInt(entry.status);
              return (
                <div className="timeline-entry" key={i}>
                  <div
                    className={`timeline-dot ${statusToBadgeClass(es)}`}
                  />
                  <div className="timeline-body">
                    <div className="timeline-top">
                      <span
                        className={`badge small ${statusToBadgeClass(es)}`}
                      >
                        {STATUS_FR[es]}
                      </span>
                      <span className="muted small">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    {entry.team && (
                      <p className="timeline-team">👷 {entry.team}</p>
                    )}
                    <p className="timeline-comment">{entry.comment}</p>
                    <p className="timeline-actor muted small">
                      par{" "}
                      <code title={entry.actor}>
                        {truncateAddress(entry.actor)}
                      </code>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 3. Declare page ──────────────────────────────────────────────────────────

function DeclarePage() {
  const { isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: hardhat.id });
  const { writeContractAsync } = useWriteContract();
  const [issueTypeSelect, setIssueTypeSelect] = useState("");
  const [issueTypeFree, setIssueTypeFree] = useState("");
  const [form, setForm] = useState({
    location: "",
    description: "",
    reportDate: new Date().toISOString().slice(0, 10),
    priority: "0",
    reportedBy: "",
  });
  const [txHash, setTxHash] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isContractReady = contractAddress.length > 10;
  const ready =
    isConnected && chainId === hardhat.id && isContractReady;

  const issueType =
    issueTypeSelect === "__other__" ? issueTypeFree : issueTypeSelect;

  function update(
    e: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!issueType.trim()) errs.push("Type de problème obligatoire");
    if (!form.location.trim()) errs.push("Localisation obligatoire");
    if (!form.description.trim()) errs.push("Description obligatoire");
    if (!form.reportedBy.trim()) errs.push("Pseudonyme obligatoire");
    if (!isIsoDate(form.reportDate))
      errs.push("Date invalide (format YYYY-MM-DD)");
    if (form.location.length > 200)
      errs.push("Localisation trop longue (max 200)");
    if (form.description.length > 500)
      errs.push("Description trop longue (max 500)");
    if (form.reportedBy.length > 64)
      errs.push("Pseudonyme trop long (max 64)");
    return errs;
  }

  async function findUniqueId(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const id = generateIssueId();
      if (!publicClient) return id;
      try {
        const existing = (await publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "getIdByRef",
          args: [id],
        })) as bigint;
        if (existing === 0n) return id;
      } catch {
        return id;
      }
    }
    return generateIssueId();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setTxHash("");
    const errs = validate();
    if (errs.length) {
      setError(errs.join(" · "));
      return;
    }
    if (!ready) {
      setError("Connectez MetaMask au réseau Hardhat Local (31337).");
      return;
    }
    setLoading(true);
    try {
      const autoId = await findUniqueId();
      const hash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName: "createIssue",
        args: [
          autoId,
          issueType,
          form.location,
          form.description,
          form.reportDate,
          BigInt(form.priority),
          form.reportedBy,
        ],
      });
      setTxHash(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setNotice(`Signalement ${autoId} créé avec succès !`);
      setIssueTypeSelect("");
      setIssueTypeFree("");
      setForm({
        location: "",
        description: "",
        reportDate: new Date().toISOString().slice(0, 10),
        priority: "0",
        reportedBy: "",
      });
    } catch (err) {
      setError(translateError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page">
      <div className="hero">
        <span className="eyebrow">DÉCLARER UN PROBLÈME</span>
        <h1>Signalez un problème urbain.</h1>
        <p>
          Votre signalement sera enregistré sur la blockchain. L'identifiant
          est généré automatiquement (format CITY-AAAA-NNN).
        </p>
      </div>
      <div className="alert warning">
        ⚠️ <strong>Aucune donnée personnelle</strong> : le champ
        &quot;Signalé par&quot; doit contenir un pseudonyme fictif (ex.
        Citizen01). Ces données sont publiques et permanentes sur la
        blockchain.
      </div>
      <NetworkBanner />
      <WalletPanel />
      {!isConnected && (
        <div className="alert warning">
          Connectez votre wallet pour soumettre un signalement.
        </div>
      )}
      {isConnected && chainId !== hardhat.id && (
        <div className="alert danger">
          Basculez MetaMask sur le réseau Hardhat Local (31337).
        </div>
      )}
      <div className="card declare-card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="wide">
            Type de problème *
            <select
              value={issueTypeSelect}
              onChange={(e) => setIssueTypeSelect(e.target.value)}
            >
              <option value="">Choisir…</option>
              {KNOWN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__other__">Autre…</option>
            </select>
            {issueTypeSelect === "__other__" && (
              <input
                value={issueTypeFree}
                onChange={(e) => setIssueTypeFree(e.target.value)}
                placeholder="Type de problème libre"
                style={{ marginTop: 8 }}
                maxLength={64}
              />
            )}
          </label>
          <label className="wide">
            Localisation *{" "}
            <span className="muted inline">
              ({form.location.length}/200)
            </span>
            <input
              name="location"
              value={form.location}
              onChange={update}
              placeholder="Rue, quartier, ville fictive"
              maxLength={200}
            />
          </label>
          <label className="wide">
            Description *{" "}
            <span className="muted inline">
              ({form.description.length}/500)
            </span>
            <textarea
              name="description"
              value={form.description}
              onChange={update}
              placeholder="Décrivez le problème…"
              rows={3}
              maxLength={500}
            />
          </label>
          <label>
            Date de signalement *
            <input
              name="reportDate"
              type="date"
              value={form.reportDate}
              onChange={update}
            />
          </label>
          <label>
            Priorité
            <select name="priority" value={form.priority} onChange={update}>
              {PRIORITY_LABELS.map((p, i) => (
                <option key={p} value={i}>
                  {PRIORITY_FR[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Pseudonyme fictif *{" "}
            <span className="muted inline">(ex. Citizen42)</span>
            <input
              name="reportedBy"
              value={form.reportedBy}
              onChange={update}
              placeholder="Citizen01"
              maxLength={64}
            />
          </label>
          <button className="button wide" disabled={!ready || loading}>
            {loading ? "Envoi en cours…" : "Soumettre le signalement"}
          </button>
        </form>
        {error && <div className="alert danger">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}
        {txHash && (
          <div className="tx-info">
            <span className="muted small">Hash de transaction :</span>
            <code className="tx-hash">{txHash}</code>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 4 & 5. Municipality page ─────────────────────────────────────────────────

function MunicipalityPage() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: hardhat.id });
  const { writeContractAsync } = useWriteContract();
  const [isMunicipal, setIsMunicipal] = useState(false);
  const [checkingRole, setCheckingRole] = useState(false);
  const [tab, setTab] = useState<"assign" | "import">("assign");

  const isContractReady = contractAddress.length > 10;
  const ready =
    isConnected && chainId === hardhat.id && isMunicipal && isContractReady;

  useEffect(() => {
    let active = true;
    async function check() {
      setIsMunicipal(false);
      if (
        !address ||
        chainId !== hardhat.id ||
        !publicClient ||
        !isContractReady
      )
        return;
      setCheckingRole(true);
      try {
        const role = (await publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "MUNICIPAL_ROLE",
        })) as `0x${string}`;
        const has = (await publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "hasRole",
          args: [role, address],
        })) as boolean;
        if (active) setIsMunicipal(has);
      } catch {
        // ignore
      } finally {
        if (active) setCheckingRole(false);
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, [address, chainId, publicClient, isContractReady]);

  return (
    <section className="page">
      <div className="hero">
        <span className="eyebrow">ESPACE MUNICIPALITÉ</span>
        <h1>Gestion des signalements.</h1>
        <p>
          Affectez des équipes, faites avancer les statuts, importez des
          lots.
        </p>
      </div>
      <NetworkBanner />
      <WalletPanel />

      {isConnected &&
        chainId === hardhat.id &&
        !checkingRole &&
        !isMunicipal && (
          <div className="alert danger">
            ⛔ Ce compte ({address}) ne possède pas le rôle Municipalité
            (MUNICIPAL_ROLE). Les actions ci-dessous sont désactivées.
            Connectez le compte #0 (admin + municipal) ou demandez à l'admin
            de vous accorder le rôle.
          </div>
        )}
      {checkingRole && <p className="muted">Vérification du rôle…</p>}

      <div className="tab-bar">
        <button
          className={`tab-btn ${tab === "assign" ? "active" : ""}`}
          onClick={() => setTab("assign")}
        >
          Affecter / Avancer un statut
        </button>
        <button
          className={`tab-btn ${tab === "import" ? "active" : ""}`}
          onClick={() => setTab("import")}
        >
          Import Excel / CSV
        </button>
      </div>

      {tab === "assign" && (
        <AssignPanel
          publicClient={publicClient}
          writeContractAsync={writeContractAsync}
          ready={ready}
        />
      )}
      {tab === "import" && (
        <ImportPanel
          publicClient={publicClient}
          writeContractAsync={writeContractAsync}
          ready={ready}
        />
      )}
    </section>
  );
}

// ─── Assign / status panel ───────────────────────────────────────────────────

function AssignPanel({
  publicClient,
  writeContractAsync,
  ready,
}: {
  publicClient: ReturnType<typeof usePublicClient>;
  writeContractAsync: ReturnType<
    typeof useWriteContract
  >["writeContractAsync"];
  ready: boolean;
}) {
  const [refInput, setRefInput] = useState("");
  const [issue, setIssue] = useState<Issue | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [team, setTeam] = useState("");
  const [comment, setComment] = useState("");
  const [txHash, setTxHash] = useState("");
  const [notice, setNotice] = useState("");
  const [opError, setOpError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookupIssue(e: FormEvent) {
    e.preventDefault();
    setIssue(null);
    setFetchError("");
    setNotice("");
    setOpError("");
    setTxHash("");
    if (!publicClient || !refInput.trim()) return;
    try {
      let fetched: Issue;
      if (/^\d+$/.test(refInput.trim())) {
        fetched = (await publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "getIssue",
          args: [BigInt(refInput.trim())],
        })) as Issue;
      } else {
        fetched = (await publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "getIssueByRef",
          args: [refInput.trim()],
        })) as Issue;
      }
      setIssue(fetched);
      setTeam(fetched.assignedTo);
    } catch (e) {
      setFetchError(translateError(e));
    }
  }

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    if (!issue || !ready) return;
    setOpError("");
    setNotice("");
    setTxHash("");
    if (!team.trim()) {
      setOpError("Le nom de l'équipe est obligatoire.");
      return;
    }
    if (!comment.trim()) {
      setOpError("Le commentaire est obligatoire.");
      return;
    }
    setLoading(true);
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName: "assignIssue",
        args: [issue.id, team, comment],
      });
      setTxHash(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setNotice(`Équipe ${team} affectée avec succès.`);
      const refreshed = (await publicClient!.readContract({
        address: contractAddress,
        abi,
        functionName: "getIssue",
        args: [issue.id],
      })) as Issue;
      setIssue(refreshed);
    } catch (err) {
      setOpError(translateError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvance(e: FormEvent) {
    e.preventDefault();
    if (!issue || !ready) return;
    setOpError("");
    setNotice("");
    setTxHash("");
    const current = Number(issue.status);
    if (current >= 4) {
      setOpError("Ce signalement est déjà Clôturé.");
      return;
    }
    if (!comment.trim()) {
      setOpError("Le commentaire est obligatoire.");
      return;
    }
    const nextStatus = current + 1;
    setLoading(true);
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName: "updateStatus",
        args: [issue.id, BigInt(nextStatus), comment],
      });
      setTxHash(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setNotice(
        `Statut avancé vers "${STATUS_FR[STATUS_LABELS[nextStatus]]}".`
      );
      const refreshed = (await publicClient!.readContract({
        address: contractAddress,
        abi,
        functionName: "getIssue",
        args: [issue.id],
      })) as Issue;
      setIssue(refreshed);
    } catch (err) {
      setOpError(translateError(err));
    } finally {
      setLoading(false);
    }
  }

  const currentStatus = issue ? statusFromBigInt(issue.status) : null;
  const nextStatus =
    issue && Number(issue.status) < 4
      ? STATUS_LABELS[Number(issue.status) + 1]
      : null;

  return (
    <div className="card">
      <div className="section-title">
        <span className="step">01</span>
        <div>
          <h2>Affecter / Avancer un signalement</h2>
          <p>Cherchez par issueId ou identifiant numérique.</p>
        </div>
      </div>
      <form className="search-row" onSubmit={lookupIssue}>
        <input
          value={refInput}
          onChange={(e) => setRefInput(e.target.value)}
          placeholder="issueId (ex. CITY-2026-001) ou id numérique"
        />
        <button className="button" type="submit" disabled={!publicClient}>
          Charger
        </button>
      </form>
      {fetchError && <div className="alert danger">{fetchError}</div>}

      {issue && (
        <div className="assign-panel">
          <div className="issue-summary">
            <code className="issue-ref">{issue.issueId}</code>
            <span
              className={`badge ${statusToBadgeClass(currentStatus!)}`}
            >
              {STATUS_FR[currentStatus!]}
            </span>
            <span>
              <strong>{issue.issueType}</strong>
            </span>
            <span className="muted">{issue.location}</span>
          </div>

          <div className="assign-grid">
            <form className="form-grid" onSubmit={handleAssign}>
              <h3 className="form-section-title wide">Affecter une équipe</h3>
              <label className="wide">
                Équipe *
                <input
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="UrbanTeam01"
                  maxLength={64}
                  disabled={!ready}
                />
              </label>
              <label className="wide">
                Commentaire *{" "}
                <span className="muted inline">({comment.length}/300)</span>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Motif de l'affectation…"
                  maxLength={300}
                  disabled={!ready}
                />
              </label>
              <button className="button" disabled={!ready || loading}>
                Affecter
              </button>
            </form>

            <form className="form-grid" onSubmit={handleAdvance}>
              <h3 className="form-section-title wide">
                Avancer le statut{" "}
                {nextStatus
                  ? `→ "${STATUS_FR[nextStatus]}"`
                  : "(déjà Clôturé)"}
              </h3>
              <label className="wide">
                Commentaire *{" "}
                <span className="muted inline">({comment.length}/300)</span>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Motif de l'avancement…"
                  maxLength={300}
                  disabled={!ready}
                />
              </label>
              <button
                className="button"
                disabled={!ready || loading || !nextStatus}
              >
                {nextStatus
                  ? `Passer à "${STATUS_FR[nextStatus]}"`
                  : "Statut final atteint"}
              </button>
            </form>
          </div>

          {opError && <div className="alert danger">{opError}</div>}
          {notice && <div className="alert success">{notice}</div>}
          {txHash && (
            <div className="tx-info">
              <span className="muted small">Hash :</span>
              <code className="tx-hash">{txHash}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Import panel ─────────────────────────────────────────────────────────────

function ImportPanel({
  publicClient,
  writeContractAsync,
  ready,
}: {
  publicClient: ReturnType<typeof usePublicClient>;
  writeContractAsync: ReturnType<
    typeof useWriteContract
  >["writeContractAsync"];
  ready: boolean;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [fileError, setFileError] = useState("");
  const [fileNotice, setFileNotice] = useState("");
  const [transactions, setTransactions] = useState<
    { hash: string; state: string }[]
  >([]);
  const [txError, setTxError] = useState("");
  const [loading, setLoading] = useState(false);

  function validateRow(row: Omit<ImportRow, "errors">): string[] {
    const errs: string[] = [];
    const required = [
      "issueId",
      "issueType",
      "location",
      "description",
      "reportDate",
      "reportedBy",
    ] as const;
    for (const key of required) {
      if (!row[key].trim()) errs.push(`${key} : champ obligatoire`);
    }
    for (const [key, max] of Object.entries(MAX_LENGTHS)) {
      const val = (row as Record<string, string>)[key] ?? "";
      if (val.length > max) errs.push(`${key} : trop long (max ${max})`);
    }
    if (row.reportDate && !isIsoDate(row.reportDate)) {
      errs.push("reportDate : date ISO invalide (YYYY-MM-DD)");
    }
    if (row.priority && !PRIORITY_LABELS.includes(row.priority as Priority)) {
      errs.push(
        `priority : valeur inconnue "${row.priority}" (Low/Medium/High/Critical)`
      );
    }
    if (row.status && !["Reported", "Assigned"].includes(row.status)) {
      errs.push(
        `status : doit être Reported ou Assigned (valeur : "${row.status}")`
      );
    }
    if (row.status === "Assigned" && !row.assignedTo.trim()) {
      errs.push("assignedTo : obligatoire quand status=Assigned");
    }
    return errs;
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    setFileNotice("");
    setRows([]);
    setSelected([]);
    setTransactions([]);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: false,
      });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Le fichier ne contient aucune feuille.");
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        sheet,
        { defval: "" }
      );
      const headers =
        (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0]) ?? [];
      const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
      const extra = headers.filter((c) => !REQUIRED_COLUMNS.includes(c));
      if (missing.length || extra.length) {
        const details = [
          missing.length ? `manquantes : ${missing.join(", ")}` : "",
          extra.length ? `inattendues : ${extra.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        throw new Error(
          `Colonnes incorrectes (${details || "doublon de colonne"}). Colonnes attendues : ${REQUIRED_COLUMNS.join(" | ")}`
        );
      }

      const parsed: ImportRow[] = records.map((rec) => {
        const r = Object.fromEntries(
          REQUIRED_COLUMNS.map((k) => [k, String(rec[k] ?? "").trim()])
        ) as Omit<ImportRow, "errors">;
        return { ...r, errors: validateRow(r) };
      });

      // doublons dans le fichier
      const seen = new Set<string>();
      parsed.forEach((row) => {
        if (!row.issueId) return;
        if (seen.has(row.issueId))
          row.errors.push(
            `issueId : doublon dans le fichier ("${row.issueId}")`
          );
        seen.add(row.issueId);
      });

      // doublons on-chain
      if (publicClient) {
        await Promise.all(
          parsed.map(async (row) => {
            if (
              !row.issueId ||
              row.errors.some((e) => e.includes("doublon"))
            )
              return;
            try {
              const existing = (await publicClient.readContract({
                address: contractAddress,
                abi,
                functionName: "getIdByRef",
                args: [row.issueId],
              })) as bigint;
              if (existing !== 0n) {
                row.errors.push(
                  `issueId : déjà enregistré on-chain (id ${existing})`
                );
              }
            } catch {
              /* nœud inaccessible */
            }
          })
        );
      }

      setRows(parsed);
      setSelected(
        parsed.flatMap((r, i) => (r.errors.length === 0 ? [i] : []))
      );
      setFileNotice(
        `${parsed.length} ligne(s) lue(s), ${parsed.filter((r) => r.errors.length === 0).length} valide(s).`
      );
    } catch (err) {
      setFileError(
        err instanceof Error ? err.message : "Lecture impossible."
      );
    }
  }

  function toggleRow(i: number) {
    setSelected((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  }
  const validCount = useMemo(
    () => rows.filter((r) => r.errors.length === 0).length,
    [rows]
  );
  function toggleAll() {
    const valid = rows.flatMap((r, i) => (r.errors.length === 0 ? [i] : []));
    setSelected(selected.length === valid.length ? [] : valid);
  }

  async function sendBatch() {
    const toSend = selected
      .map((i) => rows[i])
      .filter((r) => r && r.errors.length === 0);
    if (!toSend.length) return;
    if (!ready) {
      setTxError("Connectez un compte municipal.");
      return;
    }
    setLoading(true);
    setTxError("");
    setTransactions([]);

    const CHUNK = 10;
    const chunks: ImportRow[][] = [];
    for (let i = 0; i < toSend.length; i += CHUNK)
      chunks.push(toSend.slice(i, i + CHUNK));

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const priorityIndex = (p: string) =>
        Math.max(0, PRIORITY_LABELS.indexOf(p as Priority));
      try {
        const hash = await writeContractAsync({
          address: contractAddress,
          abi,
          functionName: "batchCreateIssues",
          args: [
            chunk.map((r) => r.issueId),
            chunk.map((r) => r.issueType),
            chunk.map((r) => r.location),
            chunk.map((r) => r.description),
            chunk.map((r) => r.reportDate),
            chunk.map((r) => BigInt(priorityIndex(r.priority))),
            chunk.map((r) => r.reportedBy),
            chunk.map((r) => r.assignedTo),
          ],
        });
        setTransactions((prev) => [
          ...prev,
          { hash, state: `Lot ${ci + 1}/${chunks.length} en attente…` },
        ]);
        await publicClient!.waitForTransactionReceipt({ hash });
        setTransactions((prev) =>
          prev.map((t) =>
            t.hash === hash
              ? { ...t, state: `Lot ${ci + 1}/${chunks.length} confirmé ✓` }
              : t
          )
        );
      } catch (err) {
        setTxError(translateError(err));
        setTransactions((prev) =>
          prev.map((t, idx) =>
            idx === ci ? { ...t, state: `Lot ${ci + 1} échoué` } : t
          )
        );
        break;
      }
    }
    setLoading(false);
  }

  return (
    <div className="card">
      <div className="section-title">
        <span className="step">02</span>
        <div>
          <h2>Import Excel / CSV</h2>
          <p>
            Colonnes exactes attendues :{" "}
            <code>{REQUIRED_COLUMNS.join(" | ")}</code>
          </p>
        </div>
      </div>

      <label className="upload-box">
        <span className="upload-icon">↑</span>
        <b>Choisir un fichier .xlsx ou .csv</b>
        <span className="muted">Validation avant tout envoi on-chain</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleUpload}
        />
      </label>

      {fileError && <div className="alert danger">{fileError}</div>}
      {fileNotice && <div className="alert success">{fileNotice}</div>}

      {rows.length > 0 && (
        <>
          <div className="import-controls">
            <label>
              <input
                type="checkbox"
                checked={
                  selected.length === validCount && validCount > 0
                }
                onChange={toggleAll}
              />{" "}
              Tout sélectionner ({selected.length}/{validCount})
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Ligne</th>
                  <th>issueId</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Priorité</th>
                  <th>Équipe</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={row.errors.length ? "invalid-row" : ""}
                  >
                    <td>
                      <input
                        type="checkbox"
                        disabled={row.errors.length > 0}
                        checked={selected.includes(i)}
                        onChange={() => toggleRow(i)}
                      />
                    </td>
                    <td>{i + 2}</td>
                    <td>
                      <code>{row.issueId || "—"}</code>
                    </td>
                    <td>{row.issueType || "—"}</td>
                    <td>{row.status || "—"}</td>
                    <td>{row.priority || "—"}</td>
                    <td>{row.assignedTo || "—"}</td>
                    <td>
                      {row.errors.length ? (
                        <span className="error-text">
                          {row.errors.join("; ")}
                        </span>
                      ) : (
                        <span className="valid-text">✓ Valide</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="button issue-button"
            disabled={!ready || selected.length === 0 || loading}
            onClick={sendBatch}
          >
            {loading
              ? "Envoi en cours…"
              : `Importer ${selected.length} ligne(s) sélectionnée(s)`}
          </button>
        </>
      )}

      {txError && <div className="alert danger">{txError}</div>}
      {transactions.length > 0 && (
        <section className="transactions">
          <h2>Suivi des transactions</h2>
          {transactions.map((tx, i) => (
            <div className="transaction" key={i}>
              <div>
                <b>{tx.state}</b>
                <code className="tx-hash">{tx.hash}</code>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
