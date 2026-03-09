export interface Drop {
  id: string;
  name: string;
  requiredMinutes: number;
  currentMinutes: number;
  claimable: boolean;
}

export interface Campaign {
  id: string;
  gameName: string;
  active: boolean;
  endsAt: string;
  drops: Drop[];
}

export function chooseActiveDrop(campaign: Campaign): Drop | null {
  const sorted = [...campaign.drops].sort((a, b) => a.currentMinutes - b.currentMinutes);
  return sorted.find((d) => d.currentMinutes < d.requiredMinutes) ?? null;
}

