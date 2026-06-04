import { getCtx } from './audio';

// Mix a recorded vocal with the round's beat (looped, ducked) into a single
// downloadable WAV. Rendered with an OfflineAudioContext for a deterministic
// result. WAV keeps it dependency-free; swap to MP3 (lamejs) later if file size
// matters for sharing.

const DUCK = 0.5; // beat volume under the vocal (matches the showcase mix)

export async function mixVocalWithBeat(
  vocalData: ArrayBuffer,
  beatBuffer: AudioBuffer,
): Promise<Blob> {
  // Decode the vocal. Copy the bytes first — decodeAudioData detaches them.
  const vocal = await getCtx().decodeAudioData(vocalData.slice(0));

  const sampleRate = getCtx().sampleRate;
  const channels = 2;
  const length = Math.max(1, Math.ceil(vocal.duration * sampleRate));
  const off = new OfflineAudioContext(channels, length, sampleRate);

  // Vocal at full volume.
  const v = off.createBufferSource();
  v.buffer = vocal;
  v.connect(off.destination);
  v.start(0);

  // Beat looped underneath, ducked, trimmed to the vocal length.
  const b = off.createBufferSource();
  b.buffer = beatBuffer;
  b.loop = true;
  const g = off.createGain();
  g.gain.value = DUCK;
  b.connect(g);
  g.connect(off.destination);
  b.start(0);
  b.stop(vocal.duration);

  const rendered = await off.startRendering();
  return bufferToWav(rendered);
}

// Encode an AudioBuffer to a 16-bit PCM WAV Blob.
function bufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;

  const arr = new ArrayBuffer(bufferSize);
  const view = new DataView(arr);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels, clamp, convert to 16-bit.
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = chans[c][i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arr], { type: 'audio/wav' });
}
