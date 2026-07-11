import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EffectMessage,
  EffectTelemetry,
  ParamSchema,
  ShellMessage,
  isEffectMessage,
} from './types';

/**
 * Connects the shell to the effect running inside an iframe: listens for
 * syntech:* messages coming from that specific frame and exposes a typed
 * sender for shell → effect messages.
 */
export function useEffectBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onTelemetry?: (t: EffectTelemetry) => void
) {
  const [isReady, setIsReady] = useState(false);
  const [params, setParams] = useState<ParamSchema[]>([]);
  const [telemetry, setTelemetry] = useState<EffectTelemetry | null>(null);

  // Keep the latest callback without re-subscribing the listener
  const onTelemetryRef = useRef(onTelemetry);
  onTelemetryRef.current = onTelemetry;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;
      if (!isEffectMessage(event.data)) return;

      const msg: EffectMessage = event.data;
      switch (msg.type) {
        case 'syntech:ready':
          setIsReady(true);
          setParams(msg.payload.params);
          break;
        case 'syntech:state':
          setTelemetry(msg.payload);
          onTelemetryRef.current?.(msg.payload);
          break;
        default:
          // 'syntech:param:changed' and 'syntech:export:done' are consumed
          // by the shell starting from Phase 2 (full parameter bridge).
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef]);

  const send = useCallback(
    (message: ShellMessage) => {
      iframeRef.current?.contentWindow?.postMessage(message, '*');
    },
    [iframeRef]
  );

  return { isReady, params, telemetry, send };
}
