const MAX_EXTRA_MINUTES = 15;

export type Json = Record<string, unknown>;

export enum BenefitType {
  UNKNOWN = "UNKNOWN",
  BADGE = "BADGE",
  EMOTE = "EMOTE",
  DIRECT_ENTITLEMENT = "DIRECT_ENTITLEMENT"
}

export class Benefit {
  readonly id: string;
  readonly name: string;
  readonly type: BenefitType;
  readonly imageUrl: string;

  constructor(data: Json) {
    const benefit = data.benefit as Json;
    this.id = String(benefit.id);
    this.name = String(benefit.name);
    const distType = String(benefit.distributionType ?? "UNKNOWN");
    this.type =
      (Object.values(BenefitType) as string[]).includes(distType) && distType in BenefitType
        ? (distType as BenefitType)
        : BenefitType.UNKNOWN;
    this.imageUrl = String(benefit.imageAssetURL ?? "");
  }

  isBadgeOrEmote(): boolean {
    return this.type === BenefitType.BADGE || this.type === BenefitType.EMOTE;
  }
}

export class TimedDrop {
  readonly id: string;
  readonly name: string;
  readonly campaign: DropsCampaign;
  readonly benefits: Benefit[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly requiredMinutes: number;
  readonly preconditionDropIds: string[];

  private claimId: string | null;
  private claimed: boolean;
  private realCurrentMinutes: number;
  private extraCurrentMinutes: number;

  constructor(campaign: DropsCampaign, data: Json, claimedBenefits: Record<string, Date>) {
    this.campaign = campaign;
    this.id = String(data.id);
    this.name = String(data.name);
    const benefitEdges = (data.benefitEdges as Json[]) || [];
    this.benefits = benefitEdges.map((b) => new Benefit(b));
    this.startsAt = new Date(String(data.startAt));
    this.endsAt = new Date(String(data.endAt));

    const selfEdge = (data.self as Json | undefined) ?? undefined;
    this.claimId =
      selfEdge && typeof selfEdge.dropInstanceID === "string"
        ? (selfEdge.dropInstanceID as string)
        : null;
    this.claimed = !!(selfEdge && selfEdge.isClaimed);

    const required = Number(data.requiredMinutesWatched ?? 0);
    this.requiredMinutes = Number.isFinite(required) ? required : 0;

    const currentFromSelf = Number(selfEdge?.currentMinutesWatched ?? 0);
    this.realCurrentMinutes = Number.isFinite(currentFromSelf) ? currentFromSelf : 0;
    this.extraCurrentMinutes = 0;

    // If not explicitly claimed, infer from claimed benefits window.
    if (!this.claimed && this.benefits.length > 0) {
      const timestamps: Date[] = [];
      for (const benefit of this.benefits) {
        const ts = claimedBenefits[benefit.id];
        if (ts) {
          timestamps.push(ts);
        }
      }
      if (timestamps.length > 0 && timestamps.every((dt) => this.startsAt <= dt && dt < this.endsAt)) {
        this.claimed = true;
      }
    }

    if (this.claimed) {
      this.realCurrentMinutes = this.requiredMinutes;
    }

    const preconditions = (data.preconditionDrops as Json[] | undefined) ?? [];
    this.preconditionDropIds = preconditions.map((d) => String(d.id));
  }

  get isClaimed(): boolean {
    return this.claimed;
  }

  get dropInstanceId(): string | null {
    return this.claimId;
  }

  get currentMinutes(): number {
    return this.realCurrentMinutes + this.extraCurrentMinutes;
  }

  get remainingMinutes(): number {
    return Math.max(0, this.requiredMinutes - this.currentMinutes);
  }

  get totalRequiredMinutes(): number {
    const chainTotal = this.preconditionDropIds
      .map((id) => this.campaign.timedDrops.get(id))
      .filter((d): d is TimedDrop => !!d)
      .reduce((acc, d) => acc + d.totalRequiredMinutes, 0);
    return this.requiredMinutes + chainTotal;
  }

  get totalRemainingMinutes(): number {
    const chainRemaining = this.preconditionDropIds
      .map((id) => this.campaign.timedDrops.get(id))
      .filter((d): d is TimedDrop => !!d)
      .reduce((acc, d) => acc + d.totalRemainingMinutes, 0);
    return this.remainingMinutes + chainRemaining;
  }

  get progress(): number {
    if (this.currentMinutes <= 0 || this.requiredMinutes <= 0) {
      return 0;
    }
    if (this.currentMinutes >= this.requiredMinutes) {
      return 1;
    }
    return this.currentMinutes / this.requiredMinutes;
  }

  get availability(): number {
    const now = new Date();
    if (
      this.requiredMinutes > 0 &&
      this.totalRemainingMinutes > 0 &&
      now.getTime() < this.endsAt.getTime()
    ) {
      const minutesLeft = (this.endsAt.getTime() - now.getTime()) / 60000;
      return minutesLeft / this.totalRemainingMinutes;
    }
    return Number.POSITIVE_INFINITY;
  }

  private baseEarnConditions(): boolean {
    return (
      !this.claimed &&
      (this.benefits.length > 0 || this.campaign.preconditionsChain().has(this.id)) &&
      this.requiredMinutes > 0 &&
      this.extraCurrentMinutes < MAX_EXTRA_MINUTES
    );
  }

  canEarn(now: Date = new Date()): boolean {
    return (
      this.baseEarnConditions() &&
      this.startsAt.getTime() <= now.getTime() &&
      now.getTime() < this.endsAt.getTime() &&
      this.campaign.baseCanEarn()
    );
  }

  canEarnWithin(stamp: Date): boolean {
    return (
      this.baseEarnConditions() &&
      this.endsAt.getTime() > Date.now() &&
      this.startsAt.getTime() < stamp.getTime()
    );
  }

  get canClaim(): boolean {
    if (!this.claimId || this.claimed) {
      return false;
    }
    const now = new Date();
    const cutoff = new Date(this.campaign.endsAt.getTime() + 24 * 60 * 60 * 1000);
    return now.getTime() < cutoff.getTime();
  }

  markClaimed(): void {
    this.claimed = true;
    this.realCurrentMinutes = this.requiredMinutes;
    this.extraCurrentMinutes = 0;
  }

  /** Apply a delta to this drop's real minutes only (no campaign-wide propagation). */
  addRealMinutes(delta: number): void {
    if (delta === 0) return;
    let next = this.realCurrentMinutes + delta;
    if (next < 0) next = 0;
    if (next > this.requiredMinutes) next = this.requiredMinutes;
    this.realCurrentMinutes = next;
    this.extraCurrentMinutes = 0;
  }

  updateMinutes(newMinutes: number): void {
    const delta = newMinutes - this.realCurrentMinutes;
    if (delta === 0) return;
    this.addRealMinutes(delta);
  }

  bumpMinutes(): boolean {
    if (this.canEarn()) {
      this.extraCurrentMinutes += 1;
      if (this.extraCurrentMinutes >= MAX_EXTRA_MINUTES) {
        return true;
      }
    }
    return false;
  }
}

export class DropsCampaign {
  readonly id: string;
  readonly name: string;
  readonly gameName: string;
  readonly gameSlug: string;
  readonly startsAt: Date;
  readonly endsAt: Date;

