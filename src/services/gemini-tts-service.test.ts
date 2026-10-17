import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeminiGenerateContentTtsRequest,
  buildGeminiTtsRequest,
  buildTtsPrompt,
  extractGeminiTtsInlineAudio,
  generateTtsContentWithRetry,
  getVerifiedGeminiTtsRuntimeAttempt,
  resetGeminiTtsRuntimeValidationState,
  shouldConvertGeminiTtsAudioForWhatsApp,
  validateGeminiTtsInlineAudioResponse,
} from "./gemini-tts-service.ts";

test.beforeEach(() => {
  resetGeminiTtsRuntimeValidationState();
});

test("Gemini TTS request contains only final reply text and voice settings", () => {
  const prompt = buildTtsPrompt({
    text: "Your order is confirmed.",
    userConfig: { bot_name: "Black Arrow" },
    effectiveGender: "female",
  });
  const request = buildGeminiTtsRequest({
    input: prompt,
    model: "gemini-3.1-flash-tts-preview",
    voice: "Kore",
  });

  assert.equal(request.model, "gemini-3.1-flash-tts-preview");
  assert.equal(request.input, "Your order is confirmed.");
  assert.deepEqual(request.response_format, { type: "audio" });
  assert.deepEqual(request.response_modalities, ["audio"]);
  assert.deepEqual(request.generation_config.speech_config, [{ voice: "Kore" }]);
  assert.equal((request as any).tools, undefined);
  assert.equal((request as any).system_instruction, undefined);
});

test("empty final reply text does not call Gemini TTS", async () => {
  let called = false;
  await assert.rejects(() => generateTtsContentWithRetry({
    localGenAI: {
      models: {
        generateContent: async () => {
          called = true;
          return {};
        },
      },
    },
    text: "   ",
    userConfig: {},
    effectiveGender: "male",
    selectedVoice: "Charon",
  }), /tts_empty_final_text/);
  assert.equal(called, false);
});

test("Gemini TTS response audio bytes are parsed correctly", () => {
  const response = {
    output_audio: {
      mime_type: "audio/wav",
      data: Buffer.from("hello-audio").toString("base64"),
    },
  };

  const audio = extractGeminiTtsInlineAudio(response);
  assert.ok(audio);
  assert.equal(audio?.mimeType, "audio/wav");
  assert.equal(audio?.bytes, Buffer.from("hello-audio").length);
  assert.equal(audio?.buffer.toString(), "hello-audio");
});

test("Gemini generateContent TTS request uses AUDIO response modalities and voiceName", () => {
  const request = buildGeminiGenerateContentTtsRequest({
    input: "Your delivery is confirmed.",
    model: "gemini-2.5-flash-preview-tts",
    voice: "Kore",
  });

  assert.equal(request.contents[0].parts[0].text, "Your delivery is confirmed.");
  assert.deepEqual(request.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(
    request.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    "Kore",
  );
});

test("unsupported TTS mime types trigger conversion while ogg/opus does not", () => {
  assert.equal(shouldConvertGeminiTtsAudioForWhatsApp("audio/wav"), true);
  assert.equal(shouldConvertGeminiTtsAudioForWhatsApp("audio/pcm"), true);
  assert.equal(shouldConvertGeminiTtsAudioForWhatsApp("audio/opus"), true);
  assert.equal(shouldConvertGeminiTtsAudioForWhatsApp("audio/ogg; codecs=opus"), false);
  assert.equal(shouldConvertGeminiTtsAudioForWhatsApp("audio/ogg"), false);
});

test("no-audio TTS response falls back to the next voice attempt once", async () => {
  const logs: string[] = [];
  const attempts: string[] = [];
  const response = {
    output_audio: {
      mime_type: "audio/ogg; codecs=opus",
      data: Buffer.from("audio-ok".repeat(120)).toString("base64"),
    },
  };

  const result = await generateTtsContentWithRetry({
    localGenAI: {
      interactions: {
        create: async (request: any) => {
          attempts.push(`${request.model}:${request.generation_config.speech_config[0].voice}`);
          if (attempts.length === 1) {
            return { outputs: [{ type: "text", text: "no audio" }] };
          }
          return response;
        },
      },
    },
    text: "Your appointment is confirmed.",
    userConfig: {},
    effectiveGender: "male",
    selectedVoice: "Fenrir",
    io: {
      emit: (_channel: string, event: any) => logs.push(String(event?.msg || "")),
    },
  });

  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts, [
    "gemini-3.1-flash-tts-preview:Fenrir",
    "gemini-2.5-flash-preview-tts:Kore",
  ]);
  assert.ok(extractGeminiTtsInlineAudio(result));
  assert.ok(logs.some((msg) => msg.includes("tts_model_voice_failed model=gemini-3.1-flash-tts-preview voice=Fenrir")));
  assert.ok(logs.some((msg) => msg.includes("tts_model_voice_fallback_attempt model=gemini-2.5-flash-preview-tts voice=Kore")));
  assert.ok(logs.some((msg) => msg.includes("tts_model_voice_success model=gemini-2.5-flash-preview-tts voice=Kore")));
  assert.deepEqual(getVerifiedGeminiTtsRuntimeAttempt(), {
    model: "gemini-2.5-flash-preview-tts",
    voice: "Kore",
  });
});

