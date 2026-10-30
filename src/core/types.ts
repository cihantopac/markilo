import type { ProductUnderstanding } from '../research/product.js';
export type FindingStatus = 'observed' | 'inferred' | 'verified' | 'user-provided';
export type Confidence = 'low' | 'medium' | 'high';
export type BrandRole = 'master' | 'product' | 'sub-brand' | 'endorsed';
export type BriefMode = 'new' | 'refresh' | 'redesign' | 'evaluate';
export type ConceptStatus = 'draft' | 'verified' | 'shortlisted' | 'rejected' | 'approved';

export interface WorkspaceBrand {
  slug: string;
  name: string;
  role: BrandRole;
  /** Locked brands are preserved exactly as provided and never redesigned. */
  locked?: boolean;
  parent?: string;
}

export interface WorkspaceManifest {
  schema: 'markilo/workspace@1';
  name: string;
  createdAt: string;
  family?: { name: string; slug: string; description?: string };
  brands: WorkspaceBrand[];
}

export interface Source {
  id: string;
  type: 'url' | 'repo' | 'file' | 'user' | 'search' | 'registry' | 'app-store';
  ref: string;
  retrievedAt: string;
  notes?: string;
  /**
   * authoritative: official registries and records; primary: the brand's or competitor's own site, app listing or
   * repository; secondary: press, reviews, directories, search snippets; user: stated by the user.
   */
  reliability?: SourceReliability;
  /** For registry sources: what was searched, so originality reports can state their coverage precisely. */
  registry?: { id: string; query: string; classes?: number[]; resultCount?: number; conflicts?: string[] };
}

export type SourceReliability = 'authoritative' | 'primary' | 'secondary' | 'user';

export type FindingTopic =
  | 'product'
  | 'audience'
  | 'market'
  | 'competitor'
  | 'visual-identity'
  | 'typography'
  | 'color'
  | 'naming'
  | 'trend'
  | 'culture'
  | 'trademark'
  | 'platform';

export interface Finding {
  id: string;
  topic: FindingTopic;
  statement: string;
  status: FindingStatus;
  sourceIds: string[];
  confidence: Confidence;
  recordedAt: string;
}

export interface ExistingIdentity {
  logos: { path: string; kind: string; source: string }[];
  colors: { hex: string; count: number; source: string }[];
  fonts: { family: string; source: string }[];
}

export interface BrandProfile {
  schema: 'markilo/profile@1';
  brand: string;
  updatedAt: string;
  sources: Source[];
  findings: Finding[];
  existingIdentity: ExistingIdentity;
  /** Things we could not establish. Listed so nobody fills them with guesses. */
  gaps: string[];
  /** What the product does, for whom and where, merged from repository and website research, with sources. */
  product?: ProductUnderstanding;
}

export interface AnswerLog {
  schema: 'markilo/answers@1';
  questions: { id: string; question: string; answer: string | null; askedAt: string; answeredAt?: string }[];
}

export interface Brief {
  schema: 'markilo/brief@1';
  brand: string;
  name: string;
  mode: BriefMode;
  oneLiner?: string;
  product?: { type?: string; category?: string; features?: string[]; platforms?: string[] };
  audience?: { primary?: string[]; secondary?: string[]; markets?: string[]; languages?: string[] };
  positioning?: { values?: string[]; personality?: string[]; tone?: string; differentiators?: string[] };
  competitors?: { name: string; url?: string; notes?: string }[];
  /** colors: hex values or color directions in words. */
  constraints?: { mustKeep?: string[]; avoid?: string[]; colors?: string[]; typography?: string[] };
  lockedAssets?: { path: string; reason: string }[];
  deliverables?: string[];
  niceClasses?: number[];
  /** Source folders of this brand in a repository or monorepo (used by `research repo` without a path). */
  codePaths?: string[];
  notes?: string;
}

export interface ConceptPalette {
  primary: string;
  secondary?: string;
  accent?: string;
  ink?: string;
  paper?: string;
}

export interface Concept {
  schema: 'markilo/concept@1';
  id: string;
  brand: string;
  title: string;
  direction: string;
  rationale: string;
  semantics: string[];
  construction?: string;
  palette: ConceptPalette;
  typography?: {
    fontId: string;
    weight: number;
    family?: string;
    license?: string;
    tracking?: number;
    case?: 'as-is' | 'lower' | 'upper';
  };
  /** small: a simplified symbol for 32 px and below (favicons, small ICO sizes), checked against the main one. */
  files: {
    symbol?: string;
    wordmark?: string;
    lockupHorizontal?: string;
    lockupStacked?: string;
    small?: string;
  };
  status: ConceptStatus;
  createdAt: string;
  updatedAt: string;
  judgment?: Record<string, { score: number; rationale: string }>;
  /** What the critic saw before reading the rationale (first impressions, in order). */
  readsAs?: string[];
  /** The critic's early verdict on the sketch board: which sketch to develop (null = none, rethink the move). */
  sketchReview?: { pick: string | null; notes: string; at: string };
  /** The critic's answer to "would a senior identity designer put this in front of a client as is?" */
  critique?: { present: boolean; reason: string; at: string };
}