  private readonly linked: boolean;
  private readonly valid: boolean;
  readonly timedDrops: Map<string, TimedDrop>;
  private readonly enableBadgesEmotes: boolean;

  constructor(raw: Json, claimedBenefits: Record<string, Date>, enableBadgesEmotes: boolean) {
    this.id = String(raw.id);
    this.name = String(raw.name);
    const game = (raw.game as Json) || {};
    this.gameName = String(game.name ?? game.displayName ?? "Unknown Game");
    this.gameSlug = String(game.slug ?? this.gameName.toLowerCase().replace(/\s+/g, "-"));
    this.linked = !!((raw.self as Json | undefined)?.isAccountConnected);
    this.startsAt = new Date(String(raw.startAt));
    this.endsAt = new Date(String(raw.endAt));
    this.valid = raw.status !== "EXPIRED";
    this.enableBadgesEmotes = enableBadgesEmotes;

    const drops = (raw.timeBasedDrops as Json[]) || [];
    this.timedDrops = new Map(
      drops.map((drop) => {
        const td = new TimedDrop(this, drop, claimedBenefits);
        return [td.id, td];
      })
    );
  }

  get drops(): TimedDrop[] {
    return Array.from(this.timedDrops.values());
  }

  get timeTriggers(): Date[] {
    const triggers = new Set<number>();
    triggers.add(this.startsAt.getTime());
    triggers.add(this.endsAt.getTime());
    for (const drop of this.drops) {
      triggers.add(drop.startsAt.getTime());
      triggers.add(drop.endsAt.getTime());
    }
    return Array.from(triggers)
      .sort((a, b) => a - b)
      .map((t) => new Date(t));
  }

  get active(): boolean {
    const now = new Date();
    return (
      this.valid &&
      this.startsAt.getTime() <= now.getTime() &&
      now.getTime() < this.endsAt.getTime()
    );
  }

  get upcoming(): boolean {
    const now = new Date();
    return this.valid && now.getTime() < this.startsAt.getTime();
  }

  get expired(): boolean {
    const now = new Date();
    return !this.valid || this.endsAt.getTime() <= now.getTime();
  }

  get eligible(): boolean {
    if (this.hasBadgeOrEmote) {
      return this.enableBadgesEmotes;
    }
    return this.linked;
  }

  get hasBadgeOrEmote(): boolean {
    return this.drops.some((drop) => drop.benefits.some((b) => b.isBadgeOrEmote()));
  }

  get finished(): boolean {
    return this.drops.every((d) => d.isClaimed || d.requiredMinutes <= 0);
  }

