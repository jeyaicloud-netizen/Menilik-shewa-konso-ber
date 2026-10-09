/**
 * Web Audio API Utilities for the J11 Studio Step Audio Editor:
 * - Decodes any MP3 / WebM / WAV / M4A audio Blob into an AudioBuffer
 * - Extracts waveform peaks for interactive visual trimming & cutting
 * - Cuts/trims out a selected middle range or trims start/end
 * - Merges/appends ("Plus +") another uploaded MP3 or recorded voice clip onto an existing step audio
 * - Encodes the resulting AudioBuffer into a high-clarity WAV FileBlob ready for instant playback & IndexedDB storage
 */

export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } finally {
    if (ctx.state !== 'closed') {
      await ctx.close().catch(() => {});
    }
  }
}

export function extractWaveformPeaks(buffer: AudioBuffer, barCount: number = 64): number[] {
  const rawData = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(rawData.length / barCount));
  const peaks: number[] = [];

  for (let i = 0; i < barCount; i++) {
    const start = i * blockSize;
    let max = 0;
    for (let j = 0; j < blockSize && start + j < rawData.length; j++) {
      const val = Math.abs(rawData[start + j]);
      if (val > max) max = val;
    }
    peaks.push(max);
  }

  const globalMax = Math.max(0.01, ...peaks);
  return peaks.map((p) => Math.max(0.08, Math.min(1, p / globalMax)));
}

/**
 * Trims an AudioBuffer to keep only [startSec, endSec]
 */
export function trimAudioBuffer(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startFrame = Math.max(0, Math.floor(startSec * sampleRate));
  const endFrame = Math.min(buffer.length, Math.ceil(endSec * sampleRate));
  const frameCount = Math.max(1, endFrame - startFrame);

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  const newBuffer = ctx.createBuffer(
    buffer.numberOfChannels,
    frameCount,
    sampleRate
  );
  ctx.close().catch(() => {});

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const oldData = buffer.getChannelData(ch);
    const newData = newBuffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      newData[i] = oldData[startFrame + i] || 0;
    }
  }

  return newBuffer;
}

/**
 * Cuts/removes the region [cutStartSec, cutEndSec] from the AudioBuffer and joins the remaining parts seamlessly
 */
export function cutRegionFromAudioBuffer(
  buffer: AudioBuffer,
  cutStartSec: number,
  cutEndSec: number
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const cutStartFrame = Math.max(0, Math.floor(cutStartSec * sampleRate));
  const cutEndFrame = Math.min(buffer.length, Math.ceil(cutEndSec * sampleRate));

  if (cutEndFrame <= cutStartFrame) return buffer;

  const remainingFrames = Math.max(1, buffer.length - (cutEndFrame - cutStartFrame));
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  const newBuffer = ctx.createBuffer(
    buffer.numberOfChannels,
    remainingFrames,
    sampleRate
  );
  ctx.close().catch(() => {});

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const oldData = buffer.getChannelData(ch);
    const newData = newBuffer.getChannelData(ch);
    let writeIdx = 0;
    for (let i = 0; i < cutStartFrame && writeIdx < remainingFrames; i++) {
      newData[writeIdx++] = oldData[i];
    }
    for (let i = cutEndFrame; i < buffer.length && writeIdx < remainingFrames; i++) {
      newData[writeIdx++] = oldData[i];
    }
  }

  return newBuffer;
}

/**
 * Concatenates/merges ("Plus +") two AudioBuffers into a single seamless AudioBuffer!
 * Automatically resamples bufferB if its sampleRate differs from bufferA.
 */
export function concatAudioBuffers(
  bufferA: AudioBuffer,
  bufferB: AudioBuffer
): AudioBuffer {
  const targetRate = bufferA.sampleRate;
  const numChannels = Math.max(bufferA.numberOfChannels, bufferB.numberOfChannels);

  // Resample bufferB linearly if needed
  const bLengthInTargetRate = Math.round(
    (bufferB.length * targetRate) / bufferB.sampleRate
  );
  const totalFrames = bufferA.length + bLengthInTargetRate;

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  const merged = ctx.createBuffer(numChannels, Math.max(1, totalFrames), targetRate);
  ctx.close().catch(() => {});

  for (let ch = 0; ch < numChannels; ch++) {
    const out = merged.getChannelData(ch);
    const dataA = bufferA.getChannelData(Math.min(ch, bufferA.numberOfChannels - 1));
    const dataB = bufferB.getChannelData(Math.min(ch, bufferB.numberOfChannels - 1));

    out.set(dataA, 0);

    if (bufferB.sampleRate === targetRate) {
      out.set(dataB, bufferA.length);
    } else {
      const ratio = bufferB.sampleRate / targetRate;
      for (let i = 0; i < bLengthInTargetRate; i++) {
        const srcIdx = i * ratio;
        const idx0 = Math.floor(srcIdx);
        const idx1 = Math.min(bufferB.length - 1, idx0 + 1);
        const frac = srcIdx - idx0;
        out[bufferA.length + i] = dataB[idx0] * (1 - frac) + dataB[idx1] * frac;
      }
    }
  }

  return merged;
}

/**
 * Encodes an AudioBuffer to a standard 16-bit PCM WAV File
 */
export function audioBufferToWavFile(
  buffer: AudioBuffer,
  fileName: string = 'edited_step.wav'
): File {
  const numChannels = 1; // Mono for crisp telephony/voice playback and compact storage
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const cleanName = fileName.replace(/\.[a-zA-Z0-9]+$/, '') + '.wav';
  return new File([arrayBuffer], cleanName, { type: 'audio/wav' });
}

export const decodeBlobToAudioBuffer = decodeAudioBlob;
export const keepAudioRange = trimAudioBuffer;
export const cutOutAudioRange = cutRegionFromAudioBuffer;
export const audioBufferToWavBlob = (buffer: AudioBuffer): Blob =>
  audioBufferToWavFile(buffer, 'edited_audio.wav');
export async function appendAudioBlobs(blobA: Blob, blobB: Blob): Promise<Blob> {
  const bufA = await decodeAudioBlob(blobA);
  const bufB = await decodeAudioBlob(blobB);
  const merged = concatAudioBuffers(bufA, bufB);
  return audioBufferToWavFile(merged, 'merged_audio.wav');
}

