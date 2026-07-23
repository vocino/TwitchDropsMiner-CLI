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
  CampaignDetails: {
    operationName: "DropCampaignDetails",
    sha256Hash: "039277bf98f3130929262cc7c6efd9c141ca3749cb6dca442fc8ead9a53f77c1",
    variables: { channelLogin: "", dropID: "" }
  },
  GameDirectory: {
    operationName: "DirectoryPage_Game",
    sha256Hash: "86bcceb4e8b1a51256ff8eed8bd8aae4acacf80d737efe904f84f3aeadf8cafd",
    variables: {
      limit: 30,
      slug: "",
      imageWidth: 50,
      includeCostreaming: false,
      options: {
        broadcasterLanguages: [],
        freeformTags: null,
        includeRestricted: ["SUB_ONLY_LIVE"],
        recommendationsContext: { platform: "web" },
        sort: "RELEVANCE",
        systemFilters: [],
        tags: [],
        requestID: "JIRA-VXP-2397"
      },
      sortTypeIsRecency: false
    }
  },
  SlugRedirect: {
    operationName: "DirectoryGameRedirect",
    sha256Hash: "1f0300090caceec51f33c5e20647aceff9017f740f223c3c532ba6fa59f6b6cc",
    variables: { name: "" }
  },
  GetStreamInfo: {
    operationName: "VideoPlayerStreamInfoOverlayChannel",
    sha256Hash: "198492e0857f6aedead9665c81c5a06d67b25b58034649687124083ff288597d",
    variables: { channel: "" }
  },
  PlaybackAccessToken: {
    operationName: "PlaybackAccessToken",
    sha256Hash: "ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9",
    variables: {
      isLive: true,
      isVod: false,
      login: "",
      platform: "web",
      playerType: "site",
      vodID: ""
    }
  },
  AvailableDrops: {
    operationName: "DropsHighlightService_AvailableDrops",
    sha256Hash: "782dad0f032942260171d2d80a654f88bdd0c5a9dddc392e9bc92218a0f42d20",
    variables: { channelID: "" }
  },
  CurrentDrop: {
    operationName: "DropCurrentSessionContext",
    sha256Hash: "4d06b702d25d652afb9ef835d2a550031f1cf762b193523a92166f40ea3d142b",
    variables: { channelID: "", channelLogin: "" }
  },
  ClaimDrop: {
    operationName: "DropsPage_ClaimDropRewards",
    sha256Hash: "a455deea71bdc9015b78eb49f4acfbce8baa7ccbedd28e549bb025bd0f751930",
    variables: { input: { dropInstanceID: "" } }
  },
  ChannelPointsContext: {
    operationName: "ChannelPointsContext",
    sha256Hash: "374314de591e69925fce3ddc2bcf085796f56ebb8cad67a0daa3165c03adc345",
    variables: { channelLogin: "" }
  }
};

export function gqlPayload(operation: GqlOperation, variables?: Record<string, unknown>): unknown {
  return {
    operationName: operation.operationName,
    variables: { ...operation.variables, ...(variables ?? {}) },
    extensions: { persistedQuery: { version: 1, sha256Hash: operation.sha256Hash } }
  };
}

export function applyGqlHashOverride(operation: GqlOperation, overrides: Record<string, string>): GqlOperation {
  const h = overrides[operation.operationName];
  if (!h) return operation;
  return { ...operation, sha256Hash: h };
}

export function getGqlOperation(name: string): GqlOperation {
  const op = (GQL_OPERATIONS as Record<string, GqlOperation>)[name];
  if (!op) throw new Error(`Unknown GQL operation: ${name}`);
  return op;
}
