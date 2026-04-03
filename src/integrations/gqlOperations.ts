export interface GqlOperation {
  operationName: string;
  sha256Hash: string;
  variables: Record<string, unknown>;
}

export const GQL_OPERATIONS: Record<string, GqlOperation> = {
  Inventory: {
    operationName: "Inventory",
    sha256Hash: "d86775d0ef16a63a33ad52e80eaff963b2d5b72fada7c991504a57496e1d8e4b",
    variables: { fetchRewardCampaigns: false }
  },
  Campaigns: {
    operationName: "ViewerDropsDashboard",
    sha256Hash: "5a4da2ab3d5b47c9f9ce864e727b2cb346af1e3ea8b897fe8f704a97ff017619",
    variables: { fetchRewardCampaigns: false }
  },
  CurrentDrop: {
    operationName: "DropCurrentSessionContext",
    sha256Hash: "4d06b702d25d652afb9ef835d2a550031f1cf762b193523a92166f40ea3d142b",
    variables: { channelID: "", channelLogin: "" }
  },
  GameDirectory: {
    operationName: "DirectoryPage_Game",
    sha256Hash: "76cb069d835b8a02914c08dc42c421d0dafda8af5b113a3f19141824b901402f",
    variables: { limit: 30, slug: "" }
  },
  ClaimDrop: {
    operationName: "DropsPage_ClaimDropRewards",
    sha256Hash: "a455deea71bdc9015b78eb49f4acfbce8baa7ccbedd28e549bb025bd0f751930",
    variables: { input: { dropInstanceID: "" } }
  }
};

export function gqlPayload(operation: GqlOperation, variables?: Record<string, unknown>): unknown {
  return {
    operationName: operation.operationName,
    variables: {
      ...operation.variables,
      ...(variables ?? {})
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: operation.sha256Hash
      }
    }
  };
}

/** Apply config overrides for persisted-query hashes (keyed by operationName). */
export function applyGqlHashOverride(
  operation: GqlOperation,
  overrides: Record<string, string>
): GqlOperation {
  const h = overrides[operation.operationName];
  if (!h) {
    return operation;
  }
  return { ...operation, sha256Hash: h };
}

