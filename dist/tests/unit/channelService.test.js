import test from "node:test";
import assert from "node:assert/strict";
import { parseGameDirectoryResponse } from "../../core/channelService.js";
test("parseGameDirectoryResponse extracts channels from directory payload", () => {
    const response = {
        data: {
            game: {
                streams: {
                    edges: [
                        {
                            node: {
                                broadcasters: [{ id: "123", login: "streamer1" }],
                                viewersCount: 500,
                                game: { displayName: "Just Chatting" }
                            }
                        },
                        {
                            node: {
                                broadcaster: { id: "456", login: "streamer2" },
                                viewerCount: 100,
                                game: { name: "Fallout" }
                            }
                        }
                    ]
                }
            }
        }
    };
    const channels = parseGameDirectoryResponse(response, "Just Chatting", false);
    assert.equal(channels.length, 2);
    assert.equal(channels[0]?.id, "123");
    assert.equal(channels[0]?.login, "streamer1");
    assert.equal(channels[0]?.viewers, 500);
    assert.equal(channels[0]?.gameName, "Just Chatting");
    assert.equal(channels[0]?.online, true);
    assert.equal(channels[0]?.dropsEnabled, true);
    assert.equal(channels[1]?.id, "456");
    assert.equal(channels[1]?.login, "streamer2");
    assert.equal(channels[1]?.viewers, 100);
    assert.equal(channels[1]?.aclBased, false);
});
