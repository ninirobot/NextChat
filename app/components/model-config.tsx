import {
  ServiceProvider,
  getNvidiaModelConfig,
  ReasoningEffort,
} from "@/app/constant";
import { ModalConfigValidator, ModelConfig } from "../store";

import Locale from "../locales";
import { InputRange } from "./input-range";
import { ListItem, Select, showToast } from "./ui-lib";
import { useAllModels } from "../utils/hooks";
import { getClientConfig } from "../config/client";
import { DEFAULT_SEARCH_PROVIDER } from "@/app/websearch/constants";
import type { WebSearchProviderName } from "@/app/websearch/types";
import { useAppConfig, useAccessStore } from "../store";
import { groupBy } from "lodash-es";
import styles from "./model-config.module.scss";
import { getModelProvider, isLiveModel, getLiveModels } from "../utils/model";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

/**
 * 滑块用局部 state 承接拖动、停止 120ms 后才写 store。
 *
 * 直接逐像素写 store 会明显卡顿：`store.update` 深拷贝整个配置对象，
 * 并触发所有 `useAppConfig` 订阅者（含 Chat 这类大组件）重渲染。
 */
function WebSearchRange(props: {
  title: string;
  subTitle: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fallback: number;
  onChange: (value: number) => void;
}) {
  const [local, setLocal] = useState(props.value);
  const commit = useDebouncedCallback(props.onChange, 120);

  // 外部改动（如输入框开关）时同步回本地
  useEffect(() => setLocal(props.value), [props.value]);

  return (
    <ListItem title={props.title} subTitle={props.subTitle}>
      <InputRange
        aria={props.title}
        value={String(local)}
        min={String(props.min)}
        max={String(props.max)}
        step={String(props.step)}
        onChange={(e) => {
          const v = e.currentTarget.valueAsNumber;
          const next = Number.isFinite(v)
            ? Math.max(props.min, Math.min(props.max, v))
            : props.fallback;
          setLocal(next);
          commit(next);
        }}
      />
    </ListItem>
  );
}

/** 联网搜索设置（开关 + 服务商 + 条数 + 摘要长度），只订阅 webSearch 切片。 */
function WebSearchSettings() {
  const webSearch = useAppConfig((s) => s.webSearch);
  const set = (updater: (ws: any) => void) =>
    useAppConfig.getState().update((c) => {
      if (c.webSearch) updater(c.webSearch);
    });

  // 服务端只下发「有没有配 Key」的布尔（meta 标签里，不含 Key 本身），
  // 读一次就够 —— meta 在页面生命周期内不会变。
  const [hasKey] = useState(
    () => getClientConfig()?.webSearch ?? { brave: false, jina: false },
  );
  const provider: WebSearchProviderName =
    webSearch?.searchProvider ?? DEFAULT_SEARCH_PROVIDER;

  return (
    <>
      <ListItem
        title={Locale.Settings.WebSearch.Enable.Title}
        subTitle={Locale.Settings.WebSearch.Enable.SubTitle}
      >
        <input
          type="checkbox"
          checked={!!webSearch?.enabled}
          onChange={(e) => {
            const next = e.currentTarget.checked;
            set((ws) => (ws.enabled = next));
            // 与对话页 toggleWebSearch 对齐：无 Key 开启时当场提示，
            // 避免用户在设置里静默打开后，到对话里才看到模型只回一段“搜索不可用”。
            if (next && !hasKey[provider]) {
              showToast(
                provider === "jina"
                  ? Locale.Settings.WebSearch.NoKey.Jina
                  : Locale.Settings.WebSearch.NoKey.Brave,
              );
            }
          }}
        />
      </ListItem>
      <ListItem
        title={Locale.Settings.WebSearch.Provider.Title}
        subTitle={Locale.Settings.WebSearch.Provider.SubTitle}
      >
        <Select
          aria-label={Locale.Settings.WebSearch.Provider.Title}
          value={provider}
          onChange={(e) =>
            set((ws) => (ws.searchProvider = e.currentTarget.value))
          }
        >
          <option value="brave">
            {Locale.Settings.WebSearch.Provider.Brave}
          </option>
          <option value="jina">
            {Locale.Settings.WebSearch.Provider.Jina}
          </option>
        </Select>
      </ListItem>
      {!hasKey[provider] && (
        <ListItem
          title={Locale.Settings.WebSearch.NoKey.Title}
          subTitle={
            provider === "jina"
              ? Locale.Settings.WebSearch.NoKey.Jina
              : Locale.Settings.WebSearch.NoKey.Brave
          }
        />
      )}
      <WebSearchRange
        title={Locale.Settings.WebSearch.MaxResults.Title}
        subTitle={Locale.Settings.WebSearch.MaxResults.SubTitle}
        value={webSearch?.maxResults ?? 5}
        min={1}
        max={20}
        step={1}
        fallback={5}
        onChange={(v) => set((ws) => (ws.maxResults = v))}
      />
      <WebSearchRange
        title={Locale.Settings.WebSearch.SnippetMaxChars.Title}
        subTitle={Locale.Settings.WebSearch.SnippetMaxChars.SubTitle}
        value={webSearch?.snippetMaxChars ?? 800}
        min={200}
        max={4000}
        step={200}
        fallback={800}
        onChange={(v) => set((ws) => (ws.snippetMaxChars = v))}
      />
      <WebSearchRange
        title={Locale.Settings.WebSearch.FetchMaxChars.Title}
        subTitle={Locale.Settings.WebSearch.FetchMaxChars.SubTitle}
        value={webSearch?.fetchMaxChars ?? 5000}
        min={1000}
        max={200000}
        step={1000}
        fallback={5000}
        onChange={(v) => set((ws) => (ws.fetchMaxChars = v))}
      />
    </>
  );
}

