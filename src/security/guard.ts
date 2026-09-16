export interface ThreatInspectionResult {
  isAllowed: boolean;
  threatScore: number; // 0 to 100
  flaggedPatterns: string[];
  reason?: string;
}

export class PromptGuard {
  private static readonly INJECTION_RULES: { name: string; pattern: RegExp; weight: number }[] = [
    {
      name: "system_override",
      pattern: /(ignore|disregard|forget|bypass)\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules|directives)/i,
      weight: 60,
    },
    {
      name: "roleplay_jailbreak",
      pattern: /(you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+(DAN|unfiltered|jailbroken|evil|unrestricted)/i,
      weight: 55,
    },
    {
      name: "delimiter_injection",
      pattern: /\[\/?(SYSTEM|ADMIN|ASSISTANT|ROOT)\]/i,
      weight: 40,
    },
    {
      name: "instruction_extraction",
      pattern: /(show|display|reveal|print|repeat)\s+(your\s+)?(system\s+prompt|initial\s+instructions|core\s+directives)/i,
      weight: 45,
    },
    {
      name: "base64_payload_marker",
      pattern: /(eval|execute|run)\s*\(\s*atob\s*\(/i,
      weight: 70,
    },
  ];

  /**
   * Inspects prompt text and evaluates threat score.
   * Threshold default is 50.
   */
  inspect(promptText: string, threshold: number = 50): ThreatInspectionResult {
    let threatScore = 0;
    const flaggedPatterns: string[] = [];

    for (const rule of PromptGuard.INJECTION_RULES) {
      if (rule.pattern.test(promptText)) {
        threatScore += rule.weight;
        flaggedPatterns.push(rule.name);
      }
    }

    // Heuristic: Check for high repetition of invisible/zero-width chars or control characters
    const controlChars = (promptText.match(/[\u200B-\u200D\uFEFF]/g) || []).length;
    if (controlChars > 5) {
      threatScore += 30;
      flaggedPatterns.push("invisible_steganography");
    }

    const isAllowed = threatScore < threshold;
    return {
      isAllowed,
      threatScore: Math.min(100, threatScore),
      flaggedPatterns,
      reason: isAllowed ? undefined : `Prompt flagged for potential injection: ${flaggedPatterns.join(", ")}`,
    };
  }
}
