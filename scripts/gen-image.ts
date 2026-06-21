#!/usr/bin/env bun
/**
 * Generate an image with Google's "nano banana" (gemini-2.5-flash-image).
 * Needs GEMINI_API_KEY (or GOOGLE_API_KEY) in .env — get one at
 * https://aistudio.google.com/apikey
 *
 *   bun scripts/gen-image.ts "<prompt>" [out.png]
 */
const KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!KEY) {
	console.error("Set GEMINI_API_KEY in .env (https://aistudio.google.com/apikey)");
	process.exit(1);
}

const prompt = process.argv[2];
const out = process.argv[3] ?? "coding-harness.png";
if (!prompt) {
	console.error('usage: bun scripts/gen-image.ts "<prompt>" [out.png]');
	process.exit(1);
}

const MODEL = "gemini-2.5-flash-image";
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const res = await fetch(url, {
	method: "POST",
	headers: { "content-type": "application/json", "x-goog-api-key": KEY },
	body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
});
if (!res.ok) {
	console.error(`${res.status} ${res.statusText}\n${await res.text()}`);
	process.exit(1);
}
const data = (await res.json()) as {
	candidates?: { content?: { parts?: { inlineData?: { data: string } }[] } }[];
};
const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
if (!part?.inlineData) {
	console.error("no image in response:\n", JSON.stringify(data, null, 2).slice(0, 800));
	process.exit(1);
}
await Bun.write(out, Buffer.from(part.inlineData.data, "base64"));
console.log(`wrote ${out}`);
