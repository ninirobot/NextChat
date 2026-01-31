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
          step="0.1"
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
      {(props.modelConfig.model.includes("gemini-2.5") ||
        props.modelConfig.model.includes("gemini-3") ||
        props.modelConfig.model.toLowerCase().includes("thinking") ||
        props.modelConfig.model.includes("gemini-2.0-flash-thinking")) && (
          <>
            {props.modelConfig.model.includes("gemini-2.5") ? (
              <ListItem
                title={Locale.Settings.GeminiThinkingBudget.Title}
                subTitle={
                  props.modelConfig.gemini_thinking_budget === -1
                    ? "Dynamic"
                    : Locale.Settings.GeminiThinkingBudget.SubTitle
                }
              >
                {/* Thinking Budget for Gemini 2.5 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    width: "100%",
                  }}
                >
                  <div style={{ flex: 1, marginRight: 10 }}>
                    <InputRange
                      aria={Locale.Settings.GeminiThinkingBudget.Title}
                      value={
                        props.modelConfig.gemini_thinking_budget === -1
                          ? 1024
                          : props.modelConfig.gemini_thinking_budget
                      }
                      disabled={props.modelConfig.gemini_thinking_budget === -1}
                      min="0"
                      max={
                        props.modelConfig.model.includes("pro") ? "32768" : "24576"
                      }
                      step="1024"
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
                  </div>
                  {/* Dynamic Toggle for Gemini 2.5 */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", marginRight: "5px" }}>
                      Dynamic
                    </span>
                    <input
                      type="checkbox"
                      checked={props.modelConfig.gemini_thinking_budget === -1}
                      onChange={(e) => {
                        props.updateConfig((config) => {
                          if (e.currentTarget.checked) {
                            config.gemini_thinking_budget = -1;
                          } else {
                            config.gemini_thinking_budget = 1024; // Default value when unchecked
                          }
                        });
                      }}
                    />
                  </div>
                </div>
              </ListItem>
            ) : props.modelConfig.model.includes("gemini-3") ? (
              <ListItem
                title={"Thinking Level"}
                subTitle={"Control the depth of thought"}
              >
                {/* Thinking Level for Gemini 3 */}
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
            ) : (
              // Generic Thinking Budget for other models (e.g. Gemini 2.0 Flash Thinking / Longcat)
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

            {/* Enable Thought Summary Toggle */}
            <ListItem
              title={"Thought Summary"}
              subTitle={"Include model's internal reasoning summary"}
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
          </>
        )
      }
      {
        props.modelConfig?.providerName === ServiceProvider.OpenRouter && (
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
        )
      }

      {
        props.modelConfig?.providerName == ServiceProvider.Google ? null : (
          <>
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
              title={Locale.Settings.InjectSystemPrompts.Title}
              subTitle={Locale.Settings.InjectSystemPrompts.SubTitle}
            >
              <input
                aria-label={Locale.Settings.InjectSystemPrompts.Title}
                type="checkbox"
                checked={props.modelConfig.enableInjectSystemPrompts}
                onChange={(e) =>
                  props.updateConfig(
                    (config) =>
                    (config.enableInjectSystemPrompts =
                      e.currentTarget.checked),
                  )
                }
              ></input>
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
          </>
        )
      }
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
