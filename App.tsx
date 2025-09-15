import React, { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView, View, Text, Pressable, StyleSheet, Vibration, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";

type Phase = "count" | "ready" | "timing" | "rest" | "done";

const GOAL = 40;
const REST_MS = 15_000;
const TOTAL_ROUNDS = 4;

export default function App() {
    useKeepAwake();

    const [phase, setPhase] = useState<Phase>("count");
    const [count, setCount] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [restMs, setRestMs] = useState(REST_MS);
    const [round, setRound] = useState(1);

    const startTimeRef = useRef<number | null>(null);
    const restEndRef = useRef<number | null>(null);
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const soundRef = useRef<Audio.Sound | null>(null);

    // Load sound & audio mode
    useEffect(() => {
        let isMounted = true;

        (async () => {
            try {
                await Audio.setAudioModeAsync({
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: false,
                    allowsRecordingIOS: false,
                });
                const { sound } = await Audio.Sound.createAsync(
                    require("./assets/beep.mp3"),
                    { shouldPlay: false, volume: 1.0 }
                );
                if (isMounted) soundRef.current = sound;
            } catch {
                // If audio fails, vibration still covers the alert
            }
        })();

        return () => {
            isMounted = false;
            if (tickerRef.current) clearInterval(tickerRef.current);
            soundRef.current?.unloadAsync();
        };
    }, []);

    const nextRound = useCallback(() => {
        if (round >= TOTAL_ROUNDS) return;
        if (tickerRef.current) {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
        }
        startTimeRef.current = null;
        restEndRef.current = null;
        setCount(0);
        setElapsedMs(0);
        setRestMs(REST_MS);
        setPhase("count");
        setRound(r => Math.min(TOTAL_ROUNDS, r + 1));
    }, [round]);

    const resetAll = useCallback(() => {
        if (tickerRef.current) {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
        }
        startTimeRef.current = null;
        restEndRef.current = null;
        setCount(0);
        setElapsedMs(0);
        setRestMs(REST_MS);
        setPhase("count");
        setRound(1); // <-- ensure full reset to round 1
    }, []);

    const beepAndVibrate = useCallback(async () => {
        try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
        try {
            await soundRef.current?.replayAsync();
        } catch {}
        Vibration.vibrate(Platform.OS === "ios" ? 200 : 300);
    }, []);

    const handleTapToCount = useCallback(() => {
        if (phase !== "count") return;
        setCount((c) => {
            const next = Math.min(GOAL, c + 1);
            if (next === GOAL) {
                beepAndVibrate();
                setPhase("ready");
            } else {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
            return next;
        });
    }, [phase, beepAndVibrate]);

    const startMainTimer = useCallback(() => {
        if (phase !== "ready") return;
        if (tickerRef.current) clearInterval(tickerRef.current);

        setElapsedMs(0);
        startTimeRef.current = Date.now();
        setPhase("timing");

        tickerRef.current = setInterval(() => {
            if (startTimeRef.current != null) {
                setElapsedMs(Date.now() - startTimeRef.current);
            }
        }, 50);
    }, [phase]);

    const stopMainStartRest = useCallback(() => {
        if (phase !== "timing") return;

        if (tickerRef.current) {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
        }
        if (startTimeRef.current != null) {
            setElapsedMs(Date.now() - startTimeRef.current);
        }

        // Start 15s rest
        restEndRef.current = Date.now() + REST_MS;
        setRestMs(REST_MS);
        setPhase("rest");

        tickerRef.current = setInterval(() => {
            const remaining = Math.max(0, (restEndRef.current ?? 0) - Date.now());
            setRestMs(remaining);
            if (remaining <= 0) {
                if (tickerRef.current) {
                    clearInterval(tickerRef.current);
                    tickerRef.current = null;
                }
                beepAndVibrate();
                setPhase("done");
            }
        }, 100);
    }, [phase, beepAndVibrate]);

    const formatMs = (ms: number, showTenths = true) => {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        const tenths = Math.floor((ms % 1000) / 100);
        return showTenths ? `${m}:${String(s).padStart(2, "0")}.${tenths}` : `${m}:${String(s).padStart(2, "0")}`;
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.title}>Tap Counter & Timer</Text>
                <Text style={styles.round}>Round {round} / {TOTAL_ROUNDS}</Text>
            </View>

            <Pressable
                style={[styles.tapArea, phase !== "count" && styles.tapAreaDisabled]}
                onPress={handleTapToCount}
                disabled={phase !== "count"}
                accessibilityRole="button"
                accessibilityLabel={
                    phase === "count" ? "Tap to count" : "Counting disabled"
                }
            >
                <Text style={styles.countText}>{count}</Text>
                <Text style={styles.subtle}>
                    {phase === "count" ? "Tap anywhere to count up to 40" : " "}
                </Text>
            </Pressable>

            <View style={styles.panel}>
                {phase === "ready" && (
                    <>
                        <Text style={styles.info}>Reached 40. Ready to start your timer.</Text>
                        <Pressable style={styles.primaryBtn} onPress={startMainTimer} accessibilityRole="button" accessibilityLabel="Start timer">
                            <Text style={styles.btnText}>Start</Text>
                        </Pressable>
                    </>
                )}

                {phase === "timing" && (
                    <>
                        <Text style={styles.timer}>{formatMs(elapsedMs)}</Text>
                        <Pressable style={styles.stopBtn} onPress={stopMainStartRest} accessibilityRole="button" accessibilityLabel="Stop timer">
                            <Text style={styles.btnText}>Stop</Text>
                        </Pressable>
                    </>
                )}

                {phase === "rest" && (
                    <>
                        <Text style={styles.info}>Rest</Text>
                        <Text style={styles.timer}>{formatMs(restMs, false)}</Text>
                    </>
                )}

                {phase === "done" && (
                    <>
                        <Text style={styles.info}>
                            {round < TOTAL_ROUNDS ? "Round complete" : "All rounds complete"}
                        </Text>
                        <Text style={styles.small}>Your time: {formatMs(elapsedMs)}</Text>

                        {round < TOTAL_ROUNDS && (
                            <Pressable
                                style={styles.primaryBtn}
                                onPress={nextRound}
                                accessibilityRole="button"
                                accessibilityLabel="Next round"
                            >
                                <Text style={styles.btnText}>Next Round</Text>
                            </Pressable>
                        )}
                    </>
                )}

                <Pressable style={styles.resetBtn} onPress={resetAll} accessibilityRole="button" accessibilityLabel="Reset">
                    <Text style={[styles.btnText, styles.resetBtnText]}>Reset</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0f172a" },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
    title: { color: "white", fontSize: 20, fontWeight: "700" },
    tapArea: {
        flex: 1,
        margin: 20,
        borderRadius: 24,
        backgroundColor: "#111827",
        borderWidth: 1,
        borderColor: "#1f2937",
        alignItems: "center",
        justifyContent: "center",
    },
    tapAreaDisabled: { opacity: 0.5 },
    countText: { fontSize: 96, color: "white", fontWeight: "800" },
    subtle: { color: "#9ca3af", marginTop: 8 },
    panel: {
        padding: 20,
        gap: 12,
        backgroundColor: "#0b1220",
        borderTopWidth: 1,
        borderTopColor: "#1f2937",
    },
    timer: { color: "white", fontSize: 48, fontVariant: ["tabular-nums"], textAlign: "center" },
    info: { color: "white", fontSize: 18, textAlign: "center" },
    small: { color: "#cbd5e1", textAlign: "center" },
    primaryBtn: {
        backgroundColor: "#2563eb",
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: "center",
    },
    stopBtn: {
        backgroundColor: "#ef4444",
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: "center",
    },

    round: { color: "#cbd5e1", fontSize: 14, marginTop: 4 },

    resetBtn: {
        backgroundColor: "#374151",
        paddingVertical: 16,      // was 12
        borderRadius: 16,         // was 12
        alignItems: "center",
        marginTop: 8,             // was 4
    },
    resetBtnText: {
        fontSize: 18,             // bigger label just for Reset
    },
    btnText: { color: "white", fontWeight: "700", fontSize: 16 },
});
