import { type FormEvent, useCallback, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import {
  clearAudioReviewCache,
  getAudioReviewCacheUsage,
  getLlmConfig,
  saveLlmConfig,
  type AudioReviewCacheUsage,
  type LlmConfigDraft,
} from "../../settingsClient";
import {
  clearInspirationProfile,
  getInsightPreferences,
  type InsightPreferenceState,
} from "../../insightPreferencesClient";

export type SettingsCategory = "basic" | "inspiration" | "storage" | "updates" | "advanced";

const defaultAsrModels = ["iic/SenseVoiceSmall"];

export function useSettingsController() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>("basic");
  const [settingsDraft, setSettingsDraft] = useState<LlmConfigDraft>({
    outputDir: "",
    asrModel: "iic/SenseVoiceSmall",
  });
  const [settingsSupportedAsrModels, setSettingsSupportedAsrModels] = useState(defaultAsrModels);
  const [settingsConfigPath, setSettingsConfigPath] = useState("");
  const [audioReviewCacheUsage, setAudioReviewCacheUsage] =
    useState<AudioReviewCacheUsage | null>(null);
  const [settingsInsightPreferences, setSettingsInsightPreferences] =
    useState<InsightPreferenceState | null>(null);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const loadSettings = useCallback(async (successNotice?: string) => {
    setSettingsLoading(true);
    setSettingsNotice("正在读取配置。");
    try {
      const [config, audioCacheUsage, insightPreferences] = await Promise.all([
        getLlmConfig(),
        getAudioReviewCacheUsage(),
        getInsightPreferences().catch(() => null),
      ]);
      setSettingsDraft({
        outputDir: config.outputDir,
        asrModel: config.asrModel,
      });
      setSettingsSupportedAsrModels(
        config.supportedAsrModels.length > 0 ? config.supportedAsrModels : defaultAsrModels,
      );
      setSettingsConfigPath(config.configPath);
      setAudioReviewCacheUsage(audioCacheUsage);
      setSettingsInsightPreferences(insightPreferences);
      setSettingsNotice(
        successNotice ??
          (insightPreferences
            ? "已读取本机 ASR、输出目录与灵感档案设置。"
            : "已读取本机 ASR 与输出目录设置；灵感档案状态暂不可用。"),
      );
    } catch (error) {
      setSettingsNotice(`读取配置失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const openSettings = useCallback(async () => {
    setSettingsCategory("basic");
    setSettingsOpen(true);
    await loadSettings();
  }, [loadSettings]);

  const submitSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSettingsSaving(true);
      setSettingsNotice("");
      try {
        const config = await saveLlmConfig(settingsDraft);
        setSettingsDraft((current) => ({
          ...current,
          outputDir: config.outputDir,
          asrModel: config.asrModel,
        }));
        setSettingsSupportedAsrModels(
          config.supportedAsrModels.length > 0 ? config.supportedAsrModels : defaultAsrModels,
        );
        setSettingsConfigPath(config.configPath);
        setSettingsNotice("配置已保存，后续任务会使用新的 ASR 和输出目录设置。");
      } catch (error) {
        setSettingsNotice(`保存失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setSettingsSaving(false);
      }
    },
    [settingsDraft],
  );

  const updateSettingsDraft = useCallback((field: keyof LlmConfigDraft, value: string) => {
    setSettingsDraft((current) => ({ ...current, [field]: value }));
  }, []);

  const clearAudioReviewCacheFromSettings = useCallback(async () => {
    setSettingsSaving(true);
    setSettingsNotice("");
    try {
      const usage = await clearAudioReviewCache();
      setAudioReviewCacheUsage(usage);
      setSettingsNotice("音频播放缓存已清理；原始任务音频不会被删除。");
    } catch (error) {
      setSettingsNotice(`清理音频播放缓存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSettingsSaving(false);
    }
  }, []);

  const locateSettingsConfigFile = useCallback(async () => {
    if (!settingsConfigPath) {
      setSettingsNotice("配置文件路径尚未读取，请稍后再试。");
      return;
    }

    try {
      await revealItemInDir(settingsConfigPath);
      setSettingsNotice("已在文件管理器中定位本机配置文件。");
    } catch (error) {
      setSettingsNotice(`定位配置文件失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [settingsConfigPath]);

  const clearProfileFromSettings = useCallback(async () => {
    setSettingsSaving(true);
    setSettingsNotice("");
    try {
      const preferences = await clearInspirationProfile();
      setSettingsInsightPreferences(preferences);
      setSettingsNotice("已清空灵感档案；下次生成启发灵感时会重新询问。");
    } catch (error) {
      setSettingsNotice(`清空失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSettingsSaving(false);
    }
  }, []);

  return {
    settingsOpen,
    settingsCategory,
    settingsDraft,
    settingsSupportedAsrModels,
    settingsConfigPath,
    audioReviewCacheUsage,
    settingsInsightPreferences,
    settingsNotice,
    settingsLoading,
    settingsSaving,
    closeSettings,
    openSettings,
    loadSettings,
    submitSettings,
    setSettingsCategory,
    updateSettingsDraft,
    clearAudioReviewCacheFromSettings,
    clearProfileFromSettings,
    locateSettingsConfigFile,
  };
}

export type SettingsController = ReturnType<typeof useSettingsController>;
