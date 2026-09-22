import { isSpecialGameId } from "../core/constants.js";
function isSpecialGame(channel) {
    return !!(channel.gameId && isSpecialGameId(channel.gameId));
}
export function canWatchChannel(channel, wantedGames) {
    if (!channel.online) {
        return false;
    }
    if (!channel.dropsEnabled) {
        return false;
    }
    // ACL-based or special game (IRL) can be watched regardless of gameName match — upstream b5e1993
    if (channel.aclBased === true || isSpecialGame(channel)) {
        return true;
    }
    if (!channel.gameName) {
        return false;
    }
    return wantedGames.includes(channel.gameName);
}
/** Lower = higher priority (ACL first, then wanted-game order, then viewers desc). */
export function getChannelPriority(channel, wantedGames) {
    const aclBonus = channel.aclBased === true ? 0 : 1;
    const priorityIndex = wantedGames.indexOf(channel.gameName ?? "");
    const gameOrder = priorityIndex === -1 ? Number.MAX_SAFE_INTEGER : priorityIndex;
    return aclBonus * 1e9 + gameOrder * 1e6 + (1e6 - Math.min(channel.viewers, 1e6 - 1));
}
/**
 * Reconcile the currently watched channel against a fresh directory fetch.
 * Directory results only contain live streams, so a watched channel missing
 * from a non-empty fresh list went offline (or left the directory) and must
 * be evicted — otherwise its stale viewer count keeps beating every live
 * candidate in shouldSwitchChannel and the miner sits on a dead stream.
 * An empty fresh list means the fetch failed or nothing is live; keep the
 * current channel in that case to avoid flapping to null on outages.
 */
export function resolveWatchedChannel(current, fresh, wantedGames) {
    if (!current)
        return null;
    if (!canWatchChannel(current, wantedGames))
        return null;
    if (fresh.length > 0 && !fresh.some((ch) => ch.id === current.id))
        return null;
    return current;
}
export function shouldSwitchChannel(current, candidate, wantedGames) {
    if (!current)
        return true;
    if (!canWatchChannel(candidate, wantedGames))
        return false;
    return getChannelPriority(candidate, wantedGames) < getChannelPriority(current, wantedGames);
}
export function sortChannelCandidates(channels, wantedGames) {
    return [...channels].sort((a, b) => {
        return getChannelPriority(a, wantedGames) - getChannelPriority(b, wantedGames);
    });
}
