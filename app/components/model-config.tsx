import { ServiceProvider } from "@/app/constant";
import { ModalConfigValidator, ModelConfig } from "../store";

import Locale from "../locales";
import { InputRange } from "./input-range";
import { ListItem, Select } from "./ui-lib";
import { useAllModels } from "../utils/hooks";
import { groupBy } from "lodash-es";
import styles from "./model-config.module.scss";
import { getModelProvider } from "../utils/model";

export function ModelConfigList(props: {
  modelConfig: ModelConfig;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
}) {
  const allModels = useAllModels();
  const groupModels = groupBy(
    allModels.filter((v) => v.available),
    "provider.providerName",
  );
  const value = `${props.modelConfig.model}@${props.modelConfig?.providerName}`;
  const compressModelValue = `${props.modelConfig.compressModel}@${props.modelConfig?.compressProviderName}`;

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
          value={(props.modelConfig.top_p ?? 1).toFixed(1)}
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
      {props.modelConfig.model.includes("gemini") &&
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
      {props.modelConfig.model.includes("gemini") &&
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

      {/* Gemini 3 Thinking Level */}
      {props.modelConfig.model.includes("3") && (
        <ListItem
          title={Locale.Settings.ThinkingLevel?.Title || "Thinking Level"}
          subTitle={Locale.Settings.ThinkingLevel?.SubTitle || "Control the depth of thought"}
        >
          <Select
            value={props.modelConfig.thinking_level || "high"}
            onChange={(e) => {
              props.updateConfig((config) => {
                config.thinking_level = e.currentTarget.value;
              });
            }}
          >
            {props.modelConfig.model.includes("flash") && (
              <>
                <option value="minimal">Minimal</option>
                <option value="medium">Medium</option>
              </>
            )}
            <option value="low">Low</option>
            <option value="high">High</option>
          </Select>
        </ListItem>
      )}

      {/* LongCat and other Thinking models */}
      {(props.modelConfig.model.toLowerCase().includes("thinking") ||
        props.modelConfig.model.includes("longcat")) &&
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

      {/* GPT-OSS Reasoning Effort */}
      {props.modelConfig.model.includes("gpt-oss") && (
        <ListItem
          title={Locale.Settings.ReasoningEffort.Title}
          subTitle={Locale.Settings.ReasoningEffort.SubTitle}
        >
          <Select
            value={props.modelConfig.reasoning_effort || "medium"}
            onChange={(e) => {
              props.updateConfig((config) => {
                config.reasoning_effort = e.currentTarget.value as "low" | "medium" | "high";
              });
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </ListItem>
      )}


      {/* Thought Summary Toggle - Only for Gemini 2.5 and 3 */}
      {(props.modelConfig.model.toLowerCase().includes("gemini-2.5") ||
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
                  (config) => (config.include_thoughts = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>
        )}

      {/* Kimi 2.5 Thinking Toggle */}
      {(props.modelConfig.model.toLowerCase().includes("kimi") &&
        props.modelConfig.model.includes("2.5")) && (
          <ListItem
            title={Locale.Settings.KimiThinking.Title}
            subTitle={Locale.Settings.KimiThinking.SubTitle}
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
          title={props.modelConfig.historyMessageCount.toString()}
          value={props.modelConfig.historyMessageCount}
          min="0"
          max="100"
          step="5"
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.historyMessageCount = e.target.valueAsNumber),
            )
          }
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
    </>
  );
}