test("validation helper reports no-audio response safely without exposing provider details", () => {
  assert.deepEqual(validateGeminiTtsInlineAudioResponse({ outputs: [{ type: "text", text: "no audio" }] }), {
    success: false,
    bytes: 0,
    mime: "audio/unknown",
    reason: "tts_audio_missing",
  });
});

test("primary and fallback no-audio responses disable runtime voice attempts temporarily", async () => {
  const logs: string[] = [];
  await assert.rejects(() => generateTtsContentWithRetry({
    localGenAI: {
      interactions: {
        create: async () => ({ outputs: [{ type: "text", text: "no audio" }] }),
      },
    },
    text: "Please confirm your details.",
    userConfig: {},
    effectiveGender: "male",
    selectedVoice: "Fenrir",
    io: {
      emit: (_channel: string, event: any) => logs.push(String(event?.msg || "")),
    },
  }));

  logs.length = 0;
  await assert.rejects(() => generateTtsContentWithRetry({
    localGenAI: {
      interactions: {
        create: async () => ({ outputs: [{ type: "text", text: "still no audio" }] }),
      },
    },
    text: "Please confirm your details.",
    userConfig: {},
    effectiveGender: "male",
    selectedVoice: "Fenrir",
    io: {
      emit: (_channel: string, event: any) => logs.push(String(event?.msg || "")),
    },
  }), /no_verified_voice/);

  assert.ok(logs.some((msg) => msg.includes("tts_voice_runtime_disabled reason=no_verified_voice")));
});

test("Gemini TTS uses interactions.create and sends final reply text only", async () => {
  let seenRequest: any = null;
  const response = {
    output_audio: {
      mime_type: "audio/ogg; codecs=opus",
      data: Buffer.from("voice-audio".repeat(120)).toString("base64"),
    },
  };
  const result = await generateTtsContentWithRetry({
    localGenAI: {
      interactions: {
        create: async (request: any) => {
          seenRequest = request;
          return response;
        },
      },
      models: {
        generateContent: async () => {
          throw new Error("legacy_generate_content_should_not_be_called");
        },
      },
    },
    text: "Please confirm your delivery city.",
    userConfig: { bot_name: "Black Arrow" },
    effectiveGender: "female",
    selectedVoice: "Kore",
  });

  assert.ok(extractGeminiTtsInlineAudio(result));
  assert.equal(seenRequest.input, "Please confirm your delivery city.");
  assert.deepEqual(seenRequest.response_format, { type: "audio" });
  assert.deepEqual(seenRequest.generation_config.speech_config, [{ voice: "Kore" }]);
});

test("Gemini TTS falls back to REST interactions when SDK interactions.create is unavailable", async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
  const key = ("AIza" + "A".repeat(35));
  const result = await generateTtsContentWithRetry({
    localGenAI: {},
    text: "Please confirm your address.",
    userConfig: {},
    effectiveGender: "female",
    selectedVoice: "Kore",
    geminiApiKey: key,
    fetchFn: async (url, init) => {
      calls.push({
        url,
        headers: init?.headers || {},
        body: JSON.parse(String(init?.body || "{}")),
      });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          output_audio: {
            mime_type: "audio/ogg; codecs=opus",
            data: Buffer.from("rest-audio".repeat(120)).toString("base64"),
          },
        }),
      };
    },
  });

  assert.ok(extractGeminiTtsInlineAudio(result));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(calls[0].headers["x-goog-api-key"], key);
  assert.deepEqual(calls[0].body.response_format, { type: "audio" });
  assert.deepEqual(calls[0].body.generation_config.speech_config, [{ voice: "Kore" }]);
  assert.equal(calls[0].body.input, "Please confirm your address.");
});

test("REST fallback parses output_audio.data and does not expose API key in logs or thrown error", async () => {
  const logs: string[] = [];
  const key = ("AIza" + "B".repeat(29));
  const result = await generateTtsContentWithRetry({
    localGenAI: {},
    text: "Share your city please.",
    userConfig: {},
    effectiveGender: "female",
    selectedVoice: "Kore",
    geminiApiKey: key,
    io: {
      emit: (_channel: string, event: any) => logs.push(String(event?.msg || "")),
    },
    fetchFn: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output_audio: {
          mime_type: "audio/wav",
          data: Buffer.from("audio-from-rest").toString("base64"),
        },
      }),
    }),
  });

  assert.equal(extractGeminiTtsInlineAudio(result)?.buffer.toString(), "audio-from-rest");
  assert.ok(logs.some((msg) => msg.includes("tts_interactions_sdk_unavailable_using_rest=true")));
  assert.ok(logs.some((msg) => msg.includes("tts_rest_interactions_request_started model=gemini-3.1-flash-tts-preview voice=Kore")));
  assert.ok(logs.some((msg) => msg.includes("tts_rest_interactions_audio_received bytes=")));
  assert.equal(logs.some((msg) => msg.includes(key)), false);
});

