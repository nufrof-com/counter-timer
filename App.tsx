import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Vibration, Platform, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";
import { LineChart } from "react-native-chart-kit";

type Phase = "count" | "ready" | "timing" | "rest" | "done" | "summary";

const GOAL = 40;
const REST_MS = 15_000;
const TOTAL_ROUNDS = 4;
const screenWidth = Dimensions.get("window").width;

export default function App() {
    useKeepAwake();

    const [phase, setPhase] = useState<Phase>("count");
    const [count, setCount] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [restMs, setRestMs] = useState(REST_MS);
    const [round, setRound] = useState(1);
    const [roundTimes, setRoundTimes] = useState<number[]>([]);

    const startTimeRef = useRef<number | null>(null);
    const restEndRef = useRef<number | null>(null);
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const soundRef = useRef<Audio.Sound | null>(null);

    // Load sound
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
                // still vibrate if sound fails
            }
        })();

        return () => {
            isMounted = false;
            if (tickerRef.current) clearInterval(tickerRef.current);
            soundRef.current?.unloadAsync();
        };
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

        // Save round result
        setRoundTimes((prev) => {
            const newArr = [...prev];
            newArr[round - 1] = Date.now() - (startTimeRef.current ?? 0);
            return newArr;
        });

        // Start rest timer
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
    }, [phase, round, beepAndVibrate]);

    const nextRound = useCallback(() => {
        if (round >= TOTAL_ROUNDS) {
            setPhase("summary");
            return;
        }
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
        setRound((r) => Math.min(TOTAL_ROUNDS, r + 1));
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
        setRound(1);
        setRoundTimes([]);
    }, []);

    const formatMs = (ms: number, showTenths = true) => {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        const tenths = Math.floor((ms % 1000) / 100);
        return showTenths
            ? `${m}:${String(s).padStart(2, "0")}.${tenths}`
            : `${m}:${String(s).padStart(2, "0")}`;
    };

    // Data for chart
    const chartData = {
        labels: roundTimes.map((_, i) => `R${i + 1}`),
        datasets: [
            {
                data: roundTimes.map((t) => t / 1000), // convert ms → seconds
            },
        ],
    };

    return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.title}>
                    Tap Counter & Timer
                </Text>
                {phase !== "summary" && (
                    <Text style={styles.round}>
                        Round {round} / {TOTAL_ROUNDS}
                    </Text>
                )}
            </View>

            {phase !== "summary" ? (
                <>
                    <Pressable
                        style={[styles.tapArea, phase !== "count" && styles.tapAreaDisabled]}
                        onPress={handleTapToCount}
                        disabled={phase !== "count"}
                        accessibilityRole="button"
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
                                <Pressable style={styles.primaryBtn} onPress={startMainTimer}>
                                    <Text style={styles.btnText}>Start</Text>
                                </Pressable>
                            </>
                        )}

                        {phase === "timing" && (
                            <>
                                <Text style={styles.timer}>{formatMs(elapsedMs)}</Text>
                                <Pressable style={styles.stopBtn} onPress={stopMainStartRest}>
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
                                    <Pressable style={styles.primaryBtn} onPress={nextRound}>
                                        <Text style={styles.btnText}>Next Round</Text>
                                    </Pressable>
                                )}
                                {round === TOTAL_ROUNDS && (
                                    <Pressable style={styles.primaryBtn} onPress={nextRound}>
                                        <Text style={styles.btnText}>See Summary</Text>
                                    </Pressable>
                                )}
                            </>
                        )}

                        <View style={styles.resetSection}>
                            <View style={styles.resetDivider} />
                            <Pressable style={styles.resetBtn} onPress={resetAll}>
                                <Text style={styles.resetBtnText}>Reset Session</Text>
                            </Pressable>
                        </View>
                    </View>
                </>
            ) : (
                // Summary with chart
                <View style={styles.chartContainer}>
                    <Text style={styles.title}>Summary</Text>
                    <LineChart
                        data={chartData}
                        width={screenWidth - 40}
                        height={250}
                        chartConfig={{
                            backgroundColor: "#0f172a",
                            backgroundGradientFrom: "#111827",
                            backgroundGradientTo: "#1f2937",
                            decimalPlaces: 1,
                            color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
                            labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                            style: { borderRadius: 16 },
                            propsForDots: {
                                r: "6",
                                strokeWidth: "2",
                                stroke: "#2563eb",
                            },
                        }}
                        bezier
                        style={{ marginVertical: 8, borderRadius: 16 }}
                    />
                    <Pressable style={styles.restartBtn} onPress={resetAll}>
                        <Text style={styles.restartBtnText}>Start New Session</Text>
                    </Pressable>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0f172a" },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
    title: { color: "white", fontSize: 22, fontWeight: "700" },
    round: { color: "#cbd5e1", fontSize: 18, marginTop: 4, fontWeight: "600" },
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
        gap: 16,
        backgroundColor: "#0b1220",
        borderTopWidth: 1,
        borderTopColor: "#1f2937",
    },
    timer: {
        color: "white",
        fontSize: 52,
        fontVariant: ["tabular-nums"],
        textAlign: "center",
    },
    info: { 
        color: "white", 
        fontSize: 18, 
        textAlign: "center",
        fontWeight: "500",
        lineHeight: 24,
    },
    small: { 
        color: "#cbd5e1", 
        textAlign: "center",
        fontSize: 16,
        marginTop: 4,
    },
    primaryBtn: {
        backgroundColor: "#2563eb",
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: "center",
        minHeight: 52,
        justifyContent: "center",
    },
    stopBtn: {
        backgroundColor: "#ef4444",
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: "center",
        minHeight: 52,
        justifyContent: "center",
    },
    resetSection: {
        marginTop: 16,
    },
    resetDivider: {
        height: 1,
        backgroundColor: "#1f2937",
        marginBottom: 12,
    },
    resetBtn: {
        backgroundColor: "transparent",
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#374151",
        alignSelf: "center",
    },
    restartBtn: {
        backgroundColor: "#2563eb",
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: "center",
        minHeight: 52,
        justifyContent: "center",
        marginTop: 20,
    },
    resetBtnText: { 
        color: "#6b7280", 
        fontWeight: "400", 
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 0.8,
    },
    restartBtnText: { 
        color: "white", 
        fontWeight: "600", 
        fontSize: 16,
    },
    btnText: { 
        color: "white", 
        fontWeight: "600", 
        fontSize: 16,
    },
    chartContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
});
