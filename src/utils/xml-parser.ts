/**
 * Utility to parse XML from agent messages
 */

export interface OTCQuote {
  quoteId: string;
  tokenAmount: string;
  tokenAmountFormatted: string;
  tokenSymbol: string;
  apr: number;
  lockupMonths: number;
  lockupDays: number;
  pricePerToken: number;
  totalValueUsd: number;
  discountBps: number;
  discountPercent: number;
  discountUsd: number;
  finalPriceUsd: number;
  paymentCurrency: string;
  paymentAmount: string;
  paymentSymbol: string;
  ethPrice?: number;
  createdAt: string;
  expiresAt: string;
  expiresInSeconds: number;
  status?: string;
  message: string;
}

export interface QuoteAccepted {
  quoteId: string;
  offerId: string;
  transactionHash: string;
  tokenAmount: string;
  tokenAmountFormatted: string;
  tokenSymbol: string;
  tokenName: string;
  paidAmount: string;
  paymentCurrency: string;
  discountBps: number;
  discountPercent: number;
  totalSaved: string;
  finalPrice: string;
  status: string;
  timestamp: string;
  message: string;
}

/**
 * Extract XML from message text
 */
export function extractXMLFromMessage(messageText: string): string | null {
  // Try to find XML between comment markers first
  const commentMatch = messageText.match(
    /<!-- XML_START -->([\s\S]*?)<!-- XML_END -->/,
  );
  if (commentMatch && commentMatch[1]) {
    return commentMatch[1].trim();
  }

  // Try to find quote XML (supports lower and PascalCase)
  const quoteMatch = messageText.match(
    /<(quote|Quote)>([\s\S]*?)<\/(quote|Quote)>/,
  );
  if (quoteMatch && quoteMatch[0]) {
    return quoteMatch[0];
  }

  // Try to find quoteAccepted XML (supports lower and PascalCase)
  const acceptedMatch = messageText.match(
    /<(quoteAccepted|QuoteAccepted)>([\s\S]*?)<\/(quoteAccepted|QuoteAccepted)>/,
  );
  if (acceptedMatch && acceptedMatch[0]) {
    return acceptedMatch[0];
  }

  return null;
}

/**
 * Parse quote from XML
 */
export function parseOTCQuoteXML(xmlString: string): OTCQuote | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Check for parsing errors
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
      console.error("XML parsing error:", parseError.textContent);
      return null;
    }

    const getElementText = (tagName: string): string => {
      const elem = xmlDoc.getElementsByTagName(tagName)[0];
      return elem ? elem.textContent || "" : "";
    };

    const getElementNumber = (tagName: string): number => {
      const text = getElementText(tagName);
      return text ? parseFloat(text) : 0;
    };

    // Support both lowercase and PascalCase root tags
    const rootTag =
      xmlDoc.querySelector("Quote") || xmlDoc.querySelector("quote");
    if (!rootTag) {
      console.error("No quote root element found");
      return null;
    }

    return {
      quoteId: getElementText("quoteId"),
      tokenAmount: getElementText("tokenAmount"),
      tokenAmountFormatted: getElementText("tokenAmountFormatted"),
      tokenSymbol: getElementText("tokenSymbol"),
      apr: getElementNumber("apr"),
      lockupMonths: getElementNumber("lockupMonths"),
      lockupDays: getElementNumber("lockupDays"),
      pricePerToken:
        getElementNumber("pricePerToken") ||
        getElementNumber("priceUsdPerToken"),
      totalValueUsd: getElementNumber("totalValueUsd"),
      discountBps: getElementNumber("discountBps"),
      discountPercent: getElementNumber("discountPercent"),
      discountUsd: getElementNumber("discountUsd"),
      finalPriceUsd:
        getElementNumber("finalPriceUsd") || getElementNumber("discountedUsd"),
      paymentCurrency: getElementText("paymentCurrency"),
      paymentAmount: getElementText("paymentAmount"),
      paymentSymbol: getElementText("paymentSymbol"),
      ethPrice: getElementNumber("ethPrice") || undefined,
      createdAt: getElementText("createdAt"),
      expiresAt: getElementText("expiresAt"),
      expiresInSeconds: getElementNumber("expiresInSeconds"),
      status: getElementText("status") || undefined,
      message: getElementText("message"),
    };
  } catch (error) {
    console.error("Failed to parse quote XML:", error);
    return null;
  }
}

/**
 * Parse quote accepted XML
 */
export function parseQuoteAcceptedXML(xmlString: string): QuoteAccepted | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Check for parsing errors
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
      console.error("XML parsing error:", parseError.textContent);
      return null;
    }

    const getElementText = (tagName: string): string => {
      const elem = xmlDoc.getElementsByTagName(tagName)[0];
      return elem ? elem.textContent || "" : "";
    };

    const getElementNumber = (tagName: string): number => {
      const text = getElementText(tagName);
      return text ? parseFloat(text) : 0;
    };

    return {
      quoteId: getElementText("quoteId"),
      offerId: getElementText("offerId"),
      transactionHash: getElementText("transactionHash"),
      tokenAmount: getElementText("tokenAmount"),
      tokenAmountFormatted: getElementText("tokenAmountFormatted"),
      tokenSymbol: getElementText("tokenSymbol"),
      tokenName: getElementText("tokenName"),
      paidAmount: getElementText("paidAmount"),
      paymentCurrency: getElementText("paymentCurrency"),
      discountBps: getElementNumber("discountBps"),
      discountPercent: getElementNumber("discountPercent"),
      totalSaved: getElementText("totalSaved"),
      finalPrice: getElementText("finalPrice"),
      status: getElementText("status"),
      timestamp: getElementText("timestamp"),
      message: getElementText("message"),
    };
  } catch (error) {
    console.error("Failed to parse quote accepted XML:", error);
    return null;
  }
}

