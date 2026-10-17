import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "ffmpeg-static";
import { PassThrough, Readable } from "node:stream";

const FFMPEG_PATH = typeof ffmpegInstaller === "string" ? ffmpegInstaller : "";

if (FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
}

function clean(value: any, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizeGeminiAudioMimeType(value: any) {
  const raw = clean(value, 160).toLowerCase();
  if (!raw) return "audio/ogg";
  if (raw.startsWith("audio/ogg")) return "audio/ogg";
  if (raw === "audio/opus" || raw.startsWith("application/ogg")) return "audio/ogg";
  if (raw.startsWith("audio/wav") || raw.startsWith("audio/x-wav")) return "audio/wav";
  if (raw.startsWith("audio/mpeg") || raw.startsWith("audio/mp3")) return "audio/mpeg";
  return raw.split(";")[0] || "audio/ogg";
}

export function shouldRetryGeminiAudioWithConversion(value: any) {
  const mime = normalizeGeminiAudioMimeType(value);
  return mime === "audio/ogg";
}

export function isGeminiAudioConversionAvailable() {
  return Boolean(FFMPEG_PATH);
}

export async function convertAudioBufferForGemini(input: {
  buffer: Buffer;
  mimeType?: string;
}) {
  if (!input.buffer?.length) throw new Error("missing_audio_buffer");
  if (!FFMPEG_PATH) throw new Error("ffmpeg_unavailable");

  return new Promise<{ buffer: Buffer; mimeType: "audio/wav" }>((resolve, reject) => {
    const inputStream = new Readable({
      read() {
        this.push(input.buffer);
        this.push(null);
      },
    });
    const outputStream = new PassThrough();
    const chunks: Buffer[] = [];

    outputStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    outputStream.on("end", () => {
      const converted = Buffer.concat(chunks);
      if (!converted.length) return reject(new Error("ffmpeg_empty_output"));
      resolve({ buffer: converted, mimeType: "audio/wav" });
    });
    outputStream.on("error", reject);

    ffmpeg(inputStream)
      .inputFormat("ogg")
      .audioCodec("pcm_s16le")
      .audioChannels(1)
      .audioFrequency(16000)
      .format("wav")
      .on("error", reject)
      .pipe(outputStream, { end: true });
  });
}
