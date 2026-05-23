import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { collectModelsWithDefaultModel } from "./model";

export function useAllModels() {
  const accessStore = useAccessStore();
  const configStore = useAppConfig();
  const models = useMemo(() => {
    return collectModelsWithDefaultModel(
      configStore.models,
      [
        configStore.customModels,
        accessStore.customModels,
        configStore.liveModels,
        accessStore.liveModels,
      ].join(","),
      accessStore.defaultModel,
    );
  }, [
    accessStore.customModels,
    configStore.customModels,
    accessStore.liveModels,
    configStore.liveModels,
    accessStore.defaultModel,
    configStore.models,
  ]);

  return models;
}
