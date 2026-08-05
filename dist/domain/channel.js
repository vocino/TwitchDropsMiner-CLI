/**
 * Special game IDs that can be earned watching ANY game — upstream DevilXD b5e1993 (IRL).
 * Keep list in sync with src/core/constants.ts SPECIAL_GAME_IDS.
 */
const SPECIAL_GAME_IDS = new Set(["509663", "509672"]);
/**
 * Special game names that are earnable anywhere (fallback when gameId not available).
 * IRL / Just Chatting variants.
 */
const SPECIAL_GAME_NAMES_LOWER = new Set(["irl", "irl - real life", "just chatting"]);
function isSpecialGame(channel) {
    if (channel.gameId && SPECIAL_GAME_IDS.has(String(channel.gameId)))
        return true;
    if (channel.gameName && SPECIAL_GAME_NAMES_LOWER.has(channel.gameName.toLowerCase()))
        return true;
    return false;
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
