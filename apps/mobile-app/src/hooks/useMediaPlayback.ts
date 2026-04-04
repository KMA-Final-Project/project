import { useCallback, useEffect, useMemo } from "react";
import { useEvent } from "expo";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { useVideoPlayer, type VideoPlayer, type VideoSource } from "expo-video";

import type { PlaybackSource } from "./usePlaybackSource";

export interface PlaybackControls {
  play(): void;
  pause(): void;
  seekTo(sec: number): void;
  setRate(speed: number): void;
  currentTimeSec: number;
  durationSec: number;
  isPlaying: boolean;
  isBuffering: boolean;
  videoPlayer: VideoPlayer | null;
  error: string | null;
}

export const useMediaPlayback = (source: PlaybackSource): PlaybackControls => {
  const audioSource = source.kind === "audio" ? source.uri : null;
  const videoSource: VideoSource = source.kind === "video" ? source.uri : null;

  const audioPlayer = useAudioPlayer(audioSource, {
    updateInterval: 250,
    keepAudioSessionActive: true,
  });
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    player.loop = false;
    player.timeUpdateEventInterval = 0.25;
    player.preservesPitch = true;
    player.volume = 1;
    player.muted = false;
  });

  const { isPlaying: isVideoPlaying } = useEvent(videoPlayer, "playingChange", {
    isPlaying: videoPlayer.playing,
  });
  const videoTimeUpdate = useEvent(videoPlayer, "timeUpdate", {
    currentTime: videoPlayer.currentTime,
    bufferedPosition: videoPlayer.bufferedPosition,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });
  const videoStatus = useEvent(videoPlayer, "statusChange", {
    status: videoPlayer.status,
    error: undefined,
  });

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: "doNotMix",
    });
  }, []);

  useEffect(() => {
    audioPlayer.volume = 1;
    videoPlayer.volume = 1;
    videoPlayer.muted = false;
  }, [audioPlayer, videoPlayer]);

  useEffect(() => {
    if (source.kind === "video") {
      audioPlayer.pause();
      return;
    }

    if (source.kind === "audio") {
      videoPlayer.pause();
      return;
    }

    audioPlayer.pause();
    videoPlayer.pause();
  }, [audioPlayer, source.kind, videoPlayer]);

  const play = useCallback(() => {
    if (source.kind === "audio") {
      audioPlayer.play();
      return;
    }

    if (source.kind === "video") {
      videoPlayer.play();
    }
  }, [audioPlayer, source.kind, videoPlayer]);

  const pause = useCallback(() => {
    if (source.kind === "audio") {
      audioPlayer.pause();
      return;
    }

    if (source.kind === "video") {
      videoPlayer.pause();
    }
  }, [audioPlayer, source.kind, videoPlayer]);

  const seekTo = useCallback(
    (sec: number) => {
      if (source.kind === "audio") {
        void audioPlayer.seekTo(sec);
        return;
      }

      if (source.kind === "video") {
        videoPlayer.currentTime = sec;
      }
    },
    [audioPlayer, source.kind, videoPlayer],
  );

  const setRate = useCallback(
    (speed: number) => {
      if (source.kind === "audio") {
        audioPlayer.playbackRate = speed;
        return;
      }

      if (source.kind === "video") {
        videoPlayer.playbackRate = speed;
      }
    },
    [audioPlayer, source.kind, videoPlayer],
  );

  return useMemo(() => {
    if (source.kind === "audio") {
      return {
        play,
        pause,
        seekTo,
        setRate,
        currentTimeSec: audioStatus.currentTime ?? audioPlayer.currentTime ?? 0,
        durationSec: audioStatus.duration ?? audioPlayer.duration ?? 0,
        isPlaying: audioStatus.playing ?? audioPlayer.playing ?? false,
        isBuffering:
          audioStatus.isBuffering ?? audioPlayer.isBuffering ?? false,
        videoPlayer: null,
        error: null,
      };
    }

    if (source.kind === "video") {
      return {
        play,
        pause,
        seekTo,
        setRate,
        currentTimeSec:
          videoTimeUpdate.currentTime ?? videoPlayer.currentTime ?? 0,
        durationSec: videoPlayer.duration ?? 0,
        isPlaying: isVideoPlaying,
        isBuffering: videoStatus.status === "loading",
        videoPlayer,
        error: videoStatus.error?.message ?? null,
      };
    }

    return {
      play,
      pause,
      seekTo,
      setRate,
      currentTimeSec: 0,
      durationSec: 0,
      isPlaying: false,
      isBuffering: false,
      videoPlayer: null,
      error: null,
    };
  }, [
    audioPlayer.currentTime,
    audioPlayer.duration,
    audioPlayer.isBuffering,
    audioPlayer.playing,
    audioStatus.currentTime,
    audioStatus.duration,
    audioStatus.isBuffering,
    audioStatus.playing,
    isVideoPlaying,
    pause,
    play,
    seekTo,
    setRate,
    source.kind,
    videoPlayer,
    videoStatus.error?.message,
    videoStatus.status,
    videoTimeUpdate.currentTime,
  ]);
};