/**
 * Check if message contains a quote
 */
export function messageContainsQuote(messageText: string): boolean {
  return !!(
    messageText.includes("<quote>") ||
    messageText.includes("<quote>") ||
    messageText.includes("<quoteAccepted>") ||
    messageText.includes("<!-- XML_START -->")
  );
}

/**
 * Parse any XML type from message
 */
export function parseMessageXML(messageText: string): {
  type: "otc_quote" | "quote_accepted" | null;
  data: OTCQuote | QuoteAccepted | null;
} {
  const xmlString = extractXMLFromMessage(messageText);

  if (!xmlString) {
    return { type: null, data: null };
  }

  // Try parsing as quote
  if (xmlString.match(/<(quote|Quote)>/)) {
    const quote = parseOTCQuoteXML(xmlString);
    if (quote) {
      return { type: "otc_quote", data: quote };
    }
  }

  // Try parsing as quote accepted
  if (xmlString.match(/<(quoteAccepted|QuoteAccepted)>/)) {
    const accepted = parseQuoteAcceptedXML(xmlString);
    if (accepted) {
      return { type: "quote_accepted", data: accepted };
    }
  }

  return { type: null, data: null };
}

/**
 * Sanitizes agent message content by removing or extracting custom XML-like tags
 * that are not valid HTML elements. Prevents React from attempting to render
 * unknown tags like <thought>, <actions>, <providers>, and ensures only the
 * visible text is passed to the markdown renderer.
 *
 * Returns both sanitized visible text and any extracted meta blocks that
 * callers may optionally display (e.g., a collapsed "reasoning" panel).
 */
export function sanitizeAgentMessage(raw: string | null | undefined): {
  visibleText: string;
  meta: {
    thought?: string;
    actions?: string;
    providers?: string;
    text?: string;
  };
} {
  const input = typeof raw === "string" ? raw : "";

  // Normalize line endings
  let working = input.replace(/\r\n?/g, "\n");

  const meta: { [k: string]: string | undefined } = {};

  // First, try to extract a <response> block and parse nested tags within it
  const responseBlock = working.match(/<response>([\n\s\S]*?)<\/response>/i);
  if (responseBlock && responseBlock[1] !== undefined) {
    const inner = responseBlock[1].trim();
    meta.response = inner;
    // Remove the whole response from the working text
    working = working.replace(responseBlock[0], "");

    // Extract nested tags from response content
    const nestedExtract = (tag: string) => {
      const m = inner.match(
        new RegExp(`<${tag}>([\\n\\s\\S]*?)<\/${tag}>`, "i"),
      );
      if (m && m[1] !== undefined) meta[tag] = m[1].trim();
    };
    ["thought", "actions", "providers", "text"].forEach(nestedExtract);
  }

  // Helper to extract inner text of a single tag and remove it from working string
  const extractTag = (tag: string) => {
    const pattern = new RegExp(`<${tag}>([\n\s\S]*?)<\/${tag}>`, "i");
    const match = working.match(pattern);
    if (match && match[1] !== undefined) {
      meta[tag] = match[1].trim();
      // Remove the whole block from the visible text
      working = working.replace(match[0], "");
    }
  };

  // Known custom tags to extract
  [
    "thought",
    "actions",
    "providers",
    "instructions",
    "keys",
    "output",
    "text",
  ].forEach(extractTag);

  // Strip any remaining unknown angle-bracket blocks that look like custom tags
  // but keep known markdown/HTML tags intact by being conservative: remove tags that
  // are a single lowercase word without attributes, e.g., <foo>...</foo>
  const stripUnknownTags = (s: string) =>
    s.replace(/<([a-z]+)>[\s\S]*?<\/\1>/g, (m, tag) => {
      const allowList = new Set([
        // basic inline/blocks typically used by markdown-to-jsx
        "p",
        "em",
        "strong",
        "code",
        "pre",
        "ul",
        "ol",
        "li",
        "a",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "hr",
        "br",
        "img",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
      ]);
      return allowList.has(String(tag)) ? m : "";
    });
  working = stripUnknownTags(working);

  // Also remove any self-closing unknown tags like <foo/> safely
  const stripUnknownSelfClosing = (s: string) =>
    s.replace(/<([a-z]+)\s*\/>/g, (m, tag) => {
      const allowList = new Set(["br", "hr", "img"]);
      return allowList.has(String(tag)) ? m : "";
    });
  working = stripUnknownSelfClosing(working);

  // Trim excessive blank lines left over from removals
  working = working
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // If we still don't have top-level visible text, prefer explicit <text> meta.
  // If only <response> exists, strip tags inside it and use the remainder.
  let visibleText = "";
  if (meta.text && meta.text.trim().length > 0) {
    visibleText = meta.text.trim();
  } else if (working) {
    visibleText = working;
  } else if (meta.response) {
    const cleaned = stripUnknownSelfClosing(stripUnknownTags(meta.response));
    // After stripping unknown tags, also remove any known wrapper tags we extracted earlier just in case
    visibleText = cleaned
      .replace(/<(thought|actions|providers)>[\s\s\S]*?<\/\1>/gi, "")
      .trim();
  }

  return {
    visibleText,
    meta: {
      thought: meta.thought,
      actions: meta.actions,
      providers: meta.providers,
      text: meta.text ?? meta.response,
    },
  };
}
