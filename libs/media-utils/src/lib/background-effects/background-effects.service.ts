import { Injectable } from '@angular/core';
import { Results, SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BackgroundEffectsService {
  private readonly canvasElement2 = new OffscreenCanvas(0, 0);
  private readonly canvasCtx2 = this.canvasElement2.getContext('2d');
  private readonly blurIntensitySub = new BehaviorSubject(10);

  private selfieSegmentation: SelfieSegmentation | undefined;
  private timestamp: number | undefined;
  private globalController:
    | TransformStreamDefaultController<VideoFrame>
    | undefined;

  /**
   * Default value is `10px`
   */
  readonly blurIntensity$ = this.blurIntensitySub.asObservable();

  /**
   * Lazy loads the selfie segmentation library.
   * Call this once during initialization.
   * @param  {string} assetsPath eg: `/assets/background-blur`
   * @returns Promise
   */
  init(assetsPath: string): Promise<void> {
    if (!this.selfieSegmentation) {
      this.selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
          return `${assetsPath}/${file}`;
        },
      });
      this.selfieSegmentation.setOptions({
        modelSelection: 1,
        selfieMode: false,
      });
      this.selfieSegmentation.onResults((v) => this.onResults(v));
      return this.selfieSegmentation.initialize();
    }
    return Promise.reject(new Error(`Already initialized`));
  }

  /**
   * Closes the selfie segmentation library.
   * Call this when you are done with the service.
   * @returns Promise
   */
  async destroy(): Promise<void> {
    if (this.selfieSegmentation) {
      await this.selfieSegmentation.close();
      this.selfieSegmentation = undefined;
    }
    return Promise.reject(new Error(`Already destroyed`));
  }

  /**
   * This method is called once when the camera starts.
   * It takes in the raw video track from the camera and sets up an internal listener.
   * For each frame, it calls the selfieSegmentation library to process the frame.
   * It returns a track generator which can be used to create the resultant video stream.
   *
   * It stops when the original raw video track is stopped.
   *
   * `Note` Before sending in a new track, you must stop the existing raw video track.
   * @param {MediaStreamVideoTrack} videoTrack The raw video track from the camera
   * @returns Promise of the processed video-track generator
   * @example
   * ```ts
   * const originalStream = await this.mediaDevices.getUserMedia({ video: true });
   * const [videoTrack] = originalStream.getVideoTracks();
   * const trackGenerator = await this.backgroundEffects.getProcessedTrackGeneratorFrom(videoTrack);
   * const processedStream = new MediaStream([trackGenerator]);
   * ```
   */
  async getProcessedTrackGeneratorFrom(
    videoTrack: MediaStreamVideoTrack
  ): Promise<MediaStreamVideoTrackGenerator> {
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
        await this.selfieSegmentation?.send({
          image: videoFrame as unknown as HTMLImageElement,
        });
        videoFrame.close();
      },
      flush: (controller) => {
        controller.terminate();
        this.selfieSegmentation?.reset();
      },
    });
    trackProcessor.readable
      .pipeThrough(transformer)
      .pipeTo(trackGenerator.writable);
    return trackGenerator;
  }

  /**
   * This is based on the css filter `blur`.
   * The minimum accepted value is 0.
   * You're free to set your own maximum blur limit.
   * @param  {number} value min=`0`
   * @returns void
   */
  setBlurIntensity(value: number): void {
    if (value < 0) throw new Error('Blur intensity cannot be less than 0');
    this.blurIntensitySub.next(value);
  }

  private onResults(results: Results): void {
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

    // subject
    this.canvasCtx2.globalCompositeOperation = 'source-in';
    this.canvasCtx2.drawImage(
      results.image,
      0,
      0,
      this.canvasElement2.width,
      this.canvasElement2.height
    );

    // background
    this.canvasCtx2.globalCompositeOperation = 'destination-atop';
    this.canvasCtx2.filter = `blur(${this.blurIntensitySub.getValue()}px)`;
    this.canvasCtx2.drawImage(
      results.image,
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
}