  get claimedDrops(): number {
    return this.drops.filter((d) => d.isClaimed).length;
  }

  get remainingDrops(): number {
    return this.drops.filter((d) => !d.isClaimed).length;
  }

  get requiredMinutes(): number {
    return this.drops.reduce((acc, d) => Math.max(acc, d.totalRequiredMinutes), 0);
  }

  get remainingMinutes(): number {
    return this.drops.reduce((acc, d) => Math.max(acc, d.totalRemainingMinutes), 0);
  }

  get progress(): number {
    if (!this.drops.length) {
      return 0;
    }
    return this.drops.reduce((acc, d) => acc + d.progress, 0) / this.drops.length;
  }

  get availability(): number {
    return this.drops.reduce(
      (acc, d) => Math.min(acc, d.availability),
      Number.POSITIVE_INFINITY
    );
  }

  get firstDrop(): TimedDrop | null {
    const candidates = this.drops.filter((d) => d.canEarn());
    if (!candidates.length) {
      return null;
    }
    candidates.sort((a, b) => a.remainingMinutes - b.remainingMinutes);
    return candidates[0] ?? null;
  }

  updateRealMinutes(delta: number): void {
    if (delta === 0) return;
    for (const drop of this.drops) {
      drop.addRealMinutes(delta);
    }
  }

  baseCanEarn(): boolean {
    return this.eligible && this.active;
  }

  preconditionsChain(): Set<string> {
    const chain = new Set<string>();
    for (const drop of this.drops) {
      if (!drop.isClaimed) {
        for (const id of drop.preconditionDropIds) {
          chain.add(id);
        }
      }
    }
    return chain;
  }

  canEarnWithin(stamp: Date): boolean {
    const now = new Date();
    return (
      this.eligible &&
      this.valid &&
      this.endsAt.getTime() > now.getTime() &&
      this.startsAt.getTime() < stamp.getTime() &&
      this.drops.some((d) => d.canEarnWithin(stamp))
    );
  }
}

export interface BuiltInventory {
  campaigns: DropsCampaign[];
  dropsById: Map<string, TimedDrop>;
  timeTriggers: Date[];
}

export interface InventoryBuildContext {
  enableBadgesEmotes: boolean;
}

export function buildInventoryFromGqlResponses(
  inventoryResponse: Json,
  campaignsResponse: Json,
  ctx: InventoryBuildContext
): BuiltInventory {
  const inventoryRoot = (inventoryResponse.data as Json | undefined)?.currentUser as
    | Json
    | undefined;
  const inv = (inventoryRoot?.inventory as Json | undefined) ?? {};
  const ongoing = (inv.dropCampaignsInProgress as Json[] | undefined) ?? [];
  const gameEventDrops = (inv.gameEventDrops as Json[] | undefined) ?? [];

  const claimedBenefits: Record<string, Date> = {};
  for (const b of gameEventDrops) {
    const id = String(b.id);
    const lastAwardedAt = b.lastAwardedAt ? new Date(String(b.lastAwardedAt)) : null;
    if (lastAwardedAt) {
      claimedBenefits[id] = lastAwardedAt;
    }
  }

  const inventoryData: Record<string, Json> = {};
  for (const c of ongoing) {
    inventoryData[String(c.id)] = c;
  }

  const campaignsRoot = (campaignsResponse.data as Json | undefined)?.currentUser as
    | Json
    | undefined;
  const campaignsList = (campaignsRoot?.dropCampaigns as Json[] | undefined) ?? [];
  for (const c of campaignsList) {
    const status = String(c.status ?? "");
    if (status !== "ACTIVE" && status !== "UPCOMING") {
      continue;
    }
    const id = String(c.id);
    if (!inventoryData[id]) {
      inventoryData[id] = c;
    }
  }

  const campaigns: DropsCampaign[] = [];
  const dropsById = new Map<string, TimedDrop>();
  const triggerSet = new Set<number>();

  for (const data of Object.values(inventoryData)) {
    const game = (data.game as Json | undefined) ?? undefined;
    if (!game) {
      continue;
    }
    const campaign = new DropsCampaign(data, claimedBenefits, ctx.enableBadgesEmotes);
    campaigns.push(campaign);
    for (const drop of campaign.drops) {
      dropsById.set(drop.id, drop);
    }
    for (const t of campaign.timeTriggers) {
      triggerSet.add(t.getTime());
    }
  }

  campaigns.sort((a, b) => {
    if (a.eligible !== b.eligible) {
      return a.eligible ? -1 : 1;
    }
    if (a.upcoming !== b.upcoming) {
      return a.upcoming ? 1 : -1;
    }
    return a.startsAt.getTime() - b.startsAt.getTime();
  });

  const timeTriggers = Array.from(triggerSet)
    .sort((a, b) => a - b)
    .map((t) => new Date(t));

  return { campaigns, dropsById, timeTriggers };
}
