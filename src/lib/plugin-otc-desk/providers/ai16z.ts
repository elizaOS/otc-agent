import { Provider } from "@elizaos/core";

export const tokenProvider: Provider = {
  name: "ELIZAOS",
  description: "Information about $ElizaOS and $ai16z",
  position: 99,
  dynamic: true,
  get: async () => {
    const text = `ai16z started in October 2024 as a playful, meme‑inspired decentralized autonomous organization (DAO) and governance token on the Solana blockchain. It parodied the name of venture capital firm “a16z” (Andreessen Horowitz) and intended to build autonomous investor‑like AI agents. 
It aimed to integrate AI into treasury management, investment decision‑making, and venture operations using autonomous agents. 
Token holders of AI16Z could propose and vote on investment ideas, buybacks, and other DAO governance functions. The system included a fictional AI agent (e.g., “Marc AIndreessen”) to evaluate proposals via reputation scoring. 
In short: ai16z was both the name of the project and the ticker symbol of its governance token, intended to power AI‑driven DAO activity on Solana.
On January 28, 2025, due to confusion with the established VC firm Andreessen Horowitz, ai16z officially rebranded to ElizaOS. Andreessen Horowitz had expressed concerns over brand mix‑ups. 
The DAO token continued to trade under the ticker AI16Z, until the rebrand. The rebrand was positioned as a step toward broader collaboration and expansion under a distinct identity. 
ElizaOS is an open source platform for building, deploying, and managing autonomous AI agents. It's available at https://github.com/elizaos/eliza or https://elizaos.ai`;

    return {
      data: [],
      values: [],
      text,
    };
  },
};
