import React, { useCallback, useEffect, useRef, useState } from "react";
import { getClientConfig } from "../config/client";
import clsx from "clsx";
import Locale from "../locales";
import styles from "./chat.module.scss";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";
import dynamic from "next/dynamic";
import LoadingIcon from "../icons/three-dots.svg";

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
    loading: () => <LoadingIcon />,
});

export function ThinkingBlock(props: {
    model?: string;
    thinking: string;
    duration?: number;
    streaming?: boolean;
    isThinking?: boolean;
    defaultExpand?: boolean;
}) {
    const [collapsed, setCollapsed] = useState(!props.defaultExpand);
    const isActuallyThinking = props.isThinking ?? props.streaming;

    // Users can easily add more models here
    const isReasoningModel = useCallback((model?: string) => {
        if (!model) return false;
        const m = model.toLowerCase();
        const customThinkingModels = getClientConfig()?.thinkingModels || "";
        return (
            m.includes("deepseek-r1") ||
            m.includes("o1-") ||
            m.includes("o3-") ||
            m === "o1" ||
            m === "o3" ||
            m.includes("longcat") && m.includes("thinking") ||
            m.includes("gemini") ||
            m.includes("thinking") ||
            m.includes("kimi") ||
            m.includes("gpt-oss") ||
            customThinkingModels.split(",").some((item: string) => item.length > 0 && m.includes(item.toLowerCase().trim()))
        );

    }, []);

    useEffect(() => {
        if (props.defaultExpand !== undefined) {
            setCollapsed(!props.defaultExpand);
        }
    }, [props.defaultExpand]);

    if (!isReasoningModel(props.model)) return null;
    if (!props.thinking && (props.isThinking === undefined && !props.streaming))
        return null;

    const peekRef = useRef<HTMLDivElement>(null);

    // Sync scroll for lyrics effect
    useEffect(() => {
        if (collapsed && peekRef.current) {
            peekRef.current.scrollTop = peekRef.current.scrollHeight;
        }
    }, [props.thinking, collapsed]);

    // Use the duration passed from the store (updated by requestAnimationFrame loop)
    const displayDuration = props.duration ?? 0;

    return (
        <div className={styles["thinking-block"]}>
            <div
                className={clsx(styles["thinking-header"], {
                    [styles["collapsed"]]: collapsed,
                })}
                onClick={() => setCollapsed(!collapsed)}
            >
                <div className={styles["thinking-title-container"]}>
                    <div className={styles["thinking-title"]}>
                        {isActuallyThinking ? Locale.Chat.Thinking : Locale.Chat.Thought}
                        <span className={styles["thinking-duration"]}>
                            ({Locale.Chat.ThinkingDuration(displayDuration)})
                        </span>
                    </div>
                    {collapsed && props.thinking && (
                        <div className={styles["thinking-peek-container"]}>
                            <div className={styles["thinking-peek"]} ref={peekRef}>
                                {props.thinking.trim()}
                            </div>
                        </div>
                    )}
                </div>
                <div className={styles["thinking-tag"]}>
                    {collapsed ? <MaxIcon /> : <MinIcon />}
                </div>
            </div>
            {!collapsed && (
                <div className={styles["thinking-content"]}>
                    <Markdown content={props.thinking} />
                </div>
            )}
        </div>
    );
}
