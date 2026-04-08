import { useMemo } from 'react';
import useSound from 'use-sound';

function buildClickTone() {
  const sampleRate = 22050;
  const duration = 0.045;
  const totalSamples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeText = (offset, text) => {
    Array.from(text).forEach((char, index) => {
      view.setUint8(offset + index, char.charCodeAt(0));
    });
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  for (let i = 0; i < totalSamples; i += 1) {
    const time = i / sampleRate;
    const envelope = Math.exp(-time * 26);
    const tone = Math.sin(2 * Math.PI * 1240 * time) + 0.35 * Math.sin(2 * Math.PI * 2480 * time);
    view.setInt16(44 + i * 2, tone * envelope * 12000, true);
  }

  const bytes = new Uint8Array(buffer);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return `data:audio/wav;base64,${window.btoa(binary)}`;
}

export default function useUiSounds(volume = 0.35) {
  const soundSrc = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return buildClickTone();
  }, []);

  const [playHover] = useSound(soundSrc, {
    volume: volume * 0.55,
    playbackRate: 1.15,
    interrupt: true,
  });

  const [playClick] = useSound(soundSrc, {
    volume,
    playbackRate: 0.9,
    interrupt: true,
  });

  return {
    playHover: () => {
      if (soundSrc) {
        playHover();
      }
    },
    playClick: () => {
      if (soundSrc) {
        playClick();
      }
    },
  };
}
