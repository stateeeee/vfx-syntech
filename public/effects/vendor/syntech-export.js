/* ═══════════════════════════════════════════════════════════════
   VFX SYNTECH — MASTER QUALITY EXPORT ENGINE (PLAN.md phase 4)

   Offline, frame-accurate rendering: the source video is stepped
   frame by frame (seek → render → encode), so no frame is ever
   dropped and quality does not depend on realtime performance.
   Encoding runs on WebCodecs (H.264 High at very high bitrate,
   with VP9/AV1 fallback when H.264 encode is unavailable) and the
   MP4 is muxed in the browser by mp4-muxer — no server involved.
   Source audio is decoded and muxed back in as AAC when possible.

   Requires: mp4-muxer.min.js loaded first (global Mp4Muxer).
   Effects call this with a getFrame(tSec) callback that renders
   one deterministic frame and returns the composite canvas.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VIDEO_CODECS = [
    { mux: 'avc', codec: 'avc1.640033' },   // H.264 High 5.1 (up to 4K)
    { mux: 'avc', codec: 'avc1.64002A' },   // H.264 High 4.2
    { mux: 'avc', codec: 'avc1.42E01E' },   // H.264 Baseline
    { mux: 'vp9', codec: 'vp09.00.50.08' }, // VP9 profile 0, level 5.0 (4K)
    { mux: 'vp9', codec: 'vp09.00.41.08' }, // VP9 level 4.1 (1080p60)
    { mux: 'av1', codec: 'av01.0.08M.08' }  // AV1 main, level 4.0
  ];

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function seekTo(video, t) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', finish);
        resolve();
      };
      video.addEventListener('seeked', finish);
      setTimeout(finish, 2000); // stuck-seek safety net
      video.currentTime = t;
    });
  }

  async function pickVideoCodec(width, height, fps, bitrate) {
    if (typeof VideoEncoder === 'undefined') return null;
    for (var i = 0; i < VIDEO_CODECS.length; i++) {
      var cand = VIDEO_CODECS[i];
      try {
        var support = await VideoEncoder.isConfigSupported({
          codec: cand.codec, width: width, height: height,
          framerate: fps, bitrate: bitrate
        });
        if (support.supported) return cand;
      } catch (e) { /* try next */ }
    }
    return null;
  }

  /* Decode the source's audio track to PCM; null when there is none */
  async function decodeSourceAudio(video) {
    var url = video.currentSrc || video.src;
    if (!url) return null;
    var buf = await (await fetch(url)).arrayBuffer();
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      var audio = await ctx.decodeAudioData(buf);
      return audio && audio.length ? audio : null;
    } finally {
      ctx.close();
    }
  }

  async function encodeAudio(muxer, audioBuf, durationSec, onError) {
    var channels = Math.min(2, audioBuf.numberOfChannels);
    var sampleRate = audioBuf.sampleRate;
    var totalFrames = Math.min(audioBuf.length, Math.ceil(durationSec * sampleRate));

    var encoder = new AudioEncoder({
      output: function (chunk, meta) { muxer.addAudioChunk(chunk, meta); },
      error: onError
    });
    encoder.configure({
      codec: 'mp4a.40.2', sampleRate: sampleRate,
      numberOfChannels: channels, bitrate: 192000
    });

    var CHUNK = 4800;
    for (var off = 0; off < totalFrames; off += CHUNK) {
      var n = Math.min(CHUNK, totalFrames - off);
      var planar = new Float32Array(n * channels);
      for (var ch = 0; ch < channels; ch++) {
        planar.set(audioBuf.getChannelData(ch).subarray(off, off + n), ch * n);
      }
      encoder.encode(new AudioData({
        format: 'f32-planar', sampleRate: sampleRate,
        numberOfFrames: n, numberOfChannels: channels,
        timestamp: Math.round(off / sampleRate * 1e6), data: planar
      }));
      while (encoder.encodeQueueSize > 8) await sleep(2);
    }
    await encoder.flush();
    encoder.close();
    return { channels: channels, sampleRate: sampleRate };
  }

  /**
   * Master Quality MP4 export.
   * opts: {
   *   video: HTMLVideoElement (a loaded video FILE: needs finite duration),
   *   getFrame: async (tSec) => canvas (deterministic render of that instant),
   *   fps?: 30, bitrate?: 80_000_000, includeAudio?: true,
   *   filename?: 'vfx_syntech_master.mp4',
   *   onProgress?: (done, total, phase) => void
   * }
   * Returns { blob, filename, codec }.
   */
  async function exportMasterQuality(opts) {
    var video = opts.video;
    var fps = opts.fps || 30;
    var bitrate = opts.bitrate || 80000000;
    var onProgress = opts.onProgress || function () {};
    var filename = opts.filename || 'vfx_syntech_master.mp4';

    if (typeof Mp4Muxer === 'undefined') throw new Error('mp4-muxer not loaded');
    if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs is not available in this browser — use REC instead');
    if (!video || !isFinite(video.duration) || video.duration <= 0) {
      throw new Error('Master export needs a loaded video file (not webcam/live)');
    }

    var duration = video.duration;
    var total = Math.max(1, Math.floor(duration * fps));

    // First frame decides output size; H.264 wants even dimensions
    onProgress(0, total, 'probe');
    await seekTo(video, 0);
    var probe = await opts.getFrame(0);
    var W = Math.max(2, probe.width - (probe.width % 2));
    var H = Math.max(2, probe.height - (probe.height % 2));

    var codec = await pickVideoCodec(W, H, fps, bitrate);
    if (!codec) throw new Error('No supported WebCodecs video encoder found');

    // Audio first, so the muxer knows its tracks before finalize. The track
    // is only declared when the AAC encoder is confirmed available: a
    // declared-but-empty audio track produces a malformed MP4.
    var audioInfo = null, audioBuf = null;
    if (opts.includeAudio !== false && typeof AudioEncoder !== 'undefined') {
      try { audioBuf = await decodeSourceAudio(video); } catch (e) { audioBuf = null; }
      if (audioBuf) {
        try {
          var aacSupport = await AudioEncoder.isConfigSupported({
            codec: 'mp4a.40.2', sampleRate: audioBuf.sampleRate,
            numberOfChannels: Math.min(2, audioBuf.numberOfChannels), bitrate: 192000
          });
          if (!aacSupport.supported) audioBuf = null;
        } catch (e) { audioBuf = null; }
      }
    }

    var target = new Mp4Muxer.ArrayBufferTarget();
    var muxer = new Mp4Muxer.Muxer({
      target: target,
      video: { codec: codec.mux, width: W, height: H, frameRate: fps },
      audio: audioBuf
        ? { codec: 'aac', numberOfChannels: Math.min(2, audioBuf.numberOfChannels), sampleRate: audioBuf.sampleRate }
        : undefined,
      fastStart: 'in-memory'
    });

    var encodeError = null;
    var encoder = new VideoEncoder({
      output: function (chunk, meta) { muxer.addVideoChunk(chunk, meta); },
      error: function (e) { encodeError = e; }
    });
    encoder.configure({
      codec: codec.codec, width: W, height: H,
      framerate: fps, bitrate: bitrate, latencyMode: 'quality'
    });

    var exportCv = document.createElement('canvas');
    exportCv.width = W; exportCv.height = H;
    var exportCtx = exportCv.getContext('2d');

    for (var i = 0; i < total; i++) {
      if (encodeError) throw encodeError;
      var t = Math.min(i / fps, duration - 0.001);
      await seekTo(video, t);
      var frameCv = await opts.getFrame(t);
      exportCtx.drawImage(frameCv, 0, 0, W, H);

      var vf = new VideoFrame(exportCv, {
        timestamp: Math.round(i * 1e6 / fps),
        duration: Math.round(1e6 / fps)
      });
      encoder.encode(vf, { keyFrame: i % 120 === 0 });
      vf.close();
      while (encoder.encodeQueueSize > 4) await sleep(2);
      onProgress(i + 1, total, 'video');
    }
    await encoder.flush();
    encoder.close();
    if (encodeError) throw encodeError;

    if (audioBuf) {
      onProgress(total, total, 'audio');
      try {
        audioInfo = await encodeAudio(muxer, audioBuf, duration, function (e) { console.warn('audio encode:', e); });
      } catch (e) {
        console.warn('Audio muxing skipped:', e);
      }
    }

    muxer.finalize();
    var blob = new Blob([target.buffer], { type: 'video/mp4' });
    onProgress(total, total, 'done');

    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 2000);

    return { blob: blob, filename: filename, codec: codec.codec, audio: !!audioInfo };
  }

  /**
   * Mathematically lossless PNG sequence, written straight to a folder the
   * user picks (File System Access API — Chrome/Edge). No memory blowup:
   * each frame streams to disk as it is rendered.
   */
  async function exportPngSequence(opts) {
    var video = opts.video;
    var fps = opts.fps || 30;
    var onProgress = opts.onProgress || function () {};

    if (!window.showDirectoryPicker) throw new Error('PNG sequence needs Chrome/Edge (File System Access API)');
    if (!video || !isFinite(video.duration) || video.duration <= 0) {
      throw new Error('PNG export needs a loaded video file (not webcam/live)');
    }

    var dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    var duration = video.duration;
    var total = Math.max(1, Math.floor(duration * fps));

    for (var i = 0; i < total; i++) {
      await seekTo(video, Math.min(i / fps, duration - 0.001));
      var cv = await opts.getFrame(i / fps);
      var blob = await new Promise(function (res) { cv.toBlob(res, 'image/png'); });
      var name = 'frame_' + String(i + 1).padStart(5, '0') + '.png';
      var fh = await dir.getFileHandle(name, { create: true });
      var w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      onProgress(i + 1, total, 'png');
    }
    onProgress(total, total, 'done');
    return { frames: total };
  }

  window.SyntechExport = {
    isSupported: function () { return typeof VideoEncoder !== 'undefined' && typeof Mp4Muxer !== 'undefined'; },
    exportMasterQuality: exportMasterQuality,
    exportPngSequence: exportPngSequence
  };
})();
