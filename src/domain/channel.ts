export interface Channel {
  id: string;
  login: string;
  online: boolean;
  viewers: number;
  gameName?: string;
  dropsEnabled?: boolean;
  aclBased?: boolean;
}

export function canWatchChannel(channel: Channel, wantedGames: string[]): boolean {
  if (!channel.online) {
    return false;
  }
  if (!channel.gameName) {
    return false;
  }
  if (!channel.dropsEnabled) {
    return false;
  }
  return wantedGames.includes(channel.gameName);
}

export function sortChannelCandidates(channels: Channel[], wantedGames: string[]): Channel[] {
  return [...channels].sort((a, b) => {
    const aPriority = wantedGames.indexOf(a.gameName ?? "");
    const bPriority = wantedGames.indexOf(b.gameName ?? "");
    const pa = aPriority === -1 ? Number.MAX_SAFE_INTEGER : aPriority;
    const pb = bPriority === -1 ? Number.MAX_SAFE_INTEGER : bPriority;
    if (pa !== pb) {
      return pa - pb;
    }
    return b.viewers - a.viewers;
  });
}

