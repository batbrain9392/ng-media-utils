import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Results, SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { MEDIA_DEVICES } from '@ng-web-apis/common';
import { BehaviorSubject } from 'rxjs';

enum CameraState {
  Off,
  Loading,
  On,
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly canvasElement2 = new OffscreenCanvas(0, 0);
  private readonly canvasCtx2 = this.canvasElement2.getContext('2d');

  private readonly selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => {
      return `/assets/background-blur/${file}`;
    },
  });

  private globalController:
    | TransformStreamDefaultController<VideoFrame>
    | undefined;

  private timestamp: number | undefined;

  private readonly processedStream = new BehaviorSubject<MediaStream | null>(
    null
  );
  readonly processedStream$ = this.processedStream.asObservable();

  private readonly cameraState = new BehaviorSubject(CameraState.Off);
  readonly cameraState$ = this.cameraState.asObservable().pipe();

  readonly CameraState = CameraState;

  originalStream: MediaStream | undefined;

  constructor(
    @Inject(MEDIA_DEVICES) private readonly mediaDevices: MediaDevices
  ) {}

  async ngOnInit(): Promise<void> {
    this.selfieSegmentation.setOptions({
      modelSelection: 1,
      selfieMode: false,
    });
    this.selfieSegmentation.onResults((v) => this.onResults(v));
    await this.selfieSegmentation.initialize();
  }

  async ngOnDestroy(): Promise<void> {
    this.stopCam();
    await this.selfieSegmentation.close();
    this.processedStream.complete();
    this.cameraState.complete();
  }

  onResults(results: Results) {
    if (!this.canvasCtx2) {
      return;
    }
    this.canvasElement2.width = results.image.width;
    this.canvasElement2.height = results.image.height;
    this.canvasCtx2.save();
    this.canvasCtx2.clearRect(
      0,
      0,
      this.canvasElement2.width,
      this.canvasElement2.height
    );
    this.canvasCtx2.drawImage(
      results.segmentationMask,
      0,
      0,
      this.canvasElement2.width,
      this.canvasElement2.height
    );

    // Only overwrite existing pixels.
    this.canvasCtx2.globalCompositeOperation = 'source-in';
    this.canvasCtx2.drawImage(
      results.image,
      0,
      0,
      this.canvasElement2.width,
      this.canvasElement2.height
    );

    // Only overwrite missing pixels.
    this.canvasCtx2.globalCompositeOperation = 'destination-atop';
    this.canvasCtx2.fillStyle = '#00FF00';
    this.canvasCtx2.fillRect(
      0,
      0,
      this.canvasElement2.width,
      this.canvasElement2.height
    );

    this.canvasCtx2.restore();
    this.globalController?.enqueue(
      new VideoFrame(this.canvasElement2.transferToImageBitmap(), {
        timestamp: this.timestamp,
        alpha: 'discard',
      })
    );
  }

  async startCam() {
    this.cameraState.next(CameraState.Loading);
    this.originalStream = await this.mediaDevices.getUserMedia({
      video: {
        aspectRatio: {
          ideal: 16 / 9,
        },
        height: {
          ideal: 720,
        },
        frameRate: {
          ideal: 15,
        },
      },
      audio: true,
    });
    const [videoTrack] = this.originalStream.getVideoTracks();
    const [audioTrack] = this.originalStream.getAudioTracks();
    const trackProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
    const trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });
    const transformer = new TransformStream<VideoFrame, VideoFrame>({
      transform: async (videoFrame, controller) => {
        // @ts-expect-error Property 'width' does not exist on type 'VideoFrame'
        videoFrame.width = videoFrame.displayWidth;
        // @ts-expect-error Property 'height' does not exist on type 'VideoFrame'
        videoFrame.height = videoFrame.displayHeight;
        this.timestamp = videoFrame.timestamp ?? undefined;
        this.globalController = controller;
        await this.selfieSegmentation.send({
          image: videoFrame as unknown as HTMLImageElement,
        });
        videoFrame.close();
      },
      flush: (controller) => {
        controller.terminate();
        this.selfieSegmentation.reset();
      },
    });
    trackProcessor.readable
      .pipeThrough(transformer)
      .pipeTo(trackGenerator.writable);
    this.processedStream.next(new MediaStream([trackGenerator, audioTrack]));
    this.cameraState.next(CameraState.On);
  }

  stopCam() {
    this.originalStream?.getTracks().forEach((track) => track.stop());
    this.processedStream
      ?.getValue()
      ?.getTracks()
      .forEach((track) => track.readyState === 'live' && track.stop());
    this.processedStream.next(null);
    this.cameraState.next(CameraState.Off);
  }
}
