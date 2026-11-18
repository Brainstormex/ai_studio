export const LANGUAGE_TO_BCP47: Record<string, string> = {
  en: "en-US",
  "en-us": "en-US",
  "en-gb": "en-GB",
  "en-in": "en-IN",
  hi: "hi-IN",
  "hi-in": "hi-IN",
  mr: "mr-IN",
  "mr-in": "mr-IN",
  gu: "gu-IN",
  "gu-in": "gu-IN",
  ta: "ta-IN",
  "ta-in": "ta-IN",
  te: "te-IN",
  "te-in": "te-IN",
  bn: "bn-IN",
  "bn-in": "bn-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  ur: "ur-IN",
};

export const DEFAULT_CHIRP3_VOICE = "Charon";

export function toBcp47(language: string): string {
  const key = language.trim().toLowerCase();
  if (LANGUAGE_TO_BCP47[key]) return LANGUAGE_TO_BCP47[key];
  if (key.includes("-") && key.length >= 5) {
    const [lang, region] = key.split("-");
    return `${lang}-${region.toUpperCase()}`;
  }
  return LANGUAGE_TO_BCP47[key] ?? "en-US";
}

export function chirp3VoiceName(languageCode: string, voice = DEFAULT_CHIRP3_VOICE): string {
  return `${toBcp47(languageCode)}-Chirp3-HD-${voice}`;
}
