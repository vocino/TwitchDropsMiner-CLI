import { httpJson } from "./httpClient.js";
import { TWITCH_GQL_URL, TWITCH_ANDROID_CLIENT_ID, TWITCH_ANDROID_USER_AGENT } from "../core/constants.js";
import { gqlPayload } from "./gqlOperations.js";
export async function gqlRequest(operation, accessToken, variables) {
    return httpJson("POST", TWITCH_GQL_URL, gqlPayload(operation, variables), {
        retries: 3,
        headers: {
            "Client-Id": TWITCH_ANDROID_CLIENT_ID,
            "User-Agent": TWITCH_ANDROID_USER_AGENT,
            Authorization: `OAuth ${accessToken}`
        }
    });
}
