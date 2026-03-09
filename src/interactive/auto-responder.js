/**
 * Auto-responder for interactive programs.
 *
 * Matches PTY output lines against configured prompt patterns
 * and returns the appropriate response to send back.
 * Supports both substring and regex matching.
 */

/**
 * Create an auto-responder function from config.
 *
 * @param {Array<{ prompt: string, response: string }>} autoResponses - Match rules.
 * @returns {(line: string) => string|null} Function that returns response or null.
 *
 * @example
 * const responder = createAutoResponder([
 *   { prompt: "Allow access", response: "yes" },
 *   { prompt: "Continue\\?", response: "y" },
 * ]);
 * responder("Claude wants to read .env. Allow access? (yes/no)"); // → "yes"
 * responder("Processing files...");                                // → null
 */
export function createAutoResponder(autoResponses) {
  if (!autoResponses || autoResponses.length === 0) {
    return () => null;
  }

  // Pre-compile patterns: try as regex first, fall back to substring
  const matchers = autoResponses.map((ar) => {
    let matcher;
    try {
      matcher = new RegExp(ar.prompt, 'i');
    } catch {
      // Invalid regex — use substring match
      matcher = null;
    }

    return {
      prompt: ar.prompt,
      response: ar.response,
      regex: matcher,
    };
  });

  return (line) => {
    for (const m of matchers) {
      const matches = m.regex
        ? m.regex.test(line)
        : line.includes(m.prompt);

      if (matches) {
        return m.response;
      }
    }
    return null;
  };
}
