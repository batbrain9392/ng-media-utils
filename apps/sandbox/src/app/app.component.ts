import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { BackgroundEffectsService } from '@batbrain9392/ng-media-utils';
import { MEDIA_DEVICES } from '@ng-web-apis/common';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../environments/environment';

enum CameraState {
  Off,
  Loading,
  On,
}
const assetsPath = `${
  environment.production ? `/ng-media-utils` : ``
}/assets/background-effects`;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly processedStream = new BehaviorSubject<MediaStream | null>(
    null
  );
  readonly processedStream$ = this.processedStream.asObservable();

  private readonly cameraState = new BehaviorSubject(CameraState.Off);
  readonly cameraState$ = this.cameraState.asObservable().pipe();

  readonly CameraState = CameraState;

  readonly blurIntensity$ = this.backgroundEffects.blurIntensity$;

  originalStream: MediaStream | undefined;

  constructor(
    @Inject(MEDIA_DEVICES) private readonly mediaDevices: MediaDevices,
    private readonly backgroundEffects: BackgroundEffectsService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.backgroundEffects.init(assetsPath);
  }

  async ngOnDestroy(): Promise<void> {
    this.stopCam();
    await this.backgroundEffects.destroy();
    this.processedStream.complete();
    this.cameraState.complete();
  }

  async startCam(): Promise<void> {
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
    const trackGenerator =
      await this.backgroundEffects.getProcessedTrackGeneratorFrom(videoTrack);
    this.processedStream.next(new MediaStream([trackGenerator, audioTrack]));
    this.cameraState.next(CameraState.On);
  }

  stopCam(): void {
    this.originalStream?.getTracks().forEach((track) => track.stop());
    this.processedStream
      ?.getValue()
      ?.getTracks()
      .forEach((track) => track.readyState === 'live' && track.stop());
    this.processedStream.next(null);
    this.cameraState.next(CameraState.Off);
  }

  setBlurIntensity({ target }: Event): void {
    if (target instanceof HTMLInputElement) {
      this.backgroundEffects.setBlurIntensity(target.valueAsNumber);
    }
  }
}
