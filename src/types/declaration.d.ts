import "@elizaos/core";

declare module "@elizaos/core" {
  // Extend ServiceType enum with custom service types using namespace merging
  export namespace ServiceType {
    const QUOTE_SERVICE: "QUOTE_SERVICE";
  }
}
