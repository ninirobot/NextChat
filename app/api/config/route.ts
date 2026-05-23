import { NextRequest, NextResponse } from "next/server";

import { getServerSideConfig } from "../../config/server";
import { auth } from "../auth";
import { ModelProvider } from "../../constant";

const serverConfig = getServerSideConfig();

// Danger! Do not hard code any secret value here!
// 警告！不要在这里写入任何敏感信息！
const DANGER_CONFIG = {
  needCode: serverConfig.needCode,
  hideUserApiKey: serverConfig.hideUserApiKey,
  disableGPT4: serverConfig.disableGPT4,
  hideBalanceQuery: serverConfig.hideBalanceQuery,
  disableFastLink: serverConfig.disableFastLink,
  customModels: serverConfig.customModels,
  liveModels: serverConfig.liveModels,
  defaultModel: serverConfig.defaultModel,
  visionModels: serverConfig.visionModels,
  isGoogleLive: serverConfig.isGoogleLive,
};

declare global {
  type DangerConfig = typeof DANGER_CONFIG;
}

async function handle(req: NextRequest) {
  // 尝试鉴权：如果通过（或不需要访问密码），则额外返回 googleLiveApiKey
  // 这样部署者在服务端配置的 GOOGLE_LIVE_API_KEY 就可以自动传递到前端
  const authResult = auth(req, ModelProvider.GeminiPro);
  const isAuthorized = !authResult.error;

  const responseConfig: Record<string, unknown> = { ...DANGER_CONFIG };

  if (isAuthorized && serverConfig.googleLiveApiKey) {
    responseConfig.googleLiveApiKey = serverConfig.googleLiveApiKey;
  }

  return NextResponse.json(responseConfig);
}

export const GET = handle;
export const POST = handle;

export const runtime = "edge";
