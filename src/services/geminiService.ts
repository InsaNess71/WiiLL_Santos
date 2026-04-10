import { GoogleGenAI, Type } from "@google/genai";

// Initialize the Gemini API client
// Note: In this specific environment, process.env.GEMINI_API_KEY is provided directly.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ModerationResult {
  isApproved: boolean;
  reason?: string;
}

/**
 * Evaluates a confession text using Gemini to determine if it violates safety guidelines.
 * Blocks doxxing, real-world violence/threats, and hate speech.
 * Allows emotional venting and common slang/profanity if not directed as hate speech.
 */
export async function moderateConfession(text: string): Promise<ModerationResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a content moderator for an anonymous confession app.
Your job is to analyze the following confession and determine if it should be BLOCKED or APPROVED.

BLOCK the confession ONLY if it contains:
1. Doxxing / PII: Full names, phone numbers, addresses, or specific identifying information of real people.
2. Real-world Violence / Threats: Credible threats of physical violence, murder, or self-harm.
3. Hate Speech: Severe prejudice or attacks against protected groups (race, religion, sexual orientation, etc.).

APPROVE the confession if:
- It is just an emotional vent, even if it contains anger or frustration.
- It contains common profanity or slang (e.g., "pqp", "merda", "foda"), as long as it's not used for hate speech.
- It discusses relationships, breakups, or personal secrets without exposing specific people's identities.

Confession to analyze:
"${text}"

Return a JSON object with two properties:
- "isApproved": boolean (true if approved, false if blocked)
- "reason": string (If blocked, briefly explain why in Portuguese. If approved, leave empty or say "OK")`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isApproved: {
              type: Type.BOOLEAN,
              description: "True if the confession is safe to publish, false if it violates guidelines.",
            },
            reason: {
              type: Type.STRING,
              description: "Explanation of why it was blocked, in Portuguese.",
            },
          },
          required: ["isApproved"],
        },
      },
    });

    const jsonStr = response.text?.trim();
    if (jsonStr) {
      const result = JSON.parse(jsonStr);
      return {
        isApproved: result.isApproved,
        reason: result.reason,
      };
    }
    
    // Fallback to approved if parsing fails
    return { isApproved: true };
  } catch (error) {
    console.error("Error during AI moderation:", error);
    // In case of API failure, we might want to approve to not block users, 
    // or block to be safe. Let's approve by default if the AI is down.
    return { isApproved: true };
  }
}

/**
 * Generates an empathetic response from the "Virtual Counselor" AI.
 */
export async function generateCounselorResponse(
  confessionText: string,
  previousComments: { text: string; isAI: boolean }[]
): Promise<string> {
  try {
    const history = previousComments.map(c => `${c.isAI ? 'Conselheiro' : 'Usuário'}: ${c.text}`).join('\n');
    
    const prompt = `Você é um usuário de um app de desabafos anônimos respondendo a alguém que precisa de ajuda. 
Sua missão é dar um conselho como se fosse um amigo próximo conversando no WhatsApp ou num fórum.

Regras de tom de voz:
- ESQUEÇA que você é uma IA. Aja 100% como um humano empático.
- Use linguagem casual, do dia a dia, bem "galera". Pode usar expressões comuns do Brasil (ex: "pô", "cara", "nossa", "complicado", "foda", "sinto muito mesmo").
- Seja direto, sincero e acolhedor, de igual para igual.
- NUNCA seja formal, clínico ou pareça um terapeuta robótico.
- Seja conciso (máximo de 2 parágrafos curtos).
- Não use formatação markdown exagerada, apenas texto simples.

Confissão original:
"${confessionText}"

Histórico da conversa nos comentários:
${history}

Responda diretamente ao usuário seguindo esse tom de amigo:`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text?.trim() || "Sinto muito, não consegui formular uma resposta agora. Estou aqui com você.";
  } catch (error) {
    console.error("Error generating counselor response:", error);
    return "Sinto muito, estou com dificuldades técnicas no momento, mas saiba que você não está sozinho.";
  }
}
