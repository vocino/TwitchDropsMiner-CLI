export function canWatchChannel(channel, wantedGames) {
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