export function ModelConfigList(props: {
  modelConfig: ModelConfig;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
  isLiveMode?: boolean;
}) {
  const allModels = useAllModels();
  const config = useAppConfig();
  const accessStore = useAccessStore();
  const liveModels = getLiveModels(
    [config.liveModels, accessStore.liveModels].join(","),
  );
  // Live 模式下只显示 Live 模型；普通模式过滤掉 Live 模型
  const groupModels = groupBy(
    allModels.filter(
      (v) =>
        v.available &&
        (props.isLiveMode
          ? isLiveModel(v.name, liveModels)
          : !isLiveModel(v.name, liveModels)),
    ),
    "provider.providerName",
  );
  const value = `${props.modelConfig.model}@${props.modelConfig?.providerName}`;
  const compressModelValue = `${props.modelConfig.compressModel}@${props.modelConfig?.compressProviderName}`;
  const isCurrentLiveModel = isLiveModel(props.modelConfig.model, liveModels);

  return (
    <>
      <ListItem title={Locale.Settings.Model}>
        <Select
          aria-label={Locale.Settings.Model}
          value={value}
          align="left"
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.model = ModalConfigValidator.model(model);
              config.providerName = providerName as ServiceProvider;
              const thinking = getNvidiaModelConfig(model).thinking;
              if (
                thinking &&
                (thinking.mechanism === "reasoning_effort" ||
                  thinking.mechanism === "chat_template_kwargs")
              ) {
                config.reasoning_effort = thinking.default;
              }
            });
          }}
        >
          {Object.keys(groupModels).map((providerName, index) => (
            <optgroup label={providerName} key={index}>
              {groupModels[providerName].map((v, i) => (
                <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                  {v.displayName}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </ListItem>
      <ListItem
        title={Locale.Settings.Temperature.Title}
        subTitle={Locale.Settings.Temperature.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.Temperature.Title}
          value={props.modelConfig.temperature?.toFixed(1)}
          min="0"
          max="2" // lets limit it to 0-1
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.temperature = ModalConfigValidator.temperature(
                  e.currentTarget.valueAsNumber,
                )),
            );
          }}
        ></InputRange>
      </ListItem>
      <ListItem
        title={Locale.Settings.TopP.Title}
        subTitle={Locale.Settings.TopP.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.TopP.Title}
          value={(props.modelConfig.top_p ?? 1).toFixed(2)}
          min="0"
          max="1"
          step="0.05"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.top_p = ModalConfigValidator.top_p(
                  e.currentTarget.valueAsNumber,
                )),
            );
          }}
        ></InputRange>
      </ListItem>
      <ListItem
        title={Locale.Settings.MaxTokens.Title}
        subTitle={Locale.Settings.MaxTokens.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.MaxTokens.Title}
          value={props.modelConfig.max_tokens}
          min="1024"
          max="1048576"
          step="1024"
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.max_tokens = ModalConfigValidator.max_tokens(
                  e.currentTarget.valueAsNumber,
                )),
            )
          }
        ></InputRange>
      </ListItem>
      {/* Gemini 2.5 Flash Thinking Budget */}
      {!isCurrentLiveModel &&
        props.modelConfig.model.includes("gemini") &&
        props.modelConfig.model.includes("2.5") &&
        props.modelConfig.model.includes("flash") && (
          <ListItem
            title={Locale.Settings.GeminiFlashThinkingBudget.Title}
            subTitle={
              props.modelConfig.gemini_thinking_budget === -1
                ? "Auto (Dynamic)"
                : `${props.modelConfig.gemini_thinking_budget} tokens (0-24576 or -1 for auto)`
            }
          >
            <InputRange
              aria={Locale.Settings.GeminiFlashThinkingBudget.Title}
              value={props.modelConfig.gemini_thinking_budget}
              min="-1"
              max="24576"
              step="1"
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.gemini_thinking_budget =
                      ModalConfigValidator.gemini_thinking_budget(
                        e.currentTarget.valueAsNumber,
                      )),
                )
              }
            ></InputRange>
          </ListItem>
        )}

      {/* Gemini 2.5 Pro Thinking Budget */}
      {!isCurrentLiveModel &&
        props.modelConfig.model.includes("gemini") &&
        props.modelConfig.model.includes("2.5") &&
        props.modelConfig.model.includes("pro") && (
          <ListItem
            title={Locale.Settings.GeminiProThinkingBudget.Title}
            subTitle={
              props.modelConfig.gemini_thinking_budget === -1
                ? "Auto (Dynamic)"
                : props.modelConfig.gemini_thinking_budget < 128
                  ? "Invalid: must be ≥128 or -1"
                  : `${props.modelConfig.gemini_thinking_budget} tokens (128-32768 or -1 for auto)`
            }
          >
            <InputRange
              aria={Locale.Settings.GeminiProThinkingBudget.Title}
              value={
                props.modelConfig.gemini_thinking_budget === -1 ||
                props.modelConfig.gemini_thinking_budget < 128
                  ? -1
                  : props.modelConfig.gemini_thinking_budget
              }
              min="-1"
              max="32768"
              step="1"
              onChange={(e) => {
                const val = e.currentTarget.valueAsNumber;
                props.updateConfig((config) => {
                  // For Pro, enforce minimum of 128 unless it's -1
                  if (val !== -1 && val >= 0 && val < 128) {
                    config.gemini_thinking_budget = 128;
                  } else {
                    config.gemini_thinking_budget =
                      ModalConfigValidator.gemini_thinking_budget(val);
                  }
                });
              }}
            ></InputRange>
          </ListItem>
        )}

      {/* Gemini 3 / Gemma 4 Thinking Level */}
      {!isCurrentLiveModel &&
        (props.modelConfig.model.includes("gemini-3") ||
          props.modelConfig.model.includes("gemma-4")) && (
          <ListItem
            title={Locale.Settings.ThinkingLevel?.Title || "Thinking Level"}
            subTitle={
              Locale.Settings.ThinkingLevel?.SubTitle ||
              "Control the depth of thought"
            }
          >
            <Select
              value={props.modelConfig.thinking_level || "high"}
              onChange={(e) => {
                props.updateConfig((config) => {
                  config.thinking_level = e.currentTarget.value;
                });
              }}
            >
              {props.modelConfig.model.includes("gemma-4") ? (
                <>
                  <option value="minimal">Minimal</option>
                  <option value="high">High</option>
                </>
              ) : props.modelConfig.model.includes("flash") ? (
                <>
                  <option value="minimal">Minimal</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="high">High</option>
                </>
              ) : (
                <>
                  <option value="low">Low</option>
                  <option value="high">High</option>
                </>
              )}
            </Select>
          </ListItem>
        )}

      {/* LongCat and other Thinking models */}
      {(props.modelConfig.model.toLowerCase().includes("thinking") ||
        (props.modelConfig.model.includes("longcat") &&
          !props.modelConfig.model.toLowerCase().includes("longcat-2.0"))) &&
        !props.modelConfig.model.includes("2.5") &&
        !props.modelConfig.model.includes("3") && (
          <ListItem
            title={Locale.Settings.ThinkingBudget.Title}
            subTitle={Locale.Settings.ThinkingBudget.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.ThinkingBudget.Title}
              value={props.modelConfig.thinking_budget}
              min="1024"
              max="8192"
              step="1024"
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.thinking_budget =
                      ModalConfigValidator.thinking_budget(
                        e.currentTarget.valueAsNumber,
                      )),
                )
              }
            ></InputRange>
          </ListItem>
        )}

      {/* Per-model Thinking control, driven by NVIDIA_MODEL_CONFIG */}
      {(() => {
        const thinking = getNvidiaModelConfig(props.modelConfig.model).thinking;
        if (!thinking) return null;

        if (
          thinking.mechanism === "reasoning_effort" ||
          thinking.mechanism === "chat_template_kwargs"
        ) {
          return (
            <ListItem
              title={Locale.Settings.ReasoningEffort.Title}
              subTitle={Locale.Settings.ReasoningEffort.SubTitle}
            >
              <Select
                value={props.modelConfig.reasoning_effort || thinking.default}
                onChange={(e) => {
                  props.updateConfig((config) => {
                    config.reasoning_effort = e.currentTarget
                      .value as ReasoningEffort;
                  });
                }}
              >
                {thinking.levels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </option>
                ))}
              </Select>
            </ListItem>
          );
        }

        // thinking_mode (e.g. Minimax M3)
        return (
          <ListItem
            title={Locale.Settings.Thinking.Title}
            subTitle={Locale.Settings.Thinking.SubTitle}
          >
            <Select
              value={props.modelConfig.thinking_mode || thinking.default}
              onChange={(e) => {
                const mode = e.currentTarget.value as
                  | "enabled"
                  | "disabled"
                  | "adaptive";
                props.updateConfig((config) => {
                  config.thinking_mode = mode;
                  config.enable_thinking = mode !== "disabled";
                });
              }}
            >
              <option value="enabled">Enabled (Think)</option>
              <option value="disabled">Disabled (No-think)</option>
              <option value="adaptive">Adaptive</option>
            </Select>
          </ListItem>
        );
      })()}

      {/* Thought Summary Toggle - Only for Gemini 2.5 and 3 */}
      {!isCurrentLiveModel &&
        (props.modelConfig.model.toLowerCase().includes("gemini-2.5") ||
          props.modelConfig.model.toLowerCase().includes("gemini-3") ||
          props.modelConfig.model.toLowerCase().includes("gemini_2.5") ||
          props.modelConfig.model.toLowerCase().includes("gemini_3")) && (
          <ListItem
            title={Locale.Settings.ThoughtSummary.Title}
            subTitle={Locale.Settings.ThoughtSummary.SubTitle}
          >
            <input
              type="checkbox"
              checked={props.modelConfig.include_thoughts}
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.include_thoughts = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>
        )}

      {/* Thinking Toggle for Rednote (小红书) / Nvidia / Kimi 2.5 / LongCat 2.0 */}
      {(props.modelConfig.providerName === "Rednote" ||
        props.modelConfig.model.toLowerCase().includes("dots3") ||
        props.modelConfig.providerName === "Nvidia" ||
        (props.modelConfig.model.toLowerCase().includes("kimi") &&
          props.modelConfig.model.includes("2.5")) ||
        props.modelConfig.model.toLowerCase().includes("longcat-2.0")) && (
        <ListItem
          title={Locale.Settings.Thinking.Title} // Using a more generic title key if available, or falling back to reuse Kimi's if necessary, but "Enable Thinking" is better. Let's check locale keys. relying on existing keys.
          subTitle={Locale.Settings.Thinking.SubTitle}
        >
          <input
            type="checkbox"
            checked={props.modelConfig.enable_thinking ?? true}
            onChange={(e) =>
              props.updateConfig(
                (config) => (config.enable_thinking = e.currentTarget.checked),
              )
            }
          ></input>
        </ListItem>
      )}
      <ListItem
        title={Locale.Settings.AspectRatio.Title}
        subTitle={Locale.Settings.AspectRatio.SubTitle}
      >
        <Select
          value={props.modelConfig.aspect_ratio}
          onChange={(e) => {
            props.updateConfig(
              (config) => (config.aspect_ratio = e.currentTarget.value),
            );
          }}
        >
          {[
            "1:1",
            "2:3",
            "3:2",
            "3:4",
            "4:3",
            "4:5",
            "5:4",
            "9:16",
            "16:9",
            "21:9",
          ].map((v) => (
            <option value={v} key={v}>
              {v}
            </option>
          ))}
        </Select>
      </ListItem>

      <ListItem
        title={Locale.Settings.PresencePenalty.Title}
        subTitle={Locale.Settings.PresencePenalty.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.PresencePenalty.Title}
          value={props.modelConfig.presence_penalty?.toFixed(1)}
          min="-2"
          max="2"
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.presence_penalty =
                  ModalConfigValidator.presence_penalty(
                    e.currentTarget.valueAsNumber,
                  )),
            );
          }}
        ></InputRange>
      </ListItem>

      <ListItem
        title={Locale.Settings.FrequencyPenalty.Title}
        subTitle={Locale.Settings.FrequencyPenalty.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.FrequencyPenalty.Title}
          value={props.modelConfig.frequency_penalty?.toFixed(1)}
          min="-2"
          max="2"
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.frequency_penalty =
                  ModalConfigValidator.frequency_penalty(
                    e.currentTarget.valueAsNumber,
                  )),
            );
          }}
        ></InputRange>
      </ListItem>

      <ListItem
        title={Locale.Settings.InputTemplate.Title}
        subTitle={Locale.Settings.InputTemplate.SubTitle}
      >
        <input
          aria-label={Locale.Settings.InputTemplate.Title}
          type="text"
          value={props.modelConfig.template}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.template = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.HistoryCount.Title}
        subTitle={Locale.Settings.HistoryCount.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.HistoryCount.Title}
          title={
            props.modelConfig.historyMessageCount < 0
              ? "无限制"
              : props.modelConfig.historyMessageCount.toString()
          }
          value={
            props.modelConfig.historyMessageCount < 0
              ? 100
              : props.modelConfig.historyMessageCount
          }
          min="0"
          max="100"
          step="5"
          onChange={(e) => {
            const val = e.target.valueAsNumber;
            props.updateConfig(
              (config) => (config.historyMessageCount = val >= 100 ? -1 : val),
            );
          }}
        ></InputRange>
      </ListItem>

      <ListItem
        title={Locale.Settings.CompressThreshold.Title}
        subTitle={Locale.Settings.CompressThreshold.SubTitle}
      >
        <input
          aria-label={Locale.Settings.CompressThreshold.Title}
          type="number"
          min={500}
          max={1048576}
          value={props.modelConfig.compressMessageLengthThreshold}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.compressMessageLengthThreshold =
                  e.currentTarget.valueAsNumber),
            )
          }
        ></input>
      </ListItem>
      <ListItem title={Locale.Memory.Title} subTitle={Locale.Memory.Send}>
        <input
          aria-label={Locale.Memory.Title}
          type="checkbox"
          checked={props.modelConfig.sendMemory}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.sendMemory = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.CompressModel.Title}
        subTitle={Locale.Settings.CompressModel.SubTitle}
      >
        <Select
          className={styles["select-compress-model"]}
          aria-label={Locale.Settings.CompressModel.Title}
          value={compressModelValue}
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.compressModel = ModalConfigValidator.model(model);
              config.compressProviderName = providerName as ServiceProvider;
            });
          }}
        >
          {allModels
            .filter((v) => v.available)
            .map((v, i) => (
              <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                {v.displayName}({v.provider?.providerName})
              </option>
            ))}
        </Select>
      </ListItem>

      <ListItem
        title={Locale.Settings.FollowUp.Enable.Title}
        subTitle={Locale.Settings.FollowUp.Enable.SubTitle}
      >
        <input
          aria-label={Locale.Settings.FollowUp.Enable.Title}
          type="checkbox"
          checked={props.modelConfig.enableFollowUp ?? true}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.enableFollowUp = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>
      {props.modelConfig.enableFollowUp !== false && (
        <>
          <ListItem
            title={Locale.Settings.FollowUp.Count.Title}
            subTitle={Locale.Settings.FollowUp.Count.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.FollowUp.Count.Title}
              value={(props.modelConfig.followUpCount ?? 3).toString()}
              min="1"
              max="5"
              step="1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.followUpCount = ModalConfigValidator.followUpCount(
                      e.currentTarget.valueAsNumber,
                    )),
                );
              }}
            ></InputRange>
          </ListItem>
          <ListItem
            title={Locale.Settings.FollowUp.Turns.Title}
            subTitle={Locale.Settings.FollowUp.Turns.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.FollowUp.Turns.Title}
              value={(props.modelConfig.followUpTurns ?? 3).toString()}
              min="1"
              max="5"
              step="1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.followUpTurns = ModalConfigValidator.followUpTurns(
                      e.currentTarget.valueAsNumber,
                    )),
                );
              }}
            ></InputRange>
          </ListItem>
        </>
      )}

      {/* 联网搜索：开关 + 单次条数/摘要长度滑块（API Key 统一走服务端 .env） */}
      <WebSearchSettings />
    </>
  );
}