test("Interactions REST no-audio falls back to generateContent without exposing secrets in logs", async () => {
  const logs: string[] = [];
  const promptText = "Please send the final approved message only.";
  const key = ("AIza" + "B".repeat(29));
  const customerJid = "contact-e4ed32210a80@example.invalid";
  const base64Audio = Buffer.from("generate-content-audio").toString("base64");
  const calls: Array<{ url: string; body: any }> = [];

  const result = await generateTtsContentWithRetry({
    localGenAI: {},
    text: promptText,
    userConfig: {},
    effectiveGender: "female",
    selectedVoice: "Fenrir",
    geminiApiKey: key,
    io: {
      emit: (_channel: string, event: any) => logs.push(String(event?.msg || "")),
    },
    fetchFn: async (url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      calls.push({ url, body });
      if (calls.length < 3) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            steps: [
              {
                model_output: {
                  output_audio: {
                    data: "abcd",
                    mime_type: "audio/wav",
                  },
                },
              },
            ],
            note: customerJid,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "audio/wav",
                      data: base64Audio,
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    },
  });

  assert.equal(extractGeminiTtsInlineAudio(result)?.buffer.toString(), "generate-content-audio");
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(calls[1].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.match(calls[2].url, /v1beta\/models\/gemini-2\.5-flash-preview-tts:generateContent$/);
  assert.deepEqual(calls[2].body.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(
    calls[2].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    "Kore",
  );
  assert.equal(calls[2].body.contents[0].parts[0].text, promptText);
  assert.ok(logs.some((msg) => msg.includes("tts_rest_interactions_response_shape keys=steps,note")));
  assert.ok(logs.some((msg) => msg.includes("tts_rest_interactions_output_audio_present=false")));
  assert.ok(logs.some((msg) => msg.includes("tts_rest_interactions_steps_count=1")));
  assert.ok(logs.some((msg) => msg.includes("tts_rest_interactions_audio_candidates=1")));
  assert.ok(logs.some((msg) => msg.includes("tts_rest_interactions_audio_bytes=0")));
  assert.equal(logs.some((msg) => msg.includes(key)), false);
  assert.equal(logs.some((msg) => msg.includes(promptText)), false);
  assert.equal(logs.some((msg) => msg.includes(customerJid)), false);
  assert.equal(logs.some((msg) => msg.includes(base64Audio)), false);
});

test("Interactions parser finds audio from nested output and step shapes", () => {
  const outputAudio = Buffer.from("nested-output-audio").toString("base64");
  const stepAudio = Buffer.from("nested-step-audio").toString("base64");

  assert.equal(
    extractGeminiTtsInlineAudio({
      outputs: [
        {
          output_audio: {
            mime_type: "audio/wav",
            data: outputAudio,
          },
        },
      ],
    })?.buffer.toString(),
    "nested-output-audio",
  );
  assert.equal(
    extractGeminiTtsInlineAudio({
      steps: [
        {
          model_output: {
            output_audio: {
              mime_type: "audio/wav",
              data: stepAudio,
            },
          },
        },
      ],
    })?.buffer.toString(),
    "nested-step-audio",
  );
});

test("generateContent REST parses inlineData.data and inline_data.data", () => {
  const inlineData = Buffer.from("inline-data-audio").toString("base64");
  const inlineDataSnake = Buffer.from("inline-data-snake-audio").toString("base64");

  assert.equal(
    extractGeminiTtsInlineAudio({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/wav",
                  data: inlineData,
                },
              },
            ],
          },
        },
      ],
    })?.buffer.toString(),
    "inline-data-audio",
  );
  assert.equal(
    extractGeminiTtsInlineAudio({
      candidates: [
        {
          content: {
            parts: [
              {
                inline_data: {
                  mime_type: "audio/wav",
                  data: inlineDataSnake,
                },
              },
            ],
          },
        },
      ],
    })?.buffer.toString(),
    "inline-data-snake-audio",
  );
});

test("missing interactions.create no longer throws cannot_read_properties_of_undefined_reading_create", async () => {
  await assert.rejects(() => generateTtsContentWithRetry({
    localGenAI: {},
    text: "Please confirm.",
    userConfig: {},
    effectiveGender: "female",
    selectedVoice: "Kore",
    geminiApiKey: "",
  }), /tts_rest_api_key_unavailable/);
});
