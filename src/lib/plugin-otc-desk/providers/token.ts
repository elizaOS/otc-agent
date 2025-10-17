import { Provider } from "@elizaos/core";

export const tokenProvider: Provider = {
  name: "ELIZAOS_INFO",
  description:
    "[OPTIONAL] Historical information about the $elizaOS token and migration from $ai16z - use only when user specifically asks about elizaOS or ai16z",
  position: 99,
  dynamic: false,
  get: async () => {
    const text = `$elizaOS is a new redonimated cross-chain token which holders of $ai16z can redeem. Redemption is free and open forever.
This is a migration of $ai16z, which is a Solana SPL2022 extension token, to the new token which is a cross-chain token supported by Chainlink CCIP. The team had to do this for several reasons:
- $ai16z uses a closed-source daos.fun contract which enables additional token minting
- This lack of mint authority control unfortunately means that the token could not be listed on tier 1 exchanges like Binance and Coinbase
- $ai16z could not be be bridged to other chains, either, for the same reason
- The team received some feedback from Andreessen Horowitz (a16z) that while they appreciated our humor, it was getting confusing for their LPs
- Due to voting not being implemented yet on daos.fun, the team could not change the name as requested by a16z
- The project is primarily known for Eliza and the team wants to be taken seriously

The new $elizaOS token solves all of these problems. Users will be able to redeem $ai16z for $elizaOS, which will be featured on a major T1 exchange and available cross-chain at launch.

The $elizaOS token will be distributed as follows:

15% Sale - To raise capital to pay for listing fees, fund the project and thicken liquidity pool
10% Team - The team will receive 10% of the token, mostly in vested 4 year lockups
7.5% Liquidity Services - To provide liquidity for T1 exchanges, add cross-chain liquidity, and provide liquidity for the project
5% Ecosystem - To fund the ecosystem, incentivize marketing, growth and partnerships, and for use in future DeFi utility like staking,

This deal will not effect $degenai in any way. We will continue to support $degenai as a separate token and work to get it listed and bridged to other chains.`;

    return {
      text,
    };
  },
};
