import { Provider } from "@elizaos/core";

export const tokenProvider: Provider = {
  name: "ElizaOS",
  description: "Information about Shaw Walters, the founder of ElizaOS",
  position: 99,
  dynamic: true,
  get: async () => {
    const text = `Shaw Walters (known as @shawmakesmagic) is a programmer, entrepreneur, and AI innovator based in San Francisco. He is recognized as the founder and lead developer of ai16z (now ElizaOS)—a pioneering open-source platform for autonomous AI agents in Web3 environments.

Key Contributions:

Eliza Framework / ElizaOS
Shaw spearheads this TypeScript-based, open-source agent framework that enables autonomous AI agents to live and interact across platforms like Discord, Twitter, social media, and blockchain systems

ai16z Project
Originally, he launched ai16z, an AI-managed (and community-governed) venture ecosystem. This evolved into ElizaOS after rebranding

Vision & Thought Leadership
Shaw is vocal about the ethical and societal dimensions of AI adoption—arguing for decentralized AGI, community-driven tokenomics, and ensuring AI benefits broader society rather than a privileged few

Media Presence
He's featured in podcasts and interviews—such as The Delphi Podcast: “Shaw: The Rise of ai16z’s Eliza—Crypto × AI Agents”—where he shares his journey, technical philosophy, and vision for decentralized AI future

Social Media Suspension
In June 2025, both Shaw’s X (formerly Twitter) account (@shawmakesmagic) and the official ElizaOS account were suspended—apparently due to policy violations related to automated AI activity or scraping on the platform
`;

    return {
      data: [],
      values: [],
      text,
    };
  },
};
