import { describe, expect, test } from "vitest";
import {
  getLlmConfig,
  saveLlmConfig,
  type SettingsCommandRunner,
} from "./settingsClient";

describe("settings client", () => {
  test("loads sanitized LLM config from Tauri", async () => {
    const calls: Array<{ command: string; args: unknown }> = [];
    const runner: SettingsCommandRunner = async (command, args) => {
      calls.push({ command, args });
      return {
        provider: "openai_compatible",
        base_url: "https://llm.example/v1",
        model: "demo-model",
        timeout_seconds: "30",
        output_dir: "D:\\FrameQ\\outputs",
        asr_model: "iic/SenseVoiceSmall",
        supported_asr_models: [
          "iic/SenseVoiceSmall",
          "Qwen/Qwen3-ASR-0.6B",
        ],
        has_api_key: true,
      };
    };

    const config = await getLlmConfig(runner);

    expect(calls).toEqual([{ command: "get_llm_config", args: {} }]);
    expect(config).toEqual({
      provider: "openai_compatible",
      baseUrl: "https://llm.example/v1",
      model: "demo-model",
      timeoutSeconds: "30",
      outputDir: "D:\\FrameQ\\outputs",
      asrModel: "iic/SenseVoiceSmall",
      supportedAsrModels: [
        "iic/SenseVoiceSmall",
        "Qwen/Qwen3-ASR-0.6B",
      ],
      hasApiKey: true,
    });
  });

  test("saves LLM config through Tauri", async () => {
    const calls: Array<{ command: string; args: unknown }> = [];
    const runner: SettingsCommandRunner = async (command, args) => {
      calls.push({ command, args });
      return {
        provider: "openai_compatible",
        base_url: "https://llm.example/v1",
        model: "demo-model",
        timeout_seconds: "30",
        output_dir: "D:\\FrameQ\\outputs",
        asr_model: "Qwen/Qwen3-ASR-0.6B",
        supported_asr_models: [
          "iic/SenseVoiceSmall",
          "Qwen/Qwen3-ASR-0.6B",
        ],
        has_api_key: true,
      };
    };

    const config = await saveLlmConfig(
      {
        baseUrl: "https://llm.example/v1",
        apiKey: "secret",
        model: "demo-model",
        timeoutSeconds: "30",
        outputDir: "D:\\FrameQ\\outputs",
        asrModel: "Qwen/Qwen3-ASR-0.6B",
      },
      runner,
    );

    expect(calls).toEqual([
      {
        command: "save_llm_config",
        args: {
          config: {
            base_url: "https://llm.example/v1",
            api_key: "secret",
            model: "demo-model",
            timeout_seconds: "30",
            output_dir: "D:\\FrameQ\\outputs",
            asr_model: "Qwen/Qwen3-ASR-0.6B",
          },
        },
      },
    ]);
    expect(config.hasApiKey).toBe(true);
  });

  test("maps Tauri errors to settings errors", async () => {
    const runner: SettingsCommandRunner = async () => {
      throw new Error("LLM API key is required");
    };

    await expect(
      saveLlmConfig(
        {
          baseUrl: "https://llm.example/v1",
          apiKey: "",
          model: "demo-model",
          timeoutSeconds: "30",
          outputDir: "",
          asrModel: "iic/SenseVoiceSmall",
        },
        runner,
      ),
    ).rejects.toThrow("LLM API key is required");
  });
});
