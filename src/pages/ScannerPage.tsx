import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TemporaryItemSheet } from '@/components/TemporaryItemSheet';
import { showToast } from '@/components/toast';
import { productRepository } from '@/db/productRepository';
import { createTemporaryProduct } from '@/services/temporaryProductService';
import { useCartStore } from '@/stores/cartStore';
import { text } from '@/theme';

const WANTED_FORMATS = ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e'];

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

type ScannerStatus = 'starting' | 'live' | 'denied' | 'none' | 'error';

export function ScannerPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef<(value: string) => void>(() => {});
  const pausedRef = useRef(false);
  const lastValue = useRef('');
  const lastAt = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<ScannerStatus>('starting');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);

  onCodeRef.current = (value: string) => {
    if (pausedRef.current) return;
    const now = Date.now();
    if (now - lastAt.current < 500 && lastValue.current === value) return;
    lastAt.current = now;
    lastValue.current = value;
    void (async () => {
      const product = await productRepository.findByBarcode(value);
      if (!product) {
        pausedRef.current = true;
        setPendingBarcode(value);
        return;
      }
      useCartStore.getState().addProduct(product);
      navigate('/pos');
    })();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setStatus('none');
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;
    let frame = 0;

    const stopTracks = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const start = async () => {
      setStatus('starting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
          setStatus('denied');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
          setStatus('none');
        } else {
          setStatus('error');
        }
        return;
      }
      if (stopped) {
        stopTracks();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        setStatus('error');
        return;
      }
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchAvailable(Boolean(caps?.torch));
      setStatus('live');

      const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (Detector) {
        let formats = WANTED_FORMATS;
        if (Detector.getSupportedFormats) {
          const supported = await Detector.getSupportedFormats();
          formats = WANTED_FORMATS.filter((format) => supported.includes(format));
        }
        if (formats.length > 0 && !stopped) {
          const detector = new Detector({ formats });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              const raw = codes.find((code) => code.rawValue)?.rawValue;
              if (raw) onCodeRef.current(raw);
            } catch {
              // A frame can fail before the video is ready.
            }
            if (!stopped) frame = window.requestAnimationFrame(() => void tick());
          };
          void tick();
          return;
        }
      }

      try {
        const [{ BrowserMultiFormatReader, BarcodeFormat }, { DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (stopped || !stream) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 });
        controls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) onCodeRef.current(result.getText());
        });
      } catch {
        if (!stopped) setStatus('error');
      }
    };

    void start();
    return () => {
      stopped = true;
      if (frame) window.cancelAnimationFrame(frame);
      controls?.stop();
      stopTracks();
      video.srcObject = null;
    };
  }, [attempt]);

  const toggleTorch = async () => {
    const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch (err) {
      showToast('Torch unavailable', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  return (
    <Screen header={<GlassHeader title="Scan barcode" backTo="/pos" />}>
      {status === 'denied' ? (
        <div className="stack">
          <p style={text.body}>Camera access is required to scan barcodes.</p>
          <Button title="Grant permission" onClick={() => setAttempt((value) => value + 1)} />
          <Button title="Cancel" variant="ghost" onClick={() => navigate('/pos')} />
        </div>
      ) : null}
      {status === 'none' ? (
        <div className="stack">
          <p style={text.body}>No camera device found.</p>
          <Button title="Go back" onClick={() => navigate('/pos')} />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="stack">
          <p style={text.body}>The camera could not be started.</p>
          <Button title="Go back" onClick={() => navigate('/pos')} />
        </div>
      ) : null}
      <div className={`scanner-stage${status === 'live' || status === 'starting' ? '' : ' scanner-hidden'}`}>
        <video ref={videoRef} muted playsInline />
        {status === 'live' ? (
          <div className="scanner-tools">
            <button type="button" className="chip" onClick={() => navigate('/pos')}>
              Close
            </button>
            {torchAvailable ? (
              <button type="button" className="chip" onClick={() => void toggleTorch()}>
                Torch
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {status === 'starting' ? (
        <p className="hint" style={text.caption}>
          Starting camera…
        </p>
      ) : null}
      <TemporaryItemSheet
        open={pendingBarcode != null}
        mode="scanned"
        barcode={pendingBarcode ?? undefined}
        onCancel={() => {
          pausedRef.current = false;
          setPendingBarcode(null);
        }}
        onSubmit={(values) => {
          void (async () => {
            try {
              const product = await createTemporaryProduct({
                name: values.name,
                price: values.price,
                barcode: pendingBarcode,
              });
              useCartStore.getState().addProduct(product);
              navigate('/pos');
            } catch (err) {
              showToast('Could not add item', err instanceof Error ? err.message : 'Please try again.');
            }
          })();
        }}
      />
    </Screen>
  );
}
