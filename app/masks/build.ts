import fs from "fs";
import path from "path";
import { CN_MASKS } from "./cn";
import { EN_MASKS } from "./en";
import { FR_MASKS } from "./fr";
import { JP_MASKS } from "./jp";

import { type BuiltinMask } from "./typing";

const BUILTIN_MASKS: Record<string, BuiltinMask[]> = {
  cn: CN_MASKS,
  en: EN_MASKS,
  fr: FR_MASKS,
  jp: JP_MASKS,
};

const dirname = path.dirname(__filename);

fs.writeFile(
  dirname + "/../../public/masks.json",
  JSON.stringify(BUILTIN_MASKS, null, 4),
  function (error) {
    if (error) {
      console.error("[Build] failed to build masks", error);
    }
  },
);
